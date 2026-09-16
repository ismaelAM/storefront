import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";

const profilePath = resolve(
  process.env.DEVIR_B2B_PROFILE_DIR ?? ".secrets/devir-b2b-profile",
);
const statePath = resolve(
  process.env.DEVIR_B2B_STATE_PATH ?? ".secrets/devir-b2b-state.json",
);
const accountUrl = "https://b2bdevir.es/customer/account/";
const defaultLoginUrl = "https://b2bdevir.es/customer/account/login";
const controlPort = Number(process.env.DEVIR_B2B_LOGIN_PORT ?? "8787");

async function waitForEnter(message: string): Promise<string> {
  process.stdin.setEncoding("utf8");
  return await new Promise<string>((resolvePromise) => {
    process.stdout.write(message);
    process.stdin.once("data", (input) => resolvePromise(input.trim()));
  });
}

async function getLoginDiagnostics(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const selectors = [
      ".message-error",
      ".messages .message",
      "[data-ui-id='message-error']",
      ".field-error",
      ".mage-error",
    ];
    const messages = selectors.flatMap((selector) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector)).map((node) =>
        node.textContent?.replace(/\s+/g, " ").trim() ?? "",
      ),
    );
    const uniqueMessages = Array.from(new Set(messages.filter(Boolean)));
    if (uniqueMessages.length > 0) return uniqueMessages;

    const bodyText = document.body?.innerText?.replace(/\s+/g, " ").trim() ?? "";
    return bodyText ? [bodyText.slice(0, 1000)] : [];
  });
}

async function hasAuthenticatedCustomer(page: Page): Promise<boolean> {
  const hasLogoutLink =
    (await page.locator(
      'a[href*="/customer/account/logout"], a[href*="/customer/account/logout/"]',
    ).count()) > 0;
  if (hasLogoutLink) return true;

  const hasCustomerSection = await page.evaluate(async () => {
    try {
      const response = await fetch("/customer/section/load/?sections=customer", {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return false;
      const payload = (await response.json()) as {
        customer?: {
          email?: string;
          firstname?: string;
          lastname?: string;
          fullname?: string;
        };
      };
      const customer = payload.customer;
      return Boolean(
        customer?.email ||
          customer?.firstname ||
          customer?.lastname ||
          customer?.fullname,
      );
    } catch {
      return false;
    }
  });
  return hasCustomerSection;
}

async function waitForAuthenticatedSession(page: Page): Promise<boolean> {
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => undefined);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (await hasAuthenticatedCustomer(page)) return true;
    if (page.url().includes("/customer/account/login")) {
      const diagnostics = await getLoginDiagnostics(page);
      if (diagnostics.length > 0) {
        console.error(`Devir mantiene la pantalla de login: ${diagnostics[0]}`);
        return false;
      }
    }
    console.log(`Comprobando sesión (${attempt + 1}/10)...`);
    await page.waitForTimeout(1000);
  }

  await page.goto(accountUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => undefined);

  return await hasAuthenticatedCustomer(page);
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolvePromise(body));
    request.on("error", reject);
  });
}

function writeJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function loginControlHtml(token: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Login B2B Devir</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;background:#111;color:#eee}
header{position:sticky;top:0;background:#181818;padding:10px;display:flex;gap:8px;align-items:center;z-index:2}
button{padding:8px 12px;border:0;border-radius:6px;cursor:pointer}
#done{background:#54b37a;color:#fff}#refresh{background:#444;color:#fff}
#status{font-size:13px;opacity:.8}
main{display:flex;justify-content:center;padding:12px}
#screen{max-width:100%;height:auto;cursor:crosshair}
#keyboard{position:fixed;left:-10000px;opacity:0}
</style>
</head>
<body>
<header>
<button id="done">He terminado el login</button>
<button id="refresh">Actualizar</button>
<span id="status">Cargando…</span>
</header>
<main><img id="screen" alt="Pantalla de Devir"></main>
<input id="keyboard" autocomplete="off" autofocus>
<script>
const token=${JSON.stringify(token)};
const qs="?token="+encodeURIComponent(token);
const img=document.getElementById("screen");
const input=document.getElementById("keyboard");
const status=document.getElementById("status");
async function refresh(){
  const r=await fetch("/api/screenshot"+qs,{cache:"no-store"});
  if(!r.ok){status.textContent="Error al obtener la pantalla";return}
  const blob=await r.blob();
  img.src=URL.createObjectURL(blob);
  status.textContent="Haz clic en los campos de Devir y escribe normalmente. La sesión no se almacena en esta interfaz.";
}
img.addEventListener("click",async e=>{
  const rect=img.getBoundingClientRect();
  const x=(e.clientX-rect.left)*(img.naturalWidth/rect.width);
  const y=(e.clientY-rect.top)*(img.naturalHeight/rect.height);
  await fetch("/api/click"+qs,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({x,y})});
  input.focus();
  await refresh();
});
input.addEventListener("input",async()=>{
  const text=input.value;
  if(!text)return;
  input.value="";
  await fetch("/api/type"+qs,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text})});
  await refresh();
});
input.addEventListener("keydown",async e=>{
  const keys={Enter:"Enter",Tab:"Tab",Backspace:"Backspace",Delete:"Delete"," ":"Space",ArrowLeft:"ArrowLeft",ArrowRight:"ArrowRight",ArrowUp:"ArrowUp",ArrowDown:"ArrowDown"};
  if(!keys[e.key])return;
  e.preventDefault();
  await fetch("/api/key"+qs,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:keys[e.key]})});
  await refresh();
});
document.getElementById("refresh").onclick=refresh;
document.getElementById("done").onclick=async()=>{
  await fetch("/api/done"+qs,{method:"POST"});
  status.textContent="Comprobando la sesión…";
};
refresh();
setInterval(refresh,1500);
input.focus();
</script>
</body>
</html>`;
}

async function startLoginControl(page: Page): Promise<void> {
  const token = randomBytes(24).toString("hex");
  let finish!: () => void;
  const finished = new Promise<void>((resolvePromise) => {
    finish = resolvePromise;
  });

  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", `http://127.0.0.1:${controlPort}`);
      if (requestUrl.searchParams.get("token") !== token) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        response.end(loginControlHtml(token));
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/screenshot") {
        const screenshot = await page.screenshot({ type: "png" });
        response.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
        response.end(screenshot);
        return;
      }

      const body =
        request.method === "POST" && requestUrl.pathname !== "/api/done"
          ? JSON.parse(await readRequestBody(request))
          : {};
      if (request.method === "POST" && requestUrl.pathname === "/api/click") {
        await page.mouse.click(Number(body.x), Number(body.y));
        writeJson(response, 200, { ok: true });
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/api/type") {
        await page.keyboard.insertText(String(body.text ?? ""));
        writeJson(response, 200, { ok: true });
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/api/key") {
        await page.keyboard.press(String(body.key));
        writeJson(response, 200, { ok: true });
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/api/done") {
        writeJson(response, 200, { ok: true });
        finish();
        return;
      }

      writeJson(response, 404, { error: "Not found" });
    } catch (error) {
      writeJson(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(controlPort, "0.0.0.0", () => resolvePromise());
  });

  const localUrl = `http://127.0.0.1:${controlPort}/?token=${token}`;
  const codespaceName = process.env.CODESPACE_NAME;
  const forwardedUrl = codespaceName
    ? `https://${codespaceName}-${controlPort}.app.github.dev/?token=${token}`
    : null;

  console.log("");
  console.log("=== Login B2B Devir interactivo ===");
  console.log("Abre esta URL en tu navegador:");
  console.log(localUrl);
  if (forwardedUrl) console.log(`URL directa del Codespace: ${forwardedUrl}`);
  console.log("");
  console.log("Si la URL del Codespace no abre todavía, ve a Puertos → 8787 → Vista previa/Abrir en navegador.");
  console.log("Después haz el login manualmente y pulsa «He terminado el login».");
  console.log("No se registran usuario, contraseña ni texto escrito en el servidor.");
  console.log("");

  await finished;
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
}

async function main(): Promise<void> {
  await mkdir(dirname(statePath), { recursive: true });
  await mkdir(profilePath, { recursive: true });

  const hasDisplay = Boolean(process.env.DISPLAY);
  const forceHeadless = process.env.DEVIR_B2B_HEADLESS === "true";
  const headless = forceHeadless || !hasDisplay;
  const channel = process.env.DEVIR_B2B_BROWSER === "chrome" ? "chrome" : undefined;

  const context = await chromium.launchPersistentContext(profilePath, {
    headless,
    ...(channel ? { channel } : {}),
  });
  const existingPages = context.pages();
  const page = existingPages[0] ?? (await context.newPage());
  for (const existingPage of existingPages.slice(1)) {
    await existingPage.close();
  }

  const loginUrlInput = process.env.DEVIR_B2B_LOGIN_URL?.trim();
  const loginUrl =
    loginUrlInput ||
    (await waitForEnter(
      `Pega la URL actual de login de Devir B2B [Enter para usar ${defaultLoginUrl}]: `,
    )) ||
    defaultLoginUrl;

  console.log(`Abriendo ${loginUrl}`);
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });

  if (headless) {
    await startLoginControl(page);
  } else {
    console.log(
      "Inicia sesión en Devir B2B en la ventana del navegador. Cuando hayas terminado y estés dentro de tu cuenta, vuelve aquí y pulsa Enter.",
    );
    await waitForEnter("");
  }

  const authenticated = await waitForAuthenticatedSession(page);
  if (!authenticated) {
    const diagnostics = await getLoginDiagnostics(page);
    const cookieNames = (await context.cookies())
      .filter((cookie) => cookie.domain.endsWith("devir.es"))
      .map((cookie) => cookie.name)
      .sort();
    console.error(
      `El login de Devir no ha quedado autenticado. URL final: ${page.url()}. Cookies Devir presentes: ${cookieNames.join(", ") || "ninguna"}.`,
    );
    if (diagnostics.length > 0) {
      console.error(`Respuesta visible de Devir: ${diagnostics[0]}`);
    }
    console.error(
      "La sesión no se guardará hasta que Devir devuelva un cliente autenticado.",
    );
    await context.close();
    process.exitCode = 1;
    return;
  }

  console.log(`Sesión autenticada en ${page.url()}`);
  await context.storageState({ path: statePath });
  console.log(`Sesión guardada en ${statePath}`);
  console.log(`Perfil persistente guardado en ${profilePath}`);
  await context.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});