import test from "node:test";
import assert from "node:assert/strict";
import {
  csvField,
  exportFilename,
  fetchAllRows,
  FOLLOWER_EXPORT_COLUMNS,
  OFFER_EXPORT_COLUMNS,
  toCsv,
  TRADE_EXPORT_COLUMNS,
  EXPORT_PAGE_SIZE,
  type PaginatedClient,
} from "../lib/admin-export.ts";

test("csvField applies RFC 4180 quoting", () => {
  assert.equal(csvField("plain"), "plain");
  assert.equal(csvField(""), "");
  assert.equal(csvField(null), "");
  assert.equal(csvField(undefined), "");
  assert.equal(csvField("a,b"), '"a,b"');
  assert.equal(csvField('say "hi"'), '"say ""hi"""');
  assert.equal(csvField("line1\nline2"), '"line1\nline2"');
  assert.equal(csvField("a\r\nb"), '"a\r\nb"');
  assert.equal(csvField(true), "true");
  assert.equal(csvField(12.5), "12.5");
});

test("toCsv emits BOM, header, CRLF endings and ordered columns", () => {
  const csv = toCsv(["b", "a"], [{ a: 1, b: "x" }, { a: "q,z", b: null }]);
  assert.equal(csv, "\uFEFFb,a\r\nx,1\r\n,\"q,z\"\r\n");
});

test("toCsv renders missing columns as empty fields", () => {
  const csv = toCsv(["a", "ghost"], [{ a: 1 }]);
  assert.equal(csv, "\uFEFFa,ghost\r\n1,\r\n");
});

test("exportFilename is dated and suffixed", () => {
  assert.equal(exportFilename("offers", new Date("2026-08-25T23:00:00Z")), "offers-2026-08-25.csv");
  assert.equal(exportFilename("trades", new Date("2026-01-02T00:00:00Z")), "trades-2026-01-02.csv");
  assert.equal(
    exportFilename("followers", new Date("2026-08-25T23:00:00Z")),
    "followers-2026-08-25.csv",
  );
});

test("export column sets are unique, non-empty and carry the private recordkeeping fields", () => {
  for (const columns of [OFFER_EXPORT_COLUMNS, FOLLOWER_EXPORT_COLUMNS, TRADE_EXPORT_COLUMNS]) {
    assert.ok(columns.length > 0);
    assert.equal(new Set(columns).size, columns.length, "duplicate column");
  }
  // Prompt 27: exports are the operator's recordkeeping — contact details,
  // admin notes and BTC verification fields must be present.
  assert.ok(OFFER_EXPORT_COLUMNS.includes("email"));
  assert.ok(OFFER_EXPORT_COLUMNS.includes("phone"));
  assert.ok(OFFER_EXPORT_COLUMNS.includes("risk_flags"));
  assert.ok(OFFER_EXPORT_COLUMNS.includes("contact_notes"));
  assert.ok(FOLLOWER_EXPORT_COLUMNS.includes("email_updates_unsubscribed_at"));
  assert.ok(TRADE_EXPORT_COLUMNS.includes("btc_wallet_address"));
  assert.ok(TRADE_EXPORT_COLUMNS.includes("private_completion_notes"));
});

// Stub of the supabase-js chain: records requested pages and serves them
// from an in-memory dataset.
function pagedClient(allRows: Record<string, unknown>[], failAt?: number): {
  client: PaginatedClient;
  requests: Array<[number, number]>;
  selects: string[];
} {
  const requests: Array<[number, number]> = [];
  const selects: string[] = [];
  const client: PaginatedClient = {
    from: () => ({
      select: (columns) => {
        selects.push(columns);
        return {
          order: () => ({
            range: (from, to) => {
              requests.push([from, to]);
              if (failAt !== undefined && from >= failAt) {
                return Promise.resolve({ data: null, error: { message: "boom" } });
              }
              return Promise.resolve({
                data: allRows.slice(from, to + 1),
                error: null,
              });
            },
          }),
        };
      },
    }),
  };
  return { client, requests, selects };
}

function makeRows(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => ({ id: i }));
}

test("fetchAllRows pages until a short page arrives", async () => {
  const { client, requests } = pagedClient(makeRows(EXPORT_PAGE_SIZE + 7));
  const result = await fetchAllRows(client, "offers", "created_at");
  assert.equal(result.error, null);
  assert.equal(result.rows.length, EXPORT_PAGE_SIZE + 7);
  assert.deepEqual(requests, [
    [0, EXPORT_PAGE_SIZE - 1],
    [EXPORT_PAGE_SIZE, 2 * EXPORT_PAGE_SIZE - 1],
  ]);
});

test("fetchAllRows stops after one request when everything fits", async () => {
  const { client, requests } = pagedClient(makeRows(3));
  const result = await fetchAllRows(client, "followers", "created_at");
  assert.equal(result.error, null);
  assert.equal(result.rows.length, 3);
  assert.equal(requests.length, 1);
});

test("fetchAllRows surfaces PostgREST errors without partial data", async () => {
  const { client } = pagedClient(makeRows(2 * EXPORT_PAGE_SIZE), EXPORT_PAGE_SIZE);
  const result = await fetchAllRows(client, "trades", "created_at");
  assert.equal(result.error, "boom");
  assert.deepEqual(result.rows, []);
});

test("fetchAllRows selects * by default and honors an explicit column list", async () => {
  const everything = pagedClient(makeRows(1));
  await fetchAllRows(everything.client, "offers", "created_at");
  assert.deepEqual(everything.selects, ["*"]);

  const slim = pagedClient(makeRows(1));
  await fetchAllRows(slim.client, "offers", "created_at", "id, name, status");
  assert.deepEqual(slim.selects, ["id, name, status"]);
});
