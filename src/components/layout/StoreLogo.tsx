import Image from "next/image";
import { cachedGetStoreLogo } from "@/lib/data/store-logo";
import { getStoreName } from "@/lib/store";

export async function StoreLogo() {
  const src = await cachedGetStoreLogo();
  const name = getStoreName();
  if (!src) return <span className="text-lg font-semibold">{name}</span>;
  return (
    <Image
      src={src}
      alt={name}
      width={160}
      height={64}
      className="h-12 w-auto max-w-[160px] object-contain"
      fetchPriority="high"
      loading="eager"
      unoptimized
    />
  );
}
