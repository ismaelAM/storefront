import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "puck_editor_auth";
const COOKIE_VALUE = "bison-tcg-puck-editor-v1";
const PASSWORD_ENV = "PUCK_EDITOR_PASSWORD";

function getPassword() {
  return process.env[PASSWORD_ENV] ?? "";
}

function buildToken(password: string) {
  return createHmac("sha256", password).update(COOKIE_VALUE).digest("hex");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export async function isPuckEditorAuthenticated() {
  const password = getPassword();
  if (!password) return false;

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return false;

  return safeEqual(token, buildToken(password));
}

export async function assertPuckEditorAccess() {
  if (!(await isPuckEditorAuthenticated())) {
    throw new Error("Unauthorized: Puck editor access is required");
  }
}

export async function authenticatePuckEditor(password: string) {
  const configuredPassword = getPassword();
  if (!configuredPassword || !safeEqual(password, configuredPassword)) {
    return false;
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, buildToken(configuredPassword), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return true;
}
