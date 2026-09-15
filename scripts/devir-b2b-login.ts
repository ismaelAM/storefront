import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "@playwright/test";

const statePath = resolve(
  process.env.DEVIR_B2B_STATE_PATH ?? ".secrets/devir-b2b-state.json",
);
const loginUrl =
  process.env.DEVIR_B2B_LOGIN_URL ??
  "https://b2bdevir.es/customer/account/login/";

async function waitForEnter(): Promise<void> {
  process.stdin.setEncoding("utf8");
  await new Promise<void>((resolvePromise) => {
    process.stdin.once("data", () => resolvePromise());
  });
}

async function main(): Promise<void> {
  await mkdir(dirname(statePath), { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`Abriendo ${loginUrl}`);
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
  console.log(
    "Inicia sesión en Devir B2B en la ventana del navegador. Cuando hayas terminado, vuelve aquí y pulsa Enter.",
  );
  await waitForEnter();

  await context.storageState({ path: statePath });
  await browser.close();
  console.log(`Sesión guardada en ${statePath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
