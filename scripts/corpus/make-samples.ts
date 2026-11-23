/**
 * Copies demo samples for the web app into public/samples/ (all from the author's synthetic corpus):
 *   valid.xml    a valid XRechnung 3.0 CII
 *   invalid.xml  the same kind of invoice with two faults: wrong grand total (BR-CO-15) and no
 *                buyer reference (BR-DE-15)
 *   hybrid.pdf   a ZUGFeRD-style PDF with embedded XML
 *   plain.pdf    a plain PDF invoice (input for Convert; a recording exists for it)
 *
 *   node scripts/corpus/make-samples.ts
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SYN = join(ROOT, "corpus", "synthetic");
const OUT = join(ROOT, "public", "samples");

mkdirSync(OUT, { recursive: true });
copyFileSync(join(SYN, "xml", "syn-01.xml"), join(OUT, "valid.xml"));
const broken = readFileSync(join(SYN, "xml", "syn-02.xml"), "utf8")
  .replace(/<ram:BuyerReference>[^<]*<\/ram:BuyerReference>/, "")
  .replace(/<ram:GrandTotalAmount>([\d.]+)<\/ram:GrandTotalAmount>/, (_m, v: string) => `<ram:GrandTotalAmount>${(Number(v) + 10).toFixed(2)}</ram:GrandTotalAmount>`);
writeFileSync(join(OUT, "invalid.xml"), broken);
copyFileSync(join(SYN, "hybrid", "syn-04.pdf"), join(OUT, "hybrid.pdf"));
copyFileSync(join(SYN, "plain", "syn-05.pdf"), join(OUT, "plain.pdf"));
console.log(`wrote samples to ${OUT}`);
