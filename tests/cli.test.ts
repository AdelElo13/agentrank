import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'agentrank-cli-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true });
});

function run(...args: string[]): string {
  return execFileSync('node', ['bin/cli.mjs', ...args], {
    env: {
      ...process.env,
      AGENTRANK_DATA_DIR: tmpDir,
      AGENTRANK_PROOFS_DIR: join(tmpDir, 'proofs'),
    },
    cwd: join(import.meta.dirname ?? '.', '..'),
    timeout: 10000,
  }).toString().trim();
}

describe('CLI', () => {
  it('shows help', () => {
    const output = run('--help');
    expect(output).toContain('agentrank');
    expect(output).toContain('COMMANDS');
    expect(output).toContain('profile');
    expect(output).toContain('failures');
  });

  it('initializes', () => {
    const output = run('init');
    expect(output).toContain('agentrank initialized');
    expect(output).toContain('Evaluator key');
  });

  it('prints pubkey', () => {
    run('init');
    const output = run('pubkey');
    expect(output).toMatch(/^ed25519:/);
  });

  it('shows empty profile', () => {
    run('init');
    const output = run('profile');
    expect(output).toContain('No tasks');
  });

  it('shows empty tasks', () => {
    run('init');
    const output = run('tasks');
    expect(output).toContain('No tasks');
  });

  it('shows coverage', () => {
    run('init');
    const output = run('coverage');
    expect(output).toContain('Coverage');
  });

  it('errors on unknown command', () => {
    try {
      run('foobar');
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.stderr.toString()).toContain('Unknown command');
    }
  });
});
