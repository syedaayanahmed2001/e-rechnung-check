"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { checkFile, isImage, sniffSpecificationId, type CheckOutcome } from "@/lib/check/check-file";
import { getBrowserValidator } from "@/lib/check/browser";
import { isPdf } from "@/lib/check/pdf";
import type { ValidationReport } from "@/lib/check/types";
import { convertAndCheck, pickInput } from "@/lib/convert/convert";
import { computeTotals, totalsMismatches } from "@/lib/convert/invoice";
import { sha256HexAsync } from "@/lib/convert/providers";
import { approve, blockers, buildReview, canGenerate, setField, toApproved, type Review } from "@/lib/convert/review";
import type { InvoiceExtraction } from "@/lib/convert/schema";
import type { ExtractResponse } from "@/lib/convert/service";
import type { Lang } from "@/lib/explain/explain";
import { STRINGS, fieldLabel } from "@/lib/i18n/strings";
import { ReportView } from "./report-view";
import { ReviewForm } from "./review-form";

type Loaded = { bytes: Uint8Array; name: string };

type Phase =
  | { kind: "idle" }
  | { kind: "busy"; message: string }
  | { kind: "checked"; file: Loaded; outcome: CheckOutcome }
  | { kind: "review"; file: Loaded; review: Review; extraction: InvoiceExtraction; meta: { provider: string; model: string; attempts: number; latencyMs: number } }
  | { kind: "generated"; xml: string; report: ValidationReport; mismatches: ReturnType<typeof totalsMismatches> }
  | { kind: "error"; message: string };

const SAMPLES = [
  { key: "valid", file: "valid.xml" },
  { key: "invalid", file: "invalid.xml" },
  { key: "hybrid", file: "hybrid.pdf" },
  { key: "plain", file: "plain.pdf" },
] as const;

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function imageMime(bytes: Uint8Array): string {
  if (bytes[0] === 0x89) return "image/png";
  if (bytes[0] === 0x52) return "image/webp";
  return "image/jpeg";
}

export function App() {
  const [lang, setLang] = useState<Lang>("de");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const s = STRINGS[lang];
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    if (phase.kind === "checked" || phase.kind === "review" || phase.kind === "generated") {
      resultRef.current?.querySelector<HTMLElement>("h2")?.focus();
    }
  }, [phase.kind]);

  const check = useCallback(
    async (file: Loaded) => {
      try {
        setPhase({ kind: "busy", message: s.loadingRules });
        const validator = await getBrowserValidator();
        setPhase({ kind: "busy", message: s.checking });
        const outcome = await checkFile(file.bytes, validator);
        setPhase({ kind: "checked", file, outcome });
      } catch (e) {
        setPhase({ kind: "error", message: String((e as Error).message ?? e) });
      }
    },
    [s.loadingRules, s.checking],
  );

  const onFiles = useCallback(
    async (files: FileList | null) => {
      const f = files?.[0];
      if (!f) return;
      await check({ bytes: new Uint8Array(await f.arrayBuffer()), name: f.name });
    },
    [check],
  );

  const loadSample = useCallback(
    async (file: string) => {
      const res = await fetch(`/samples/${file}`);
      await check({ bytes: new Uint8Array(await res.arrayBuffer()), name: file });
    },
    [check],
  );

  const convert = useCallback(
    async (file: Loaded) => {
      try {
        setPhase({ kind: "busy", message: s.extracting });
        let text: string | null = null;
        let image: { mimeType: string; base64: string } | undefined;
        if (isPdf(file.bytes)) {
          const { pdfText, pdfFirstPagePng } = await import("@/lib/convert/pdf-text");
          text = await pdfText(file.bytes);
          if (!pickInput({ pdfText: text })) image = { mimeType: "image/png", base64: await pdfFirstPagePng(file.bytes) };
        } else if (isImage(file.bytes)) {
          image = { mimeType: imageMime(file.bytes), base64: toBase64(file.bytes) };
        }
        const input = pickInput({ pdfText: text, image });
        if (!input) throw new Error(s.notEInvoiceText["unknown-format"]);
        const res = await fetch("/api/extract", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ documentSha256: await sha256HexAsync(file.bytes), input }),
        });
        const json = (await res.json()) as ExtractResponse;
        if (!json.ok) throw new Error(json.error);
        setPhase({
          kind: "review",
          file,
          extraction: json.data,
          review: buildReview(json.data, input.kind === "text" ? text : null),
          meta: { provider: json.provider, model: json.model, attempts: json.attempts.length, latencyMs: json.latencyMs },
        });
      } catch (e) {
        setPhase({ kind: "error", message: String((e as Error).message ?? e) });
      }
    },
    [s.extracting, s.notEInvoiceText],
  );

  const generate = useCallback(async () => {
    if (phase.kind !== "review") return;
    try {
      const invoice = toApproved(phase.review);
      const t = phase.extraction.totals;
      const mismatches = totalsMismatches(computeTotals(invoice), {
        netTotal: t.netTotal.value,
        vatTotal: t.vatTotal.value,
        grossTotal: t.grossTotal.value,
        amountDue: t.amountDue.value,
      });
      const { xml, report } = await convertAndCheck(invoice, await getBrowserValidator());
      setPhase({ kind: "generated", xml, report, mismatches });
    } catch (e) {
      setPhase({ kind: "error", message: String((e as Error).message ?? e) });
    }
  }, [phase]);

  const downloadUrl = useMemo(
    () => (phase.kind === "generated" ? URL.createObjectURL(new Blob([phase.xml], { type: "application/xml" })) : null),
    [phase],
  );
  useEffect(() => () => (downloadUrl ? URL.revokeObjectURL(downloadUrl) : undefined), [downloadUrl]);

  const open = phase.kind === "review" ? blockers(phase.review) : [];

  return (
    <div className="mx-auto grid max-w-3xl gap-6 px-4 py-6 sm:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{s.appTitle}</h1>
          <p className="mt-1 text-muted">{s.tagline}</p>
        </div>
        <div role="group" aria-label={s.langLabel} className="flex overflow-hidden rounded-lg border border-line">
          {(["de", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={lang === l}
              onClick={() => setLang(l)}
              className={`px-3 py-1.5 text-sm font-semibold ${lang === l ? "bg-ink text-bg" : "bg-surface"}`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <section aria-label={s.dropTitle} className="grid gap-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void onFiles(e.dataTransfer.files);
          }}
          className={`grid place-items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center ${dragging ? "border-accent bg-info-bg" : "border-line bg-surface"}`}
        >
          <p className="text-lg font-semibold">{s.dropTitle}</p>
          <p className="text-sm text-muted">{s.dropHint}</p>
          <label className="mt-2 inline-flex cursor-pointer items-center rounded-lg bg-ink px-4 py-2 font-semibold text-bg">
            {s.chooseFile}
            <input
              type="file"
              accept=".xml,.pdf,.jpg,.jpeg,.png,.webp,application/xml,text/xml,application/pdf,image/*"
              className="sr-only"
              onChange={(e) => void onFiles(e.target.files)}
              data-testid="file-input"
            />
          </label>
          <p className="text-xs text-muted">{s.privacyNote}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">{s.orSample}</span>
          {SAMPLES.map((x) => (
            <button
              key={x.key}
              type="button"
              onClick={() => void loadSample(x.file)}
              className="rounded-full border border-line bg-surface px-3 py-1 hover:border-accent"
              data-sample={x.key}
            >
              {s.samples[x.key]}
            </button>
          ))}
        </div>
      </section>

      <div ref={resultRef} aria-live="polite" className="grid gap-4">
        {phase.kind === "busy" ? (
          <p role="status" className="animate-pulse text-muted">
            {phase.message}
          </p>
        ) : null}

        {phase.kind === "error" ? (
          <div role="alert" className="rounded-lg border border-bad bg-bad-bg p-4 text-bad">
            <h2 tabIndex={-1} className="font-semibold">
              {s.error}
            </h2>
            <p className="break-words text-ink">{phase.message}</p>
          </div>
        ) : null}

        {phase.kind === "checked" && phase.outcome.kind === "report" ? (
          <ReportView
            report={phase.outcome.report}
            lang={lang}
            s={s}
            embeddedFileName={phase.outcome.embeddedFileName}
            specificationId={phase.outcome.report.scenario ? undefined : sniffSpecificationId(phase.file.bytes)}
          />
        ) : null}

        {phase.kind === "checked" && phase.outcome.kind === "not-an-e-invoice" ? (
          <section className="grid gap-3 rounded-xl border-2 border-warn bg-warn-bg p-5">
            <h2 tabIndex={-1} className="text-2xl font-bold text-warn">
              {s.notEInvoice}
            </h2>
            <p>{s.notEInvoiceText[phase.outcome.reason]}</p>
            {phase.outcome.reason !== "unknown-format" ? (
              <>
                <p className="text-sm">{s.convertIntro}</p>
                <button
                  type="button"
                  onClick={() => phase.kind === "checked" && void convert(phase.file)}
                  className="justify-self-start rounded-lg bg-ink px-4 py-2 font-semibold text-bg"
                >
                  {s.convertCta}
                </button>
              </>
            ) : null}
          </section>
        ) : null}

        {phase.kind === "review" ? (
          <section className="grid gap-4">
            <h2 tabIndex={-1} className="text-2xl font-bold">
              {s.review}
            </h2>
            <p className="text-sm text-muted">
              {s.extractedBy}: <span className="font-mono">{phase.meta.provider} · {phase.meta.model}</span> · {phase.meta.attempts}{" "}
              {s.attempts} · {phase.meta.latencyMs} ms
              {phase.meta.provider === "baseline" ? ` · ${s.recordedNote}` : ""}
            </p>
            <p className="text-sm">{s.reviewHint}</p>
            <ReviewForm
              review={phase.review}
              s={s}
              onChange={(path, value) => setPhase({ ...phase, review: setField(phase.review, path, value) })}
              onApprove={(path, ok) => setPhase({ ...phase, review: approve(phase.review, path, ok) })}
            />
            <div className="sticky bottom-0 grid gap-2 border-t border-line bg-bg py-3">
              {open.length > 0 ? (
                <p className="text-sm text-muted">
                  {s.blockersLeft}: {open.length} ({[...new Set(open.map((b) => fieldLabel(s, b.path)))].slice(0, 4).join(", ")}
                  {open.length > 4 ? ", …" : ""})
                </p>
              ) : null}
              <button
                type="button"
                disabled={!canGenerate(phase.review)}
                onClick={() => void generate()}
                className="justify-self-start rounded-lg bg-ink px-4 py-2 font-semibold text-bg disabled:cursor-not-allowed disabled:opacity-40"
              >
                {s.generate}
              </button>
            </div>
          </section>
        ) : null}

        {phase.kind === "generated" ? (
          <section className="grid gap-4">
            {phase.mismatches.length > 0 ? (
              <div className="rounded-lg border border-warn bg-warn-bg p-4 text-sm">
                <p className="font-semibold text-warn">{s.totalsWarning}</p>
                <ul>
                  {phase.mismatches.map((m) => (
                    <li key={m.field}>
                      {m.field}: {m.printed} ({s.printed}) / {m.computed} ({s.computed})
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {downloadUrl ? (
              <a
                href={downloadUrl}
                download="xrechnung.xml"
                className="justify-self-start rounded-lg bg-ink px-4 py-2 font-semibold text-bg"
                data-testid="download"
              >
                {phase.report.accepted ? s.download : s.downloadRejected}
              </a>
            ) : null}
            <ReportView report={phase.report} lang={lang} s={s} />
          </section>
        ) : null}
      </div>

      {phase.kind !== "idle" && phase.kind !== "busy" ? (
        <button type="button" onClick={() => setPhase({ kind: "idle" })} className="justify-self-start text-sm underline">
          {s.startOver}
        </button>
      ) : null}

      <footer className="border-t border-line pt-4 text-xs text-muted">{s.footer}</footer>
    </div>
  );
}
