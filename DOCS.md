# NodeVault — Technical documentation

This document describes architecture, on-disk layout, configuration, CLI behavior, HTTP API, environment variables, and how to develop and test the project. For a short product overview, see [README.md](./README.md).

---

## Table of contents

1. [Architecture](#architecture)
2. [State and file layout](#state-and-file-layout)
3. [Configuration](#configuration)
4. [Environment variables](#environment-variables)
5. [Commands reference](#commands-reference)
6. [HTTP API (daemon)](#http-api-daemon)
7. [Database schema](#database-schema)
8. [Linking semantics](#linking-semantics)
9. [Package managers and edge cases](#package-managers-and-edge-cases)
10. [Development and testing](#development-and-testing)
11. [Troubleshooting](#troubleshooting)

---

## Architecture

```
bin/nodevault.js          Entry (shebang); may launch TUI or CLI
src/cli.js                Commander program and command registration
src/commands/*.js         Command handlers (init, scan, link, …)
src/core/scanner.js       Directory walk, project detection
src/core/indexer.js       node_modules package discovery
src/core/store.js         Content-addressable store paths, add/remove
src/core/linker.js        Hardlink / symlink / copy + atomic phases
src/core/lifecycle.js     active / stale / archived classification
src/core/lock.js          Cooperative filesystem lock for mutating ops
src/db/database.js        SQLite via sql.js; query helpers
src/db/schema.sql         Table definitions
src/daemon/*.js           Daemon spawn, watcher, HTTP server
src/tui/*.js              Ink TUI, dispatch, slash commands
src/config.js             Paths, load/save config
src/output.js             chalk / ora / optional output sink
```

Design rules:

- **`src/core/`** has no CLI dependencies; logic is testable in isolation.
- **Commands** parse flags, call core + DB, render via **`output.js`**.
- Store keys are **`{name}@{version}`** with scoped names escaped (see **`storeKey`** in `src/utils.js`).
- **pnpm** projects that use a **virtual store** (`node_modules/.pnpm`) are detected; linking is skipped for those projects.

---

## State and file layout

Default root: **`~/.nodevault`**. If **`NODEVAULT_HOME`** is set to an absolute path, that directory is used instead.

| Path | Purpose |
|------|---------|
| `config.json` | User settings merged with defaults |
| `vault.db` | SQLite database (sql.js persists a single file) |
| `store/` | Deduplicated package trees (`{name}@{version}/`) |
| `store/.staging/` | Temporary copies before atomic rename into `store/` |
| `operations.lock` | Cooperative lock JSON (`pid`, `timestamp`) |
| `daemon.pid` | Running daemon PID (when started) |
| `daemon.port` | HTTP port chosen for the dashboard API |
| `daemon.log` | Append-only daemon log |

---

## Configuration

Loaded by **`loadConfig()`** in `src/config.js`. Missing keys are filled from defaults.

| Key | Default | Notes |
|-----|---------|--------|
| `storePath` | `<root>/store` | Expanded with `expandPath`; saved with `~` when under home |
| `linkStrategy` | `hardlink` | `hardlink` \| `symlink` \| `copy` |
| `watchDirs` | `[]` | Directories the daemon watches |
| `scanDepth` | `4` | Max depth for `scan` unless overridden |
| `staleThresholdDays` | `30` | Days since activity → `stale` |
| `archiveThresholdDays` | `90` | Days since activity → `archived` |
| `autoLink` | `true` | Daemon behavior hook |
| `autoCleanArchived` | `false` | Policy flag for future / daemon use |
| `notifyBeforeDelete` | `true` | Policy flag |
| `ignoreDirs` | common build/cache dirs | Substrings used when walking |
| `ignoreProjects` | `[]` | Project path exclusions |
| `daemonPort` | `7654` | First port tried for HTTP server; may increment on `EADDRINUSE` |

---

## Environment variables

| Variable | Effect |
|----------|--------|
| **`NODEVAULT_HOME`** | Absolute path replacing `~/.nodevault` for config, DB, store, locks, and daemon files. Used heavily in tests. |
| **`NODEVAULT_PLAIN`** | If set to `1`, empty argv does **not** launch the TUI (classic CLI only). |
| **`CI`** | If `true`, same as plain: no TUI on empty argv. |

---

## Commands reference

### `nodevault init`

Creates directories, writes default config, opens the database (applies schema). Idempotent in the sense that an existing config prints a warning and exits without wiping data.

### `nodevault scan [path]`

- **`path`**: optional; default `.` after `expandPath`.
- **`-d, --depth <n>`**: caps walk depth.

Writes/updates **projects** in the DB and prints summary stats (duplicates %, PM breakdown, optional pnpm virtual-store warning).

### `nodevault link [project]`

- **Positional `project`**: one tracked project path.
- **`-a, --all`**: all projects in DB.
- **`-s, --strategy <type>`**: `hardlink` \| `symlink` \| `copy`.

Acquires **`operations.lock`**, ensures store exists, skips already-linked projects, skips pnpm virtual-store projects, runs **`indexProject`**, **`addToStore`**, **`linkPackageToProject`**, updates **`project_packages`** and linked flags.

There is no separate multi-path flag in Commander; the TUI can call **`linkCommand(undefined, { paths: [...] })`** with multiple paths.

### `nodevault clean`

Selects stale and/or archived projects (or interactive list), re-runs **`classifyProject`** to avoid deleting recently active trees, then removes **`node_modules`** and clears linked metadata.

- **`--stale`**, **`--archived`**, **`-a, --all`** (stale + archived), **`-f, --force`** (skip prompts).

### `nodevault prune`

Finds packages in DB with no **`project_packages`** row, optionally prompts, acquires lock, **`removeFromStore`** + **`deletePackage`**.

- **`-f, --force`**: skip confirmation.

### `nodevault status`

- **`--json`**: prints a single JSON object (store path, sizes, project counts, saved bytes).
- **`-v, --verbose`**: prints configuration block after summary.

### `nodevault list`

- **`-s, --sort`**: `name` \| `size` \| `accessed` \| `status`.
- **`-f, --filter`**: `active` \| `stale` \| `archived` \| `npm` \| `yarn` \| `pnpm` \| `linked` \| `unlinked`.

### `nodevault unlink <project>`

Resolves project in DB; if linked, acquires lock, **`indexProject`**, restores each package from store paths via **`unlinkPackageFromProject`**, then clears linked fields in DB.

### `nodevault daemon <start|stop|status|logs>`

- **start**: spawns detached **`daemon-entry.js`**.
- **stop**: kills PID from **`daemon.pid`** (best effort).
- **status**: reports running PID if **`daemon.pid`** is valid.
- **logs**: prints last lines of **`daemon.log`**.

### `nodevault watch [path]`

Foreground **`chokidar`** watcher; Ctrl+C exits. Initializes DB and store.

### `nodevault tui`

Same as invoking **`nodevault`** with no arguments (unless plain/CI mode).

---

## HTTP API (daemon)

The daemon creates an HTTP server on **`127.0.0.1`**, port from config (with retries on **`EADDRINUSE`**). CORS is open for local dashboard use.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | `{ ok: true, uptime: number }` |
| GET | `/api/status` | Store size, package count, project aggregates (mirrors CLI status data) |
| GET | `/api/projects` | Tracked projects list |
| GET | `/` | Serves `dashboard/index.html` if present |
| OPTIONS | `*` | `204` for CORS preflight |

Static dashboard path: **`dashboard/index.html`** (resolved relative to package root).

---

## Database schema

Defined in **`src/db/schema.sql`**:

- **`projects`** — path (unique), name, package_manager, status, linked, link_strategy, sizes, timestamps.
- **`packages`** — composite primary key `(name, version)`, store_path, size_bytes, …
- **`project_packages`** — links project id to package name/version; FKs to projects and packages.

The runtime uses **sql.js**: the DB is loaded into memory, mutated, and **exported** back to **`vault.db`** after writes (fine for metadata-sized files).

---

## Linking semantics

- **Hardlink** (default): same inode as store; fastest; requires same filesystem as project.
- **Cross-filesystem** or **Windows + hardlink strategy**: **`determineLinkStrategy`** may choose **copy**.
- **Native packages** (trees containing **`.node`** files) are **not** linked from the indexer’s linkable set.
- Linker uses a **three-phase** pattern: move original aside → populate from store → remove temp; failure attempts rollback.

---

## Package managers and edge cases

- **npm / yarn / pnpm** detected via lockfiles / layout.
- **pnpm virtual store** (`node_modules/.pnpm`): project is still scanned; **link** skips with a warning.
- **Stale / archived** classification uses **`package.json`** mtime, optional **`src/`** mtimes, and **`last_scanned_at`** from DB.

---

## Development and testing

```bash
nvm use                    # if you use nvm; see .nvmrc (Node 20+)
npm install
npm test                   # node --test test/*.test.js
node bin/nodevault.js --help
```

**Isolated integration tests** set **`NODEVAULT_HOME`** to a temporary directory so your real **`~/.nodevault`** is never touched. See **`test/commands.integration.test.js`**.

**Lock tests** use either raw filesystem helpers or **`acquireLock`** with **`NODEVAULT_HOME`**.

---

## Troubleshooting

| Symptom | Suggestion |
|---------|------------|
| **“Another nodevault operation is running”** | Another CLI holds **`operations.lock`**, or a stale lock: wait, or delete **`operations.lock`** under your vault root if no process is running. |
| **Link skips pnpm project** | Virtual store layout is unsupported; use non-virtual layout or skip linking for that repo. |
| **TUI opens when you want CLI** | **`export NODEVAULT_PLAIN=1`** or pass an explicit subcommand (e.g. **`nodevault status`**). |
| **Wrong vault directory in tests** | Ensure **`NODEVAULT_HOME`** is set **before** importing modules that cache state, and call **`closeDb()`** between isolated runs if reusing the same process. |
| **Dashboard 404** | Ensure **`dashboard/index.html`** exists; otherwise `/` returns “Dashboard not found”. |

---

## License

MIT (same as the project).
