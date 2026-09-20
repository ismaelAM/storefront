"use client";

import { getPuckCategoryHeightClass } from "@/puck/utils";

interface CategoryHeroBlockProps {
  title: string;
  description: string;
  backgroundImage: string;
  backgroundColor: string;
  titleColor: string;
  textColor: string;
  minHeight: "small" | "medium" | "large";
}

export function CategoryHeroBlock({
  title,
  description,
  backgroundImage,
  backgroundColor,
  titleColor,
  textColor,
  minHeight,
}: CategoryHeroBlockProps) {
  const heightClass = getPuckCategoryHeightClass(minHeight);

  return (
    <section
      className={`flex w-full flex-col justify-end border-b border-border/60 bg-cover bg-center ${heightClass}`}
      style={{
        backgroundColor,
        backgroundImage: backgroundImage
          ? `url(${backgroundImage})`
          : undefined,
      }}
    >
      <div className="container mx-auto px-4 pb-6 pt-8 sm:px-6 sm:pb-8 lg:px-8">
        <h1
          className="text-3xl font-bold tracking-[-0.03em] sm:text-4xl md:text-5xl"
          style={{ color: titleColor }}
        >
          {title}
        </h1>

        {description && (
          <p
            className="mt-2.5 max-w-3xl text-sm leading-6 sm:text-base md:text-lg"
            style={{ color: textColor }}
          >
            {description}
          </p>
        )}
      </div>
    </section>
  );
}
