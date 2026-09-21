import { readFile } from "node:fs/promises";
import { loadLocalEnv } from "./load-local-env";

loadLocalEnv();

const MASKED = new Set(["[SENSITIVE]", "[REDACTED]", "********", "*****"]);
const workerUrl =
  process.env.CATALOG_SYNC_WORKER_URL ??
  process.env.DEVIR_CLOUD_WORKER_URL ??
  "https://ikglqbjlbkbaronbiryl.supabase.co/functions/v1/devir-sync";

function usableEnv(name: string, fallbacks: string[] = []): string | null {
  for (const key of [name, ...fallbacks]) {
    const value = process.env[key]?.trim();
    if (value && !MASKED.has(value.toUpperCase())) return value;
  }
  return null;
}

function spreeKey(): string {
  const key = usableEnv("SPREE_ADMIN_API_KEY", [
    "DEVIR_B2B_SPREE_ADMIN_API_KEY",
  ]);
  if (!key?.startsWith("sk_")) {
    throw new Error(
      "Falta SPREE_ADMIN_API_KEY (Secret API Key sk_...). No pegues secretos en argumentos ni en Git.",
    );
  }
  return key;
}

async function callWorker(
  action:
    | "catalog-supplier-upsert"
    | "catalog-ingest"
    | "catalog-complete-run"
    | "catalog-sourcing-status",
  body: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-spree-admin-key": spreeKey(),
    },
    body: JSON.stringify({ action, ...body }),
  });
  const text = await response.text();
  let payload: Record<string, unknown>;
  try {
    payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    payload = { error: text.slice(0, 500) };
  }
  if (!response.ok || payload.ok === false) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : `Catalog worker HTTP ${response.status}`,
    );
  }
  return payload;
}

async function jsonFile(path: string): Promise<unknown> {
  if (!path) throw new Error("Falta la ruta del fichero JSON");
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function register(path: string): Promise<void> {
  const supplier = await jsonFile(path);
  if (!supplier || typeof supplier !== "object" || Array.isArray(supplier)) {
    throw new Error("El fichero de distribuidor debe contener un objeto JSON");
  }
  const result = await callWorker("catalog-supplier-upsert", {
    supplier: supplier as Record<string, unknown>,
  });
  console.log(JSON.stringify(result.supplier, null, 2));
}

async function ingest(
  supplierCode: string,
  path: string,
  runId?: string,
): Promise<void> {
  if (!supplierCode) throw new Error("Falta supplier-code");
  const document = await jsonFile(path);
  const items = Array.isArray(document)
    ? document
    : document &&
        typeof document === "object" &&
        Array.isArray((document as Record<string, unknown>).items)
      ? (document as Record<string, unknown>).items
      : null;
  if (!items)
    throw new Error("El fichero debe ser un array o un objeto con items[]");
  const result = await callWorker("catalog-ingest", {
    supplierCode,
    items,
    ...(runId ? { runId } : {}),
  });
  console.log(JSON.stringify(result, null, 2));
  if (Number(result.failed ?? 0) > 0) process.exitCode = 1;
}

async function complete(supplierCode: string, runId: string): Promise<void> {
  if (!supplierCode || !runId) {
    throw new Error("complete requiere supplier-code y run-id");
  }
  const result = await callWorker("catalog-complete-run", {
    supplierCode,
    runId,
  });
  console.log(JSON.stringify(result, null, 2));
}

async function status(): Promise<void> {
  const result = await callWorker("catalog-sourcing-status", { limit: 200 });
  console.log(JSON.stringify(result, null, 2));
}

async function main(): Promise<void> {
  const [command = "status", first = "", second = "", third] =
    process.argv.slice(2);
  if (command === "status") await status();
  else if (command === "register") await register(first);
  else if (command === "ingest") await ingest(first, second, third);
  else if (command === "complete") await complete(first, second);
  else {
    throw new Error(
      "Uso: catalog-sourcing <status|register FILE|ingest SUPPLIER FILE [RUN_ID]|complete SUPPLIER RUN_ID>",
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
