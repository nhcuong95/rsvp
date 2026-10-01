// Team builder data in the admin backend: player-set favorite positions and
// admin-only per-position scores — above all, that scores never leak through
// anything a non-admin can call. Run: node --test "tests/**/*.test.js"
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { FakeSpreadsheet, loadBackend, plain } = require("./gas-mock");

const RSVP = path.join(__dirname, "../../google-apps-script/rsvp-web-app/Code.gs");
const ADMIN = path.join(__dirname, "../../google-apps-script/Code.gs");
const NAMES = ["Anh", "Binh", "Chau"];
const TOKEN = "test-admin-token";

function setup() {
  const ss = new FakeSpreadsheet();
  ss.insertSheet("Roster").data = [
    ["Name", "Venmo", "Facebook", "Note", "Zelle"],
    ...NAMES.map((name) => [name, `@${name.toLowerCase()}`, "", `note ${name}`, ""]),
  ];
  // A working cache so admin tokens can be checked for real.
  const cache = new Map();
  const globals = {
    CacheService: {
      getScriptCache: () => ({
        get: (key) => cache.get(key) ?? null,
        put: (key, value) => cache.set(key, value),
        remove: (key) => cache.delete(key),
      }),
    },
  };
  const admin = loadBackend(ADMIN, ss, undefined, { globals });
  cache.set(admin.getAdminTokenCacheKey_(TOKEN), "true");
  const rsvp = loadBackend(RSVP, ss, undefined, { globals });
  return { ss, admin, rsvp };
}
const positionsOf = (admin) =>
  Object.fromEntries(admin.call({ action: "listPlayerPositions" }).players.map((p) => [p.name, p.positions]));
const saveScores = (admin, playerName, scores, adminToken = TOKEN) =>
  admin.call({ action: "savePlayerScores", adminToken, playerName, scores: JSON.stringify(scores) });

test("players save favorite positions without logging in; anyone can list them", () => {
  const { admin } = setup();
  const out = admin.call({ action: "savePlayerPositions", playerName: "anh", positions: "rb, CB ,st" });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.playerName, "Anh"); // roster spelling
  assert.deepStrictEqual(out.positions, ["CB", "RB", "ST"]); // field order
  assert.deepStrictEqual(positionsOf(admin), { Anh: ["CB", "RB", "ST"], Binh: [], Chau: [] });
});

test("unknown position codes are dropped; saving none clears them", () => {
  const { admin } = setup();
  admin.call({ action: "savePlayerPositions", playerName: "Binh", positions: "GK, XX, striker" });
  assert.deepStrictEqual(positionsOf(admin).Binh, ["GK"]);
  admin.call({ action: "savePlayerPositions", playerName: "Binh", positions: "" });
  assert.deepStrictEqual(positionsOf(admin).Binh, []);
});

test("positions can only be saved for roster members", () => {
  const { admin } = setup();
  const out = admin.call({ action: "savePlayerPositions", playerName: "Stranger", positions: "GK" });
  assert.strictEqual(out.ok, false);
  assert.match(out.error, /roster/);
});

test("every position change is audit-logged with the previous value", () => {
  const { ss, admin } = setup();
  admin.call({ action: "savePlayerPositions", playerName: "Chau", positions: "CM" });
  admin.call({ action: "savePlayerPositions", playerName: "Chau", positions: "LW,RW" });
  const rows = ss.getSheetByName("RSVP Audit Log").data.filter((row) => row[1] === "positions_updated");
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual(JSON.parse(rows[1][14]), { previousPositions: ["CM"], positions: ["LW", "RW"] });
});

test("scores: saving or listing without an admin token is refused", () => {
  const { ss, admin } = setup();
  for (const adminToken of ["", "wrong-token"]) {
    const save = saveScores(admin, "Anh", { CB: 9 }, adminToken);
    assert.strictEqual(save.ok, false);
    const list = admin.call({ action: "listPlayerScores", adminToken });
    assert.strictEqual(list.ok, false);
    assert.strictEqual(list.players, undefined);
  }
  const sheet = ss.getSheetByName("Player Scores");
  assert.ok(!sheet || sheet.getLastRow() <= 1, "nothing was written");
});

test("scores: admins save and list per-position scores; blanks clear", () => {
  const { admin } = setup();
  assert.deepStrictEqual(plain(saveScores(admin, "Anh", { CB: 8, RB: "7", ST: "" }).scores), { CB: 8, RB: 7 });
  const list = admin.call({ action: "listPlayerScores", adminToken: TOKEN }).players;
  assert.deepStrictEqual(list, [
    { name: "Anh", scores: { CB: 8, RB: 7 } },
    { name: "Binh", scores: {} },
    { name: "Chau", scores: {} },
  ]);
  saveScores(admin, "Anh", { CB: 6 }); // replaces the whole set
  assert.deepStrictEqual(admin.call({ action: "listPlayerScores", adminToken: TOKEN }).players[0].scores, { CB: 6 });
});

test("scores must be whole numbers from 1 to 10", () => {
  const { admin } = setup();
  for (const bad of [0, 11, 2.5, "x"]) {
    const out = saveScores(admin, "Anh", { GK: bad });
    assert.strictEqual(out.ok, false, String(bad));
    assert.match(out.error, /whole numbers from 1 to 10/);
  }
});

test("a hand-edited bad cell is skipped when listing, not fatal", () => {
  const { ss, admin } = setup();
  saveScores(admin, "Anh", { CB: 8 });
  ss.getSheetByName("Player Scores").data[1][1] = "great keeper"; // GK column
  assert.deepStrictEqual(admin.call({ action: "listPlayerScores", adminToken: TOKEN }).players[0].scores, { CB: 8 });
});

test("PRIVACY: scores never appear in anything a non-admin can call", () => {
  const { ss, admin, rsvp } = setup();
  saveScores(admin, "Anh", { GK: 9, CB: 8 });
  admin.call({ action: "savePlayerPositions", playerName: "Anh", positions: "GK" });
  const publicReplies = [
    rsvp.call({ action: "listRoster" }),
    rsvp.call({ action: "listPlayDates" }),
    admin.call({ action: "listRoster" }),
    admin.call({ action: "listPlayerPositions" }),
    admin.call({ action: "listPlayerScores" }), // no token
  ].map((reply) => JSON.stringify(reply));
  publicReplies.forEach((text) => {
    assert.doesNotMatch(text, /"scores"/);
    assert.doesNotMatch(text, /:9\b/);
  });
  // Roster upkeep (migrateRosterSheet_ runs on every roster read) leaves the
  // score sheet alone and never folds scores into the public Note field.
  assert.deepStrictEqual(ss.getSheetByName("Roster").data[0], ["Name", "Venmo", "Facebook", "Note", "Zelle"]);
  assert.strictEqual(ss.getSheetByName("Roster").data[1][3], "note Anh");
  assert.deepStrictEqual(plain(ss.getSheetByName("Player Scores").data[1].slice(0, 4)), ["Anh", 9, "", 8]);
});

test("renaming a member carries their positions and scores along", () => {
  const { admin } = setup();
  admin.call({ action: "savePlayerPositions", playerName: "Binh", positions: "ST" });
  saveScores(admin, "Binh", { ST: 9 });
  const out = admin.call({ action: "saveRosterMember", adminToken: TOKEN, oldPlayerName: "Binh", playerName: "Binh Le" });
  assert.strictEqual(out.ok, true, out.error);
  assert.deepStrictEqual(positionsOf(admin)["Binh Le"], ["ST"]);
  const scores = admin.call({ action: "listPlayerScores", adminToken: TOKEN }).players;
  assert.deepStrictEqual(scores.find((p) => p.name === "Binh Le").scores, { ST: 9 });
});
