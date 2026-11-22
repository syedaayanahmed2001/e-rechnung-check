/**
 * Turns raw step results into the KoSIT verdict. This is a line-by-line port of the decision
 * logic in the official `resources/default-report.xsl` (validator configuration XRechnung):
 *
 *  - SVRL flag/role -> message level          (template match="svrl:failed-assert | ...")
 *  - step valid = no warning/error messages   (validationStepResult/@valid)
 *  - report valid                             (rep:report/@valid)
 *  - customLevel overrides + accept/reject    (rep:custom-level(), mode="assessment")
 *
 * The official stylesheet itself cannot run in SaxonJS (it uses a schema-aware pattern,
 * `element(*, xs:base64Binary)`, in its HTML part), so the logic is ported; the parity test
 * against the Java validator is what proves the port is faithful.
 */
import type { Level, Message, StepResult, ValidationReport } from "./types.ts";

/** default-report.xsl: level of a failed-assert / successful-report from its @flag and @role. */
export function svrlLevel(flag: string | undefined, role: string | undefined): Level {
  const values = [flag, role].filter((v): v is string => v !== undefined && v !== "");
  if (values.some((v) => v === "fatal" || v === "error")) return "error";
  if (values.some((v) => v === "warning" || v === "warn")) return "warning";
  if (values.some((v) => v === "information" || v === "info")) return "information";
  return "error";
}

/** default-report.xsl: rep:custom-level(). PROCESSING_ERROR is never overridden. */
export function customLevel(code: string, level: Level, customLevels: Record<string, Level>): Level {
  if (code === "PROCESSING_ERROR") return level;
  return customLevels[code] ?? level;
}

export function stepValid(messages: Message[]): boolean {
  return !messages.some((m) => m.level === "warning" || m.level === "error");
}

/** default-report.xsl: rep:report/@valid. */
export function reportValid(scenario: string | null, steps: StepResult[], processingError: boolean): boolean {
  if (processingError) return false;
  if (scenario === null) return false;
  if (scenario.toLowerCase().includes("fallback")) return false;
  if (steps.some((s) => !s.valid)) return false;
  if (steps.some((s) => s.valid)) return true;
  return false;
}

/** default-report.xsl: mode="assessment" -> accept (true) or reject (false). */
export function assessment(scenario: string | null, steps: StepResult[], processingError: boolean): boolean {
  if (processingError) return false;
  if (scenario === null) return false;
  if (scenario.toLowerCase().includes("fallback")) return false;
  const messages = steps.flatMap((s) => s.messages);
  if (messages.some((m) => m.customLevel === "error")) return false;
  return true;
}

export function finishReport(
  partial: Omit<ValidationReport, "valid" | "accepted">,
  processingError: boolean,
): ValidationReport {
  return {
    ...partial,
    valid: reportValid(partial.scenario, partial.steps, processingError),
    accepted: assessment(partial.scenario, partial.steps, processingError),
  };
}

export function normaliseSpace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
