/**
 * Parity definition between two validators (in practice: the official Java KoSIT validator
 * and the JS rule runner). Two reports agree when all of these are equal:
 *
 *  - matched scenario, report valid flag, accept/reject
 *  - the list of steps (ids, in order) and each step's valid flag
 *  - for every Schematron step: the exact sequence of messages (rule code, level, XPath
 *    location, message text)
 *
 * Deliberately NOT compared: the wording, count and line numbers of XML Schema / XML parser
 * messages. Those come from different parsers (Xerces in Java, libxml2 in JS) and are worded
 * differently by design; their valid/invalid verdict is compared.
 */
import type { StepResult, ValidationReport } from "./types.ts";

export type Difference = { field: string; expected: unknown; actual: unknown };

function messageKey(m: StepResult["messages"][number]): string {
  return JSON.stringify([m.code, m.level, m.xpathLocation ?? null, m.text]);
}

export function compareReports(expected: ValidationReport, actual: ValidationReport): Difference[] {
  const diffs: Difference[] = [];
  const eq = (field: string, a: unknown, b: unknown) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push({ field, expected: a, actual: b });
  };
  eq("scenario", expected.scenario, actual.scenario);
  eq("valid", expected.valid, actual.valid);
  eq("accepted", expected.accepted, actual.accepted);
  eq(
    "steps",
    expected.steps.map((s) => s.id),
    actual.steps.map((s) => s.id),
  );
  for (const e of expected.steps) {
    const a = actual.steps.find((s) => s.id === e.id);
    if (!a) continue;
    eq(`${e.id}.valid`, e.valid, a.valid);
    if (e.kind === "schematron") {
      const ek = e.messages.map(messageKey);
      const ak = a.messages.map(messageKey);
      if (JSON.stringify(ek) !== JSON.stringify(ak)) {
        diffs.push({
          field: `${e.id}.messages`,
          expected: ek.filter((k) => !ak.includes(k)),
          actual: ak.filter((k) => !ek.includes(k)),
        });
      }
    }
  }
  return diffs;
}
