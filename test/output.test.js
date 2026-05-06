import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  stripAnsi,
  setOutputSink,
  clearOutputSink,
  setProgressSink,
  clearProgressSink,
  emitProgress,
  success,
  warn,
  error,
  info,
  heading,
  dim,
  statusBadge,
  sizeBadge,
} from '../src/output.js';

describe('stripAnsi', () => {
  it('removes ANSI escape codes', () => {
    const colored = '\u001b[32mhello\u001b[0m';
    assert.equal(stripAnsi(colored), 'hello');
  });

  it('returns plain strings unchanged', () => {
    assert.equal(stripAnsi('hello'), 'hello');
  });

  it('handles empty string', () => {
    assert.equal(stripAnsi(''), '');
  });
});

describe('output sink', () => {
  afterEach(() => {
    clearOutputSink();
  });

  it('captures output when sink is set', () => {
    const lines = [];
    setOutputSink((line) => lines.push(line));

    success('test success');
    assert.ok(lines.some(l => l.includes('test success')));
  });

  it('captures warnings', () => {
    const lines = [];
    setOutputSink((line) => lines.push(line));

    warn('test warning');
    assert.ok(lines.some(l => l.includes('test warning')));
  });

  it('captures errors', () => {
    const lines = [];
    setOutputSink((line) => lines.push(line));

    error('test error');
    assert.ok(lines.some(l => l.includes('test error')));
  });

  it('captures info', () => {
    const lines = [];
    setOutputSink((line) => lines.push(line));

    info('test info');
    assert.ok(lines.some(l => l.includes('test info')));
  });

  it('captures headings', () => {
    const lines = [];
    setOutputSink((line) => lines.push(line));

    heading('Test Heading');
    assert.ok(lines.some(l => l.includes('Test Heading')));
  });

  it('captures dim text', () => {
    const lines = [];
    setOutputSink((line) => lines.push(line));

    dim('dim text');
    assert.ok(lines.some(l => l.includes('dim text')));
  });
});

describe('progress sink', () => {
  afterEach(() => {
    clearProgressSink();
  });

  it('emits progress when sink is set', () => {
    const events = [];
    setProgressSink((info) => events.push(info));

    emitProgress('Linking', 5, 10);

    assert.equal(events.length, 1);
    assert.equal(events[0].message, 'Linking');
    assert.equal(events[0].current, 5);
    assert.equal(events[0].total, 10);
  });

  it('does nothing when no sink is set', () => {
    // Should not throw
    assert.doesNotThrow(() => emitProgress('test', 1, 1));
  });
});

describe('statusBadge', () => {
  it('returns a string for active', () => {
    const result = statusBadge('active');
    assert.ok(typeof result === 'string');
    assert.ok(stripAnsi(result).includes('active'));
  });

  it('returns a string for stale', () => {
    const result = statusBadge('stale');
    assert.ok(stripAnsi(result).includes('stale'));
  });

  it('returns a string for archived', () => {
    const result = statusBadge('archived');
    assert.ok(stripAnsi(result).includes('archived'));
  });

  it('returns unknown status as-is', () => {
    assert.equal(statusBadge('unknown'), 'unknown');
  });
});

describe('sizeBadge', () => {
  it('returns dim text for 0 bytes', () => {
    const result = sizeBadge(0);
    assert.ok(stripAnsi(result).includes('0 B'));
  });

  it('formats large sizes', () => {
    const result = sizeBadge(1024 * 1024 * 300); // 300 MB
    assert.ok(stripAnsi(result).includes('MB'));
  });
});
