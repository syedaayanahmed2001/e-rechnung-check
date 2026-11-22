/**
 * Downloads the openly licensed external sample corpus used for extra parity coverage and for
 * the ZUGFeRD extraction eval. Nothing here is committed: files land in .cache/external/.
 *
 * Source: https://github.com/ZUGFeRD/corpus (Apache-2.0), pinned to a commit.
 *   - XML-Rechnung/CII, XML-Rechnung/UBL: XML invoices (parity)
 *   - XML-Rechnung/FX: Factur-X / ZUGFeRD PDFs with embedded XML (eval)
 *
 * Provenance note (see THIRD_PARTY_NOTICES.md): the corpus maintainers derived the
 * XML-Rechnung samples from AWV/FeRD's public ZUGFeRD package and publish them under Apache-2.0.
 *
 *   node scripts/corpus/fetch-external.ts
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, ".cache", "external", "zugferd-corpus");
const REPO = "ZUGFeRD/corpus";
const FOLDERS = ["XML-Rechnung/CII", "XML-Rechnung/UBL", "XML-Rechnung/FX"];

async function main(): Promise<void> {
  const ref = process.env.ZUGFERD_CORPUS_REF ?? (await latestCommit());
  const tree = (await (await fetch(`https://api.github.com/repos/${REPO}/git/trees/${ref}?recursive=1`)).json()) as {
    tree: { path: string; type: string }[];
  };
  const wanted = tree.tree.filter(
    (t) => t.type === "blob" && FOLDERS.some((f) => t.path.startsWith(f + "/")) && /\.(xml|pdf)$/i.test(t.path),
  );
  let fetched = 0;
  for (const t of wanted) {
    const target = join(OUT, t.path);
    if (existsSync(target)) continue;
    const res = await fetch(`https://raw.githubusercontent.com/${REPO}/${ref}/${encodeURI(t.path)}`);
    if (!res.ok) throw new Error(`${res.status} ${t.path}`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, new Uint8Array(await res.arrayBuffer()));
    fetched++;
  }
  writeFileSync(join(OUT, "SOURCE.txt"), `https://github.com/${REPO} @ ${ref}\nLicence: Apache-2.0\n`);
  console.log(`${wanted.length} files listed, ${fetched} downloaded, ref ${ref}`);
}

async function latestCommit(): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/commits/master`);
  return ((await res.json()) as { sha: string }).sha;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
