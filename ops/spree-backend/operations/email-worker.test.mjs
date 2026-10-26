import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, chmodSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
test('email worker starts native Solid Queue with isolated queues and recurring scheduling disabled', () => {
  const temporary = mkdtempSync(path.join(directory, '.email-worker-test-'));
  try {
    mkdirSync(path.join(temporary, 'bin'));
    mkdirSync(path.join(temporary, 'config'));
    copyFileSync(path.join(directory, 'email-worker.sh'), path.join(temporary, 'email-worker.sh'));
    copyFileSync(path.join(directory, '../config/queue-mail.yml'), path.join(temporary, 'config/queue-mail.yml'));
    writeFileSync(path.join(temporary, 'target.rb'), 'target placeholder');
    writeFileSync(path.join(temporary, 'bin/ruby'), '#!/bin/sh\n[ "$1" = "./target.rb" ] || exit 8\n[ "${FAIL_TARGET:-}" != "yes" ] || exit 9\n');
    writeFileSync(path.join(temporary, 'bin/jobs'), '#!/bin/sh\nprintf "%s\\n" "$SPREE_RUNTIME_ROLE" "$JOB_THREADS" "$JOB_CONCURRENCY" "$@"\n');
    chmodSync(path.join(temporary, 'bin/ruby'), 0o755);
    chmodSync(path.join(temporary, 'bin/jobs'), 0o755);
    const env = { PATH: `${temporary}/bin:/usr/bin:/bin` };
    const result = spawnSync('/bin/sh', ['./email-worker.sh'], { cwd: temporary, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.stdout.trim().split('\n'), [
      'worker', '1', '1', '--mode', 'async', '--skip-recurring', '--config-file', './config/queue-mail.yml',
    ]);
    const refused = spawnSync('/bin/sh', ['./email-worker.sh'], {
      cwd: temporary, env: { ...env, FAIL_TARGET: 'yes' }, encoding: 'utf8',
    });
    assert.equal(refused.status, 9);
    assert.equal(refused.stdout, '');
    const config = readFileSync(path.join(temporary, 'config/queue-mail.yml'), 'utf8');
    const queues = [...config.matchAll(/^\s+- (spree_\w+|\*)$/gm)].map((match) => match[1]);
    assert.deepEqual(queues, ['spree_events', 'spree_webhooks']);
    assert.doesNotMatch(config.replace(/^#.*$/gm, ''), /mailers|active_storage|spree_payment_webhooks|\"\*\"/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
