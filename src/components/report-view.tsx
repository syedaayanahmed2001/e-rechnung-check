"use client";

import { describeRejection } from "@/lib/check/check-file";
import type { Message, StepResult, ValidationReport } from "@/lib/check/types";
import { explain, type Lang } from "@/lib/explain/explain";
import type { Strings } from "@/lib/i18n/strings";

const LEVEL_STYLE: Record<Message["customLevel"], string> = {
  error: "bg-bad-bg text-bad border-bad",
  warning: "bg-warn-bg text-warn border-warn",
  information: "bg-info-bg text-info border-info",
};

function Finding({ m, step, lang, s }: { m: Message; step: StepResult; lang: Lang; s: Strings }) {
  const e = explain(m, lang, step.kind);
  return (
    <li className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${LEVEL_STYLE[m.customLevel]}`}>
          {s.level[m.customLevel]}
        </span>
        <code className="font-mono text-sm font-semibold">{m.code}</code>
        {m.line ? (
          <span className="text-sm text-muted">
            {s.line} {m.line}
          </span>
        ) : null}
      </div>
      {e.kind === "explained" ? (
        <dl className="mt-3 grid gap-2 text-sm">
          <div>
            <dt className="font-semibold">{s.meaning}</dt>
            <dd>{e.text.meaning}</dd>
          </div>
          <div>
            <dt className="font-semibold">{s.cause}</dt>
            <dd>{e.text.cause}</dd>
          </div>
          <div>
            <dt className="font-semibold">{s.fix}</dt>
            <dd>{e.text.fix}</dd>
          </div>
          {e.terms.length > 0 || m.xpathLocation ? (
            <div>
              <dt className="font-semibold">{s.where}</dt>
              <dd>
                <ul className="mt-1 grid gap-1">
                  {e.terms.map((t) => (
                    <li key={t.id} className="break-words">
                      <span className="font-medium">
                        {t.id} {t.name}
                      </span>
                      <span className="block font-mono text-xs text-muted">UBL: {t.ubl}</span>
                      <span className="block font-mono text-xs text-muted">CII: {t.cii}</span>
                    </li>
                  ))}
                  {m.xpathLocation ? (
                    <li className="break-all font-mono text-xs text-muted">
                      XPath: {m.xpathLocation.replace(/Q\{[^}]*\}/g, "")}
                    </li>
                  ) : null}
                </ul>
              </dd>
            </div>
          ) : null}
          {step.kind === "schematron" ? <p className="text-xs text-muted">{s.draftNote}</p> : null}
        </dl>
      ) : (
        <p className="mt-2 text-sm font-medium">{e.label}</p>
      )}
      <details className="mt-3 text-sm" open={e.kind === "official-only"}>
        <summary className="cursor-pointer text-muted">{s.officialText}</summary>
        <p className="mt-1 break-words">{m.text}</p>
      </details>
    </li>
  );
}

export function ReportView({
  report,
  lang,
  s,
  specificationId,
  embeddedFileName,
}: {
  report: ValidationReport;
  lang: Lang;
  s: Strings;
  specificationId?: string;
  embeddedFileName?: string;
}) {
  const why = describeRejection(report, specificationId);
  const findings = report.steps.flatMap((step) => step.messages.map((m) => ({ m, step })));
  const order = { error: 0, warning: 1, information: 2 } as const;
  findings.sort((a, b) => order[a.m.customLevel] - order[b.m.customLevel]);

  return (
    <section aria-labelledby="verdict" className="grid gap-4">
      <div
        className={`rounded-xl border-2 p-5 ${report.accepted ? "border-ok bg-ok-bg text-ok" : "border-bad bg-bad-bg text-bad"}`}
      >
        <h2 id="verdict" tabIndex={-1} className="text-2xl font-bold">
          {report.accepted ? s.verdictAccepted : s.verdictRejected}
        </h2>
        <p className="mt-1 text-ink">{report.accepted ? s.verdictAcceptedText : s.verdictRejectedText}</p>
        {why.reason !== "accepted" ? (
          <p className="mt-2 text-ink">
            {why.reason === "not-wellformed" && s.reasons["not-wellformed"]}
            {why.reason === "no-scenario" && (
              <>
                {s.reasons["no-scenario"]} <code className="break-all font-mono">{why.specificationId ?? "–"}</code>
              </>
            )}
            {why.reason === "xsd" && s.reasons.xsd}
            {why.reason === "rules" && `${s.reasons.rules} ${why.errors}`}
          </p>
        ) : null}
      </div>

      <dl className="grid gap-1 text-sm sm:grid-cols-[max-content_1fr] sm:gap-x-4">
        {embeddedFileName ? (
          <>
            <dt className="text-muted">{s.embeddedFrom}</dt>
            <dd className="font-mono">{embeddedFileName}</dd>
          </>
        ) : null}
        <dt className="text-muted">{s.scenario}</dt>
        <dd>{report.scenario ?? s.noScenario}</dd>
        <dt className="text-muted">{s.engine}</dt>
        <dd>
          {report.engine} · {report.configuration}
        </dd>
      </dl>

      <h3 className="text-lg font-semibold">
        {s.findings} ({findings.length})
      </h3>
      {findings.length === 0 ? (
        <p>{s.noFindings}</p>
      ) : (
        <ul className="grid gap-3">
          {findings.map(({ m, step }) => (
            <Finding key={`${step.id}-${m.id}`} m={m} step={step} lang={lang} s={s} />
          ))}
        </ul>
      )}
    </section>
  );
}
