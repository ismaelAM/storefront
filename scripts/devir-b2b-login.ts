import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "@playwright/test";

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

async function main(): Promise<void> {
  await mkdir(dirname(statePath), { recursive: true });
  await mkdir(profilePath, { recursive: true });

  const context = await chromium.launchPersistentContext(profilePath, {
    headless: false,
  });
  const page = await context.newPage();

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

  await page.goto(accountUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  const loginFormPresent =
    (await page.locator('input[name="login[username]"]').count()) > 0;
  if (loginFormPresent || page.url().includes("/customer/account/login")) {
    console.error(
      "El login de Devir no ha quedado autenticado. Completa el inicio de sesión en el navegador y vuelve a ejecutar este comando.",
    );
    await context.close();
    process.exitCode = 1;
    return;
  }

  await context.storageState({ path: statePath });
  console.log(`Sesión guardada en ${statePath}`);
  console.log(`Perfil persistente guardado en ${profilePath}`);
  await context.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
