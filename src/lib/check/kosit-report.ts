/**
 * Reads a report produced by the official KoSIT Java validator (VARL, rep:report) into the
 * shared `ValidationReport` shape. Used by the parity job, and by the Java-backed validator
 * if the app is ever hosted with the official validator behind HTTP (option A).
 */
import { DOMParser, type Element } from "@xmldom/xmldom";
import { customLevel, normaliseSpace } from "./report-assembly.ts";
import type { Level, Message, StepKind, StepResult, ValidationReport } from "./types.ts";

const REP = "http://www.xoev.de/de/validator/varl/1";
const S = "http://www.xoev.de/de/validator/framework/1/scenarios";

function kids(el: Element, ns: string, local: string): Element[] {
  return Array.from(el.childNodes).filter(
    (n): n is Element => n.nodeType === 1 && (n as Element).namespaceURI === ns && (n as Element).localName === local,
  );
}

function kid(el: Element, ns: string, local: string): Element | undefined {
  return kids(el, ns, local)[0];
}

function stepKind(id: string): StepKind {
  if (id === "val-xml") return "xml";
  if (id === "val-xsd") return "xsd";
  return "schematron";
}

function intAttr(el: Element, name: string): number | undefined {
  const v = el.getAttribute(name);
  return v ? Number(v) : undefined;
}

export function parseKositReport(xml: string, configuration = "KoSIT validator configuration"): ValidationReport {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const report = doc.documentElement as Element;
  if (report.localName !== "report" || report.namespaceURI !== REP) throw new Error("not a KoSIT rep:report");

  const engineName = normaliseSpace(kid(kid(report, REP, "engine")!, REP, "name")?.textContent ?? "KoSIT");
  const matched = kid(report, REP, "scenarioMatched");
  const container = matched ?? kid(report, REP, "noScenarioMatched")!;

  const scenarioEl = matched ? kid(matched, S, "scenario") : undefined;
  const scenario = scenarioEl ? normaliseSpace(kid(scenarioEl, S, "name")?.textContent ?? "") : null;
  const customLevels: Record<string, Level> = {};
  const createReport = scenarioEl && kid(scenarioEl, S, "createReport");
  if (createReport) {
    for (const cl of kids(createReport, S, "customLevel")) {
      for (const code of (cl.textContent ?? "").split(/\s+/)) if (code) customLevels[code] = cl.getAttribute("level") as Level;
    }
  }

  const steps: StepResult[] = kids(container, REP, "validationStepResult").map((step) => {
    const id = step.getAttribute("id") ?? "";
    const res = kid(step, S, "resource");
    const messages: Message[] = kids(step, REP, "message").map((m) => {
      const code = m.getAttribute("code") ?? "UNSPECIFIC";
      const level = (m.getAttribute("level") ?? "error") as Level;
      return {
        id: m.getAttribute("id") ?? "",
        code,
        level,
        customLevel: customLevel(code, level, customLevels),
        xpathLocation: m.getAttribute("xpathLocation") ?? undefined,
        line: intAttr(m, "lineNumber"),
        column: intAttr(m, "columnNumber"),
        text: normaliseSpace(m.textContent ?? ""),
      };
    });
    return {
      id,
      kind: stepKind(id),
      resource: res
        ? {
            name: normaliseSpace(kid(res, S, "name")?.textContent ?? ""),
            location: normaliseSpace(kid(res, S, "location")?.textContent ?? ""),
          }
        : undefined,
      valid: step.getAttribute("valid") === "true",
      messages,
    };
  });

  const assessment = kid(report, REP, "assessment");
  const accepted = !!assessment && !!kid(assessment, REP, "accept");

  return {
    engine: engineName,
    configuration,
    scenario,
    valid: report.getAttribute("valid") === "true",
    accepted,
    steps,
  };
}
