"use client";

import type { Config } from "@puckeditor/core";
import { config } from "@/puck/config";
import { RealProductCarousel, RealProductShowcase } from "@/puck/RealProductBlocks";

const enhancedConfig = {
  ...config,
  components: {
    ...config.components,
    Carousel: {
      ...config.components.Carousel,
      label: "Carrusel de productos reales",
      fields: {
        ...config.components.Carousel.fields,
        productCount: {
          type: "number",
          label: "Número de productos",
          min: 1,
          max: 8,
        },
      },
      defaultProps: {
        ...config.components.Carousel.defaultProps,
        productCount: 4,
      },
      render: (props: typeof config.components.Carousel.defaultProps) => (
        <RealProductCarousel
          productCount={props.productCount ?? 4}
          columns="4"
          title="Productos destacados"
          subtitle="Una selección real de tu catálogo."
          backgroundColor="#ffffff"
          titleColor="#111827"
          textColor="#6b7280"
          priceColor="#111827"
          cardBackgroundColor="#ffffff"
          alignment="center"
        />
      ),
    },
    ProductShowcase: {
      ...config.components.ProductShowcase,
      label: "Producto destacado real",
      fields: {
        ...config.components.ProductShowcase.fields,
        productPosition: {
          type: "number",
          label: "Producto de la lista",
          min: 1,
          max: 8,
        },
      },
      defaultProps: {
        ...config.components.ProductShowcase.defaultProps,
        productPosition: 1,
      },
      render: (props: typeof config.components.ProductShowcase.defaultProps & { productPosition?: number }) => (
        <RealProductShowcase
          productPosition={props.productPosition ?? 1}
          description={props.description}
          badge={props.badge}
          buttonText={props.buttonText}
          backgroundColor={props.backgroundColor}
          titleColor={props.titleColor}
          textColor={props.textColor}
          priceColor={props.priceColor}
          buttonColor={props.buttonColor}
          buttonTextColor={props.buttonTextColor}
          alignment="left"
          imagePosition={props.imagePosition}
          imageAspect="square"
          padding="large"
        />
      ),
    },
  },
} as Config;

export { enhancedConfig };
