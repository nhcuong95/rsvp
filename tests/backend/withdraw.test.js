// Withdraw requests on a locked game: a confirmed player asks to drop out
// through the RSVP backend, and an admin accepts (removed, waitlist moves up)
// or declines through the admin backend. Both share one fake spreadsheet.
// Run: node --test "tests/backend/*.test.js"
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { FakeSpreadsheet, loadBackend, plain } = require("./gas-mock");

const RSVP = path.join(__dirname, "../../google-apps-script/rsvp-web-app/Code.gs");
const ADMIN = path.join(__dirname, "../../google-apps-script/Code.gs");
const DATE = "2026-09-24";
const NAMES = ["Anh", "Binh", "Chau", "Dung"];
const ADMIN_TOKEN = "test-token";

function setup({ capacity = 2, locked = true } = {}) {
  const ss = new FakeSpreadsheet();
  ss.insertSheet("Roster").data = [
    ["Name", "Venmo", "Facebook", "Note", "Zelle"],
    ...NAMES.map((name) => [name, "", "", "", ""]),
  ];
  ss.insertSheet("RSVP Dates").data = [
    ["Play Date", "Added At", "Added By", "Field Name", "Address", "Start Time", "End Time", "Capacity"],
    [DATE, "", "admin", "Field", "Addr", "8:30 PM", "10:30 PM", capacity],
  ];
  ss.insertSheet("Roster Locks").data = [
    ["Play Date", "Locked", "Updated At", "Updated By"],
    [DATE, locked ? "TRUE" : "FALSE", "", ""],
  ];
  // A working cache so the admin backend's token check runs for real.
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
  const adminApp = loadBackend(ADMIN, ss, Date.UTC(2026, 8, 23, 20, 0, 0), { globals });
  return { ss, rsvpApp, adminApp };
}

// Anh and Binh are in (max 2); Chau then Dung wait.
const joinAll = (rsvpApp) =>
  NAMES.forEach((playerName) =>
    rsvpApp.call({ playDate: DATE, playerName, participantCount: "1", vote: "Yes" }));
const request = (rsvpApp, playerName) =>
  rsvpApp.call({ action: "requestWithdraw", playDate: DATE, playerName });
const cancel = (rsvpApp, playerName) =>
  rsvpApp.call({ action: "cancelWithdraw", playDate: DATE, playerName });
const resolve = (adminApp, playerName, decision, extra = {}) =>
  adminApp.call({
    action: "resolveWithdraw", adminToken: ADMIN_TOKEN, playDate: DATE, playerName, decision, ...extra,
  });
const tallyOf = (rsvpApp) => rsvpApp.call({ action: "list", playDate: DATE }).tally;
const requested = (tally) => tally.players.filter((p) => p.withdrawRequested).map((p) => p.name);
const votes = (ss) =>
  Object.fromEntries(ss.getSheetByName("RSVPs").data.slice(1).map((row) => [row[1], row[2]]));
const auditActions = (ss) =>
  ss.getSheetByName("RSVP Audit Log").data.slice(1).map((row) => `${row[1]}:${row[3]}`);

test("a confirmed player can ask to withdraw; they keep their spot until an admin acts", () => {
  const { ss, rsvpApp } = setup();
  joinAll(rsvpApp);
  const out = request(rsvpApp, "Anh");
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.action, "withdraw_requested");
  assert.deepStrictEqual(requested(out.tally), ["Anh"]);
  assert.strictEqual(out.tally.locked, true);
  assert.strictEqual(out.tally.totalCount, 2); // still holds the spot
  assert.deepStrictEqual(out.tally.waitlist.map((p) => p.name), ["Chau", "Dung"]);
  assert.strictEqual(votes(ss).Anh, "Yes"); // still billed if never accepted
  // Everyone loading the page sees it on Anh's row.
  const tally = tallyOf(rsvpApp);
  assert.deepStrictEqual(requested(tally), ["Anh"]);
  assert.strictEqual(tally.players.find((p) => p.name === "Binh").withdrawRequested, false);
  assert.ok(auditActions(ss).includes("withdraw_requested:Anh"));
  assert.strictEqual(ss.getSheetByName("RSVPs").data[0][6], "Withdraw Requested At");
});

test("asking twice is a no-op, and the player can cancel", () => {
  const { rsvpApp } = setup();
  joinAll(rsvpApp);
  request(rsvpApp, "Anh");
  assert.strictEqual(request(rsvpApp, "Anh").action, "withdraw_already_requested");
  const out = cancel(rsvpApp, "Anh");
  assert.strictEqual(out.action, "withdraw_cancelled");
  assert.deepStrictEqual(requested(out.tally), []);
  assert.deepStrictEqual(requested(tallyOf(rsvpApp)), []);
  assert.strictEqual(cancel(rsvpApp, "Anh").action, "withdraw_not_requested");
});

test("requests are refused when there is nothing to withdraw from", () => {
  const unlocked = setup({ locked: false });
  joinAll(unlocked.rsvpApp);
  assert.match(request(unlocked.rsvpApp, "Anh").error, /isn't locked.*Not going/);

  const { rsvpApp } = setup();
  joinAll(rsvpApp);
  assert.match(request(rsvpApp, "Chau").error, /waitlist.*Not going/);
  rsvpApp.call({ playDate: DATE, playerName: "Anh", participantCount: "0", vote: "No" }); // blocked: locked
  assert.strictEqual(tallyOf(rsvpApp).players.length, 2);

  const empty = setup();
  assert.match(request(empty.rsvpApp, "Anh").error, /No RSVP on file/);
});

test("'Not going' on a locked game points players to the withdraw request", () => {
  const { rsvpApp } = setup();
  joinAll(rsvpApp);
  const out = rsvpApp.call({ playDate: DATE, playerName: "Anh", participantCount: "0", vote: "No" });
  assert.strictEqual(out.ok, false);
  assert.match(out.error, /Request to withdraw/);
});

test("editing the RSVP (e.g. dropping a guest) keeps the pending request", () => {
  const { ss, rsvpApp } = setup({ capacity: 3 });
  rsvpApp.call({ playDate: DATE, playerName: "Anh", participantCount: "2", vote: "Yes" });
  request(rsvpApp, "Anh");
  const out = rsvpApp.call({
    playDate: DATE, playerName: "Anh", participantCount: "1", vote: "Yes", confirmOverride: "true",
  });
  assert.strictEqual(out.action, "updated");
  assert.deepStrictEqual(requested(out.tally), ["Anh"]);
  assert.deepStrictEqual(requested(tallyOf(rsvpApp)), ["Anh"]);
  assert.strictEqual(ss.getSheetByName("RSVPs").data[1][3], 1);
});

test("accepting removes the player and the first in line joins", () => {
  const { ss, rsvpApp, adminApp } = setup();
  joinAll(rsvpApp);
  request(rsvpApp, "Anh");
  const out = resolve(adminApp, "Anh", "accept");
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.action, "withdraw_accepted");
  assert.deepStrictEqual(out.promoted, ["Chau"]);
  assert.deepStrictEqual(votes(ss), { Binh: "Yes", Chau: "Yes", Dung: "Waitlist" });
  const tally = tallyOf(rsvpApp);
  assert.deepStrictEqual(tally.players.map((p) => p.name), ["Binh", "Chau"]);
  assert.deepStrictEqual(tally.waitlist.map((p) => p.name), ["Dung"]);
  // Not billed for a game they were let out of; the new player is.
  const billed = plain(adminApp.getBillingAttendance_("2026-09")[0].players.map((p) => p.name));
  assert.deepStrictEqual(billed, ["Binh", "Chau"]);
  // The audit log reads in order: accepted, then who moved up.
  const log = auditActions(ss);
  assert.ok(log.indexOf("withdraw_accepted:Anh") < log.indexOf("promoted_from_waitlist:Chau"));
});

test("accepting a player with guests frees all their spots", () => {
  const { ss, rsvpApp, adminApp } = setup({ capacity: 3 });
  rsvpApp.call({ playDate: DATE, playerName: "Anh", participantCount: "2", vote: "Yes" });
  ["Binh", "Chau", "Dung"].forEach((playerName) =>
    rsvpApp.call({ playDate: DATE, playerName, participantCount: "1", vote: "Yes" }));
  request(rsvpApp, "Anh");
  assert.deepStrictEqual(resolve(adminApp, "Anh", "accept").promoted, ["Chau", "Dung"]);
  assert.deepStrictEqual(votes(ss), { Binh: "Yes", Chau: "Yes", Dung: "Yes" });
});

test("declining keeps the player in and clears the request", () => {
  const { ss, rsvpApp, adminApp } = setup();
  joinAll(rsvpApp);
  request(rsvpApp, "Anh");
  const out = resolve(adminApp, "Anh", "decline");
  assert.strictEqual(out.action, "withdraw_declined");
  assert.deepStrictEqual(out.promoted, []);
  assert.strictEqual(votes(ss).Anh, "Yes");
  assert.deepStrictEqual(requested(tallyOf(rsvpApp)), []);
  assert.ok(auditActions(ss).includes("withdraw_declined:Anh"));
});

test("an admin can't remove someone who has no pending request", () => {
  const { ss, rsvpApp, adminApp } = setup();
  joinAll(rsvpApp);
  request(rsvpApp, "Anh");
  cancel(rsvpApp, "Anh"); // changed their mind before the admin saw it
  const out = resolve(adminApp, "Anh", "accept");
  assert.strictEqual(out.ok, false);
  assert.match(out.error, /no pending withdraw request/);
  assert.strictEqual(votes(ss).Anh, "Yes");
  assert.match(resolve(adminApp, "Anh", "maybe").error, /accept or decline/);
});

test("resolving a request needs an admin login", () => {
  const { ss, rsvpApp, adminApp } = setup();
  joinAll(rsvpApp);
  request(rsvpApp, "Anh");
  assert.match(resolve(adminApp, "Anh", "accept", { adminToken: "" }).error, /Admin login required/);
  assert.match(resolve(adminApp, "Anh", "accept", { adminToken: "stale" }).error, /expired/);
  assert.strictEqual(votes(ss).Anh, "Yes");
});

test("the admin tally also flags the request", () => {
  const { rsvpApp, adminApp } = setup();
  joinAll(rsvpApp);
  request(rsvpApp, "Binh");
  assert.deepStrictEqual(requested(plain(adminApp.getTally_(DATE))), ["Binh"]);
});
