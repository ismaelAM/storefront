import type { CustomField } from "@spree/sdk";
import { useTranslations } from "next-intl";

interface ProductCustomFieldsProps {
  customFields?: Array<CustomField>;
}

function isCustomerVisibleField(field: CustomField): boolean {
  const metadata = field as CustomField & {
    key?: string | null;
    namespace?: string | null;
  };
  const key = (metadata.key ?? "").toLowerCase();
  const namespace = (metadata.namespace ?? "").toLowerCase();
  const label = (field.label ?? "").toLowerCase();

  if (
    namespace === "devir" ||
    namespace === "pricing" ||
    key.startsWith("devir.") ||
    key.startsWith("pricing.")
  ) {
    return false;
  }

  if (/\bisbn\b/i.test(key) || /\bisbn\b/i.test(label)) {
    return false;
  }

  return true;
}

function renderBooleanValue(
  value: unknown,
  t: ReturnType<typeof useTranslations<"products">>,
): React.ReactNode {
  return value ? t("yes") : t("no");
}

function renderValue(
  field: CustomField,
  t: ReturnType<typeof useTranslations<"products">>,
): React.ReactNode {
  switch (field.field_type) {
    case "boolean":
      return renderBooleanValue(field.value, t);
    case "json":
      return typeof field.value === "string"
        ? field.value
        : JSON.stringify(field.value);
    case "rich_text":
      // Value is admin-authored HTML from the Spree CMS backend (trusted source)
      return <span dangerouslySetInnerHTML={{ __html: field.value ?? "" }} />;
    case "short_text":
    case "long_text":
    case "number":
      return String(field.value);
    default:
      return String(field.value);
  }
}

export function ProductCustomFields({
  customFields,
}: ProductCustomFieldsProps): React.JSX.Element | null {
  const t = useTranslations("products");

  const visibleFields = (customFields || []).filter(isCustomerVisibleField);

  if (visibleFields.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 border-t pt-8">
      <h2 className="text-lg font-medium text-gray-900 mb-4">
        {t("properties")}
      </h2>
      <dl className="space-y-3">
        {visibleFields.map((field) => (
          <div key={field.id} className="flex">
            <dt className="w-32 shrink-0 text-gray-500 text-sm">
              {field.label}
            </dt>
            <dd className="text-gray-900 text-sm min-w-0">
              {renderValue(field, t)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
