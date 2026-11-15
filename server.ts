// HTTP layer. Validates input, calls the service, shapes the response.
// No business rules here.

import express, { NextFunction, Request, Response } from "express";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { addTransaction, getTransaction, listMerchants, listTransactions, monthlySummary, NotFoundError } from "./service";
import { loadDb } from "./store";
import { CATEGORIES, NewTransaction } from "./types";

const here = path.dirname(fileURLToPath(import.meta.url));

// ---- Validation (zod, at the boundary) -----------------------------------

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

const newTransactionSchema: z.ZodType<NewTransaction, z.ZodTypeDef, unknown> = z
  .object({
    date: z.string().regex(DATE, "date must be YYYY-MM-DD"),
    description: z.string().trim().min(1, "description is required").max(200),
    amountCents: z
      .number()
      .int("amountCents must be whole cents")
      .refine((cents) => cents !== 0, "amountCents must not be 0"),
  })
  .strict();

const transactionQuerySchema = z.object({
  category: z.enum(CATEGORIES).optional(),
  merchant: z.string().optional(),
  month: z.string().regex(MONTH, "month must be YYYY-MM").optional(),
});

const summaryQuerySchema = z.object({
  month: z.string().regex(MONTH, "month must be YYYY-MM"),
});

class BadRequestError extends Error {}

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw new BadRequestError((issue.path.length ? `${issue.path.join(".")}: ` : "") + issue.message);
}

// ---- App ------------------------------------------------------------------

// Call loadDb() before this so the service has data to serve.
export function createApp() {
  const app = express();
  app.use(express.json());

  // Frontend: one static file, served explicitly so source files aren't exposed.
  app.get("/", (_req, res) => res.sendFile(path.join(here, "index.html")));

  app.get("/transactions", (req, res) => {
    const transactions = listTransactions(parse(transactionQuerySchema, req.query));
    res.json({ transactions, count: transactions.length });
  });

  app.get("/transactions/:id", (req, res) => {
    res.json(getTransaction(req.params.id));
  });

  app.post("/transactions", (req, res) => {
    res.status(201).json(addTransaction(parse(newTransactionSchema, req.body)));
  });

  app.get("/merchants", (_req, res) => {
    res.json({ merchants: listMerchants() });
  });

  app.get("/summary", (req, res) => {
    res.json(monthlySummary(parse(summaryQuerySchema, req.query).month));
  });

  // The only place that writes error bodies: { error: { code, message } }
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof BadRequestError) {
      res.status(400).json({ error: { code: "bad_request", message: err.message } });
    } else if (err instanceof NotFoundError) {
      res.status(404).json({ error: { code: "not_found", message: err.message } });
    } else {
      console.error(err);
      res.status(500).json({ error: { code: "internal", message: "Something went wrong" } });
    }
  });

  return app;
}

// ---- Entry point (only when run directly, so tests can import createApp) ---

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  loadDb(process.env.DB_PATH ?? "db.json", process.env.SEED_PATH ?? "seed.json");
  createApp().listen(port, () => process.stdout.write(`spendwise listening on http://localhost:${port}\n`));
}
