import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "./server";
import { loadDb } from "./store";
import { buildTransaction, categorize, merchantKey, normalizeMerchant } from "./domain";

const SEED = JSON.stringify({
  transactions: [
    buildTransaction({ date: "2026-09-02", description: "SQ *BLUE BOTTLE COFFEE #118   OAKLAND CA", amountCents: -675 }),
    buildTransaction({ date: "2026-09-03", description: "AMZN Mktp US*2K4L91   Amzn.com/bill WA", amountCents: -4218 }),
    buildTransaction({ date: "2026-09-12", description: "AMAZON.COM*7Y2PL03   SEATTLE WA", amountCents: -2399 }),
    buildTransaction({ date: "2026-09-15", description: "ACME CORP PAYROLL  DIRECT DEP", amountCents: 315000 }),
  ],
});

const NEW_TX = { date: "2026-10-02", description: "SQ *BLUE BOTTLE COFFEE #204   SF CA", amountCents: -550 };

let dbPath: string;
let seedPath: string;

// Same steps as the real entry point: load the data, then build the app.
function boot() {
  loadDb(dbPath, seedPath);
  return createApp();
}

beforeEach(() => {
  const dir = mkdtempSync(path.join(tmpdir(), "spendwise-"));
  dbPath = path.join(dir, "db.json");
  seedPath = path.join(dir, "seed.json");
  writeFileSync(seedPath, SEED);
});

describe("domain", () => {
  it("strips processor prefixes, store numbers and location", () => {
    expect(normalizeMerchant("SQ *BLUE BOTTLE COFFEE #118   OAKLAND CA")).toBe("Blue Bottle Coffee");
  });

  it("collapses aliases to one name", () => {
    expect(normalizeMerchant("AMZN Mktp US*2K4L91   Amzn.com/bill WA")).toBe("Amazon");
    expect(normalizeMerchant("AMAZON.COM*7Y2PL03   SEATTLE WA")).toBe("Amazon");
    expect(normalizeMerchant("UBER   TRIP  HELP.UBER.COM CA")).toBe("Uber");
  });

  it("merchantKey ignores case and spacing", () => {
    expect(merchantKey("  blue  BOTTLE coffee ")).toBe(merchantKey("Blue Bottle Coffee"));
  });

  it("categorizes by keyword, with income by sign", () => {
    expect(categorize("Uber Eats", -1000)).toBe("Dining");
    expect(categorize("Uber", -1000)).toBe("Transport");
    expect(categorize("Mystery Shop", -1000)).toBe("Other");
    expect(categorize("Mystery Shop", 1000)).toBe("Income");
  });
});

describe("startup", () => {
  it("creates db.json from the seed on first run", () => {
    boot();
    expect(JSON.parse(readFileSync(dbPath, "utf8")).transactions).toHaveLength(4);
  });

  it("loads db.json instead of the seed once it exists", async () => {
    await request(boot()).post("/transactions").send(NEW_TX);
    const { body } = await request(boot()).get("/transactions");
    expect(body.count).toBe(5);
  });
});

describe("GET /transactions", () => {
  it("returns newest first", async () => {
    const { body } = await request(boot()).get("/transactions");
    expect(body.count).toBe(4);
    expect(body.transactions[0].date).toBe("2026-09-15");
  });

  it("filters by merchant using merchantKey", async () => {
    const { body } = await request(boot()).get("/transactions?merchant=AMAZON");
    expect(body.transactions.map((t: { merchant: string }) => t.merchant)).toEqual(["Amazon", "Amazon"]);
  });

  it("filters by category and month", async () => {
    const { body } = await request(boot()).get("/transactions?category=Dining&month=2026-09");
    expect(body.count).toBe(1);
  });

  it("rejects an unknown category", async () => {
    const res = await request(boot()).get("/transactions?category=Fun");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });
});

describe("GET /transactions/:id", () => {
  it("returns one transaction or 404", async () => {
    const app = boot();
    const { body } = await request(app).get("/transactions");
    const one = await request(app).get(`/transactions/${body.transactions[0].id}`);
    expect(one.body.merchant).toBe("Acme Corp Payroll");

    const missing = await request(app).get("/transactions/nope");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("not_found");
  });
});

describe("POST /transactions", () => {
  it("normalizes, categorizes, stores and returns 201", async () => {
    const res = await request(boot()).post("/transactions").send(NEW_TX);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      date: "2026-10-02",
      rawDescription: NEW_TX.description,
      merchant: "Blue Bottle Coffee",
      category: "Dining",
      amountCents: -550,
    });
    expect(JSON.parse(readFileSync(dbPath, "utf8")).transactions).toHaveLength(5);
  });

  it("rejects bad input", async () => {
    const app = boot();
    const bad = [
      { ...NEW_TX, amountCents: 0 },
      { ...NEW_TX, amountCents: -5.5 },
      { ...NEW_TX, date: "10/02/2026" },
      { ...NEW_TX, description: "  " },
      { ...NEW_TX, category: "Dining" }, // unknown field
    ];
    for (const body of bad) {
      const res = await request(app).post("/transactions").send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("bad_request");
    }
  });

  it("never writes to the seed file", async () => {
    await request(boot()).post("/transactions").send(NEW_TX);
    expect(readFileSync(seedPath, "utf8")).toBe(SEED);
    expect(existsSync(dbPath)).toBe(true);
  });
});

describe("GET /merchants", () => {
  it("groups raw descriptors under the normalized name", async () => {
    const { body } = await request(boot()).get("/merchants");
    const amazon = body.merchants.find((m: { name: string }) => m.name === "Amazon");
    expect(amazon.transactionCount).toBe(2);
    expect(amazon.rawDescriptions).toHaveLength(2);
    expect(amazon.totalCents).toBe(-6617);
  });
});

describe("GET /summary", () => {
  it("totals spending per category and income separately", async () => {
    const { body } = await request(boot()).get("/summary?month=2026-09");
    expect(body.spendingCents.Shopping).toBe(6617);
    expect(body.spendingCents.Dining).toBe(675);
    expect(body.incomeCents).toBe(315000);
  });

  it("requires a month", async () => {
    expect((await request(boot()).get("/summary")).status).toBe(400);
  });
});
