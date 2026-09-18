import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadLocalEnv } from "./load-local-env";

loadLocalEnv();

const MASKED = new Set(["[SENSITIVE]", "[REDACTED]", "********", "*****"]);
const statePath = resolve(
  process.env.DEVIR_B2B_STATE_PATH ?? ".secrets/devir-b2b-state.json",
);
const cloudUrl =
  process.env.DEVIR_CLOUD_WORKER_URL ??
  "https://ikglqbjlbkbaronbiryl.supabase.co/functions/v1/devir-sync";

function env(name: string, fallbacks: string[] = []): string | null {
  for (const key of [name, ...fallbacks]) {
    const value = process.env[key]?.trim();
    if (value && !MASKED.has(value.toUpperCase())) return value;
  }
  return null;
}

function required(name: string, fallbacks: string[] = []): string {
  const value = env(name, fallbacks);
  if (value) return value;
  throw new Error(
    `Falta ${name}${fallbacks.length ? ` (también se acepta ${fallbacks.join(", ")})` : ""}. No pegues secretos en el chat.`,
  );
}

function spreeKey(): string {
  const key = required("DEVIR_B2B_SPREE_ADMIN_API_KEY", ["SPREE_ADMIN_API_KEY"]);
  if (!key.startsWith("sk_")) {
    throw new Error("La clave de Spree debe ser una Secret API Key sk_....");
  }
  return key;
}

async function callCloud(
  action: "bootstrap" | "status" | "enable" | "disable" | "run-now",
  body: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const response = await fetch(cloudUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-spree-admin-key": spreeKey(),
    },
    body: JSON.stringify({ action, ...body }),
  });
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    payload = { error: text.slice(0, 500) };
  }
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : `Cloud worker HTTP ${response.status}`,
    );
  }
  return payload;
}

async function bootstrap(): Promise<void> {
  const sessionState = JSON.parse(await readFile(statePath, "utf8")) as unknown;
  const spreeUrl =
    env("SPREE_API_URL", ["DEVIR_B2B_SPREE_API_URL"]) ??
    "https://bisontcg.spree.sh";

  const result = await callCloud("bootstrap", {
    sessionState,
    spreeApiUrl: spreeUrl,
    baseUrl: process.env.DEVIR_B2B_BASE_URL ?? "https://b2bdevir.es",
  });

  console.log("Cloud sync activada.");
  console.log("  Sesión Devir: validada y guardada de forma privada en Supabase.");
  console.log("  Clave Spree: validada contra Spree y guardada; no se ha mostrado.");
  console.log("  Próximo ciclo: solicitado inmediatamente.");
  console.log("  Frecuencia: cada 6 h entre ciclos completos.");
  if (typeof result.message === "string") console.log("  " + result.message);
  console.log("Ejecuta `pnpm devir:cloud:status` para ver el progreso.");
}

async function status(): Promise<void> {
  const payload = await callCloud("status");
  const config = (payload.config ?? {}) as Record<string, unknown>;
  const jobs = (payload.jobs ?? {}) as Record<string, unknown>;
  const cycles = Array.isArray(payload.cycles)
    ? (payload.cycles as Array<Record<string, unknown>>)
    : [];

  console.log("Devir Cloud Sync");
  console.log(`  enabled: ${String(config.enabled ?? "—")}`);
  console.log(`  fase: ${String(config.phase ?? "—")}`);
  console.log(`  ciclo activo: ${String(config.active_cycle_id ?? "ninguno")}`);
  console.log(
    `  jobs: ${String(jobs.done ?? 0)} done · ${String(jobs.pending ?? 0)} pending · ${String(jobs.error ?? 0)} error`,
  );
  console.log(`  próximo ciclo: ${String(config.next_due_at ?? "—")}`);
  console.log(`  último intento: ${String(config.last_attempt_at ?? "—")}`);
  console.log(`  último éxito: ${String(config.last_success_at ?? "—")}`);
  if (config.last_error) console.log(`  último error: ${String(config.last_error)}`);

  if (cycles.length) {
    console.log("\nÚltimos ciclos:");
    for (const cycle of cycles) {
      console.log(
        `  ${String(cycle.status ?? "?").toUpperCase().padEnd(7)} ${String(cycle.started_at ?? "—")} · productos ${String(cycle.product_count ?? 0)} · errores ${String(cycle.error_count ?? 0)}`,
      );
    }
  }
}

async function setEnabled(enabled: boolean): Promise<void> {
  await callCloud(enabled ? "enable" : "disable");
  console.log(enabled ? "Cloud sync activada." : "Cloud sync pausada.");
}

async function runNow(): Promise<void> {
  const result = await callCloud("run-now");
  if (typeof result.already_running === "string") {
    console.log(`Ya hay un ciclo activo: ${result.already_running}`);
    return;
  }
  console.log("Ciclo solicitado; Supabase Cron lo iniciará en el siguiente tick.");
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "status";
  if (command === "bootstrap") await bootstrap();
  else if (command === "status") await status();
  else if (command === "enable") await setEnabled(true);
  else if (command === "disable") await setEnabled(false);
  else if (command === "run-now") await runNow();
  else throw new Error("Uso: devir-cloud <bootstrap|status|enable|disable|run-now>");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
