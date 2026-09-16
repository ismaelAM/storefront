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

async function waitForEnter(message: string): Promise<string> {
  process.stdin.setEncoding("utf8");
  return await new Promise<string>((resolvePromise) => {
    process.stdout.write(message);
    process.stdin.once("data", (input) => resolvePromise(input.trim()));
  });
}

async function hasAuthenticatedCustomer(page: Page): Promise<boolean> {
  const loginFormPresent =
    (await page.locator('input[name="login[username]"]').count()) > 0;
  if (loginFormPresent) return false;

  const hasLogoutLink =
    (await page.locator(
      'a[href*="/customer/account/logout"], a[href*="/customer/account/logout/"]',
    ).count()) > 0;
  if (hasLogoutLink) return true;

  return await page.evaluate(async () => {
    try {
      const response = await fetch(
        "/customer/section/load/?sections=customer",
        {
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        },
      );
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
}

async function waitForAuthenticatedSession(page: Page): Promise<boolean> {
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => undefined);

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await hasAuthenticatedCustomer(page)) return true;
    await page.waitForTimeout(1000);
  }

  await page.goto(accountUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => undefined);

  return await hasAuthenticatedCustomer(page);
}

async function main(): Promise<void> {
  await mkdir(dirname(statePath), { recursive: true });
  await mkdir(profilePath, { recursive: true });

  const context = await chromium.launchPersistentContext(profilePath, {
    headless: false,
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
  console.log(
    "Inicia sesión en Devir B2B en la ventana del navegador. Cuando hayas terminado y estés dentro de tu cuenta, vuelve aquí y pulsa Enter.",
  );
  await waitForEnter("");

  const authenticated = await waitForAuthenticatedSession(page);
  if (!authenticated) {
    const cookieNames = (await context.cookies())
      .filter((cookie) => cookie.domain.endsWith("devir.es"))
      .map((cookie) => cookie.name)
      .sort();
    console.error(
      `El login de Devir no ha quedado autenticado. URL final: ${page.url()}. Cookies Devir presentes: ${cookieNames.join(", ") || "ninguna"}.`,
    );
    console.error(
      "La sesión no se guardará hasta que Devir devuelva un cliente autenticado. Completa el login en la ventana y vuelve a ejecutar este comando.",
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
