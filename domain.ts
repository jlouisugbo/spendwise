// Business rules. Pure functions only: no express, no fs, no store.

import { randomUUID } from "node:crypto";
import { Category, NewTransaction, Transaction } from "./types";

const ID_LENGTH = 12;

// Payment processors prepend their own tag to the merchant name.
const PROCESSOR_PREFIXES = [/^SQ \*/, /^TST\* ?/, /^PAYPAL \*/, /^GOOGLE \*/];

// Descriptors that should collapse to one well-known name (matched against the start).
const ALIASES: Record<string, string> = {
  "AMZN MKTP": "Amazon",
  "AMAZON.COM": "Amazon",
  WHOLEFDS: "Whole Foods",
  "WHOLE FOODS": "Whole Foods",
  "UBER EATS": "Uber Eats",
  "NETFLIX.COM": "Netflix",
  SPOTIFY: "Spotify",
};

// Best-effort category guess. Order matters: "uber eats" must beat "uber".
const CATEGORY_KEYWORDS: Array<[string, Category]> = [
  ["whole foods", "Groceries"],
  ["trader joe", "Groceries"],
  ["safeway", "Groceries"],
  ["coffee", "Dining"],
  ["uber eats", "Dining"],
  ["chipotle", "Dining"],
  ["uber", "Transport"],
  ["lyft", "Transport"],
  ["shell", "Transport"],
  ["amazon", "Shopping"],
  ["target", "Shopping"],
  ["netflix", "Subscriptions"],
  ["spotify", "Subscriptions"],
  ["pg&e", "Utilities"],
  ["comcast", "Utilities"],
  ["payroll", "Income"],
];

// "SQ *BLUE BOTTLE COFFEE #118   OAKLAND CA"  ->  "Blue Bottle Coffee"
// "AMZN Mktp US*2K4L91   Amzn.com/bill WA"    ->  "Amazon"
export function normalizeMerchant(rawDescription: string): string {
  // Banks pad the location onto the end after 2+ spaces. Drop it.
  let s = rawDescription.split(/\s{2,}/)[0].trim().toUpperCase();

  for (const prefix of PROCESSOR_PREFIXES) {
    s = s.replace(prefix, "");
  }

  for (const [start, name] of Object.entries(ALIASES)) {
    if (s.startsWith(start)) return name;
  }

  s = s
    .replace(/#\s?\d+/g, "") // store numbers: "#118"
    .replace(/\*\w+$/, "") // trailing order ids: "*2K4L91"
    .replace(/\s+/g, " ")
    .trim();

  return titleCase(s);
}

// Canonical form for comparing merchant names, never compare display strings with ===.
export function merchantKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function categorize(merchant: string, amountCents: number): Category {
  if (amountCents > 0) return "Income";
  const key = merchantKey(merchant);
  for (const [keyword, category] of CATEGORY_KEYWORDS) {
    if (key.includes(keyword)) return category;
  }
  return "Other";
}

// What the bank sent -> the Transaction we store.
export function buildTransaction(input: NewTransaction): Transaction {
  const merchant = normalizeMerchant(input.description);
  return {
    id: randomUUID().replace(/-/g, "").slice(0, ID_LENGTH),
    date: input.date,
    rawDescription: input.description,
    merchant,
    category: categorize(merchant, input.amountCents),
    amountCents: input.amountCents,
  };
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
