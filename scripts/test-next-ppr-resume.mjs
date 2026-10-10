import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
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
    childProcess.once("close", (code) => {
      closedChildren.add(childProcess);
      resolve({ code });
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
  await mkdir(join(root, ".local"), { recursive: true });
  fixture = await mkdtemp(join(root, ".local/ppr-bot-resume-"));
  await cp(fixtureSource, fixture, { recursive: true });
  await symlink(join(root, "node_modules"), join(fixture, "node_modules"));
  await writeFile(join(fixture, "package.json"), JSON.stringify({ private: true }));
  await writeFile(join(fixture, "next.config.js"), `module.exports = {
    cacheComponents: true,
    htmlLimitedBots: new RegExp(${JSON.stringify(`${HTML_LIMITED_BOT_UA_RE.source}|Googlebot|MySpecialBot`)}, 'i'),
    turbopack: { root: ${JSON.stringify(root)} },
  };\n`);

  const build = child(process.execPath, [nextBin, "build", fixture, ...(process.env.PPR_TEST_WEBPACK ? ["--webpack"] : [])], {
    cwd: root,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  let output = "";
  build.stdout.on("data", (chunk) => { output += chunk; });
  build.stderr.on("data", (chunk) => { output += chunk; });
  try {
    const { code, error } = await waitForChild(build, 120_000);
    if (error) throw error;
    assert.equal(code, 0, `Fixture build failed:\n${output}`);
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
    env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXT_PRIVATE_TEST_HEADERS: "1" },
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
    if (fixture) await rm(fixture, { recursive: true, force: true });
  }
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
