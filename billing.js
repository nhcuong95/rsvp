(function () {
  const APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbyc_NEAxzm_0R2Mp05vHYURAHKNYqvjccBFTBh7JAgi7UThHi-W3F-2qM9akXiyrdJGMg/exec";
  const PLAYERS = [
    "Ly Phung Hoang",
    "Cuong Tipu",
    "Bao C Q Nguyen",
    "Thong Le",
    "Kim Huân",
    "Hung Duc Nguyen",
    "Minh Tuấn",
    "Ân Nguyễn",
    "Hieu Phan",
    "Duong Vu",
    "Cơ Trần",
    "Quang Nguyen",
    "Bao T Tran",
    "Kien Tran",
    "Duong Khai Du",
    "Thành Vinh",
    "Nguyen Thai",
    "Nguyen Hoang Nam",
    "Nguyễn Minh",
    "Henry Vu",
    "Quan N Nguyen",
    "Tai Doan",
    "Kiet Trinh",
    "Minh Vũ",
    "Nguyễn Hoàng Dương",
    "Tân",
    "Đứcc Anhh",
    "Phan Huy Hoang",
    "Huy Ho",
    "Nguyễn Dương Tùng",
  ];
  const PLAY_DAYS = [2, 4, 6]; // Tuesday, Thursday, Saturday
  const LAST_PLAYER_KEY = "play-rsvp.lastPlayerName";
  const DEFAULT_COURT_PAYER = ""; // no fixed payer; falls back to remembered player
  const STATUS_OPTIONS = ["Not requested", "Requested", "Paid", "Credit carryover"];
  const BILLING_CACHE_PREFIX = "billing:backend:";
  const BILLING_MONTHS_CACHE_PREFIX = "billing:months:";
  const MEMBER_BILLING_CACHE_TTL_MS = 15 * 60 * 1000;
  const ADMIN_BILLING_CACHE_TTL_MS = 60 * 1000;
  const MEMBER_BILLING_MONTHS_CACHE_TTL_MS = 5 * 60 * 1000;
  const ADMIN_BILLING_MONTHS_CACHE_TTL_MS = 60 * 1000;
  const FETCH_TIMEOUT_MS = 12000;
  const JSONP_TIMEOUT_MS = 30000;
  const VENMO_RECIPIENT_NAME = "Cuong Tipu";
  const VENMO_RECIPIENT_USERNAME = "nhcuong95";
  const ZELLE_RECIPIENT_PHONE = "7744208189";
  const LOCAL_BILLING_FIXTURE = new URLSearchParams(window.location.search).get(
    "localBillingFixture",
  );
  let isAdmin = false;
  let adminToken = "";
  let backendBilling = null;
  let backendAvailable = false;
  let latestBillingRequest = 0;

  const monthInput = document.querySelector("#billing-month");
  const reloadBillingButton = document.querySelector("#reload-billing-button");
  const statusEl = document.querySelector("#billing-status");
  const progressEl = document.querySelector("#billing-progress");
  const progressBar = document.querySelector("#billing-progress-bar");
  const progressText = document.querySelector("#billing-progress-text");
  const billingContent = document.querySelector("#billing-content");
  const finalizationBadge = document.querySelector("#billing-finalization-badge");
  const finalizationPanel = document.querySelector("#billing-finalization-panel");
  const finalizationTitle = document.querySelector("#billing-finalization-title");
  const finalizationNote = document.querySelector("#billing-finalization-note");
  const finalizationForm = document.querySelector("#billing-finalization-form");
  const finalizationSelect = document.querySelector("#billing-finalization-select");
  const summaryEl = document.querySelector("#overview-section");
  const courtForm = document.querySelector("#court-form");
  const courtDateInput = document.querySelector("#court-date");
  const courtStartTimeInput = document.querySelector("#court-start-time");
  const courtDurationInput = document.querySelector("#court-duration");
  const courtCountInput = document.querySelector("#court-count");
  const courtRatePresetInput = document.querySelector("#court-rate-preset");
  const courtHourlyRateInput = document.querySelector("#court-hourly-rate");
  const courtAmountInput = document.querySelector("#court-amount");
  const courtPaidByInput = document.querySelector("#court-paid-by");
  const courtFeedback = document.querySelector("#court-feedback");
  const courtBlockTable = document.querySelector("#court-block-table");
  const birdiePurchaseForm = document.querySelector("#birdie-purchase-form");
  const birdieDateInput = document.querySelector("#birdie-date");
  const birdieBatchInput = document.querySelector("#birdie-batch");
  const birdieTubesInput = document.querySelector("#birdie-tubes");
  const birdieUnitPriceInput = document.querySelector("#birdie-unit-price");
  const birdieAmountInput = document.querySelector("#birdie-amount");
  const birdiePaidByInput = document.querySelector("#birdie-paid-by");
  const birdieUsageForm = document.querySelector("#birdie-usage-form");
  const birdieUsageDateInput = document.querySelector("#birdie-usage-date");
  const birdieUsageBatchInput = document.querySelector("#birdie-usage-batch");
  const birdieUsageTubesInput = document.querySelector("#birdie-usage-tubes");
  const birdieFeedback = document.querySelector("#birdie-feedback");
  const birdiePurchaseTable = document.querySelector("#birdie-purchase-table");
  const memberNote = document.querySelector("#member-billing-note");
  const memberFeedback = document.querySelector("#member-feedback");
  const memberTable = document.querySelector("#member-billing-table");
  const markMonthPaidButton = document.querySelector("#mark-month-paid-button");
  const copyDuesButton = document.querySelector("#copy-dues-button");
  const memberSelect = document.querySelector("#member-detail-select");
  const memberDetail = document.querySelector("#member-detail");

  let attendanceRows = [];
  let billing = null;
  let billingLoaded = false;
  let billingMonths = [];
  let progressTimer = 0;
  let progressPercent = 0;

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

  function fetchWithTimeout(url, options, timeoutMs) {
    if (typeof AbortController === "undefined") {
      return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error("Request timed out")),
          timeoutMs,
        );
        fetch(url, options)
          .then(resolve)
          .catch(reject)
          .finally(() => window.clearTimeout(timeout));
      });
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, {
      ...options,
      signal: controller.signal,
    })
      .catch((error) => {
        if (error.name === "AbortError") {
          throw new Error("Request timed out");
        }
        throw error;
      })
      .finally(() => window.clearTimeout(timeout));
  }

  async function requestViaFetch(payload) {
    const callbackName = `billingCallback_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;
    const response = await fetchWithTimeout(
      buildAppsScriptUrl(payload, callbackName),
      {
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      },
      FETCH_TIMEOUT_MS,
    );
    const parsed = parseJsonp(await response.text(), callbackName);

    if (response.ok && parsed.ok) {
      return parsed;
    }

    throw new Error(parsed?.error || "Billing request failed");
  }

  function requestViaJsonp(payload) {
    return new Promise((resolve, reject) => {
      const callbackName = `billingJsonpCallback_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`;
      const script = document.createElement("script");
      script.referrerPolicy = "no-referrer";
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Apps Script took too long to respond"));
      }, JSONP_TIMEOUT_MS);

      function cleanup() {
        window.clearTimeout(timeout);
        script.remove();
        delete window[callbackName];
      }

      window[callbackName] = (response) => {
        cleanup();
        if (response && response.ok) {
          resolve(response);
          return;
        }

        reject(new Error(response?.error || "Billing request failed"));
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("Could not reach Apps Script"));
      };
      script.src = buildAppsScriptUrl(payload, callbackName);
      document.body.append(script);
    });
  }

  function requestAppsScript(payload) {
    return requestViaFetch(payload).catch(() => requestViaJsonp(payload));
  }

  function buildBackendAttendance(attendanceRsvps) {
    const byDate = new Map();
    attendanceRsvps.forEach((entry) => {
      if (!byDate.has(entry.playDate)) {
        byDate.set(entry.playDate, new Map());
      }
      const byPlayer = byDate.get(entry.playDate);
      const current = byPlayer.get(entry.playerName) || {
        name: entry.playerName,
        spots: 0,
      };
      current.spots += Number(entry.participantCount || 0);
      byPlayer.set(entry.playerName, current);
    });

    return Array.from(byDate.entries())
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([date, players]) => ({
        date,
        players: Array.from(players.values()).sort((first, second) =>
          first.name.localeCompare(second.name),
        ),
      }));
  }

  function getBirdieBatchKey(purchase) {
    return [
      String(purchase?.batch || "").trim(),
      Number(purchase?.unitPrice || 0).toFixed(2),
    ].join("|");
  }

  async function loadLocalBillingFixture() {
    if (!window.BillingParser) {
      throw new Error("Billing parser is not loaded for local fixture mode");
    }

    const response = await fetch(`./data/${LOCAL_BILLING_FIXTURE}.csv`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Could not load data/${LOCAL_BILLING_FIXTURE}.csv`);
    }

    const csv = await response.text();
    const match = LOCAL_BILLING_FIXTURE.match(/^(\d{2})_(\d{4})$/);
    const year = match ? Number(match[2]) : Number(monthInput.value.slice(0, 4));
    const month = match ? Number(match[1]) : Number(monthInput.value.slice(5, 7));
    const model = window.BillingParser.parseFinalizedBillingCsv(csv, {
      year,
      month,
    });
    const backfill = window.BillingParser.buildFinalizedBillingBackfill(model);

    monthInput.value = backfill.month;
    return {
      month: backfill.month,
      attendance: buildBackendAttendance(backfill.attendanceRsvps),
      courtBlocks: backfill.courtBlocks,
      birdieInventory: null,
      birdiePurchases: backfill.birdieInventoryPurchases.concat(
        backfill.birdiePurchases,
      ),
      payments: [],
      adjustments: backfill.creditAdjustments.map((adjustment, index) => ({
        id: `local-credit-${index + 1}`,
        playerName: adjustment.playerName,
        amount: adjustment.amount,
        note: adjustment.note,
        status: "active",
      })),
      monthStatus: {
        status: "draft",
        note: "Local fixture",
        updatedAt: "",
        updatedBy: "Local fixture",
      },
    };
  }

  function storageKey(name) {
    return `billing:${monthInput.value}:${name}`;
  }

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getBillingCacheKey(month) {
    return `${BILLING_CACHE_PREFIX}${month}`;
  }

  function getBillingCacheTtl() {
    return isAdmin ? ADMIN_BILLING_CACHE_TTL_MS : MEMBER_BILLING_CACHE_TTL_MS;
  }

  function getBillingMonthsCacheKey() {
    return `${BILLING_MONTHS_CACHE_PREFIX}${isAdmin ? "admin" : "member"}`;
  }

  function getBillingMonthsCacheTtl() {
    return isAdmin
      ? ADMIN_BILLING_MONTHS_CACHE_TTL_MS
      : MEMBER_BILLING_MONTHS_CACHE_TTL_MS;
  }

  function readBillingCache(month) {
    try {
      const cached = JSON.parse(localStorage.getItem(getBillingCacheKey(month)));
      if (!cached?.billing || !Number.isFinite(Number(cached.savedAt))) {
        return null;
      }
      return {
        billing: cached.billing,
        savedAt: Number(cached.savedAt),
      };
    } catch {
      return null;
    }
  }

  function writeBillingCache(month, nextBilling) {
    if (!month || !nextBilling) {
      return;
    }
    writeJson(getBillingCacheKey(month), {
      savedAt: Date.now(),
      billing: nextBilling,
    });
  }

  function readBillingMonthsCache() {
    try {
      const cached = JSON.parse(localStorage.getItem(getBillingMonthsCacheKey()));
      if (!Array.isArray(cached?.months) || !Number.isFinite(Number(cached.savedAt))) {
        return null;
      }
      return {
        months: cached.months,
        savedAt: Number(cached.savedAt),
      };
    } catch {
      return null;
    }
  }

  function writeBillingMonthsCache(months) {
    if (!Array.isArray(months)) {
      return;
    }
    writeJson(getBillingMonthsCacheKey(), {
      savedAt: Date.now(),
      months,
    });
  }

  function clearBillingCache(month) {
    if (month) {
      localStorage.removeItem(getBillingCacheKey(month));
    }
  }

  function isBillingCacheFresh(cached) {
    return Boolean(cached && Date.now() - cached.savedAt < getBillingCacheTtl());
  }

  function isBillingMonthsCacheFresh(cached) {
    return Boolean(
      cached && Date.now() - cached.savedAt < getBillingMonthsCacheTtl(),
    );
  }

  function formatCacheAge(savedAt) {
    const ageSeconds = Math.max(0, Math.round((Date.now() - Number(savedAt || 0)) / 1000));
    if (ageSeconds < 60) {
      return `${ageSeconds}s ago`;
    }
    const ageMinutes = Math.round(ageSeconds / 60);
    if (ageMinutes < 60) {
      return `${ageMinutes}m ago`;
    }
    const ageHours = Math.round(ageMinutes / 60);
    if (ageHours < 24) {
      return `${ageHours}h ago`;
    }
    const ageDays = Math.round(ageHours / 24);
    if (ageDays < 14) {
      return `${ageDays}d ago`;
    }
    const ageWeeks = Math.round(ageDays / 7);
    if (ageWeeks < 8) {
      return `${ageWeeks}w ago`;
    }
    return "a while ago";
  }

  function setStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = `status ${type || ""}`.trim();
  }

  function setSectionStatus(element, message, type) {
    if (!element) {
      setStatus(message, type);
      return;
    }
    element.textContent = message || "";
    element.className = `section-status ${type || ""}`.trim();
  }

  function clearSectionStatuses() {
    setSectionStatus(courtFeedback, "");
    setSectionStatus(birdieFeedback, "");
    setSectionStatus(memberFeedback, "");
  }

  function setProgress(percent, message) {
    if (!progressEl || !progressBar || !progressText) {
      return;
    }
    progressPercent = Math.max(progressPercent, Math.min(percent, 100));
    progressEl.hidden = false;
    progressBar.style.width = `${progressPercent}%`;
    progressText.textContent = message;
  }

  function clearProgress() {
    window.clearInterval(progressTimer);
    progressTimer = 0;
    progressPercent = 0;
    if (progressEl && progressBar) {
      progressEl.hidden = true;
      progressBar.style.width = "0%";
    }
  }

  function startProgress() {
    const steps = [
      [18, "Opening billing month..."],
      [42, "Loading RSVP attendance..."],
      [66, "Reading field and extras rows..."],
      [86, "Calculating member balances..."],
    ];
    let index = 0;

    clearProgress();
    setProgress(6, "Starting billing load...");
    progressTimer = window.setInterval(() => {
      const step = steps[Math.min(index, steps.length - 1)];
      setProgress(step[0], step[1]);
      index += 1;
    }, 900);
  }

  function finishProgress(message) {
    window.clearInterval(progressTimer);
    progressTimer = 0;
    setProgress(100, message);
    window.setTimeout(clearProgress, 700);
  }

  function setBillingContentVisible(isVisible) {
    if (billingContent) {
      billingContent.hidden = !isVisible;
    }
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Number(value || 0));
  }

  function formatNumber(value, digits) {
    return Number(value || 0).toLocaleString("en-US", {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    });
  }

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getMonthParts() {
    const match = String(monthInput.value || "").match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      return { year: 2026, monthIndex: 5 };
    }
    return {
      year: Number(match[1]),
      monthIndex: Number(match[2]) - 1,
    };
  }

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getMonthEndDateValue() {
    const { year, monthIndex } = getMonthParts();
    return formatDate(new Date(year, monthIndex + 1, 0));
  }

  function formatMonthLabel(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      return value || "";
    }
    return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString(
      "en-US",
      { month: "long", year: "numeric" },
    );
  }

  function getCurrentMonthValue() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function getFallbackBillingMonths(includeCurrent) {
    // Generate months from the group's start (Aug 2026) through the current
    // month so the list never goes stale as time passes.
    const current = getCurrentMonthValue();
    const [endYear, endMonth] = current.split("-").map(Number);
    const months = [];
    let year = 2026;
    let month = 8; // August 2026 = start of the soccer group
    while (year < endYear || (year === endYear && month <= endMonth)) {
      const value = `${year}-${String(month).padStart(2, "0")}`;
      const keep = includeCurrent ? value <= current : value < current;
      if (keep) {
        months.push({
          month: value,
          label: formatMonthLabel(value),
          allPaid: false,
          billable: false,
        });
      }
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
    return months;
  }

  function mergeBillingMonths(primaryMonths, fallbackMonths) {
    const byMonth = new Map();
    fallbackMonths.forEach((month) => byMonth.set(month.month, month));
    primaryMonths.forEach((month) => {
      byMonth.set(month.month, {
        ...byMonth.get(month.month),
        ...month,
      });
    });
    return Array.from(byMonth.values());
  }

  function populateBillingMonthOptions(months) {
    const currentSelection = monthInput.value;
    const openMonths = months
      .filter((month) => isAdmin || !month.allPaid)
      .sort((first, second) => first.month.localeCompare(second.month));

    billingMonths = openMonths;
    clearElement(monthInput);
    openMonths.forEach((month) => {
      const option = document.createElement("option");
      option.value = month.month;
      option.textContent =
        isAdmin || month.billable
          ? month.label || formatMonthLabel(month.month)
          : `${month.label || formatMonthLabel(month.month)} (setup)`;
      monthInput.append(option);
    });

    if (openMonths.some((month) => month.month === currentSelection)) {
      monthInput.value = currentSelection;
    } else if (openMonths.length) {
      monthInput.value = openMonths[openMonths.length - 1].month;
    }

    return openMonths.length > 0;
  }

  function normalizeBillingMonthOptions(months) {
    return isAdmin
      ? mergeBillingMonths(months || [], getFallbackBillingMonths(true))
      : months || [];
  }

  async function loadBillingMonthOptions() {
    if (LOCAL_BILLING_FIXTURE) {
      return true;
    }

    const cached = readBillingMonthsCache();
    let hasCachedMonths = false;
    if (cached?.months?.length) {
      hasCachedMonths = populateBillingMonthOptions(cached.months);
      if (hasCachedMonths) {
        setStatus(
          isBillingMonthsCacheFresh(cached)
            ? `Showing saved billing months from ${formatCacheAge(cached.savedAt)}. Refreshing...`
            : `Showing older saved billing months from ${formatCacheAge(cached.savedAt)} while refreshing...`,
          "loading",
        );
        requestAppsScript({
          action: "listBillingMonths",
          adminToken,
        })
          .then((result) => {
            const months = normalizeBillingMonthOptions(result.months || []);
            writeBillingMonthsCache(months);
            if (months.some((month) => month.month === monthInput.value)) {
              populateBillingMonthOptions(months);
            }
          })
          .catch(() => {
            // Keep using cached month options; billing load has its own error path.
          });
        return true;
      }
    }

    setStatus("Loading billing months...", "loading");

    try {
      const result = await requestAppsScript({
        action: "listBillingMonths",
        adminToken,
      });
      const months = normalizeBillingMonthOptions(result.months || []);
      writeBillingMonthsCache(months);
      const hasMonths = populateBillingMonthOptions(months);
      if (!hasMonths) {
        setBillingContentVisible(false);
        setStatus(
          isAdmin
            ? "No billing months are available yet."
            : "No open finalized billing months are ready for payment.",
          "",
        );
      }
      return hasMonths;
    } catch (error) {
      if (hasCachedMonths) {
        return true;
      }
      const hasMonths = populateBillingMonthOptions(getFallbackBillingMonths(isAdmin));
      if (!hasMonths) {
        setBillingContentVisible(false);
        setStatus(
          isAdmin
            ? "No billing months are available yet."
            : "No previous billing months are available yet.",
          "",
        );
      }
      return hasMonths;
    }
  }

  function formatDisplayDate(value) {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    });
  }

  function getDateWeight(value) {
    const date = new Date(`${value}T00:00:00`);
    return date.getDay() === 0 ? 1.5 : 1;
  }

  function parseAmount(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? Math.max(0, amount) : 0;
  }

  function roundMoney(value) {
    return Math.round(Number(value || 0) * 100) / 100;
  }

  function parseDurationHours(value) {
    const text = String(value || "").trim();
    const match = text.match(/^(\d{1,2})(?::([0-5]\d))?$/);
    if (!match) {
      return 1;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2] || 0);
    return Math.max(0.25, hours + minutes / 60);
  }

  function formatDuration(hours) {
    const totalMinutes = Math.round(Number(hours || 0) * 60);
    const wholeHours = Math.floor(totalMinutes / 60);
    const minutes = String(totalMinutes % 60).padStart(2, "0");
    return `${wholeHours}:${minutes}`;
  }

  function isWeekendDate(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return false;
    }
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    );
    return date.getDay() === 0 || date.getDay() === 6;
  }

  function updateCourtRateFromDate() {
    courtRatePresetInput.value = isWeekendDate(courtDateInput.value) ? "27.63" : "14.89";
    updateCourtAmount();
  }

  function updateCourtAmount() {
    const presetRate = courtRatePresetInput.value;
    const hourlyRate =
      presetRate === "other"
        ? parseAmount(courtHourlyRateInput.value)
        : parseAmount(presetRate);
    const hours = parseDurationHours(courtDurationInput.value);
    const courts = Math.max(1, Number(courtCountInput.value || 1));

    if (presetRate !== "other") {
      courtHourlyRateInput.value = String(hourlyRate);
    }
    courtAmountInput.value = String(roundMoney(hourlyRate * hours * courts));
  }

  function getCourtRateSource() {
    if (courtRatePresetInput.value === "14.89") {
      return "Bellevue weekday";
    }
    if (courtRatePresetInput.value === "27.63") {
      return "Renton weekend";
    }
    return "Other rate";
  }

  function makeId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function createCell(tagName, value, className) {
    const cell = document.createElement(tagName);
    cell.textContent = value;
    if (className) {
      cell.className = className;
    }
    return cell;
  }

  function clearElement(element) {
    element.replaceChildren();
  }

  function fillPlayerSelect(select) {
    clearElement(select);
    PLAYERS.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
  }

  function getPlayDatesForMonth() {
    const { year, monthIndex } = getMonthParts();
    const date = new Date(year, monthIndex, 1);
    const dates = [];

    while (date.getMonth() === monthIndex) {
      if (PLAY_DAYS.includes(date.getDay())) {
        dates.push(formatDate(date));
      }
      date.setDate(date.getDate() + 1);
    }

    return dates;
  }

  function getSamplePlayersForDate(dateValue, index) {
    const base = [
      "Thanh Nguyen",
      "Harvey Le",
      "Hoan Nguyen",
      "Son Nguyen",
      "Bao Ta",
      "Duy Nguyen",
      "Tuan Pham",
      "Truong Do",
      "Nick Nguyen",
      "Vu Nguyen",
      "Luan Nguyen",
      "Todd Nguyen",
      "Thien Nguyen",
      "Phuoc Truong",
      "Hung Cao (Truong Do)",
      "Alex Yeung",
      "Tri Ho",
      "Khang Nguyen",
    ];
    const weight = getDateWeight(dateValue);
    const count = weight > 1 ? 14 + (index % 5) : 7 + (index % 4);
    return base.slice(index % 3, index % 3 + count);
  }

  function createSampleAttendance() {
    return getPlayDatesForMonth().map((date, index) => ({
      date,
      players: getSamplePlayersForDate(date, index).map((name, playerIndex) => ({
        name,
        spots: playerIndex % 9 === 0 ? 2 : 1,
      })),
    }));
  }

  function getDefaultCourtBlocks() {
    return getPlayDatesForMonth().map((date, index) => {
      const isWeekend = getDateWeight(date) > 1;
      return {
        id: makeId("court"),
        date,
        startTime: isWeekend ? "06:00" : index % 2 === 0 ? "06:00" : "07:00",
        durationHours: isWeekend ? 3 : index % 2 === 0 ? 2 : 1,
        courts: isWeekend ? 2 : 1,
        amount: isWeekend ? 145.05 : 48.35,
        paidBy: index % 3 === 0 ? "Hoan Nguyen" : "Thanh Nguyen",
        status: "active",
        source: "Manual",
      };
    });
  }

  function getDefaultBirdieState() {
    return {
      purchases: [
        {
          id: makeId("birdie"),
          date: monthInput.value ? `${monthInput.value}-03` : "2026-06-03",
          tubes: 10,
          amount: 295,
          paidBy: "Thanh Nguyen",
          status: "active",
          recordType: "inventory_purchase",
          unitPrice: 29.5,
          batch: "Demo batch",
        },
        {
          id: makeId("birdie"),
          date: monthInput.value ? `${monthInput.value}-17` : "2026-06-17",
          tubes: 4,
          amount: 295,
          paidBy: "",
          status: "active",
          recordType: "usage",
          unitPrice: 29.5,
          batch: "Demo batch",
        },
      ],
    };
  }

  function getCourtBlocks() {
    if (backendBilling) {
      return backendBilling.courtBlocks || [];
    }

    const key = storageKey("courtBlocks");
    const stored = localStorage.getItem(key);
    if (stored) {
      return readJson(key, []);
    }

    const defaults = getDefaultCourtBlocks();
    writeJson(key, defaults);
    return defaults;
  }

  function setCourtBlocks(blocks) {
    writeJson(storageKey("courtBlocks"), blocks);
  }

  function getBirdieState() {
    if (backendBilling) {
      return {
        purchases: backendBilling.birdiePurchases || [],
      };
    }

    const key = storageKey("birdies");
    const stored = localStorage.getItem(key);
    if (stored) {
      return readJson(key, getDefaultBirdieState());
    }

    const defaults = getDefaultBirdieState();
    writeJson(key, defaults);
    return defaults;
  }

  function setBirdieState(state) {
    writeJson(storageKey("birdies"), state);
  }

  function getBirdieRecordType(purchase) {
    return String(purchase?.recordType || "purchase").replace(/-/g, "_");
  }

  function isActiveBirdiePurchase(purchase) {
    return purchase.status !== "canceled";
  }

  function isBilledBirdiePurchase(purchase) {
    return (
      isActiveBirdiePurchase(purchase) &&
      isCurrentMonthBirdieRow(purchase) &&
      getBirdieRecordType(purchase) !== "inventory_purchase"
    );
  }

  function isInventoryBirdiePurchase(purchase) {
    return (
      isActiveBirdiePurchase(purchase) &&
      getBirdieRecordType(purchase) === "inventory_purchase"
    );
  }

  function isCurrentMonthBirdieRow(purchase) {
    return String(purchase?.date || "").startsWith(`${monthInput.value}-`);
  }

  function getBirdieUnitPrice(purchase) {
    const unitPrice = Number(purchase.unitPrice || 0);
    if (unitPrice > 0) {
      return unitPrice;
    }

    const tubes = Number(purchase.tubes || 0);
    return tubes > 0 ? Number(purchase.amount || 0) / tubes : 0;
  }

  function getBirdieInventoryBatches(purchases) {
    const batches = new Map();

    purchases
      .filter(isActiveBirdiePurchase)
      .slice()
      .sort((first, second) =>
        `${first.date || ""}-${getBirdieRecordType(first)}`.localeCompare(
          `${second.date || ""}-${getBirdieRecordType(second)}`,
        ),
      )
      .forEach((purchase) => {
        const recordType = getBirdieRecordType(purchase);
        const batch = purchase.batch || "Unlabeled batch";
        const unitPrice = getBirdieUnitPrice(purchase);
        const key = getBirdieBatchKey({ batch, unitPrice });
        const current = batches.get(key) || {
          key,
          batch,
          unitPrice,
          purchaseDates: [],
          purchased: 0,
          used: 0,
          remaining: 0,
          amount: 0,
        };

        if (recordType === "inventory_purchase") {
          if (purchase.date && !current.purchaseDates.includes(purchase.date)) {
            current.purchaseDates.push(purchase.date);
          }
          current.purchased += Number(purchase.tubes || 0);
          current.remaining += Number(purchase.tubes || 0);
          current.amount += Number(purchase.amount || 0);
        } else if (recordType === "usage") {
          current.used += Number(purchase.tubes || 0);
          current.remaining -= Number(purchase.tubes || 0);
        }

        batches.set(key, current);
      });

    return Array.from(batches.values())
      .filter((batch) => batch.purchased > 0 || batch.used > 0)
      .sort((first, second) => first.batch.localeCompare(second.batch));
  }

  function updateBirdieUsageMax() {
    const batch = getBirdieInventoryBatches(getBirdieState().purchases).find(
      (candidate) => candidate.key === birdieUsageBatchInput.value,
    );
    birdieUsageTubesInput.max = batch?.remaining || "";
  }

  function getPaymentStatus(memberName) {
    const backendPayment = backendBilling?.payments?.find(
      (payment) => payment.playerName === memberName,
    );
    if (backendPayment?.status) {
      return backendPayment.status;
    }

    return localStorage.getItem(storageKey(`payment:${memberName}`)) || "Not requested";
  }

  function setPaymentStatus(memberName, value) {
    localStorage.setItem(storageKey(`payment:${memberName}`), value);
  }

  function getMonthStatus() {
    if (backendBilling?.monthStatus) {
      return backendBilling.monthStatus;
    }

    return readJson(storageKey("monthStatus"), {
      status: "draft",
      note: "",
      updatedAt: "",
      updatedBy: "",
    });
  }

  function setMonthStatus(status) {
    writeJson(storageKey("monthStatus"), {
      status,
      note: "",
      updatedAt: new Date().toISOString(),
      updatedBy: getRememberedPlayer(),
    });
  }

  function getBillingAdjustments() {
    if (backendBilling) {
      return backendBilling.adjustments || [];
    }

    return readJson(storageKey("adjustments"), []);
  }

  function getRememberedPlayer() {
    const remembered = localStorage.getItem(LAST_PLAYER_KEY) || "";
    return PLAYERS.includes(remembered) ? remembered : "Thanh Nguyen";
  }

  function calculateBilling() {
    const courtBlocks = getCourtBlocks();
    const birdieState = getBirdieState();
    const activeCourtBlocks = courtBlocks.filter((block) => block.status === "active");
    const courtByDate = new Map();
    const credits = new Map();
    const members = new Map();
    let totalWeightedSpots = 0;
    let totalSpots = 0;

    function ensureMember(name) {
      if (!members.has(name)) {
        members.set(name, {
          name,
          spots: 0,
          weightedSpots: 0,
          courtFee: 0,
          birdieFee: 0,
          credits: 0,
          netBalance: 0,
          attendance: [],
        });
      }
      return members.get(name);
    }

    activeCourtBlocks.forEach((block) => {
      courtByDate.set(block.date, (courtByDate.get(block.date) || 0) + Number(block.amount || 0));
      if (block.paidBy) {
        const payer = ensureMember(block.paidBy);
        payer.credits += Number(block.amount || 0);
      }
    });

    birdieState.purchases
      .filter(isBilledBirdiePurchase)
      .forEach((purchase) => {
      if (purchase.paidBy) {
        const payer = ensureMember(purchase.paidBy);
        payer.credits += Number(purchase.amount || 0);
      }
    });

    getBillingAdjustments()
      .filter((adjustment) => adjustment.status !== "canceled")
      .forEach((adjustment) => {
        const member = ensureMember(adjustment.playerName);
        member.credits += Number(adjustment.amount || 0);
      });

    attendanceRows.forEach((day) => {
      const weight = getDateWeight(day.date);
      const daySpots = day.players.reduce((sum, player) => sum + player.spots, 0);
      const dayWeightedSpots = daySpots * weight;
      const dayCourtTotal = courtByDate.get(day.date) || 0;
      const courtPerSpot = daySpots > 0 ? dayCourtTotal / daySpots : 0;
      totalSpots += daySpots;
      totalWeightedSpots += dayWeightedSpots;

      day.players.forEach((entry) => {
        const member = ensureMember(entry.name);
        const weightedSpots = entry.spots * weight;
        member.spots += entry.spots;
        member.weightedSpots += weightedSpots;
        member.courtFee += courtPerSpot * entry.spots;
        member.attendance.push({
          date: day.date,
          spots: entry.spots,
          weight,
          courtFee: courtPerSpot * entry.spots,
        });
      });
    });

    const birdieTotal = birdieState.purchases
      .filter(isBilledBirdiePurchase)
      .reduce(
      (sum, purchase) => sum + Number(purchase.amount || 0),
      0,
    );
    const birdiePerWeightedSpot =
      totalWeightedSpots > 0 ? birdieTotal / totalWeightedSpots : 0;

    members.forEach((member) => {
      member.birdieFee = member.weightedSpots * birdiePerWeightedSpot;
      member.netBalance = member.courtFee + member.birdieFee - member.credits;
    });

    return {
      courtBlocks,
      birdieState,
      birdiePerWeightedSpot,
      totalWeightedSpots,
      totalSpots,
      members: Array.from(members.values()).sort((first, second) =>
        first.name.localeCompare(second.name),
      ),
      daily: attendanceRows.map((day) => {
        const spots = day.players.reduce((sum, player) => sum + player.spots, 0);
        const weight = getDateWeight(day.date);
        const courtFee = courtByDate.get(day.date) || 0;
        const courtPerSpot = spots > 0 ? courtFee / spots : 0;
        const birdiePerSpot = birdiePerWeightedSpot * weight;
        return {
          date: day.date,
          weight,
          spots,
          courtFee,
          courtPerSpot,
          birdiePerSpot,
          totalPerSpot: courtPerSpot + birdiePerSpot,
          activeBlocks: activeCourtBlocks.filter((block) => block.date === day.date).length,
        };
      }),
    };
  }

  function renderSummary() {
    const courtTotal = billing.courtBlocks
      .filter((block) => block.status === "active")
      .reduce((sum, block) => sum + Number(block.amount || 0), 0);
    const birdieTotal = billing.birdieState.purchases
      .filter(isBilledBirdiePurchase)
      .reduce(
      (sum, purchase) => sum + Number(purchase.amount || 0),
      0,
    );
    const openBalance = billing.members
      .filter((member) => getPaymentStatus(member.name) !== "Paid")
      .reduce((sum, member) => sum + Math.max(0, member.netBalance), 0);
    const creditTotal = billing.members.reduce(
      (sum, member) => sum + Math.max(0, -member.netBalance),
      0,
    );
    const metrics = [
      ["Expected Expense", formatMoney(courtTotal + birdieTotal), "success"],
      ["Field Total", formatMoney(courtTotal), ""],
      ["Extras Total", formatMoney(birdieTotal), ""],
      ["Weighted Spots", formatNumber(billing.totalWeightedSpots, 1), ""],
      ["Open Balance", formatMoney(openBalance), openBalance > 0 ? "warning" : "success"],
      ["Credits", formatMoney(creditTotal), creditTotal > 0 ? "credit" : ""],
    ];

    clearElement(summaryEl);
    metrics.forEach(([label, value, tone]) => {
      const metric = document.createElement("div");
      metric.className = `billing-metric ${tone || ""}`.trim();
      metric.append(createCell("span", label), createCell("strong", value));
      summaryEl.append(metric);
    });
  }

  function renderFinalizationStatus() {
    const monthStatus = getMonthStatus();
    const isFinalized = monthStatus.status === "finalized";
    finalizationBadge.textContent = isFinalized ? "Finalized" : "Draft";
    finalizationBadge.className = `billing-finalization-badge ${
      isFinalized ? "finalized" : "draft"
    }`;
    finalizationPanel.className = `billing-finalization-panel ${
      isFinalized ? "finalized" : "draft"
    }`;
    finalizationTitle.textContent = isFinalized ? "Bills are finalized" : "Bills are not finalized";
    finalizationNote.textContent = isFinalized
      ? monthStatus.updatedBy
        ? `Finalized by ${monthStatus.updatedBy}.`
        : "Ready for payments."
      : "Amounts may still change.";
    finalizationSelect.value = isFinalized ? "finalized" : "draft";
  }

  function renderTable(table, headers, rows, footerCells) {
    clearElement(table);
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headers.forEach((header) => headerRow.append(createCell("th", header)));
    thead.append(headerRow);
    table.append(thead);

    const tbody = document.createElement("tbody");
    rows.forEach((cells) => {
      const row = document.createElement("tr");
      cells.forEach((cell) => {
        if (cell instanceof Node) {
          row.append(cell);
        } else {
          row.append(createCell("td", cell.text, cell.className));
        }
      });
      tbody.append(row);
    });
    table.append(tbody);

    if (footerCells) {
      const tfoot = document.createElement("tfoot");
      const row = document.createElement("tr");
      footerCells.forEach((cell) => row.append(createCell("td", cell)));
      tfoot.append(row);
      table.append(tfoot);
    }
  }

  function makeBadge(text, className) {
    const cell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `billing-badge ${className}`;
    badge.textContent = text;
    cell.append(badge);
    return cell;
  }

  function renderDailyCosts() {
    const courtTotal = billing.daily.reduce((sum, day) => sum + day.courtFee, 0);
    const birdieTotal = billing.birdieState.purchases
      .filter(isBilledBirdiePurchase)
      .reduce(
      (sum, purchase) => sum + Number(purchase.amount || 0),
      0,
    );

    renderTable(
      dailyTable,
      ["Date", "Weight", "Spots", "Field Fee", "Field / Player", "Extras / Spot", "Total / Spot", "Status"],
      billing.daily.map((day) => [
        { text: formatDisplayDate(day.date), className: "name-cell" },
        { text: `${formatNumber(day.weight, 1)}x` },
        { text: String(day.spots), className: "numeric-cell" },
        { text: formatMoney(day.courtFee), className: "numeric-cell" },
        { text: formatMoney(day.courtPerSpot), className: "numeric-cell" },
        { text: formatMoney(day.birdiePerSpot), className: "numeric-cell" },
        { text: formatMoney(day.totalPerSpot), className: "numeric-cell" },
        makeBadge(day.activeBlocks ? "Clean" : "No field", day.activeBlocks ? "paid" : "review"),
      ]),
      ["Total", "", String(billing.totalSpots), formatMoney(courtTotal), "", formatMoney(birdieTotal), formatMoney(courtTotal + birdieTotal), ""],
    );
    dailyNote.textContent = backendBilling
      ? `${billing.daily.length} play dates from Apps Script RSVP data.`
      : `${billing.daily.length} play dates from demo attendance. Replace this with Apps Script RSVP data next.`;
  }

  function renderCourtBlocks() {
    const activeCourtBlocks = billing.courtBlocks.filter(
      (block) => block.status === "active",
    );
    const totalCost = activeCourtBlocks.reduce(
      (sum, block) => sum + Number(block.amount || 0),
      0,
    );

    renderTable(
      courtBlockTable,
      ["Date", "Paid By", "Amount", "Actions"],
      billing.courtBlocks.map((block) => {
        const actions = document.createElement("td");
        const toggle = document.createElement("button");
        toggle.className = `inline-action ${block.status === "active" ? "remove" : ""}`;
        toggle.type = "button";
        toggle.textContent = block.status === "active" ? "x" : "+";
        toggle.setAttribute(
          "aria-label",
          block.status === "active" ? "Cancel block" : "Restore block",
        );
        toggle.addEventListener("click", () => {
          saveBillingAction(
            {
              action: "toggleCourtBlock",
              id: block.id,
              status: block.status === "active" ? "canceled" : "active",
            },
            () => {
              const blocks = getCourtBlocks().map((candidate) =>
                candidate.id === block.id
                  ? { ...candidate, status: candidate.status === "active" ? "canceled" : "active" }
                  : candidate,
              );
              setCourtBlocks(blocks);
            },
            "Field block updated.",
            courtFeedback,
          );
        });
        actions.append(toggle);

        return [
          { text: formatDisplayDate(block.date), className: "name-cell" },
          { text: block.paidBy },
          { text: formatMoney(block.amount), className: "numeric-cell" },
          actions,
        ];
      }),
      ["Total", "", formatMoney(totalCost), ""],
    );
  }

  function renderBirdies() {
    const state = billing.birdieState;
    const inventoryBatches = getBirdieInventoryBatches(state.purchases);
    const currentMonthRows = state.purchases.filter(
      (purchase) =>
        isActiveBirdiePurchase(purchase) &&
        isCurrentMonthBirdieRow(purchase) &&
        getBirdieRecordType(purchase) !== "inventory_purchase",
    );
    const activeInventoryPurchaseTubes = state.purchases
      .filter(isInventoryBirdiePurchase)
      .reduce((sum, purchase) => sum + Number(purchase.tubes || 0), 0);
    const currentMonthUsedTubes = state.purchases
      .filter(isBilledBirdiePurchase)
      .reduce((sum, purchase) => sum + Number(purchase.tubes || 0), 0);
    const currentMonthUsageCost = state.purchases
      .filter(isBilledBirdiePurchase)
      .reduce((sum, purchase) => sum + Number(purchase.amount || 0), 0);
    const remainingTubes = inventoryBatches.reduce(
      (sum, batch) => sum + Number(batch.remaining || 0),
      0,
    );
    const selectedUsageBatch = birdieUsageBatchInput.value;

    clearElement(birdieUsageBatchInput);
    inventoryBatches
      .filter((batch) => batch.remaining > 0)
      .forEach((batch) => {
        const option = document.createElement("option");
        option.value = batch.key;
        option.textContent = `${batch.batch} - ${formatNumber(
          batch.remaining,
          1,
        )} left @ ${formatMoney(batch.unitPrice)}`;
        birdieUsageBatchInput.append(option);
      });
    if (
      selectedUsageBatch &&
      Array.from(birdieUsageBatchInput.options).some(
        (option) => option.value === selectedUsageBatch,
      )
    ) {
      birdieUsageBatchInput.value = selectedUsageBatch;
    }
    updateBirdieUsageMax();

    renderTable(
      birdiePurchaseTable,
      ["Batch", "Purchase Date", "Tubes", "Unit", "Paid/Source", "Amount", "Status", "Actions"],
      inventoryBatches.map((batch) => [
        { text: batch.batch, className: "name-cell" },
        {
          text: batch.purchaseDates
            .slice()
            .sort()
            .map(formatDisplayDate)
            .join(", "),
        },
        {
          text: `${formatNumber(batch.remaining, 1)} left / ${formatNumber(
            batch.purchased,
            1,
          )} bought`,
          className: "numeric-cell",
        },
        { text: formatMoney(batch.unitPrice), className: "numeric-cell" },
        { text: "Inventory" },
        { text: formatMoney(batch.amount), className: "numeric-cell" },
        makeBadge("Inventory", "review"),
        createCell("td", ""),
      ]).concat(currentMonthRows.map((purchase) => {
        const recordType = getBirdieRecordType(purchase);
        const batch =
          purchase.batch ||
          (recordType === "usage" ? "Monthly usage" : "Inventory purchase");
        const actions = document.createElement("td");
        const remove = document.createElement("button");
        remove.className = "inline-action remove";
        remove.type = "button";
        remove.textContent = "x";
        remove.addEventListener("click", () => {
          saveBillingAction(
            {
              action: "removeBirdiePurchase",
              id: purchase.id,
            },
            () => {
              setBirdieState({
                ...getBirdieState(),
                purchases: getBirdieState().purchases.filter(
                  (candidate) => candidate.id !== purchase.id,
                ),
              });
            },
            "Extras purchase removed.",
            birdieFeedback,
          );
        });
        actions.append(remove);
        return [
          { text: batch, className: "name-cell" },
          { text: formatDisplayDate(purchase.date) },
          { text: String(purchase.tubes), className: "numeric-cell" },
          { text: getBirdieUnitPrice(purchase) ? formatMoney(getBirdieUnitPrice(purchase)) : "", className: "numeric-cell" },
          { text: purchase.paidBy },
          { text: formatMoney(purchase.amount), className: "numeric-cell" },
          makeBadge(
            purchase.status === "canceled"
              ? "Canceled"
              : recordType === "inventory_purchase"
                ? "Inventory"
                : "Active",
            purchase.status === "canceled" || recordType === "inventory_purchase"
              ? "review"
              : "paid",
          ),
          actions,
        ];
      })),
      [
        "Total",
        "",
        `${formatNumber(activeInventoryPurchaseTubes, 1)} purchased / ${formatNumber(
          remainingTubes,
          1,
        )} left`,
        `Used: ${formatNumber(currentMonthUsedTubes, 1)}`,
        "",
        formatMoney(currentMonthUsageCost),
        "",
        "",
      ],
    );
  }

  function getMoneyClass(value) {
    if (value < -0.005) return "money-credit";
    if (value > 0.005) return "money-owed";
    return "";
  }

  function renderMembers() {
    renderTable(
      memberTable,
      ["Player", "Spots", "Extras Fee", "Field Fee", "Paid Credits", "Net Balance", "Payment Status", "Action"],
      billing.members.map((member) => {
        const statusCell = document.createElement("td");
        const select = document.createElement("select");
        select.className = "billing-status-select";
        STATUS_OPTIONS.forEach((option) => {
          const optionEl = document.createElement("option");
          optionEl.value = option;
          optionEl.textContent = option;
          select.append(optionEl);
        });
        select.value = getPaymentStatus(member.name);
        select.addEventListener("change", () => {
          saveBillingAction(
            {
              action: "saveBillingPaymentStatus",
              playerName: member.name,
              status: select.value,
            },
            () => setPaymentStatus(member.name, select.value),
            "Payment status saved.",
          );
        });
        statusCell.append(select);

        const actionCell = document.createElement("td");
        const detailButton = document.createElement("button");
        detailButton.className = "secondary-button inline-button";
        detailButton.type = "button";
        detailButton.textContent = "Detail";
        detailButton.addEventListener("click", () => {
          memberSelect.value = member.name;
          renderMemberDetail(member.name);
        });
        actionCell.append(detailButton);

        return [
          { text: member.name, className: "name-cell" },
          { text: String(member.spots), className: "numeric-cell optional-member-column" },
          { text: formatMoney(member.birdieFee), className: "numeric-cell optional-member-column" },
          { text: formatMoney(member.courtFee), className: "numeric-cell optional-member-column" },
          { text: formatMoney(member.credits), className: `numeric-cell optional-member-column ${member.credits > 0 ? "money-credit" : ""}` },
          { text: formatMoney(member.netBalance), className: `numeric-cell member-balance-column ${getMoneyClass(member.netBalance)}` },
          statusCell,
          actionCell,
        ];
      }),
    );
    memberTable
      .querySelectorAll("thead th:nth-child(2), thead th:nth-child(3), thead th:nth-child(4), thead th:nth-child(5)")
      .forEach((cell) => cell.classList.add("optional-member-column"));
    memberTable
      .querySelectorAll("thead th:nth-child(6)")
      .forEach((cell) => cell.classList.add("member-balance-column"));
    memberTable
      .querySelectorAll("thead th:nth-child(7), tbody td:nth-child(7)")
      .forEach((cell) => cell.classList.add("admin-payment-column"));
    memberNote.textContent =
      "Payment status saves for admins when Apps Script billing is connected.";
  }

  function renderMemberSelect() {
    const current = memberSelect.value || getRememberedPlayer();
    clearElement(memberSelect);
    billing.members.forEach((member) => {
      const option = document.createElement("option");
      option.value = member.name;
      option.textContent = member.name;
      memberSelect.append(option);
    });
    memberSelect.value = billing.members.some((member) => member.name === current)
      ? current
      : billing.members[0]?.name || "";
  }

  function appendDetailRow(label, value, className) {
    const row = document.createElement("div");
    row.className = "billing-detail-row";
    row.append(createCell("span", label), createCell("strong", value, className));
    memberDetail.append(row);
  }

  function isMobilePaymentDevice() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
  }

  function getVenmoPaymentNote(member) {
    return `${member.name} - Soccer ${formatMonthLabel(monthInput.value)}`;
  }

  function buildVenmoPaymentUrls(member) {
    const amount = roundMoney(member.netBalance).toFixed(2);
    const encodedNote = encodeURIComponent(getVenmoPaymentNote(member));
    const encodedRecipient = encodeURIComponent(VENMO_RECIPIENT_USERNAME);

    return {
      amount,
      appUrl: `venmo://paycharge?txn=pay&recipients=${encodedRecipient}&amount=${amount}&note=${encodedNote}`,
      webUrl: `https://venmo.com/${encodedRecipient}?txn=pay&amount=${amount}&note=${encodedNote}`,
    };
  }

  function renderVenmoPaymentAction(member) {
    if (
      member.netBalance <= 0.005 ||
      normalizeText(getPaymentStatus(member.name)) === "paid"
    ) {
      return;
    }

    const urls = buildVenmoPaymentUrls(member);
    const section = document.createElement("section");
    section.className = "billing-payment-action";
    const button = document.createElement("button");
    button.className = "billing-payment-button";
    button.type = "button";
    button.textContent = `Pay ${formatMoney(urls.amount)} with Venmo`;
    const note = document.createElement("p");
    note.textContent = `To ${VENMO_RECIPIENT_NAME}: ${getVenmoPaymentNote(member)}`;
    const help = document.createElement("p");
    help.className = "billing-payment-help";
    help.textContent = "Venmo opens best from a phone.";

    button.addEventListener("click", () => {
      if (!isMobilePaymentDevice()) {
        help.textContent = "Please open this page on your phone to pay with Venmo.";
        return;
      }

      help.textContent = "Opening Venmo...";
      window.location.href = urls.appUrl;
      window.setTimeout(() => {
        if (!document.hidden) {
          window.location.href = urls.webUrl;
        }
      }, 900);
    });

    section.append(button, note, help);
    memberDetail.append(section);
  }

  function renderMemberDetail(name) {
    const member = billing.members.find((candidate) => candidate.name === name);
    clearElement(memberDetail);
    if (!member) {
      memberDetail.textContent = "No member selected.";
      return;
    }

    localStorage.setItem(LAST_PLAYER_KEY, member.name);
    appendDetailRow("Attendance", `${member.spots} spots`);
    appendDetailRow("Weighted spots", formatNumber(member.weightedSpots, 1));
    appendDetailRow("Extras fee", formatMoney(member.birdieFee));
    appendDetailRow("Field fee", formatMoney(member.courtFee));
    appendDetailRow("Paid credits", formatMoney(member.credits), member.credits ? "money-credit" : "");
    appendDetailRow("Net balance", formatMoney(member.netBalance), getMoneyClass(member.netBalance));
    appendDetailRow("Payment", getPaymentStatus(member.name));
    renderVenmoPaymentAction(member);

    const attendance = document.createElement("section");
    attendance.className = "billing-detail-section";
    attendance.append(createCell("h3", "Attendance"));
    member.attendance.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "billing-detail-row";
      row.append(
        createCell("span", formatDisplayDate(entry.date)),
        createCell("strong", `${entry.spots} spot${entry.spots === 1 ? "" : "s"}`),
      );
      attendance.append(row);
    });
    memberDetail.append(attendance);
  }

  function render() {
    billing = calculateBilling();
    document.querySelectorAll(".admin-only").forEach((element) => {
      element.hidden = !isAdmin;
    });
    renderSummary();
    renderFinalizationStatus();
    renderCourtBlocks();
    renderBirdies();
    renderMembers();
    renderMemberSelect();
    renderMemberDetail(memberSelect.value);
  }

  function getBillingLoadSummary() {
    const activeCourtBlocks = (backendBilling?.courtBlocks || []).filter(
      (block) => block.status === "active",
    );
    const courtTotal = activeCourtBlocks.reduce(
      (sum, block) => sum + Number(block.amount || 0),
      0,
    );
    const billedBirdies = (backendBilling?.birdiePurchases || []).filter(
      isBilledBirdiePurchase,
    );
    const birdieTotal = billedBirdies.reduce(
      (sum, purchase) => sum + Number(purchase.amount || 0),
      0,
    );

    return [
      `${attendanceRows.length} play dates`,
      `${billing.totalSpots} spots`,
      `${activeCourtBlocks.length} field blocks (${formatMoney(courtTotal)})`,
      `${billedBirdies.length} billed extras rows (${formatMoney(birdieTotal)})`,
    ].join(" / ");
  }

  function getBillingLoadingMessage() {
    const fixtureNote = LOCAL_BILLING_FIXTURE
      ? ` using local fixture data/${LOCAL_BILLING_FIXTURE}.csv`
      : "";
    return `Loading ${formatMonthLabel(monthInput.value)} billing${fixtureNote}.`;
  }

  function updatePageTitle() {
    document.querySelector("#page-title").textContent = `Billing - ${formatMonthLabel(
      monthInput.value,
    )}`;
  }

  function applyBackendBilling(nextBilling, message, sourceLabel, options) {
    backendBilling = nextBilling;
    backendAvailable = true;
    attendanceRows =
      Array.isArray(backendBilling.attendance) && backendBilling.attendance.length > 0
        ? backendBilling.attendance
        : createSampleAttendance();
    render();
    const summary = getBillingLoadSummary();
    if (!options?.skipProgress) {
      finishProgress("Billing loaded.");
    }
    setBillingContentVisible(true);
    if (!options?.silentStatus) {
      const defaultMessage =
        backendBilling.attendance?.length && isAdmin
          ? `Billing loaded from ${sourceLabel || "Apps Script"}: ${summary}.`
          : "Billing data loaded.";
      setStatus(
        message || defaultMessage,
        "success",
      );
    }
    updatePageTitle();
  }

  function upsertById(items, item) {
    const existingIndex = items.findIndex((candidate) => candidate.id === item.id);
    if (existingIndex === -1) {
      return [...items, item];
    }

    return items.map((candidate, index) => (
      index === existingIndex ? { ...candidate, ...item } : candidate
    ));
  }

  function upsertByPlayerName(items, item) {
    const existingIndex = items.findIndex(
      (candidate) => candidate.playerName === item.playerName,
    );
    if (existingIndex === -1) {
      return [...items, item];
    }

    return items.map((candidate, index) => (
      index === existingIndex ? { ...candidate, ...item } : candidate
    ));
  }

  function applyBillingSaveResult(action, result) {
    if (!backendBilling) {
      return false;
    }

    if (action === "saveCourtBlock" || action === "toggleCourtBlock") {
      if (!result.courtBlock?.id) {
        return false;
      }
      backendBilling = {
        ...backendBilling,
        courtBlocks: upsertById(backendBilling.courtBlocks || [], result.courtBlock),
      };
      return true;
    }

    if (action === "saveBirdiePurchase" || action === "removeBirdiePurchase") {
      if (!result.birdiePurchase?.id) {
        return false;
      }
      backendBilling = {
        ...backendBilling,
        birdiePurchases: upsertById(
          backendBilling.birdiePurchases || [],
          result.birdiePurchase,
        ),
      };
      return true;
    }

    if (action === "saveBillingPaymentStatus") {
      if (!result.payment?.playerName) {
        return false;
      }
      backendBilling = {
        ...backendBilling,
        payments: upsertByPlayerName(backendBilling.payments || [], result.payment),
      };
      return true;
    }

    if (action === "saveBillingAdjustment" || action === "removeBillingAdjustment") {
      if (!result.adjustment?.id) {
        return false;
      }
      backendBilling = {
        ...backendBilling,
        adjustments: upsertById(backendBilling.adjustments || [], result.adjustment),
      };
      return true;
    }

    if (action === "saveBillingMonthStatus") {
      if (!result.monthStatus) {
        return false;
      }
      backendBilling = {
        ...backendBilling,
        monthStatus: result.monthStatus,
      };
      return true;
    }

    return false;
  }

  async function loadBillingMonth(message, options) {
    const requestId = latestBillingRequest + 1;
    latestBillingRequest = requestId;
    const month = monthInput.value;
    const forceRefresh = Boolean(options?.forceRefresh);
    updatePageTitle();
    clearSectionStatuses();
    const cached = LOCAL_BILLING_FIXTURE ? null : readBillingCache(month);

    if (cached?.billing) {
      applyBackendBilling(cached.billing, null, "cached billing", {
        skipProgress: true,
        silentStatus: true,
      });
      if (isBillingCacheFresh(cached) && !forceRefresh) {
        setBillingContentVisible(true);
        setStatus(message || "Billing loaded from saved data.", "success");
        updatePageTitle();
        return;
      }
      setStatus(
        forceRefresh
          ? `Refreshing billing. Showing saved billing from ${formatCacheAge(cached.savedAt)} while loading...`
          : `Showing saved billing from ${formatCacheAge(cached.savedAt)} while refreshing...`,
        "loading",
      );
      startProgress();
    } else {
      setBillingContentVisible(false);
      setStatus(getBillingLoadingMessage(), "loading");
      startProgress();
    }

    try {
      if (LOCAL_BILLING_FIXTURE) {
        const billingFixture = await loadLocalBillingFixture();
        if (requestId !== latestBillingRequest) {
          return;
        }
        applyBackendBilling(
          billingFixture,
          null,
          `local fixture data/${LOCAL_BILLING_FIXTURE}.csv`,
        );
        return;
      }

      const result = await requestAppsScript({
        action: "listBillingMonth",
        month,
        adminToken,
      });
      if (requestId !== latestBillingRequest) {
        return;
      }
      writeBillingCache(month, result.billing);
      applyBackendBilling(result.billing, message);
    } catch (error) {
      if (requestId !== latestBillingRequest) {
        return;
      }
      if (cached?.billing) {
        clearProgress();
        setBillingContentVisible(true);
        setStatus(
          `Could not refresh Apps Script. Showing cached billing from ${formatCacheAge(
            cached.savedAt,
          )}.`,
          "error",
        );
        return;
      }
      const isUnsupportedAction = /Unsupported action: listBillingMonth/i.test(
        error.message,
      );
      const isFetchFailure = /Failed to fetch|Load failed|NetworkError|took too long/i.test(
        error.message,
      );
      backendBilling = null;
      backendAvailable = false;
      attendanceRows = createSampleAttendance();
      render();
      clearProgress();
      setBillingContentVisible(true);
      setStatus(
        isUnsupportedAction
          ? "Apps Script is still serving an older deployment. In Apps Script, deploy a New version of the Web App, then reload Billing. Local demo billing is shown for now."
          : isFetchFailure
            ? "Could not reach Apps Script. If this happens in a fresh browser, check the Web App deployment access: Execute as Me and Who has access = Anyone. Local demo billing is shown for now."
          : `${error.message}. Local demo billing is shown for now; reload Billing after the backend is ready.`,
        "error",
      );
    }
  }

  async function saveBillingAction(payload, fallback, successMessage, feedbackEl) {
    if (!backendAvailable || !adminToken) {
      fallback();
      recalculate(successMessage);
      if (feedbackEl) {
        setSectionStatus(feedbackEl, successMessage, "success");
      }
      return;
    }

    if (feedbackEl) {
      setSectionStatus(feedbackEl, "Saving change...", "loading");
    } else {
      setStatus("Saving billing change...", "loading");
    }
    try {
      const result = await requestAppsScript({
        ...payload,
        month: monthInput.value,
        adminToken,
        actor: getRememberedPlayer(),
      });

      if (result.billing) {
        writeBillingCache(monthInput.value, result.billing);
        applyBackendBilling(result.billing, successMessage, null, {
          skipProgress: true,
          silentStatus: Boolean(feedbackEl),
        });
      } else if (applyBillingSaveResult(payload.action, result)) {
        writeBillingCache(monthInput.value, backendBilling);
        attendanceRows =
          backendBilling?.attendance?.length > 0
            ? backendBilling.attendance
            : createSampleAttendance();
        render();
        updatePageTitle();
        if (!feedbackEl) {
          setStatus(successMessage, "success");
        }
      } else {
        await loadBillingMonth(successMessage);
      }

      if (feedbackEl) {
        setSectionStatus(feedbackEl, successMessage, "success");
      }
    } catch (error) {
      if (feedbackEl) {
        setSectionStatus(feedbackEl, error.message, "error");
      } else {
        setStatus(error.message, "error");
      }
    }
  }

  function recalculate(message) {
    attendanceRows =
      backendBilling?.attendance?.length > 0
        ? backendBilling.attendance
        : createSampleAttendance();
    render();
    setStatus(message || "Billing recalculated from demo RSVP attendance and local monthly costs.", "success");
    updatePageTitle();
  }

  function handleCourtSubmit(event) {
    event.preventDefault();
    const block = {
      id: makeId("court"),
      date: courtDateInput.value,
      startTime: courtStartTimeInput.value,
      durationHours: parseDurationHours(courtDurationInput.value),
      courts: Math.max(1, Number(courtCountInput.value || 1)),
      amount: parseAmount(courtAmountInput.value),
      paidBy: courtPaidByInput.value,
      source: getCourtRateSource(),
      status: "active",
    };
    saveBillingAction(
      {
        action: "saveCourtBlock",
        id: block.id,
        date: block.date,
        startTime: block.startTime,
        durationHours: block.durationHours,
        courts: block.courts,
        amount: block.amount,
        paidBy: block.paidBy,
        source: block.source,
        status: block.status,
      },
      () => setCourtBlocks([...getCourtBlocks(), block]),
      "Field block added.",
      courtFeedback,
    );
  }

  function handleBirdiePurchaseSubmit(event) {
    event.preventDefault();
    const tubes = Math.max(0.5, Number(birdieTubesInput.value || 0.5));
    const unitPrice = parseAmount(birdieUnitPriceInput.value);
    const amount = parseAmount(birdieAmountInput.value);
    const purchase = {
      id: makeId("birdie"),
      date: birdieDateInput.value,
      tubes,
      amount,
      paidBy: birdiePaidByInput.value,
      status: "active",
      recordType: "inventory_purchase",
      unitPrice,
      batch: birdieBatchInput.value.trim(),
    };
    saveBillingAction(
      {
        action: "saveBirdiePurchase",
        ...purchase,
      },
      () => {
        setBirdieState({
          ...getBirdieState(),
          purchases: [...getBirdieState().purchases, purchase],
        });
      },
      "Extras purchase added.",
      birdieFeedback,
    );
  }

  function handleBirdieUsageSubmit(event) {
    event.preventDefault();
    const batches = getBirdieInventoryBatches(getBirdieState().purchases);
    const batch = batches.find(
      (candidate) => candidate.key === birdieUsageBatchInput.value,
    );
    if (!batch) {
      setSectionStatus(birdieFeedback, "Choose an available extras item first.", "error");
      return;
    }

    const tubes = Math.max(0.5, Number(birdieUsageTubesInput.value || 0.5));
    if (tubes > batch.remaining + 0.001) {
      setSectionStatus(
        birdieFeedback,
        `Only ${formatNumber(batch.remaining, 1)} tubes remain in ${batch.batch}.`,
        "error",
      );
      return;
    }

    const usage = {
      id: makeId("birdie-usage"),
      date: birdieUsageDateInput.value,
      tubes,
      amount: Math.round(tubes * Number(batch.unitPrice || 0) * 100) / 100,
      paidBy: "",
      status: "active",
      recordType: "usage",
      unitPrice: batch.unitPrice,
      batch: batch.batch,
    };
    saveBillingAction(
      {
        action: "saveBirdiePurchase",
        ...usage,
      },
      () => {
        setBirdieState({
          ...getBirdieState(),
          purchases: [...getBirdieState().purchases, usage],
        });
      },
      "Extras usage added.",
      birdieFeedback,
    );
  }

  function handleFinalizationSubmit(event) {
    event.preventDefault();
    const status = finalizationSelect.value === "finalized" ? "finalized" : "draft";
    saveBillingAction(
      {
        action: "saveBillingMonthStatus",
        status,
      },
      () => setMonthStatus(status),
      status === "finalized"
        ? "Billing marked finalized and ready for payments."
        : "Billing moved back to draft.",
    );
  }

  function getUnpaidMembers() {
    return billing.members
      .filter(
        (member) =>
          roundMoney(member.netBalance) > 0.005 &&
          normalizeText(getPaymentStatus(member.name)) !== "paid",
      )
      .sort((first, second) => second.netBalance - first.netBalance);
  }

  function buildDuesMessage() {
    const unpaid = getUnpaidMembers();
    if (!unpaid.length) {
      return null;
    }

    const total = unpaid.reduce(
      (sum, member) => sum + roundMoney(member.netBalance),
      0,
    );
    const monthDay = (value) => String(value || "").slice(5).replace("-", "/");
    const lines = unpaid.map((member) => {
      const perWeightedSpot =
        member.weightedSpots > 0 ? member.birdieFee / member.weightedSpots : 0;
      const played = member.attendance
        .slice()
        .sort((first, second) => first.date.localeCompare(second.date))
        .map((entry) => {
          const fee = entry.courtFee + entry.spots * entry.weight * perWeightedSpot;
          return `${monthDay(entry.date)} (${formatMoney(fee)})`;
        })
        .join(", ");
      const gross = roundMoney(member.courtFee + member.birdieFee);
      const paid = roundMoney(gross - member.netBalance);
      const playedText = played ? `play ${played}; ` : "";
      return `• ${member.name} — ${playedText}paid ${formatMoney(
        paid,
      )}, missing ${formatMoney(member.netBalance)} of ${formatMoney(gross)}`;
    });

    return [
      `⚽ Soccer dues — ${formatMonthLabel(monthInput.value)}`,
      "",
      `Please pay ${VENMO_RECIPIENT_NAME} — Venmo @${VENMO_RECIPIENT_USERNAME} or Zelle ${ZELLE_RECIPIENT_PHONE}. Add your name + the month in the note.`,
      "",
      ...lines,
      "",
      `Total to collect: ${formatMoney(total)} (${unpaid.length} player${
        unpaid.length === 1 ? "" : "s"
      })`,
      "Thanks! 🙏",
    ].join("\n");
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall through to the legacy copy path below.
      }
    }

    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      return copied;
    } catch {
      return false;
    }
  }

  async function handleCopyDues() {
    if (!billing?.members?.length) {
      setSectionStatus(memberFeedback, "No member balances are loaded for this month.", "error");
      return;
    }

    const message = buildDuesMessage();
    if (!message) {
      setSectionStatus(
        memberFeedback,
        "Everyone is paid up — no dues to collect for this month.",
        "success",
      );
      return;
    }

    const copied = await copyToClipboard(message);
    if (copied) {
      setSectionStatus(
        memberFeedback,
        "Dues message copied. Paste it into your Messenger group chat.",
        "success",
      );
      return;
    }

    window.prompt("Copy the dues message below, then paste it into Messenger:", message);
    setSectionStatus(
      memberFeedback,
      "Could not copy automatically. Copy the message from the dialog.",
      "error",
    );
  }

  async function handleMarkMonthPaid() {
    if (!billing?.members?.length) {
      setSectionStatus(memberFeedback, "No member balances are loaded for this month.", "error");
      return;
    }

    const memberCount = billing.members.length;
    markMonthPaidButton.disabled = true;
    if (!backendAvailable || !adminToken) {
      billing.members.forEach((member) => setPaymentStatus(member.name, "Paid"));
      render();
      markMonthPaidButton.disabled = false;
      setSectionStatus(
        memberFeedback,
        `Marked ${memberCount} members paid locally.`,
        "success",
      );
      return;
    }

    setSectionStatus(memberFeedback, "Marking all members paid...", "loading");
    try {
      const result = await requestAppsScript({
        action: "markBillingMonthPaid",
        month: monthInput.value,
        adminToken,
        actor: getRememberedPlayer(),
      });
      writeBillingCache(monthInput.value, result.billing);
      applyBackendBilling(result.billing, "Month marked paid.", null, {
        skipProgress: true,
      });
      setSectionStatus(
        memberFeedback,
        `Marked ${memberCount} members paid.`,
        "success",
      );
      const hasMonths = await loadBillingMonthOptions();
      if (hasMonths && monthInput.value !== result.billing.month) {
        initializeInputs();
        loadBillingMonth();
      } else if (!hasMonths) {
        setBillingContentVisible(false);
        setStatus("All finalized billing months are paid.", "success");
      }
    } catch (error) {
      setSectionStatus(memberFeedback, error.message, "error");
    } finally {
      markMonthPaidButton.disabled = false;
    }
  }

  function updateBirdiePurchaseAmount() {
    const tubes = Math.max(0, Number(birdieTubesInput.value || 0));
    const unitPrice = Math.max(0, Number(birdieUnitPriceInput.value || 0));
    birdieAmountInput.value = String(Math.round(tubes * unitPrice * 100) / 100);
  }

  function initializeInputs() {
    fillPlayerSelect(courtPaidByInput);
    fillPlayerSelect(birdiePaidByInput);
    courtPaidByInput.value = PLAYERS.includes(DEFAULT_COURT_PAYER)
      ? DEFAULT_COURT_PAYER
      : getRememberedPlayer();
    birdiePaidByInput.value = getRememberedPlayer();
    courtDateInput.value = `${monthInput.value}-01`;
    courtStartTimeInput.value = "06:00";
    courtDurationInput.value = "2:00";
    birdieDateInput.value = getMonthEndDateValue();
    birdieUsageDateInput.value = getMonthEndDateValue();
    updateCourtRateFromDate();
    updateBirdiePurchaseAmount();
  }

  function initializeAdminVisibility() {
    const adminAuth = window.RsvpAdminAuth;
    if (!adminAuth) {
      isAdmin = false;
      return;
    }

    adminAuth.onChange((state) => {
      const wasAdmin = isAdmin;
      isAdmin = Boolean(state.isLoggedIn);
      adminToken = state.token || "";
      document.body.classList.toggle("billing-admin", isAdmin);
      document.querySelectorAll(".admin-only").forEach((element) => {
        element.hidden = !isAdmin;
      });
      // Billing is admin-only: only load it for admins, and clear it on logout.
      if (wasAdmin !== isAdmin) {
        if (isAdmin && !billingLoaded) {
          billingLoaded = true;
          initializeBillingPage();
        } else if (!isAdmin) {
          billingLoaded = false;
          billing = null;
          if (billingContent) {
            billingContent.hidden = true;
          }
        }
      }
    });

    adminAuth.ready.then(() => {
      if (isAdmin && !billingLoaded) {
        billingLoaded = true;
        initializeBillingPage();
      }
    });
  }

  async function initializeBillingPage() {
    const hasMonths = await loadBillingMonthOptions();
    if (!hasMonths) {
      return;
    }
    initializeInputs();
    loadBillingMonth();
  }

  monthInput.addEventListener("change", () => {
    initializeInputs();
    loadBillingMonth("Month changed. Billing data loaded.");
  });
  reloadBillingButton.addEventListener("click", () =>
    loadBillingMonth("Billing reloaded.", { forceRefresh: true }),
  );
  courtForm.addEventListener("submit", handleCourtSubmit);
  courtDateInput.addEventListener("change", updateCourtRateFromDate);
  courtDurationInput.addEventListener("input", updateCourtAmount);
  courtCountInput.addEventListener("input", updateCourtAmount);
  courtRatePresetInput.addEventListener("change", updateCourtAmount);
  courtHourlyRateInput.addEventListener("input", updateCourtAmount);
  birdiePurchaseForm.addEventListener("submit", handleBirdiePurchaseSubmit);
  birdieUsageForm.addEventListener("submit", handleBirdieUsageSubmit);
  birdieTubesInput.addEventListener("input", updateBirdiePurchaseAmount);
  birdieUnitPriceInput.addEventListener("input", updateBirdiePurchaseAmount);
  birdieUsageBatchInput.addEventListener("change", updateBirdieUsageMax);
  finalizationForm.addEventListener("submit", handleFinalizationSubmit);
  markMonthPaidButton.addEventListener("click", handleMarkMonthPaid);
  copyDuesButton.addEventListener("click", handleCopyDues);
  memberSelect.addEventListener("change", () => renderMemberDetail(memberSelect.value));

  initializeAdminVisibility();
  if (!window.RsvpAdminAuth) {
    initializeBillingPage();
  }
})();
