/**
 * The approved invoice (plain values, after human review) and the arithmetic. Totals and the
 * VAT breakdown are always computed here from the lines, never taken from the model (CONV-07).
 * All money math is exact: BigInt on scaled integers, rounded half-up to the cent.
 */

export type VatCategory = "S" | "Z" | "E" | "AE";

export type ApprovedLine = {
  description: string;
  quantity: number;
  /** UN/ECE Recommendation 20 code, e.g. H87 (piece), HUR (hour). */
  unitCode: string;
  unitPrice: number;
  vatRate: number;
  vatCategory: VatCategory;
};

export type ApprovedParty = {
  name: string;
  street: string;
  postcode: string;
  city: string;
  country: string;
  vatId?: string;
  taxNumber?: string;
  email?: string;
  phone?: string;
  contactName?: string;
};

export type ApprovedInvoice = {
  invoiceNumber: string;
  issueDate: string;
  deliveryDate?: string;
  dueDate?: string;
  currency: string;
  buyerReference: string;
  seller: ApprovedParty;
  buyer: ApprovedParty;
  iban?: string;
  bic?: string;
  paymentTerms?: string;
  /** Already paid amount (BT-113), default 0. */
  prepaid?: number;
  /** Required for category E (BT-120). */
  exemptionReason?: string;
  lines: ApprovedLine[];
};

export type VatGroup = { category: VatCategory; rate: number; baseCents: bigint; taxCents: bigint };

export type Totals = {
  lines: bigint[];
  lineTotalCents: bigint;
  taxBasisCents: bigint;
  taxTotalCents: bigint;
  grandTotalCents: bigint;
  prepaidCents: bigint;
  duePayableCents: bigint;
  groups: VatGroup[];
};

const SCALE = 10_000n; // 4 decimals for quantities, prices and rates

function scaled(n: number): bigint {
  if (!Number.isFinite(n)) throw new Error(`not a number: ${n}`);
  // toFixed(4) avoids binary floating-point artefacts such as 0.1 + 0.2.
  const [int, frac = ""] = Math.abs(n).toFixed(4).split(".");
  const v = BigInt(int) * SCALE + BigInt(frac.padEnd(4, "0"));
  return n < 0 ? -v : v;
}

/** Divide and round half away from zero. */
function divRound(a: bigint, b: bigint): bigint {
  const neg = a < 0n !== b < 0n;
  const [x, y] = [a < 0n ? -a : a, b < 0n ? -b : b];
  const q = (x * 2n + y) / (y * 2n);
  return neg ? -q : q;
}

export function toCents(n: number): bigint {
  return divRound(scaled(n), SCALE / 100n);
}

export function lineNetCents(line: Pick<ApprovedLine, "quantity" | "unitPrice">): bigint {
  // qty (x1e4) * price (x1e4) = x1e8; cents = /1e6
  return divRound(scaled(line.quantity) * scaled(line.unitPrice), 1_000_000n);
}

export function computeTotals(inv: Pick<ApprovedInvoice, "lines" | "prepaid">): Totals {
  const lines = inv.lines.map(lineNetCents);
  const byKey = new Map<string, VatGroup>();
  inv.lines.forEach((l, i) => {
    const key = `${l.vatCategory}|${l.vatRate}`;
    const g = byKey.get(key) ?? { category: l.vatCategory, rate: l.vatRate, baseCents: 0n, taxCents: 0n };
    g.baseCents += lines[i];
    byKey.set(key, g);
  });
  const groups = [...byKey.values()].map((g) => ({
    ...g,
    // BR-CO-17: tax = base x rate / 100, rounded to 2 decimals
    taxCents: g.category === "S" ? divRound(g.baseCents * scaled(g.rate), 100n * SCALE) : 0n,
  }));
  const lineTotalCents = lines.reduce((a, b) => a + b, 0n);
  const taxTotalCents = groups.reduce((a, g) => a + g.taxCents, 0n);
  const prepaidCents = toCents(inv.prepaid ?? 0);
  const grandTotalCents = lineTotalCents + taxTotalCents;
  return {
    lines,
    lineTotalCents,
    taxBasisCents: lineTotalCents,
    taxTotalCents,
    grandTotalCents,
    prepaidCents,
    duePayableCents: grandTotalCents - prepaidCents,
    groups,
  };
}

export function formatCents(c: bigint): string {
  const neg = c < 0n;
  const abs = neg ? -c : c;
  return `${neg ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

/** Compares computed totals with the totals printed on the source invoice (warnings, CONV-07). */
export function totalsMismatches(
  t: Totals,
  printed: { netTotal?: number | null; vatTotal?: number | null; grossTotal?: number | null; amountDue?: number | null },
): { field: string; printed: string; computed: string }[] {
  const pairs: [string, number | null | undefined, bigint][] = [
    ["netTotal", printed.netTotal, t.taxBasisCents],
    ["vatTotal", printed.vatTotal, t.taxTotalCents],
    ["grossTotal", printed.grossTotal, t.grandTotalCents],
    ["amountDue", printed.amountDue, t.duePayableCents],
  ];
  return pairs
    .filter(([, p]) => p !== null && p !== undefined)
    .filter(([, p, c]) => toCents(p as number) !== c)
    .map(([field, p, c]) => ({ field, printed: formatCents(toCents(p as number)), computed: formatCents(c) }));
}

const UNIT_MAP: [RegExp, string][] = [
  [/^(stk|st|stück|stueck|pcs?|piece|x)\.?$/i, "H87"],
  [/^(std|stunde|stunden|h|hrs?|hour|hours)\.?$/i, "HUR"],
  [/^(kg|kilogramm)$/i, "KGM"],
  [/^(g|gramm)$/i, "GRM"],
  [/^(m|meter)$/i, "MTR"],
  [/^(m2|m²|qm)$/i, "MTK"],
  [/^(l|liter)$/i, "LTR"],
  [/^(tag|tage|day|days)$/i, "DAY"],
  [/^(monat|monate|month|months)$/i, "MON"],
  [/^(pauschal|pausch\.?|psch\.?|lump ?sum)$/i, "LS"],
];

/** Maps a printed unit to a UN/ECE Rec. 20 code; C62 ("one") when unknown. The reviewer can change it. */
export function unitCodeFor(unit: string | null | undefined): string {
  const u = (unit ?? "").trim();
  for (const [re, code] of UNIT_MAP) if (re.test(u)) return code;
  return "C62";
}
