#!/usr/bin/env node
/**
 * Generate a paste-ready "unpaid dues" message for the soccer group chat.
 *
 * Lists every member who still owes for a month (sorted largest first), with a
 * per-date fee breakdown and how much each has paid, plus a total. Output is
 * plain text meant to be pasted straight into the Facebook Messenger group chat.
 *
 * Two data sources:
 *   - Live backend (default for a month): queries the Apps Script Web App used
 *     by billing.html and computes balances the same way the billing page does,
 *     including per-player Paid status. Use this for current / open months.
 *   - Finalized CSV: a file in data/ (e.g. data/04_2026.csv). Used for a month
 *     that has a local CSV, or when a CSV path is given directly.
 *
 * Resolution for a month token:
 *   - a local data/<MM>_<YYYY>.csv exists  -> CSV
 *   - otherwise                            -> live backend
 *   - --live always forces the live backend
 *
 * It reuses the repo's billing-parser.js (CSV) and mirrors billing.js's
 * calculateBilling (live) so the numbers match billing.html.
 *
 * Usage:
 *   node generate-dues-message.js <month-or-csv> [--live] [--paid "Name A, Name B"] \
 *        [--venmo nhcuong95] [--zelle 7744208189] [--recipient "Cuong Tipu"]
 *
 * <month-or-csv> accepts:
 *   2026-08            -> data/08_2026.csv if present, else live backend
 *   08_2026            -> same
 *   ./path/to/file.csv -> that CSV file
 *
 * --paid   Comma-separated names to leave OUT (already paid). On the live path,
 *          players marked Paid in the sheet are excluded automatically; use this
 *          to drop extra people for a reminder post.
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const DATA_DIR = path.join(REPO_ROOT, "data");
const FETCH_TIMEOUT_MS = 30000;

// Defaults match billing.js (VENMO_RECIPIENT_USERNAME / VENMO_RECIPIENT_NAME).
const DEFAULTS = {
  venmo: "nhcuong95",
  zelle: "7744208189",
  recipient: "Cuong Tipu",
};

function parseArgs(argv) {
  const options = { paid: [], live: false, ...DEFAULTS };
  let target = "";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--paid") {
      options.paid = String(argv[index + 1] || "")
        .split(",")
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean);
      index += 1;
    } else if (arg === "--live") {
      options.live = true;
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

function resolveTarget(target, forceLive) {
  if (!target) {
    throw new Error(
      "Provide a month (2026-08) or a CSV path. Example: node generate-dues-message.js 2026-08",
    );
  }

  const isoMonth = target.match(/^(\d{4})-(\d{2})$/);
  const fileMonth = target.match(/^(\d{2})_(\d{4})$/);

  if (isoMonth || fileMonth) {
    const year = Number(isoMonth ? isoMonth[1] : fileMonth[2]);
    const month = Number(isoMonth ? isoMonth[2] : fileMonth[1]);
    const csvPath = path.join(
      DATA_DIR,
      `${String(month).padStart(2, "0")}_${year}.csv`,
    );
    const useLive = forceLive || !fs.existsSync(csvPath);
    return {
      mode: useLive ? "live" : "csv",
      csvPath,
      year,
      month,
      monthKey: `${year}-${String(month).padStart(2, "0")}`,
    };
  }

  const csvPath = path.resolve(process.cwd(), target);
  const base = path.basename(csvPath).match(/^(\d{2})_(\d{4})/);
  return {
    mode: "csv",
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

function getAppsScriptUrl() {
  const source = fs.readFileSync(path.join(REPO_ROOT, "billing.js"), "utf8");
  const match = source.match(/APPS_SCRIPT_URL\s*=\s*\n?\s*"([^"]+)"/);
  if (!match) {
    throw new Error("Could not find APPS_SCRIPT_URL in billing.js");
  }
  return match[1];
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function dateWeight(dateValue) {
  return new Date(`${dateValue}T00:00:00`).getDay() === 0 ? 1.5 : 1;
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

// --- CSV source: reuse billing-parser.js, enrich with per-date fees ---------
function membersFromCsv(csvPath, year, month) {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`);
  }
  const parser = loadParser();
  const model = parser.parseFinalizedBillingCsv(fs.readFileSync(csvPath, "utf8"), {
    year,
    month,
  });
  const feePerPlayerByDate = new Map(
    (model.dailyCosts || []).map((day) => [
      day.date,
      Number(day.courtFeePerPlayer || 0) + Number(day.shuttleCostPerPlayer || 0),
    ]),
  );
  const members = (model.members || []).map((member) => ({
    name: member.name,
    courtFee: Number(member.courtFee || 0),
    birdieFee: Number(member.birdieFee || 0),
    netBalance: Number(member.netBalance || 0),
    attendance: (member.attendance || []).map((entry) => ({
      date: entry.date,
      spots: Number(entry.spots || 0),
      fee: (feePerPlayerByDate.get(entry.date) || 0) * Number(entry.spots || 0),
    })),
  }));
  return { members, paidNames: new Set(), monthStatus: "finalized" };
}

// --- Live source: mirror billing.js calculateBilling ------------------------
async function fetchBillingMonth(monthKey) {
  if (typeof fetch !== "function") {
    throw new Error("This Node version has no global fetch; use Node 18+ or a CSV.");
  }
  const url = `${getAppsScriptUrl()}?callback=cb&action=listBillingMonth&month=${encodeURIComponent(
    monthKey,
  )}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let text;
  try {
    const response = await fetch(url, { signal: controller.signal });
    text = await response.text();
  } catch (error) {
    throw new Error(
      error.name === "AbortError"
        ? "Backend request timed out"
        : `Could not reach the billing backend: ${error.message}`,
    );
  } finally {
    clearTimeout(timer);
  }
  // Response is JSONP: cb({...});
  const parsed = JSON.parse(text.slice(text.indexOf("(") + 1, text.lastIndexOf(")")));
  if (!parsed.ok || !parsed.billing) {
    throw new Error(parsed.error || `No billing data for ${monthKey}`);
  }
  return parsed.billing;
}

function membersFromBilling(billing) {
  const monthKey = billing.month;
  const members = new Map();
  const ensure = (name) => {
    if (!members.has(name)) {
      members.set(name, {
        name,
        weightedSpots: 0,
        courtFee: 0,
        birdieFee: 0,
        credits: 0,
        attendance: [],
      });
    }
    return members.get(name);
  };

  const activeCourtBlocks = (billing.courtBlocks || []).filter(
    (block) => block.status === "active",
  );
  const courtByDate = new Map();
  activeCourtBlocks.forEach((block) => {
    courtByDate.set(
      block.date,
      (courtByDate.get(block.date) || 0) + Number(block.amount || 0),
    );
    if (block.paidBy) {
      ensure(block.paidBy).credits += Number(block.amount || 0);
    }
  });

  const billedBirdies = (billing.birdiePurchases || []).filter(
    (purchase) =>
      purchase.status !== "canceled" &&
      String(purchase.date || "").startsWith(`${monthKey}-`) &&
      String(purchase.recordType || "purchase").replace(/-/g, "_") !==
        "inventory_purchase",
  );
  billedBirdies.forEach((purchase) => {
    if (purchase.paidBy) {
      ensure(purchase.paidBy).credits += Number(purchase.amount || 0);
    }
  });

  (billing.adjustments || [])
    .filter((adjustment) => adjustment.status !== "canceled")
    .forEach((adjustment) => {
      ensure(adjustment.playerName).credits += Number(adjustment.amount || 0);
    });

  let totalWeightedSpots = 0;
  (billing.attendance || []).forEach((day) => {
    const weight = dateWeight(day.date);
    const daySpots = day.players.reduce((sum, player) => sum + player.spots, 0);
    totalWeightedSpots += daySpots * weight;
    const courtPerSpot = daySpots > 0 ? (courtByDate.get(day.date) || 0) / daySpots : 0;
    day.players.forEach((player) => {
      const member = ensure(player.name);
      member.weightedSpots += player.spots * weight;
      member.courtFee += courtPerSpot * player.spots;
      member.attendance.push({
        date: day.date,
        spots: player.spots,
        weight,
        courtPerSpot,
      });
    });
  });

  const birdieTotal = billedBirdies.reduce(
    (sum, purchase) => sum + Number(purchase.amount || 0),
    0,
  );
  const birdiePerWeightedSpot =
    totalWeightedSpots > 0 ? birdieTotal / totalWeightedSpots : 0;

  const list = [...members.values()].map((member) => {
    member.birdieFee = member.weightedSpots * birdiePerWeightedSpot;
    member.netBalance = member.courtFee + member.birdieFee - member.credits;
    return {
      name: member.name,
      courtFee: member.courtFee,
      birdieFee: member.birdieFee,
      netBalance: member.netBalance,
      attendance: member.attendance.map((entry) => ({
        date: entry.date,
        spots: entry.spots,
        fee:
          entry.courtPerSpot * entry.spots +
          entry.spots * entry.weight * birdiePerWeightedSpot,
      })),
    };
  });

  const paidNames = new Set(
    (billing.payments || [])
      .filter((payment) => String(payment.status).toLowerCase() === "paid")
      .map((payment) => String(payment.playerName).trim().toLowerCase()),
  );

  return { members: list, paidNames, monthStatus: billing.monthStatus?.status };
}

// --- Message assembly -------------------------------------------------------
function buildDuesMessage(members, meta, options, extraPaid) {
  const monthDay = (value) => String(value || "").slice(5).replace("-", "/");
  const paidSet = new Set([...(options.paid || []), ...(extraPaid || [])]);
  const unpaid = members
    .filter(
      (member) =>
        round(member.netBalance) > 0.005 &&
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

  const total = unpaid.reduce((sum, member) => sum + round(member.netBalance), 0);
  const lines = unpaid.map((member) => {
    const played = (member.attendance || [])
      .slice()
      .sort((first, second) => first.date.localeCompare(second.date))
      .map((entry) => `${monthDay(entry.date)} (${formatMoney(entry.fee)})`)
      .join(", ");
    const gross = round(Number(member.courtFee || 0) + Number(member.birdieFee || 0));
    const paid = round(gross - Number(member.netBalance || 0));
    const playedText = played ? `play ${played}; ` : "";
    return `• ${member.name} — ${playedText}paid ${formatMoney(
      paid,
    )}, missing ${formatMoney(member.netBalance)} of ${formatMoney(gross)}`;
  });

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

async function main() {
  const { target, options } = parseArgs(process.argv.slice(2));
  const resolved = resolveTarget(target, options.live);
  const meta = { year: resolved.year, month: resolved.month };

  let source;
  if (resolved.mode === "live") {
    const billing = await fetchBillingMonth(resolved.monthKey);
    source = membersFromBilling(billing);
    if (source.monthStatus && source.monthStatus !== "finalized") {
      process.stderr.write(
        `Note: ${resolved.monthKey} is still "${source.monthStatus}" (not finalized) — amounts may change.\n`,
      );
    }
  } else {
    source = membersFromCsv(resolved.csvPath, resolved.year, resolved.month);
  }

  const { message } = buildDuesMessage(source.members, meta, options, source.paidNames);
  process.stdout.write(`${message}\n`);
}

main().catch((error) => {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exit(1);
});
