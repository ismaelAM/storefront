import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { compareInventory, prepareDeployment, verifyBundle } from "./migration.mjs";

const sha = (data) => createHash("sha256").update(data).digest("hex");
async function fixture(t) {
  const scratch = join(process.cwd(), ".local", "migration-tests");
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(join(scratch, "spree-recovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bundle = join(root, "bundle");
  await mkdir(bundle);
  // Synthetic files only exercise integrity checks, not PostgreSQL restore.
  const dump = Buffer.from("PGDMPsynthetic-test-fixture");
  const media = Buffer.from("synthetic-media-fixture");
  await writeFile(join(bundle, "database.dump"), dump);
  await writeFile(join(bundle, "media.tar"), media);
  const manifest = {
    schemaVersion: 1,
    capturedAt: "2026-10-15T13:00:00Z",
    source: { host: "bisontcg.spree.sh", spreeVersion: "5.6.1", image: `ghcr.io/spree/spree@sha256:${"a".repeat(64)}` },
    database: { file: "database.dump", sha256: sha(dump), postgresMajor: 17 },
    media: { file: "media.tar", sha256: sha(media) },
    inventory: { spree_products: 4, spree_variants: 6, spree_orders: 0, spree_users: 1, active_storage_blobs: 4 },
  };
  const path = join(bundle, "manifest.json");
  const save = () => writeFile(path, JSON.stringify(manifest));
  await save();
  return { root, bundle, manifest, path, save };
}

test("accepts a complete package with matching checksums", async (t) => {
  const f = await fixture(t);
  const result = await verifyBundle(f.path);
  assert.deepEqual(result.manifest.inventory, f.manifest.inventory);
});
test("rejects a missing dump", async (t) => {
  const f = await fixture(t);
  await rm(join(f.bundle, "database.dump"));
  await assert.rejects(verifyBundle(f.path), /database:.*unavailable/);
});
test("rejects changed database and media bytes", async (t) => {
  for (const file of ["database.dump", "media.tar"]) {
    const f = await fixture(t);
    await writeFile(join(f.bundle, file), "changed");
    await assert.rejects(verifyBundle(f.path), /checksum/);
  }
});
test("rejects a plain SQL file disguised as a custom dump", async (t) => {
  const f = await fixture(t);
  const data = Buffer.from("SELECT 1;");
  await writeFile(join(f.bundle, "database.dump"), data);
  f.manifest.database.sha256 = sha(data);
  await f.save();
  await assert.rejects(verifyBundle(f.path), /PGDMP/);
});
test("rejects paths outside the bundle, including symlinks", async (t) => {
  for (const file of ["../outside.dump", "/outside.dump", "linked.dump"]) {
    const f = await fixture(t);
    await writeFile(join(f.root, "outside.dump"), "outside");
    if (file === "linked.dump") await symlink(join(f.root, "outside.dump"), join(f.bundle, file));
    f.manifest.database.file = file;
    await f.save();
    await assert.rejects(verifyBundle(f.path), /inside the bundle/);
  }
});
test("requires an exact image digest and known source version", async (t) => {
  for (const change of [{ image: "ghcr.io/spree/spree:latest" }, { image: "image\nRUN command" }, { spreeVersion: "unknown" }]) {
    const f = await fixture(t);
    Object.assign(f.manifest.source, change);
    await f.save();
    await assert.rejects(verifyBundle(f.path), /source/);
  }
});
test("requires all inventory counts, including explicit zeroes", async (t) => {
  const f = await fixture(t);
  delete f.manifest.inventory.spree_orders;
  await f.save();
  await assert.rejects(verifyBundle(f.path), /spree_orders/);
});
test("rejects negative, fractional and unsafe counts", async (t) => {
  for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const f = await fixture(t);
    f.manifest.inventory.spree_users = value;
    await f.save();
    await assert.rejects(verifyBundle(f.path), /spree_users/);
  }
});
test("does not accept arbitrary table names or top-level secret fields", async (t) => {
  const f = await fixture(t);
  f.manifest.DATABASE_URL = "private";
  await f.save();
  await assert.rejects(verifyBundle(f.path), /unexpected/);
});
test("reconciles counts and rejects missing or differing restored tables", () => {
  const source = { spree_products: 4, spree_variants: 6, spree_orders: 0, spree_users: 1, active_storage_blobs: 4 };
  assert.deepEqual(compareInventory(source, { ...source }), []);
  assert.deepEqual(compareInventory(source, { ...source, spree_orders: 1 }), ["spree_orders: expected 0, received 1"]);
  const missing = { ...source }; delete missing.spree_users;
  assert.throws(() => compareInventory(source, missing), /spree_users/);
});
test("generates a separate runtime without copying backup files or auto-migrating", async (t) => {
  const f = await fixture(t);
  const output = join(f.root, "deployment");
  await prepareDeployment(f.path, output);
  const docker = await readFile(join(output, "Dockerfile.vercel"), "utf8");
  const start = await readFile(join(output, "migration-start.sh"), "utf8");
  assert.match(docker, new RegExp(`FROM ${f.manifest.source.image}`));
  assert.match(start, /db:abort_if_pending_migrations/);
  // Legitimate changes after cutover must not make later cold starts fail.
  assert.doesNotMatch(start, /migration-inventory.rb/);
  assert.match(start, /ruby \.\/migration-target.rb/);
  assert.doesNotMatch(start, /db:(prepare|migrate|seed|reset|drop)/);
  await assert.rejects(readFile(join(output, "database.dump")), /ENOENT/);
  await assert.rejects(prepareDeployment(f.path, output), /exists/);
});
test("preparation fails before creating output for an invalid bundle", async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.bundle, "media.tar"), "broken");
  const output = join(f.root, "deployment");
  await assert.rejects(prepareDeployment(f.path, output), /checksum/);
  await assert.rejects(readFile(join(output, "Dockerfile.vercel")), /ENOENT/);
});

const rubyAvailable = spawnSync("ruby", ["--version"], { stdio: "ignore" }).status === 0;
const ref = "abcdefghijklmnopqrst";
const direct = `postgresql://postgres:test@db.${ref}.supabase.co:5432/postgres?sslmode=require`;

test("Ruby target guard accepts TLS direct/session connections and rejects URL overrides", { skip: !rubyAvailable && "Ruby not installed; exercised by CI" }, async (t) => {
  const f = await fixture(t);
  const output = join(f.root, "deployment");
  await prepareDeployment(f.path, output);
  const run = (url, project = ref) => spawnSync("ruby", [join(output, "migration-target.rb")], {
    env: { ...process.env, DATABASE_URL: url, TARGET_SUPABASE_PROJECT_REF: project }, encoding: "utf8",
  });
  assert.equal(run(direct).status, 0);
  assert.equal(run(`postgresql://postgres.${ref}:test@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require`).status, 0);
  for (const url of [
    `${direct}&host=db.other.supabase.co`, `${direct}&username=postgres.other`,
    `${direct}&port=6543`, `${direct}&dbname=other`, `${direct}&sslmode=disable`,
    `${direct}&sslmode=require`, direct.replace("sslmode=require", "sslmode=disable"),
    direct.replace(":5432/", ":6543/"), direct.replace("/postgres?", "/other?"),
    direct.replace(`db.${ref}`, "db.other"),
  ]) assert.notEqual(run(url).status, 0, url);
  assert.notEqual(run(direct, "ikglqbjlbkbaronbiryl").status, 0);
});

test("Ruby target guard rejects effective Rails host, database or TLS changes without connecting", { skip: !rubyAvailable && "Ruby not installed; exercised by CI" }, async (t) => {
  const f = await fixture(t);
  const output = join(f.root, "deployment");
  await prepareDeployment(f.path, output);
  const config = { host: `db.${ref}.supabase.co`, port: 5432, username: "postgres", database: "postgres", sslmode: "require" };
  const stub = `require 'json'; module ActiveRecord; class Base; def self.connection_db_config; Struct.new(:configuration_hash).new(JSON.parse(ENV.fetch('TEST_CONFIG'))); end; def self.connection; abort 'Unexpected database access'; end; end; end; load ARGV.fetch(0)`;
  const run = (change) => spawnSync("ruby", ["-e", stub, join(output, "migration-target.rb")], {
    env: { ...process.env, DATABASE_URL: direct, TARGET_SUPABASE_PROJECT_REF: ref, TEST_CONFIG: JSON.stringify({ ...config, ...change }) }, encoding: "utf8",
  });
  assert.equal(run({}).status, 0);
  for (const change of [{ host: "untrusted.example" }, { database: "other" }, { sslmode: "disable" }, { port: 6543 }]) {
    assert.notEqual(run(change).status, 0);
  }
});
