# Spendwise

A small spending tracker: card transactions with clean merchant names, browsable by merchant and by month. It's deliberately tiny (six source files plus tests) so the **layering is easy to see**.

```bash
npm install
npm start        # http://localhost:3000
npm test
```

Data lives in `db.json`, created from `seed.json` on first run. Delete `db.json` to reset.

## How it's organized

```
index.html   Frontend. One file, plain JS, no build step.
server.ts    HTTP layer: routes, zod validation, error responses.
service.ts   Use cases: filter, summarize, add. Orchestrates domain + store.
domain.ts    Business rules: merchant normalizing, categorizing. Pure functions.
store.ts     Persistence: the only file that touches the disk.
types.ts     Shared types. Imported by everyone, imports nothing.
```

Dependencies point one way:

```
index.html  -->  server.ts  -->  service.ts  -->  domain.ts
                                      |
                                      +-------->  store.ts
```

## The rules

1. **`server.ts` has no business logic.** It validates input, calls one service function, shapes the response.
2. **`domain.ts` is pure.** No express, no `fs`, no store. That's why it's trivial to test.
3. **`store.ts` is the one door to the disk.** `service.ts` calls `saveDb()` after each change.
4. **`seed.json` is read-only.** It's copied to `db.json` on first run and never written to.
5. **Raw vs display.** `rawDescription` is exactly what the bank sent and is never modified. `merchant` is the display name from `normalizeMerchant()`.
6. **Compare merchants with `merchantKey()`**, never `===` on the display string.
7. **Money is integer cents.** Negative means money out.
8. **Errors have one shape**, written in one place: `{ "error": { "code", "message" } }`.

## API

| Method | Path | Notes |
|---|---|---|
| `GET` | `/transactions?category=&merchant=&month=YYYY-MM` | newest first |
| `GET` | `/transactions/:id` | 404 if unknown |
| `POST` | `/transactions` | `{ date, description, amountCents }`; returns `201`. Stands in for the bank's feed. |
| `GET` | `/merchants` | each merchant with the raw descriptors that normalized into it |
| `GET` | `/summary?month=YYYY-MM` | spending per category, income separate |

```bash
curl -X POST localhost:3000/transactions -H 'content-type: application/json' \
  -d '{"date":"2026-10-12","description":"SQ *BLUE BOTTLE COFFEE #118   OAKLAND CA","amountCents":-625}'
# -> merchant "Blue Bottle Coffee", category "Dining"
```
