// Serves the site locally and answers its Apps Script calls by running the
// REAL backend Code.gs files against one shared in-memory fake spreadsheet,
// so front-end + backend changes can be tried together before deploying.
//
//   node tests/backend/local-server.js      (PORT=8770 by default)
//   http://localhost:8770/?date=2026-09-24  RSVP page (seeded: max 4, 2 waiting)
//   http://localhost:8770/__login-admin     sign this browser in as admin
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
const NAMES = ["Anh Tran", "Binh Le", "Chau Vo", "Dung Pham", "Em Ho", "Phuc Ly", "Giang Do", "Hoa Mai"];
ss.insertSheet("Roster").data = [
  ["Name", "Venmo", "Facebook", "Note", "Zelle"],
  ...NAMES.map((name) => [name, "", "", "", ""]),
];
ss.insertSheet("RSVP Dates").data = [
  ["Play Date", "Added At", "Added By", "Field Name", "Address", "Start Time", "End Time", "Capacity"],
  ["2026-09-24", "", "admin", "Lower Woodland #2", "5201 Green Lake Way N, Seattle, WA 98103", "8:30 PM", "10:30 PM", 4],
  ["2026-10-01", "", "admin", "Washington Park Soccer", "1017 Lake Washington Blvd E, Seattle, WA 98112", "8:30 PM", "10:30 PM", ""],
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
