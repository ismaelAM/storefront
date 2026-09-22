export function resolvePuckUrl(
  url: string | undefined,
  basePath: string,
): string {
  const value = url?.trim() ?? "";
  if (!value) return "#";

  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) {
    return value;
  }

  const normalizedBase = basePath.replace(/\/$/, "");
  const relativePath = value.startsWith("/") ? value : `/${value}`;

  if (
    relativePath === normalizedBase ||
    relativePath.startsWith(`${normalizedBase}/`)
  ) {
    return relativePath;
  }

  return `${normalizedBase}${relativePath}`;
}

export function isExternalPuckUrl(url: string | undefined): boolean {
  const value = url?.trim() ?? "";
  return /^(?:https?:|\/\/)/i.test(value);
}

export function getPuckGridColumnsClass(columns: "2" | "3" | "4"): string {
  switch (columns) {
    case "2":
      return "grid-cols-1 sm:grid-cols-2";
    case "3":
      return "grid-cols-2 sm:grid-cols-3";
    default:
      return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";
  }
}

export function getPuckAspectClass(aspect: "square" | "4/3" | "16/9"): string {
  switch (aspect) {
    case "4/3":
      return "aspect-[4/3]";
    case "16/9":
      return "aspect-video";
    default:
      return "aspect-square";
  }
}

export function getPuckRadiusClass(
  radius: "none" | "small" | "medium" | "large",
): string {
  switch (radius) {
    case "none":
      return "rounded-none";
    case "small":
      return "rounded-sm";
    case "large":
      return "rounded-2xl";
    default:
      return "rounded-lg";
  }
}

export type PuckDensity = "compact" | "normal" | "airy";

export function getPuckSectionPaddingClass(
  density: PuckDensity = "normal",
): string {
  switch (density) {
    case "compact":
      return "py-6 sm:py-8 lg:py-10";
    case "airy":
      return "py-10 sm:py-14 lg:py-16";
    default:
      return "py-8 sm:py-10 lg:py-12";
  }
}

export function getPuckHeroHeightClass(
  density: PuckDensity = "normal",
): string {
  switch (density) {
    case "compact":
      return "min-h-[340px] sm:min-h-[380px] lg:min-h-[420px]";
    case "airy":
      return "min-h-[500px] sm:min-h-[560px] lg:min-h-[640px]";
    default:
      return "min-h-[420px] sm:min-h-[470px] lg:min-h-[520px]";
  }
}

export function getPuckCategoryHeightClass(
  size: "small" | "medium" | "large" = "medium",
): string {
  switch (size) {
    case "small":
      return "min-h-[180px] sm:min-h-[220px]";
    case "large":
      return "min-h-[280px] sm:min-h-[340px] lg:min-h-[390px]";
    default:
      return "min-h-[220px] sm:min-h-[260px] lg:min-h-[300px]";
  }
}
