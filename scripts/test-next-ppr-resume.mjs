import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { dirname, join, sep } from "node:path";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

// Exercise Next's built production runtime, including the minimal-mode resume
// that Vercel invokes after serving the PPR shell. No commerce API is required.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const { HTML_LIMITED_BOT_UA_RE } = require("next/dist/shared/lib/router/utils/html-bots");
const fixtureSource = join(root, "scripts/fixtures/ppr-bot-resume");
let fixture;
let server;
let serverOutput = "";
let url;
let postponed;
let databaseServer;
let databaseUrl;
const published = new Map();
const pageReads = new Map();
const failingReads = new Set();
const children = new Map();
const closedChildren = new Set();

function child(command, args, options) {
  const childProcess = spawn(command, args, {
    ...options,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.set(childProcess, new Promise((resolve) => {
    childProcess.once("error", (error) => resolve({ error }));
    childProcess.once("close", (code, signal) => {
      closedChildren.add(childProcess);
      resolve({ code, signal });
    });
  }));
  return childProcess;
}

async function waitForChild(childProcess, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      children.get(childProcess),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Child process exceeded ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function stopChild(childProcess) {
  if (closedChildren.has(childProcess) || !childProcess.pid) return;
  const signal = (name) => {
    try {
      // Include Next's build workers in teardown so inherited pipes cannot hang.
      if (process.platform === "win32") childProcess.kill(name);
      else process.kill(-childProcess.pid, name);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  };
  try {
    signal("SIGTERM");
    await waitForChild(childProcess, 2_000);
  } catch {
    try {
      signal("SIGKILL");
      await waitForChild(childProcess, 2_000);
    } finally {
      childProcess.stdout.destroy();
      childProcess.stderr.destroy();
      childProcess.unref();
    }
  }
}

before(async () => {
  // The fixture runs our real Puck reader and HTTP publisher against a tiny
  // Supabase HTTP boundary. This exercises Next's production cache/invalidation
  // rather than pretending the cache directive works in a unit-test transform.
  databaseServer = createHttpServer(async (request, response) => {
    response.setHeader("content-type", "application/json");
    const requestUrl = new URL(request.url, "http://fixture.test");
    const pageId = requestUrl.searchParams.get("page_id")?.replace(/^eq\./, "");
    if (request.method === "GET") {
      pageReads.set(pageId, (pageReads.get(pageId) ?? 0) + 1);
      if (failingReads.has(pageId)) {
        response.writeHead(503);
        response.end(JSON.stringify({ message: "Fixture unavailable" }));
      } else {
        response.end(JSON.stringify(published.has(pageId) ? { published_data: published.get(pageId) } : null));
      }
    } else if (request.method === "POST") {
      let body = "";
      for await (const chunk of request) body += chunk;
      const record = JSON.parse(body);
      published.set(record.page_id, record.published_data);
      response.writeHead(201);
      response.end("null");
    } else {
      response.writeHead(405);
      response.end("null");
    }
  });
  databaseServer.listen(0, "127.0.0.1");
  await once(databaseServer, "listening");
  databaseUrl = `http://127.0.0.1:${databaseServer.address().port}`;
  await mkdir(join(root, ".local"), { recursive: true });
  fixture = await mkdtemp(join(root, ".local/ppr-bot-resume-"));
  await cp(fixtureSource, fixture, { recursive: true });
  await symlink(join(root, "node_modules"), join(fixture, "node_modules"));
  await writeFile(join(fixture, "package.json"), JSON.stringify({ private: true }));
  const serverImport = /@\/lib\/supabase\/server/g;
  await writeFile(join(fixture, "app/published-data.ts"), (await readFile(join(root, "src/lib/puck/get-site-page-data.ts"), "utf8")).replace(serverImport, "./supabase"));
  await cp(join(root, "src/lib/supabase/server.ts"), join(fixture, "app/supabase.ts"));
  await mkdir(join(fixture, "app/api/pages/home"), { recursive: true });
  await writeFile(join(fixture, "app/api/pages/home/route.ts"), (await readFile(join(root, "src/app/api/pages/home/route.ts"), "utf8")).replace(serverImport, "../../../supabase"));
  // Linked worktrees can share dependencies with a sibling checkout. Turbopack
  // must be allowed to resolve that real path, while CI keeps its normal root.
  const dependencyRoot = dirname(await realpath(join(root, "node_modules")));
  let filesystemRoot = root;
  while (dirname(filesystemRoot) !== filesystemRoot && dependencyRoot !== filesystemRoot && !dependencyRoot.startsWith(`${filesystemRoot}${sep}`)) filesystemRoot = dirname(filesystemRoot);
  await writeFile(join(fixture, "next.config.js"), `module.exports = {
    cacheComponents: true,
    cacheLife: { tenMinutes: { stale: 300, revalidate: 600, expire: 3600 } },
    htmlLimitedBots: new RegExp(${JSON.stringify(`${HTML_LIMITED_BOT_UA_RE.source}|Googlebot|MySpecialBot`)}, 'i'),
    turbopack: { root: ${JSON.stringify(filesystemRoot)} },
  };\n`);

  const build = child(process.execPath, [nextBin, "build", fixture, ...(process.env.PPR_TEST_WEBPACK ? ["--webpack"] : [])], {
    cwd: root,
    env: { ...process.env, TMPDIR: fixture, NEXT_TELEMETRY_DISABLED: "1", SUPABASE_URL: databaseUrl, SUPABASE_SERVICE_ROLE_KEY: "fixture-server-key" },
  });
  let output = "";
  build.stdout.on("data", (chunk) => { output += chunk; });
  build.stderr.on("data", (chunk) => { output += chunk; });
  try {
    const { code, error, signal } = await waitForChild(build, 120_000);
    if (error) throw error;
    assert.equal(code, 0, `Fixture build failed (${signal ?? code}):\n${output}`);
  } finally {
    await stopChild(build);
  }
  postponed = JSON.parse(await readFile(join(fixture, ".next/server/app/dynamic.meta"), "utf8")).postponed;
  assert.equal(typeof postponed, "string", "Fixture must generate postponed state");

  const portServer = createServer();
  portServer.listen(0, "127.0.0.1");
  await once(portServer, "listening");
  const port = portServer.address().port;
  await new Promise((resolve) => portServer.close(resolve));
  url = `http://127.0.0.1:${port}/dynamic`;
  const serverFile = join(fixture, "start.cjs");
  await writeFile(serverFile, `require('next/dist/server/lib/start-server').startServer({
    dir: __dirname, isDev: false, hostname: '127.0.0.1', port: ${port}, minimalMode: true,
  });\n`);
  server = child(process.execPath, [serverFile], {
    cwd: fixture,
    env: { ...process.env, TMPDIR: fixture, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXT_PRIVATE_TEST_HEADERS: "1", SUPABASE_URL: databaseUrl, SUPABASE_SERVICE_ROLE_KEY: "fixture-server-key", PUCK_PUBLISH_SECRET: "fixture-publish-key" },
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server startup timed out:\n${serverOutput}`)), 30_000);
    const collect = (chunk) => {
      serverOutput += chunk;
      if (serverOutput.includes("Ready in")) { clearTimeout(timeout); resolve(); }
    };
    server.stdout.on("data", collect);
    server.stderr.on("data", collect);
    server.once("error", (error) => { clearTimeout(timeout); reject(error); });
    server.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`Server exited (${code}):\n${serverOutput}`)); });
  });
}, { timeout: 180_000 });

after(async () => {
  try {
    await Promise.all([...children.keys()].map(stopChild));
  } finally {
    if (databaseServer?.listening) await new Promise((resolve) => databaseServer.close(resolve));
    if (fixture) await rm(fixture, { recursive: true, force: true });
  }
});

test("published Puck content is reused across requests and expires immediately after HTTP publication", async () => {
  const homeUrl = new URL("/published", url);
  const publishUrl = new URL("/api/pages/home", url);
  published.set("home", { content: [{ type: "Text", props: { id: "title", text: "Original published title" } }], root: {} });
  const read = () => fetch(homeUrl, { headers: { "user-agent": "Twitterbot/1.0" }, signal: AbortSignal.timeout(15_000) }).then(async (response) => {
    assert.equal(response.status, 200);
    return response.text();
  });
  assert.match(await read(), /<h1>Original published title<\/h1>/);
  const firstReads = pageReads.get("home");
  assert.equal(firstReads, 1);
  assert.match(await read(), /<h1>Original published title<\/h1>/);
  assert.equal(pageReads.get("home"), firstReads, "A second visitor must not query Supabase again");

  const response = await fetch(publishUrl, {
    method: "POST",
    headers: { authorization: "Bearer fixture-publish-key", "content-type": "application/json" },
    body: JSON.stringify({ content: [{ type: "Text", props: { id: "title", text: "New published title" } }], root: {} }),
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, 200);
  assert.match(await read(), /<h1>New published title<\/h1>/);
  assert.equal(pageReads.get("home"), firstReads + 1);
});

test("a failed Puck read does not cache a fallback over recovered published content", async () => {
  const pageId = "retry-after-outage";
  const pageUrl = new URL(`/published?page=${pageId}`, url);
  failingReads.add(pageId);
  const read = () => fetch(pageUrl, { headers: { "user-agent": "Twitterbot/1.0" }, signal: AbortSignal.timeout(15_000) }).then((response) => response.text());
  assert.match(await read(), /<h1>No published content<\/h1>/);
  failingReads.delete(pageId);
  published.set(pageId, { content: [{ type: "Text", props: { id: "title", text: "Recovered published content" } }], root: {} });
  assert.match(await read(), /<h1>Recovered published content<\/h1>/);
});

for (const [label, userAgent] of [
  ["browser", "Mozilla/5.0 Chrome/124.0.0.0 Safari/537.36"],
  ["Googlebot", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"],
  ["Googlebot Smartphone", "Mozilla/5.0 Googlebot Smartphone"],
  ["Twitterbot", "Twitterbot/1.0"],
  ["custom HTML-limited bot", "MySpecialBot/1.0"],
]) {
  test(`PPR resume preserves server-rendered metadata and content for ${label}`, async () => {
    const outputStart = serverOutput.length;
    const response = await fetch(url, {
      method: "POST",
      headers: { "x-matched-path": "/dynamic", "next-resume": "1", "user-agent": userAgent },
      body: postponed,
      signal: AbortSignal.timeout(15_000),
    });
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.doesNotMatch(serverOutput.slice(outputStart), /Expected the resume to render/);
    assert.ok(/<title>Resumed product title<\/title>/.test(html), "Resume must include an HTML title");
    assert.ok(/<meta name="description" content="Resumed product description"/.test(html), "Resume must include an HTML description");
    assert.ok(/<link rel="canonical" href="https:\/\/example.com\/dynamic"/.test(html), "Resume must include an HTML canonical link");
    assert.ok(/<h1>Resumed product content<\/h1>/.test(html), "Resume must include HTML product content");
    assert.ok(!/\$RX\(|data-dgst=/.test(html), "Resume must not fall back to client rendering");
  });
}

for (const userAgent of ["Googlebot/2.1", "Twitterbot/1.0"]) {
  test(`single-pass ${userAgent} render keeps blocking metadata in the head`, async () => {
    const response = await fetch(url, { headers: { "user-agent": userAgent }, signal: AbortSignal.timeout(15_000) });
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.ok(/<head>[\s\S]*<title>Resumed product title<\/title>[\s\S]*<\/head>/.test(html));
    assert.ok(/<h1>Resumed product content<\/h1>/.test(html));
    assert.ok(!/\$RX\(|data-dgst=/.test(html));
  });
}

test("ordinary browser GET still serves the cached PPR shell", async () => {
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 Chrome/124.0.0.0 Safari/537.36" }, signal: AbortSignal.timeout(15_000) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("x-nextjs-postponed") ?? "", /^(1|2)$/);
  const html = await response.text();
  assert.ok(html.includes("Loading dynamic content"), "Browser shell must retain its postponed fallback");
  assert.ok(!html.includes("<h1>Resumed product content</h1>"), "Minimal-mode GET must serve the shell for browsers");
});
