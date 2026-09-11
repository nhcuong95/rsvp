#!/usr/bin/env node
/**
 * Generate a paste-ready "unpaid dues" message for the soccer group chat.
 *
 * Reads a finalized monthly billing CSV (the same files the billing page uses,
 * e.g. data/04_2026.csv) and lists every member whose MEMBER PAY balance is
 * still owed, sorted largest first, with a total. Output is plain text meant to
 * be pasted straight into the Facebook Messenger group chat.
 *
 * It reuses the repo's billing-parser.js so the numbers match billing.html.
 *
 * Usage:
 *   node generate-dues-message.js <month-or-csv> [--paid "Name A, Name B"] \
 *        [--venmo nampham2022] [--recipient "Nam Pham"]
 *
 * <month-or-csv> accepts:
 *   2026-04            -> resolves to <repo>/data/04_2026.csv
 *   04_2026            -> resolves to <repo>/data/04_2026.csv
 *   ./path/to/file.csv -> used as-is
 *
 * --paid   Comma-separated names to leave OUT (already paid). Use this for a
 *          reminder post that only nags the people who still owe.
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const DATA_DIR = path.join(REPO_ROOT, "data");

// Defaults match billing.js (VENMO_RECIPIENT_USERNAME / VENMO_RECIPIENT_NAME).
const DEFAULTS = {
  venmo: "nhcuong95",
  zelle: "7744208189",
  recipient: "Cuong Tipu",
};

function parseArgs(argv) {
  const options = { paid: [], ...DEFAULTS };
  let target = "";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--paid") {
      options.paid = String(argv[index + 1] || "")
        .split(",")
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean);
      index += 1;
    } else if (arg === "--venmo") {
      options.venmo = String(argv[index + 1] || DEFAULTS.venmo).replace(/^@/, "");
      index += 1;
    } else if (arg === "--zelle") {
      options.zelle = String(argv[index + 1] || DEFAULTS.zelle);
      index += 1;
    } else if (arg === "--recipient") {
      options.recipient = String(argv[index + 1] || DEFAULTS.recipient);
      index += 1;
    } else if (!target) {
      target = arg;
    }
  }

  return { target, options };
}

function resolveCsv(target) {
  if (!target) {
    throw new Error(
      "Provide a month (2026-04) or a CSV path. Example: node generate-dues-message.js 2026-04",
    );
  }

  const isoMonth = target.match(/^(\d{4})-(\d{2})$/);
  if (isoMonth) {
    return {
      csvPath: path.join(DATA_DIR, `${isoMonth[2]}_${isoMonth[1]}.csv`),
      year: Number(isoMonth[1]),
      month: Number(isoMonth[2]),
    };
  }

  const fileMonth = target.match(/^(\d{2})_(\d{4})$/);
  if (fileMonth) {
    return {
      csvPath: path.join(DATA_DIR, `${fileMonth[1]}_${fileMonth[2]}.csv`),
      year: Number(fileMonth[2]),
      month: Number(fileMonth[1]),
    };
  }

  const csvPath = path.resolve(process.cwd(), target);
  const base = path.basename(csvPath).match(/^(\d{2})_(\d{4})/);
  return {
    csvPath,
    year: base ? Number(base[2]) : new Date().getFullYear(),
    month: base ? Number(base[1]) : new Date().getMonth() + 1,
  };
}

function loadParser() {
  // billing-parser.js is an IIFE that attaches BillingParser to `window`.
  global.window = global.window || {};
  require(path.join(REPO_ROOT, "billing-parser.js"));
  if (!global.window.BillingParser) {
    throw new Error("Could not load BillingParser from billing-parser.js");
  }
  return global.window.BillingParser;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function formatMonthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function buildDuesMessage(members, meta, options) {
  const paidSet = new Set(options.paid);
  const unpaid = members
    .filter(
      (member) =>
        Number(member.netBalance) > 0.005 &&
        !paidSet.has(String(member.name).trim().toLowerCase()),
    )
    .sort((first, second) => second.netBalance - first.netBalance);

  if (!unpaid.length) {
    return {
      count: 0,
      message: `Everyone is paid up for ${formatMonthLabel(
        meta.year,
        meta.month,
      )} — no dues to collect. 🎉`,
    };
  }

  const total = unpaid.reduce(
    (sum, member) => sum + Math.round(Number(member.netBalance) * 100) / 100,
    0,
  );
  const lines = unpaid.map(
    (member) => `• ${member.name} — ${formatMoney(member.netBalance)}`,
  );

  const message = [
    `⚽ Soccer dues — ${formatMonthLabel(meta.year, meta.month)}`,
    "",
    `Please pay ${options.recipient} — Venmo @${options.venmo}${
      options.zelle ? ` or Zelle ${options.zelle}` : ""
    }. Add your name + the month in the note.`,
    "",
    ...lines,
    "",
    `Total to collect: ${formatMoney(total)} (${unpaid.length} player${
      unpaid.length === 1 ? "" : "s"
    })`,
    "Thanks! 🙏",
  ].join("\n");

  return { count: unpaid.length, message };
}

function main() {
  const { target, options } = parseArgs(process.argv.slice(2));
  const { csvPath, year, month } = resolveCsv(target);

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`);
  }

  const parser = loadParser();
  const csv = fs.readFileSync(csvPath, "utf8");
  const model = parser.parseFinalizedBillingCsv(csv, { year, month });
  const { message } = buildDuesMessage(model.members, { year, month }, options);

  process.stdout.write(`${message}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exit(1);
}
