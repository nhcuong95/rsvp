// The admin backend's side of max players + waitlist: saving the limit,
// promoting on a raise, and — most important — billing and the monthly report
// never counting waitlisted players. Players join through the real RSVP
// backend; both backends share one fake spreadsheet, like production.
// Run: node --test "tests/backend/*.test.js"
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { FakeSpreadsheet, loadBackend, plain } = require("./gas-mock");

const RSVP = path.join(__dirname, "../../google-apps-script/rsvp-web-app/Code.gs");
const ADMIN = path.join(__dirname, "../../google-apps-script/Code.gs");
const DATE = "2026-09-24";
const NAMES = ["Anh", "Binh", "Chau", "Dung", "Em"];

function setup(capacity) {
  const ss = new FakeSpreadsheet();
  ss.insertSheet("Roster").data = [
    ["Name", "Venmo", "Facebook", "Note", "Zelle"],
    ...NAMES.map((name) => [name, `@${name.toLowerCase()}`, "", "", ""]),
  ];
  ss.insertSheet("RSVP Dates").data = [
    ["Play Date", "Added At", "Added By", "Field Name", "Address", "Start Time", "End Time"],
    [DATE, "", "admin", "Field", "Addr", "8:30 PM", "10:30 PM", capacity],
  ];
  const rsvpApp = loadBackend(RSVP, ss);
  // Later clock than the RSVP backend so admin writes sort after sign-ups.
  const adminApp = loadBackend(ADMIN, ss, Date.UTC(2026, 8, 23, 20, 0, 0));
  return { ss, rsvpApp, adminApp };
}

// Everyone signs up in NAMES order.
const joinAll = (rsvpApp) =>
  NAMES.forEach((name) =>
    rsvpApp.call({ playDate: DATE, playerName: name, participantCount: "1", vote: "Yes" }));
const details = (extra) => ({
  playDate: DATE,
  fieldName: "Field",
  address: "Addr",
  startTime: "8:30 PM",
  endTime: "10:30 PM",
  ...extra,
});
const votes = (ss) =>
  Object.fromEntries(ss.getSheetByName("RSVPs").data.slice(1).map((row) => [row[1], row[2]]));
const billedNames = (adminApp) =>
  plain(adminApp.getBillingAttendance_("2026-09")[0].players.map((p) => p.name));

test("billing never charges waitlisted players", () => {
  const { rsvpApp, adminApp } = setup(2);
  joinAll(rsvpApp);
  assert.deepStrictEqual(billedNames(adminApp), ["Anh", "Binh"]);
});

test("the monthly report counts only confirmed players", () => {
  const { ss, rsvpApp, adminApp } = setup(2);
  joinAll(rsvpApp);
  const matrix = adminApp.buildMonthRosterMatrix_(ss.getSheetByName("RSVPs"), "2026-09");
  const counted = matrix.slice(1).filter((row) => row[1] !== "").map((row) => row[0]);
  assert.deepStrictEqual(plain(counted), ["Anh", "Binh"]);
});

test("the admin tally shows only confirmed players", () => {
  const { rsvpApp, adminApp } = setup(2);
  joinAll(rsvpApp);
  assert.deepStrictEqual(plain(adminApp.getTally_(DATE).players.map((p) => p.name)), ["Anh", "Binh"]);
});

test("raising the limit lets the next people in line in, in order", () => {
  const { ss, rsvpApp, adminApp } = setup(2);
  joinAll(rsvpApp);
  const result = adminApp.savePlayDateDetails_(details({ capacity: "4" }));
  assert.deepStrictEqual(plain(result.promoted), ["Chau", "Dung"]);
  assert.strictEqual(result.capacity, 4);
  assert.deepStrictEqual(votes(ss), { Anh: "Yes", Binh: "Yes", Chau: "Yes", Dung: "Yes", Em: "Waitlist" });
  assert.strictEqual(ss.getSheetByName("RSVP Dates").data[0][7], "Capacity"); // header added
});

test("clearing the limit lets everyone in", () => {
  const { ss, rsvpApp, adminApp } = setup(2);
  joinAll(rsvpApp);
  adminApp.savePlayDateDetails_(details({ capacity: "" }));
  assert.ok(Object.values(votes(ss)).every((v) => v === "Yes"));
  assert.strictEqual(adminApp.getOpenDatesDetailed_()[0].capacity, null);
});

test("an older admin page that doesn't send capacity leaves it unchanged", () => {
  const { ss, rsvpApp, adminApp } = setup(2);
  joinAll(rsvpApp);
  const result = adminApp.savePlayDateDetails_(details({ fieldName: "New field" }));
  assert.strictEqual(result.capacity, 2);
  assert.deepStrictEqual(plain(result.promoted), []);
  assert.strictEqual(votes(ss).Chau, "Waitlist");
});

test("a nonsense limit is rejected instead of silently clearing it", () => {
  const { adminApp } = setup(2);
  assert.throws(() => adminApp.savePlayDateDetails_(details({ capacity: "lots" })), /whole number/);
  assert.throws(() => adminApp.savePlayDateDetails_(details({ capacity: "0" })), /whole number/);
});

test("setting a limit on a brand-new date stores it", () => {
  const { adminApp } = setup("");
  adminApp.savePlayDateDetails_({
    playDate: "2026-10-08", fieldName: "F", address: "", startTime: "", endTime: "", capacity: "22",
  });
  const saved = adminApp.getOpenDatesDetailed_().find((d) => d.date === "2026-10-08");
  assert.strictEqual(saved.capacity, 22);
});

test("an admin attendance edit lets a waitlisted player in (and bills them)", () => {
  const { ss, rsvpApp, adminApp } = setup(2);
  joinAll(rsvpApp);
  adminApp.upsertRsvpWithLock_({
    action: "adminUpsertRsvp", playDate: DATE, playerName: "Em",
    participantCount: "1", vote: "Yes", confirmOverride: "true",
  });
  assert.strictEqual(votes(ss).Em, "Yes");
  assert.ok(billedNames(adminApp).includes("Em"));
});

test("an admin removing a no-show after the game does NOT promote anyone", () => {
  const { ss, rsvpApp, adminApp } = setup(2);
  joinAll(rsvpApp);
  adminApp.upsertRsvpWithLock_({
    action: "adminUpsertRsvp", playDate: DATE, playerName: "Anh", participantCount: "0", vote: "No",
  });
  assert.strictEqual(votes(ss).Chau, "Waitlist");
  assert.deepStrictEqual(billedNames(adminApp), ["Binh"]);
});
