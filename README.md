# NodeVault

**Stop downloading `node_modules` 30 times. Install once, share everywhere.**

AI coding tools make spinning up projects effortless. But every project downloads its own `node_modules`, and suddenly 10GB+ of duplicate packages are eating your disk. NodeVault fixes this.

NodeVault is a CLI tool that sits *above* your package manager — npm, yarn, or pnpm — scanning your workspace, deduplicating shared packages into a central store via hardlinks (or symlinks / copy when needed), and managing the lifecycle of projects so stale builds do not pile up forever.

**Full documentation:** see [DOCS.md](./DOCS.md) (architecture, HTTP API, environment variables, development).

---

## The Problem

```
~/Projects/
├── ai-chatbot/node_modules/        →  287 MB
├── saas-dashboard/node_modules/     →  341 MB
├── invoice-app/node_modules/        →  198 MB
├── landing-page/node_modules/       →  156 MB
├── webhook-handler/node_modules/    →  203 MB
├── auth-service/node_modules/       →  178 MB
├── pdf-generator/node_modules/      →  224 MB
├── form-builder/node_modules/       →  195 MB
├── crm-prototype/node_modules/      →  312 MB
└── abandoned-idea/node_modules/     →  267 MB

Total: 2.36 GB — but 60%+ is the same packages copied over and over.
```

You built many of these in a short time with AI-assisted coding. Half of them share React, TypeScript, Tailwind, and dozens of other dependencies. Some you have not touched in days. One was a quick experiment. They are all still eating your disk.

## The Solution

```bash
$ nodevault scan ~/Projects
Found 10 projects (3 npm, 5 yarn, 2 pnpm)
Total node_modules: 2.36 GB
Duplicate packages: 1.41 GB (60%)

$ nodevault link --all
Linked 10 projects to central store
Deduplicated 847 packages via hardlinks
Disk recovered: 1.41 GB ✓

$ nodevault status
Store: ~/.nodevault/store (943 MB)
Projects tracked: 10
Active: 6 | Stale: 3 | Archived: 1
```

## Why Not Just Use pnpm?

pnpm’s content-addressable store is excellent — if you chose pnpm from the start. But:

- **AI tools do not standardize on one package manager.** New repos may use npm, yarn, or pnpm side by side.
- **pnpm does not manage project lifecycle** the way NodeVault does (stale / archived signals, cleanup workflows).
- **NodeVault works across managers** you already have and can deduplicate existing trees without migrating every repo.

NodeVault sits above the package manager layer: scan, link, prune, and clean across your machine.

---

## Installation

From a clone of this repository:

```bash
cd NodeVault
npm install
npm link                    # optional: install `nodevault` on your PATH
# or run without linking:
node bin/nodevault.js --help
```

If the package is published to npm:

```bash
npm install -g nodevault
```

**Requirements:** Node.js **≥ 20**.

---

## Quick Start

```bash
nodevault init
nodevault scan ~/Projects
nodevault link --all
nodevault status
```

Optional background daemon (watches configured dirs and serves a small local dashboard API):

```bash
nodevault daemon start
```

---

## Interactive mode (TUI)

Run **`nodevault`** with **no arguments** to open the fullscreen interactive session (Ink + React).

- **`nodevault tui`** does the same explicitly.
- Set **`NODEVAULT_PLAIN=1`** or **`CI=true`** to force the classic CLI only (no TUI on empty argv).

---

## Commands (overview)

| Command | Purpose |
|--------|---------|
| `init` | Create `~/.nodevault` store, config, and SQLite DB |
| `scan [path]` | Discover projects with `node_modules` (`--depth`) |
| `link [project]` | Link deps to store (`--all`, `--strategy`) |
| `clean` | Remove `node_modules` from stale / archived projects |
| `prune` | Remove unreferenced packages from the store |
| `status` | Store and project overview (`--json`, `--verbose`) |
| `list` | Table of tracked projects (`--sort`, `--filter`) |
| `unlink <project>` | Restore a project’s independent `node_modules` from the store layout |
| `daemon <action>` | `start` \| `stop` \| `status` \| `logs` |
| `watch [path]` | Watch a directory for new projects (foreground) |

Detailed flags, JSON shapes, and HTTP endpoints are in **[DOCS.md](./DOCS.md)**.

### `nodevault init`

Creates `~/.nodevault/store`, staging dir, `config.json`, and `vault.db`. Safe to run once; a second run prints that NodeVault is already initialized.

### `nodevault scan [path]`

Defaults to the current directory. Respects **`scanDepth`** from config unless you pass **`--depth`**.

### `nodevault link [project]`

- Single project: `nodevault link /path/to/project`
- All tracked: `nodevault link --all`
- Strategy: `--strategy hardlink|symlink|copy` (default from config; copy used when hardlinks are not possible, e.g. cross-filesystem or Windows)

### `nodevault clean`

Removes **`node_modules`** from **stale** and/or **archived** projects (after re-checking lifecycle so recently active trees are not deleted).

```bash
nodevault clean                    # interactive: pick from eligible projects
nodevault clean --stale            # only stale
nodevault clean --archived         # only archived
nodevault clean --all             # stale + archived
nodevault clean --all --force      # no confirmation
```

### `nodevault prune`

Drops store directories that are no longer referenced by any tracked project. Use **`--force`** to skip the confirmation prompt.

### `nodevault status` / `list`

- **`status --json`**: machine-readable summary (store path, sizes, project counts).
- **`status --verbose`**: adds configuration (link strategy, thresholds, watch dirs).
- **`list`**: `--sort name|size|accessed|status`, `--filter active|stale|archived|npm|yarn|pnpm|linked|unlinked`.

### `nodevault daemon` / `watch`

- **Daemon**: detached process; see config **`watchDirs`** and **`daemonPort`** in [DOCS.md](./DOCS.md).
- **Watch**: foreground watcher for a single path; Ctrl+C to stop.

---

## Configuration

File: **`~/.nodevault/config.json`** (or under **`NODEVAULT_HOME`** if set). Example:

```json
{
  "storePath": "~/.nodevault/store",
  "linkStrategy": "hardlink",
  "watchDirs": ["~/Projects"],
  "scanDepth": 4,
  "staleThresholdDays": 30,
  "archiveThresholdDays": 90,
  "autoLink": true,
  "autoCleanArchived": false,
  "notifyBeforeDelete": true,
  "ignoreDirs": ["node_modules/.cache", ".next", "dist", ".git"],
  "ignoreProjects": [],
  "daemonPort": 7654
}
```

---

## How It Works (short)

1. **Scan** — Walk directories, detect package manager, classify active / stale / archived from filesystem signals.
2. **Index** — Read `node_modules` layouts; skip native/binary packages for linking.
3. **Link** — Populate `~/.nodevault/store` and replace project copies with hardlinks (or symlink/copy per strategy).
4. **Track** — Persist projects and package relationships in **SQLite** (via **sql.js**, no native addon rebuilds per Node version).
5. **Maintain** — Optional daemon + **`watch`**; **`prune`** and **`clean`** reclaim disk.

```
BEFORE:  project-a/react  project-b/react  project-c/react  (3× size)
AFTER:   ~/.nodevault/store/react  ← hardlinks from each project  (1× payload)
```

---

## Tech stack

- **Node.js** (≥ 20) — runtime and `node --test`
- **Commander** — CLI
- **sql.js** (SQLite in WebAssembly) — local vault database (portable across Node versions)
- **chokidar** — filesystem watching
- **chalk**, **ora** — terminal output
- **Ink**, **React** — fullscreen TUI
- **fs**, hardlink / rename / copy — linking strategies

---

## Roadmap

Shipped in this repo: core CLI, store + hardlinking, npm/yarn/pnpm detection, daemon + HTTP API, `unlink`, `prune`, TUI, isolated tests via `NODEVAULT_HOME`.

Ideas ahead: published npm package polish, richer web dashboard, CI recipes for monorepos, workspace profiles.

---

## Built for

Developers using AI-assisted coding who create many Node projects and want one place to deduplicate `node_modules` and tame disk growth.

## License

MIT
