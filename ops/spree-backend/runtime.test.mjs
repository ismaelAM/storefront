import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { existsSync } from 'node:fs';

const directory = fileURLToPath(new URL('.', import.meta.url));

function runRuntime(script, extra = {}) {
  const fixture = mkdtempSync(join(directory, '.runtime-test-'));
  try {
    mkdirSync(join(fixture, 'bin'));
    const executable = (name, body) => writeFileSync(join(fixture, 'bin', name), `#!/bin/sh\n${body}\n`, { mode: 0o700 });
    executable('ruby', 'printf "guard %s\\n" "$*" >> "$CALLS"; exit "${GUARD_EXIT:-0}"');
    executable('rails', 'printf "rails %s role=%s\\n" "$*" "$SPREE_RUNTIME_ROLE" >> "$CALLS"');
    executable('jobs', 'printf "jobs %s role=%s threads=%s concurrency=%s\\n" "$*" "$SPREE_RUNTIME_ROLE" "$JOB_THREADS" "$JOB_CONCURRENCY" >> "$CALLS"');
    const calls = join(fixture, 'calls');
    writeFileSync(calls, '');
    const result = spawnSync('/bin/sh', [join(directory, script)], {
      cwd: fixture, encoding: 'utf8',
      env: {
        PATH: `${fixture}/bin:/usr/bin:/bin`, CALLS: calls,
        DATABASE_URL: 'private-fixture', SECRET_KEY_BASE: 'private-fixture',
        SUPABASE_S3_ACCESS_KEY_ID: 'private-fixture', SUPABASE_S3_SECRET_ACCESS_KEY: 'private-fixture',
        ...extra,
      },
    });
    return { ...result, calls: readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean) };
  } finally { rmSync(fixture, { recursive: true, force: true }); }
}

test('web validates the URL then boots Rails once with in-process runtime guards', () => {
  const result = runRuntime('start.sh', { PORT: '4567' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, ['guard ./target.rb', 'rails server -b 0.0.0.0 -p 4567 role=web']);
});

test('worker uses one async supervisor and one job thread without preliminary Rails boots', () => {
  const result = runRuntime('operations/worker.sh', { JOB_THREADS: '30', JOB_CONCURRENCY: '9' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, ['guard ./target.rb', 'jobs --mode async role=worker threads=1 concurrency=1']);
});

for (const script of ['start.sh', 'operations/worker.sh']) {
  test(`${script} never starts Rails after the destination guard fails`, () => {
    const result = runRuntime(script, { GUARD_EXIT: '42' });
    assert.equal(result.status, 42);
    assert.deepEqual(result.calls, ['guard ./target.rb']);
    assert.doesNotMatch(result.stdout + result.stderr, /private-fixture/);
  });
}

test('daemon Docker COPY inputs exist within the configured build context', () => {
  const config = JSON.parse(readFileSync(join(directory, 'vercel.json'), 'utf8'));
  for (const daemon of Object.values(config.daemons)) {
    // Vercel builds from the Dockerfile's parent directory, even when `root`
    // names a higher upload root. Match the actual buildah context argument.
    const entrypoint = join(directory, daemon.root, daemon.entrypoint);
    const root = dirname(entrypoint);
    const dockerfile = readFileSync(entrypoint, 'utf8');
    for (const line of dockerfile.split('\n').filter((line) => line.startsWith('COPY '))) {
      const inputs = line.split(/\s+/).slice(1, -1).filter((word) => !word.startsWith('--'));
      for (const input of inputs) assert.ok(existsSync(join(root, input)), `Missing daemon build input: ${input}`);
    }
  }
});

const ruby = process.env.RUBY_BIN || 'ruby';
const hasRuby = spawnSync(ruby, ['--version']).status === 0;
const rubyEnv = {
  ...process.env,
  TARGET_SUPABASE_PROJECT_REF: 'dtrospakebdiqihhcrub',
  DATABASE_URL: 'postgresql://postgres.dtrospakebdiqihhcrub:fixture@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require',
};
const runRuby = (source, extra = {}) => spawnSync(ruby, ['-e', source], { cwd: directory, env: { ...rubyEnv, ...extra }, encoding: 'utf8' });

// Exercise the initializer with a small Rails boundary; the actual target
// guard, ERB database config and migration-gate ordering run unchanged.
const guardHarness = `
require 'pathname'
require 'ostruct'
module Rails
  def self.root = Pathname.new(Dir.pwd)
  def self.application = @application ||= OpenStruct.new(config: OpenStruct.new)
end
callback = nil
Rails.application.config.define_singleton_method(:after_initialize) { |&block| callback = block }
Rails.application.config.define_singleton_method(:finish) { callback&.call }
module ActiveRecord
  class Base
    def self.connection_db_config
      OpenStruct.new(configuration_hash: {
        host: ENV.fetch('EFFECTIVE_HOST', 'aws-0-eu-west-1.pooler.supabase.com'),
        port: 5432, username: 'postgres.dtrospakebdiqihhcrub', database: 'postgres', sslmode: 'require'
      })
    end
  end
  class Migration
    def self.check_all_pending!
      raise 'pending migrations' if ENV['PENDING'] == 'true'
      puts 'migrations checked'
    end
  end
end
load 'config/initializers/runtime_guard.rb'
Rails.application.config.finish
puts 'runtime ready'
`;

for (const role of ['web', 'worker']) {
  test(`${role} runtime checks effective database and migrations during its single boot`, { skip: !hasRuby }, () => {
    const success = runRuby(guardHarness, { SPREE_RUNTIME_ROLE: role });
    assert.equal(success.status, 0, success.stderr);
    assert.equal(success.stdout.trim(), 'migrations checked\nruntime ready');
    const wrongTarget = runRuby(guardHarness, { SPREE_RUNTIME_ROLE: role, EFFECTIVE_HOST: 'wrong-project.example.test' });
    assert.notEqual(wrongTarget.status, 0);
    assert.doesNotMatch(wrongTarget.stdout, /migrations checked|runtime ready/);
    const pending = runRuby(guardHarness, { SPREE_RUNTIME_ROLE: role, PENDING: 'true' });
    assert.notEqual(pending.status, 0);
    assert.doesNotMatch(pending.stdout, /runtime ready/);
  });
}

test('one-shot migrations remain possible without a runtime role', { skip: !hasRuby }, () => {
  const result = runRuby(guardHarness, { SPREE_RUNTIME_ROLE: '', PENDING: 'true' });
  // An empty role is a configuration error, whereas an unset role is an operation.
  assert.notEqual(result.status, 0);
  const operation = runRuby(`ENV.delete('SPREE_RUNTIME_ROLE')\n${guardHarness}`, { PENDING: 'true' });
  assert.equal(operation.status, 0, operation.stderr);
  assert.equal(operation.stdout.trim(), 'runtime ready');
});

test('runtime pools fit one worker plus two overlapping three-thread web instances below 15 clients', { skip: !hasRuby }, () => {
  const source = `require 'erb'; require 'yaml'; require 'json';
    c = YAML.safe_load(ERB.new(File.read('config/database.yml')).result).fetch('production');
    puts JSON.generate(c)`;
  const web = runRuby(source, { SPREE_RUNTIME_ROLE: 'web', RAILS_MAX_THREADS: '3' });
  const worker = runRuby(source, { SPREE_RUNTIME_ROLE: 'worker', RAILS_MAX_THREADS: '3' });
  assert.equal(web.status, 0, web.stderr);
  assert.equal(worker.status, 0, worker.stderr);
  assert.equal(JSON.parse(web.stdout).pool * 2 + JSON.parse(worker.stdout).pool, 14);
  const queues = runRuby(`require 'yaml'; require 'json'; puts JSON.generate(YAML.safe_load(File.read('config/queue.yml')).fetch('production'))`);
  assert.equal(queues.status, 0, queues.stderr);
  const config = JSON.parse(queues.stdout);
  assert.equal(config.workers.length, 1);
  assert.equal(config.workers[0].threads, 1);
  assert.equal(config.workers[0].queues.at(-1), '*', 'Future queues must not starve');
  assert.ok(config.workers[0].queues.includes('spree_payment_webhooks'));
  assert.ok(config.workers[0].queues.includes('active_storage_transform'));
  assert.equal(60 / config.workers[0].polling_interval, 30, 'An idle worker polls at most 30 times/minute');
  assert.equal(60 / config.dispatchers[0].polling_interval, 12);
});
