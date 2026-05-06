import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createCli } from '../src/cli.js';

describe('CLI setup', () => {
  let program;

  it('creates a Commander program', () => {
    program = createCli();
    assert.ok(program);
    assert.equal(program.name(), 'nodevault');
  });

  it('has the correct version', () => {
    program = createCli();
    assert.equal(program.version(), '0.1.0');
  });

  it('registers all expected commands', () => {
    program = createCli();
    const commandNames = program.commands.map(c => c.name());

    const expected = ['init', 'scan', 'link', 'clean', 'prune', 'unlink', 'status', 'list', 'daemon', 'watch', 'tui'];
    for (const name of expected) {
      assert.ok(commandNames.includes(name), `Missing command: ${name}`);
    }
  });

  it('scan command has --depth option', () => {
    program = createCli();
    const scan = program.commands.find(c => c.name() === 'scan');
    const depthOption = scan.options.find(o => o.long === '--depth');
    assert.ok(depthOption, 'scan should have --depth option');
  });

  it('link command has --all and --strategy options', () => {
    program = createCli();
    const link = program.commands.find(c => c.name() === 'link');
    const allOption = link.options.find(o => o.long === '--all');
    const strategyOption = link.options.find(o => o.long === '--strategy');
    assert.ok(allOption, 'link should have --all option');
    assert.ok(strategyOption, 'link should have --strategy option');
  });

  it('clean command has --force, --stale, --archived, --all options', () => {
    program = createCli();
    const clean = program.commands.find(c => c.name() === 'clean');
    const optionNames = clean.options.map(o => o.long);
    assert.ok(optionNames.includes('--force'));
    assert.ok(optionNames.includes('--stale'));
    assert.ok(optionNames.includes('--archived'));
    assert.ok(optionNames.includes('--all'));
  });

  it('list command has --sort and --filter options', () => {
    program = createCli();
    const list = program.commands.find(c => c.name() === 'list');
    const optionNames = list.options.map(o => o.long);
    assert.ok(optionNames.includes('--sort'));
    assert.ok(optionNames.includes('--filter'));
  });

  it('status command has --json and --verbose options', () => {
    program = createCli();
    const status = program.commands.find(c => c.name() === 'status');
    const optionNames = status.options.map(o => o.long);
    assert.ok(optionNames.includes('--json'));
    assert.ok(optionNames.includes('--verbose'));
  });
});
