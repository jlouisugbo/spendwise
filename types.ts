// Shared types. Imported by every layer, imports nothing.

export const CATEGORIES = [
  "Groceries",
  "Dining",
  "Transport",
  "Shopping",
  "Subscriptions",
  "Utilities",
  "Income",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  rawDescription: string; // exactly what the bank sent; never modified
  merchant: string; // display name produced by normalizeMerchant()
  category: Category;
  amountCents: number; // integer cents, negative = money out
}

// One card transaction as the bank reports it.
export interface NewTransaction {
  date: string;
  description: string;
  amountCents: number;
}

export interface TransactionFilter {
  category?: Category;
  merchant?: string;
  month?: string; // YYYY-MM
}

export interface MerchantSummary {
  name: string;
  rawDescriptions: string[]; // every distinct bank descriptor that normalized to this name
  transactionCount: number;
  totalCents: number;
}

export interface MonthlySummary {
  month: string;
  spendingCents: Record<Category, number>; // positive numbers, per category
  incomeCents: number;
}

// Shape of db.json (and seed.json).
export interface Db {
  transactions: Transaction[];
}
