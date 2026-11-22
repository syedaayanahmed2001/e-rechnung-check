/**
 * The official KoSIT XRechnung validator configuration, executed in JavaScript.
 *
 *  - well-formedness and XML Schema: libxml2 (compiled to WebAssembly, MIT)
 *  - scenario selection and Schematron: SaxonJS 2 running the official compiled XSLT
 *    (exported once to SEF at build time, see scripts/rules/build-rules.ts)
 *  - verdict: report-assembly.ts (port of default-report.xsl)
 *
 * Runs unchanged in Node (tests, parity job) and in the browser (the invoice never leaves
 * the device). Environment specifics are injected: the SaxonJS build, libxml2 and a loader
 * for the rule files.
 */
import type * as Libxml from "libxml2-wasm";
import type { KositConfig, Scenario } from "./kosit-config.ts";
import { customLevel, finishReport, normaliseSpace, stepValid, svrlLevel } from "./report-assembly.ts";
import type { SaxonApi, SaxonNode } from "./saxon-types.ts";
import type { DocumentData, Message, StepResult, ValidationReport, Validator } from "./types.ts";

export type RuleLoader = {
  /** Parsed SEF (JSON) for an XSLT location from scenarios.xml. */
  sef(location: string): Promise<unknown>;
  /** Raw bytes of a file in the configuration repository (XSD files). */
  bytes(location: string): Promise<Uint8Array>;
};

export type KositJsDeps = {
  saxon: SaxonApi;
  libxml: typeof Libxml;
  config: KositConfig;
  loader: RuleLoader;
};

const SVRL_NS = { svrl: "http://purl.oclc.org/dsdl/svrl" };

/** libxml2 resolves includes against this pseudo base; the buffer provider serves it. */
const XSD_BASE = "file:///kosit/";

export function decodeXml(bytes: Uint8Array): string {
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 200));
  const declared = /^\s*<\?xml[^>]*encoding\s*=\s*["']([A-Za-z0-9._-]+)["']/.exec(head)?.[1];
  const label = declared && declared.toLowerCase() !== "utf-8" ? declared : "utf-8";
  try {
    // Strip a UTF-8 BOM and any XML declaration: the string is already decoded.
    return new TextDecoder(label).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
  }
}

function dirOf(location: string): string {
  return location.slice(0, location.lastIndexOf("/") + 1);
}

/** Resolve "a/b/../c.xsd" style paths inside the repository. */
function joinPath(base: string, relative: string): string {
  const parts = (dirOf(base) + relative).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p !== ".") out.push(p);
  }
  return out.join("/");
}

export class KositJsValidator implements Validator {
  readonly engine: string;
  private readonly deps: KositJsDeps;
  private readonly xsdValidators = new Map<string, Promise<Libxml.XsdValidator>>();
  private readonly xsdProvider: Libxml.XmlBufferInputProvider;

  constructor(deps: KositJsDeps) {
    this.deps = deps;
    const info = deps.saxon.getProcessorInfo();
    this.engine = `KoSIT rules in JavaScript (${info.productName} ${info.productVersion}, libxml2-wasm)`;
    this.xsdProvider = new deps.libxml.XmlBufferInputProvider({});
    deps.libxml.xmlRegisterInputProvider(this.xsdProvider);
  }

  get configuration(): string {
    return `${this.deps.config.name} (${this.deps.config.date})`;
  }

  /** Loads an XSD and everything it includes/imports, transitively, into the buffer provider. */
  private async loadSchemaClosure(location: string, seen = new Set<string>()): Promise<void> {
    if (seen.has(location)) return;
    seen.add(location);
    const bytes = await this.deps.loader.bytes(location);
    this.xsdProvider.addBuffer(XSD_BASE + location, bytes);
    const text = new TextDecoder().decode(bytes);
    const refs = [...text.matchAll(/<xsd?:(?:include|import)\b[^>]*schemaLocation\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
    await Promise.all(refs.map((r) => this.loadSchemaClosure(joinPath(location, r), seen)));
  }

  private xsdValidator(location: string): Promise<Libxml.XsdValidator> {
    let v = this.xsdValidators.get(location);
    if (!v) {
      v = (async () => {
        await this.loadSchemaClosure(location);
        const bytes = await this.deps.loader.bytes(location);
        const doc = this.deps.libxml.XmlDocument.fromBuffer(bytes, { url: XSD_BASE + location });
        try {
          return this.deps.libxml.XsdValidator.fromDoc(doc);
        } finally {
          doc.dispose();
        }
      })();
      this.xsdValidators.set(location, v);
    }
    return v;
  }

  private matchScenario(doc: SaxonNode): Scenario | null {
    for (const scenario of this.deps.config.scenarios) {
      const hit = this.deps.saxon.XPath.evaluate(scenario.match, doc, {
        namespaceContext: scenario.namespaces,
      });
      if (hit === true) return scenario;
    }
    return null;
  }

  private documentData(doc: SaxonNode): DocumentData {
    const ns = {
      cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
      cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
      rsm: "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
      ram: "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
      udt: "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
    };
    const pick = (xpath: string): string | undefined => {
      const v = this.deps.saxon.XPath.evaluate(`string((${xpath})[1])`, doc, { namespaceContext: ns });
      return typeof v === "string" && v !== "" ? v : undefined;
    };
    return {
      seller: pick(
        "/*/cac:AccountingSupplierParty/cac:Party/cac:PartyLegalEntity/cbc:RegistrationName, /rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:Name",
      ),
      invoiceNumber: pick("/*/cbc:ID, /rsm:CrossIndustryInvoice/rsm:ExchangedDocument/ram:ID"),
      issueDate: pick(
        "/*/cbc:IssueDate, /rsm:CrossIndustryInvoice/rsm:ExchangedDocument/ram:IssueDateTime/udt:DateTimeString",
      ),
    };
  }

  private async runSchematron(
    stepId: string,
    resource: { name: string; location: string },
    doc: SaxonNode,
    scenario: Scenario,
  ): Promise<StepResult> {
    const sef = await this.deps.loader.sef(resource.location);
    let svrl: SaxonNode;
    try {
      svrl = (
        await this.deps.saxon.transform(
          { stylesheetInternal: sef, sourceNode: doc, destination: "document" },
          "async",
        )
      ).principalResult;
    } catch (e) {
      // default-report.xsl: no SVRL -> PROCESSING_ERROR, step invalid.
      return {
        id: stepId,
        kind: "schematron",
        resource,
        valid: false,
        messages: [
          {
            id: `${stepId}.processing-error`,
            code: "PROCESSING_ERROR",
            level: "error",
            customLevel: "error",
            xpathLocation: "/",
            text: `The Schematron validation did not produce an SVRL result. ${String(e)}`,
          },
        ],
      };
    }

    const rows = this.deps.saxon.XPath.evaluate(
      `array { for $a in /svrl:schematron-output/(svrl:failed-assert | svrl:successful-report)
               return map { 'id': string($a/@id), 'hasId': exists($a/@id), 'flag': string($a/@flag),
                            'role': string($a/@role), 'location': string($a/@location),
                            'text': string-join($a/svrl:text, ' ') } }`,
      svrl,
      { namespaceContext: SVRL_NS },
    ) as { id: string; hasId: boolean; flag: string; role: string; location: string; text: string }[];

    const messages: Message[] = rows.map((r, i) => {
      const code = r.hasId ? r.id : "UNSPECIFIC";
      const level = svrlLevel(r.flag || undefined, r.role || undefined);
      return {
        id: `${stepId}.${i + 1}`,
        code,
        level,
        customLevel: customLevel(code, level, scenario.customLevels),
        xpathLocation: r.location || undefined,
        text: normaliseSpace(r.text),
      };
    });
    return { id: stepId, kind: "schematron", resource, valid: stepValid(messages), messages };
  }

  async validate(input: Uint8Array): Promise<ValidationReport> {
    const started = performance.now();
    const { libxml, saxon } = this.deps;
    const base = { engine: this.engine, configuration: this.configuration };
    const done = (r: Omit<ValidationReport, "valid" | "accepted">, processingError: boolean) => ({
      ...finishReport(r, processingError),
      durationMs: Math.round(performance.now() - started),
    });

    // 1. Well-formedness (libxml2).
    let libDoc: Libxml.XmlDocument;
    try {
      libDoc = libxml.XmlDocument.fromBuffer(input);
    } catch (e) {
      const details = (e as { details?: { message: string; line: number; col: number }[] }).details ?? [];
      const messages: Message[] = (details.length ? details : [{ message: String(e), line: -1, col: -1 }]).map(
        (d, i) => ({
          id: `val-xml.${i + 1}`,
          code: "generic-error",
          level: "error",
          customLevel: "error",
          line: d.line > 0 ? d.line : undefined,
          column: d.col > 0 ? d.col : undefined,
          text: normaliseSpace(d.message),
        }),
      );
      return done({ ...base, scenario: null, steps: [{ id: "val-xml", kind: "xml", valid: false, messages }] }, true);
    }

    try {
      const xmlStep: StepResult = { id: "val-xml", kind: "xml", valid: true, messages: [] };

      // 2. Scenario selection (official XPath from scenarios.xml, evaluated by SaxonJS).
      const doc = await saxon.getResource({ text: decodeXml(input), type: "xml" });
      const scenario = this.matchScenario(doc);
      if (!scenario) return done({ ...base, scenario: null, steps: [xmlStep] }, false);
      const documentData = this.documentData(doc);

      // 3. XML Schema (libxml2).
      const xsd = await this.xsdValidator(scenario.xmlSchema.location);
      const xsdMessages: Message[] = [];
      try {
        xsd.validate(libDoc);
      } catch (e) {
        const details = (e as { details?: { message: string; line: number; col: number; level: number }[] })
          .details ?? [{ message: String(e), line: -1, col: -1, level: 2 }];
        details.forEach((d, i) => {
          const level = d.level === 1 ? "warning" : "error";
          xsdMessages.push({
            id: `val-xsd.${i + 1}`,
            code: "generic-error",
            level,
            customLevel: level,
            line: d.line > 0 ? d.line : undefined,
            column: d.col > 0 ? d.col : undefined,
            text: normaliseSpace(d.message),
          });
        });
      }
      const xsdStep: StepResult = {
        id: "val-xsd",
        kind: "xsd",
        resource: scenario.xmlSchema,
        valid: stepValid(xsdMessages),
        messages: xsdMessages,
      };
      // KoSIT runs Schematron only on schema-valid documents.
      if (!xsdStep.valid) {
        return done({ ...base, scenario: scenario.name, documentData, steps: [xsdStep, xmlStep] }, false);
      }

      // 4. Schematron (official compiled XSLT, in SaxonJS).
      const schSteps: StepResult[] = [];
      for (const [i, res] of scenario.schematron.entries()) {
        schSteps.push(await this.runSchematron(`val-sch.${i + 1}`, res, doc, scenario));
      }

      return done({ ...base, scenario: scenario.name, documentData, steps: [xsdStep, ...schSteps, xmlStep] }, false);
    } finally {
      libDoc.dispose();
    }
  }
}
