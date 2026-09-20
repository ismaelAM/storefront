"use client";

import type { Data } from "@puckeditor/core";
import { useState } from "react";
import { EditorSectionNav } from "@/components/puck/EditorSectionNav";
import { saveSitePageData } from "@/lib/puck/save-site-page-data";

const defaults = {
  accentColor: "#6b4423",
  accentText: "#fff8ea",
  highlightColor: "#6f8c95",
  highlightText: "#fffdf8",
  secondaryColor: "#eadfc9",
  secondaryText: "#4a3422",
  pageBackground: "#f6f0e3",
  surfaceColor: "#fffdf8",
  surfaceAltColor: "#efe2cb",
  textColor: "#3b2a1e",
  mutedTextColor: "#6f6258",
  borderColor: "#d8c8ae",
  headerBackground: "#f6f0e3",
  headerText: "#4a3422",
  headerBorder: "#d8c8ae",
  footerBackground: "#5a3822",
  footerText: "#eadfcb",
  footerHeading: "#fff8ea",
} as const;

type AppearanceValues = { [K in keyof typeof defaults]: string };

function getAppearance(data: Data): AppearanceValues {
  const props = data.content.find((item) => item.type === "Appearance")?.props as
    | Record<string, string>
    | undefined;

  return Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [key, props?.[key] ?? fallback]),
  ) as AppearanceValues;
}

function relativeLuminance(hex: string): number {
  const normalized = hex.replace("#", "");
  const rgb = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  const light = Math.max(a, b);
  const dark = Math.min(a, b);
  return (light + 0.05) / (dark + 0.05);
}

function ContrastCheck({
  label,
  foreground,
  background,
}: {
  label: string;
  foreground: string;
  background: string;
}) {
  const ratio = contrastRatio(foreground, background);
  const ok = ratio >= 4.5;
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
      {label}: {ratio.toFixed(2)}:1 · {ok ? "contraste correcto" : "revisar contraste (objetivo 4.5:1)"}
    </div>
  );
}

export function AppearanceEditorClient({
  initialData,
  basePath,
}: {
  initialData: Data;
  basePath: string;
}) {
  const initial = getAppearance(initialData);
  const [colors, setColors] = useState<AppearanceValues>(initial);

  async function save(formData: FormData) {
    const next = Object.fromEntries(
      Object.keys(defaults).map((key) => [
        key,
        String(formData.get(key) ?? colors[key as keyof AppearanceValues]),
      ]),
    ) as AppearanceValues;

    await saveSitePageData("appearance", {
      content: [{ type: "Appearance", props: { id: "appearance", ...next } }],
      root: {},
    });
  }

  const paletteFields = [
    ["accentColor", "Principal"],
    ["accentText", "Texto sobre principal"],
    ["highlightColor", "Acento puntual"],
    ["highlightText", "Texto sobre acento puntual"],
    ["secondaryColor", "Secundario"],
    ["secondaryText", "Texto sobre secundario"],
    ["pageBackground", "Fondo general"],
    ["surfaceColor", "Superficie"],
    ["surfaceAltColor", "Superficie alternativa"],
    ["textColor", "Texto principal"],
    ["mutedTextColor", "Texto secundario"],
    ["borderColor", "Bordes"],
  ] as const;

  const chromeFields = [
    ["headerBackground", "Fondo del header"],
    ["headerText", "Texto e iconos del header"],
    ["headerBorder", "Borde del header"],
    ["footerBackground", "Fondo del footer"],
    ["footerText", "Texto del footer"],
    ["footerHeading", "Títulos del footer"],
  ] as const;

  const renderFields = (fields: ReadonlyArray<readonly [keyof AppearanceValues, string]>) =>
    fields.map(([name, label]) => (
      <label key={name} className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-gray-800">{label}</span>
        <span className="flex items-center gap-3">
          <input
            type="color"
            name={name}
            value={colors[name]}
            onChange={(event) =>
              setColors((current) => ({ ...current, [name]: event.currentTarget.value }))
            }
            className="h-10 w-14 cursor-pointer rounded border border-gray-300 bg-white p-1"
          />
          <span className="w-20 text-xs font-mono text-gray-500">{colors[name]}</span>
        </span>
      </label>
    ));

  return (
    <div className="min-h-screen bg-gray-50">
      <EditorSectionNav basePath={basePath} />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-bold text-gray-900">Apariencia</h1>
        <p className="mt-2 text-gray-600">
          Define una paleta global. Los bloques Puck pueden reutilizar estos colores como tokens y seguir admitiendo colores personalizados cuando haga falta.
        </p>

        <form action={save} className="mt-8 space-y-8 rounded-xl border bg-white p-6">
          <section className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Paleta global</h2>
              <p className="mt-1 text-sm text-gray-500">
                Principal, superficies y tipografía forman la paleta reutilizable del editor.
              </p>
            </div>
            {renderFields(paletteFields)}
            <div className="grid gap-2 sm:grid-cols-2">
              <ContrastCheck label="Principal" foreground={colors.accentText} background={colors.accentColor} />
              <ContrastCheck label="Acento puntual" foreground={colors.highlightText} background={colors.highlightColor} />
              <ContrastCheck label="Secundario" foreground={colors.secondaryText} background={colors.secondaryColor} />
              <ContrastCheck label="Texto / fondo" foreground={colors.textColor} background={colors.pageBackground} />
              <ContrastCheck label="Texto secundario / superficie" foreground={colors.mutedTextColor} background={colors.surfaceColor} />
            </div>
          </section>

          <section className="space-y-5 border-t pt-7">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Header y footer</h2>
              <p className="mt-1 text-sm text-gray-500">
                Se mantienen como controles específicos porque forman parte de la carcasa de Spree.
              </p>
            </div>
            {renderFields(chromeFields)}
          </section>

          <button
            type="submit"
            className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Guardar paleta
          </button>
        </form>
      </main>
    </div>
  );
}
