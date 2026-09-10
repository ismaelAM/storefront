"use client";

import type { Config } from "@puckeditor/core";
import { useEffect, useState } from "react";
import { PuckProductGrid } from "@/components/puck/PuckProductGrid";
import { HomeFeaturedProductsBlock } from "@/puck/HomeFeaturedProductsBlock";
import { HomeHeroBlock } from "@/puck/HomeHeroBlock";
import { HomeWholesaleBlock } from "@/puck/HomeWholesaleBlock";

/* =========================================================
   TYPES
   ========================================================= */

type HeroProps = {
  title: string;
  text: string;
  backgroundColor: string;
  titleColor: string;
  textColor: string;
  backgroundImage: string;
  buttonText: string;
  buttonUrl: string;
  contentPosition: "left" | "center" | "right";
  height: "small" | "medium" | "large";
  overlay: string;
};

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

type CarouselSlide = {
  image: string;
  title: string;
  text: string;
  buttonText: string;
  buttonUrl: string;
  backgroundColor: string;
  titleColor: string;
  textColor: string;
  overlay: string;
  contentPosition: "left" | "center" | "right";
};

type CarouselProps = {
  slides: CarouselSlide[];
  height: "small" | "medium" | "large" | "fullscreen";
  autoplay: boolean;
  autoplayInterval: number;
  showArrows: boolean;
  showDots: boolean;
  arrowStyle: "round" | "square" | "minimal";
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
};

type ProductGridProps = {
  title: string;
  subtitle: string;
  columns: "2" | "3" | "4";
  imageAspect: "square" | "4/3" | "16/9";
  cardRadius: "none" | "small" | "medium" | "large";
  backgroundColor: string;
  cardBackgroundColor: string;
  titleColor: string;
  textColor: string;
  priceColor: string;
};

type ProductShowcaseProps = {
  name: string;
  description: string;
  image: string;
  price: string;
  comparePrice: string;
  badge: string;
  buttonText: string;
  buttonUrl: string;
  imagePosition: "left" | "right";
  backgroundColor: string;
  titleColor: string;
  textColor: string;
  priceColor: string;
  buttonColor: string;
  buttonTextColor: string;
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
  Carousel: CarouselProps;
  Banner: BannerProps;
  ProductGrid: ProductGridProps;
  FeaturedProductsHome: FeaturedProductsHomeProps;
  WholesaleHome: WholesaleHomeProps;
  ProductShowcase: ProductShowcaseProps;
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
};

type FeaturedProductsHomeProps = {
  title: string;
  viewAllText: string;
  viewAllUrl: string;
  columns: "2" | "3" | "4";
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
   CAROUSEL
   ========================================================= */

function CarouselRenderer({
  slides,
  height,
  autoplay,
  autoplayInterval,
  showArrows,
  showDots,
  arrowStyle,
}: CarouselProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    if (!autoplay || slides.length <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      setCurrentSlide((current) =>
        current >= slides.length - 1 ? 0 : current + 1,
      );
    }, autoplayInterval);

    return () => {
      window.clearInterval(timer);
    };
  }, [autoplay, autoplayInterval, slides.length]);

  useEffect(() => {
    if (currentSlide >= slides.length) {
      setCurrentSlide(0);
    }
  }, [currentSlide, slides.length]);

  if (!slides || slides.length === 0) {
    return (
      <section className="flex min-h-[300px] items-center justify-center bg-gray-100">
        <p className="text-gray-500">Añade al menos una diapositiva.</p>
      </section>
    );
  }

  const slide = slides[currentSlide];

  const heightClass =
    height === "small"
      ? "min-h-[400px]"
      : height === "large"
        ? "min-h-[700px]"
        : height === "fullscreen"
          ? "min-h-screen"
          : "min-h-[550px]";

  const alignmentClass =
    slide.contentPosition === "left"
      ? "items-start text-left"
      : slide.contentPosition === "right"
        ? "items-end text-right"
        : "items-center text-center";

  const arrowClass =
    arrowStyle === "square"
      ? "rounded-md"
      : arrowStyle === "minimal"
        ? "rounded-none bg-transparent shadow-none"
        : "rounded-full";

  const goToPrevious = () => {
    setCurrentSlide((current) =>
      current === 0 ? slides.length - 1 : current - 1,
    );
  };

  const goToNext = () => {
    setCurrentSlide((current) =>
      current === slides.length - 1 ? 0 : current + 1,
    );
  };

  return (
    <section
      className={`relative flex w-full ${heightClass} overflow-hidden`}
      style={{
        backgroundColor: slide.backgroundColor,
        backgroundImage: slide.image ? `url(${slide.image})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {slide.image && slide.overlay && (
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: slide.overlay,
          }}
        />
      )}

      <div
        className={`relative z-10 container mx-auto flex flex-col justify-center px-6 py-16 md:px-12 ${alignmentClass}`}
      >
        {slide.title && (
          <h2
            className="max-w-5xl text-4xl font-bold tracking-tight md:text-6xl"
            style={{
              color: slide.titleColor,
            }}
          >
            {slide.title}
          </h2>
        )}

        {slide.text && (
          <p
            className="mt-5 max-w-3xl text-lg md:text-xl"
            style={{
              color: slide.textColor,
            }}
          >
            {slide.text}
          </p>
        )}

        {slide.buttonText && (
          <a
            href={slide.buttonUrl || "#"}
            className="mt-8 inline-flex rounded-md bg-white px-7 py-3 font-semibold text-gray-900 shadow-sm transition-opacity hover:opacity-80"
          >
            {slide.buttonText}
          </a>
        )}
      </div>

      {showArrows && slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={goToPrevious}
            aria-label="Diapositiva anterior"
            className={`absolute left-4 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center bg-white/90 text-xl text-gray-900 shadow-md transition hover:bg-white ${arrowClass}`}
          >
            ‹
          </button>

          <button
            type="button"
            onClick={goToNext}
            aria-label="Siguiente diapositiva"
            className={`absolute right-4 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center bg-white/90 text-xl text-gray-900 shadow-md transition hover:bg-white ${arrowClass}`}
          >
            ›
          </button>
        </>
      )}

      {showDots && slides.length > 1 && (
        <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 gap-2">
          {slides.map((slideItem, index) => (
            <button
              key={`${slideItem.title}-${index}`}
              type="button"
              onClick={() => setCurrentSlide(index)}
              aria-label={`Ir a diapositiva ${index + 1}`}
              className={`h-2.5 rounded-full transition-all ${
                index === currentSlide
                  ? "w-8 bg-white"
                  : "w-2.5 bg-white/60 hover:bg-white/80"
              }`}
            >
              <span className="sr-only">Diapositiva {index + 1}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

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

        titleColor: {
          type: "text",
          label: "Color del título",
        },

        textColor: {
          type: "text",
          label: "Color del texto",
        },

        backgroundColor: {
          type: "text",
          label: "Color de fondo",
        },
      },

      defaultProps: {
        title: "",
        text: "",
        primaryButtonText: "",
        primaryButtonUrl: "/products",
        secondaryButtonText: "",
        secondaryButtonUrl: "",
        tertiaryButtonText: "",
        tertiaryButtonUrl: "",
        titleColor: "#111827",
        textColor: "#4b5563",
        backgroundColor: "#ffffff",
      },

      render: (props) => {
        return <HomeHeroBlock {...props} basePath="/us/es" />;
      },
    },

    FeaturedProductsHome: {
      label: "Productos destacados",

      fields: {
        title: {
          type: "text",
          label: "Título",
        },

        viewAllText: {
          type: "text",
          label: "Texto ver todos",
        },

        viewAllUrl: {
          type: "text",
          label: "URL ver todos",
        },

        columns: {
          type: "select",
          label: "Columnas",
          options: [
            {
              label: "2 columnas",
              value: "2",
            },
            {
              label: "3 columnas",
              value: "3",
            },
            {
              label: "4 columnas",
              value: "4",
            },
          ],
        },
      },

      defaultProps: {
        title: "",
        viewAllText: "",
        viewAllUrl: "/products",
        columns: "4",
      },

      render: (props) => {
        return <HomeFeaturedProductsBlock {...props} />;
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

        color: {
          type: "text",
          label: "Color",
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
        color: "#111827",
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
       CAROUSEL
       ===================================================== */

    Carousel: {
      label: "Carrusel",

      fields: {
        slides: {
          type: "array",
          label: "Diapositivas",

          arrayFields: {
            image: {
              type: "text",
              label: "Imagen",
            },

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

            backgroundColor: {
              type: "text",
              label: "Color de fondo",
            },

            titleColor: {
              type: "text",
              label: "Color del título",
            },

            textColor: {
              type: "text",
              label: "Color del texto",
            },

            overlay: {
              type: "text",
              label: "Overlay",
            },

            contentPosition: {
              type: "select",
              label: "Posición del contenido",
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
          },
        },

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
            {
              label: "Pantalla completa",
              value: "fullscreen",
            },
          ],
        },

        autoplay: {
          type: "radio",
          label: "Autoplay",
          options: [
            {
              label: "Sí",
              value: true,
            },
            {
              label: "No",
              value: false,
            },
          ],
        },

        autoplayInterval: {
          type: "select",
          label: "Intervalo",
          options: [
            {
              label: "2 segundos",
              value: 2000,
            },
            {
              label: "3 segundos",
              value: 3000,
            },
            {
              label: "4 segundos",
              value: 4000,
            },
            {
              label: "5 segundos",
              value: 5000,
            },
            {
              label: "7 segundos",
              value: 7000,
            },
            {
              label: "10 segundos",
              value: 10000,
            },
          ],
        },

        showArrows: {
          type: "radio",
          label: "Flechas",
          options: [
            {
              label: "Sí",
              value: true,
            },
            {
              label: "No",
              value: false,
            },
          ],
        },

        showDots: {
          type: "radio",
          label: "Puntos",
          options: [
            {
              label: "Sí",
              value: true,
            },
            {
              label: "No",
              value: false,
            },
          ],
        },

        arrowStyle: {
          type: "select",
          label: "Estilo de flechas",
          options: [
            {
              label: "Redondas",
              value: "round",
            },
            {
              label: "Cuadradas",
              value: "square",
            },
            {
              label: "Minimalistas",
              value: "minimal",
            },
          ],
        },
      },

      defaultProps: {
        slides: [
          {
            image: "https://placehold.co/1600x700",
            title: "Descubre nuestra colección",
            text: "Encuentra tus productos favoritos.",
            buttonText: "Comprar ahora",
            buttonUrl: "/products",
            backgroundColor: "#111827",
            titleColor: "#ffffff",
            textColor: "#e5e7eb",
            overlay: "rgba(0,0,0,0.30)",
            contentPosition: "center",
          },
          {
            image: "https://placehold.co/1600x700",
            title: "Nuevas novedades",
            text: "Descubre lo último que hemos preparado para ti.",
            buttonText: "Ver productos",
            buttonUrl: "/products",
            backgroundColor: "#1f2937",
            titleColor: "#ffffff",
            textColor: "#e5e7eb",
            overlay: "rgba(0,0,0,0.30)",
            contentPosition: "left",
          },
        ],

        height: "medium",
        autoplay: true,
        autoplayInterval: 5000,
        showArrows: true,
        showDots: true,
        arrowStyle: "round",
      },

      render: (props) => {
        return <CarouselRenderer {...props} />;
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

        backgroundColor: {
          type: "text",
          label: "Color de fondo",
        },

        textColor: {
          type: "text",
          label: "Color del texto",
        },

        buttonColor: {
          type: "text",
          label: "Color del botón",
        },

        buttonTextColor: {
          type: "text",
          label: "Color del texto del botón",
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
      },

      defaultProps: {
        title: "Oferta especial",
        text: "Descubre nuestras novedades.",
        buttonText: "Comprar ahora",
        buttonUrl: "/products",
        backgroundColor: "#111827",
        textColor: "#ffffff",
        buttonColor: "#ffffff",
        buttonTextColor: "#111827",
        alignment: "center",
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
      }) => {
        const alignmentClass =
          alignment === "left"
            ? "text-left"
            : alignment === "right"
              ? "text-right"
              : "text-center";

        return (
          <section
            className="py-16"
            style={{
              backgroundColor,
            }}
          >
            <div className={`container mx-auto px-4 ${alignmentClass}`}>
              <h2
                className="text-3xl font-bold md:text-4xl"
                style={{
                  color: textColor,
                }}
              >
                {title}
              </h2>

              <p
                className="mx-auto mt-4 max-w-2xl text-lg"
                style={{
                  color: textColor,
                }}
              >
                {text}
              </p>

              {buttonText && (
                <a
                  href={buttonUrl || "#"}
                  className="mt-8 inline-flex rounded-md px-6 py-3 font-semibold transition-opacity hover:opacity-80"
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
       PRODUCT GRID
       ===================================================== */

    ProductGrid: {
      label: "Productos",

      fields: {
        title: {
          type: "text",
          label: "Título",
        },

        subtitle: {
          type: "textarea",
          label: "Subtítulo",
        },

        columns: {
          type: "select",
          label: "Columnas",
          options: [
            {
              label: "2 columnas",
              value: "2",
            },
            {
              label: "3 columnas",
              value: "3",
            },
            {
              label: "4 columnas",
              value: "4",
            },
          ],
        },

        imageAspect: {
          type: "select",
          label: "Proporción de imagen",
          options: [
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

        cardRadius: {
          type: "select",
          label: "Redondeado de tarjeta",
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

        backgroundColor: {
          type: "text",
          label: "Fondo de sección",
        },

        cardBackgroundColor: {
          type: "text",
          label: "Fondo de tarjeta",
        },

        titleColor: {
          type: "text",
          label: "Color del título",
        },

        textColor: {
          type: "text",
          label: "Color del texto",
        },

        priceColor: {
          type: "text",
          label: "Color del precio",
        },
      },

      defaultProps: {
        title: "Nuestros productos",
        subtitle: "Descubre nuestra selección.",
        columns: "4",
        imageAspect: "square",
        cardRadius: "medium",
        backgroundColor: "#ffffff",
        cardBackgroundColor: "#ffffff",
        titleColor: "#111827",
        textColor: "#6b7280",
        priceColor: "#111827",
      },

      render: (props) => {
        return <PuckProductGrid basePath="/us/es" {...props} />;
      },
    },

    /* =====================================================
       PRODUCT SHOWCASE
       ===================================================== */

    ProductShowcase: {
      label: "Producto destacado",

      fields: {
        name: {
          type: "text",
          label: "Nombre",
        },

        description: {
          type: "textarea",
          label: "Descripción",
        },

        image: {
          type: "text",
          label: "Imagen",
        },

        price: {
          type: "text",
          label: "Precio",
        },

        comparePrice: {
          type: "text",
          label: "Precio anterior",
        },

        badge: {
          type: "text",
          label: "Etiqueta",
        },

        buttonText: {
          type: "text",
          label: "Texto del botón",
        },

        buttonUrl: {
          type: "text",
          label: "Enlace",
        },

        imagePosition: {
          type: "select",
          label: "Posición de imagen",
          options: [
            {
              label: "Izquierda",
              value: "left",
            },
            {
              label: "Derecha",
              value: "right",
            },
          ],
        },

        backgroundColor: {
          type: "text",
          label: "Color de fondo",
        },

        titleColor: {
          type: "text",
          label: "Color del título",
        },

        textColor: {
          type: "text",
          label: "Color del texto",
        },

        priceColor: {
          type: "text",
          label: "Color del precio",
        },

        buttonColor: {
          type: "text",
          label: "Color del botón",
        },

        buttonTextColor: {
          type: "text",
          label: "Color del texto del botón",
        },
      },

      defaultProps: {
        name: "Producto destacado",
        description:
          "Presenta aquí tu producto más importante con una descripción atractiva.",
        image: "https://placehold.co/1200x1000",
        price: "79,99 €",
        comparePrice: "99,99 €",
        badge: "Oferta especial",
        buttonText: "Comprar ahora",
        buttonUrl: "/products",
        imagePosition: "left",
        backgroundColor: "#f3f4f6",
        titleColor: "#111827",
        textColor: "#4b5563",
        priceColor: "#111827",
        buttonColor: "#111827",
        buttonTextColor: "#ffffff",
      },

      render: ({
        name,
        description,
        image,
        price,
        comparePrice,
        badge,
        buttonText,
        buttonUrl,
        imagePosition,
        backgroundColor,
        titleColor,
        textColor,
        priceColor,
        buttonColor,
        buttonTextColor,
      }) => {
        const imageFirst = imagePosition === "left";

        return (
          <section
            className="py-16"
            style={{
              backgroundColor,
            }}
          >
            <div className="container mx-auto px-4">
              <div
                className={`grid items-center gap-10 lg:grid-cols-2 ${
                  imageFirst ? "" : "lg:[&>*:first-child]:order-2"
                }`}
              >
                <div className="relative overflow-hidden rounded-2xl">
                  <img
                    src={image}
                    alt={name}
                    className="aspect-[4/3] w-full object-cover lg:aspect-square"
                  />

                  {badge && (
                    <div className="absolute left-5 top-5 rounded-full bg-black px-4 py-2 text-sm font-semibold text-white">
                      {badge}
                    </div>
                  )}
                </div>

                <div className="max-w-xl">
                  <h2
                    className="text-4xl font-bold tracking-tight md:text-5xl"
                    style={{
                      color: titleColor,
                    }}
                  >
                    {name}
                  </h2>

                  {description && (
                    <p
                      className="mt-6 text-lg leading-8"
                      style={{
                        color: textColor,
                      }}
                    >
                      {description}
                    </p>
                  )}

                  <div className="mt-7 flex items-center gap-4">
                    <span
                      className="text-3xl font-bold"
                      style={{
                        color: priceColor,
                      }}
                    >
                      {price}
                    </span>

                    {comparePrice && (
                      <span className="text-lg text-gray-400 line-through">
                        {comparePrice}
                      </span>
                    )}
                  </div>

                  {buttonText && (
                    <a
                      href={buttonUrl || "#"}
                      className="mt-8 inline-flex rounded-md px-7 py-4 font-semibold transition-opacity hover:opacity-80"
                      style={{
                        backgroundColor: buttonColor,
                        color: buttonTextColor,
                      }}
                    >
                      {buttonText}
                    </a>
                  )}
                </div>
              </div>
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
        backgroundColor: {
          type: "text",
          label: "Color de fondo",
        },

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
        backgroundColor: "#ffffff",
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

        backgroundColor: {
          type: "text",
          label: "Color de fondo",
        },
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
