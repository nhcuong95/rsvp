// Serves the site locally and answers its Apps Script calls by running the
// REAL backend Code.gs files against one shared in-memory fake spreadsheet,
// so front-end + backend changes can be tried together before deploying.
//
//   node tests/backend/local-server.js      (PORT=8770 by default)
//   http://localhost:8770/?date=2026-09-24  RSVP page (seeded: max 4, 2 waiting)
//   http://localhost:8770/?date=2026-10-08  23 players with positions/scores (Make teams)
//   http://localhost:8770/__login-admin     sign this browser in as admin
//   http://localhost:8770/billing.html      October billing with per-date prices
//   http://localhost:8770/__sheet           current RSVPs sheet as JSON
//
// Nothing touches the real Google Sheet; data resets on restart.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { FakeSpreadsheet, loadBackend } = require("./gas-mock");

const SITE = path.resolve(__dirname, "../..");
const PORT = Number(process.env.PORT || 8770);
const RSVP_ID = "AKfycbxKfZ8FlMDgVJ5weT9rOmFbfPlExX0DIFNuvCuvumkFUBgGu1Jzc77_utdzp_JghDyL";
const ADMIN_ID = "AKfycbyc_NEAxzm_0R2Mp05vHYURAHKNYqvjccBFTBh7JAgi7UThHi-W3F-2qM9akXiyrdJGMg";
const ADMIN_TOKEN = "local-test-token";

const ss = new FakeSpreadsheet();
const NAMES = [
  "Anh Tran", "Binh Le", "Chau Vo", "Dung Pham", "Em Ho", "Phuc Ly", "Giang Do", "Hoa Mai",
  "Khoa Bui", "Long Dang", "Minh Ngo", "Nam Vu", "Oanh Ly", "Quan Ha", "Son Tran", "Tuan Le",
  "Uyen Pham", "Viet Do", "Xuan Mai", "Yen Ho", "Bao Lam", "Cuong Ta", "Dat Trinh", "Hieu Dinh",
];
ss.insertSheet("Roster").data = [
  ["Name", "Venmo", "Facebook", "Note", "Zelle"],
  ...NAMES.map((name) => [name, "", "", "", ""]),
];
ss.insertSheet("RSVP Dates").data = [
  ["Play Date", "Added At", "Added By", "Field Name", "Address", "Start Time", "End Time", "Capacity"],
  ["2026-09-24", "", "admin", "Lower Woodland #2", "5201 Green Lake Way N, Seattle, WA 98103", "8:30 PM", "10:30 PM", 4],
  ["2026-10-01", "", "admin", "Washington Park Soccer", "1017 Lake Washington Blvd E, Seattle, WA 98112", "8:30 PM", "10:30 PM", ""],
  ["2026-10-08", "", "admin", "Magnuson Park Field #6", "7400 Sand Point Way NE, Seattle, WA 98115", "8:00 PM", "10:00 PM", 24],
];

// A working cache + admin password so admin login/token checks run for real.
const cache = new Map();
const globals = {
  CacheService: {
    getScriptCache: () => ({
      get: (key) => cache.get(key) ?? null,
      put: (key, value) => cache.set(key, value),
      remove: (key) => cache.delete(key),
    }),
  },
  PropertiesService: {
    getScriptProperties: () => ({ getProperty: (key) => (key === "ADMIN_PASSWORD" ? "test-admin" : null) }),
  },
  Utilities: {
    formatDate: (date) => date.toISOString().slice(0, 10),
    getUuid: () => `local-${Math.random().toString(36).slice(2)}`,
  },
};
const rsvpApp = loadBackend(`${SITE}/google-apps-script/rsvp-web-app/Code.gs`, ss, 0, { realClock: true, globals });
const adminApp = loadBackend(`${SITE}/google-apps-script/Code.gs`, ss, 0, { realClock: true, globals });
cache.set(adminApp.getAdminTokenCacheKey_(ADMIN_TOKEN), "true");

// Seed 2026-09-24 (max 4): four confirmed, then two on the waitlist.
["Anh Tran", "Binh Le", "Chau Vo", "Dung Pham", "Em Ho"].forEach((name) =>
  rsvpApp.call({ playDate: "2026-09-24", playerName: name, participantCount: "1", vote: "Yes" }));
rsvpApp.call({ playDate: "2026-09-24", playerName: "Phuc Ly", participantCount: "2", vote: "Yes" });

// Seed 2026-10-08 (max 24) with 23 players for the team builder: 22 people
// plus one guest. Most have favorite positions and per-position scores; two
// are left unscored and one has no positions, so the panel's notes show.
const POSITIONS = ["GK", "LB", "CB", "RB", "CM", "LW", "RW", "ST"];
NAMES.slice(0, 22).forEach((name, index) => {
  rsvpApp.call({ playDate: "2026-10-08", playerName: name, participantCount: index === 5 ? "2" : "1", vote: "Yes" });
  const main = POSITIONS[index % 8];
  const second = POSITIONS[(index + 3) % 8];
  if (index !== 7) {
    adminApp.call({ action: "savePlayerPositions", playerName: name, positions: `${main},${second}` });
  }
  if (index !== 3 && index !== 11) {
    const skill = 4 + ((index * 7) % 6); // 4..9
    adminApp.call({
      action: "savePlayerScores",
      adminToken: ADMIN_TOKEN,
      playerName: name,
      scores: JSON.stringify({ [main]: skill, [second]: Math.max(1, skill - 2) }),
    });
  }
});

// October billing (Billing page, admin): 10/01 at $10 and 10/08 at $12 per
// person, 10/03 has RSVPs but no price (free). Two payments are already in.
ss.getSheetByName("RSVP Dates").data.push(["2026-10-03", "", "admin", "Lower Woodland #2", "", "8:00 AM", "10:00 AM", ""]);
["Anh Tran", "Binh Le", "Chau Vo", "Dung Pham", "Em Ho"].forEach((name, index) =>
  rsvpApp.call({ playDate: "2026-10-01", playerName: name, participantCount: index === 1 ? "2" : "1", vote: "Yes" }));
["Anh Tran", "Chau Vo"].forEach((name) =>
  rsvpApp.call({ playDate: "2026-10-03", playerName: name, participantCount: "1", vote: "Yes" }));
adminApp.call({ action: "savePlayDateDetails", adminToken: ADMIN_TOKEN, playDate: "2026-10-01",
  fieldName: "Washington Park Soccer", address: "1017 Lake Washington Blvd E, Seattle, WA 98112",
  startTime: "8:30 PM", endTime: "10:30 PM", price: "10" });
adminApp.call({ action: "saveBillingDatePrice", adminToken: ADMIN_TOKEN, date: "2026-10-08", price: "12" });
adminApp.call({ action: "saveCourtBlock", adminToken: ADMIN_TOKEN, month: "2026-10", date: "2026-10-01",
  startTime: "20:30", durationHours: "2", courts: "1", amount: "55", paidBy: "Anh Tran" });
adminApp.call({ action: "saveBillingPaymentRecord", adminToken: ADMIN_TOKEN, month: "2026-10",
  playerName: "Anh Tran", amount: "22", method: "Venmo", paidOn: "2026-10-02" });
adminApp.call({ action: "saveBillingPaymentRecord", adminToken: ADMIN_TOKEN, month: "2026-10",
  playerName: "Binh Le", amount: "10", method: "Zelle", paidOn: "2026-10-02", note: "half" });

// August, re-billed per date: Anh and Binh were marked Paid on the old
// field-split bill (no amounts), Chau paid $5 toward it (an old adjustment).
// No prices yet, so the Billing page offers "Record as payments".
const rsvpRows = ss.getSheetByName("RSVPs").data;
[["2026-08-06", "Anh Tran", 1], ["2026-08-06", "Binh Le", 2], ["2026-08-06", "Chau Vo", 1],
  ["2026-08-13", "Anh Tran", 1], ["2026-08-13", "Chau Vo", 1], ["2026-08-13", "Dung Pham", 1]]
  .forEach(([date, name, spots]) =>
    rsvpRows.push([date, name, "Yes", spots, "2026-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z", ""]));
adminApp.call({ action: "saveCourtBlock", adminToken: ADMIN_TOKEN, month: "2026-08", date: "2026-08-06",
  startTime: "20:00", durationHours: "2", courts: "1", amount: "60", paidBy: "Cuong Ta" });
adminApp.call({ action: "saveCourtBlock", adminToken: ADMIN_TOKEN, month: "2026-08", date: "2026-08-13",
  startTime: "20:00", durationHours: "2", courts: "1", amount: "45", paidBy: "Cuong Ta" });
["Anh Tran", "Binh Le"].forEach((playerName) =>
  adminApp.call({ action: "saveBillingPaymentStatus", adminToken: ADMIN_TOKEN, month: "2026-08", playerName, status: "Paid" }));
adminApp.call({ action: "saveBillingAdjustment", adminToken: ADMIN_TOKEN, month: "2026-08",
  playerName: "Chau Vo", amount: "5", note: "partial - Aug games" });

const TYPES = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json",
};

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const backend = url.pathname === "/rsvp-exec" ? rsvpApp : url.pathname === "/admin-exec" ? adminApp : null;
  if (backend) {
    const parameter = Object.fromEntries(url.searchParams);
    let out;
    try {
      out = backend.doGet({ parameter }).text;
    } catch (error) {
      out = `${parameter.callback}(${JSON.stringify({ ok: false, error: String(error.message) })});`;
    }
    console.log(url.pathname, parameter.action || "upsert", parameter.playerName || "");
    res.writeHead(200, { "Content-Type": "application/javascript" });
    return res.end(out);
  }
  if (url.pathname === "/__sheet") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(ss.getSheetByName("RSVPs").data, null, 2));
  }
  if (url.pathname === "/__login-admin") {
    const auth = JSON.stringify({ token: ADMIN_TOKEN, expiresAt: Date.now() + 6 * 3600 * 1000 });
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(`<script>localStorage.setItem("play-rsvp.adminAuth", ${JSON.stringify(auth)});location.replace("/");</script>`);
  }

  const file = path.join(SITE, url.pathname === "/" ? "index.html" : url.pathname);
  if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end("not found");
  }
  let body = fs.readFileSync(file);
  if (file.endsWith(".js")) {
    // Point the page at the local backends instead of the live Web Apps.
    body = body
      .toString()
      .replaceAll(`https://script.google.com/macros/s/${RSVP_ID}/exec`, `http://localhost:${PORT}/rsvp-exec`)
      .replaceAll(`https://script.google.com/macros/s/${ADMIN_ID}/exec`, `http://localhost:${PORT}/admin-exec`);
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  res.end(body);
}).listen(PORT, () => console.log(`Local site + backends: http://localhost:${PORT}`));
