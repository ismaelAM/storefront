import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const directory = fileURLToPath(new URL('.', import.meta.url));
function initialize(extra = {}, script = 'initialize') {
  const fixture = mkdtempSync(join(directory, '.initialize-test-'));
  try {
    mkdirSync(join(fixture, 'bin'));
    const executable = (name, body) => writeFileSync(join(fixture, 'bin', name), `#!/bin/sh\n${body}\n`, { mode: 0o700 });
    executable('ruby', 'printf "ruby %s\\n" "$*" >> "$CALLS"; exit "${GUARD_EXIT:-0}"');
    executable('rails', 'printf "rails %s\\n" "$*" >> "$CALLS"; if [ "$*" = db:migrate ]; then exit "${MIGRATE_EXIT:-0}"; fi; if [ "$*" = "runner ./configure-store.rb" ]; then exit "${CONFIGURE_EXIT:-0}"; fi');
    executable('sleep', 'printf "idle %s\\n" "$*" >> "$CALLS"');
    const calls = join(fixture, 'calls');
    writeFileSync(calls, '');
    const result = spawnSync('/bin/sh', [join(directory, `operations/${script}.sh`)], {
      cwd: fixture, encoding: 'utf8',
      env: { PATH: `${fixture}/bin:/usr/bin:/bin`, CALLS: calls, ...extra },
    });
    return { ...result, calls: readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean) };
  } finally { rmSync(fixture, { recursive: true, force: true }); }
}

test('initialization refuses to invoke Rails when the destination guard rejects the database', () => {
  const result = initialize({ GUARD_EXIT: '42' });
  assert.equal(result.status, 42);
  assert.deepEqual(result.calls, ['ruby ./target.rb']);
});
test('failed migrations cannot report completion or enter the idle state', () => {
  const result = initialize({ MIGRATE_EXIT: '43' });
  assert.equal(result.status, 43);
  assert.doesNotMatch(result.stdout, /complete/i);
  assert.deepEqual(result.calls, ['ruby ./target.rb', 'rails runner ./target.rb', 'rails db:migrate']);
});
test('initialization validates the effective target and runs migrations without creating sample data', () => {
  const result = initialize();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, ['ruby ./target.rb', 'rails runner ./target.rb', 'rails db:migrate', 'idle infinity']);
  assert.match(result.stdout, /Spree schema initialization complete/);
});
test('store configuration checks the destination before invoking any Rails commands', () => {
  const result = initialize({ GUARD_EXIT: '42' }, 'configure-store');
  assert.equal(result.status, 42);
  assert.deepEqual(result.calls, ['ruby ./target.rb']);
});
test('a failed store transaction cannot report completion', () => {
  const result = initialize({ CONFIGURE_EXIT: '44' }, 'configure-store');
  assert.equal(result.status, 44);
  assert.deepEqual(result.calls, ['ruby ./target.rb', 'rails runner ./target.rb', 'rails runner ./configure-store.rb']);
  assert.doesNotMatch(result.stdout, /complete/i);
});
test('store configuration invokes only the reviewed configuration script then remains idle', () => {
  const result = initialize({}, 'configure-store');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, ['ruby ./target.rb', 'rails runner ./target.rb', 'rails runner ./configure-store.rb', 'idle infinity']);
  assert.match(result.stdout, /BisonTCG store configuration complete/);
});
