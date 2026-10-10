"use client";

import { type FormEvent, useId, useState } from "react";
import {
  CORREOS_RATE_SOURCE,
  type CorreosShippingEstimate,
} from "@/lib/shipping/correos-rates";

export function ShippingEstimateCalculator({
  labels,
  locale,
  headingLevel = 2,
}: {
  labels: Record<string, string>;
  locale: string;
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const id = useId();
  const [quote, setQuote] = useState<CorreosShippingEstimate | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const money = (cents: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EUR",
    }).format(cents / 100);
  const weight = (kg: number) =>
    `${new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(kg)} kg`;

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setQuote(null);
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/shipping/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postalCode: String(form.get("postalCode") ?? ""),
          ...Object.fromEntries(
            ["weightKg", "lengthCm", "widthCm", "heightCm"].map((key) => [
              key,
              Number(form.get(key)),
            ]),
          ),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(labels[data.error] || labels.networkError);
      } else {
        setQuote(data as CorreosShippingEstimate);
      }
    } catch {
      setError(labels.networkError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <Heading className="text-xl font-semibold text-neutral-950">
        {labels.title}
      </Heading>
      <p className="mt-2 text-sm leading-6 text-neutral-700">{labels.intro}</p>
      <p className="mt-1 text-sm text-neutral-600">{labels.scope}</p>
      <form
        className="mt-5"
        onSubmit={calculate}
        onChange={() => {
          setQuote(null);
          setError("");
        }}
      >
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
          {["postalCode", "weightKg", "lengthCm", "widthCm", "heightCm"].map(
            (key) => (
              <label
                key={key}
                htmlFor={`${id}-${key}`}
                className="grid gap-1.5 text-sm font-medium text-neutral-800"
              >
                {labels[key]}
                <input
                  id={`${id}-${key}`}
                  name={key}
                  required
                  type={key === "postalCode" ? "text" : "number"}
                  inputMode={key === "postalCode" ? "numeric" : "decimal"}
                  {...(key === "postalCode"
                    ? { pattern: "[0-9]{5}", maxLength: 5, autoComplete: "off" }
                    : {
                        min: key === "weightKg" ? 0.001 : 0.1,
                        max: key === "weightKg" ? 30 : 120,
                        step: "any",
                      })}
                  className="rounded-lg border border-neutral-300 px-3 py-2 font-normal disabled:opacity-60"
                />
              </label>
            ),
          )}
          <button
            type="submit"
            className="self-end rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? labels.busy : labels.calculate}
          </button>
        </fieldset>
      </form>
      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
      <div aria-live="polite">
        {quote ? (
          <div className="mt-5 rounded-xl bg-neutral-50 p-4">
            <p className="text-sm text-neutral-600">
              {labels.result} ·{" "}
              {
                labels[
                  `zone${quote.zone[0].toUpperCase()}${quote.zone.slice(1)}`
                ]
              }
            </p>
            <p className="mt-1 text-3xl font-semibold text-neutral-950">
              {money(quote.totalCents)}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm text-neutral-700">
              <dt>{labels.net}</dt>
              <dd className="text-right">{money(quote.netCents)}</dd>
              <dt>{labels.tax}</dt>
              <dd className="text-right">{money(quote.taxCents)}</dd>
              <dt>{labels.billableWeight}</dt>
              <dd className="text-right">{weight(quote.billableWeightKg)}</dd>
              <dt>{labels.volumetricWeight}</dt>
              <dd className="text-right">{weight(quote.volumetricWeightKg)}</dd>
            </dl>
          </div>
        ) : null}
      </div>
      <p className="mt-4 text-sm leading-6 text-neutral-700">{labels.notice}</p>
      <p className="mt-2 text-xs leading-5 text-neutral-600">
        {labels.limitations}
      </p>
      <a
        href={CORREOS_RATE_SOURCE}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block text-sm underline"
      >
        {labels.source}
      </a>
    </section>
  );
}
