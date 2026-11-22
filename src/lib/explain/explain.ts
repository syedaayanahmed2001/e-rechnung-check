/**
 * Explain step: looks up a hand-written explanation by official rule ID. No model, no network.
 * When no explanation exists, the official message is shown with a clear label (EXPL-03).
 */
import type { Message, StepKind } from "../check/types.ts";
import { RULES, type ExplanationText } from "./rules.ts";
import { TERMS } from "./terms.ts";

export type Lang = "de" | "en";

export type TermLocation = { id: string; name: string; ubl: string; cii: string };

export type Explained =
  | {
      kind: "explained";
      code: string;
      text: ExplanationText;
      terms: TermLocation[];
      status: "draft" | "reviewed";
      officialText: string;
    }
  | { kind: "official-only"; code: string; label: string; officialText: string };

export const FALLBACK_LABEL: Record<Lang, string> = {
  de: "Offizieller Regeltext, noch keine Erklärung in einfacher Sprache",
  en: "Official rule text, no plain-language explanation yet",
};

/** Generic explanations for findings that are not Schematron rules (parser, XML Schema). */
const STEP_TEXT: Record<"xml" | "xsd", Record<Lang, ExplanationText>> = {
  xml: {
    de: {
      meaning: "Die Datei ist kein wohlgeformtes XML und kann nicht weiter geprüft werden.",
      cause: "Die Datei ist abgeschnitten, beschädigt, oder es ist gar keine XML-Datei.",
      fix: "Die Rechnung neu aus dem Rechnungsprogramm exportieren und die vollständige Datei prüfen.",
    },
    en: {
      meaning: "The file is not well-formed XML and cannot be checked further.",
      cause: "The file is truncated or damaged, or it is not an XML file at all.",
      fix: "Export the invoice again from your invoicing software and check the complete file.",
    },
  },
  xsd: {
    de: {
      meaning: "Die Struktur passt nicht zum XML-Schema (UBL 2.1 bzw. CII D16B). Die Geschäftsregeln werden erst danach geprüft.",
      cause: "Ein unbekanntes Element, eine falsche Reihenfolge, ein fehlendes Pflichtelement oder ein Wert im falschen Format (z. B. Datum).",
      fix: "An der genannten Zeile prüfen, welches Element dort steht und ob es an diese Stelle gehört. Oft hilft ein Export mit aktueller Software.",
    },
    en: {
      meaning: "The structure does not match the XML Schema (UBL 2.1 or CII D16B). Business rules are only checked after this passes.",
      cause: "An unknown element, wrong order, a missing mandatory element or a value in the wrong format (for example a date).",
      fix: "Look at the element on the given line and whether it belongs there. Exporting with up-to-date software often fixes it.",
    },
  },
};

export function hasExplanation(code: string): boolean {
  return Object.hasOwn(RULES, code);
}

export function termLocations(ids: string[], lang: Lang): TermLocation[] {
  return ids.filter((id) => TERMS[id]).map((id) => ({ id, name: TERMS[id][lang], ubl: TERMS[id].ubl, cii: TERMS[id].cii }));
}

export function explain(message: Pick<Message, "code" | "text">, lang: Lang, step: StepKind = "schematron"): Explained {
  if (step === "xml" || step === "xsd") {
    return { kind: "explained", code: message.code, text: STEP_TEXT[step][lang], terms: [], status: "draft", officialText: message.text };
  }
  const entry = Object.hasOwn(RULES, message.code) ? RULES[message.code] : undefined;
  if (!entry) return { kind: "official-only", code: message.code, label: FALLBACK_LABEL[lang], officialText: message.text };
  return {
    kind: "explained",
    code: message.code,
    text: entry[lang],
    terms: termLocations(entry.terms, lang),
    status: entry.status,
    officialText: message.text,
  };
}
