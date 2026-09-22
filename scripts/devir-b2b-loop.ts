import { spawn } from "node:child_process";
import { loadLocalEnv } from "./load-local-env";

loadLocalEnv();

const intervalHours = Number(process.env.DEVIR_SYNC_INTERVAL_HOURS ?? "6");
const once = process.argv.includes("--once");
const hyper = process.argv.includes("--hyper");

if (
  !Number.isFinite(intervalHours) ||
  intervalHours <= 0 ||
  intervalHours > 168
) {
  throw new Error(
    "DEVIR_SYNC_INTERVAL_HOURS debe ser un número entre 0 y 168.",
  );
}

function run(command: string, args: string[]): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        console.error(`${command} terminó por señal ${signal}.`);
        resolvePromise(1);
        return;
      }
      resolvePromise(code ?? 1);
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function syncOnce(): Promise<boolean> {
  console.log(`\n=== Devir sync ${new Date().toISOString()} ===`);
  const scanCode = await run(
    "pnpm",
    hyper ? ["devir:scan", "--", "--hyper"] : ["devir:scan"],
  );
  if (scanCode !== 0) {
    console.error(
      "El scan no ha terminado correctamente. Si Devir ha caducado la sesión, ejecuta `pnpm devir:login`; no se intentará iniciar sesión automáticamente.",
    );
    return false;
  }

  const planCode = await run("pnpm", ["devir:import:dry-run"]);
  if (planCode !== 0) {
    console.error("No se ha podido generar el plan Devir → Spree.");
    return false;
  }

  const spreeCode = await run("pnpm", ["devir:spree:sync"]);
  if (spreeCode !== 0) {
    console.error(
      "El plan se ha generado, pero no se ha podido sincronizar a drafts de Spree. Comprueba write_products/write_settings y la configuración.",
    );
    return false;
  }

  console.log(
    "Sync completado: Devir → plan → drafts de Spree. Los REVIEW_REQUIRED siguen ocultos y nunca se activan automáticamente.",
  );
  return true;
}

async function main(): Promise<void> {
  if (once) {
    if (!(await syncOnce())) process.exitCode = 1;
    return;
  }

  console.log(
    `Sincronizador Devir ${hyper ? "HYPER " : ""}en modo continuo: ejecución inmediata y después cada ${intervalHours} h mientras este proceso y el Codespace sigan activos.`,
  );

  while (true) {
    const ok = await syncOnce();
    if (!ok) {
      console.error(
        "Se detiene el bucle para que intervenga el operador. Corrige la sesión/configuración y vuelve a ejecutar `pnpm devir:sync:watch`.",
      );
      process.exitCode = 1;
      return;
    }
    const nextRun = new Date(Date.now() + intervalHours * 60 * 60 * 1000);
    console.log(`Próxima lectura aproximada: ${nextRun.toISOString()}`);
    await sleep(intervalHours * 60 * 60 * 1000);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
