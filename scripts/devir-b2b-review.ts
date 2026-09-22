import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadLocalEnv } from "./load-local-env";

loadLocalEnv();

interface OperatorDecision {
  approved?: boolean;
  mode?: "approve" | "split" | "skip";
  category?: string;
  targetMargin?: number | null;
  retailPrice?: number | null;
  children?: Array<{
    sku: string;
    name: string;
    allocatedCost: number;
    category?: string;
    targetMargin?: number | null;
    retailPrice?: number | null;
  }>;
  note?: string;
}

interface ReviewQueueItem {
  supplierSku: string;
  supplierName: string;
  purchasePrice: number | null;
  inferredCategory: string | null;
  reasons: string[];
  packCandidate: boolean;
  suggestedDecision: OperatorDecision;
}

interface ReviewQueueFile {
  pending?: ReviewQueueItem[];
}

interface DecisionFile {
  version: number;
  updatedAt?: string;
  decisions: Record<string, OperatorDecision>;
}

const reviewQueuePath = resolve(
  process.env.DEVIR_B2B_REVIEW_QUEUE ?? ".local/devir-b2b-review-queue.json",
);
const decisionsPath = resolve(
  process.env.DEVIR_B2B_OPERATOR_DECISIONS ??
    ".local/devir-b2b-operator-decisions.json",
);

async function readJsonIfExists<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function main(): Promise<void> {
  const queue = JSON.parse(
    await readFile(reviewQueuePath, "utf8"),
  ) as ReviewQueueFile;
  const pending = queue.pending ?? [];
  const decisions = await readJsonIfExists<DecisionFile>(decisionsPath, {
    version: 1,
    decisions: {},
  });

  let created = 0;
  for (const item of pending) {
    if (decisions.decisions[item.supplierSku]) continue;
    decisions.decisions[item.supplierSku] = item.suggestedDecision;
    created += 1;
  }

  decisions.version = 1;
  decisions.updatedAt = new Date().toISOString();
  await mkdir(dirname(decisionsPath), { recursive: true });
  await writeFile(decisionsPath, JSON.stringify(decisions, null, 2));

  console.log(`Decisiones de operador: ${decisionsPath}`);
  console.log(
    `${pending.length} producto(s) requieren revisión; ${created} entrada(s) nuevas preparadas.`,
  );
  console.log("");
  console.log("Flujo:");
  console.log(
    "  1. Abre el JSON de decisiones y, para márgenes globales, `.local/devir-pricing-rules.json`.",
  );
  console.log(
    "  2. Para un producto normal, ajusta category/targetMargin o retailPrice y pon approved=true.",
  );
  console.log(
    "  3. Para un pack, deja mode=split y rellena children con SKU, nombre y allocatedCost.",
  );
  console.log(
    "  4. La suma de allocatedCost debe coincidir con el coste del pack de Devir.",
  );
  console.log(
    "  5. Ejecuta otra vez `pnpm devir:import:dry-run` para validar el plan.",
  );
  console.log("");
  console.log(
    "`approved=true` solo aprueba la propuesta; este flujo todavía NO escribe en Spree.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
