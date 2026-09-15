import { FieldLabel } from "@puckeditor/core";

interface ColorFieldRenderProps {
  field: { label?: string };
  value?: string;
  onChange: (value: string) => void;
}

export function colorField(label: string) {
  return {
    type: "custom" as const,
    label,
    render: ({ field, value, onChange }: ColorFieldRenderProps) => {
      const normalizedValue =
        typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
          ? value
          : "#ffffff";

      return (
        <FieldLabel label={field.label ?? label}>
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label={field.label ?? label}
              value={normalizedValue}
              onChange={(event) => onChange(event.currentTarget.value)}
              className="h-9 w-12 cursor-pointer rounded border border-gray-300 bg-white p-1"
            />
            <span className="font-mono text-xs text-gray-500">
              {normalizedValue}
            </span>
          </div>
        </FieldLabel>
      );
    },
  };
}
