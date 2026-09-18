import { loadEnvFile } from "node:process";
import { resolve } from "node:path";

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
