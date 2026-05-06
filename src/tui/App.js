import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import { configExists, paths } from '../config.js';
import { getStats } from '../db/database.js';
import { formatBytes, shortenPath, truncateLine } from '../utils.js';

import { NODE_BRAND_GREEN } from '../output.js';
import { setTerminalTitle } from './terminalTitle.js';
import { filterSlashCommands } from './slashCommands.js';
import { runSessionCommand } from './sessionRunner.js';

const MAX_SESSION_LINES = 100;
/** Lines reserved for header + footer chrome (borders, prompt, help). */
const SCROLL_CHROME_LINES = 12;

/**
 * When following new session output (stick-to-bottom), reveal the log gradually instead of
 * jumping — similar to Claude Code’s transcript behavior so users can read completed steps.
 */
const AUTO_SCROLL_MS = 72;

const e = React.createElement;

/** Open in-TUI flows instead of exiting to CLI */
const WIZARD_COMMANDS = new Set(['scan-dir', 'link-paste']);

export default function NodeVaultApp() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [line, setLine] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [wizard, setWizard] = useState(null);
  const [wizardBuffer, setWizardBuffer] = useState('');
  const [sessionLog, setSessionLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [paletteScrollTop, setPaletteScrollTop] = useState(0);
  const stickToBottomRef = useRef(true);
  const scrollLineCountRef = useRef(0);
  const contentViewportLinesRef = useRef(0);
  const [termSize, setTermSize] = useState(() => ({
    cols: stdout?.columns ?? process.stdout.columns ?? 80,
    rows: stdout?.rows ?? process.stdout.rows ?? 24,
  }));

  const suggestions = useMemo(() => filterSlashCommands(line), [line]);
  const inPalette = line.startsWith('/') && line.indexOf(' ', 1) === -1;

  // Debounced resize handler to prevent jitter during window resizing
  useEffect(() => {
    let timer;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setTermSize({
          cols: process.stdout.columns ?? 80,
          rows: process.stdout.rows ?? 24,
        });
      }, 100);
    };
    process.stdout.on('resize', onResize);
    return () => {
      clearTimeout(timer);
      process.stdout.off('resize', onResize);
    };
  }, []);

  useEffect(() => {
    if (selectedIdx >= suggestions.length) {
      setSelectedIdx(0);
    }
  }, [suggestions.length, selectedIdx]);

  const paletteMaxRows = Math.max(4, Math.min(14, Math.max(4, termSize.rows - 11)));
  const paletteVisibleCount =
    suggestions.length === 0 ? 0 : Math.min(suggestions.length, paletteMaxRows);

  useEffect(() => {
    if (!inPalette || suggestions.length === 0) {
      setPaletteScrollTop(0);
      return;
    }
    setPaletteScrollTop((t) => {
      const maxTop = Math.max(0, suggestions.length - paletteVisibleCount);
      let next = t;
      if (selectedIdx < next) next = selectedIdx;
      else if (selectedIdx >= next + paletteVisibleCount) next = selectedIdx - paletteVisibleCount + 1;
      if (next < 0) next = 0;
      if (next > maxTop) next = maxTop;
      return next;
    });
  }, [inPalette, suggestions.length, selectedIdx, paletteVisibleCount]);

  useEffect(() => {
    setTerminalTitle('nodevault');
    return () => {
      setTerminalTitle('nodevault');
    };
  }, []);


  useEffect(() => {
    if (configExists()) {
      try {
        setStats(getStats());
        setStatsError(null);
      } catch (e) {
        setStats(null);
        setStatsError(e instanceof Error ? e.message : String(e));
      }
    }
    setInitialized(true);
  }, []);

  const refreshStats = useCallback(() => {
    if (configExists()) {
      try {
        setStats(getStats());
        setStatsError(null);
      } catch (e) {
        setStats(null);
        setStatsError(e instanceof Error ? e.message : String(e));
      }
    }
  }, []);

  const contentCols = Math.max(20, termSize.cols - 4);

  const scrollItems = useMemo(() => {
    /** @type {{ text: string; dim?: boolean; bold?: boolean; color?: string }[]} */
    const items = [];

    if (!initialized) {
      items.push({ text: 'Loading…', dim: true });
      return items;
    }

    if (sessionLog.length > 0 || busy) {
      items.push({ text: 'Session output', dim: true });
      for (const ln of sessionLog) {
        items.push({ text: ln || ' ' });
      }
      if (busy) {
        items.push({ text: 'Running…', dim: true });
      }
      items.push({ text: '' });
    }

    if (wizard === 'scan-dir') {
      items.push({ text: 'Scan a folder', bold: true });
      items.push({
        text: 'Paste or type a directory; projects are discovered under it (see scan depth in config).',
        dim: true,
      });
      items.push({ text: `Shell cwd: ${shortenPath(process.cwd())}`, dim: true });
      items.push({ text: '' });
      items.push(
        wizardBuffer
          ? { text: wizardBuffer, color: NODE_BRAND_GREEN }
          : { text: '…waiting for path', dim: true },
      );
      return items;
    }

    if (wizard === 'link-paste') {
      items.push({ text: 'Link selected projects', bold: true });
      items.push({
        text: 'Only paths already in the vault DB are linked (scan those trees first).',
        dim: true,
      });
      if (wizardBuffer.length === 0) {
        items.push({
          text: '(Paste one path per line — must match a scanned project root)',
          dim: true,
        });
      } else {
        for (const ln of wizardBuffer.split('\n')) {
          items.push({ text: ln || ' ' });
        }
      }
      items.push({
        text: `${wizardBuffer.split('\n').filter((l) => l.trim()).length} path line(s)`,
        dim: true,
      });
      return items;
    }

    if (!configExists()) {
      items.push({ text: 'Not initialized yet.' });
      items.push({ text: 'Type /init or run: nodevault init', dim: true });
      return items;
    }

    if (!stats) {
      items.push({ text: 'Could not read vault stats.', color: 'yellow' });
      if (statsError) {
        const errMsg = statsError;
        // Word-wrap long error messages to fit terminal width
        const indent = '  ';
        const maxLen = contentCols - indent.length;
        if (maxLen > 10 && errMsg.length > maxLen) {
          const words = errMsg.split(/(\s+)/);
          let cur = '';
          for (const word of words) {
            if (cur.length + word.length > maxLen && cur.length > 0) {
              items.push({ text: `${indent}${cur}`, dim: true });
              cur = word.trimStart();
            } else {
              cur += word;
            }
          }
          if (cur.length > 0) items.push({ text: `${indent}${cur}`, dim: true });
        } else {
          items.push({ text: `${indent}${errMsg}`, dim: true });
        }
        // Hint for native module errors
        if (errMsg.includes('MODULE_NOT_FOUND') || errMsg.includes('Cannot find package')) {
          items.push({ text: '  Try: npm install (from the NodeVault project directory)', dim: true });
        }
      }
      return items;
    }

    items.push({ text: 'Overview', dim: true });
    items.push({ text: ` Cwd    ${shortenPath(process.cwd())}` });
    items.push({ text: ` Store  ${shortenPath(paths.storePath)}` });
    items.push({
      text: ` Size   ${formatBytes(stats.storeSizeBytes)} · packages ${stats.packageCount}`,
    });
    items.push({
      text: ` Projects  ${stats.projectCount}  ·  linked ${stats.linkedCount}`,
    });
    items.push({ text: ` Saved  ${formatBytes(stats.savedBytes)}` });
    return items;
  }, [initialized, sessionLog, busy, wizard, wizardBuffer, stats, statsError]);

  const contentViewportLines = Math.max(4, termSize.rows - SCROLL_CHROME_LINES);
  const scrollLineCount = scrollItems.length;
  const scrollActive = scrollLineCount > contentViewportLines;

  scrollLineCountRef.current = scrollLineCount;
  contentViewportLinesRef.current = contentViewportLines;

  // Auto-scroll only runs when there's actual new content to scroll to.
  // Stops itself once caught up to avoid idle re-renders (jitter fix).
  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const target = Math.max(0, scrollLineCount - contentViewportLines);
    // Nothing to scroll — skip the interval entirely
    if (target <= 0) return;
    const id = setInterval(() => {
      if (!stickToBottomRef.current) {
        clearInterval(id);
        return;
      }
      const curTarget = Math.max(
        0,
        scrollLineCountRef.current - contentViewportLinesRef.current,
      );
      setScrollOffset((o) => {
        if (!stickToBottomRef.current) return o;
        if (o >= curTarget) {
          clearInterval(id);
          return o;
        }
        const gap = curTarget - o;
        const step = gap > 32 ? 3 : gap > 12 ? 2 : 1;
        return Math.min(o + step, curTarget);
      });
    }, AUTO_SCROLL_MS);
    return () => clearInterval(id);
  }, [scrollLineCount, contentViewportLines, sessionLog.length, busy]);

  const runSession = useCallback(
    async (name, args) => {
      stickToBottomRef.current = true;
      setBusy(true);
      const preview =
        args && args.length > 48 ? `${args.slice(0, 48).replace(/\n/g, ' ')}…` : (args || '');
      setSessionLog((prev) =>
        [...prev, `── ▸ /${name}${preview ? ` ${preview}` : ''}`].slice(-MAX_SESSION_LINES),
      );
      try {
        await runSessionCommand(
          name,
          args ?? '',
          (line) => {
            setSessionLog((prev) => [...prev, line].slice(-MAX_SESSION_LINES));
          },
          (info) => {
            setProgress(info);
          },
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setSessionLog((prev) => [...prev, `Error: ${msg}`].slice(-MAX_SESSION_LINES));
      } finally {
        setBusy(false);
        setProgress(null);
        refreshStats();
      }
    },
    [refreshStats],
  );

  const tryScroll = useCallback(
    (key) => {
      if (inPalette && suggestions.length > 0 && (key.pageUp || key.pageDown)) {
        return false;
      }
      if (!scrollActive) return false;
      const maxScroll = Math.max(0, scrollLineCount - contentViewportLines);

      if (key.pageUp) {
        stickToBottomRef.current = false;
        setScrollOffset((o) => Math.max(0, o - Math.max(1, contentViewportLines - 1)));
        return true;
      }
      if (key.pageDown) {
        setScrollOffset((o) => {
          const next = Math.min(maxScroll, o + Math.max(1, contentViewportLines - 1));
          stickToBottomRef.current = next >= maxScroll;
          return next;
        });
        return true;
      }
      if (key.upArrow && !(inPalette && suggestions.length > 0)) {
        stickToBottomRef.current = false;
        setScrollOffset((o) => Math.max(0, o - 1));
        return true;
      }
      if (key.downArrow && !(inPalette && suggestions.length > 0)) {
        setScrollOffset((o) => {
          const next = Math.min(maxScroll, o + 1);
          stickToBottomRef.current = next >= maxScroll;
          return next;
        });
        return true;
      }
      if (key.home) {
        stickToBottomRef.current = false;
        setScrollOffset(0);
        return true;
      }
      if (key.end) {
        stickToBottomRef.current = true;
        setScrollOffset(maxScroll);
        return true;
      }
      return false;
    },
    [scrollActive, scrollLineCount, contentViewportLines, inPalette, suggestions.length],
  );

  const palettePageStep = Math.max(1, paletteVisibleCount - 1);

  const openWizard = (name) => {
    if (WIZARD_COMMANDS.has(name)) {
      setWizard(name);
      setWizardBuffer('');
      setLine('');
      setSelectedIdx(0);
      return true;
    }
    return false;
  };

  const applySuggestion = (cmd) => {
    setLine(`/${cmd} `);
    setSelectedIdx(0);
  };

  const submitLine = () => {
    if (busy) return;
    const trimmed = line.trim();
    if (!trimmed) return;

    if (trimmed === 'q' || trimmed === ':q' || trimmed === 'exit') {
      exit();
      return;
    }

    if (trimmed.startsWith('/')) {
      const m = trimmed.match(/^\/([\w-]+)(?:\s+(.*))?$/s);
      if (m) {
        const cmd = m[1];
        const rest = (m[2] ?? '').trim();
        if (cmd === 'scan-dir' && rest) {
          void runSession('scan', rest);
          setLine('');
          return;
        }
        if (openWizard(cmd)) return;
        void runSession(cmd, rest);
        setLine('');
      }
    }
  };

  const inWizard = wizard !== null;

  useInput(
    (input, key) => {
      if (key.ctrl && input === 'c') {
        exit();
        return;
      }

      if (tryScroll(key)) {
        return;
      }

      if (busy) {
        return;
      }

      if (inPalette && suggestions.length > 0) {
        if (key.pageUp) {
          setSelectedIdx((i) => Math.max(0, i - palettePageStep));
          return;
        }
        if (key.pageDown) {
          setSelectedIdx((i) => Math.min(suggestions.length - 1, i + palettePageStep));
          return;
        }
        if (key.upArrow) {
          setSelectedIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
          return;
        }
        if (key.downArrow) {
          setSelectedIdx((i) => (i >= suggestions.length - 1 ? 0 : i + 1));
          return;
        }
        if (key.tab && suggestions[selectedIdx]) {
          applySuggestion(suggestions[selectedIdx].name);
          return;
        }
      }

      if (key.return) {
        if (inPalette && suggestions.length > 0 && suggestions[selectedIdx]) {
          const cmd = suggestions[selectedIdx].name;
          if (openWizard(cmd)) return;
          void runSession(cmd, '');
          setLine('');
          return;
        }
        submitLine();
        return;
      }

      if (key.escape) {
        if (line.length > 0) {
          setLine('');
          setSelectedIdx(0);
        } else {
          exit();
        }
        return;
      }

      if (key.backspace || key.delete) {
        setLine((s) => s.slice(0, -1));
        return;
      }

      if (input && !key.ctrl && !key.meta) {
        setLine((s) => s + input);
      }
    },
    { isActive: !inWizard },
  );

  useInput(
    (input, key) => {
      if (key.ctrl && input === 'c') {
        exit();
        return;
      }

      if (tryScroll(key)) {
        return;
      }

      if (busy) {
        return;
      }

      if (key.escape) {
        setWizard(null);
        setWizardBuffer('');
        return;
      }

      if (wizard === 'scan-dir') {
        if (key.return) {
          const p = wizardBuffer.trim();
          if (p) {
            void runSession('scan', p).then(() => setWizard(null));
          }
          return;
        }
        if (key.backspace || key.delete) {
          setWizardBuffer((s) => s.slice(0, -1));
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          setWizardBuffer((s) => s + input);
        }
        return;
      }

      if (wizard === 'link-paste') {
        if (key.ctrl && input === 's') {
          const paths = wizardBuffer
            .split(/\n/)
            .map((s) => s.trim())
            .filter(Boolean);
          if (paths.length > 0) {
            void runSession('link-paths', wizardBuffer).then(() => setWizard(null));
          }
          return;
        }
        if (key.return) {
          setWizardBuffer((s) => s + '\n');
          return;
        }
        if (key.backspace || key.delete) {
          setWizardBuffer((s) => s.slice(0, -1));
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          setWizardBuffer((s) => s + input);
        }
      }
    },
    { isActive: inWizard },
  );

  const header = e(
    Box,
    { flexDirection: 'column', marginBottom: 1 },
    e(Text, { bold: true, color: NODE_BRAND_GREEN }, 'NodeVault'),
    e(Text, { dimColor: true }, 'Interactive · alternate screen'),
  );

  const visibleScroll = scrollItems.slice(scrollOffset, scrollOffset + contentViewportLines);

  const scrollStatus =
    scrollActive
      ? e(
          Text,
          { dimColor: true },
          `Lines ${scrollOffset + 1}-${Math.min(scrollOffset + visibleScroll.length, scrollLineCount)} of ${scrollLineCount} · PgUp/PgDn · ↑↓ · Home/End`,
        )
      : null;

  const mainColumn = e(
    Box,
    {
      flexDirection: 'column',
      flexGrow: 1,
      paddingX: 1,
      paddingY: 0,
      overflow: 'hidden',
      minHeight: contentViewportLines,
    },
    e(
      Box,
      {
        flexDirection: 'column',
        overflow: 'hidden',
        height: contentViewportLines,
        width: '100%',
      },
      ...visibleScroll.map((item, i) => {
        const txt = truncateLine(item.text, contentCols);
        // Color bullet points (⏺, ✓, ✗, ⚠) Node Green when they lead a line
        const bulletMatch = txt.match(/^(\s*)([\u23FA\u2713\u2717\u26A0\u2022\u25CF])\s/);
        if (bulletMatch && !item.dim && !item.color) {
          const [full, space, bullet] = bulletMatch;
          const rest = txt.slice(full.length);
          return e(
            Text,
            { key: `row-${scrollOffset + i}`, wrap: 'truncate-end' },
            space,
            e(Text, { color: NODE_BRAND_GREEN }, bullet),
            ' ',
            rest,
          );
        }
        return e(
          Text,
          {
            key: `row-${scrollOffset + i}`,
            dimColor: item.dim,
            bold: item.bold,
            color: item.color,
            wrap: 'truncate-end',
          },
          txt,
        );
      }),
    ),
  );

  const showPalette = inPalette && suggestions.length > 0 && !inWizard;

  const paletteWindow =
    showPalette && paletteVisibleCount > 0
      ? suggestions.slice(paletteScrollTop, paletteScrollTop + paletteVisibleCount)
      : [];

  const paletteTitle =
    showPalette && suggestions.length > paletteVisibleCount
      ? `Commands ${paletteScrollTop + 1}-${paletteScrollTop + paletteWindow.length} of ${suggestions.length} (↑↓ scroll)`
      : showPalette
        ? `Commands (${suggestions.length})`
        : '';

  const palette = showPalette
    ? e(
        Box,
        {
          flexDirection: 'column',
          marginBottom: 1,
          paddingLeft: 1,
          borderStyle: 'round',
          borderColor: 'gray',
          width: '100%',
        },
        e(Text, { dimColor: true }, paletteTitle),
        ...paletteWindow.map((s, i) => {
          const globalIdx = paletteScrollTop + i;
          return e(
            Box,
            { key: s.name, flexDirection: 'row' },
            e(
              Text,
              {
                color: globalIdx === selectedIdx ? NODE_BRAND_GREEN : undefined,
                bold: globalIdx === selectedIdx,
              },
              `${globalIdx === selectedIdx ? ' \u203a ' : '   '}+ ${s.name} `,
            ),
            e(Text, { dimColor: true, wrap: 'truncate-end' }, s.description),
          );
        }),
      )
    : null;

  const promptLine = inWizard
    ? wizard === 'scan-dir'
      ? e(
          Box,
          { flexDirection: 'column' },
          e(Text, { dimColor: true }, 'Enter run scan · Esc cancel'),
          e(Text, null, `❯ ${truncateLine(wizardBuffer, contentCols)}`),
        )
      : e(
          Box,
          { flexDirection: 'column' },
          e(Text, { dimColor: true }, 'Ctrl+S link listed paths · Enter new line · Esc cancel'),
          e(
            Text,
            { dimColor: true },
            `${wizardBuffer.split('\n').filter((l) => l.trim()).length} path line(s)`,
          ),
        )
    : e(Text, null, `❯ ${truncateLine(line, contentCols)}`);

  const footerHelp = inWizard
    ? null
    : e(
        Text,
        { dimColor: true },
        '/ + filter · \u2191\u2193 · Tab · PgUp/PgDn · Esc clear or quit · Ctrl+C quit',
      );

  const wizardScrollNote =
    inWizard && scrollActive
      ? e(Text, { dimColor: true }, 'Long output — PgUp/PgDn · Home/End to scroll')
      : null;

  // Progress bar for long-running tasks (shown above the prompt)
  const progressBar = progress
    ? (() => {
        const { message, current, total } = progress;
        const pct = total > 0 ? current / total : 0;
        const barWidth = Math.max(10, contentCols - message.length - 14);
        const filled = Math.round(barWidth * pct);
        const empty = barWidth - filled;
        const bar = '█'.repeat(filled) + '░'.repeat(empty);
        const label = `${message} ${current}/${total}`;
        return e(
          Box,
          { flexDirection: 'row', marginBottom: 0 },
          e(Text, { color: NODE_BRAND_GREEN }, label + ' '),
          e(Text, { color: NODE_BRAND_GREEN }, bar),
        );
      })()
    : null;

  return e(
    Box,
    {
      flexDirection: 'column',
      height: '100%',
      width: '100%',
    },
    e(Box, { flexDirection: 'column', paddingX: 1, paddingTop: 1 }, header),
    mainColumn,
    e(
      Box,
      {
        flexDirection: 'column',
        flexShrink: 0,
        borderTop: true,
        borderStyle: 'single',
        borderColor: '#333333',
        paddingX: 1,
        paddingTop: 1,
      },
      progressBar,
      scrollStatus,
      palette,
      promptLine,
      footerHelp,
      wizardScrollNote,
    ),
  );
}
