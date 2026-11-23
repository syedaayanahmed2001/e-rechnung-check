/**
 * Browser wiring for the JS validator. Everything is loaded from this site's own static files
 * (/rules/*, /vendor/saxon-js/*). The invoice itself is never sent anywhere (CHECK-03).
 */
"use client";

import { KositJsValidator } from "./kosit-js.ts";
import { parseKositConfig } from "./kosit-config.ts";
import type { SaxonApi } from "./saxon-types.ts";

declare global {
  interface Window {
    SaxonJS?: SaxonApi;
  }
}

let instance: Promise<KositJsValidator> | undefined;

function loadSaxon(): Promise<SaxonApi> {
  if (window.SaxonJS) return Promise.resolve(window.SaxonJS);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/vendor/saxon-js/SaxonJS2.js";
    s.async = true;
    s.onload = () => (window.SaxonJS ? resolve(window.SaxonJS) : reject(new Error("SaxonJS did not load")));
    s.onerror = () => reject(new Error("SaxonJS could not be loaded"));
    document.head.appendChild(s);
  });
}

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

export function getBrowserValidator(): Promise<KositJsValidator> {
  instance ??= (async () => {
    const [saxon, libxml, scenarios] = await Promise.all([
      loadSaxon(),
      import("libxml2-wasm"),
      fetchOk("/rules/scenarios.xml").then((r) => r.text()),
    ]);
    const sefCache = new Map<string, Promise<unknown>>();
    return new KositJsValidator({
      saxon,
      libxml,
      config: parseKositConfig(scenarios),
      loader: {
        sef(location) {
          let p = sefCache.get(location);
          if (!p) {
            p = fetchOk(`/rules/${location}.sef.json`).then((r) => r.json());
            sefCache.set(location, p);
          }
          return p;
        },
        async bytes(location) {
          return new Uint8Array(await (await fetchOk(`/rules/${location}`)).arrayBuffer());
        },
      },
    });
  })();
  instance.catch(() => (instance = undefined));
  return instance;
}
