// Use cases. Knows nothing about HTTP; orchestrates domain rules and the store.

import { buildTransaction, merchantKey } from "./domain";
import { allTransactions, findTransaction, insertTransaction, saveDb } from "./store";
import {
  CATEGORIES,
  Category,
  MerchantSummary,
  MonthlySummary,
  NewTransaction,
  Transaction,
  TransactionFilter,
} from "./types";

export class NotFoundError extends Error {}

export function listTransactions(filter: TransactionFilter = {}): Transaction[] {
  const key = filter.merchant && merchantKey(filter.merchant);
  return allTransactions().filter(
    (t) =>
      (!filter.category || t.category === filter.category) &&
      (!key || merchantKey(t.merchant) === key) &&
      (!filter.month || t.date.startsWith(filter.month)),
  );
}

export function getTransaction(id: string): Transaction {
  const found = findTransaction(id);
  if (!found) throw new NotFoundError(`transaction ${id} not found`);
  return found;
}

// Stands in for the bank's feed: normalize, categorize, store, persist.
export function addTransaction(input: NewTransaction): Transaction {
  const created = insertTransaction(buildTransaction(input));
  saveDb();
  return created;
}

// "Amazon  <-  AMZN Mktp US*2K4L91, AMAZON.COM*7Y2..."
export function listMerchants(): MerchantSummary[] {
  const byKey = new Map<string, MerchantSummary>();

  for (const t of allTransactions()) {
    const key = merchantKey(t.merchant);
    const existing = byKey.get(key) ?? {
      name: t.merchant,
      rawDescriptions: [],
      transactionCount: 0,
      totalCents: 0,
    };
    byKey.set(key, {
      ...existing,
      rawDescriptions: existing.rawDescriptions.includes(t.rawDescription)
        ? existing.rawDescriptions
        : [...existing.rawDescriptions, t.rawDescription],
      transactionCount: existing.transactionCount + 1,
      totalCents: existing.totalCents + t.amountCents,
    });
  }

  return [...byKey.values()].sort((a, b) => a.totalCents - b.totalCents);
}

// Spending per category for one month (as positive cents). Income is reported separately.
export function monthlySummary(month: string): MonthlySummary {
  const spendingCents = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  let incomeCents = 0;

  for (const t of listTransactions({ month })) {
    if (t.amountCents > 0) incomeCents += t.amountCents;
    else spendingCents[t.category] += -t.amountCents;
  }

  return { month, spendingCents, incomeCents };
}
