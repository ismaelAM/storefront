"use client";

import type { OptionType, Variant } from "@spree/sdk";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";

type PickerOptionType = Pick<OptionType, "id" | "label"> & {
  kind?: OptionType["kind"];
};

interface VariantPickerProps {
  variants: Variant[];
  optionTypes: PickerOptionType[];
  selectedVariant: Variant | null;
  onVariantChange: (variant: Variant | null) => void;
}

const TECHNICAL_STANDARD_VALUE = "__spree_standard_edition__";
const TECHNICAL_ISBN_VALUE = /^ISBN\s+(?:97[89]\d{10}|\d{9}[\dX])$/i;

function normalizeOptionValue(value: string): string {
  const trimmed = value.trim();
  if (
    TECHNICAL_ISBN_VALUE.test(trimmed) ||
    /^est[aá]ndar(?:\s*[·-]\s*reimpresi[oó]n(?:\s+\d+)?)?$/i.test(trimmed)
  ) {
    return TECHNICAL_STANDARD_VALUE;
  }
  return trimmed;
}

function variantRank(variant: Variant): number {
  if (variant.purchasable && variant.in_stock) return 0;
  if (variant.purchasable && variant.preorder) return 1;
  if (variant.purchasable) return 2;
  return 3;
}

export function VariantPicker({
  variants,
  optionTypes,
  selectedVariant,
  onVariantChange,
}: VariantPickerProps) {
  const t = useTranslations("products");

  const effectiveOptionTypes = useMemo<PickerOptionType[]>(() => {
    if (optionTypes.length > 0) {
      return optionTypes;
    }

    const derived = new Map<string, PickerOptionType>();

    for (const variant of variants) {
      for (const optionValue of variant.option_values || []) {
        if (derived.has(optionValue.option_type_id)) {
          continue;
        }

        const metadata = optionValue as typeof optionValue & {
          option_type_label?: string | null;
          option_type_name?: string | null;
          option_type_presentation?: string | null;
        };
        const rawName =
          metadata.option_type_label ||
          metadata.option_type_presentation ||
          metadata.option_type_name ||
          "";
        const label = rawName
          ? rawName.charAt(0).toUpperCase() + rawName.slice(1)
          : "Opción";

        derived.set(optionValue.option_type_id, {
          id: optionValue.option_type_id,
          label,
        });
      }
    }

    return Array.from(derived.values());
  }, [optionTypes, variants]);

  const { variantOptionMaps, optionValueDetailsMap, optionValuesMap } =
    useMemo(() => {
      const valuesMap: Record<string, Set<string>> = {};
      for (const optionType of effectiveOptionTypes) {
        valuesMap[optionType.id] = new Set();
      }

      const detailsMap: Record<
        string,
        (typeof variants)[0]["option_values"][0]
      > = {};

      const maps = variants.map((variant) => {
        const optionsMap: Record<string, string> = {};

        for (const optionValue of variant.option_values || []) {
          const normalizedValue = normalizeOptionValue(optionValue.name);
          optionsMap[optionValue.option_type_id] = normalizedValue;

          if (valuesMap[optionValue.option_type_id]) {
            valuesMap[optionValue.option_type_id].add(normalizedValue);
          }

          const key = `${optionValue.option_type_id}:${normalizedValue}`;
          const existing = detailsMap[key];
          if (
            !existing ||
            (TECHNICAL_ISBN_VALUE.test(existing.name) &&
              !TECHNICAL_ISBN_VALUE.test(optionValue.name))
          ) {
            detailsMap[key] = optionValue;
          }
        }

        return { variant, optionsMap };
      });

      return {
        variantOptionMaps: maps,
        optionValueDetailsMap: detailsMap,
        optionValuesMap: valuesMap,
      };
    }, [variants, effectiveOptionTypes]);

  // Spree needs a unique option combination for every physical variant. Some
  // manga reprints therefore use an ISBN as a technical "edición" value. Once
  // normalized, a one-value dimension is implementation detail, not a choice
  // the customer needs to make.
  const visibleOptionTypes = useMemo(
    () =>
      effectiveOptionTypes.filter(
        (optionType) => (optionValuesMap[optionType.id]?.size ?? 0) > 1,
      ),
    [effectiveOptionTypes, optionValuesMap],
  );

  const visibleOptionTypeIds = useMemo(
    () => new Set(visibleOptionTypes.map((optionType) => optionType.id)),
    [visibleOptionTypes],
  );

  const selectedOptions = useMemo(() => {
    const options: Record<string, string> = {};
    if (selectedVariant) {
      for (const optionValue of selectedVariant.option_values || []) {
        if (!visibleOptionTypeIds.has(optionValue.option_type_id)) {
          continue;
        }
        options[optionValue.option_type_id] = normalizeOptionValue(
          optionValue.name,
        );
      }
    }
    return options;
  }, [selectedVariant, visibleOptionTypeIds]);

  const findVariant = (options: Record<string, string>): Variant | null => {
    const matches = variantOptionMaps
      .filter(({ optionsMap }) =>
        Object.entries(options).every(
          ([typeId, value]) => optionsMap[typeId] === value,
        ),
      )
      .sort((a, b) => variantRank(a.variant) - variantRank(b.variant));

    return matches[0]?.variant ?? null;
  };

  // Options behave as a cascade: changing the first dimension (for manga,
  // usually "Tomo") resets later dimensions to the best matching Spree
  // variant. Changing a later dimension preserves the earlier choices.
  const selectionForOption = (
    optionTypeId: string,
    optionValue: string,
  ): Record<string, string> => {
    const currentIndex = visibleOptionTypes.findIndex(
      (optionType) => optionType.id === optionTypeId,
    );
    const options: Record<string, string> = {};

    for (let index = 0; index < currentIndex; index += 1) {
      const previousTypeId = visibleOptionTypes[index]?.id;
      if (previousTypeId && selectedOptions[previousTypeId]) {
        options[previousTypeId] = selectedOptions[previousTypeId];
      }
    }

    options[optionTypeId] = optionValue;
    return options;
  };

  const isOptionAvailable = (
    optionTypeId: string,
    optionValue: string,
  ): boolean => {
    const testOptions = selectionForOption(optionTypeId, optionValue);
    return variantOptionMaps.some(({ optionsMap }) =>
      Object.entries(testOptions).every(
        ([typeId, value]) => optionsMap[typeId] === value,
      ),
    );
  };

  const isOptionPurchasable = (
    optionTypeId: string,
    optionValue: string,
  ): boolean => {
    const testOptions = selectionForOption(optionTypeId, optionValue);
    return variantOptionMaps.some(
      ({ variant, optionsMap }) =>
        variant.purchasable &&
        Object.entries(testOptions).every(
          ([typeId, value]) => optionsMap[typeId] === value,
        ),
    );
  };

  const handleOptionSelect = (optionTypeId: string, optionValue: string) => {
    onVariantChange(findVariant(selectionForOption(optionTypeId, optionValue)));
  };

  const getOptionValueDetails = (
    optionTypeId: string,
    optionValueName: string,
  ): Variant["option_values"][0] | null =>
    optionValueDetailsMap[`${optionTypeId}:${optionValueName}`] || null;

  const displayOptionValue = (
    optionType: PickerOptionType,
    optionValueName: string,
  ): string => {
    if (optionValueName === TECHNICAL_STANDARD_VALUE) {
      return t("standardEdition");
    }

    const optionValue = getOptionValueDetails(optionType.id, optionValueName);
    const label = optionValue?.label?.trim();
    const displayValue =
      label && !TECHNICAL_ISBN_VALUE.test(label) ? label : optionValueName;

    if (/tomo|volumen/i.test(optionType.label) && /^\d+$/.test(displayValue)) {
      return String(Number(displayValue));
    }

    return displayValue;
  };

  const sortedValues = (optionTypeId: string): string[] =>
    Array.from(optionValuesMap[optionTypeId] || []).sort((left, right) => {
      if (left === TECHNICAL_STANDARD_VALUE) return -1;
      if (right === TECHNICAL_STANDARD_VALUE) return 1;
      if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
        return Number(left) - Number(right);
      }
      return left.localeCompare(right, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });

  if (visibleOptionTypes.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {visibleOptionTypes.map((optionType) => {
        const values = sortedValues(optionType.id);
        const selectedValue = selectedOptions[optionType.id];
        const isColor = optionType.kind === "color_swatch";
        const hasUnavailableValues = values.some(
          (value) =>
            isOptionAvailable(optionType.id, value) &&
            !isOptionPurchasable(optionType.id, value),
        );

        return (
          <div key={optionType.id}>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">
                {optionType.label}
              </span>
              {selectedValue && (
                <span className="text-sm text-gray-500">
                  {displayOptionValue(optionType, selectedValue)}
                </span>
              )}
            </div>

            {isColor ? (
              <div className="flex flex-wrap gap-2">
                {values.map((value) => {
                  const optionValue = getOptionValueDetails(
                    optionType.id,
                    value,
                  );
                  const isSelected = selectedValue === value;
                  const isAvailable = isOptionAvailable(optionType.id, value);
                  const isPurchasable = isOptionPurchasable(
                    optionType.id,
                    value,
                  );

                  return (
                    <button
                      type="button"
                      key={value}
                      onClick={() => handleOptionSelect(optionType.id, value)}
                      disabled={!isAvailable}
                      title={
                        !isPurchasable && isAvailable
                          ? t("unavailableVariantHelp")
                          : displayOptionValue(optionType, value)
                      }
                      className={`
                        relative h-10 w-10 overflow-hidden rounded-lg border transition-all
                        ${isSelected ? "border-gray-900 ring-2 ring-primary ring-offset-2" : "border-gray-200"}
                        ${!isAvailable ? "cursor-not-allowed opacity-30" : "cursor-pointer"}
                        ${!isPurchasable && isAvailable ? "border-red-300 opacity-55" : ""}
                      `}
                      style={
                        optionValue?.image_url
                          ? {
                              backgroundImage: `url(${optionValue.image_url})`,
                              backgroundSize: "cover",
                            }
                          : optionValue?.color_code
                            ? { backgroundColor: optionValue.color_code }
                            : { backgroundColor: "#e5e7eb" }
                      }
                    >
                      {!isPurchasable && isAvailable && (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="absolute h-0.5 w-full rotate-45 bg-red-400" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {values.map((value) => {
                  const isSelected = selectedValue === value;
                  const isAvailable = isOptionAvailable(optionType.id, value);
                  const isPurchasable = isOptionPurchasable(
                    optionType.id,
                    value,
                  );
                  const isUnavailable = isAvailable && !isPurchasable;

                  return (
                    <Button
                      type="button"
                      key={value}
                      variant="outline"
                      onClick={() => handleOptionSelect(optionType.id, value)}
                      disabled={!isAvailable}
                      title={
                        isUnavailable
                          ? t("unavailableVariantHelp")
                          : displayOptionValue(optionType, value)
                      }
                      className={[
                        "gap-2",
                        isSelected
                          ? "ring-2 ring-primary ring-offset-2 border-primary"
                          : "",
                        isUnavailable
                          ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-50 hover:text-red-700"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <span
                        className={
                          isUnavailable
                            ? "line-through decoration-red-300"
                            : undefined
                        }
                      >
                        {displayOptionValue(optionType, value)}
                      </span>
                      {isUnavailable && (
                        <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 no-underline">
                          {t("outOfStock")}
                        </span>
                      )}
                    </Button>
                  );
                })}
              </div>
            )}

            {hasUnavailableValues && (
              <p className="mt-2 text-xs text-gray-500">
                {t("unavailableVariantHelp")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
