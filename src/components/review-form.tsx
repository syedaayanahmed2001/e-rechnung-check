"use client";

import { useId } from "react";
import type { Review, ReviewField } from "@/lib/convert/review";
import { fieldLabel, type Strings } from "@/lib/i18n/strings";

const SNIPPET_STYLE: Record<ReviewField["snippet"], string> = {
  found: "text-ok",
  "not-found": "text-bad font-semibold",
  "no-snippet": "text-muted",
  empty: "text-muted",
};

function FieldRow({
  f,
  s,
  onChange,
  onApprove,
}: {
  f: ReviewField;
  s: Strings;
  onChange: (path: string, value: string) => void;
  onApprove: (path: string, approved: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-2 border-b border-line py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-start sm:gap-4">
      <label htmlFor={`${id}-v`} className="text-sm font-medium">
        {fieldLabel(s, f.path)}
        {f.required ? <span className="ml-1 text-xs text-bad">({s.required})</span> : null}
      </label>
      <div className="grid gap-1">
        <input
          id={`${id}-v`}
          value={f.value}
          onChange={(e) => onChange(f.path, e.target.value)}
          aria-describedby={`${id}-src`}
          className="w-full rounded border border-line bg-surface px-2 py-1.5 font-mono text-sm"
        />
        <p id={`${id}-src`} className="text-xs">
          <span className={SNIPPET_STYLE[f.snippet]}>{s.snippet[f.snippet]}</span>
          {f.source ? <span className="ml-1 break-words text-muted">· „{f.source}“</span> : null}
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={f.approved}
          onChange={(e) => onApprove(f.path, e.target.checked)}
          className="h-5 w-5 accent-[var(--accent)]"
        />
        {s.approved}
      </label>
    </div>
  );
}

export function ReviewForm({
  review,
  s,
  onChange,
  onApprove,
}: {
  review: Review;
  s: Strings;
  onChange: (path: string, value: string) => void;
  onApprove: (path: string, approved: boolean) => void;
}) {
  const groups: { title: string; match: (p: string) => boolean }[] = [
    { title: s.sections.header, match: (p) => !p.includes(".") && !["iban", "bic", "paymentTerms"].includes(p) },
    { title: s.sections.seller, match: (p) => p.startsWith("seller.") },
    { title: s.sections.buyer, match: (p) => p.startsWith("buyer.") },
    { title: s.sections.payment, match: (p) => ["iban", "bic", "paymentTerms"].includes(p) },
  ];
  const lineGroups = Array.from({ length: review.lineCount }, (_, i) => ({
    title: `${s.sections.lines} ${i + 1}`,
    match: (p: string) => p.startsWith(`lines.${i}.`),
  }));
  return (
    <div className="grid gap-6">
      {[...groups, ...lineGroups].map((g) => (
        <fieldset key={g.title} className="rounded-lg border border-line bg-surface px-4 pb-2">
          <legend className="px-1 text-base font-semibold">{g.title}</legend>
          {review.fields
            .filter((f) => g.match(f.path))
            .map((f) => (
              <FieldRow key={f.path} f={f} s={s} onChange={onChange} onApprove={onApprove} />
            ))}
        </fieldset>
      ))}
    </div>
  );
}
