"use client";

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
  const heightClass =
    minHeight === "small"
      ? "min-h-[250px]"
      : minHeight === "large"
        ? "min-h-[450px]"
        : "min-h-[350px]";

  return (
    <section
      className={`flex w-full flex-col justify-end bg-cover bg-center ${heightClass}`}
      style={{
        backgroundColor,
        backgroundImage: backgroundImage
          ? `url(${backgroundImage})`
          : undefined,
      }}
    >
      <div className="container mx-auto px-4 pb-8 sm:px-6 lg:px-8">
        <h1
          className="text-4xl font-bold md:text-5xl"
          style={{ color: titleColor }}
        >
          {title}
        </h1>

        {description && (
          <p
            className="mt-3 max-w-3xl text-base md:text-lg"
            style={{ color: textColor }}
          >
            {description}
          </p>
        )}
      </div>
    </section>
  );
}
