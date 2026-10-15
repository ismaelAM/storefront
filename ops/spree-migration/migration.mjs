import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const TABLES = ["spree_products", "spree_variants", "spree_orders", "spree_users", "active_storage_blobs"];
const SOURCE_HOST = "bisontcg.spree.sh";
const EXISTING_CATALOG_PROJECT = "ikglqbjlbkbaronbiryl";
const DIGEST = /^[a-f0-9]{64}$/;
const IMAGE = /^[a-z0-9][a-z0-9._:/-]*@sha256:[a-f0-9]{64}$/;

const TARGET_GUARD = String.raw`require 'uri'
ref = ENV.fetch('TARGET_SUPABASE_PROJECT_REF')
abort 'Invalid target project' unless ref.match?(/\A[a-z]{20}\z/) && ref != '__CATALOG_PROJECT__'

def valid_target?(host, port, user, database, tls, ref)
  direct = host == "db.#{ref}.supabase.co"
  pooler = host&.end_with?('.pooler.supabase.com') && user == "postgres.#{ref}"
  (direct || pooler) && port.to_i == 5432 && database == 'postgres' && ['require', 'verify-full'].include?(tls)
end

begin
  url = URI.parse(ENV.fetch('DATABASE_URL'))
  options = URI.decode_www_form(url.query.to_s)
  keys = options.map(&:first)
  allowed = keys.uniq.length == keys.length && (keys - ['sslmode', 'connect_timeout']).empty?
  values = options.to_h
  allowed &&= !values.key?('connect_timeout') || values['connect_timeout'].match?(/\A[1-9][0-9]*\z/)
  user = URI.decode_www_form_component(url.user.to_s)
  database = URI.decode_www_form_component(url.path.to_s.sub(/\A\//, ''))
  valid = ['postgres', 'postgresql'].include?(url.scheme) && url.fragment.nil? && allowed
  valid &&= valid_target?(url.host, url.port || 5432, user, database, values['sslmode'], ref)
  abort 'Unexpected database target or TLS configuration' unless valid

  # A second invocation through rails runner also validates resolved database.yml.
  # Read configuration only: do not open a database connection here.
  if defined?(ActiveRecord::Base)
    config = ActiveRecord::Base.connection_db_config.configuration_hash.transform_keys(&:to_s)
    valid = valid_target?(config['host'], config['port'] || 5432, config['username'], config['database'], config['sslmode'], ref)
    abort 'Unexpected effective database target or TLS configuration' unless valid
  end
rescue URI::InvalidURIError, ArgumentError, KeyError
  abort 'Invalid database connection configuration'
end
`.replace("__CATALOG_PROJECT__", EXISTING_CATALOG_PROJECT);

function object(value, label, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}: expected an object`);
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new Error(`${label}: unexpected field`);
}
function inventory(value) {
  object(value, "inventory", TABLES);
  for (const table of TABLES) {
    if (!Number.isSafeInteger(value[table]) || value[table] < 0) throw new Error(`inventory: invalid or missing ${table}`);
  }
}
function validateManifest(value) {
  object(value, "manifest", ["schemaVersion", "capturedAt", "source", "database", "media", "inventory"]);
  if (value.schemaVersion !== 1) throw new Error("manifest: unsupported schemaVersion");
  if (typeof value.capturedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value.capturedAt) || !Number.isFinite(Date.parse(value.capturedAt))) throw new Error("manifest: invalid capturedAt");
  object(value.source, "source", ["host", "spreeVersion", "image"]);
  if (value.source.host !== SOURCE_HOST) throw new Error("source: unexpected store host");
  if (typeof value.source.spreeVersion !== "string" || !/^\d+\.\d+\.\d+(?:[.-][a-zA-Z0-9.-]+)?$/.test(value.source.spreeVersion)) throw new Error("source: exact Spree version required");
  if (typeof value.source.image !== "string" || !IMAGE.test(value.source.image)) throw new Error("source: runtime image must be pinned by sha256 digest");
  object(value.database, "database", ["file", "sha256", "postgresMajor"]);
  object(value.media, "media", ["file", "sha256"]);
  if (!Number.isSafeInteger(value.database.postgresMajor) || value.database.postgresMajor < 10) throw new Error("database: invalid source PostgreSQL major");
  inventory(value.inventory);
}
async function verifiedFile(root, entry, label) {
  if (typeof entry.file !== "string" || !entry.file || isAbsolute(entry.file)) throw new Error(`${label}: file must be inside the bundle`);
  if (typeof entry.sha256 !== "string" || !DIGEST.test(entry.sha256)) throw new Error(`${label}: invalid sha256`);
  let file;
  try { file = await realpath(resolve(root, entry.file)); } catch { throw new Error(`${label}: file unavailable`); }
  const rel = relative(root, file);
  if (!rel || rel === ".." || rel.startsWith(`../`) || isAbsolute(rel)) throw new Error(`${label}: file must be inside the bundle`);
  if (!(await stat(file)).isFile()) throw new Error(`${label}: expected a regular file`);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (hash.digest("hex") !== entry.sha256) throw new Error(`${label}: checksum mismatch`);
  return file;
}

/** Offline integrity verification. It does not prove a restore is lossless. */
export async function verifyBundle(manifestPath) {
  const path = await realpath(manifestPath);
  const root = dirname(path);
  let manifest;
  try { manifest = JSON.parse(await readFile(path, "utf8")); } catch { throw new Error("manifest: invalid JSON"); }
  validateManifest(manifest);
  const database = await verifiedFile(root, manifest.database, "database");
  const media = await verifiedFile(root, manifest.media, "media");
  if (database === media) throw new Error("media: database and media must be different files");
  const handle = await open(database, "r");
  try {
    const bytes = Buffer.alloc(5);
    const { bytesRead } = await handle.read(bytes, 0, 5, 0);
    if (bytesRead !== 5 || bytes.toString() !== "PGDMP") throw new Error("database: missing PostgreSQL custom dump PGDMP header");
  } finally { await handle.close(); }
  if ((await stat(media)).size === 0) throw new Error("media: empty archive");
  return { manifest, root, database, media };
}

export function compareInventory(expected, restored) {
  inventory(expected);
  inventory(restored);
  return TABLES.filter((table) => expected[table] !== restored[table])
    .map((table) => `${table}: expected ${expected[table]}, received ${restored[table]}`);
}

/** Generate an isolated candidate; never copies recovery data or deploys it. */
export async function prepareDeployment(manifestPath, outputDirectory) {
  const { manifest } = await verifyBundle(manifestPath);
  const output = resolve(outputDirectory);
  // Exclusive mkdir: even an empty pre-existing directory must not be replaced.
  await mkdir(output, { mode: 0o700 });
  const files = {
    "Dockerfile.vercel": `# Generated from the verified source runtime; no version upgrade.\nFROM ${manifest.source.image}\nWORKDIR /rails\nCOPY --chmod=644 migration-start.sh migration-target.rb migration-inventory.rb ./\nENV RAILS_ENV=production RAILS_LOG_TO_STDOUT=1 RAILS_SERVE_STATIC_FILES=1 SOLID_QUEUE_IN_PUMA=false PIDFILE=/tmp/spree.pid\nENTRYPOINT ["/bin/sh", "/rails/migration-start.sh"]\n`,
    "migration-start.sh": `#!/bin/sh\nset -eu\n: "\${DATABASE_URL:?DATABASE_URL is required}"\n: "\${SECRET_KEY_BASE:?SECRET_KEY_BASE is required}"\n: "\${TARGET_SUPABASE_PROJECT_REF:?TARGET_SUPABASE_PROJECT_REF is required}"\n: "\${MIGRATION_EXTERNAL_STORAGE_VERIFIED:?Verify original storage configuration and all copied media first}"\n[ "$MIGRATION_EXTERNAL_STORAGE_VERIFIED" = "yes" ] || exit 1\n# Reject URL overrides before Rails boots; then check effective database.yml.\nruby ./migration-target.rb\n./bin/rails runner ./migration-target.rb\n# Never seed, create or migrate a database during an autoscaling cold start.\n./bin/rails db:abort_if_pending_migrations\nexec ./bin/rails server -b 0.0.0.0 -p "\${PORT:-3000}"\n`,
    "migration-target.rb": TARGET_GUARD,
    "migration-inventory.rb": `# One-time reconciliation BEFORE cutover, not an ordinary startup constraint.\nrequire 'json'\nload File.join(__dir__, 'migration-target.rb')\nexpected = JSON.parse('${JSON.stringify(manifest.inventory)}')\nconnection = ActiveRecord::Base.connection\nexpected.each do |table, count|\n  actual = connection.select_value("SELECT count(*) FROM #{connection.quote_table_name(table)}").to_i\n  abort "Inventory mismatch: #{table}" unless actual == count\nend\nputs 'Core database inventory matches; media and business checks remain required.'\n`,
    ".dockerignore": "*\n!Dockerfile.vercel\n!migration-start.sh\n!migration-target.rb\n!migration-inventory.rb\n",
    "vercel.json": `${JSON.stringify({ regions: ["dub1"] }, null, 2)}\n`,
    "README.md": `# Spree runtime candidate\n\nSource Spree: ${manifest.source.spreeVersion}.\n\nThis directory contains no backup, media or secrets. It assumes the source image\ncontains the original Rails application in /rails. Inspect and build that image\nbefore deployment. It deliberately bypasses upstream db:prepare.\n\nRestore into a NEW isolated Supabase project first. Configure the original\nstorage adapter against persistent copied media, preserving Active Storage keys\nand service names. Configure DATABASE_URL with TLS, TARGET_SUPABASE_PROJECT_REF,\nSECRET_KEY_BASE and all required original application encryption/storage keys\nas sensitive runtime environment variables. Use the session pooler on port 5432\nif a pooler is required. Do not reuse the catalog project's database.\n\nMIGRATION_EXTERNAL_STORAGE_VERIFIED=yes is an operator attestation after testing\nmedia; it is not an automated media audit. The one-time inventory checker compares five core table counts. Ordinary startup\ndoes not enforce backup counts. These checks do not prove referential integrity,\nprices, payments or recovery completeness.\n\nSOLID_QUEUE_IN_PUMA=false only disables workers if the original Puma config\ncompares its value with true. Inspect the source runtime before deploying. Do not\nswitch traffic until a durable worker strategy is configured and tested. No\nproduction domains, webhooks or storefront environment variables are changed.\n`,
  };
  for (const [name, contents] of Object.entries(files)) {
    await writeFile(join(output, name), contents, { mode: 0o600, flag: "wx" });
  }
  return output;
}

async function main(args) {
  const [command, manifestPath, destination] = args;
  if (command === "verify" && args.length === 2) {
    await verifyBundle(manifestPath);
    console.log("Bundle integrity verified. A real restore, media audit and business checks are still required.");
  } else if (command === "prepare" && args.length === 3) {
    await prepareDeployment(manifestPath, destination);
    console.log("Runtime candidate generated; nothing has been deployed or switched.");
  } else if (command === "compare" && args.length === 3) {
    const { manifest } = await verifyBundle(manifestPath);
    const restored = JSON.parse(await readFile(destination, "utf8"));
    const differences = compareInventory(manifest.inventory, restored);
    if (differences.length) throw new Error(differences.join("; "));
    console.log("Core table counts match. This alone does not establish lossless recovery.");
  } else {
    throw new Error("Usage: node ops/spree-migration/migration.mjs verify MANIFEST | prepare MANIFEST NEW_DIRECTORY | compare MANIFEST INVENTORY_JSON");
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    // No raw filesystem/JSON/parser errors: manifests may contain private data.
    const safe = /^(manifest:|source:|database:|media:|inventory:|spree_|active_storage_blobs:|Usage:)/.test(error.message);
    console.error(safe ? error.message : "Migration preparation failed; check input files, permissions and a fresh output directory.");
    process.exitCode = 1;
  });
}
