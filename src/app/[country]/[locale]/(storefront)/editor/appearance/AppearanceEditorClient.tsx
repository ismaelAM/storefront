"use client";

import type { Data } from "@puckeditor/core";
import { EditorSectionNav } from "@/components/puck/EditorSectionNav";
import { saveSitePageData } from "@/lib/puck/save-site-page-data";

function getAppearance(data: Data) {
  const props = data.content.find((item) => item.type === "Appearance")?.props as
    | Record<string, string>
    | undefined;

  return {
    headerBackground: props?.headerBackground ?? "#ffffff",
    headerText: props?.headerText ?? "#111827",
    headerBorder: props?.headerBorder ?? "#e5e7eb",
    footerBackground: props?.footerBackground ?? "#111827",
    footerText: props?.footerText ?? "#d1d5db",
    footerHeading: props?.footerHeading ?? "#f3f4f6",
    pageBackground: props?.pageBackground ?? "#ffffff",
    accentColor: props?.accentColor ?? "#111827",
  };
}

export function AppearanceEditorClient({
  initialData,
  basePath,
}: {
  initialData: Data;
  basePath: string;
}) {
  const initial = getAppearance(initialData);

  async function save(formData: FormData) {
    const next = {
      headerBackground: String(formData.get("headerBackground") ?? initial.headerBackground),
      headerText: String(formData.get("headerText") ?? initial.headerText),
      headerBorder: String(formData.get("headerBorder") ?? initial.headerBorder),
      footerBackground: String(formData.get("footerBackground") ?? initial.footerBackground),
      footerText: String(formData.get("footerText") ?? initial.footerText),
      footerHeading: String(formData.get("footerHeading") ?? initial.footerHeading),
      pageBackground: String(formData.get("pageBackground") ?? initial.pageBackground),
      accentColor: String(formData.get("accentColor") ?? initial.accentColor),
    };

    await saveSitePageData("appearance", {
      content: [{ type: "Appearance", props: { id: "appearance", ...next } }],
      root: {},
    });
  }

  const colorFields = [
    ["accentColor", "Color principal", initial.accentColor],
    ["headerBackground", "Fondo del header", initial.headerBackground],
    ["headerText", "Texto e iconos del header", initial.headerText],
    ["headerBorder", "Borde del header", initial.headerBorder],
    ["footerBackground", "Fondo del footer", initial.footerBackground],
    ["footerText", "Texto del footer", initial.footerText],
    ["footerHeading", "Títulos del footer", initial.footerHeading],
    ["pageBackground", "Fondo general", initial.pageBackground],
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50">
      <EditorSectionNav basePath={basePath} />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-bold text-gray-900">Apariencia</h1>
        <p className="mt-2 text-gray-600">
          Cambia los colores globales del header, footer, fondo y elementos principales de la tienda.
        </p>

        <form action={save} className="mt-8 space-y-6 rounded-xl border bg-white p-6">
          {colorFields.map(([name, label, value]) => (
            <label key={name} className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-gray-800">{label}</span>
              <span className="flex items-center gap-3">
                <input
                  type="color"
                  name={name}
                  defaultValue={value}
                  className="h-10 w-14 cursor-pointer rounded border border-gray-300 bg-white p-1"
                />
                <span className="w-20 text-xs font-mono text-gray-500">{value}</span>
              </span>
            </label>
          ))}

          <button
            type="submit"
            className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Guardar colores
          </button>
        </form>
      </main>
    </div>
  );
}
