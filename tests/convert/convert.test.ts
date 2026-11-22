import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toXRechnungCii } from "../../src/lib/convert/cii.ts";
import { convertAndCheck, pickInput } from "../../src/lib/convert/convert.ts";
import { ExtractionError, extractInvoice, parseExtraction } from "../../src/lib/convert/extract.ts";
import { computeTotals, formatCents, lineNetCents, toCents, totalsMismatches, unitCodeFor } from "../../src/lib/convert/invoice.ts";
import { GroqProvider, MODELS, OllamaProvider, RecordedProvider, type Completion, type CompletionRequest, type ModelProvider } from "../../src/lib/convert/providers.ts";
import { approveAll, blockers, buildReview, canGenerate, parseAmount, setField, toApproved } from "../../src/lib/convert/review.ts";
import { InvoiceExtractionSchema, extractionJsonSchema, leafPaths, type InvoiceExtraction } from "../../src/lib/convert/schema.ts";
import { handleExtract, resolveProvider, MAX_BODY_BYTES } from "../../src/lib/convert/service.ts";
import { snippetStatus, verifySnippets } from "../../src/lib/convert/snippets.ts";
import { contractFiles } from "../../scripts/schema/export-schema.ts";
import { invoiceText, syntheticInvoice } from "../../scripts/corpus/make-synthetic.ts";
import { getValidator } from "../helpers.ts";

const SHA = "a".repeat(64);
const leaf = <T>(value: T | null, source: string | null = value === null ? null : String(value)) => ({ value, source });

function sampleExtraction(): { data: InvoiceExtraction; text: string } {
  const inv = syntheticInvoice(0);
  const text = invoiceText(inv, 0).join("\n");
  const party = (p: typeof inv.seller) => ({
    name: leaf(p.name),
    street: leaf(p.street),
    postcode: leaf(p.postcode),
    city: leaf(p.city),
    country: leaf("DE", null),
    vatId: leaf(p.vatId ?? null),
    taxNumber: leaf(p.taxNumber ?? null),
    email: leaf(p.email ?? null),
    phone: leaf(p.phone ?? null),
    contactName: leaf(p.contactName ?? null),
  });
  const t = computeTotals(inv);
  const data: InvoiceExtraction = {
    invoiceNumber: leaf(inv.invoiceNumber, `Rechnungsnummer: ${inv.invoiceNumber}`),
    issueDate: leaf(inv.issueDate, `Rechnungsdatum: ${inv.issueDate.split("-").reverse().join(".")}`),
    deliveryDate: leaf(inv.deliveryDate ?? null, null),
    dueDate: leaf(inv.dueDate ?? null, null),
    currency: leaf("EUR", "€"),
    buyerReference: leaf(inv.buyerReference),
    seller: party(inv.seller),
    buyer: party(inv.buyer),
    iban: leaf(inv.iban!, null),
    bic: leaf(inv.bic ?? null),
    paymentTerms: leaf(inv.paymentTerms!),
    lines: inv.lines.map((l) => ({
      description: leaf(l.description),
      quantity: leaf(l.quantity, null),
      unit: leaf(l.unitCode === "HUR" ? "Std." : "Stück", null),
      unitPrice: leaf(l.unitPrice, null),
      netAmount: leaf(Number(formatCents(lineNetCents(l))), null),
      vatRate: leaf(l.vatRate, `${l.vatRate} %`),
    })),
    totals: {
      netTotal: leaf(Number(formatCents(t.taxBasisCents)), null),
      vatTotal: leaf(Number(formatCents(t.taxTotalCents)), null),
      grossTotal: leaf(Number(formatCents(t.grandTotalCents)), null),
      amountDue: leaf(Number(formatCents(t.duePayableCents)), null),
    },
  };
  return { data: InvoiceExtractionSchema.parse(data), text };
}

class FakeProvider implements ModelProvider {
  readonly id = "groq" as const;
  calls: CompletionRequest[] = [];
  constructor(private readonly answers: string[]) {}
  modelFor() {
    return "fake-model";
  }
  async complete(req: CompletionRequest): Promise<Completion> {
    this.calls.push(req);
    return { raw: this.answers[this.calls.length - 1] ?? "", model: "fake-model", provider: "groq", latencyMs: 5 };
  }
}

describe("[CONV-01] Zod is the source of truth for the extraction schema", () => {
  it("[CONV-01] committed JSON Schema and prompt are up to date", () => {
    for (const [file, content] of Object.entries(contractFiles())) expect(readFileSync(file, "utf8"), file).toBe(content);
  });
  it("[CONV-01] schema is strict-mode compatible: every object closed, every property required", () => {
    const check = (s: Record<string, unknown>, path: string) => {
      if (s.type === "object") {
        expect(s.additionalProperties, path).toBe(false);
        expect([...(s.required as string[])].sort(), path).toEqual(Object.keys(s.properties as object).sort());
        for (const [k, v] of Object.entries(s.properties as Record<string, Record<string, unknown>>)) check(v, `${path}.${k}`);
      }
      if (s.type === "array") check(s.items as Record<string, unknown>, `${path}[]`);
    };
    check(extractionJsonSchema(), "$");
  });
});

describe("[CONV-02] input routing", () => {
  it("[CONV-02] PDF with a text layer -> text model", () => {
    expect(pickInput({ pdfText: "Rechnung Nr. 123 vom 01.02.2026 an Musterfirma GmbH, Betrag 100 €" })?.kind).toBe("text");
  });
  it("[CONV-02] scan without text -> vision model with the page image", () => {
    expect(pickInput({ pdfText: "  \n ", image: { mimeType: "image/png", base64: "AAAA" } })?.kind).toBe("image");
  });
  it("[CONV-02] nothing usable -> null", () => expect(pickInput({ pdfText: "" })).toBeNull());
});

describe("[CONV-03] providers build the documented requests", () => {
  const req: CompletionRequest = { documentSha256: SHA, system: "sys", input: { kind: "text", text: "hello" }, schema: { type: "object" } };
  it("[CONV-03] Groq: open-weight text model, strict json_schema, key only in the header", () => {
    const body = new GroqProvider({ apiKey: "gsk_secret" }).buildBody(req);
    expect(body.model).toBe(MODELS.groq.text);
    expect(body.response_format).toEqual({ type: "json_schema", json_schema: { name: "invoice_extraction", strict: true, schema: { type: "object" } } });
    expect(JSON.stringify(body)).not.toContain("gsk_secret");
  });
  it("[CONV-03] Groq: images use the vision model and a data URL", () => {
    const body = new GroqProvider({ apiKey: "k" }).buildBody({ ...req, input: { kind: "image", mimeType: "image/png", base64: "QUJD" } });
    expect(body.model).toBe(MODELS.groq.vision);
    expect(JSON.stringify(body)).toContain("data:image/png;base64,QUJD");
  });
  it("[CONV-03] Ollama: local model, format = JSON Schema, images as base64", () => {
    const p = new OllamaProvider();
    expect(p.buildBody(req)).toMatchObject({ model: MODELS.ollama.text, format: { type: "object" }, stream: false });
    expect(p.buildBody({ ...req, input: { kind: "image", mimeType: "image/png", base64: "QUJD" } })).toMatchObject({ model: MODELS.ollama.vision });
  });
  it("[CONV-03] no key -> recorded; ERC_PROVIDER=ollama -> ollama; key -> groq", () => {
    expect(resolveProvider({}, []).id).toBe("recorded");
    expect(resolveProvider({ ERC_PROVIDER: "ollama", GROQ_API_KEY: "k" }, []).id).toBe("ollama");
    expect(resolveProvider({ GROQ_API_KEY: "k" }, []).id).toBe("groq");
  });
  it("[CONV-03] recorded provider never invents an answer", async () => {
    await expect(new RecordedProvider([]).complete(req)).rejects.toThrow(/No recorded model output/);
  });
});

describe("[CONV-04] schema validation with exactly one repair retry", () => {
  const { data } = sampleExtraction();
  const good = JSON.stringify(data);
  const input = { kind: "text" as const, text: "x" };
  it("[CONV-04] valid first answer -> 1 attempt", async () => {
    const p = new FakeProvider([good]);
    const r = await extractInvoice({ provider: p, input, documentSha256: SHA, system: "s" });
    expect(r.attempts.length).toBe(1);
  });
  it("[CONV-04] invalid, then valid -> success after one repair that carries the errors", async () => {
    const p = new FakeProvider(['{"invoiceNumber": 5}', good]);
    const r = await extractInvoice({ provider: p, input, documentSha256: SHA, system: "s" });
    expect(r.attempts.map((a) => a.ok)).toEqual([false, true]);
    expect(p.calls[1].repair?.errors).toMatch(/invoiceNumber/);
  });
  it("[CONV-04] invalid twice -> visible ExtractionError, no third call", async () => {
    const p = new FakeProvider(["not json", "{}"]);
    await expect(extractInvoice({ provider: p, input, documentSha256: SHA, system: "s" })).rejects.toBeInstanceOf(ExtractionError);
    expect(p.calls.length).toBe(2);
  });
  it("[CONV-04] code fences are tolerated, other garbage is not", () => {
    expect(parseExtraction("```json\n" + good + "\n```").ok).toBe(true);
    expect(parseExtraction("Here you go: " + good).ok).toBe(false);
  });
});

describe("[CONV-05] source snippets are verified against the document", () => {
  it("[CONV-05] found / not-found / no-snippet / empty", () => {
    const doc = "Rechnungsnummer:   RE-2026-0100\nRechnungsdatum: 03.11.2026";
    expect(snippetStatus(doc, "RE-2026-0100", "rechnungsnummer: RE-2026-0100")).toBe("found");
    expect(snippetStatus(doc, "RE-9", "Rechnungsnummer: RE-9")).toBe("not-found");
    expect(snippetStatus(doc, "x", null)).toBe("no-snippet");
    expect(snippetStatus(doc, null, null)).toBe("empty");
    expect(snippetStatus(null, "x", "y")).toBe("no-snippet");
  });
  it("[CONV-05] every leaf of an extraction gets a status", () => {
    const { data, text } = sampleExtraction();
    const s = verifySnippets(data, text);
    expect(Object.keys(s)).toEqual(leafPaths(data));
    expect(s.invoiceNumber).toBe("found");
  });
});

describe("[CONV-06] every field needs approval before generation", () => {
  it("[CONV-06] nothing approved -> blocked; all approved -> allowed", () => {
    const { data, text } = sampleExtraction();
    let r = buildReview(data, text);
    expect(canGenerate(r)).toBe(false);
    r = approveAll(r, r.fields.map((f) => f.path));
    expect(blockers(r)).toEqual([]);
    expect(canGenerate(r)).toBe(true);
  });
  it("[CONV-06] an empty required field blocks even when approved; editing fixes it", () => {
    const { data, text } = sampleExtraction();
    let r = buildReview({ ...data, buyerReference: { value: null, source: null } }, text);
    r = approveAll(r, r.fields.map((f) => f.path));
    expect(blockers(r)).toContainEqual({ path: "buyerReference", reason: "empty" });
    r = setField(r, "buyerReference", "04011000-12345-67");
    expect(canGenerate(r)).toBe(true);
  });
  it("[CONV-06] invalid values block (date, amount, category)", () => {
    const { data, text } = sampleExtraction();
    let r = approveAll(buildReview(data, text), buildReview(data, text).fields.map((f) => f.path));
    r = setField(r, "issueDate", "03.11.2026");
    expect(blockers(r)).toContainEqual({ path: "issueDate", reason: "invalid" });
  });
  it("[CONV-06] German number formats are parsed", () => {
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("1234.56")).toBe(1234.56);
    expect(parseAmount("12,5")).toBe(12.5);
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("[CONV-07] totals in code, exact to the cent; CII output", () => {
  it("[CONV-07] cent-exact arithmetic without float drift", () => {
    expect(lineNetCents({ quantity: 3, unitPrice: 0.1 })).toBe(30n);
    expect(lineNetCents({ quantity: 1.5, unitPrice: 33.33 })).toBe(5000n); // 49.995 -> 50.00 (half up)
    expect(toCents(0.1 + 0.2)).toBe(30n);
    const t = computeTotals({
      lines: [
        { description: "a", quantity: 1, unitCode: "H87", unitPrice: 10.05, vatRate: 19, vatCategory: "S" },
        { description: "b", quantity: 2, unitCode: "H87", unitPrice: 4.99, vatRate: 7, vatCategory: "S" },
      ],
    });
    expect(t.groups.map((g) => [g.rate, formatCents(g.baseCents), formatCents(g.taxCents)])).toEqual([
      [19, "10.05", "1.91"],
      [7, "9.98", "0.70"],
    ]);
    expect(formatCents(t.grandTotalCents)).toBe("22.64");
  });
  it("[CONV-07] printed totals that differ from computed ones are flagged", () => {
    const t = computeTotals({ lines: [{ description: "a", quantity: 1, unitCode: "H87", unitPrice: 100, vatRate: 19, vatCategory: "S" }] });
    expect(totalsMismatches(t, { netTotal: 100, vatTotal: 19, grossTotal: 120, amountDue: null })).toEqual([
      { field: "grossTotal", printed: "120.00", computed: "119.00" },
    ]);
  });
  it("[CONV-07] unit mapping to UN/ECE codes", () => {
    expect(unitCodeFor("Std.")).toBe("HUR");
    expect(unitCodeFor("Stück")).toBe("H87");
    expect(unitCodeFor("pauschal")).toBe("LS");
    expect(unitCodeFor("Kiste")).toBe("C62");
  });
  it.each(Array.from({ length: 12 }, (_, i) => i))("[CONV-07] synthetic invoice %i -> XRechnung CII accepted by Check", async (i) => {
    const report = await (await getValidator()).validate(new TextEncoder().encode(toXRechnungCii(syntheticInvoice(i))));
    expect(report.scenario).toBe("EN16931 XRechnung (CII)");
    expect(report.steps.flatMap((s) => s.messages).filter((m) => m.customLevel === "error")).toEqual([]);
    expect(report.accepted).toBe(true);
  });
  it("[CONV-07] special characters are escaped", () => {
    const inv = syntheticInvoice(1);
    inv.lines[0].description = 'Schrauben <M8> & "Muttern"';
    expect(toXRechnungCii(inv)).toContain("Schrauben &lt;M8&gt; &amp; &quot;Muttern&quot;");
  });
});

describe("[CONV-08] the generated XML is re-checked", () => {
  it("[CONV-08] approved review -> XML + accepted report", async () => {
    const { data, text } = sampleExtraction();
    const r0 = buildReview(data, text);
    const r = approveAll(r0, r0.fields.map((f) => f.path));
    const { xml, report } = await convertAndCheck(toApproved(r), await getValidator());
    expect(xml).toContain("xrechnung_3.0");
    expect(report.accepted).toBe(true);
  });
  it("[CONV-08] an invoice missing XRechnung data is rejected and the report says why", async () => {
    const inv = syntheticInvoice(2);
    inv.seller.email = undefined; // BR-DE-7 and PEPPOL-EN16931-R020
    const { report } = await convertAndCheck(inv, await getValidator());
    expect(report.accepted).toBe(false);
    const codes = report.steps.flatMap((s) => s.messages).map((m) => m.code);
    expect(codes).toContain("BR-DE-7");
  });
});

describe("[CONV-09] the extraction route keeps the key server-side and limits size", () => {
  const deps = { env: { GROQ_API_KEY: "gsk_topsecret" }, recordings: [], system: "s" };
  it("[CONV-09] bodies over 4 MB are rejected before any model call", async () => {
    const r = await handleExtract("x".repeat(MAX_BODY_BYTES + 1), deps);
    expect(r.status).toBe(413);
  });
  it("[CONV-09] malformed requests are rejected", async () => {
    expect((await handleExtract("{}", deps)).status).toBe(400);
    expect((await handleExtract(JSON.stringify({ documentSha256: "zz", input: { kind: "text", text: "a" } }), deps)).status).toBe(400);
  });
  it("[CONV-09] provider errors never echo the key", async () => {
    const fetchImpl = (async () => new Response("invalid key gsk_topsecret", { status: 401 })) as typeof fetch;
    const r = await handleExtract(JSON.stringify({ documentSha256: SHA, input: { kind: "text", text: "Rechnung" } }), { ...deps, fetchImpl });
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.json)).not.toContain("gsk_topsecret");
  });
  it("[CONV-09] the route reads the key only from process.env and the client never imports the service", () => {
    const route = readFileSync(join(import.meta.dirname, "../../src/app/api/extract/route.ts"), "utf8");
    expect(route).toMatch(/process\.env\.GROQ_API_KEY/);
    expect(route).not.toMatch(/["']use client["']/);
  });
  it("[CONV-09] without a key and without a recording the answer is 404, not an invention", async () => {
    const r = await handleExtract(JSON.stringify({ documentSha256: SHA, input: { kind: "text", text: "Rechnung" } }), { env: {}, recordings: [], system: "s" });
    expect(r.status).toBe(404);
  });
});
