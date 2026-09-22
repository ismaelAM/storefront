"use client";

import type { ComponentType } from "react";

interface ProductLayoutProps {
  backgroundColor: string;
  width: "medium" | "large" | "full";
  alignment: "left" | "center" | "right";
  padding: "small" | "medium" | "large";
}

interface ProductColumnsProps {
  backgroundColor: string;
  gap: "small" | "medium" | "large";
  padding: "small" | "medium" | "large";
}

export function ProductLayoutBlock({
  backgroundColor,
  width,
  alignment,
  padding,
  Content,
}: ProductLayoutProps & { Content: ComponentType }) {
  const widthClass =
    width === "medium"
      ? "max-w-3xl"
      : width === "large"
        ? "max-w-5xl"
        : "max-w-none";
  const alignmentClass =
    alignment === "left"
      ? "mr-auto"
      : alignment === "right"
        ? "ml-auto"
        : "mx-auto";
  const paddingClass =
    padding === "small" ? "py-6" : padding === "large" ? "py-16" : "py-10";

  return (
    <section className={`w-full ${paddingClass}`} style={{ backgroundColor }}>
      <div
        className={`w-full px-4 sm:px-6 lg:px-8 ${widthClass} ${alignmentClass}`}
      >
        <Content />
      </div>
    </section>
  );
}

export function ProductColumnsBlock({
  backgroundColor,
  gap,
  padding,
  Left,
  Right,
}: ProductColumnsProps & {
  Left: ComponentType;
  Right: ComponentType;
}) {
  const gapClass =
    gap === "small" ? "gap-4" : gap === "large" ? "gap-12" : "gap-8";
  const paddingClass =
    padding === "small" ? "py-6" : padding === "large" ? "py-16" : "py-10";

  return (
    <section className={`w-full ${paddingClass}`} style={{ backgroundColor }}>
      <div
        className={`mx-auto grid w-full max-w-6xl grid-cols-1 px-4 sm:px-6 md:grid-cols-2 lg:px-8 ${gapClass}`}
      >
        <Left />
        <Right />
      </div>
    </section>
  );
}
