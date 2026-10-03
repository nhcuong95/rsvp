// Per-date prices and payment records: an admin sets a price per person for a
// date (from the RSVP page's date details or the Billing page) and records
// money received; listBillingMonth returns both for the billing page to total.
// Run: node --test "tests/backend/*.test.js"
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { FakeSpreadsheet, loadBackend, plain } = require("./gas-mock");

const RSVP = path.join(__dirname, "../../google-apps-script/rsvp-web-app/Code.gs");
const ADMIN = path.join(__dirname, "../../google-apps-script/Code.gs");
const DATE = "2026-10-01";
const MONTH = "2026-10";
const NAMES = ["Anh", "Binh", "Chau"];
const ADMIN_TOKEN = "test-token";

function setup() {
  const ss = new FakeSpreadsheet();
  ss.insertSheet("Roster").data = [
    ["Name", "Venmo", "Facebook", "Note", "Zelle"],
    ...NAMES.map((name) => [name, "", "", "", ""]),
  ];
  ss.insertSheet("RSVP Dates").data = [
    ["Play Date", "Added At", "Added By", "Field Name", "Address", "Start Time", "End Time", "Capacity"],
    [DATE, "", "admin", "Field", "Addr", "8:30 PM", "10:30 PM", ""],
  ];
  const cache = new Map([[`admin:${ADMIN_TOKEN}`, "true"]]);
  const globals = {
    CacheService: {
      getScriptCache: () => ({
        get: (key) => cache.get(key) ?? null,
        put: (key, value) => cache.set(key, value),
        remove: (key) => cache.delete(key),
      }),
    },
  };
  const rsvpApp = loadBackend(RSVP, ss);
  const adminApp = loadBackend(ADMIN, ss, Date.UTC(2026, 9, 2, 20, 0, 0), { globals });
  return { ss, rsvpApp, adminApp };
}

const admin = (adminApp, params) => adminApp.call({ adminToken: ADMIN_TOKEN, ...params });
const billingOf = (adminApp) =>
  plain(adminApp.call({ action: "listBillingMonth", month: MONTH }).billing);
const detailOf = (app, date = DATE) =>
  plain(app.call({ action: "listPlayDates" }).dateDetails.find((entry) => entry.date === date));

test("date details save a price that both backends return", () => {
  const { adminApp, rsvpApp } = setup();
  const saved = admin(adminApp, {
    action: "savePlayDateDetails", playDate: DATE, fieldName: "Field", address: "Addr",
    startTime: "8:30 PM", endTime: "10:30 PM", price: "$10",
  });
  assert.strictEqual(saved.ok, true);
  assert.strictEqual(saved.price, 10);
  assert.strictEqual(detailOf(adminApp).price, 10);
  assert.strictEqual(detailOf(rsvpApp).price, 10);
  assert.deepStrictEqual(billingOf(adminApp).datePrices, [{ date: DATE, price: 10 }]);
});

test("leaving price out keeps it, blank clears it (free)", () => {
  const { adminApp, rsvpApp } = setup();
  admin(adminApp, { action: "savePlayDateDetails", playDate: DATE, price: "12.5" });
  admin(adminApp, { action: "savePlayDateDetails", playDate: DATE, fieldName: "New field" });
  assert.strictEqual(detailOf(adminApp).price, 12.5);

  admin(adminApp, { action: "savePlayDateDetails", playDate: DATE, price: "" });
  assert.strictEqual(detailOf(adminApp).price, null);
  assert.strictEqual(detailOf(rsvpApp).price, null);
  assert.deepStrictEqual(billingOf(adminApp).datePrices, []);
});

test("a bad price is rejected", () => {
  const { adminApp } = setup();
  const result = admin(adminApp, { action: "savePlayDateDetails", playDate: DATE, price: "-5" });
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /Price must be a dollar amount/);
});

test("price survives removing the date from the RSVP list", () => {
  const { adminApp } = setup();
  admin(adminApp, { action: "savePlayDateDetails", playDate: DATE, price: "10" });
  admin(adminApp, { action: "setPlayDate", playDate: DATE, open: "false" });
  assert.deepStrictEqual(billingOf(adminApp).datePrices, [{ date: DATE, price: 10 }]);
});

test("billing page sets a price for any date, including one not on the RSVP list", () => {
  const { adminApp } = setup();
  const result = admin(adminApp, { action: "saveBillingDatePrice", date: "2026-10-03", price: "8" });
  assert.deepStrictEqual(plain(result.datePrice), { date: "2026-10-03", price: 8 });
  admin(adminApp, { action: "saveBillingDatePrice", date: "2026-10-03", price: "9" });
  assert.deepStrictEqual(billingOf(adminApp).datePrices, [{ date: "2026-10-03", price: 9 }]);
});

test("payment records are added, listed per month, and canceled", () => {
  const { adminApp } = setup();
  const first = admin(adminApp, {
    action: "saveBillingPaymentRecord", month: MONTH, playerName: "Anh",
    amount: "15", method: "zelle", paidOn: "2026-10-05", note: "first half",
  });
  assert.strictEqual(first.ok, true);
  const record = plain(first.paymentRecord);
  assert.deepStrictEqual(
    { ...record, id: undefined },
    { id: undefined, paidOn: "2026-10-05", playerName: "Anh", amount: 15, method: "Zelle", note: "first half", status: "active" },
  );
  admin(adminApp, { action: "saveBillingPaymentRecord", month: MONTH, playerName: "Anh", amount: "5", method: "Venmo" });
  admin(adminApp, { action: "saveBillingPaymentRecord", month: "2026-09", playerName: "Binh", amount: "7" });

  let records = billingOf(adminApp).paymentRecords;
  assert.deepStrictEqual(records.map((entry) => entry.amount), [15, 5]);

  const removed = admin(adminApp, { action: "removeBillingPaymentRecord", id: record.id });
  assert.strictEqual(plain(removed.paymentRecord).status, "canceled");
  records = billingOf(adminApp).paymentRecords;
  assert.deepStrictEqual(records.map((entry) => entry.status), ["canceled", "active"]);
});

test("payment records validate the player and amount", () => {
  const { adminApp } = setup();
  const stranger = admin(adminApp, { action: "saveBillingPaymentRecord", month: MONTH, playerName: "Nobody", amount: "5" });
  assert.match(stranger.error, /roster/);
  const zero = admin(adminApp, { action: "saveBillingPaymentRecord", month: MONTH, playerName: "Anh", amount: "0" });
  assert.match(zero.error, /more than \$0/);
});

test("price and payment writes require admin login", () => {
  const { adminApp } = setup();
  const price = adminApp.call({ action: "saveBillingDatePrice", date: DATE, price: "10" });
  const payment = adminApp.call({ action: "saveBillingPaymentRecord", month: MONTH, playerName: "Anh", amount: "5" });
  const remove = adminApp.call({ action: "removeBillingPaymentRecord", id: "x" });
  [price, payment, remove].forEach((result) => {
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /Admin login required/);
  });
});

test("a batch of payments is written in one request, with a result per entry", () => {
  const { adminApp, ss } = setup();
  const result = admin(adminApp, {
    action: "saveBillingPaymentRecords",
    records: JSON.stringify([
      ["2026-09", "2026-09-11", "Anh", "19.00", "Zelle", "9-3 + 9-10 soccer"],
      ["2026-10", "2026-10-02", "Binh", 9.2, "venmo", ""],
      ["2026-10", "2026-10-02", "Nobody", "5", "Zelle", "not on the roster"],
      ["2026-10", "2026-10-02", "Chau", "0", "Zelle", "zero"],
      ["2026-10", "2026-10-02", "Chau", "6", "Zelle", "same day, same amount"],
      ["2026-10", "2026-10-02", "Chau", "6", "Zelle", "same day, same amount"],
    ]),
  });
  assert.strictEqual(result.ok, true);
  const results = plain(result.results);
  assert.deepStrictEqual(results.map((entry) => entry.ok), [true, true, false, false, true, true]);
  assert.match(results[2].error, /roster/);
  assert.match(results[3].error, /more than \$0/);
  assert.deepStrictEqual(
    { ...results[1].paymentRecord, id: undefined },
    { id: undefined, paidOn: "2026-10-02", playerName: "Binh", amount: 9.2, method: "Venmo", note: "", status: "active" },
  );

  assert.strictEqual(ss.getSheetByName("Billing Payment Records").getLastRow(), 5);
  assert.deepStrictEqual(billingOf(adminApp).paymentRecords.map((entry) => entry.amount), [9.2, 6, 6]);
  const ids = results.filter((entry) => entry.ok).map((entry) => entry.paymentRecord.id);
  assert.strictEqual(new Set(ids).size, 4);
});

test("a batch must be a JSON list and needs admin login", () => {
  const { adminApp } = setup();
  assert.match(admin(adminApp, { action: "saveBillingPaymentRecords", records: "not json" }).error, /JSON list/);
  assert.match(admin(adminApp, { action: "saveBillingPaymentRecords", records: "[]" }).error, /non-empty/);
  const noLogin = adminApp.call({ action: "saveBillingPaymentRecords", records: "[]" });
  assert.match(noLogin.error, /Admin login required/);
});
