(function () {
  const APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbyc_NEAxzm_0R2Mp05vHYURAHKNYqvjccBFTBh7JAgi7UThHi-W3F-2qM9akXiyrdJGMg/exec";
  const BROWSER_ID_KEY = "play-rsvp.browserId";
  const DISPLAY_LOCALE = "en-US";
  const PLAY_DAYS = [2, 4, 6]; // Tuesday, Thursday, Saturday
  let PLAYERS = [
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

  const form = document.querySelector("#admin-form");
  const adminAuth = window.RsvpAdminAuth;
  const lockedPanel = document.querySelector("#admin-locked-panel");
  const loginForm = document.querySelector("#admin-login-form");
  const passwordInput = document.querySelector("#admin-password");
  const loginStatus = document.querySelector("#admin-login-status");
  const adminContent = document.querySelector("#admin-content");
  const logoutButton = document.querySelector("#admin-logout-button");
  const monthInput = document.querySelector("#roster-month");
  const playerSearch = document.querySelector("#player-search");
  const changeCount = document.querySelector("#change-count");
  const saveButton = document.querySelector("#save-button");
  const status = document.querySelector("#status");
  const monthTotal = document.querySelector("#month-total");
  const rosterTable = document.querySelector("#roster-table");
  const auditTotal = document.querySelector("#audit-total");
  const auditDateFilter = document.querySelector("#audit-date-filter");
  const auditPlayerFilter = document.querySelector("#audit-player-filter");
  const auditPlayerOptions = document.querySelector("#audit-player-options");
  const auditRefreshButton = document.querySelector("#audit-refresh-button");
  const changeHistoryTable = document.querySelector("#change-history-table");
  let monthDates = [];
  let rosterValues = new Map();
  let lockedDates = new Set();
  const changedValues = new Map();
  let latestLoadRequest = 0;
  let latestAuditRequest = 0;
  let auditFilterTimer = 0;
  let adminToken = "";
  let publicIpPromise = null;

  function readString(key) {
    return localStorage.getItem(key) || "";
  }

  function writeString(key, value) {
    localStorage.setItem(key, value);
  }

  function getBrowserId() {
    let browserId = readString(BROWSER_ID_KEY);
    if (!browserId) {
      browserId =
        window.crypto?.randomUUID?.() ||
        `browser-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      writeString(BROWSER_ID_KEY, browserId);
    }
    return browserId;
  }

  function getClientDeviceClass() {
    const userAgent = navigator.userAgent || "";
    const hasCoarsePointer =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    const narrowViewport =
      Math.min(window.innerWidth || 0, window.innerHeight || 0) <= 820;
    if (
      /Mobi|Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(userAgent) ||
      (hasCoarsePointer && narrowViewport)
    ) {
      return "mobile";
    }
    return "desktop";
  }

  function getClientScreen() {
    return `${window.screen?.width || 0}x${window.screen?.height || 0}@${window.devicePixelRatio || 1}`;
  }

  function getBrowserSignature() {
    return [
      navigator.userAgent || "",
      navigator.platform || "",
      navigator.vendor || "",
      navigator.language || "",
      getClientDeviceClass(),
      Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      getClientScreen(),
    ].join(" | ");
  }

  function withTimeout(promise, timeoutMs, fallback) {
    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => resolve(fallback), timeoutMs);
      promise
        .then((value) => resolve(value))
        .catch(() => resolve(fallback))
        .finally(() => window.clearTimeout(timeout));
    });
  }

  function getPublicIpInfo() {
    if (!publicIpPromise) {
      publicIpPromise = withTimeout(
        fetch("https://api.ipify.org?format=json", {
          cache: "no-store",
          credentials: "omit",
          referrerPolicy: "no-referrer",
        })
          .then((response) => (response.ok ? response.json() : null))
          .then((data) => ({
            ip: String(data?.ip || ""),
            source: data?.ip ? "api.ipify.org" : "unavailable",
          })),
        900,
        {
          ip: "",
          source: "timeout_or_blocked",
        },
      );
    }
    return publicIpPromise;
  }

  async function getAuditMetadata() {
    const publicIp = await getPublicIpInfo();
    return {
      browserId: getBrowserId(),
      browserSignature: getBrowserSignature(),
      clientDeviceClass: getClientDeviceClass(),
      clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      clientLanguage: navigator.language || "",
      clientScreen: getClientScreen(),
      clientUserAgent: navigator.userAgent || "",
      clientPlatform: navigator.platform || "",
      clientVendor: navigator.vendor || "",
      clientReferrer: document.referrer || "",
      clientPageUrl: window.location.href || "",
      clientPublicIp: publicIp.ip,
      clientPublicIpSource: publicIp.source,
    };
  }

  function setLoginStatus(message, type) {
    loginStatus.textContent = message;
    loginStatus.className = `status ${type || ""}`.trim();
  }

  function setAdminLocked(message) {
    adminContent.hidden = true;
    lockedPanel.hidden = false;
    setLoginStatus(
      message || "Log in here to enable admin features on this browser.",
      message ? "error" : "",
    );
  }

  function setAdminUnlocked() {
    lockedPanel.hidden = true;
    adminContent.hidden = false;
  }

  function formatMonth(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDisplayDate(value) {
    const date = new Date(`${value}T00:00:00`);
    const weekday = date.toLocaleDateString(DISPLAY_LOCALE, { weekday: "short" });
    const day = date.toLocaleDateString(DISPLAY_LOCALE, {
      month: "numeric",
      day: "numeric",
    });
    return `${weekday} ${day}`;
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  function getPlayDatesForMonth(month) {
    if (!/^\d{4}-\d{2}$/.test(month || "")) {
      return [];
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const year = Number(month.slice(0, 4));
    const monthIndex = Number(month.slice(5, 7)) - 1;
    const isCurrentMonth = month === formatMonth(today);
    const daysUntilThisSunday = (7 - today.getDay()) % 7;
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + daysUntilThisSunday + 7);
    const current = new Date(year, monthIndex, 1);
    const dates = [];

    while (
      current.getMonth() === monthIndex &&
      (!isCurrentMonth || current <= endDate)
    ) {
      if (PLAY_DAYS.includes(current.getDay())) {
        dates.push(formatDate(current));
      }
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }

  function getKey(playerName, playDate) {
    return `${playerName}\u0000${playDate}`;
  }

  function setStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type || ""}`.trim();
  }

  function buildAppsScriptUrl(payload, callbackName) {
    const url = new URL(APPS_SCRIPT_URL);
    if (callbackName) {
      url.searchParams.set("callback", callbackName);
    }
    Object.entries(payload).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });
    return url.toString();
  }

  function parseJsonpResponse(text, callbackName) {
    const trimmed = text.trim();
    const prefix = `${callbackName}(`;

    if (!trimmed.startsWith(prefix) || !trimmed.endsWith(");")) {
      throw new Error("Unexpected Apps Script response");
    }

    return JSON.parse(trimmed.slice(prefix.length, -2));
  }

  async function requestViaFetch(payload) {
    const callbackName = `adminRsvpFetch_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;
    const response = await fetch(buildAppsScriptUrl(payload, callbackName), {
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error("Could not reach Apps Script");
    }

    const parsed = parseJsonpResponse(text, callbackName);
    if (parsed && parsed.ok) {
      return parsed;
    }

    throw new Error(parsed?.error || "Request failed");
  }

  function requestViaJsonp(payload) {
    return new Promise((resolve, reject) => {
      const callbackName = `adminRsvpCallback_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`;
      const script = document.createElement("script");
      script.referrerPolicy = "no-referrer";
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Apps Script took too long to respond"));
      }, 30000);

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

        reject(new Error(response?.error || "Request failed"));
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

  function parseParticipantCount(value) {
    const count = Number.parseInt(String(value || "0"), 10);
    return Number.isFinite(count) ? Math.min(5, Math.max(0, count)) : 0;
  }

  function getVisiblePlayers() {
    const query = normalizeSearchText(playerSearch.value);
    if (!query) {
      return PLAYERS;
    }

    return PLAYERS.filter((player) =>
      normalizeSearchText(player).includes(query),
    );
  }

  function renderAuditPlayerOptions() {
    auditPlayerOptions.replaceChildren(
      ...PLAYERS.map((player) => {
        const option = document.createElement("option");
        option.value = player;
        return option;
      }),
    );
  }

  async function loadRoster() {
    try {
      const result = await requestAppsScript({
        action: "listRoster",
      });
      const roster = Array.isArray(result.roster) ? result.roster : [];
      const names = roster
        .map((member) => String(member.name || "").trim())
        .filter(Boolean);
      if (names.length > 0) {
        PLAYERS = names;
      }
    } catch {
      // Keep the built-in roster as a fallback when Apps Script is unavailable.
    }
    renderAuditPlayerOptions();
  }

  function getParticipantOptions(selectedValue) {
    return [0, 1, 2, 3, 4, 5].map((value) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = String(value);
      option.selected = value === selectedValue;
      return option;
    });
  }

  function updateChangeCount() {
    const count = changedValues.size;
    changeCount.textContent =
      count === 0 ? "No changes" : `${count} pending changes`;
    saveButton.disabled = count === 0 || !adminToken;
  }

  function updateMonthTotal() {
    const totals = monthDates.map((date) => getDateTotal(date));
    const total = totals.reduce((sum, value) => sum + value, 0);
    monthTotal.textContent =
      total === 0
        ? "No reserved spots this month"
        : `${total} reserved spots this month`;
  }

  function getDateTotal(date) {
    return PLAYERS.reduce((sum, player) => {
      const key = getKey(player, date);
      const value = changedValues.has(key)
        ? changedValues.get(key)
        : rosterValues.get(key) || 0;
      return sum + value;
    }, 0);
  }

  function updateDateHeaderTotals() {
    rosterTable
      .querySelectorAll("th[data-date] .date-total")
      .forEach((total) => {
        total.textContent = `Total: ${getDateTotal(total.dataset.date)}`;
      });
  }

  function appendCell(row, tagName, text) {
    const cell = document.createElement(tagName);
    cell.textContent = text;
    row.append(cell);
    return cell;
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value || "";
    }

    return date.toLocaleString(DISPLAY_LOCALE, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatAuditAction(action) {
    return (
      {
        created: "Submitted",
        updated: "Updated",
        deleted: "Removed",
        delete_not_found: "Remove attempted",
        needs_confirmation: "Update confirmation shown",
        withdraw_requested: "Asked to withdraw",
        withdraw_cancelled: "Withdraw request cancelled",
        withdraw_accepted: "Withdraw accepted (removed)",
        withdraw_declined: "Withdraw declined",
      }[action] || action || "Changed"
    );
  }

  function formatAuditCount(entry) {
    const nextCount = entry.participantCount ? Number(entry.participantCount) : 0;
    const previousCount = entry.existingParticipantCount ? Number(entry.existingParticipantCount) : 0;

    if (entry.action === "created") {
      return `New: ${nextCount}`;
    }
    if (entry.action === "updated") {
      return `${previousCount || 0} -> ${nextCount}`;
    }
    if (entry.action === "deleted" || entry.action === "withdraw_accepted") {
      return `Removed ${previousCount || nextCount || ""}`.trim();
    }
    if (entry.action === "delete_not_found") {
      return "No RSVP found";
    }
    if (entry.action === "needs_confirmation") {
      return `${previousCount || 0} -> ${nextCount}`;
    }
    return entry.participantCount || "";
  }

  function getAuditDiagnosticText(diagnostics) {
    if (!diagnostics) {
      return "";
    }

    const rowCount = Number(diagnostics.dataRows || 0);
    if (rowCount === 0) {
      return "Audit sheet has no saved rows yet.";
    }

    const latest = Array.isArray(diagnostics.recentRows)
      ? diagnostics.recentRows[0]
      : null;
    const latestText = latest
      ? ` Latest: ${latest.playerName || "unknown"} ${formatAuditAction(
          latest.action,
        ).toLowerCase()} ${latest.playDate || "unknown date"}.`
      : "";
    return `Audit sheet has ${rowCount} saved row${
      rowCount === 1 ? "" : "s"
    }.${latestText}`;
  }

  function renderAuditTable(entries, diagnostics) {
    changeHistoryTable.textContent = "";
    const selectedDate = auditDateFilter.value;
    const selectedPlayer = auditPlayerFilter.value.trim();
    const filterLabel = [
      selectedDate === "__all__"
        ? "all recent dates"
        : selectedDate || "selected month",
      selectedPlayer || "all players",
    ].join(", ");

    if (!Array.isArray(entries) || entries.length === 0) {
      const diagnosticText = getAuditDiagnosticText(diagnostics);
      auditTotal.textContent = diagnosticText
        ? `No matching changes for ${filterLabel}. ${diagnosticText}`
        : `No changes for ${filterLabel}`;
      return;
    }

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    ["When", "Player", "Date", "Change", "Spots", "Device", "IP"].forEach(
      (header) => {
        appendCell(headerRow, "th", header);
      },
    );
    thead.append(headerRow);

    const tbody = document.createElement("tbody");
    entries.forEach((entry) => {
      const row = document.createElement("tr");
      appendCell(row, "td", formatDateTime(entry.loggedAt)).dataset.label = "When";
      appendCell(row, "td", entry.playerName || "").dataset.label = "Player";
      appendCell(row, "td", entry.playDate || "").dataset.label = "Date";
      appendCell(row, "td", formatAuditAction(entry.action)).dataset.label = "Change";
      appendCell(row, "td", formatAuditCount(entry)).dataset.label = "Spots";
      appendCell(row, "td", entry.clientDevice || "").dataset.label = "Device";
      appendCell(row, "td", entry.clientPublicIp || entry.clientIp || "").dataset.label =
        "IP";
      tbody.append(row);
    });

    changeHistoryTable.append(thead, tbody);
    const diagnosticText = getAuditDiagnosticText(diagnostics);
    auditTotal.textContent = `${entries.length} recent change${entries.length === 1 ? "" : "s"} for ${filterLabel}${
      diagnosticText ? `. ${diagnosticText}` : ""
    }`;
  }

  function renderAuditDateFilter() {
    const selectedDate = auditDateFilter.value;
    const options = [
      {
        value: "__all__",
        label: "All recent history",
      },
      {
        value: "",
        label: "All dates this month",
      },
      ...monthDates.map((date) => ({
        value: date,
        label: `${formatDisplayDate(date)} (${date})`,
      })),
    ];

    auditDateFilter.replaceChildren(
      ...options.map((item) => {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        option.selected = item.value === selectedDate;
        return option;
      }),
    );

    if (
      selectedDate &&
      selectedDate !== "__all__" &&
      !monthDates.includes(selectedDate)
    ) {
      auditDateFilter.value = "";
    }
  }

  function scheduleAuditLoad() {
    window.clearTimeout(auditFilterTimer);
    auditFilterTimer = window.setTimeout(() => {
      loadAudit(monthInput.value);
    }, 250);
  }

  async function loadAudit(month) {
    const requestId = latestAuditRequest + 1;
    latestAuditRequest = requestId;

    if (!adminToken) {
      auditTotal.textContent = "Login required";
      changeHistoryTable.textContent = "";
      return;
    }

    auditRefreshButton.disabled = true;
    auditTotal.textContent = "Loading history...";
    changeHistoryTable.textContent = "";
    const playDate = auditDateFilter.value;
    const playerName = auditPlayerFilter.value.trim();

    try {
      const payload = {
        action: "listAudit",
        adminToken,
        limit: "250",
      };
      if (playDate === "__all__") {
        payload.limit = "500";
      } else {
        payload.month = month;
      }
      if (playDate && playDate !== "__all__") {
        payload.playDate = playDate;
      }
      if (playerName) {
        payload.playerName = playerName;
      }

      const result = await requestAppsScript(payload);
      if (requestId !== latestAuditRequest || monthInput.value !== month) {
        return;
      }
      renderAuditTable(result.entries || [], result.diagnostics || null);
    } catch (error) {
      if (requestId !== latestAuditRequest || monthInput.value !== month) {
        return;
      }
      auditTotal.textContent = "Could not load history";
      changeHistoryTable.textContent = error.message;
    } finally {
      if (requestId === latestAuditRequest) {
        auditRefreshButton.disabled = false;
      }
    }
  }

  function applyLockButtonState(button, date) {
    const locked = lockedDates.has(date);
    button.textContent = locked ? "🔒 Locked" : "🔓 Unlocked";
    button.classList.toggle("date-lock-on", locked);
    button.setAttribute("aria-pressed", String(locked));
    button.title = locked
      ? "Members can still add themselves but cannot drop out. Click to unlock."
      : "Open — members can add or drop out. Click to lock after you book the field.";
  }

  function buildLockButton(date) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "date-lock-button";
    button.dataset.date = date;
    applyLockButtonState(button, date);
    button.addEventListener("click", () => toggleDateLock(date, button));
    return button;
  }

  async function toggleDateLock(date, button) {
    if (!adminToken) {
      setStatus("Log in as admin to lock game dates.", "error");
      return;
    }
    const nextLocked = !lockedDates.has(date);
    button.disabled = true;
    setStatus(
      `${nextLocked ? "Locking" : "Unlocking"} ${formatDisplayDate(date)}...`,
      "loading",
    );
    try {
      const result = await requestAppsScript({
        action: "setDateLock",
        adminToken,
        playDate: date,
        locked: nextLocked ? "true" : "false",
      });
      if (result.locked) {
        lockedDates.add(date);
      } else {
        lockedDates.delete(date);
      }
      applyLockButtonState(button, date);
      setStatus(
        `${formatDisplayDate(date)} is now ${
          result.locked ? "locked — drop-outs closed" : "unlocked"
        }.`,
        "success",
      );
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  function renderRosterTable() {
    const visiblePlayers = getVisiblePlayers();
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const nameHeader = document.createElement("th");
    const tbody = document.createElement("tbody");

    nameHeader.textContent = "Name";
    headerRow.append(nameHeader);
    monthDates.forEach((date) => {
      const header = document.createElement("th");
      const dateLabel = document.createElement("span");
      const totalLabel = document.createElement("span");
      header.dataset.date = date;
      dateLabel.className = "date-heading";
      dateLabel.textContent = formatDisplayDate(date);
      totalLabel.className = "date-total";
      totalLabel.dataset.date = date;
      totalLabel.textContent = `Total: ${getDateTotal(date)}`;
      header.append(dateLabel, totalLabel, buildLockButton(date));
      headerRow.append(header);
    });
    thead.append(headerRow);

    function getAttendanceClass(value) {
      if (value > 1) {
        return "roster-edit-party";
      }
      if (value === 1) {
        return "roster-edit-solo";
      }
      return "";
    }

    visiblePlayers.forEach((player) => {
      const row = document.createElement("tr");
      const name = document.createElement("td");
      name.textContent = player;
      name.dataset.label = "Name";
      row.append(name);

      monthDates.forEach((date) => {
        const key = getKey(player, date);
        const originalValue = rosterValues.get(key) || 0;
        const value = changedValues.has(key)
          ? changedValues.get(key)
          : originalValue;
        const cell = document.createElement("td");
        const select = document.createElement("select");

        cell.className = getAttendanceClass(value);
        cell.classList.toggle("roster-edit-dirty", changedValues.has(key));
        cell.dataset.label = formatDisplayDate(date);
        select.className = "roster-edit-select";
        select.dataset.player = player;
        select.dataset.date = date;
        select.replaceChildren(...getParticipantOptions(value));
        select.addEventListener("change", () => {
          const nextValue = parseParticipantCount(select.value);
          if (nextValue === originalValue) {
            changedValues.delete(key);
          } else {
            changedValues.set(key, nextValue);
          }
          cell.className = getAttendanceClass(nextValue);
          cell.classList.toggle("roster-edit-dirty", changedValues.has(key));
          updateChangeCount();
          updateMonthTotal();
          updateDateHeaderTotals();
        });

        cell.append(select);
        row.append(cell);
      });

      tbody.append(row);
    });

    rosterTable.replaceChildren(thead, tbody);
    updateChangeCount();
    updateMonthTotal();
  }

  async function loadMonth(month) {
    const requestId = latestLoadRequest + 1;
    latestLoadRequest = requestId;
    monthDates = getPlayDatesForMonth(month);
    renderAuditDateFilter();
    rosterValues = new Map();
    lockedDates = new Set();
    changedValues.clear();
    rosterTable.textContent = "";
    setStatus("Loading month...", "loading");
    monthTotal.textContent = "Loading...";
    updateChangeCount();
    loadAudit(month);

    try {
      for (let index = 0; index < monthDates.length; index += 1) {
        const playDate = monthDates[index];
        setStatus(
          `Loading ${index + 1} of ${monthDates.length} dates...`,
          "loading",
        );
        const result = await requestAppsScript({
          action: "list",
          playDate,
        });
        if (requestId !== latestLoadRequest || monthInput.value !== month) {
          return;
        }

        const players = Array.isArray(result.tally?.players)
          ? result.tally.players
          : [];
        players.forEach((player) => {
          rosterValues.set(
            getKey(player.name, playDate),
            parseParticipantCount(player.participantCount),
          );
        });
        if (result.tally?.locked) {
          lockedDates.add(playDate);
        } else {
          lockedDates.delete(playDate);
        }
      }

      renderRosterTable();
      setStatus("Month loaded.", "success");
    } catch (error) {
      if (requestId !== latestLoadRequest || monthInput.value !== month) {
        return;
      }
      rosterTable.textContent = "";
      monthTotal.textContent = "Could not load month";
      setStatus(error.message, "error");
    }
  }

  async function saveChanges() {
    const changes = Array.from(changedValues.entries());
    if (changes.length === 0) {
      return;
    }

    saveButton.disabled = true;
    setStatus(`Saving 0 of ${changes.length} changes...`, "loading");

    try {
      const auditMetadata = await getAuditMetadata();
      for (let index = 0; index < changes.length; index += 1) {
        const [key, participantCount] = changes[index];
        const [playerName, playDate] = key.split("\u0000");
        setStatus(
          `Saving ${index + 1} of ${changes.length} changes...`,
          "loading",
        );
        await requestAppsScript({
          action: "adminUpsertRsvp",
          adminToken,
          playerName,
          playDate,
          participantCount,
          vote: participantCount > 0 ? "Yes" : "No",
          confirmOverride: "true",
          submittedAt: new Date().toISOString(),
          ...auditMetadata,
        });
      }

      await loadMonth(monthInput.value);
      setStatus(`Saved ${changes.length} changes.`, "success");
    } catch (error) {
      setStatus(error.message, "error");
      updateChangeCount();
    }
  }

  async function loadAdminData() {
    await loadRoster();
    monthInput.value = monthInput.value || formatMonth(new Date());
    loadMonth(monthInput.value);
  }

  function handleAdminStateChange(state) {
    const nextToken = state.token || "";
    const hadToken = Boolean(adminToken);
    adminToken = nextToken;

    if (!adminToken) {
      if (hadToken) {
        changedValues.clear();
      }
      rosterTable.textContent = "";
      monthTotal.textContent = "Login required";
      changeHistoryTable.textContent = "";
      auditTotal.textContent = "Login required";
      setStatus("", "");
      updateChangeCount();
      setAdminLocked("");
      return;
    }

    setAdminUnlocked();
    if (!hadToken) {
      loadAdminData();
    }
    updateChangeCount();
  }

  function initialize() {
    setAdminLocked("");
    adminAuth.onChange(handleAdminStateChange);
  }

  window.addEventListener("storage", (event) => {
    if (event.key === "play-rsvp.adminAuth") {
      window.location.reload();
    }
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setLoginStatus("Logging in...", "loading");

    try {
      await adminAuth.login(passwordInput.value);
      passwordInput.value = "";
    } catch (error) {
      setLoginStatus(error.message, "error");
    }
  });

  logoutButton.addEventListener("click", () => {
    adminAuth.logout();
  });

  monthInput.addEventListener("change", () => {
    loadMonth(monthInput.value);
  });

  auditDateFilter.addEventListener("change", () => {
    loadAudit(monthInput.value);
  });

  auditPlayerFilter.addEventListener("input", () => {
    scheduleAuditLoad();
  });

  auditRefreshButton.addEventListener("click", () => {
    loadAudit(monthInput.value);
  });

  playerSearch.addEventListener("input", () => {
    renderRosterTable();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveChanges();
  });

  initialize();
})();
