import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
test('web startup refuses missing configuration before invoking Rails', () => {
  const result = spawnSync('/bin/sh', ['./start.sh'], {
    cwd: directory, env: { PATH: '/usr/bin:/bin' }, encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DATABASE_URL is required/);
  assert.doesNotMatch(result.stderr, /cannot open|not found/);
});
test('web startup requires persistent storage before invoking Rails', () => {
  const result = spawnSync('/bin/sh', ['./start.sh'], {
    cwd: directory,
    env: { PATH: '/usr/bin:/bin', DATABASE_URL: 'private-value-never-print', SECRET_KEY_BASE: 'private-value-never-print' },
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SUPABASE_S3_ACCESS_KEY_ID is required/);
  assert.doesNotMatch(result.stderr, /private-value-never-print/);
});
