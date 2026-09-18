export const PALETTE_COLOR_OPTIONS = [
  { label: "Transparente", value: "transparent" },
  { label: "Principal", value: "var(--primary)" },
  { label: "Texto sobre principal", value: "var(--primary-foreground)" },
  { label: "Secundario", value: "var(--secondary)" },
  { label: "Texto sobre secundario", value: "var(--secondary-foreground)" },
  { label: "Fondo general", value: "var(--background)" },
  { label: "Superficie", value: "var(--surface)" },
  { label: "Superficie alternativa", value: "var(--surface-alt)" },
  { label: "Texto", value: "var(--text)" },
  { label: "Texto secundario", value: "var(--text-muted)" },
  { label: "Borde", value: "var(--border-color)" },
] as const;

export const DEFAULT_PALETTE_VALUES = {
  primary: "var(--primary)",
  primaryText: "var(--primary-foreground)",
  secondary: "var(--secondary)",
  secondaryText: "var(--secondary-foreground)",
  background: "var(--background)",
  surface: "var(--surface)",
  surfaceAlt: "var(--surface-alt)",
  text: "var(--text)",
  textMuted: "var(--text-muted)",
  border: "var(--border-color)",
} as const;
