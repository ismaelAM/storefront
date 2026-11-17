"use client";

import type { Product } from "@spree/sdk";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ProductImage } from "@/components/ui/product-image";
import { useStore } from "@/contexts/StoreContext";
import { trackQuickSearch, trackSelectItem } from "@/lib/analytics/gtm";
import { getProductSearchSuggestions } from "@/lib/data/products";
import { normalizeProductSearch } from "@/lib/utils/product-search";

interface SearchBarProps {
  basePath: string;
  autoFocus?: boolean;
  onNavigate?: () => void;
}

export function SearchBar({ basePath, autoFocus, onNavigate }: SearchBarProps) {
  const router = useRouter();
  const { currency } = useStore();
  const t = useTranslations("products");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const requestIdRef = useRef(0);

  const listId = useId();
  const searchRef = useRef("");
  const normalizedQuery = normalizeProductSearch(query);

  const cancelSearch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestIdRef.current += 1;
    searchRef.current = "";
  }, []);

  useEffect(() => () => {
    cancelSearch();
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
  }, [cancelSearch]);

  const fetchSuggestions = useCallback(async (searchQuery: string) => {
    const currentRequestId = requestIdRef.current;
    try {
      const results = await getProductSearchSuggestions(searchQuery);
      if (requestIdRef.current !== currentRequestId) return;
      setSuggestions(results);
      if (results.length > 0) trackQuickSearch(results, searchQuery, currency);
    } catch (error) {
      if (requestIdRef.current !== currentRequestId) return;
      console.error("Search failed:", error);
    } finally {
      if (requestIdRef.current === currentRequestId) setLoading(false);
    }
  }, [currency]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setIsOpen(true);
    const search = normalizeProductSearch(value);
    if (search === searchRef.current) return;
    cancelSearch();
    searchRef.current = search;
    setSelectedIndex(-1);
    setSuggestions([]);
    setLoading(search.length >= 2);
    if (search.length >= 2) {
      debounceRef.current = setTimeout(() => fetchSuggestions(search), 300);
    }
  };

  const closeAfterNavigation = () => {
    cancelSearch();
    setSuggestions([]);
    setSelectedIndex(-1);
    setLoading(false);
    setIsOpen(false);
    inputRef.current?.blur();
    onNavigate?.();
  };

  const navigateToResults = () => {
    router.push(`${basePath}/products?q=${encodeURIComponent(normalizedQuery)}`);
    closeAfterNavigation();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (normalizedQuery) navigateToResults();
  };

  // Handle suggestion click
  const handleSuggestionClick = (product: Product, index: number) => {
    trackSelectItem(product, "quick-search", "Quick Search", index, currency);
    router.push(`${basePath}/products/${product.slug}`);
    setQuery("");
    closeAfterNavigation();
  };

  // Close suggestions on blur — delayed to allow click on suggestions
  const handleBlur = () => {
    blurTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 200);
  };

  // Cancel blur timeout when interacting with suggestions
  const handleSuggestionsMouseDown = () => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : prev,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        if (selectedIndex >= 0) {
          e.preventDefault();
          handleSuggestionClick(suggestions[selectedIndex], selectedIndex);
        }
        break;
      case "Escape":
        setIsOpen(false);
        break;
    }
  };

  const showSuggestions =
    isOpen && (suggestions.length > 0 || loading || normalizedQuery.length >= 2);

  return (
    <div className="relative">
      <form onSubmit={handleSubmit}>
        <InputGroup>
          <InputGroupInput
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => {
              if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
              setIsOpen(true);
            }}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder={t("search")}
            autoFocus={autoFocus}
            role="combobox"
            aria-expanded={showSuggestions}
            aria-controls={suggestions.length ? listId : undefined}
            aria-activedescendant={
              selectedIndex >= 0 ? `${listId}-${selectedIndex}` : undefined
            }
            aria-autocomplete="list"
            aria-label={t("search")}
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </InputGroup>
      </form>

      {/* Suggestions dropdown */}
      {showSuggestions && (
        <div
          className="fixed left-0 right-0 mt-1 bg-white border-b border-gray-200 z-50"
          onMouseDown={handleSuggestionsMouseDown}
        >
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            {loading ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                {t("searching")}
              </div>
            ) : suggestions.length > 0 ? (
              <ul id={listId} role="listbox">
                {suggestions.map((product, index) => (
                  <li
                    key={product.id}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === selectedIndex}
                    tabIndex={-1}
                  >
                    <button
                      type="button"
                      onClick={() => handleSuggestionClick(product, index)}
                      tabIndex={-1}
                      className={`w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 transition-colors ${
                        index === selectedIndex ? "bg-gray-50" : ""
                      }`}
                    >
                      {/* Thumbnail */}
                      <div className="relative w-10 h-10 bg-gray-100 rounded flex-shrink-0 overflow-hidden">
                        <ProductImage
                          src={product.thumbnail_url}
                          alt={product.name}
                          fill
                          sizes="40px"
                          className="object-cover"
                          iconClassName="w-5 h-5"
                        />
                      </div>
                      {/* Name and price */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {product.name}
                        </p>
                        {product.price?.display_amount && (
                          <p className="text-sm text-gray-500">
                            {product.price.display_amount}
                          </p>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
                {/* View all results link */}
                {normalizedQuery && (
                  <li className="border-t border-gray-100">
                    <button
                      type="button"
                      onClick={navigateToResults}
                      className="w-full p-3 text-sm text-primary hover:bg-gray-50 text-center font-medium"
                    >
                      {t("viewAllResultsFor", { query: normalizedQuery })}
                    </button>
                  </li>
                )}
              </ul>
            ) : normalizedQuery.length >= 2 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                {t("noProductsFound")}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
