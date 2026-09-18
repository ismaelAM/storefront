import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv } from "./load-local-env";

loadLocalEnv();

const MASKED = new Set(["[SENSITIVE]", "[REDACTED]", "********", "*****"]);
const statePath = resolve(
  process.env.DEVIR_B2B_STATE_PATH ?? ".secrets/devir-b2b-state.json",
);

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

function client() {
  const url = required("SUPABASE_URL");
  const key = required("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function bootstrap(): Promise<void> {
  const supabase = client();
  const sessionState = JSON.parse(await readFile(statePath, "utf8")) as unknown;
  const spreeKey = required("DEVIR_B2B_SPREE_ADMIN_API_KEY", ["SPREE_ADMIN_API_KEY"]);
  const spreeUrl =
    env("SPREE_API_URL", ["DEVIR_B2B_SPREE_API_URL"]) ??
    "https://bisontcg.spree.sh";

  if (!spreeKey.startsWith("sk_")) {
    throw new Error("La clave de Spree debe ser una Secret API Key sk_....");
  }

  const { error } = await supabase
    .from("devir_sync_config")
    .update({
      enabled: true,
      base_url: process.env.DEVIR_B2B_BASE_URL ?? "https://b2bdevir.es",
      spree_api_url: spreeUrl,
      spree_admin_api_key: spreeKey,
      session_state: sessionState,
      phase: "idle",
      active_cycle_id: null,
      next_due_at: new Date().toISOString(),
      lock_until: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "primary");

  if (error) throw error;

  console.log("Cloud sync activada.");
  console.log("  Sesión Devir: subida de forma privada a Supabase.");
  console.log("  Clave Spree: guardada en configuración privada; no se ha mostrado.");
  console.log("  Próximo ciclo: en el siguiente tick de Supabase Cron.");
  console.log("  Frecuencia: cada 6 h entre ciclos completos.");
  console.log("Ejecuta `pnpm devir:cloud:status` para ver el progreso.");
}

async function status(): Promise<void> {
  const supabase = client();
  const [{ data: config, error: configError }, { data: cycles, error: cyclesError }] =
    await Promise.all([
      supabase
        .from("devir_sync_config")
        .select(
          "enabled,phase,active_cycle_id,next_due_at,last_attempt_at,last_success_at,last_error,interval_hours,batch_size,max_pages",
        )
        .eq("id", "primary")
        .single(),
      supabase
        .from("devir_sync_cycles")
        .select(
          "id,status,started_at,finished_at,category_count,product_count,processed_count,error_count,error",
        )
        .order("started_at", { ascending: false })
        .limit(5),
    ]);

  if (configError) throw configError;
  if (cyclesError) throw cyclesError;

  let pending = 0;
  let done = 0;
  let errors = 0;
  if (config.active_cycle_id) {
    const [p, d, e] = await Promise.all([
      supabase
        .from("devir_sync_jobs")
        .select("*", { count: "exact", head: true })
        .eq("cycle_id", config.active_cycle_id)
        .eq("status", "pending"),
      supabase
        .from("devir_sync_jobs")
        .select("*", { count: "exact", head: true })
        .eq("cycle_id", config.active_cycle_id)
        .eq("status", "done"),
      supabase
        .from("devir_sync_jobs")
        .select("*", { count: "exact", head: true })
        .eq("cycle_id", config.active_cycle_id)
        .eq("status", "error"),
    ]);
    pending = p.count ?? 0;
    done = d.count ?? 0;
    errors = e.count ?? 0;
  }

  console.log("Devir Cloud Sync");
  console.log(`  enabled: ${config.enabled}`);
  console.log(`  fase: ${config.phase}`);
  console.log(`  ciclo activo: ${config.active_cycle_id ?? "ninguno"}`);
  console.log(`  jobs: ${done} done · ${pending} pending · ${errors} error`);
  console.log(`  próximo ciclo: ${config.next_due_at}`);
  console.log(`  último intento: ${config.last_attempt_at ?? "—"}`);
  console.log(`  último éxito: ${config.last_success_at ?? "—"}`);
  if (config.last_error) console.log(`  último error: ${config.last_error}`);

  if (cycles?.length) {
    console.log("\nÚltimos ciclos:");
    for (const cycle of cycles) {
      console.log(
        `  ${cycle.status.toUpperCase().padEnd(7)} ${cycle.started_at} · productos ${cycle.product_count} · errores ${cycle.error_count}`,
      );
    }
  }
}

async function setEnabled(enabled: boolean): Promise<void> {
  const supabase = client();
  const { error } = await supabase
    .from("devir_sync_config")
    .update({
      enabled,
      ...(enabled ? { next_due_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", "primary");
  if (error) throw error;
  console.log(enabled ? "Cloud sync activada." : "Cloud sync pausada.");
}

async function runNow(): Promise<void> {
  const supabase = client();
  const { data: config, error: readError } = await supabase
    .from("devir_sync_config")
    .select("active_cycle_id")
    .eq("id", "primary")
    .single();
  if (readError) throw readError;
  if (config.active_cycle_id) {
    console.log(`Ya hay un ciclo activo: ${config.active_cycle_id}`);
    return;
  }
  const { error } = await supabase
    .from("devir_sync_config")
    .update({
      enabled: true,
      phase: "idle",
      next_due_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "primary");
  if (error) throw error;
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
