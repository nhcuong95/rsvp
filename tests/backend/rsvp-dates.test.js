// listRsvpDates: the admin Month Roster shows every date in the month where a
// roster player reserved a spot (any weekday), so a date keeps its column after
// it is removed from the RSVP list. Run: node --test "tests/**/*.test.js"
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { FakeSpreadsheet, loadBackend, plain } = require("./gas-mock");

const ADMIN = path.join(__dirname, "../../google-apps-script/Code.gs");

function setup(rsvpRows) {
  const ss = new FakeSpreadsheet();
  ss.insertSheet("Roster").data = [
    ["Name", "Venmo", "Facebook", "Note", "Zelle"],
    ["Anh", "", "", "", ""],
    ["Binh", "", "", "", ""],
  ];
  ss.insertSheet("RSVPs").data = [
    ["Play Date", "Player Name", "Vote", "Participant Count", "Submitted At", "Updated At"],
    ...rsvpRows,
  ];
  return loadBackend(ADMIN, ss);
}

test("lists sign-up dates in the month on any weekday, not just open ones", () => {
  const admin = setup([
    ["2026-10-01", "Anh", "Yes", 1, "", ""], // Thursday
    ["2026-10-07", "Binh", "Yes", 2, "", ""], // Wednesday
    ["2026-10-07", "Anh", "Yes", 1, "", ""], // same date twice
    ["2026-09-30", "Anh", "Yes", 1, "", ""], // other month
    ["2026-10-10", "Anh", "No", 0, "", ""], // not going
    ["2026-10-13", "Stranger", "Yes", 1, "", ""], // not on the roster
  ]);
  const out = admin.call({ action: "listRsvpDates", month: "2026-10" });
  assert.strictEqual(out.ok, true);
  assert.deepStrictEqual(plain(out.dates), ["2026-10-01", "2026-10-07"]);
});

test("an empty month lists no dates; a bad month is rejected", () => {
  const admin = setup([]);
  assert.deepStrictEqual(plain(admin.call({ action: "listRsvpDates", month: "2026-11" }).dates), []);
  assert.strictEqual(admin.call({ action: "listRsvpDates", month: "2026-13" }).ok, false);
  assert.strictEqual(admin.call({ action: "listRsvpDates" }).ok, false);
});
