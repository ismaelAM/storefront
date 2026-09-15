import { authenticatePuckEditor, isPuckEditorAuthenticated } from "@/lib/puck/editor-auth";

async function login(formData: FormData): Promise<void> {
  "use server";

  const password = String(formData.get("password") ?? "");
  await authenticatePuckEditor(password);
}

export default async function EditorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const authenticated = await isPuckEditorAuthenticated();

  if (!authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
          <div className="mb-6">
            <p className="text-sm font-medium text-muted-foreground">BisonTCG</p>
            <h1 className="mt-1 text-2xl font-semibold">Editor protegido</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Introduce la contraseña de administrador para acceder a Puck.
            </p>
          </div>
          <form action={login} className="space-y-4">
            <input
              aria-label="Contraseña de administrador"
              autoComplete="current-password"
              className="w-full rounded-lg border bg-background px-3 py-2 outline-none ring-offset-background focus:ring-2"
              name="password"
              placeholder="Contraseña"
              required
              type="password"
            />
            <button
              className="w-full rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
              type="submit"
            >
              Entrar
            </button>
          </form>
        </div>
      </main>
    );
  }

  return children;
}
