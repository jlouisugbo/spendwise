// Persistence. The only module that touches the disk.
// State lives in db.json, held in memory while the server runs.

import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { Db, Transaction } from "./types";

let dbPath = "";
let db: Db = { transactions: [] };

// First run: db.json doesn't exist, so it starts as a copy of seed.json.
// After that db.json is loaded as-is and the seed is never read (or written) again.
export function loadDb(path: string, seedPath: string): void {
  if (!existsSync(path)) copyFileSync(seedPath, path);
  dbPath = path;
  db = JSON.parse(readFileSync(path, "utf8")) as Db;
}

export function saveDb(): void {
  writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

// Newest first. Returns copies so callers can't mutate state by accident.
export function allTransactions(): Transaction[] {
  return [...db.transactions].sort((a, b) => b.date.localeCompare(a.date)).map((t) => ({ ...t }));
}

export function findTransaction(id: string): Transaction | undefined {
  const found = db.transactions.find((t) => t.id === id);
  return found && { ...found };
}

export function insertTransaction(transaction: Transaction): Transaction {
  db = { ...db, transactions: [...db.transactions, transaction] };
  return { ...transaction };
}
