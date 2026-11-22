/**
 * The Check step's contract. Every validator implementation (the in-browser KoSIT rule
 * runner, the official Java KoSIT validator behind HTTP, a recorded fixture) returns the same
 * `ValidationReport`, so the UI, the explanations and the parity test never care which one ran.
 *
 * The shape mirrors the KoSIT "VARL" report (rep:report) closely on purpose: parity with the
 * official validator is checked field by field on this structure.
 */

export type Level = "error" | "warning" | "information";

export type StepKind = "xml" | "xsd" | "schematron";

export type Message = {
  /** KoSIT-style message id, e.g. "val-sch.1.3". */
  id: string;
  /** Rule id (BR-16, BR-DE-15, PEPPOL-EN16931-R001, ...), an XSD error code, or "generic-error". */
  code: string;
  /** Level as reported by the rule itself (SVRL flag/role, or XSD severity). */
  level: Level;
  /** Level after the scenario's customLevel overrides; this decides accept/reject. */
  customLevel: Level;
  /** XPath of the offending node (Schematron messages). */
  xpathLocation?: string;
  /** Line/column (XML and XSD messages). */
  line?: number;
  column?: number;
  /** The official message text, whitespace-normalised. */
  text: string;
};

export type StepResult = {
  /** "val-xml", "val-xsd", "val-sch.1", "val-sch.2", ... */
  id: string;
  kind: StepKind;
  /** Name and repository location of the official artefact that ran. */
  resource?: { name: string; location: string };
  valid: boolean;
  messages: Message[];
};

export type DocumentData = {
  seller?: string;
  invoiceNumber?: string;
  issueDate?: string;
};

export type ValidationReport = {
  /** Which implementation produced this report, e.g. "KoSIT rules in JS (SaxonJS 2.7, libxml2-wasm)". */
  engine: string;
  /** Validator configuration that was applied, e.g. "Validator Configuration XRechnung 3.0.2 (2026-09-02)". */
  configuration: string;
  /** Name of the matched scenario, or null when no scenario matched (or the XML is broken). */
  scenario: string | null;
  /** KoSIT's "valid" flag: no step produced a warning or an error. */
  valid: boolean;
  /** KoSIT's assessment: accept (true) or reject (false). */
  accepted: boolean;
  /** Steps in KoSIT report order: XSD, Schematron 1..n, well-formedness. */
  steps: StepResult[];
  documentData?: DocumentData;
  durationMs?: number;
};

/**
 * Any implementation of the Check step. Implementations must return results equal to the
 * official KoSIT validator for the same configuration (see docs/SPEC.md, CHECK-02).
 */
export interface Validator {
  readonly engine: string;
  validate(input: Uint8Array, options?: { fileName?: string }): Promise<ValidationReport>;
}

/** All messages of a report, flattened, in report order. */
export function allMessages(report: ValidationReport): Message[] {
  return report.steps.flatMap((s) => s.messages);
}
