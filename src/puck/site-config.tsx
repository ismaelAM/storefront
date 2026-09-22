"use client";

import type { Config } from "@puckeditor/core";
import { colorField } from "@/puck/fields";
import { DEFAULT_PALETTE_VALUES } from "@/puck/palette";

type CartChromeProps = {
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  backgroundColor: string;
  cardBackgroundColor: string;
  textColor: string;
  mutedTextColor: string;
  accentColor: string;
  maxWidth: "medium" | "large" | "full";
  radius: "none" | "medium" | "large";
  alignment: "left" | "center";
};

type PolicyChromeProps = {
  title: string;
  intro: string;
  backgroundColor: string;
  titleColor: string;
  textColor: string;
  contentWidth: "medium" | "large" | "full";
  alignment: "left" | "center";
  spacing: "compact" | "normal" | "large";
};

type SiteComponents = {
  CartChrome: CartChromeProps;
  PolicyChrome: PolicyChromeProps;
};

export const siteConfig: Config<SiteComponents> = {
  categories: {
    content: {
      title: "Tienda",
      components: ["CartChrome", "PolicyChrome"],
    },
  },
  components: {
    CartChrome: {
      label: "Carrito — apariencia",
      fields: {
        title: { type: "text", label: "Título" },
        emptyTitle: { type: "text", label: "Título carrito vacío" },
        emptyDescription: { type: "textarea", label: "Texto carrito vacío" },
        backgroundColor: colorField("Fondo de página"),
        cardBackgroundColor: colorField("Fondo de tarjetas"),
        textColor: colorField("Color de texto"),
        mutedTextColor: colorField("Color de texto secundario"),
        accentColor: colorField("Color principal"),
        maxWidth: {
          type: "select",
          label: "Ancho",
          options: [
            { label: "Medio", value: "medium" },
            { label: "Grande", value: "large" },
            { label: "Completo", value: "full" },
          ],
        },
        radius: {
          type: "select",
          label: "Redondeado",
          options: [
            { label: "Sin redondeo", value: "none" },
            { label: "Medio", value: "medium" },
            { label: "Grande", value: "large" },
          ],
        },
        alignment: {
          type: "select",
          label: "Alineación del título",
          options: [
            { label: "Izquierda", value: "left" },
            { label: "Centro", value: "center" },
          ],
        },
      },
      defaultProps: {
        title: "Carrito",
        emptyTitle: "Tu carrito está vacío",
        emptyDescription: "Añade productos para verlos aquí.",
        backgroundColor: DEFAULT_PALETTE_VALUES.background,
        cardBackgroundColor: DEFAULT_PALETTE_VALUES.surface,
        textColor: DEFAULT_PALETTE_VALUES.text,
        mutedTextColor: DEFAULT_PALETTE_VALUES.textMuted,
        accentColor: DEFAULT_PALETTE_VALUES.primary,
        maxWidth: "large",
        radius: "large",
        alignment: "left",
      },
      render: (props) => (
        <div
          className="w-full p-8"
          style={{
            backgroundColor: props.backgroundColor,
            color: props.textColor,
            textAlign: props.alignment,
          }}
        >
          <div className="mx-auto max-w-4xl">
            <h2 className="text-3xl font-bold">{props.title}</h2>
            <div
              className="mt-6 rounded-xl border p-8"
              style={{ backgroundColor: props.cardBackgroundColor }}
            >
              <p className="font-medium">{props.emptyTitle}</p>
              <p className="mt-2" style={{ color: props.mutedTextColor }}>
                {props.emptyDescription}
              </p>
            </div>
          </div>
        </div>
      ),
    },
    PolicyChrome: {
      label: "Página legal — apariencia",
      fields: {
        title: { type: "text", label: "Título" },
        intro: { type: "textarea", label: "Introducción" },
        backgroundColor: colorField("Color de fondo"),
        titleColor: colorField("Color del título"),
        textColor: colorField("Color del texto"),
        contentWidth: {
          type: "select",
          label: "Ancho del contenido",
          options: [
            { label: "Medio", value: "medium" },
            { label: "Grande", value: "large" },
            { label: "Completo", value: "full" },
          ],
        },
        alignment: {
          type: "select",
          label: "Alineación",
          options: [
            { label: "Izquierda", value: "left" },
            { label: "Centro", value: "center" },
          ],
        },
        spacing: {
          type: "select",
          label: "Espaciado",
          options: [
            { label: "Compacto", value: "compact" },
            { label: "Normal", value: "normal" },
            { label: "Amplio", value: "large" },
          ],
        },
      },
      defaultProps: {
        title: "",
        intro: "",
        backgroundColor: DEFAULT_PALETTE_VALUES.background,
        titleColor: DEFAULT_PALETTE_VALUES.text,
        textColor: DEFAULT_PALETTE_VALUES.textMuted,
        contentWidth: "large",
        alignment: "left",
        spacing: "large",
      },
      render: (props) => (
        <div
          className="w-full px-6 py-10"
          style={{
            backgroundColor: props.backgroundColor,
            color: props.textColor,
            textAlign: props.alignment,
          }}
        >
          <div className="mx-auto max-w-4xl">
            <h2
              className="text-3xl font-bold"
              style={{ color: props.titleColor }}
            >
              {props.title || "Página legal"}
            </h2>
            {props.intro && <p className="mt-3">{props.intro}</p>}
            <div className="mt-8 rounded-xl border p-6 text-left">
              El contenido legal real de Spree aparecerá aquí.
            </div>
          </div>
        </div>
      ),
    },
  },
};
