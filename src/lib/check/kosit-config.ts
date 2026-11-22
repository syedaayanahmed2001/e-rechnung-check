/**
 * Reads the official KoSIT `scenarios.xml` into plain data. The JS validator is driven by this
 * file exactly as the Java validator is, so a new KoSIT configuration release is a file swap,
 * not a code change.
 */
import { DOMParser, type Element } from "@xmldom/xmldom";
import type { Level } from "./types.ts";

const SCENARIOS_NS = "http://www.xoev.de/de/validator/framework/1/scenarios";

export type Resource = { name: string; location: string };

export type Scenario = {
  name: string;
  /** prefix -> namespace URI, used for `match` and `acceptMatch`. */
  namespaces: Record<string, string>;
  /** XPath 3.1 expression; the first scenario whose match is true is used. */
  match: string;
  xmlSchema: Resource;
  schematron: Resource[];
  report: Resource;
  /** Rule code -> overriding level, from <customLevel>. */
  customLevels: Record<string, Level>;
};

export type KositConfig = {
  name: string;
  date: string;
  scenarios: Scenario[];
};

function children(el: Element, local: string): Element[] {
  return Array.from(el.childNodes).filter(
    (n): n is Element =>
      n.nodeType === 1 && (n as Element).namespaceURI === SCENARIOS_NS && (n as Element).localName === local,
  );
}

function child(el: Element, local: string): Element {
  const found = children(el, local)[0];
  if (!found) throw new Error(`scenarios.xml: <${local}> missing in <${el.localName}>`);
  return found;
}

function text(el: Element): string {
  return (el.textContent ?? "").trim();
}

function resource(el: Element): Resource {
  return { name: text(child(el, "name")), location: text(child(el, "location")) };
}

export function parseKositConfig(xml: string): KositConfig {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const root = doc.documentElement as Element | null;
  if (!root || root.localName !== "scenarios") throw new Error("scenarios.xml: root is not <scenarios>");

  const scenarios = children(root, "scenario").map((s): Scenario => {
    const namespaces: Record<string, string> = {};
    for (const ns of children(s, "namespace")) namespaces[ns.getAttribute("prefix") ?? ""] = text(ns);

    const createReport = child(s, "createReport");
    const customLevels: Record<string, Level> = {};
    for (const cl of children(createReport, "customLevel")) {
      const level = cl.getAttribute("level") as Level;
      for (const code of text(cl).split(/\s+/)) if (code) customLevels[code] = level;
    }

    return {
      name: text(child(s, "name")),
      namespaces,
      match: text(child(s, "match")),
      xmlSchema: resource(child(child(s, "validateWithXmlSchema"), "resource")),
      schematron: children(s, "validateWithSchematron").map((v) => resource(child(v, "resource"))),
      report: resource(child(createReport, "resource")),
      customLevels,
    };
  });

  return { name: text(child(root, "name")), date: text(child(root, "date")), scenarios };
}

/** Every XSLT the configuration references (Schematron steps only; reports are assembled in code). */
export function schematronLocations(config: KositConfig): string[] {
  return [...new Set(config.scenarios.flatMap((s) => s.schematron.map((r) => r.location)))];
}
