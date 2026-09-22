import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

export function loadLocalEnv(): string | null {
  const envPath = resolve(process.env.DEVIR_ENV_FILE ?? ".env.local");
  try {
    loadEnvFile(envPath);
    return envPath;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
