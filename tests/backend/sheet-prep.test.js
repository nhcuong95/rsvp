// The RSVP backend checks a sheet's headers and column formats once, then
// skips that upkeep while the script cache remembers it. Run:
// node --test "tests/backend/*.test.js"
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { FakeSpreadsheet, loadBackend } = require("./gas-mock");

const BACKEND = path.join(__dirname, "../../google-apps-script/rsvp-web-app/Code.gs");
const DATE = "2026-09-24";

function setup() {
  const ss = new FakeSpreadsheet();
  ss.insertSheet("Roster").data = [
    ["Name", "Venmo", "Facebook", "Note", "Zelle"],
    ["Anh", "", "", "", ""],
    ["Binh", "", "", "", ""],
  ];
  ss.insertSheet("RSVP Dates").data = [
    ["Play Date", "Added At", "Added By", "Field Name", "Address", "Start Time", "End Time", "Capacity"],
    [DATE, "", "admin", "Field", "Addr", "8:30 PM", "10:30 PM", ""],
  ];
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
  return { ss, cache, gas: loadBackend(BACKEND, ss, undefined, { globals }) };
}

// Counts header-row reads per sheet (getRange starting at row 1).
function countHeaderReads(ss) {
  const reads = {};
  ss.getSheets().forEach((sheet) => {
    const getRange = sheet.getRange.bind(sheet);
    sheet.getRange = (row, ...rest) => {
      if (row === 1) reads[sheet.name] = (reads[sheet.name] || 0) + 1;
      return getRange(row, ...rest);
    };
  });
  return reads;
}

const rsvp = (gas, playerName) =>
  gas.call({ playDate: DATE, playerName, participantCount: "1", vote: "Yes" });

test("headers are checked on the first submit, then skipped", () => {
  const { ss, gas } = setup();
  assert.strictEqual(rsvp(gas, "Anh").action, "created");
  assert.deepStrictEqual(ss.getSheetByName("RSVPs").data[0].slice(0, 2), ["Play Date", "Player Name"]);
  assert.strictEqual(ss.getSheetByName("RSVP Audit Log").data[0][1], "Action");

  const reads = countHeaderReads(ss);
  const second = rsvp(gas, "Binh");
  assert.strictEqual(second.action, "created");
  assert.deepStrictEqual(second.tally.players.map((p) => p.name), ["Anh", "Binh"]);
  assert.deepStrictEqual(reads, {});
});

test("a sheet deleted after being cached is recreated with headers", () => {
  const { ss, gas } = setup();
  rsvp(gas, "Anh");
  delete ss.sheets["RSVP Audit Log"];
  rsvp(gas, "Binh");
  const audit = ss.getSheetByName("RSVP Audit Log").data;
  assert.strictEqual(audit[0][1], "Action");
  assert.strictEqual(audit[1][1], "created");
});

test("the ready flag is keyed by header count, so an added column is checked again", () => {
  const { gas, cache } = setup();
  rsvp(gas, "Anh");
  assert.ok([...cache.keys()].some((key) => /^rsvp-sheet-ready-v1:RSVPs:\d+$/.test(key)));
});
