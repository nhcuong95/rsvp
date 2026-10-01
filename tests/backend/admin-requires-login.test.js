// The admin backend's Web App URL is public (it is in every admin page's JS),
// so each write it accepts must check the admin token itself. Covers the
// roster writes (Venmo / Facebook / Note / Zelle) and the action-less RSVP
// write, which players must make through the RSVP backend instead.
// Run: node --test "tests/backend/*.test.js"
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { FakeSpreadsheet, loadBackend, plain } = require("./gas-mock");

const RSVP = path.join(__dirname, "../../google-apps-script/rsvp-web-app/Code.gs");
const ADMIN = path.join(__dirname, "../../google-apps-script/Code.gs");
const DATE = "2026-09-24";
const ADMIN_TOKEN = "test-token";

function setup() {
  const ss = new FakeSpreadsheet();
  ss.insertSheet("Roster").data = [
    ["Name", "Venmo", "Facebook", "Note", "Zelle"],
    ["Anh", "@anh", "https://www.facebook.com/anh", "cell 555-0100", "5550100000"],
    ["Binh", "", "", "", ""],
  ];
  ss.insertSheet("RSVP Dates").data = [
    ["Play Date", "Added At", "Added By", "Field Name", "Address", "Start Time", "End Time", "Capacity"],
    [DATE, "", "admin", "Field", "Addr", "8:30 PM", "10:30 PM", 1],
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

const sheetData = (ss, name) => plain(ss.getSheetByName(name).data);
const attackerInfo = {
  venmo: "@attacker",
  messenger: "https://www.facebook.com/attacker",
  note: "changed",
  zelle: "attacker@example.com",
};

test("completeRosterMemberInfo without an admin login can't change the Roster", () => {
  const { ss, adminApp } = setup();
  const before = sheetData(ss, "Roster");
  const attempts = [
    attackerInfo,
    ...Object.entries(attackerInfo).map(([field, value]) => ({ [field]: value })),
  ];

  ["Anh", "Binh"].forEach((playerName) => {
    attempts.forEach((fields) => {
      [{}, { adminToken: "forged-token" }].forEach((auth) => {
        const out = adminApp.call({
          action: "completeRosterMemberInfo", playerName, ...fields, ...auth,
        });
        assert.strictEqual(out.ok, false);
        assert.match(out.error, /Admin login/);
        assert.strictEqual(out.roster, undefined);
      });
    });
  });
  assert.deepStrictEqual(sheetData(ss, "Roster"), before);
});

test("an admin can still use completeRosterMemberInfo", () => {
  const { ss, adminApp } = setup();
  const out = adminApp.call({
    action: "completeRosterMemberInfo", adminToken: ADMIN_TOKEN, playerName: "Anh", venmo: "@anh2",
  });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.action, "completed");
  assert.deepStrictEqual(plain(out.updatedFields), ["Venmo"]);
  // Blank fields keep what is there.
  assert.deepStrictEqual(sheetData(ss, "Roster")[1], [
    "Anh", "@anh2", "https://www.facebook.com/anh", "cell 555-0100", "5550100000",
  ]);
});

test("the other roster writes also need an admin login", () => {
  const { ss, adminApp } = setup();
  const before = sheetData(ss, "Roster");
  const save = adminApp.call({ action: "saveRosterMember", playerName: "Anh", ...attackerInfo });
  assert.strictEqual(save.ok, false);
  assert.match(save.error, /Admin login/);
  const remove = adminApp.call({ action: "removeRosterMember", playerName: "Anh" });
  assert.strictEqual(remove.ok, false);
  assert.match(remove.error, /Admin login/);
  assert.deepStrictEqual(sheetData(ss, "Roster"), before);
});

test("the admin backend refuses RSVP writes that have no action", () => {
  const { ss, rsvpApp, adminApp } = setup();
  // The game is full (max 1): players RSVP through the RSVP backend, so a
  // second sign-up there waits in line.
  rsvpApp.call({ playDate: DATE, playerName: "Anh", participantCount: "1", vote: "Yes" });
  assert.strictEqual(
    rsvpApp.call({ playDate: DATE, playerName: "Binh", participantCount: "1", vote: "Yes" }).status,
    "waitlisted",
  );
  const before = sheetData(ss, "RSVPs");

  // Calling the admin URL directly used to skip the waitlist (and take a
  // backdated submittedAt), or remove someone.
  [
    { playerName: "Binh", participantCount: "3", vote: "Yes", submittedAt: "2000-01-01T00:00:00Z" },
    { playerName: "Binh", participantCount: "3", vote: "Yes", confirmOverride: "true" },
    { playerName: "Anh", participantCount: "0", vote: "No" },
  ].forEach((params) => {
    const out = adminApp.call({ playDate: DATE, ...params });
    assert.strictEqual(out.ok, false);
    assert.match(out.error, /Missing action/);
  });
  assert.deepStrictEqual(sheetData(ss, "RSVPs"), before);

  // Admins still add RSVPs with adminUpsertRsvp; it needs the token.
  const denied = adminApp.call({
    action: "adminUpsertRsvp", playDate: DATE, playerName: "Binh", participantCount: "1",
    vote: "Yes", confirmOverride: "true",
  });
  assert.match(denied.error, /Admin login/);
  assert.deepStrictEqual(sheetData(ss, "RSVPs"), before);
  const out = adminApp.call({
    action: "adminUpsertRsvp", adminToken: ADMIN_TOKEN, playDate: DATE, playerName: "Binh",
    participantCount: "1", vote: "Yes", confirmOverride: "true",
  });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.action, "updated");
});
