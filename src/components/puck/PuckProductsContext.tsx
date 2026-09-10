"use client";

import type { Product } from "@spree/sdk";
import { createContext, type ReactNode, useContext } from "react";

interface PuckProductsContextValue {
  products: Product[];
  basePath: string;
}

const PuckProductsContext = createContext<PuckProductsContextValue | null>(
  null,
);

interface PuckProductsProviderProps {
  products: Product[];
  basePath: string;
  children: ReactNode;
}

export function PuckProductsProvider({
  products,
  basePath,
  children,
}: PuckProductsProviderProps) {
  return (
    <PuckProductsContext.Provider
      value={{
        products,
        basePath,
      }}
    >
      {children}
    </PuckProductsContext.Provider>
  );
}

export function usePuckProducts() {
  const context = useContext(PuckProductsContext);

  if (!context) {
    throw new Error("usePuckProducts must be used inside PuckProductsProvider");
  }

  return context;
}
