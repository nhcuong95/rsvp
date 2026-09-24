// Max players + waitlist, exercised through the RSVP backend's doGet exactly
// as the web app is called. Run: node --test "tests/backend/*.test.js"
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { FakeSpreadsheet, loadBackend } = require("./gas-mock");

const BACKEND = path.join(__dirname, "../../google-apps-script/rsvp-web-app/Code.gs");
const DATE = "2026-09-24";
const NAMES = ["Anh", "Binh", "Chau", "Dung", "Em", "Phuc", "Giang"];

function setup({ capacity = "", locked = false } = {}) {
  const ss = new FakeSpreadsheet();
  ss.insertSheet("Roster").data = [
    ["Name", "Venmo", "Facebook", "Note", "Zelle"],
    ...NAMES.map((name) => [name, "", "", "", ""]),
  ];
  ss.insertSheet("RSVP Dates").data = [
    // The pre-waitlist 7-column header, as on the live sheet before rollout.
    ["Play Date", "Added At", "Added By", "Field Name", "Address", "Start Time", "End Time"],
    [DATE, "", "admin", "Field", "Addr", "8:30 PM", "10:30 PM", capacity],
  ];
  if (locked) {
    ss.insertSheet("Roster Locks").data = [
      ["Play Date", "Locked", "Updated At", "Updated By"],
      [DATE, "TRUE", "", ""],
    ];
  }
  return { ss, gas: loadBackend(BACKEND, ss) };
}

const rsvp = (gas, playerName, count, extra = {}) =>
  gas.call({
    playDate: DATE,
    playerName,
    participantCount: String(count),
    vote: count > 0 ? "Yes" : "No",
    ...extra,
  });
const tallyOf = (gas) => gas.call({ action: "list", playDate: DATE }).tally;
const names = (list) =>
  list.map((p) => `${p.name}${p.participantCount > 1 ? `x${p.participantCount}` : ""}`);
const votes = (ss) =>
  Object.fromEntries(ss.getSheetByName("RSVPs").data.slice(1).map((row) => [row[1], row[2]]));

test("no capacity: behaves exactly as before (everyone Yes, no waitlist)", () => {
  const { ss, gas } = setup();
  NAMES.slice(0, 5).forEach((n) => assert.strictEqual(rsvp(gas, n, 1).status, "confirmed"));
  const tally = tallyOf(gas);
  assert.strictEqual(tally.totalCount, 5);
  assert.deepStrictEqual(tally.waitlist, []);
  assert.ok(Object.values(votes(ss)).every((v) => v === "Yes"));
});

test("fills up, then later sign-ups join the waitlist in order", () => {
  const { ss, gas } = setup({ capacity: 3 });
  ["Anh", "Binh", "Chau"].forEach((n) => assert.strictEqual(rsvp(gas, n, 1).status, "confirmed"));
  const dung = rsvp(gas, "Dung", 1);
  assert.strictEqual(dung.status, "waitlisted");
  assert.strictEqual(dung.waitlistPosition, 1);
  const em = rsvp(gas, "Em", 2);
  assert.strictEqual(em.status, "waitlisted");
  assert.strictEqual(em.waitlistPosition, 2);
  const tally = tallyOf(gas);
  assert.deepStrictEqual(names(tally.players), ["Anh", "Binh", "Chau"]);
  assert.deepStrictEqual(names(tally.waitlist), ["Dung", "Emx2"]);
  assert.strictEqual(tally.waitlistCount, 3);
  // Billing/report only count "Yes": waitlisted rows are stored as "Waitlist".
  assert.strictEqual(votes(ss).Dung, "Waitlist");
  assert.strictEqual(votes(ss).Em, "Waitlist");
});

test("a drop-out promotes the first in line, and it is audited", () => {
  const { ss, gas } = setup({ capacity: 3 });
  ["Anh", "Binh", "Chau", "Dung", "Em"].forEach((n) => rsvp(gas, n, 1));
  const out = rsvp(gas, "Binh", 0); // "Not going"
  assert.strictEqual(out.action, "deleted");
  assert.deepStrictEqual(names(out.tally.players), ["Anh", "Chau", "Dung"]);
  assert.deepStrictEqual(names(out.tally.waitlist), ["Em"]);
  assert.strictEqual(votes(ss).Dung, "Yes");
  const audit = ss.getSheetByName("RSVP Audit Log").data.map((row) => `${row[1]}:${row[3]}`);
  assert.ok(audit.includes("promoted_from_waitlist:Dung"));
});

test("the 'Remove this RSVP' button (delete action) also promotes", () => {
  const { ss, gas } = setup({ capacity: 2 });
  ["Anh", "Binh", "Chau"].forEach((n) => rsvp(gas, n, 1));
  const out = gas.call({ action: "delete", playDate: DATE, playerName: "Anh" });
  assert.deepStrictEqual(names(out.tally.players), ["Binh", "Chau"]);
  assert.strictEqual(votes(ss).Chau, "Yes");
});

test("promotion writes the right row even though deleting shifted rows", () => {
  const { ss, gas } = setup({ capacity: 2 });
  ["Anh", "Binh", "Chau", "Dung", "Em"].forEach((n) => rsvp(gas, n, 1));
  rsvp(gas, "Anh", 0); // sheet row 2 deleted: everything below shifts up
  assert.deepStrictEqual(votes(ss), { Binh: "Yes", Chau: "Yes", Dung: "Waitlist", Em: "Waitlist" });
});

test("a group too big for the open spot is skipped; a single behind it fills it", () => {
  const { gas } = setup({ capacity: 3 });
  ["Anh", "Binh", "Chau"].forEach((n) => rsvp(gas, n, 1));
  rsvp(gas, "Dung", 2); // waitlisted group of 2
  rsvp(gas, "Em", 1); // waitlisted single, behind Dung
  const out = rsvp(gas, "Binh", 0); // 1 spot opens
  assert.deepStrictEqual(names(out.tally.players), ["Anh", "Chau", "Em"]);
  assert.deepStrictEqual(names(out.tally.waitlist), ["Dungx2"]); // keeps first place
  const later = rsvp(gas, "Anh", 0); // still only 1 open
  assert.deepStrictEqual(names(later.tally.waitlist), ["Dungx2"]);
  const both = rsvp(gas, "Chau", 0); // now 2 open: Dung gets in
  assert.deepStrictEqual(names(both.tally.players), ["Dungx2", "Em"]);
});

test("a new single can take an open spot a waiting group can't use", () => {
  const { gas } = setup({ capacity: 3 });
  ["Anh", "Binh"].forEach((n) => rsvp(gas, n, 1));
  assert.strictEqual(rsvp(gas, "Chau", 2).status, "waitlisted"); // needs 2, only 1 open
  assert.strictEqual(rsvp(gas, "Dung", 1).status, "confirmed");
});

test("confirmed players are never bumped: adding guests when full is refused", () => {
  const { ss, gas } = setup({ capacity: 3 });
  ["Anh", "Binh", "Chau"].forEach((n) => rsvp(gas, n, 1));
  const out = rsvp(gas, "Anh", 3, { confirmOverride: "true" });
  assert.strictEqual(out.ok, false);
  assert.match(out.error, /game is full.*unchanged/i);
  assert.strictEqual(ss.getSheetByName("RSVPs").data[1][3], 1); // still "Just me"
  assert.deepStrictEqual(names(tallyOf(gas).players), ["Anh", "Binh", "Chau"]);
});

test("adding guests beyond the free spots says how many fit", () => {
  const { gas } = setup({ capacity: 4 });
  ["Anh", "Binh"].forEach((n) => rsvp(gas, n, 1));
  const out = rsvp(gas, "Anh", 4, { confirmOverride: "true" }); // room for Anh + 2
  assert.strictEqual(out.ok, false);
  assert.match(out.error, /room for you \+ 2/);
  assert.strictEqual(rsvp(gas, "Anh", 3, { confirmOverride: "true" }).status, "confirmed");
});

test("shrinking an RSVP always works and frees spots for the line", () => {
  const { gas } = setup({ capacity: 3 });
  rsvp(gas, "Anh", 3);
  rsvp(gas, "Binh", 1);
  const out = rsvp(gas, "Anh", 2, { confirmOverride: "true" });
  assert.strictEqual(out.status, "confirmed");
  assert.deepStrictEqual(names(out.tally.players), ["Anhx2", "Binh"]);
});

test("editing a waitlisted RSVP keeps your place in line", () => {
  const { gas } = setup({ capacity: 1 });
  rsvp(gas, "Anh", 1);
  rsvp(gas, "Binh", 2);
  rsvp(gas, "Chau", 1);
  const out = rsvp(gas, "Binh", 1, { confirmOverride: "true" });
  assert.strictEqual(out.status, "waitlisted");
  assert.strictEqual(out.waitlistPosition, 1);
});

test("an existing RSVP still asks for confirmation before overwriting", () => {
  const { gas } = setup({ capacity: 1 });
  rsvp(gas, "Anh", 1);
  rsvp(gas, "Binh", 1);
  assert.strictEqual(rsvp(gas, "Binh", 1).action, "needs_confirmation");
});

test("locked date: confirmed players can't drop out, waitlisted players can", () => {
  const { gas } = setup({ capacity: 1, locked: true });
  rsvp(gas, "Anh", 1);
  rsvp(gas, "Binh", 1);
  const blocked = rsvp(gas, "Anh", 0);
  assert.strictEqual(blocked.ok, false);
  assert.match(blocked.error, /locked/i);
  assert.strictEqual(rsvp(gas, "Binh", 0).action, "deleted");

  const viaDelete = setup({ capacity: 1, locked: true });
  rsvp(viaDelete.gas, "Anh", 1);
  rsvp(viaDelete.gas, "Binh", 1);
  const out = viaDelete.gas.call({ action: "delete", playDate: DATE, playerName: "Binh" });
  assert.strictEqual(out.action, "deleted");
});

test("removing the limit lets the whole waitlist in on the next change", () => {
  const { ss, gas } = setup({ capacity: 1 });
  ["Anh", "Binh", "Chau"].forEach((n) => rsvp(gas, n, 1));
  ss.getSheetByName("RSVP Dates").data[1][7] = "";
  rsvp(gas, "Dung", 1);
  assert.deepStrictEqual(names(tallyOf(gas).players), ["Anh", "Binh", "Chau", "Dung"]);
});

test("a client can't jump the line by backdating submittedAt", () => {
  const { gas } = setup({ capacity: 1 });
  rsvp(gas, "Anh", 1);
  rsvp(gas, "Binh", 1);
  rsvp(gas, "Chau", 1, { submittedAt: "2000-01-01T00:00:00.000Z" });
  assert.deepStrictEqual(names(tallyOf(gas).waitlist), ["Binh", "Chau"]);
});

test("the RSVP Dates sheet keeps working with the old 7-column header", () => {
  const { gas } = setup({ capacity: 2 });
  const dates = gas.call({ action: "listPlayDates" });
  assert.strictEqual(dates.dateDetails[0].capacity, 2);
  assert.strictEqual(dates.dateDetails[0].startTime, "8:30 PM");
});
