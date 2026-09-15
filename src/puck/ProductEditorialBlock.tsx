"use client";

import Link from "next/link";

interface ProductEditorialBlockProps {
  title: string;
  text: string;
  image: string;
  buttonText: string;
  buttonUrl: string;
  backgroundColor: string;
  titleColor: string;
  textColor: string;
  buttonColor: string;
  buttonTextColor: string;
  alignment: "left" | "center" | "right";
  width: "small" | "medium" | "large" | "full";
  position: "top" | "center" | "bottom";
  padding: "small" | "medium" | "large";
  imagePosition: "top" | "left" | "right" | "bottom";
  borderRadius: "none" | "small" | "medium" | "large";
}

export function ProductEditorialBlock({
  title,
  text,
  image,
  buttonText,
  buttonUrl,
  backgroundColor,
  titleColor,
  textColor,
  buttonColor,
  buttonTextColor,
  alignment,
  width,
  position,
  padding,
  imagePosition,
  borderRadius,
}: ProductEditorialBlockProps) {
  const widthClass =
    width === "small"
      ? "max-w-xl"
      : width === "medium"
        ? "max-w-3xl"
        : width === "large"
          ? "max-w-5xl"
          : "max-w-none";

  const alignmentClass =
    alignment === "left"
      ? "items-start text-left"
      : alignment === "right"
        ? "items-end text-right"
        : "items-center text-center";

  const positionClass =
    position === "top"
      ? "justify-start"
      : position === "bottom"
        ? "justify-end"
        : "justify-center";

  const paddingClass =
    padding === "small"
      ? "py-8"
      : padding === "large"
        ? "py-20"
        : "py-12";

  const radiusClass =
    borderRadius === "none"
      ? "rounded-none"
      : borderRadius === "small"
        ? "rounded-lg"
        : borderRadius === "large"
          ? "rounded-3xl"
          : "rounded-2xl";

  const imageClass =
    imagePosition === "left" || imagePosition === "right"
      ? "grid items-center gap-8 md:grid-cols-2"
      : "flex flex-col gap-6";

  const textContent = (
    <div className={`flex flex-col ${alignmentClass}`}>
      {title && (
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl" style={{ color: titleColor }}>
          {title}
        </h2>
      )}

      {text && (
        <p className="mt-4 max-w-3xl whitespace-pre-line text-base leading-7 md:text-lg" style={{ color: textColor }}>
          {text}
        </p>
      )}

      {buttonText && (
        <Link
          href={buttonUrl || "#"}
          className="mt-7 inline-flex rounded-md px-6 py-3 font-semibold transition-opacity hover:opacity-80"
          style={{ backgroundColor: buttonColor, color: buttonTextColor }}
        >
          {buttonText}
        </Link>
      )}
    </div>
  );

  const imageElement = image ? (
    <img
      src={image}
      alt={title || ""}
      className={`w-full object-cover ${radiusClass}`}
    />
  ) : null;

  return (
    <section className={`w-full ${paddingClass}`} style={{ backgroundColor }}>
      <div className={`mx-auto flex min-h-[220px] ${positionClass} px-4 sm:px-6 lg:px-8`}>
        <div className={`w-full ${widthClass}`}>
          <div className={imageClass}>
            {imagePosition === "left" && imageElement}
            {imagePosition === "top" && imageElement}
            {textContent}
            {imagePosition === "bottom" && imageElement}
            {imagePosition === "right" && imageElement}
          </div>
        </div>
      </div>
    </section>
  );
}
