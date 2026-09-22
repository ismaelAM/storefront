"use client";

import type { Config } from "@puckeditor/core";
import { useEffect, useState } from "react";
import { colorField } from "@/puck/fields";
import { HomeHeroBlock } from "@/puck/HomeHeroBlock";
import { HomeWholesaleBlock } from "@/puck/HomeWholesaleBlock";
import { DEFAULT_PALETTE_VALUES } from "@/puck/palette";
import { getPuckSectionPaddingClass, type PuckDensity } from "@/puck/utils";

/* =========================================================
   TYPES
   ========================================================= */

type TextProps = {
  text: string;
  color: string;
  alignment: "left" | "center" | "right";
  size: "small" | "medium" | "large";
};

type ImageProps = {
  src: string;
  alt: string;
  width: "small" | "medium" | "large" | "full";
  alignment: "left" | "center" | "right";
  borderRadius: "none" | "small" | "medium" | "large" | "full";
  aspectRatio: "auto" | "square" | "4/3" | "16/9";
  objectFit: "contain" | "cover";
};

type BannerProps = {
  title: string;
  text: string;
  buttonText: string;
  buttonUrl: string;
  backgroundColor: string;
  textColor: string;
  buttonColor: string;
  buttonTextColor: string;
  alignment: "left" | "center" | "right";
  spacing: PuckDensity;
};

type SectionProps = {
  backgroundColor: string;
  backgroundImage: string;
  maxWidth: "small" | "medium" | "large" | "full";
  paddingTop: "none" | "small" | "medium" | "large";
  paddingBottom: "none" | "small" | "medium" | "large";
  borderRadius: "none" | "small" | "medium" | "large";
};

type SpacerProps = {
  height: "small" | "medium" | "large";
  backgroundColor: string;
};

type Components = {
  HeroHome: HeroHomeProps;
  Text: TextProps;
  Image: ImageProps;
  Banner: BannerProps;
  WholesaleHome: WholesaleHomeProps;
  Section: SectionProps;
  Spacer: SpacerProps;
};

type HeroHomeProps = {
  title: string;
  text: string;
  primaryButtonText: string;
  primaryButtonUrl: string;
  secondaryButtonText: string;
  secondaryButtonUrl: string;
  tertiaryButtonText: string;
  tertiaryButtonUrl: string;
  titleColor: string;
  textColor: string;
  backgroundColor: string;
  density: PuckDensity;
};

type WholesaleHomeProps = {
  badge: string;
  title: string;
  description: string;
  primaryButtonText: string;
  primaryButtonUrl: string;
  secondaryButtonText: string;
  secondaryButtonUrl: string;
  pricingTitle: string;
  pricingDescription: string;
  quickOrderTitle: string;
  quickOrderDescription: string;
  ordersTitle: string;
  ordersDescription: string;
};

/* =========================================================
   CONFIG
   ========================================================= */

export const config: Config<Components> = {
  components: {
    HeroHome: {
      label: "Hero principal",

      fields: {
        title: {
          type: "text",
          label: "Título",
        },

        text: {
          type: "textarea",
          label: "Descripción",
        },

        primaryButtonText: {
          type: "text",
          label: "Botón principal",
        },

        primaryButtonUrl: {
          type: "text",
          label: "URL botón principal",
        },

        secondaryButtonText: {
          type: "text",
          label: "Botón secundario",
        },

        secondaryButtonUrl: {
          type: "text",
          label: "URL botón secundario",
        },

        tertiaryButtonText: {
          type: "text",
          label: "Botón terciario",
        },

        tertiaryButtonUrl: {
          type: "text",
          label: "URL botón terciario",
        },

        titleColor: colorField("Color del título"),

        textColor: colorField("Color del texto"),

        backgroundColor: colorField("Color de fondo"),

        density: {
          type: "select",
          label: "Densidad vertical",
          options: [
            { label: "Compacta", value: "compact" },
            { label: "Normal", value: "normal" },
            { label: "Amplia", value: "airy" },
          ],
        },
      },

      defaultProps: {
        title: "",
        text: "",
        primaryButtonText: "",
        primaryButtonUrl: "",
        secondaryButtonText: "",
        secondaryButtonUrl: "",
        tertiaryButtonText: "",
        tertiaryButtonUrl: "",
        titleColor: DEFAULT_PALETTE_VALUES.text,
        textColor: DEFAULT_PALETTE_VALUES.textMuted,
        backgroundColor: DEFAULT_PALETTE_VALUES.background,
        density: "compact",
      },

      render: (props) => {
        return <HomeHeroBlock {...props} basePath="/us/es" />;
      },
    },

    WholesaleHome: {
      label: "Wholesale",

      fields: {
        badge: {
          type: "text",
          label: "Etiqueta",
        },

        title: {
          type: "text",
          label: "Título",
        },

        description: {
          type: "textarea",
          label: "Descripción",
        },

        primaryButtonText: {
          type: "text",
          label: "Botón principal",
        },

        primaryButtonUrl: {
          type: "text",
          label: "URL botón principal",
        },

        secondaryButtonText: {
          type: "text",
          label: "Botón secundario",
        },

        secondaryButtonUrl: {
          type: "text",
          label: "URL botón secundario",
        },

        pricingTitle: {
          type: "text",
          label: "Título beneficio 1",
        },

        pricingDescription: {
          type: "textarea",
          label: "Descripción beneficio 1",
        },

        quickOrderTitle: {
          type: "text",
          label: "Título beneficio 2",
        },

        quickOrderDescription: {
          type: "textarea",
          label: "Descripción beneficio 2",
        },

        ordersTitle: {
          type: "text",
          label: "Título beneficio 3",
        },

        ordersDescription: {
          type: "textarea",
          label: "Descripción beneficio 3",
        },
      },

      defaultProps: {
        badge: "",
        title: "",
        description: "",
        primaryButtonText: "",
        primaryButtonUrl: "/wholesale",
        secondaryButtonText: "",
        secondaryButtonUrl: "/wholesale/apply",
        pricingTitle: "",
        pricingDescription: "",
        quickOrderTitle: "",
        quickOrderDescription: "",
        ordersTitle: "",
        ordersDescription: "",
      },

      render: (props) => {
        return <HomeWholesaleBlock {...props} basePath="/us/es" />;
      },
    },

    /* =====================================================
       TEXT
       ===================================================== */

    Text: {
      label: "Texto",

      fields: {
        text: {
          type: "textarea",
          label: "Texto",
        },

        color: colorField("Color"),

        alignment: {
          type: "select",
          label: "Alineación",
          options: [
            {
              label: "Izquierda",
              value: "left",
            },
            {
              label: "Centro",
              value: "center",
            },
            {
              label: "Derecha",
              value: "right",
            },
          ],
        },

        size: {
          type: "select",
          label: "Tamaño",
          options: [
            {
              label: "Pequeño",
              value: "small",
            },
            {
              label: "Medio",
              value: "medium",
            },
            {
              label: "Grande",
              value: "large",
            },
          ],
        },
      },

      defaultProps: {
        text: "Escribe aquí tu texto.",
        color: DEFAULT_PALETTE_VALUES.text,
        alignment: "center",
        size: "medium",
      },

      render: ({ text, color, alignment, size }) => {
        const sizeClass =
          size === "small"
            ? "text-base"
            : size === "large"
              ? "text-3xl md:text-4xl"
              : "text-xl md:text-2xl";

        const alignmentClass =
          alignment === "left"
            ? "text-left"
            : alignment === "right"
              ? "text-right"
              : "text-center";

        return (
          <section className="py-10">
            <div className="container mx-auto px-4">
              <p
                className={`mx-auto max-w-4xl ${sizeClass} ${alignmentClass}`}
                style={{
                  color,
                }}
              >
                {text}
              </p>
            </div>
          </section>
        );
      },
    },

    /* =====================================================
       IMAGE
       ===================================================== */

    Image: {
      label: "Imagen",

      fields: {
        src: {
          type: "text",
          label: "Imagen",
        },

        alt: {
          type: "text",
          label: "Texto alternativo",
        },

        width: {
          type: "select",
          label: "Ancho",
          options: [
            {
              label: "Pequeña",
              value: "small",
            },
            {
              label: "Mediana",
              value: "medium",
            },
            {
              label: "Grande",
              value: "large",
            },
            {
              label: "Pantalla completa",
              value: "full",
            },
          ],
        },

        alignment: {
          type: "select",
          label: "Alineación",
          options: [
            {
              label: "Izquierda",
              value: "left",
            },
            {
              label: "Centro",
              value: "center",
            },
            {
              label: "Derecha",
              value: "right",
            },
          ],
        },

        borderRadius: {
          type: "select",
          label: "Redondeado",
          options: [
            {
              label: "Sin redondeo",
              value: "none",
            },
            {
              label: "Pequeño",
              value: "small",
            },
            {
              label: "Medio",
              value: "medium",
            },
            {
              label: "Grande",
              value: "large",
            },
            {
              label: "Circular",
              value: "full",
            },
          ],
        },

        aspectRatio: {
          type: "select",
          label: "Proporción",
          options: [
            {
              label: "Original",
              value: "auto",
            },
            {
              label: "Cuadrada",
              value: "square",
            },
            {
              label: "4:3",
              value: "4/3",
            },
            {
              label: "16:9",
              value: "16/9",
            },
          ],
        },

        objectFit: {
          type: "select",
          label: "Ajuste",
          options: [
            {
              label: "Contener",
              value: "contain",
            },
            {
              label: "Cubrir",
              value: "cover",
            },
          ],
        },
      },

      defaultProps: {
        src: "https://placehold.co/1200x600",
        alt: "Imagen",
        width: "large",
        alignment: "center",
        borderRadius: "medium",
        aspectRatio: "auto",
        objectFit: "cover",
      },

      render: ({
        src,
        alt,
        width,
        alignment,
        borderRadius,
        aspectRatio,
        objectFit,
      }) => {
        const widthClass =
          width === "small"
            ? "max-w-md"
            : width === "medium"
              ? "max-w-2xl"
              : width === "full"
                ? "max-w-none"
                : "max-w-6xl";

        const alignmentClass =
          alignment === "left"
            ? "mr-auto"
            : alignment === "right"
              ? "ml-auto"
              : "mx-auto";

        const radiusClass =
          borderRadius === "none"
            ? "rounded-none"
            : borderRadius === "small"
              ? "rounded-sm"
              : borderRadius === "large"
                ? "rounded-2xl"
                : borderRadius === "full"
                  ? "rounded-full"
                  : "rounded-lg";

        const aspectClass =
          aspectRatio === "square"
            ? "aspect-square"
            : aspectRatio === "4/3"
              ? "aspect-[4/3]"
              : aspectRatio === "16/9"
                ? "aspect-video"
                : "";

        const objectFitClass =
          objectFit === "contain" ? "object-contain" : "object-cover";

        return (
          <section className="py-12">
            <div className="container mx-auto px-4">
              <img
                src={src}
                alt={alt}
                className={`${widthClass} ${alignmentClass} ${radiusClass} ${aspectClass} w-full ${objectFitClass}`}
              />
            </div>
          </section>
        );
      },
    },

    /* =====================================================
       BANNER
       ===================================================== */

    Banner: {
      label: "Banner",

      fields: {
        title: {
          type: "text",
          label: "Título",
        },

        text: {
          type: "textarea",
          label: "Texto",
        },

        buttonText: {
          type: "text",
          label: "Texto del botón",
        },

        buttonUrl: {
          type: "text",
          label: "Enlace del botón",
        },

        backgroundColor: colorField("Color de fondo"),

        textColor: colorField("Color del texto"),

        buttonColor: colorField("Color del botón"),

        buttonTextColor: colorField("Color del texto del botón"),

        alignment: {
          type: "select",
          label: "Alineación",
          options: [
            {
              label: "Izquierda",
              value: "left",
            },
            {
              label: "Centro",
              value: "center",
            },
            {
              label: "Derecha",
              value: "right",
            },
          ],
        },

        spacing: {
          type: "select",
          label: "Densidad vertical",
          options: [
            { label: "Compacta", value: "compact" },
            { label: "Normal", value: "normal" },
            { label: "Amplia", value: "airy" },
          ],
        },
      },

      defaultProps: {
        title: "Oferta especial",
        text: "Descubre nuestras novedades.",
        buttonText: "Comprar ahora",
        buttonUrl: "",
        backgroundColor: DEFAULT_PALETTE_VALUES.primary,
        textColor: DEFAULT_PALETTE_VALUES.primaryText,
        buttonColor: DEFAULT_PALETTE_VALUES.surface,
        buttonTextColor: DEFAULT_PALETTE_VALUES.text,
        alignment: "center",
        spacing: "compact",
      },

      render: ({
        title,
        text,
        buttonText,
        buttonUrl,
        backgroundColor,
        textColor,
        buttonColor,
        buttonTextColor,
        alignment,
        spacing,
      }) => {
        const alignmentClass =
          alignment === "left"
            ? "text-left"
            : alignment === "right"
              ? "text-right"
              : "text-center";

        const spacingClass = getPuckSectionPaddingClass(spacing);

        return (
          <section
            className={spacingClass}
            style={{
              backgroundColor,
            }}
          >
            <div className={`container mx-auto px-4 ${alignmentClass}`}>
              <h2
                className="text-2xl font-bold tracking-[-0.02em] sm:text-3xl md:text-4xl"
                style={{
                  color: textColor,
                }}
              >
                {title}
              </h2>

              <p
                className="mx-auto mt-2.5 max-w-2xl text-sm leading-6 sm:mt-3 sm:text-base"
                style={{
                  color: textColor,
                }}
              >
                {text}
              </p>

              {buttonText && (
                <a
                  href={buttonUrl || "#"}
                  className="mt-5 inline-flex rounded-md px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-80 sm:mt-6"
                  style={{
                    backgroundColor: buttonColor,
                    color: buttonTextColor,
                  }}
                >
                  {buttonText}
                </a>
              )}
            </div>
          </section>
        );
      },
    },

    /* =====================================================
       SECTION
       ===================================================== */

    Section: {
      label: "Sección",

      fields: {
        backgroundColor: colorField("Color de fondo"),

        backgroundImage: {
          type: "text",
          label: "Imagen de fondo",
        },

        maxWidth: {
          type: "select",
          label: "Ancho máximo",
          options: [
            {
              label: "Pequeño",
              value: "small",
            },
            {
              label: "Medio",
              value: "medium",
            },
            {
              label: "Grande",
              value: "large",
            },
            {
              label: "Pantalla completa",
              value: "full",
            },
          ],
        },

        paddingTop: {
          type: "select",
          label: "Espaciado superior",
          options: [
            {
              label: "Ninguno",
              value: "none",
            },
            {
              label: "Pequeño",
              value: "small",
            },
            {
              label: "Medio",
              value: "medium",
            },
            {
              label: "Grande",
              value: "large",
            },
          ],
        },

        paddingBottom: {
          type: "select",
          label: "Espaciado inferior",
          options: [
            {
              label: "Ninguno",
              value: "none",
            },
            {
              label: "Pequeño",
              value: "small",
            },
            {
              label: "Medio",
              value: "medium",
            },
            {
              label: "Grande",
              value: "large",
            },
          ],
        },

        borderRadius: {
          type: "select",
          label: "Redondeado",
          options: [
            {
              label: "Sin redondeo",
              value: "none",
            },
            {
              label: "Pequeño",
              value: "small",
            },
            {
              label: "Medio",
              value: "medium",
            },
            {
              label: "Grande",
              value: "large",
            },
          ],
        },
      },

      defaultProps: {
        backgroundColor: DEFAULT_PALETTE_VALUES.background,
        backgroundImage: "",
        maxWidth: "large",
        paddingTop: "medium",
        paddingBottom: "medium",
        borderRadius: "none",
      },

      render: ({
        backgroundColor,
        backgroundImage,
        maxWidth,
        paddingTop,
        paddingBottom,
        borderRadius,
      }) => {
        const maxWidthClass =
          maxWidth === "small"
            ? "max-w-3xl"
            : maxWidth === "medium"
              ? "max-w-5xl"
              : maxWidth === "large"
                ? "max-w-7xl"
                : "max-w-none";

        const paddingTopClass =
          paddingTop === "none"
            ? "pt-0"
            : paddingTop === "small"
              ? "pt-6"
              : paddingTop === "large"
                ? "pt-24"
                : "pt-12";

        const paddingBottomClass =
          paddingBottom === "none"
            ? "pb-0"
            : paddingBottom === "small"
              ? "pb-6"
              : paddingBottom === "large"
                ? "pb-24"
                : "pb-12";

        const radiusClass =
          borderRadius === "none"
            ? "rounded-none"
            : borderRadius === "small"
              ? "rounded-md"
              : borderRadius === "large"
                ? "rounded-3xl"
                : "rounded-xl";

        return (
          <section
            className={`${paddingTopClass} ${paddingBottomClass} ${radiusClass} overflow-hidden`}
            style={{
              backgroundColor,
              backgroundImage: backgroundImage
                ? `url(${backgroundImage})`
                : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div className={`container mx-auto px-4 ${maxWidthClass}`}>
              <div className="min-h-[80px]" />
            </div>
          </section>
        );
      },
    },

    /* =====================================================
       SPACER
       ===================================================== */

    Spacer: {
      label: "Espaciador",

      fields: {
        height: {
          type: "select",
          label: "Altura",
          options: [
            {
              label: "Pequeño",
              value: "small",
            },
            {
              label: "Medio",
              value: "medium",
            },
            {
              label: "Grande",
              value: "large",
            },
          ],
        },

        backgroundColor: colorField("Color de fondo"),
      },

      defaultProps: {
        height: "medium",
        backgroundColor: "transparent",
      },

      render: ({ height, backgroundColor }) => {
        const heightClass =
          height === "small" ? "h-8" : height === "large" ? "h-32" : "h-16";

        return (
          <div
            className={heightClass}
            style={{
              backgroundColor,
            }}
          />
        );
      },
    },
  },
};
