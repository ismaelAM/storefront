"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface EditorSectionNavProps {
  basePath: string;
}

const items = [
  { key: "home", label: "Inicio", path: "" },
  { key: "navigation", label: "Barra lateral", path: "/editor/navigation" },
  { key: "cart", label: "Carrito", path: "/editor/cart" },
];

export function EditorSectionNav({ basePath }: EditorSectionNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Editor"
      className="flex items-center gap-2 border-b bg-white px-4 py-2"
    >
      {items.map((item) => {
        const href = `${basePath}${item.path}`;
        const active =
          item.key === "home"
            ? pathname === basePath || pathname === `${basePath}/editor`
            : pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={item.key}
            href={href}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              active
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
