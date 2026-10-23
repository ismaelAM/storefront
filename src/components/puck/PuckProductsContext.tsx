"use client";

import type { Category, Product } from "@spree/sdk";
import { createContext, type ReactNode, useContext } from "react";

interface PuckProductsContextValue {
  products: Product[];
  catalogProducts: Product[];
  categories: Category[];
  basePath: string;
}

const PuckProductsContext = createContext<PuckProductsContextValue | null>(null);

interface PuckProductsProviderProps {
  products: Product[];
  catalogProducts?: Product[];
  categories?: Category[];
  basePath: string;
  children: ReactNode;
}

export function PuckProductsProvider({ products, catalogProducts = products, categories = [], basePath, children }: PuckProductsProviderProps) {
  return (
    <PuckProductsContext.Provider value={{ products, catalogProducts, categories, basePath }}>
      {children}
    </PuckProductsContext.Provider>
  );
}

export function usePuckProducts() {
  const context = useContext(PuckProductsContext);
  if (!context) throw new Error("usePuckProducts must be used inside PuckProductsProvider");
  return context;
}
