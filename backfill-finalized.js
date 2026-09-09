(function () {
  const APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbyc_NEAxzm_0R2Mp05vHYURAHKNYqvjccBFTBh7JAgi7UThHi-W3F-2qM9akXiyrdJGMg/exec";

  const statusEl = document.querySelector("#backfill-status");
  const summaryEl = document.querySelector("#backfill-summary");
  const progressEl = document.querySelector("#backfill-progress");
  const logEl = document.querySelector("#backfill-log");
  const previewHeadingEl = document.querySelector("#backfill-preview-heading");
  const monthInput = document.querySelector("#backfill-month");
  const modeInput = document.querySelector("#backfill-mode");
  const runButton = document.querySelector("#run-backfill-button");
  const skipRsvpRow = document.querySelector("#skip-rsvp-row");
  const skipRsvpCheckbox = document.querySelector("#skip-rsvp-backfill");
  const actionHelpEl = document.querySelector("#backfill-action-help");

  let adminToken = "";
  let backfill = null;
  let authReady = false;
  let isRunning = false;

  function setStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = `status ${type || ""}`.trim();
  }

  function appendLog(message) {
    logEl.textContent = `${logEl.textContent}${message}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setActionHelp(message) {
    if (actionHelpEl) {
      actionHelpEl.textContent = message;
    }
  }

  function slug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getSelectedMode() {
    return modeInput.value === "full" ? "full" : "rsvp";
  }

  function isRsvpOnlyMode() {
    return getSelectedMode() === "rsvp";
  }

  function getSelectedMonthParts() {
    const match = String(monthInput.value || "").match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      throw new Error("Choose a valid backfill month");
    }
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      monthValue: monthInput.value,
      fixtureUrl: `./data/${match[2]}_${match[1]}.csv`,
    };
  }

  function formatMonthLabel(monthValue) {
    const match = String(monthValue || "").match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      return monthValue || "";
    }
    return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString(
      "en-US",
      { month: "long", year: "numeric" },
    );
  }

  function formatMoney(value) {
    return Number(value || 0).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
  }

  function formatNumber(value, digits) {
    return Number(value || 0).toLocaleString("en-US", {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    });
  }

  function getBackfillStats() {
    const playDates = new Set();
    const players = new Set();
    const totalRsvps = backfill.attendanceRsvps.reduce((sum, entry) => {
      playDates.add(entry.playDate);
      players.add(normalize(entry.playerName));
      return sum + Number(entry.participantCount || 0);
    }, 0);
    const courtHours = backfill.courtBlocks.reduce(
      (sum, block) =>
        sum + Number(block.durationHours || 0) * Number(block.courts || 0),
      0,
    );
    const courtCost = backfill.courtBlocks.reduce(
      (sum, block) => sum + Number(block.amount || 0),
      0,
    );

    return {
      totalRsvps,
      playDateCount: playDates.size,
      playerCount: players.size,
      courtHours,
      courtCost,
    };
  }

  function describeItem(item) {
    if (item.playDate && item.playerName) {
      return `${item.playDate} / ${item.playerName}`;
    }
    if (item.date && item.paidBy) {
      return `${item.date} / paid by ${item.paidBy}`;
    }
    if (item.date) {
      return item.date;
    }
    if (item.playerName) {
      return item.playerName;
    }
    return JSON.stringify(item);
  }

  function buildAppsScriptUrl(payload, callbackName) {
    const url = new URL(APPS_SCRIPT_URL);
    url.searchParams.set("callback", callbackName);
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });
    return url.toString();
  }

  function parseJsonp(text, callbackName) {
    const trimmed = text.trim();
    const prefix = `${callbackName}(`;
    if (!trimmed.startsWith(prefix) || !trimmed.endsWith(");")) {
      throw new Error("Unexpected Apps Script response");
    }
    return JSON.parse(trimmed.slice(prefix.length, -2));
  }

  async function requestAppsScript(payload) {
    const callbackName = `backfillCallback_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;
    const response = await fetch(buildAppsScriptUrl(payload, callbackName), {
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    const parsed = parseJsonp(await response.text(), callbackName);
    if (response.ok && parsed.ok) {
      return parsed;
    }
    throw new Error(parsed?.error || "Backfill request failed");
  }

  function renderPreview() {
    if (!backfill) {
      summaryEl.textContent = "No backfill model loaded.";
      previewHeadingEl.textContent = "Backfill Preview";
      skipRsvpRow.hidden = true;
      runButton.textContent = "Run Backfill";
      runButton.disabled = true;
      setActionHelp("Waiting for finalized data.");
      return;
    }

    const stats = getBackfillStats();
    const summaryParts = [
      `${stats.totalRsvps} total RSVP spots`,
      `${stats.playDateCount} play dates`,
      `${stats.playerCount} players`,
    ];

    if (!isRsvpOnlyMode()) {
      summaryParts.push(
        `${backfill.courtBlocks.length} court reserve blocks`,
        `${formatNumber(stats.courtHours, 1)} court-hours`,
        `${formatMoney(stats.courtCost)} court cost`,
        `${backfill.birdiePurchases.length} birdie total`,
        `${backfill.birdieInventoryPurchases.length} birdie inventory purchases`,
        `${backfill.creditAdjustments.length} payer credits`,
      );
    } else {
      summaryParts.push("court/birdie/credits skipped");
    }

    summaryEl.textContent = summaryParts.join(" / ");
    previewHeadingEl.textContent = `${formatMonthLabel(backfill.month)} ${
      isRsvpOnlyMode() ? "RSVP Backfill" : "Finalized Billing Backfill"
    }`;
    skipRsvpRow.hidden = isRsvpOnlyMode();
    runButton.textContent = isRsvpOnlyMode()
      ? `Run ${formatMonthLabel(backfill.month)} RSVP Backfill`
      : `Run ${formatMonthLabel(backfill.month)} Full Backfill`;

    if (isRunning) {
      runButton.disabled = true;
      setActionHelp("Backfill is running.");
      return;
    }

    if (!authReady) {
      runButton.disabled = true;
      setActionHelp("Checking saved admin login...");
      return;
    }

    runButton.disabled = !adminToken;
    setActionHelp(
      adminToken
        ? isRsvpOnlyMode()
          ? "Ready. This will import attendance votes only."
          : "Ready. Uncheck RSVP skip if you need to repair attendance."
        : "Admin login is required before this can run.",
    );
  }

  async function loadBackfill() {
    try {
      backfill = null;
      renderPreview();
      const selected = getSelectedMonthParts();
      const response = await fetch(selected.fixtureUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Could not load data/${String(selected.month).padStart(2, "0")}_${selected.year}.csv`);
      }
      const csv = await response.text();
      const model = window.BillingParser.parseFinalizedBillingCsv(csv, {
        year: selected.year,
        month: selected.month,
      });
      backfill = window.BillingParser.buildFinalizedBillingBackfill(model);
      setStatus(`${formatMonthLabel(backfill.month)} data is ready to import.`, "success");
      renderPreview();
    } catch (error) {
      setStatus(error.message, "error");
      runButton.disabled = true;
      setActionHelp("Fix the CSV load error before running backfill.");
    }
  }

  async function runStep(label, items, buildPayload) {
    const failures = [];
    let saved = 0;
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      progressEl.textContent = `${label}: ${index + 1} of ${items.length}`;
      try {
        await requestAppsScript({
          ...buildPayload(item, index),
          adminToken,
          actor: `${formatMonthLabel(backfill.month)} Backfill`,
        });
        saved += 1;
      } catch (error) {
        failures.push({ item, error });
        appendLog(`FAIL ${label}: ${describeItem(item)} - ${error.message}`);
      }
    }
    appendLog(`DONE ${label}: ${saved}/${items.length}`);
    return failures;
  }

  function getUniqueAttendanceNames() {
    const byName = new Map();
    backfill.attendanceRsvps.forEach((entry) => {
      const key = normalize(entry.playerName);
      if (key && !byName.has(key)) {
        byName.set(key, entry.playerName);
      }
    });
    return Array.from(byName.values()).sort((first, second) =>
      first.localeCompare(second),
    );
  }

  async function validateAttendanceRosterMembers() {
    progressEl.textContent = "Checking roster";
    const response = await requestAppsScript({ action: "listRoster" });
    const rosterNames = new Set(
      (response.roster || []).map((member) => normalize(member.name)),
    );
    const missingNames = getUniqueAttendanceNames().filter(
      (name) => !rosterNames.has(normalize(name)),
    );

    if (missingNames.length === 0) {
      appendLog("Roster preflight: all attendance names already exist");
      return [];
    }

    appendLog(`STOP Roster preflight: ${missingNames.length} CSV names are not in roster`);
    missingNames.forEach((name) => {
      appendLog(`MISSING roster name: ${name}`);
    });
    throw new Error("Fix CSV names to match roster before importing RSVP attendance.");
  }

  async function runBackfill() {
    if (!backfill || !adminToken) {
      return;
    }

    const confirmed = window.confirm(
      isRsvpOnlyMode()
        ? `Run RSVP attendance-only backfill for ${formatMonthLabel(backfill.month)}? This will add RSVP audit log entries.`
        : `Run full finalized billing backfill for ${formatMonthLabel(backfill.month)}? This is safe to rerun, but it will add RSVP audit log entries.`,
    );
    if (!confirmed) {
      return;
    }

    runButton.disabled = true;
    isRunning = true;
    renderPreview();
    logEl.textContent = "";
    setStatus(`Running ${formatMonthLabel(backfill.month)} backfill...`, "loading");

    try {
      if (!isRsvpOnlyMode() && skipRsvpCheckbox.checked) {
        appendLog("SKIP RSVP attendance: already imported");
      } else {
        await validateAttendanceRosterMembers();
        await runStep("RSVP attendance records", backfill.attendanceRsvps, (entry) => ({
          action: "adminUpsertRsvp",
          playDate: entry.playDate,
          playerName: entry.playerName,
          participantCount: entry.participantCount,
          vote: "Yes",
          confirmOverride: "true",
        }));
      }

      if (isRsvpOnlyMode()) {
        progressEl.textContent = "Complete";
        setStatus(
          `${formatMonthLabel(backfill.month)} RSVP backfill finished. Open Billing and select ${formatMonthLabel(backfill.month)}.`,
          "success",
        );
        return;
      }

      await runStep("Court costs", backfill.courtBlocks, (block) => ({
        action: "saveCourtBlock",
        month: backfill.month,
        id: `finalized-${backfill.month}-court-${block.sourceKey || block.date}`,
        date: block.date,
        startTime: block.startTime,
        durationHours: block.durationHours,
        courts: block.courts,
        amount: block.amount,
        paidBy: block.paidBy,
        source: block.source,
        status: block.status,
      }));

      await runStep(
        "Birdie inventory purchases",
        backfill.birdieInventoryPurchases,
        (purchase, index) => ({
          action: "saveBirdiePurchase",
          month: backfill.month,
          id: `finalized-${backfill.month}-birdie-inventory-${index + 1}`,
          date: purchase.date,
          tubes: purchase.tubes,
          amount: purchase.amount,
          paidBy: purchase.paidBy,
          status: purchase.status,
          recordType: purchase.recordType,
          unitPrice: purchase.unitPrice,
          batch: purchase.batch,
        }),
      );

      await runStep("Birdie totals", backfill.birdiePurchases, (purchase) => ({
        action: "saveBirdiePurchase",
        month: backfill.month,
        id: `finalized-${backfill.month}-birdie-total`,
        date: purchase.date,
        tubes: purchase.tubes,
        amount: purchase.amount,
        paidBy: purchase.paidBy,
        status: purchase.status,
        recordType: purchase.recordType,
        unitPrice: purchase.unitPrice,
        batch: purchase.batch,
      }));

      await runStep("Payer credits", backfill.creditAdjustments, (adjustment) => ({
        action: "saveBillingAdjustment",
        month: backfill.month,
        id: `finalized-${backfill.month}-credit-${slug(adjustment.playerName)}`,
        playerName: adjustment.playerName,
        amount: adjustment.amount,
        note: adjustment.note,
        status: "active",
      }));

      progressEl.textContent = "Complete";
      setStatus(
        `${formatMonthLabel(backfill.month)} full backfill finished. Open Billing and select ${formatMonthLabel(backfill.month)}.`,
        "success",
      );
    } catch (error) {
      appendLog(`STOP Backfill: ${error.message}`);
      setStatus(error.message, "error");
    } finally {
      isRunning = false;
      renderPreview();
    }
  }

  async function initializeAuth() {
    const adminAuth = window.RsvpAdminAuth;
    if (!adminAuth) {
      authReady = true;
      setStatus("Admin auth is not available.", "error");
      renderPreview();
      return;
    }

    if (adminAuth.ready) {
      await adminAuth.ready;
    }
    authReady = true;

    adminAuth.onChange((state) => {
      adminToken = state.token || "";
      renderPreview();
      if (!adminToken) {
        setStatus("Log in on the Admin page first, then reload this page.", "error");
      } else if (backfill) {
        setStatus("Admin login found. April finalized data is ready.", "success");
      }
    });
  }

  runButton.addEventListener("click", runBackfill);
  monthInput.addEventListener("change", loadBackfill);
  modeInput.addEventListener("change", renderPreview);
  initializeAuth();
  loadBackfill();
})();
