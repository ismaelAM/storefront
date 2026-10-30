import Image from "next/image";
import { cachedGetStoreLogo } from "@/lib/data/store-logo";
import { getStoreName } from "@/lib/store";

export async function StoreLogo({
  variant = "default",
}: {
  variant?: "default" | "header";
} = {}) {
  const horizontal = variant === "header";
  const src = horizontal
    ? "/bison-header-logo.png"
    : await cachedGetStoreLogo();
  const name = getStoreName();
  if (!src) return <span className="text-lg font-semibold">{name}</span>;
  return (
    <Image
      src={src}
      alt={name}
      width={horizontal ? 2048 : 160}
      height={horizontal ? 682 : 64}
      sizes={horizontal ? "(max-width: 639px) 180px, 240px" : undefined}
      className={
        horizontal
          ? "h-auto w-[180px] max-w-[calc(100vw-176px)] object-contain sm:w-[240px] sm:max-w-none"
          : "h-12 w-auto max-w-[160px] object-contain"
      }
      fetchPriority="high"
      loading="eager"
      unoptimized={!horizontal}
    />
  );
}
