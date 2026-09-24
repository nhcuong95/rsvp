// Minimal in-memory fake of the Apps Script services the two backends use
// (SpreadsheetApp, LockService, CacheService, ...), so the real Code.gs files
// can run under Node. Only the Sheet/Range methods the backends call exist.
const vm = require("vm");
const fs = require("fs");

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    Object.assign(this, { sheet, row, col, numRows, numCols });
  }

  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r += 1) {
      const src = this.sheet.data[this.row - 1 + r] || [];
      const line = [];
      for (let c = 0; c < this.numCols; c += 1) {
        const value = src[this.col - 1 + c];
        line.push(value === undefined ? "" : value);
      }
      out.push(line);
    }
    return out;
  }

  getValue() {
    return this.getValues()[0][0];
  }

  setValues(values) {
    values.forEach((line, r) =>
      line.forEach((value, c) => this.sheet.set(this.row + r, this.col + c, value)));
    return this;
  }

  setValue(value) {
    this.sheet.set(this.row, this.col, value);
    return this;
  }

  setNumberFormat() {
    return this;
  }
}

class FakeSheet {
  constructor(name) {
    this.name = name;
    this.data = []; // row-major; data[0] is sheet row 1 (headers)
  }

  set(row, col, value) {
    while (this.data.length < row) this.data.push([]);
    const line = this.data[row - 1];
    while (line.length < col) line.push("");
    line[col - 1] = value;
  }

  getLastRow() {
    let last = 0;
    this.data.forEach((line, index) => {
      if (line.some((value) => value !== "" && value !== undefined)) last = index + 1;
    });
    return last;
  }

  getLastColumn() {
    return this.data.reduce((max, line) => {
      let last = 0;
      line.forEach((value, index) => {
        if (value !== "" && value !== undefined) last = index + 1;
      });
      return Math.max(max, last);
    }, 0);
  }

  getRange(row, col, numRows = 1, numCols = 1) {
    // A1 ranges like "A:A" are only used for number formats, a no-op here.
    if (typeof row === "string") return new FakeRange(this, 1, 1, 0, 0);
    return new FakeRange(this, row, col, numRows, numCols);
  }

  appendRow(values) {
    this.data.splice(this.getLastRow(), 0, values.slice());
  }

  deleteRow(row) {
    this.data.splice(row - 1, 1);
  }

  setFrozenRows() {}
}

class FakeSpreadsheet {
  constructor() {
    this.sheets = {};
  }

  getSheetByName(name) {
    return this.sheets[name] || null;
  }

  insertSheet(name) {
    this.sheets[name] = new FakeSheet(name);
    return this.sheets[name];
  }
}

// Load a Code.gs file into its own sandbox bound to `spreadsheet`.
// By default `new Date()` ticks one second per call from `startTime`, so
// sign-up order is deterministic. Options:
//   realClock: use the real Date (for the local dev server)
//   globals:   extra/replacement Apps Script services (e.g. a real cache)
function loadBackend(file, spreadsheet, startTime = Date.UTC(2026, 8, 23, 17, 0, 0), overrides = {}) {
  let clock = startTime;
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        clock += 1000;
        super(clock);
      } else {
        super(...args);
      }
    }

    static now() {
      return clock;
    }
  }

  const context = {
    console,
    Date: overrides.realClock ? RealDate : FakeDate,
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, openById: () => spreadsheet },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    Utilities: { formatDate: (date) => date.toISOString().slice(0, 10) },
    Session: { getScriptTimeZone: () => "America/Los_Angeles" },
    ContentService: {
      createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
      MimeType: { JAVASCRIPT: "js" },
    },
    ...(overrides.globals || {}),
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });

  // Call doGet like the web app does and decode its JSONP reply.
  context.call = (parameter) => {
    const out = context.doGet({ parameter: { callback: "cb", ...parameter } });
    return JSON.parse(out.text.replace(/^cb\(/, "").replace(/\);$/, ""));
  };
  return context;
}

// Values built inside the sandbox use its own Array/Object, which
// assert.deepStrictEqual treats as different; compare them as plain JSON.
const plain = (value) => JSON.parse(JSON.stringify(value));

module.exports = { FakeSpreadsheet, FakeSheet, loadBackend, plain };
