/**
 * Source-snippet verification (CONV-05): a field's snippet must occur in the document text,
 * otherwise the reviewer is warned that the model may have invented or paraphrased it.
 * Comparison ignores case, whitespace runs and typographic quote/dash variants.
 */
import { getLeaf, leafPaths, type InvoiceExtraction } from "./schema.ts";

export type SnippetStatus = "found" | "not-found" | "no-snippet" | "empty";

export function normaliseForMatch(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function snippetStatus(documentText: string | null, value: unknown, source: string | null): SnippetStatus {
  if (value === null || value === undefined || value === "") return "empty";
  if (!source) return "no-snippet";
  if (documentText === null) return "no-snippet"; // image input: nothing to compare against
  return normaliseForMatch(documentText).includes(normaliseForMatch(source)) ? "found" : "not-found";
}

export function verifySnippets(data: InvoiceExtraction, documentText: string | null): Record<string, SnippetStatus> {
  const out: Record<string, SnippetStatus> = {};
  for (const path of leafPaths(data)) {
    const leaf = getLeaf(data, path);
    out[path] = snippetStatus(documentText, leaf.value, leaf.source);
  }
  return out;
}
