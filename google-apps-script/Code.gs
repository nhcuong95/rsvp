const SHEET_NAME = "RSVPs";
const ROSTER_SHEET_NAME = "Roster";
const AUDIT_SHEET_NAME = "RSVP Audit Log";
const BILLING_COURT_SHEET_NAME = "Billing Court Blocks";
const BILLING_BIRDIE_INVENTORY_SHEET_NAME = "Billing Birdie Inventory";
const BILLING_BIRDIE_PURCHASE_SHEET_NAME = "Billing Birdie Purchases";
const BILLING_PAYMENT_SHEET_NAME = "Billing Payments";
const BILLING_ADJUSTMENT_SHEET_NAME = "Billing Adjustments";
const BILLING_MONTH_STATUS_SHEET_NAME = "Billing Month Status";
const LOCKS_SHEET_NAME = "Roster Locks";
const LOCKS_HEADERS = ["Play Date", "Locked", "Updated At", "Updated By"];
const EXPORT_SPREADSHEET_ID = "1VVSCnvyLOoAjC1qJ7CB4oMEgEcKX0j77nxD-2-rpNzQ";
const PREVIEW_MAX_ROWS = 120;
const PREVIEW_MAX_COLUMNS = 80;
const EXPORT_MIN_PARTICIPANTS = 2;
const ADMIN_TOKEN_TTL_SECONDS = 21600;
const PLAY_DAYS = [2, 4, 6]; // Tuesday, Thursday, Saturday
const PLAY_START_HOUR = 6;
const UNVOTE_LOCK_HOURS_BEFORE_PLAY = 6;
const UNVOTE_LOCK_MESSAGE =
  "RSVP removals close at 12AM before the play date. No-shows may still be charged court fees.";
const HEADERS = [
  "Play Date",
  "Player Name",
  "Vote",
  "Participant Count",
  "Submitted At",
  "Updated At",
];
const ROSTER_HEADERS = ["Name", "Venmo", "Facebook", "Note", "Zelle"];
const BILLING_COURT_HEADERS = [
  "ID",
  "Month",
  "Date",
  "Start Time",
  "Duration Hours",
  "Courts",
  "Amount",
  "Paid By",
  "Status",
  "Source",
  "Created At",
  "Updated At",
  "Created By",
  "Updated By",
];
const BILLING_BIRDIE_INVENTORY_HEADERS = [
  "Month",
  "Start Tubes",
  "End Tubes",
  "Updated At",
  "Updated By",
];
const BILLING_BIRDIE_PURCHASE_HEADERS = [
  "ID",
  "Month",
  "Date",
  "Tubes",
  "Amount",
  "Paid By",
  "Status",
  "Created At",
  "Updated At",
  "Created By",
  "Updated By",
  "Record Type",
  "Start Tubes",
  "End Tubes",
  "Inventory Updated At",
  "Inventory Updated By",
  "Unit Price",
  "Batch",
];
const BILLING_PAYMENT_HEADERS = [
  "Month",
  "Player Name",
  "Status",
  "Updated At",
  "Updated By",
  "Adjustment ID",
  "Adjustment Amount",
  "Adjustment Note",
  "Adjustment Status",
  "Adjustment Created At",
  "Adjustment Updated At",
  "Adjustment Created By",
  "Adjustment Updated By",
];
const BILLING_ADJUSTMENT_HEADERS = [
  "ID",
  "Month",
  "Player Name",
  "Amount",
  "Note",
  "Status",
  "Created At",
  "Updated At",
  "Created By",
  "Updated By",
];
const BILLING_MONTH_STATUS_HEADERS = [
  "Month",
  "Status",
  "Note",
  "Updated At",
  "Updated By",
];
const AUDIT_HEADERS = [
  "Logged At",
  "Action",
  "Play Date",
  "Player Name",
  "Participant Count",
  "Row",
  "Browser ID",
  "Browser Signature",
  "Client Device",
  "Client Time Zone",
  "Client Language",
  "Client Screen",
  "Client IP",
  "Submitted At",
  "Existing RSVP",
  "Public IP",
  "Public IP Source",
  "Client User Agent",
  "Client Platform",
  "Client Vendor",
  "Client Referrer",
  "Page URL",
];
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

function doGet(event) {
  const params = event && event.parameter ? event.parameter : {};
  const callback = params.callback || "callback";

  try {
    if (params.action === "adminLogin") {
      const result = adminLogin_(params);
      return jsonp_(callback, {
        ok: true,
        token: result.token,
        expiresAt: result.expiresAt,
      });
    }

    if (params.action === "validateAdmin") {
      requireAdmin_(params);
      return jsonp_(callback, {
        ok: true,
        action: "validateAdmin",
      });
    }

    if (params.action === "listRoster") {
      return jsonp_(callback, {
        ok: true,
        roster: getRoster_(),
      });
    }

    if (params.action === "saveRosterMember") {
      const result = saveRosterMember_(params);
      return jsonp_(callback, {
        ok: true,
        action: result.action,
        renameCounts: result.renameCounts || null,
        roster: result.roster,
      });
    }

    if (params.action === "completeRosterMemberInfo") {
      const result = completeRosterMemberInfo_(params);
      return jsonp_(callback, {
        ok: true,
        action: result.action,
        updatedFields: result.updatedFields,
        roster: result.roster,
      });
    }

    if (params.action === "removeRosterMember") {
      requireAdmin_(params);
      const result = removeRosterMember_(params);
      return jsonp_(callback, {
        ok: true,
        action: "removeRosterMember",
        removed: result.removed,
        roster: result.roster,
      });
    }

    if (params.action === "adminUpsertRsvp") {
      requireAdmin_(params);
      const result = upsertRsvp_(params);
      return jsonp_(callback, {
        ok: true,
        action: result.action,
        row: result.row,
        existing: result.existing || null,
        audit: result.audit || null,
        tally: result.tally,
      });
    }

    if (params.action === "setDateLock") {
      requireAdmin_(params);
      const result = setDateLock_(params);
      return jsonp_(callback, {
        ok: true,
        action: "setDateLock",
        playDate: result.playDate,
        locked: result.locked,
      });
    }

    if (params.action === "listDateLocks") {
      requireAdmin_(params);
      return jsonp_(callback, {
        ok: true,
        action: "listDateLocks",
        lockedDates: listDateLocks_(),
      });
    }

    if (params.action === "listAudit") {
      requireAdmin_(params);
      const audit = getAuditLog_(params);
      return jsonp_(callback, {
        ok: true,
        action: "listAudit",
        entries: audit.entries,
        diagnostics: audit.diagnostics,
      });
    }

    if (params.action === "auditDiagnostics") {
      requireAdmin_(params);
      return jsonp_(callback, {
        ok: true,
        action: "auditDiagnostics",
        diagnostics: getAuditDiagnostics_(params),
      });
    }

    if (params.action === "list") {
      return jsonp_(callback, {
        ok: true,
        tally: getTally_(required_(params.playDate, "Missing play date")),
      });
    }

    if (params.action === "delete") {
      const result = deleteRsvp_(params);
      return jsonp_(callback, {
        ok: true,
        action: result.action,
        row: result.row,
        audit: result.audit || null,
        tally: result.tally,
      });
    }

    if (params.action === "cleanup") {
      const result = cleanupNonRosterRows_();
      return jsonp_(callback, {
        ok: true,
        action: "cleanup",
        deletedCount: result.deletedCount,
        deletedNames: result.deletedNames,
      });
    }

    if (params.action === "exportMonth") {
      requireAdmin_(params);
      const result = exportMonthRoster_(
        required_(params.month, "Missing export month"),
      );
      return jsonp_(callback, {
        ok: true,
        action: "exportMonth",
        sheetName: result.sheetName,
        exportedDates: result.exportedDates,
        previewRows: result.previewRows,
        url: result.url,
      });
    }

    if (params.action === "viewMonth") {
      const result = viewMonthRoster_(
        required_(params.month, "Missing export month"),
      );
      const canOpenSpreadsheet = hasAdminAccess_(params);
      return jsonp_(callback, {
        ok: true,
        action: "viewMonth",
        sheetName: result.sheetName,
        exportedDates: result.exportedDates,
        previewRows: result.previewRows,
        url: canOpenSpreadsheet ? result.url : "",
      });
    }

    if (params.action === "listBillingMonths") {
      return jsonp_(callback, {
        ok: true,
        action: "listBillingMonths",
        months: getBillingMonths_(hasAdminAccess_(params)),
      });
    }

    if (params.action === "listBillingMonth") {
      return jsonp_(callback, {
        ok: true,
        action: "listBillingMonth",
        billing: getBillingMonth_(
          required_(params.month, "Missing billing month"),
          params.includeDiagnostics === "true" && hasAdminAccess_(params),
        ),
      });
    }

    if (params.action === "markBillingMonthPaid") {
      requireAdmin_(params);
      return jsonp_(callback, {
        ok: true,
        action: "markBillingMonthPaid",
        billing: markBillingMonthPaid_(params),
      });
    }

    if (params.action === "saveCourtBlock") {
      requireAdmin_(params);
      return jsonp_(callback, {
        ok: true,
        action: "saveCourtBlock",
        courtBlock: saveBillingCourtBlock_(params),
      });
    }

    if (params.action === "toggleCourtBlock") {
      requireAdmin_(params);
      return jsonp_(callback, {
        ok: true,
        action: "toggleCourtBlock",
        courtBlock: toggleBillingCourtBlock_(params),
      });
    }

    if (params.action === "saveBirdieInventory") {
      requireAdmin_(params);
      return jsonp_(callback, {
        ok: true,
        action: "saveBirdieInventory",
        billing: saveBillingBirdieInventory_(params),
      });
    }

    if (params.action === "saveBirdiePurchase") {
      requireAdmin_(params);
      return jsonp_(callback, {
        ok: true,
        action: "saveBirdiePurchase",
        birdiePurchase: saveBillingBirdiePurchase_(params),
      });
    }

    if (params.action === "removeBirdiePurchase") {
      requireAdmin_(params);
      return jsonp_(callback, {
        ok: true,
        action: "removeBirdiePurchase",
        birdiePurchase: removeBillingBirdiePurchase_(params),
      });
    }

    if (params.action === "saveBillingPaymentStatus") {
      requireAdmin_(params);
      return jsonp_(callback, {
        ok: true,
        action: "saveBillingPaymentStatus",
        payment: saveBillingPaymentStatus_(params),
      });
    }

    if (params.action === "saveBillingMonthStatus") {
      requireAdmin_(params);
      return jsonp_(callback, {
        ok: true,
        action: "saveBillingMonthStatus",
        monthStatus: saveBillingMonthStatus_(params),
      });
    }

    if (params.action === "saveBillingAdjustment") {
      requireAdmin_(params);
      return jsonp_(callback, {
        ok: true,
        action: "saveBillingAdjustment",
        adjustment: saveBillingAdjustment_(params),
      });
    }

    if (params.action === "removeBillingAdjustment") {
      requireAdmin_(params);
      return jsonp_(callback, {
        ok: true,
        action: "removeBillingAdjustment",
        adjustment: removeBillingAdjustment_(params),
      });
    }

    if (params.action) {
      throw new Error(`Unsupported action: ${params.action}`);
    }

    const result = upsertRsvp_(params);
    return jsonp_(callback, {
      ok: true,
      action: result.action,
      row: result.row,
      existing: result.existing || null,
      audit: result.audit || null,
      tally: result.tally,
    });
  } catch (error) {
    return jsonp_(callback, {
      ok: false,
      error: error.message,
    });
  }
}

function upsertRsvp_(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    return upsertRsvpWithLock_(params);
  } finally {
    lock.releaseLock();
  }
}

function adminLogin_(params) {
  const password = required_(params.password, "Missing password");
  const expectedPassword = PropertiesService.getScriptProperties().getProperty(
    "ADMIN_PASSWORD",
  );

  if (!expectedPassword) {
    throw new Error("Admin password is not configured");
  }

  if (password !== expectedPassword) {
    throw new Error("Incorrect admin password");
  }

  const token = Utilities.getUuid();
  const expiresAt = Date.now() + ADMIN_TOKEN_TTL_SECONDS * 1000;
  CacheService.getScriptCache().put(
    getAdminTokenCacheKey_(token),
    "true",
    ADMIN_TOKEN_TTL_SECONDS,
  );

  return { token, expiresAt };
}

function requireAdmin_(params) {
  const token = required_(params.adminToken, "Admin login required");

  if (!hasAdminToken_(token)) {
    throw new Error("Admin login expired. Please log in again.");
  }
}

function hasAdminAccess_(params) {
  const token = params.adminToken;
  return token ? hasAdminToken_(token) : false;
}

function hasAdminToken_(token) {
  return CacheService.getScriptCache().get(getAdminTokenCacheKey_(token)) === "true";
}

function getAdminTokenCacheKey_(token) {
  return `admin:${token}`;
}

function deleteRsvp_(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const playDate = required_(params.playDate, "Missing play date");
    const playerName = required_(params.playerName, "Missing player name").trim();
    validatePlayerName_(playerName);
    const sheet = getSheet_();
    const rows = findExistingRows_(sheet, playDate, playerName);
    const existingRsvp = rows.length > 0 ? getRsvpAtRow_(sheet, rows[0]) : null;

    if (isUnvoteBlocked_(params, playDate)) {
      appendAuditLog_(params, "blocked_unvote", rows[0] || null, existingRsvp);
      throw new Error(UNVOTE_LOCK_MESSAGE);
    }

    if (rows.length === 0) {
      const audit = appendAuditLog_(params, "delete_not_found", null, null);
      return {
        action: "not_found",
        row: null,
        audit,
        tally: getTally_(playDate),
      };
    }

    rows.sort((first, second) => second - first).forEach((row) => {
      sheet.deleteRow(row);
    });
    const audit = appendAuditLog_(params, "deleted", rows[0], existingRsvp);
    return {
      action: "deleted",
      row: rows[0],
      audit,
      tally: getTally_(playDate),
    };
  } finally {
    lock.releaseLock();
  }
}

function upsertRsvpWithLock_(params) {
  const playDate = required_(params.playDate, "Missing play date");
  const playerName = sanitizeText_(
    required_(params.playerName, "Missing player name").trim(),
  );
  validatePlayerName_(playerName);
  const participantCount = clampSubmittedParticipantCount_(
    params.participantCount,
  );
  const vote =
    participantCount > 0 && normalize_(params.vote || "Yes") !== "no"
      ? "Yes"
      : "No";
  const submittedAt = params.submittedAt || new Date().toISOString();
  const updatedAt = new Date().toISOString();

  const sheet = getSheet_();
  const matchingRows = findExistingRows_(sheet, playDate, playerName);
  const row = matchingRows[0] || null;
  const existingRsvp = row ? getRsvpAtRow_(sheet, row) : null;
  let audit;

  if (normalize_(vote) === "no") {
    if (isUnvoteBlocked_(params, playDate)) {
      appendAuditLog_(params, "blocked_unvote", row, existingRsvp);
      throw new Error(UNVOTE_LOCK_MESSAGE);
    }

    if (row) {
      matchingRows.sort((first, second) => second - first).forEach((rowNumber) => {
        sheet.deleteRow(rowNumber);
      });
      audit = appendAuditLog_(params, "deleted", row, existingRsvp);
      return {
        action: "deleted",
        row,
        audit,
        tally: getTally_(playDate),
      };
    }

    audit = appendAuditLog_(params, "delete_not_found", null, null);
    return {
      action: "not_found",
      row: null,
      audit,
      tally: getTally_(playDate),
    };
  }

  const values = [
    playDate,
    playerName,
    vote,
    participantCount,
    submittedAt,
    updatedAt,
  ];

  if (row) {
    deleteDuplicateRows_(sheet, matchingRows, row);
    if (normalize_(existingRsvp.vote) !== "no" && params.confirmOverride !== "true") {
      audit = appendAuditLog_(params, "needs_confirmation", row, existingRsvp);
      return {
        action: "needs_confirmation",
        row,
        existing: existingRsvp,
        audit,
        tally: getTally_(playDate),
      };
    }

    const originalSubmittedAt = sheet.getRange(row, 5).getValue() || submittedAt;
    values[4] = originalSubmittedAt;
    sheet.getRange(row, 1, 1, values.length).setValues([values]);
    audit = appendAuditLog_(params, "updated", row, existingRsvp);
    return { action: "updated", row, audit, tally: getTally_(playDate) };
  }

  sheet.appendRow(values);
  const appendedRow = sheet.getLastRow();
  audit = appendAuditLog_(params, "created", appendedRow, null);
  return {
    action: "created",
    row: appendedRow,
    audit,
    tally: getTally_(playDate),
  };
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  const currentHeaders = headerRange.getValues()[0];
  const needsHeaders = HEADERS.some((header, index) => currentHeaders[index] !== header);

  if (needsHeaders) {
    headerRange.setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function getLocksSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(LOCKS_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(LOCKS_SHEET_NAME);
  }

  const headerRange = sheet.getRange(1, 1, 1, LOCKS_HEADERS.length);
  const currentHeaders = headerRange.getValues()[0];
  const needsHeaders = LOCKS_HEADERS.some(
    (header, index) => currentHeaders[index] !== header,
  );

  if (needsHeaders) {
    headerRange.setValues([LOCKS_HEADERS]);
    sheet.setFrozenRows(1);
  }
  sheet.getRange("A:A").setNumberFormat("@");

  return sheet;
}

function getLockedDateSet_() {
  const sheet = getLocksSheet_();
  const lastRow = sheet.getLastRow();
  const locked = {};
  if (lastRow < 2) {
    return locked;
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  rows.forEach((row) => {
    const date = normalizeDate_(row[0]);
    if (date && normalize_(row[1]) === "true") {
      locked[date] = true;
    }
  });
  return locked;
}

function isDateLocked_(playDate) {
  const date = normalizeDate_(playDate);
  if (!date) {
    return false;
  }
  return Boolean(getLockedDateSet_()[date]);
}

function findLockRow_(sheet, playDate) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return 0;
  }
  const dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let index = 0; index < dates.length; index += 1) {
    if (normalizeDate_(dates[index][0]) === playDate) {
      return index + 2;
    }
  }
  return 0;
}

function setDateLock_(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const playDate = normalizeDate_(
      required_(params.playDate, "Missing play date"),
    );
    if (!/^\d{4}-\d{2}-\d{2}$/.test(playDate)) {
      throw new Error("Enter a valid play date");
    }
    const locked = normalize_(params.locked) === "true";
    const sheet = getLocksSheet_();
    const row = findLockRow_(sheet, playDate);
    const values = [
      playDate,
      locked ? "TRUE" : "FALSE",
      new Date().toISOString(),
      sanitizeText_(params.updatedBy || "admin"),
    ];

    if (row) {
      sheet.getRange(row, 1, 1, LOCKS_HEADERS.length).setValues([values]);
    } else {
      sheet.appendRow(values);
    }

    return { playDate, locked };
  } finally {
    lock.releaseLock();
  }
}

function listDateLocks_() {
  return Object.keys(getLockedDateSet_()).sort();
}

function getAuditSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(AUDIT_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(AUDIT_SHEET_NAME);
  }

  const headerRange = sheet.getRange(1, 1, 1, AUDIT_HEADERS.length);
  const currentHeaders = headerRange.getValues()[0];
  const needsHeaders = AUDIT_HEADERS.some((header, index) => currentHeaders[index] !== header);

  if (needsHeaders) {
    headerRange.setValues([AUDIT_HEADERS]);
    sheet.setFrozenRows(1);
  }
  sheet.getRange("C:C").setNumberFormat("@");

  return sheet;
}

function appendAuditLog_(params, action, row, existingRsvp) {
  try {
    const sheet = getAuditSheet_();
    const auditPlayDate = normalizeDate_(params.playDate || "");
    const values = [
      new Date().toISOString(),
      action,
      sanitizeText_(auditPlayDate),
      sanitizeText_(params.playerName || ""),
      sanitizeText_(params.participantCount || ""),
      row || "",
      sanitizeText_(params.browserId || ""),
      sanitizeText_(params.browserSignature || ""),
      sanitizeText_(params.clientDeviceClass || ""),
      sanitizeText_(params.clientTimeZone || ""),
      sanitizeText_(params.clientLanguage || ""),
      sanitizeText_(params.clientScreen || ""),
      sanitizeText_(params.clientIp || "Unavailable in Apps Script"),
      sanitizeText_(params.submittedAt || ""),
      existingRsvp ? JSON.stringify(existingRsvp) : "",
      sanitizeText_(params.clientPublicIp || ""),
      sanitizeText_(params.clientPublicIpSource || ""),
      sanitizeText_(params.clientUserAgent || ""),
      sanitizeText_(params.clientPlatform || ""),
      sanitizeText_(params.clientVendor || ""),
      sanitizeText_(params.clientReferrer || ""),
      sanitizeText_(params.clientPageUrl || ""),
    ];
    sheet.appendRow(values);
    return {
      ok: true,
      sheet: AUDIT_SHEET_NAME,
      row: sheet.getLastRow(),
      action,
      playDate: auditPlayDate,
    };
  } catch (error) {
    const message = `Could not append RSVP audit log: ${error.message}`;
    console.warn(message);
    return {
      ok: false,
      sheet: AUDIT_SHEET_NAME,
      action,
      playDate: normalizeDate_(params.playDate || ""),
      error: message,
    };
  }
}

function getAuditLog_(params) {
  const month = sanitizeText_(params.month || "");
  const playDate = normalizeDate_(params.playDate || "");
  const playerName = sanitizeText_(params.playerName || "");
  const limit = Math.min(
    500,
    Math.max(1, parseInt(String(params.limit || "250"), 10) || 250),
  );
  const sheet = getAuditSheet_();
  const lastRow = sheet.getLastRow();
  const diagnostics = getAuditDiagnosticsFromSheet_(sheet, params);

  if (lastRow < 2) {
    return {
      entries: [],
      diagnostics,
    };
  }

  const entries = sheet
    .getRange(2, 1, lastRow - 1, AUDIT_HEADERS.length)
    .getValues()
    .map((row, index) => auditRowToEntry_(row, index + 2))
    .filter((entry) => {
      if (month && !entry.playDate.startsWith(month)) {
        return false;
      }
      if (playDate && entry.playDate !== playDate) {
        return false;
      }
      if (playerName && normalize_(entry.playerName) !== normalize_(playerName)) {
        return false;
      }
      return true;
    })
    .sort((first, second) => {
      const dateOrder = second.playDate.localeCompare(first.playDate);
      if (dateOrder !== 0) {
        return dateOrder;
      }
      return second.loggedAt.localeCompare(first.loggedAt);
    })
    .slice(0, limit);

  return {
    entries,
    diagnostics,
  };
}

function getAuditDiagnostics_(params) {
  return getAuditDiagnosticsFromSheet_(getAuditSheet_(), params);
}

function getAuditDiagnosticsFromSheet_(sheet, params) {
  const month = sanitizeText_(params.month || "");
  const playDate = normalizeDate_(params.playDate || "");
  const playerName = sanitizeText_(params.playerName || "");
  const lastRow = sheet.getLastRow();
  const lastColumn = Math.max(sheet.getLastColumn(), AUDIT_HEADERS.length);
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const recentCount = Math.max(0, Math.min(5, lastRow - 1));
  const recentRows =
    recentCount > 0
      ? sheet
          .getRange(
            lastRow - recentCount + 1,
            1,
            recentCount,
            AUDIT_HEADERS.length,
          )
          .getValues()
          .map((row, index) =>
            auditRowToEntry_(row, lastRow - recentCount + 1 + index),
          )
          .reverse()
      : [];
  const matchingRecentRows = recentRows.filter((entry) => {
    if (month && !entry.playDate.startsWith(month)) {
      return false;
    }
    if (playDate && entry.playDate !== playDate) {
      return false;
    }
    if (playerName && normalize_(entry.playerName) !== normalize_(playerName)) {
      return false;
    }
    return true;
  });

  return {
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    auditSheetName: sheet.getName(),
    auditSheetId: sheet.getSheetId(),
    lastRow,
    lastColumn,
    dataRows: Math.max(0, lastRow - 1),
    filters: {
      month,
      playDate,
      playerName,
    },
    recentRows,
    matchingRecentRows,
  };
}

function auditRowToEntry_(row, sheetRow) {
  const existingRsvp = parseAuditExistingRsvp_(row[14]);
  return {
    row: sheetRow,
    loggedAt: formatAuditValue_(row[0]),
    action: String(row[1] || ""),
    playDate: normalizeDate_(row[2]),
    playerName: String(row[3] || ""),
    participantCount: String(row[4] || ""),
    rsvpRow: String(row[5] || ""),
    browserId: String(row[6] || ""),
    browserSignature: String(row[7] || ""),
    clientDevice: String(row[8] || ""),
    clientTimeZone: String(row[9] || ""),
    clientLanguage: String(row[10] || ""),
    clientScreen: String(row[11] || ""),
    clientIp: String(row[12] || ""),
    submittedAt: formatAuditValue_(row[13]),
    existingParticipantCount: existingRsvp
      ? String(existingRsvp.participantCount || "")
      : "",
    existingVote: existingRsvp ? String(existingRsvp.vote || "") : "",
    clientPublicIp: String(row[15] || ""),
    clientPublicIpSource: String(row[16] || ""),
    clientUserAgent: String(row[17] || ""),
    clientPlatform: String(row[18] || ""),
    clientVendor: String(row[19] || ""),
    clientReferrer: String(row[20] || ""),
    clientPageUrl: String(row[21] || ""),
  };
}

function parseAuditExistingRsvp_(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(String(value));
  } catch (error) {
    return null;
  }
}

function formatAuditValue_(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value || "");
}

function getRosterSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(ROSTER_SHEET_NAME);
  let shouldSeedRoster = false;

  if (!sheet) {
    sheet = spreadsheet.insertSheet(ROSTER_SHEET_NAME);
    shouldSeedRoster = true;
  }

  migrateRosterSheet_(sheet);

  const headerRange = sheet.getRange(1, 1, 1, ROSTER_HEADERS.length);
  const currentHeaders = headerRange.getValues()[0];
  const needsHeaders = ROSTER_HEADERS.some(
    (header, index) => currentHeaders[index] !== header,
  );

  if (needsHeaders) {
    headerRange.setValues([ROSTER_HEADERS]);
    sheet.setFrozenRows(1);
  }

  if (shouldSeedRoster && sheet.getLastRow() < 2) {
    sheet
      .getRange(2, 1, PLAYERS.length, ROSTER_HEADERS.length)
      .setValues(PLAYERS.map((name) => [name, "", "", "", ""]));
  }

  return sheet;
}

function migrateRosterSheet_(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 2) {
    return;
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const hasLegacyPaymentInfo =
    headers[0] === "Name" &&
    headers[1] === "Payment Info" &&
    headers[2] === "Venmo";

  if (hasLegacyPaymentInfo && sheet.getLastRow() >= 2) {
    const lastRow = sheet.getLastRow();
    const venmoValues = sheet.getRange(2, 3, lastRow - 1, 1).getValues();
    sheet.getRange(2, 2, lastRow - 1, 1).setValues(venmoValues);
  }

  if (headers[3] === "Cellphone" && headers[4] === "Note") {
    mergeRosterCellphoneIntoNote_(sheet);
  } else if (headers[3] && headers[3] !== "Note" && sheet.getLastRow() >= 2) {
    sheet.getRange(2, 4, sheet.getLastRow() - 1, 1).clearContent();
  } else if (headers[3] === "Note" && lastColumn > ROSTER_HEADERS.length) {
    mergeRosterExtraColumnsIntoNote_(sheet);
  }

  const currentLastColumn = sheet.getLastColumn();
  if (currentLastColumn > ROSTER_HEADERS.length) {
    sheet.deleteColumns(
      ROSTER_HEADERS.length + 1,
      currentLastColumn - ROSTER_HEADERS.length,
    );
  }
}

function mergeRosterCellphoneIntoNote_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
    const mergedNotes = values.map((row) => {
      const cellphone = String(row[3] || "").trim();
      const note = String(row[4] || "").trim();
      if (!cellphone) {
        return [note];
      }
      const phoneNote = `Cell: ${cellphone}`;
      if (!note) {
        return [phoneNote];
      }
      if (note.indexOf(cellphone) !== -1) {
        return [note];
      }
      return [`${note}; ${phoneNote}`];
    });
    sheet.getRange(2, 4, mergedNotes.length, 1).setValues(mergedNotes);
  }

  sheet.getRange(1, 4).setValue("Note");
  sheet.deleteColumn(5);
}

function mergeRosterExtraColumnsIntoNote_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow >= 2 && lastColumn > ROSTER_HEADERS.length) {
    const width = lastColumn - ROSTER_HEADERS.length;
    const values = sheet
      .getRange(2, 4, lastRow - 1, width + 1)
      .getValues();
    const mergedNotes = values.map((row) => {
      const existingNote = String(row[0] || "").trim();
      const extraValues = row
        .slice(1)
        .map((value) => String(value || "").trim())
        .filter(Boolean);
      if (extraValues.length === 0) {
        return [existingNote];
      }
      const extraNote = extraValues.join("; ");
      if (!existingNote) {
        return [extraNote];
      }
      if (extraValues.every((value) => existingNote.indexOf(value) !== -1)) {
        return [existingNote];
      }
      return [`${existingNote}; ${extraNote}`];
    });
    sheet.getRange(2, 4, mergedNotes.length, 1).setValues(mergedNotes);
  }
}

function getRoster_() {
  const sheet = getRosterSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  return sheet
    .getRange(2, 1, lastRow - 1, ROSTER_HEADERS.length)
    .getValues()
    .map((row) => ({
      name: String(row[0] || "").trim(),
      venmo: String(row[1] || "").trim(),
      messenger: String(row[2] || "").trim(),
      note: String(row[3] || "").trim(),
      zelle: String(row[4] || "").trim(),
    }))
    .filter((member) => member.name)
    .sort((first, second) => first.name.localeCompare(second.name));
}

function getRosterNames_() {
  return getRoster_().map((member) => member.name);
}

function getRosterNameSet_() {
  return getRosterNames_().reduce((names, playerName) => {
    names[normalize_(playerName)] = true;
    return names;
  }, {});
}

function findRosterRow_(sheet, playerName) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }

  const normalizedName = normalize_(playerName);
  const rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

  for (let index = 0; index < rows.length; index += 1) {
    if (normalize_(rows[index][0]) === normalizedName) {
      return index + 2;
    }
  }

  return null;
}

function saveRosterMember_(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    requireAdmin_(params);
    const oldName = sanitizeText_(params.oldPlayerName || params.oldName || "");
    const name = sanitizeText_(
      required_(params.playerName || params.name, "Missing player name").trim(),
    );
    const venmo = params.venmo ? normalizeVenmo_(params.venmo) : "";
    const messenger = params.messenger ? normalizeMessenger_(params.messenger) : "";
    const note = sanitizeText_(params.note || "");
    const zelle = normalizeZelle_(params.zelle);
    const sheet = getRosterSheet_();
    const oldRow = oldName ? findRosterRow_(sheet, oldName) : null;
    const row = findRosterRow_(sheet, name);
    const values = [name, venmo, messenger, note, zelle];

    if (oldName && normalize_(oldName) !== normalize_(name)) {
      if (!oldRow) {
        throw new Error("Original roster member was not found");
      }
      if (row) {
        throw new Error("A roster member with the new name already exists");
      }

      sheet.getRange(oldRow, 1, 1, ROSTER_HEADERS.length).setValues([values]);
      const renameCounts = renamePlayerEverywhere_(oldName, name);
      return {
        action: "renamed",
        renameCounts,
        roster: getRoster_(),
      };
    }

    if (row) {
      sheet.getRange(row, 1, 1, ROSTER_HEADERS.length).setValues([values]);
      return {
        action: "updated",
        roster: getRoster_(),
      };
    }

    sheet.appendRow(values);
    return {
      action: "created",
      roster: getRoster_(),
    };
  } finally {
    lock.releaseLock();
  }
}

function completeRosterMemberInfo_(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const name = sanitizeText_(
      required_(params.playerName || params.name, "Missing player name").trim(),
    );
    const sheet = getRosterSheet_();
    const row = findRosterRow_(sheet, name);

    if (!row) {
      throw new Error("Only admins can create new members.");
    }

    const range = sheet.getRange(row, 1, 1, ROSTER_HEADERS.length);
    const values = range.getValues()[0];
    const current = {
      venmo: String(values[1] || "").trim(),
      messenger: String(values[2] || "").trim(),
      note: String(values[3] || "").trim(),
      zelle: String(values[4] || "").trim(),
    };
    const requested = {
      venmo: params.venmo ? normalizeVenmo_(params.venmo) : "",
      messenger: params.messenger ? normalizeMessenger_(params.messenger) : "",
      note: sanitizeText_(params.note || ""),
      zelle: normalizeZelle_(params.zelle),
    };
    const updatedFields = [];

    // Members can update their own info: a non-blank value overrides what is
    // there, and a blank field is ignored (keeps the existing value).
    if (requested.venmo && normalize_(requested.venmo) !== normalize_(current.venmo)) {
      values[1] = requested.venmo;
      updatedFields.push("Venmo");
    }

    if (
      requested.messenger &&
      normalize_(requested.messenger) !== normalize_(current.messenger)
    ) {
      values[2] = requested.messenger;
      updatedFields.push("Facebook profile");
    }

    if (requested.zelle && normalize_(requested.zelle) !== normalize_(current.zelle)) {
      values[4] = requested.zelle;
      updatedFields.push("Zelle");
    }

    if (requested.note && requested.note !== current.note) {
      values[3] = requested.note;
      updatedFields.push("Note");
    }

    if (updatedFields.length === 0) {
      throw new Error("Enter something to update, or leave blank to keep it.");
    }

    range.setValues([values]);
    return {
      action: "completed",
      updatedFields,
      roster: getRoster_(),
    };
  } finally {
    lock.releaseLock();
  }
}

function removeRosterMember_(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const name = required_(params.playerName || params.name, "Missing player name")
      .trim();
    const sheet = getRosterSheet_();
    const row = findRosterRow_(sheet, name);

    if (row) {
      sheet.deleteRow(row);
    }

    return {
      removed: Boolean(row),
      roster: getRoster_(),
    };
  } finally {
    lock.releaseLock();
  }
}

function renamePlayerEverywhere_(oldName, newName) {
  return {
    rsvpRows: renamePlayerInSheetColumn_(getSheet_(), 2, oldName, newName),
    auditRows: renamePlayerInSheetColumn_(getAuditSheet_(), 4, oldName, newName),
    auditExistingRows: renamePlayerInAuditExistingRsvps_(oldName, newName),
    exportRows: renamePlayerInExportSheets_(oldName, newName),
  };
}

function renamePlayerInSheetColumn_(sheet, column, oldName, newName) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return 0;
  }

  const range = sheet.getRange(2, column, lastRow - 1, 1);
  const values = range.getValues();
  let changed = 0;

  values.forEach((row) => {
    if (normalize_(row[0]) === normalize_(oldName)) {
      row[0] = newName;
      changed += 1;
    }
  });

  if (changed > 0) {
    range.setValues(values);
  }

  return changed;
}

function renamePlayerInAuditExistingRsvps_(oldName, newName) {
  const sheet = getAuditSheet_();
  const lastRow = sheet.getLastRow();
  const existingRsvpColumn = 15;

  if (lastRow < 2) {
    return 0;
  }

  const range = sheet.getRange(2, existingRsvpColumn, lastRow - 1, 1);
  const values = range.getValues();
  let changed = 0;

  values.forEach((row) => {
    const existingRsvp = parseAuditExistingRsvp_(row[0]);
    if (
      existingRsvp &&
      normalize_(existingRsvp.playerName) === normalize_(oldName)
    ) {
      existingRsvp.playerName = newName;
      row[0] = JSON.stringify(existingRsvp);
      changed += 1;
    }
  });

  if (changed > 0) {
    range.setValues(values);
  }

  return changed;
}

function renamePlayerInExportSheets_(oldName, newName) {
  try {
    const spreadsheet = SpreadsheetApp.openById(EXPORT_SPREADSHEET_ID);
    return spreadsheet
      .getSheets()
      .reduce(
        (total, sheet) =>
          total + renamePlayerInSheetColumn_(sheet, 1, oldName, newName),
        0,
      );
  } catch (error) {
    console.warn(`Could not update exported roster names: ${error.message}`);
    return 0;
  }
}

function findExistingRow_(sheet, playDate, playerName) {
  const rows = findExistingRows_(sheet, playDate, playerName);
  return rows[0] || null;
}

function findExistingRows_(sheet, playDate, playerName) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const normalizedName = normalize_(playerName);
  const rows = [];

  for (let index = 0; index < data.length; index += 1) {
    const rowDate = normalizeDate_(data[index][0]);
    const rowName = normalize_(data[index][1]);
    if (rowDate === playDate && rowName === normalizedName) {
      rows.push(index + 2);
    }
  }

  return rows;
}

function deleteDuplicateRows_(sheet, rows, keepRow) {
  rows
    .filter((row) => row !== keepRow)
    .sort((first, second) => second - first)
    .forEach((row) => {
      sheet.deleteRow(row);
    });
}

function getRsvpAtRow_(sheet, row) {
  const values = sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0];
  return {
    playDate: normalizeDate_(values[0]),
    playerName: String(values[1] || "").trim(),
    vote: String(values[2] || "").trim(),
    participantCount: clampStoredParticipantCount_(values[3]),
    submittedAt: String(values[4] || ""),
    updatedAt: String(values[5] || ""),
  };
}

function cleanupNonRosterRows_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet_();
    const lastRow = sheet.getLastRow();
    const deletedNames = [];

    if (lastRow < 2) {
      return { deletedCount: 0, deletedNames };
    }

    const rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    const rosterNameSet = getRosterNameSet_();

    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const playerName = String(rows[index][1] || "").trim();
      if (!isRosterPlayer_(playerName, rosterNameSet)) {
        deletedNames.push(playerName || "(blank)");
        sheet.deleteRow(index + 2);
      }
    }

    return {
      deletedCount: deletedNames.length,
      deletedNames,
    };
  } finally {
    lock.releaseLock();
  }
}

function resetRsvpDataForProduction() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet_();
    const lastRow = sheet.getLastRow();

    if (lastRow > 1) {
      sheet.deleteRows(2, lastRow - 1);
    }

    if (sheet.getLastColumn() > HEADERS.length) {
      sheet.deleteColumns(
        HEADERS.length + 1,
        sheet.getLastColumn() - HEADERS.length,
      );
    }

    return {
      clearedRows: Math.max(0, lastRow - 1),
    };
  } finally {
    lock.releaseLock();
  }
}

function getBillingMonth_(month, includeDiagnostics) {
  validateMonth_(month);

  const billing = {
    month,
    attendance: getBillingAttendance_(month),
    courtBlocks: getBillingCourtBlocks_(month),
    birdieInventory: getBillingBirdieInventory_(month),
    birdiePurchases: getBillingBirdiePurchases_(month),
    payments: getBillingPayments_(month),
    adjustments: getBillingAdjustments_(month),
    monthStatus: getBillingMonthStatus_(month),
  };

  if (includeDiagnostics) {
    billing.diagnostics = getBillingDiagnostics_(month);
  }

  return billing;
}

function getBillingMonths_(includeEditable) {
  const currentMonth = getCurrentMonth_();
  const monthSet = {};
  const billableMonthSet = {};
  const sheet = getBillingBirdiePurchaseSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow >= 2) {
    sheet
      .getRange(2, 1, lastRow - 1, BILLING_BIRDIE_PURCHASE_HEADERS.length)
      .getValues()
      .forEach((row) => {
        const month = normalizeMonth_(row[1]);
        const recordType = normalizeBirdieRecordType_(row[11] || "purchase");
        if (
          month &&
          month < currentMonth &&
          recordType === "usage" &&
          normalizeBillingStatus_(row[6] || "active") === "active"
        ) {
          monthSet[month] = true;
          billableMonthSet[month] = true;
        } else if (includeEditable && month && month <= currentMonth) {
          monthSet[month] = true;
        }
      });
  }

  if (includeEditable) {
    addBillingMonthsFromSheet_(monthSet, getSheet_(), 1, currentMonth, true);
    addBillingMonthsFromSheet_(
      monthSet,
      getBillingCourtSheet_(),
      2,
      currentMonth,
      false,
    );
    addBillingMonthsFromSheet_(
      monthSet,
      getBillingPaymentSheet_(),
      1,
      currentMonth,
      false,
    );
    addBillingMonthsFromSheet_(
      monthSet,
      getBillingMonthStatusSheet_(),
      1,
      currentMonth,
      false,
    );
  }

  return Object.keys(monthSet)
    .sort()
    .map((month) => {
      if (includeEditable) {
        return {
          month,
          label: formatMonthLabel_(month),
          playerCount: 0,
          allPaid: false,
          billable: Boolean(billableMonthSet[month]),
        };
      }

      const attendancePlayers = getBillingAttendancePlayers_(month);
      const paidPlayers = getPaidBillingPlayers_(month);
      const allPaid =
        attendancePlayers.length > 0 &&
        attendancePlayers.every((playerName) => paidPlayers[normalize_(playerName)]);
      return {
        month,
        label: formatMonthLabel_(month),
        playerCount: attendancePlayers.length,
        allPaid,
        billable: Boolean(billableMonthSet[month]),
      };
    });
}

function addBillingMonthsFromSheet_(
  monthSet,
  sheet,
  monthColumn,
  currentMonth,
  valueIsDate,
) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return;
  }

  sheet
    .getRange(2, monthColumn, lastRow - 1, 1)
    .getValues()
    .forEach((row) => {
      const month = valueIsDate
        ? normalizeMonth_(normalizeDate_(row[0]))
        : normalizeMonth_(row[0]);
      if (month && month <= currentMonth) {
        monthSet[month] = true;
      }
    });
}

function getBillingAttendancePlayers_(month) {
  return getBillingAttendance_(month)
    .reduce((players, day) => players.concat(day.players.map((player) => player.name)), [])
    .filter((playerName, index, players) => {
      const normalizedName = normalize_(playerName);
      return players.findIndex((candidate) => normalize_(candidate) === normalizedName) === index;
    });
}

function getPaidBillingPlayers_(month) {
  return getBillingPayments_(month).reduce((paidPlayers, payment) => {
    if (normalize_(payment.status) === "paid") {
      paidPlayers[normalize_(payment.playerName)] = true;
    }
    return paidPlayers;
  }, {});
}

function markBillingMonthPaid_(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const month = required_(params.month, "Missing billing month");
    validateMonth_(month);
    const sheet = getBillingPaymentSheet_();
    const actor = getBillingActor_(params);
    const now = new Date().toISOString();
    const players = getBillingAttendancePlayers_(month);

    players.forEach((playerName) => {
      const row = findBillingPaymentRow_(sheet, month, playerName);
      const existing = row
        ? sheet.getRange(row, 1, 1, BILLING_PAYMENT_HEADERS.length).getValues()[0]
        : [];
      const values = [
        month,
        playerName,
        "Paid",
        now,
        actor,
        String(existing[5] || ""),
        existing[6] || "",
        String(existing[7] || ""),
        String(existing[8] || ""),
        String(existing[9] || ""),
        String(existing[10] || ""),
        String(existing[11] || ""),
        String(existing[12] || ""),
      ];

      if (row) {
        sheet.getRange(row, 1, 1, values.length).setValues([values]);
      } else {
        sheet.appendRow(values);
      }
    });

    return getBillingMonth_(month);
  } finally {
    lock.releaseLock();
  }
}

function getBillingDiagnostics_(month) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return {
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    filters: {
      month,
    },
    sheets: {
      rsvps: getBillingSheetDiagnostics_(
        spreadsheet,
        SHEET_NAME,
        HEADERS,
        (row) => normalizeDate_(row[0]).indexOf(`${month}-`) === 0,
        month,
        1,
      ),
      courtBlocks: getBillingSheetDiagnostics_(
        spreadsheet,
        BILLING_COURT_SHEET_NAME,
        BILLING_COURT_HEADERS,
        (row) => normalizeMonth_(row[1]) === month,
        month,
        2,
      ),
      birdiePurchases: getBillingSheetDiagnostics_(
        spreadsheet,
        BILLING_BIRDIE_PURCHASE_SHEET_NAME,
        BILLING_BIRDIE_PURCHASE_HEADERS,
        (row) => {
          const rowMonth = normalizeMonth_(row[1]);
          return (
            rowMonth &&
            rowMonth <= month &&
            normalizeBirdieRecordType_(row[11] || "purchase") !== "inventory"
          );
        },
        month,
        2,
        getBillingBirdieRecordTypeCounts_,
      ),
      payments: getBillingSheetDiagnostics_(
        spreadsheet,
        BILLING_PAYMENT_SHEET_NAME,
        BILLING_PAYMENT_HEADERS,
        (row) => normalizeMonth_(row[0]) === month,
        month,
        1,
      ),
      monthStatus: getBillingSheetDiagnostics_(
        spreadsheet,
        BILLING_MONTH_STATUS_SHEET_NAME,
        BILLING_MONTH_STATUS_HEADERS,
        (row) => normalizeMonth_(row[0]) === month,
        month,
        1,
      ),
    },
  };
}

function getBillingSheetDiagnostics_(
  spreadsheet,
  sheetName,
  headers,
  matchesBillingRead,
  targetMonth,
  monthColumn,
  buildExtra,
) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    return {
      exists: false,
      sheetName,
    };
  }

  const width = Math.max(sheet.getLastColumn(), headers.length);
  const lastRow = sheet.getLastRow();
  const header =
    lastRow >= 1
      ? sheet.getRange(1, 1, 1, width).getDisplayValues()[0]
      : [];
  const rawRows =
    lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, width).getValues() : [];
  const displayRows =
    lastRow >= 2
      ? sheet.getRange(2, 1, lastRow - 1, width).getDisplayValues()
      : [];
  const monthIndexes = [];
  const matchingIndexes = [];

  rawRows.forEach((row, index) => {
    if (monthColumn && normalizeMonth_(row[monthColumn - 1]) === targetMonth) {
      monthIndexes.push(index);
    }
    if (matchesBillingRead(row)) {
      matchingIndexes.push(index);
    }
  });

  const result = {
    exists: true,
    sheetName,
    sheetId: sheet.getSheetId(),
    lastRow,
    lastColumn: sheet.getLastColumn(),
    dataRows: Math.max(0, lastRow - 1),
    header: header.slice(0, headers.length),
    monthRows: monthIndexes.length,
    matchingRows: matchingIndexes.length,
    sampleRows: matchingIndexes
      .slice(0, 5)
      .map((index) => displayRows[index].slice(0, headers.length)),
  };

  if (buildExtra) {
    result.extra = buildExtra(rawRows, monthIndexes, matchingIndexes);
  }

  return result;
}

function getBillingBirdieRecordTypeCounts_(rows, monthIndexes, matchingIndexes) {
  const counts = {
    monthRecordTypes: {},
    matchingRecordTypes: {},
  };

  monthIndexes.forEach((index) => {
    const type = normalizeBirdieRecordType_(rows[index][11] || "purchase");
    counts.monthRecordTypes[type] = Number(counts.monthRecordTypes[type] || 0) + 1;
  });
  matchingIndexes.forEach((index) => {
    const type = normalizeBirdieRecordType_(rows[index][11] || "purchase");
    counts.matchingRecordTypes[type] =
      Number(counts.matchingRecordTypes[type] || 0) + 1;
  });

  return counts;
}

function saveBillingCourtBlock_(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const month = required_(params.month, "Missing billing month");
    validateMonth_(month);
    const date = normalizeDate_(required_(params.date, "Missing court date"));
    const startTime = normalizeTime_(required_(params.startTime, "Missing start time"));
    const durationHours = parsePositiveNumber_(
      required_(params.durationHours, "Missing duration"),
      "Duration must be a positive number",
    );
    const courts = parsePositiveNumber_(
      required_(params.courts, "Missing court count"),
      "Courts must be a positive number",
    );
    const amount = parseMoneyNumber_(
      required_(params.amount, "Missing court amount"),
      "Amount must be a number",
    );
    const paidBy = sanitizeText_(String(params.paidBy || "").trim());
    if (paidBy) {
      validatePlayerName_(paidBy);
    }

    const sheet = getBillingCourtSheet_();
    const id = sanitizeText_(params.id || Utilities.getUuid());
    const row = findBillingRowById_(sheet, id);
    const now = new Date().toISOString();
    const existing = row
      ? sheet.getRange(row, 1, 1, BILLING_COURT_HEADERS.length).getValues()[0]
      : null;
    const createdAt = existing ? String(existing[10] || now) : now;
    const createdBy = existing ? String(existing[12] || "") : getBillingActor_(params);
    const values = [
      id,
      month,
      date,
      startTime,
      durationHours,
      courts,
      amount,
      paidBy,
      normalizeBillingStatus_(params.status || "active"),
      sanitizeText_(params.source || "Manual"),
      createdAt,
      now,
      createdBy,
      getBillingActor_(params),
    ];

    if (row) {
      sheet.getRange(row, 1, 1, values.length).setValues([values]);
    } else {
      sheet.appendRow(values);
    }

    return billingCourtRowToBlock_(values);
  } finally {
    lock.releaseLock();
  }
}

function toggleBillingCourtBlock_(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const month = required_(params.month, "Missing billing month");
    validateMonth_(month);
    const id = required_(params.id, "Missing court block id");
    const sheet = getBillingCourtSheet_();
    const row = findBillingRowById_(sheet, id);

    if (!row) {
      throw new Error("Court block was not found");
    }

    const status = normalizeBillingStatus_(
      params.status ||
        (normalize_(sheet.getRange(row, 9).getValue()) === "active"
          ? "canceled"
          : "active"),
    );
    sheet.getRange(row, 9).setValue(status);
    sheet.getRange(row, 12).setValue(new Date().toISOString());
    sheet.getRange(row, 14).setValue(getBillingActor_(params));

    return billingCourtRowToBlock_(
      sheet.getRange(row, 1, 1, BILLING_COURT_HEADERS.length).getValues()[0],
    );
  } finally {
    lock.releaseLock();
  }
}

function saveBillingBirdieInventory_(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const month = required_(params.month, "Missing billing month");
    validateMonth_(month);
    const sheet = getBillingBirdiePurchaseSheet_();
    const id = `inventory-${month}`;
    const row = findBillingBirdieInventoryRow_(sheet, month);
    const now = new Date().toISOString();
    const existing = row
      ? sheet.getRange(row, 1, 1, BILLING_BIRDIE_PURCHASE_HEADERS.length).getValues()[0]
      : null;
    const values = [
      id,
      month,
      "",
      0,
      0,
      "",
      "active",
      existing ? String(existing[7] || now) : now,
      now,
      existing ? String(existing[9] || "") : getBillingActor_(params),
      getBillingActor_(params),
      "inventory",
      parseNonNegativeNumber_(params.startTubes || 0, "Start tubes must be a number"),
      parseNonNegativeNumber_(params.endTubes || 0, "End tubes must be a number"),
      now,
      getBillingActor_(params),
    ];

    if (row) {
      sheet.getRange(row, 1, 1, values.length).setValues([values]);
    } else {
      sheet.appendRow(values);
    }

    return getBillingMonth_(month);
  } finally {
    lock.releaseLock();
  }
}

function saveBillingBirdiePurchase_(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const month = required_(params.month, "Missing billing month");
    validateMonth_(month);
    const id = sanitizeText_(params.id || Utilities.getUuid());
    const date = normalizeDate_(required_(params.date, "Missing purchase date"));
    const tubes = parseNonNegativeNumber_(
      params.tubes || 0,
      "Tubes must be a number",
    );
    const amount = parseMoneyNumber_(
      required_(params.amount, "Missing birdie amount"),
      "Amount must be a number",
    );
    const paidBy = sanitizeText_(String(params.paidBy || "").trim());
    if (paidBy) {
      validatePlayerName_(paidBy);
    }

    const sheet = getBillingBirdiePurchaseSheet_();
    const row = findBillingRowById_(sheet, id);
    const now = new Date().toISOString();
    const existing = row
      ? sheet.getRange(row, 1, 1, BILLING_BIRDIE_PURCHASE_HEADERS.length).getValues()[0]
      : null;
    const values = [
      id,
      month,
      date,
      tubes,
      amount,
      paidBy,
      normalizeBillingStatus_(params.status || "active"),
      existing ? String(existing[7] || now) : now,
      now,
      existing ? String(existing[9] || "") : getBillingActor_(params),
      getBillingActor_(params),
      normalizeBirdieRecordType_(params.recordType || "purchase"),
      existing ? Number(existing[12] || 0) : 0,
      existing ? Number(existing[13] || 0) : 0,
      existing ? String(existing[14] || "") : "",
      existing ? String(existing[15] || "") : "",
      parseOptionalMoneyNumber_(params.unitPrice, amount, tubes),
      sanitizeText_(params.batch || params.source || ""),
    ];

    if (row) {
      sheet.getRange(row, 1, 1, values.length).setValues([values]);
    } else {
      sheet.appendRow(values);
    }

    return getBillingMonth_(month);
  } finally {
    lock.releaseLock();
  }
}

function removeBillingBirdiePurchase_(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const month = required_(params.month, "Missing billing month");
    validateMonth_(month);
    const id = required_(params.id, "Missing birdie purchase id");
    const sheet = getBillingBirdiePurchaseSheet_();
    const row = findBillingRowById_(sheet, id);

    if (row) {
      sheet.getRange(row, 7).setValue("canceled");
      sheet.getRange(row, 9).setValue(new Date().toISOString());
      sheet.getRange(row, 11).setValue(getBillingActor_(params));
    }

    if (!row) {
      throw new Error("Birdie row was not found");
    }

    return billingBirdiePurchaseRowToPurchase_(
      sheet.getRange(row, 1, 1, BILLING_BIRDIE_PURCHASE_HEADERS.length).getValues()[0],
    );
  } finally {
    lock.releaseLock();
  }
}

function saveBillingPaymentStatus_(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const month = required_(params.month, "Missing billing month");
    validateMonth_(month);
    const playerName = sanitizeText_(
      required_(params.playerName, "Missing player name").trim(),
    );
    validatePlayerName_(playerName);
    const status = sanitizeText_(required_(params.status, "Missing status"));
    const sheet = getBillingPaymentSheet_();
    const row = findBillingPaymentRow_(sheet, month, playerName);
    const existing = row
      ? sheet.getRange(row, 1, 1, BILLING_PAYMENT_HEADERS.length).getValues()[0]
      : [];
    const values = [
      month,
      playerName,
      status,
      new Date().toISOString(),
      getBillingActor_(params),
      String(existing[5] || ""),
      existing[6] || "",
      String(existing[7] || ""),
      String(existing[8] || ""),
      String(existing[9] || ""),
      String(existing[10] || ""),
      String(existing[11] || ""),
      String(existing[12] || ""),
    ];

    if (row) {
      sheet.getRange(row, 1, 1, values.length).setValues([values]);
    } else {
      sheet.appendRow(values);
    }

    return billingPaymentRowToPayment_(values);
  } finally {
    lock.releaseLock();
  }
}

function saveBillingMonthStatus_(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const month = required_(params.month, "Missing billing month");
    validateMonth_(month);
    const status = normalizeBillingMonthStatus_(
      required_(params.status, "Missing billing status"),
    );
    const sheet = getBillingMonthStatusSheet_();
    const row = findBillingMonthRow_(sheet, month);
    const values = [
      month,
      status,
      sanitizeText_(params.note || ""),
      new Date().toISOString(),
      getBillingActor_(params),
    ];

    if (row) {
      sheet.getRange(row, 1, 1, values.length).setValues([values]);
    } else {
      sheet.appendRow(values);
    }

    return billingMonthStatusRowToStatus_(values);
  } finally {
    lock.releaseLock();
  }
}

function saveBillingAdjustment_(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const month = required_(params.month, "Missing billing month");
    validateMonth_(month);
    const id = sanitizeText_(params.id || Utilities.getUuid());
    const playerName = sanitizeText_(
      required_(params.playerName, "Missing player name").trim(),
    );
    validatePlayerName_(playerName);
    const amount = parseSignedMoneyNumber_(
      required_(params.amount, "Missing adjustment amount"),
      "Adjustment amount must be a number",
    );
    const sheet = getBillingPaymentSheet_();
    const row =
      findBillingPaymentAdjustmentRow_(sheet, month, id) ||
      findBillingPaymentRow_(sheet, month, playerName);
    const now = new Date().toISOString();
    const existing = row
      ? sheet.getRange(row, 1, 1, BILLING_PAYMENT_HEADERS.length).getValues()[0]
      : null;
    const values = [
      month,
      playerName,
      existing ? String(existing[2] || "Not requested") : "Not requested",
      existing ? String(existing[3] || now) : now,
      existing ? String(existing[4] || getBillingActor_(params)) : getBillingActor_(params),
      id,
      amount,
      sanitizeText_(params.note || ""),
      normalizeBillingStatus_(params.status || "active"),
      existing ? String(existing[9] || now) : now,
      now,
      existing ? String(existing[11] || "") : getBillingActor_(params),
      getBillingActor_(params),
    ];

    if (row) {
      sheet.getRange(row, 1, 1, values.length).setValues([values]);
    } else {
      sheet.appendRow(values);
    }

    return billingPaymentRowToAdjustment_(values);
  } finally {
    lock.releaseLock();
  }
}

function removeBillingAdjustment_(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const month = required_(params.month, "Missing billing month");
    validateMonth_(month);
    const id = required_(params.id, "Missing adjustment id");
    const sheet = getBillingPaymentSheet_();
    const row = findBillingPaymentAdjustmentRow_(sheet, month, id);

    if (row) {
      sheet.getRange(row, 9).setValue("canceled");
      sheet.getRange(row, 11).setValue(new Date().toISOString());
      sheet.getRange(row, 13).setValue(getBillingActor_(params));
    }

    if (!row) {
      throw new Error("Adjustment was not found");
    }

    return billingPaymentRowToAdjustment_(
      sheet.getRange(row, 1, 1, BILLING_PAYMENT_HEADERS.length).getValues()[0],
    );
  } finally {
    lock.releaseLock();
  }
}

function getBillingAttendance_(month) {
  validateMonth_(month);
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  const rosterNameSet = getRosterNameSet_();
  const byDate = {};

  if (lastRow >= 2) {
    const rows = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    rows.forEach((row) => {
      const date = normalizeDate_(row[0]);
      const playerName = String(row[1] || "").trim();
      const vote = normalize_(row[2]);
      const participantCount = clampStoredParticipantCount_(row[3]);

      if (
        date.indexOf(`${month}-`) !== 0 ||
        vote !== "yes" ||
        !isRosterPlayer_(playerName, rosterNameSet)
      ) {
        return;
      }

      if (!byDate[date]) {
        byDate[date] = {};
      }
      const key = normalize_(playerName);
      byDate[date][key] = {
        name: playerName,
        spots: Number(byDate[date][key]?.spots || 0) + participantCount,
      };
    });
  }

  return Object.keys(byDate)
    .sort()
    .map((date) => ({
      date,
      players: Object.keys(byDate[date])
        .map((key) => byDate[date][key])
        .sort((first, second) => first.name.localeCompare(second.name)),
    }));
}

function getBillingCourtBlocks_(month) {
  const sheet = getBillingCourtSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  return sheet
    .getRange(2, 1, lastRow - 1, BILLING_COURT_HEADERS.length)
    .getValues()
    .filter((row) => normalizeMonth_(row[1]) === month)
    .map(billingCourtRowToBlock_);
}

function getBillingBirdieInventory_(month) {
  const purchaseSheet = getBillingBirdiePurchaseSheet_();
  const purchaseRow = findBillingBirdieInventoryRow_(purchaseSheet, month);
  if (purchaseRow) {
    const values = purchaseSheet
      .getRange(purchaseRow, 1, 1, BILLING_BIRDIE_PURCHASE_HEADERS.length)
      .getValues()[0];
    return {
      startTubes: parseStoredNumber_(values[12]),
      endTubes: parseStoredNumber_(values[13]),
    };
  }

  const legacySheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(BILLING_BIRDIE_INVENTORY_SHEET_NAME);
  if (!legacySheet) {
    return {
      startTubes: 0,
      endTubes: 0,
    };
  }
  const legacyRow = findBillingMonthRow_(legacySheet, month);
  if (!legacyRow) {
    return {
      startTubes: 0,
      endTubes: 0,
    };
  }

  const values = legacySheet
    .getRange(legacyRow, 1, 1, BILLING_BIRDIE_INVENTORY_HEADERS.length)
    .getValues()[0];
  return {
    startTubes: parseStoredNumber_(values[1]),
    endTubes: parseStoredNumber_(values[2]),
  };
}

function getBillingBirdiePurchases_(month) {
  const sheet = getBillingBirdiePurchaseSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  return sheet
    .getRange(2, 1, lastRow - 1, BILLING_BIRDIE_PURCHASE_HEADERS.length)
    .getValues()
    .filter((row) => {
      const rowMonth = normalizeMonth_(row[1]);
      return rowMonth && rowMonth <= month;
    })
    .filter((row) => normalizeBirdieRecordType_(row[11] || "purchase") !== "inventory")
    .map(billingBirdiePurchaseRowToPurchase_);
}

function getBillingPayments_(month) {
  const sheet = getBillingPaymentSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  return sheet
    .getRange(2, 1, lastRow - 1, BILLING_PAYMENT_HEADERS.length)
    .getValues()
    .filter((row) => normalizeMonth_(row[0]) === month)
    .map(billingPaymentRowToPayment_);
}

function getBillingAdjustments_(month) {
  const paymentSheet = getBillingPaymentSheet_();
  const paymentLastRow = paymentSheet.getLastRow();
  const adjustments = [];

  if (paymentLastRow >= 2) {
    paymentSheet
      .getRange(2, 1, paymentLastRow - 1, BILLING_PAYMENT_HEADERS.length)
      .getValues()
      .filter((row) => normalizeMonth_(row[0]) === month)
      .filter((row) => String(row[5] || ""))
      .forEach((row) => {
        adjustments.push(billingPaymentRowToAdjustment_(row));
      });
  }

  const legacySheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(BILLING_ADJUSTMENT_SHEET_NAME);
  if (!legacySheet) {
    return adjustments;
  }
  const legacyLastRow = legacySheet.getLastRow();
  if (legacyLastRow < 2) {
    return adjustments;
  }

  legacySheet
    .getRange(2, 1, legacyLastRow - 1, BILLING_ADJUSTMENT_HEADERS.length)
    .getValues()
    .filter((row) => normalizeMonth_(row[1]) === month)
    .forEach((row) => {
      const id = String(row[0] || "");
      if (adjustments.some((adjustment) => adjustment.id === id)) {
        return;
      }
      adjustments.push({
        id,
        playerName: String(row[2] || ""),
        amount: parseStoredNumber_(row[3]),
        note: String(row[4] || ""),
        status: normalizeBillingStatus_(row[5] || "active"),
      });
    });

  return adjustments;
}

function getBillingMonthStatus_(month) {
  const sheet = getBillingMonthStatusSheet_();
  const row = findBillingMonthRow_(sheet, month);
  if (!row) {
    return {
      status: "draft",
      note: "",
      updatedAt: "",
      updatedBy: "",
    };
  }

  const values = sheet
    .getRange(row, 1, 1, BILLING_MONTH_STATUS_HEADERS.length)
    .getValues()[0];
  return billingMonthStatusRowToStatus_(values);
}

function billingCourtRowToBlock_(row) {
  return {
    id: String(row[0] || ""),
    date: normalizeDate_(row[2]),
    startTime: normalizeTimeValue_(row[3]),
    durationHours: parseStoredNumber_(row[4]),
    courts: parseStoredNumber_(row[5]),
    amount: parseStoredNumber_(row[6]),
    paidBy: String(row[7] || ""),
    status: normalizeBillingStatus_(row[8] || "active"),
    source: String(row[9] || "Manual"),
  };
}

function billingBirdiePurchaseRowToPurchase_(row) {
  return {
    id: String(row[0] || ""),
    date: normalizeDate_(row[2]),
    tubes: parseStoredNumber_(row[3]),
    amount: parseStoredNumber_(row[4]),
    paidBy: String(row[5] || ""),
    status: normalizeBillingStatus_(row[6] || "active"),
    recordType: normalizeBirdieRecordType_(row[11] || "purchase"),
    unitPrice: parseStoredNumber_(row[16]),
    batch: String(row[17] || ""),
  };
}

function billingPaymentRowToPayment_(row) {
  return {
    playerName: String(row[1] || ""),
    status: String(row[2] || ""),
  };
}

function billingPaymentRowToAdjustment_(row) {
  return {
    id: String(row[5] || ""),
    playerName: String(row[1] || ""),
    amount: parseStoredNumber_(row[6]),
    note: String(row[7] || ""),
    status: normalizeBillingStatus_(row[8] || "active"),
  };
}

function billingMonthStatusRowToStatus_(row) {
  return {
    status: normalizeBillingMonthStatus_(row[1] || "draft"),
    note: String(row[2] || ""),
    updatedAt: formatAuditValue_(row[3]),
    updatedBy: String(row[4] || ""),
  };
}

function getBillingCourtSheet_() {
  const sheet = getBillingSheet_(BILLING_COURT_SHEET_NAME, BILLING_COURT_HEADERS);
  formatBillingMonthColumn_(sheet, 2);
  return sheet;
}

function getBillingBirdiePurchaseSheet_() {
  const sheet = getBillingSheet_(
    BILLING_BIRDIE_PURCHASE_SHEET_NAME,
    BILLING_BIRDIE_PURCHASE_HEADERS,
  );
  formatBillingMonthColumn_(sheet, 2);
  return sheet;
}

function getBillingPaymentSheet_() {
  const sheet = getBillingSheet_(BILLING_PAYMENT_SHEET_NAME, BILLING_PAYMENT_HEADERS);
  formatBillingMonthColumn_(sheet, 1);
  return sheet;
}

function getBillingMonthStatusSheet_() {
  const sheet = getBillingSheet_(
    BILLING_MONTH_STATUS_SHEET_NAME,
    BILLING_MONTH_STATUS_HEADERS,
  );
  formatBillingMonthColumn_(sheet, 1);
  return sheet;
}

function formatBillingMonthColumn_(sheet, column) {
  sheet.getRange(1, column, sheet.getMaxRows(), 1).setNumberFormat("@");
}

function getBillingSheet_(name, headers) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(name);

  if (!sheet) {
    try {
      sheet = spreadsheet.insertSheet(name);
    } catch (error) {
      sheet = spreadsheet.getSheetByName(name);
      if (!sheet) {
        throw error;
      }
    }
  }

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  const currentHeaders = headerRange.getValues()[0];
  const needsHeaders = headers.some(
    (header, index) => currentHeaders[index] !== header,
  );

  if (needsHeaders) {
    headerRange.setValues([headers]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function findBillingRowById_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let index = 0; index < rows.length; index += 1) {
    if (String(rows[index][0] || "") === String(id || "")) {
      return index + 2;
    }
  }
  return null;
}

function findBillingMonthRow_(sheet, month) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let index = 0; index < rows.length; index += 1) {
    if (normalizeMonth_(rows[index][0]) === month) {
      return index + 2;
    }
  }
  return null;
}

function findBillingBirdieInventoryRow_(sheet, month) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }

  const rows = sheet
    .getRange(2, 1, lastRow - 1, BILLING_BIRDIE_PURCHASE_HEADERS.length)
    .getValues();
  const inventoryId = `inventory-${month}`;
  for (let index = 0; index < rows.length; index += 1) {
    if (
      String(rows[index][0] || "") === inventoryId ||
      (normalizeMonth_(rows[index][1]) === month &&
        normalize_(rows[index][11] || "") === "inventory")
    ) {
      return index + 2;
    }
  }
  return null;
}

function findBillingPaymentRow_(sheet, month, playerName) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (let index = 0; index < rows.length; index += 1) {
    if (
      normalizeMonth_(rows[index][0]) === month &&
      normalize_(rows[index][1]) === normalize_(playerName)
    ) {
      return index + 2;
    }
  }
  return null;
}

function findBillingPaymentAdjustmentRow_(sheet, month, adjustmentId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  for (let index = 0; index < rows.length; index += 1) {
    if (
      normalizeMonth_(rows[index][0]) === month &&
      String(rows[index][5] || "") === String(adjustmentId || "")
    ) {
      return index + 2;
    }
  }
  return null;
}

function getBillingActor_(params) {
  return sanitizeText_(params.actor || params.playerName || params.paidBy || "admin");
}

function normalizeTime_(value) {
  const text = String(value || "").trim();
  if (!/^\d{2}:\d{2}$/.test(text)) {
    throw new Error("Time must use HH:MM format");
  }
  return text;
}

function normalizeTimeValue_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "HH:mm");
  }

  const text = String(value || "").trim();
  const shortTime = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (shortTime) {
    return `${String(shortTime[1]).padStart(2, "0")}:${shortTime[2]}`;
  }

  const dateText = new Date(text);
  if (!isNaN(dateText)) {
    return Utilities.formatDate(dateText, Session.getScriptTimeZone(), "HH:mm");
  }

  return text;
}

function normalizeBillingStatus_(value) {
  return normalize_(value) === "canceled" ? "canceled" : "active";
}

function normalizeBirdieRecordType_(value) {
  const type = normalize_(value).replace(/-/g, "_");
  if (type === "inventory" || type === "inventory_purchase" || type === "usage") {
    return type;
  }
  return "purchase";
}

function normalizeBillingMonthStatus_(value) {
  return normalize_(value) === "finalized" ? "finalized" : "draft";
}

function parsePositiveNumber_(value, message) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(message);
  }
  return number;
}

function parseNonNegativeNumber_(value, message) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(message);
  }
  return number;
}

function parseMoneyNumber_(value, message) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(message);
  }
  return Math.round(number * 100) / 100;
}

function parseOptionalMoneyNumber_(value, amount, quantity) {
  const text = String(value || "").trim();
  if (text) {
    return parseMoneyNumber_(text, "Unit price must be a number");
  }

  const count = Number(quantity || 0);
  if (count > 0) {
    return Math.round((Number(amount || 0) / count) * 100) / 100;
  }
  return 0;
}

function parseSignedMoneyNumber_(value, message) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(message);
  }
  return Math.round(number * 100) / 100;
}

function parseStoredNumber_(value) {
  if (value instanceof Date) {
    return 0;
  }

  const number =
    typeof value === "number"
      ? value
      : Number(String(value || "").replace(/[$,]/g, "").trim());

  return Number.isFinite(number) ? number : 0;
}

function exportMonthRoster_(month) {
  validateMonth_(month);

  const sourceSheet = getSheet_();
  const targetSpreadsheet = SpreadsheetApp.openById(EXPORT_SPREADSHEET_ID);
  const exportSheetName = formatMonthTabName_(month);
  let exportSheet = targetSpreadsheet.getSheetByName(exportSheetName);

  if (exportSheet) {
    resetExportSheet_(exportSheet);
  } else {
    exportSheet = targetSpreadsheet.insertSheet(exportSheetName);
  }

  const matrix = buildMonthRosterMatrix_(sourceSheet, month);

  exportSheet
    .getRange(1, 1, matrix.length, matrix[0].length)
    .setValues(matrix);
  exportSheet.setFrozenRows(1);
  exportSheet.setFrozenColumns(1);
  exportSheet.getRange(1, 1, 1, matrix[0].length).setFontWeight("bold");
  exportSheet.getRange(1, 1, matrix.length, 1).setFontWeight("bold");
  if (matrix.length > 1 && matrix[0].length > 1) {
    exportSheet
      .getRange(2, 2, matrix.length - 1, matrix[0].length - 1)
      .setNumberFormat("0");
  }
  exportSheet.autoResizeColumns(1, exportSheet.getLastColumn());
  SpreadsheetApp.flush();

  return {
    sheetName: exportSheetName,
    exportedDates: Math.max(0, matrix[0].length - 1),
    previewRows: getPreviewRows_(exportSheet),
    url: `${targetSpreadsheet.getUrl()}#gid=${exportSheet.getSheetId()}`,
  };
}

function buildMonthRosterMatrix_(sourceSheet, month) {
  const totalsByDate = {};
  const monthDates = getExportDatesForMonth_(sourceSheet, month).filter((date) => {
    totalsByDate[date] = getRsvpTotalsByPlayerForDate_(sourceSheet, date);
    return getTotalParticipants_(totalsByDate[date]) >= EXPORT_MIN_PARTICIPANTS;
  });
  const header = ["Name"].concat(monthDates.map((date) => formatDisplayDate_(date)));

  return [header].concat(
    getRosterNames_().map((player) => {
      const normalizedPlayer = normalize_(player);
      return [player].concat(
        monthDates.map((date) => {
          const total = totalsByDate[date][normalizedPlayer];
          return total ? Math.trunc(total) : "";
        }),
      );
    }),
  );
}

function resetExportSheet_(sheet) {
  sheet.clear();
  sheet.setFrozenRows(0);
  sheet.setFrozenColumns(0);
}

function viewMonthRoster_(month) {
  validateMonth_(month);

  const sourceSheet = getSheet_();
  const targetSpreadsheet = SpreadsheetApp.openById(EXPORT_SPREADSHEET_ID);
  const exportSheetName = formatMonthTabName_(month);
  const exportSheet = targetSpreadsheet.getSheetByName(exportSheetName);
  const currentDates = getCurrentExportDatesForMonth_(sourceSheet, month);

  if (exportSheet) {
    const savedRows = getPreviewRows_(exportSheet);
    const savedDates = getPreviewDateHeaders_(savedRows);
    const missingDates = getMissingDates_(currentDates, savedDates);

    if (missingDates.length === 0) {
      return {
        sheetName: exportSheetName,
        exportedDates: savedDates.length,
        previewRows: savedRows,
        url: `${targetSpreadsheet.getUrl()}#gid=${exportSheet.getSheetId()}`,
        isStale: false,
      };
    }

    const liveRows = trimEmptyEdges_(buildMonthRosterMatrix_(sourceSheet, month));
    return {
      sheetName: `${exportSheetName} live preview`,
      exportedDates: liveRows.length > 0 ? Math.max(0, liveRows[0].length - 1) : 0,
      previewRows: liveRows,
      url: `${targetSpreadsheet.getUrl()}#gid=${exportSheet.getSheetId()}`,
      isStale: true,
      staleMessage: `Saved report is missing ${missingDates
        .map(formatDisplayDate_)
        .join(", ")}. Showing live preview; admin should recreate the latest report.`,
    };
  }

  const previewRows = trimEmptyEdges_(buildMonthRosterMatrix_(sourceSheet, month));

  return {
    sheetName: `${exportSheetName} live preview`,
    exportedDates: previewRows.length > 0 ? Math.max(0, previewRows[0].length - 1) : 0,
    previewRows,
    url: "",
    isStale: false,
  };
}

function getPreviewRows_(sheet) {
  const lastRow = Math.min(sheet.getLastRow(), PREVIEW_MAX_ROWS);
  const lastColumn = Math.min(sheet.getLastColumn(), PREVIEW_MAX_COLUMNS);

  if (lastRow < 1 || lastColumn < 1) {
    return [];
  }

  const values = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
  return trimEmptyEdges_(values);
}

function trimEmptyEdges_(values) {
  let lastRow = values.length - 1;
  let lastColumn = values.reduce((maxColumn, row) => {
    for (let index = row.length - 1; index >= 0; index -= 1) {
      if (String(row[index] || "").trim()) {
        return Math.max(maxColumn, index);
      }
    }
    return maxColumn;
  }, 0);

  while (lastRow >= 0 && values[lastRow].every((cell) => !String(cell || "").trim())) {
    lastRow -= 1;
  }

  if (lastRow < 0) {
    return [];
  }

  return values.slice(0, lastRow + 1).map((row) => row.slice(0, lastColumn + 1));
}

function getExportDatesForMonth_(sheet, month) {
  validateMonth_(month);
  const dateSet = {};
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const current = new Date(year, monthIndex, 1);

  while (current.getMonth() === monthIndex) {
    if (PLAY_DAYS.indexOf(current.getDay()) !== -1) {
      dateSet[formatDate_(current)] = true;
    }
    current.setDate(current.getDate() + 1);
  }

  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    rows.forEach((row) => {
      const date = normalizeDate_(row[0]);
      if (date.indexOf(`${month}-`) === 0) {
        dateSet[date] = true;
      }
    });
  }

  return Object.keys(dateSet).sort();
}

function getCurrentExportDatesForMonth_(sheet, month) {
  validateMonth_(month);
  const totalsByDate = {};
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const current = new Date(year, monthIndex, 1);
  const rosterNameSet = getRosterNameSet_();

  while (current.getMonth() === monthIndex) {
    if (PLAY_DAYS.indexOf(current.getDay()) !== -1) {
      totalsByDate[formatDate_(current)] = 0;
    }
    current.setDate(current.getDate() + 1);
  }

  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    sheet
      .getRange(2, 1, lastRow - 1, 4)
      .getValues()
      .forEach((row) => {
        const date = normalizeDate_(row[0]);
        const playerName = String(row[1] || "").trim();
        const vote = normalize_(row[2]);

        if (date.indexOf(`${month}-`) !== 0) {
          return;
        }

        if (!Object.prototype.hasOwnProperty.call(totalsByDate, date)) {
          totalsByDate[date] = 0;
        }

        if (vote === "yes" && isRosterPlayer_(playerName, rosterNameSet)) {
          totalsByDate[date] += clampStoredParticipantCount_(row[3]);
        }
      });
  }

  return Object.keys(totalsByDate)
    .filter((date) => totalsByDate[date] >= EXPORT_MIN_PARTICIPANTS)
    .sort();
}

function getPreviewDateHeaders_(previewRows) {
  if (!Array.isArray(previewRows) || previewRows.length === 0) {
    return [];
  }

  return previewRows[0]
    .slice(1)
    .map(normalizeExportHeaderDate_)
    .filter(Boolean);
}

function normalizeExportHeaderDate_(value) {
  const text = String(value || "").trim();
  const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) {
    return text;
  }

  const slashDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDate) {
    return [
      slashDate[3],
      String(slashDate[1]).padStart(2, "0"),
      String(slashDate[2]).padStart(2, "0"),
    ].join("-");
  }

  return "";
}

function getMissingDates_(currentDates, savedDates) {
  const savedDateSet = savedDates.reduce((dateSet, date) => {
    dateSet[date] = true;
    return dateSet;
  }, {});

  return currentDates.filter((date) => !savedDateSet[date]);
}

function getRsvpTotalsByPlayerForDate_(sheet, playDate) {
  const lastRow = sheet.getLastRow();
  const rosterNameSet = getRosterNameSet_();
  const totals = {};

  if (lastRow < 2) {
    return totals;
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  rows.forEach((row) => {
    const rowDate = normalizeDate_(row[0]);
    const playerName = String(row[1] || "").trim();
    const vote = normalize_(row[2]);
    const participantCount = clampStoredParticipantCount_(row[3]);

    if (
      rowDate !== playDate ||
      vote !== "yes" ||
      !isRosterPlayer_(playerName, rosterNameSet)
    ) {
      return;
    }

    totals[normalize_(playerName)] = Number.isFinite(participantCount)
      ? participantCount
      : 1;
  });

  return totals;
}

function getTotalParticipants_(totalsByPlayer) {
  return Object.keys(totalsByPlayer).reduce(
    (sum, player) => sum + Number(totalsByPlayer[player] || 0),
    0,
  );
}

function formatMonthTabName_(month) {
  validateMonth_(month);
  const date = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1);
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "MMMM yyyy");
}

function formatMonthLabel_(month) {
  validateMonth_(month);
  const date = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1);
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "MMMM yyyy");
}

function getCurrentMonth_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM");
}

function validateMonth_(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("Month must use YYYY-MM format");
  }

  const monthNumber = Number(month.slice(5, 7));
  if (monthNumber < 1 || monthNumber > 12) {
    throw new Error("Month must be between 01 and 12");
  }
}

function getExportedDateCount_(sheet) {
  const previewRows = getPreviewRows_(sheet);
  if (previewRows.length === 0) {
    return 0;
  }

  return previewRows[0].filter(
    (value, index) => index > 0 && /^\d{2}\/\d{2}\/\d{4}$/.test(String(value || "")),
  ).length;
}

function formatDisplayDate_(dateValue) {
  const parts = String(dateValue).split("-");
  if (parts.length !== 3) {
    return dateValue;
  }

  return `${parts[1]}/${parts[2]}/${parts[0]}`;
}

function getTally_(playDate) {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  const rosterNameSet = getRosterNameSet_();
  const tally = {
    playDate,
    playerCount: 0,
    totalCount: 0,
    players: [],
  };

  if (lastRow < 2) {
    return tally;
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, 4).getValues();

  rows.forEach((row) => {
    const rowDate = normalizeDate_(row[0]);
    const playerName = String(row[1] || "").trim();
    const vote = normalize_(row[2]);
    const participantCount = clampStoredParticipantCount_(row[3]);

    if (
      rowDate !== playDate ||
      vote !== "yes" ||
      !isRosterPlayer_(playerName, rosterNameSet)
    ) {
      return;
    }

    const normalizedPlayer = normalize_(playerName);
    const existingPlayer = tally.players.find(
      (player) => normalize_(player.name) === normalizedPlayer,
    );

    if (existingPlayer) {
      existingPlayer.participantCount += Number.isFinite(participantCount)
        ? participantCount
        : 1;
      return;
    } else {
      tally.players.push({
        name: playerName,
        participantCount: Number.isFinite(participantCount)
          ? participantCount
          : 1,
      });
    }
  });

  tally.players.sort((first, second) => first.name.localeCompare(second.name));
  tally.playerCount = tally.players.length;
  tally.totalCount = tally.players.reduce(
    (sum, player) => sum + player.participantCount,
    0,
  );
  tally.locked = isDateLocked_(playDate);

  return tally;
}

function normalize_(value) {
  return String(value || "").trim().toLowerCase();
}

function clampSubmittedParticipantCount_(value) {
  const count = Math.trunc(Number(value || 0));
  return Number.isFinite(count) ? Math.min(5, Math.max(0, count)) : 1;
}

function clampStoredParticipantCount_(value) {
  const count = Math.trunc(Number(value || 1));
  return Number.isFinite(count) ? Math.min(5, Math.max(1, count)) : 1;
}

function isUnvoteBlocked_(params, playDate) {
  if (params.action === "adminUpsertRsvp") {
    return false;
  }

  return isUnvoteLocked_(playDate);
}

function isUnvoteLocked_(playDate) {
  // Manual locking only: a game date is locked when an admin locks it from the
  // Admin page. The previous 6-hour automatic lock has been removed.
  return isDateLocked_(playDate);
}

function formatDate_(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isRosterPlayer_(playerName, rosterNameSet) {
  const normalizedName = normalize_(playerName);
  if (rosterNameSet) {
    return Boolean(rosterNameSet[normalizedName]);
  }
  return getRosterNames_().some((player) => normalize_(player) === normalizedName);
}

function validatePlayerName_(playerName) {
  if (!isRosterPlayer_(playerName)) {
    throw new Error("Please choose a player from the roster");
  }
}

function normalizeVenmo_(value) {
  const text = String(value || "").trim();
  const match = text.match(
    /^(?:https?:\/\/)?(?:(?:www|account)\.)?venmo\.com\/(?:u\/)?([A-Za-z0-9_.-]+)\/?$/i,
  );
  const handle = match ? match[1] : text.replace(/^@/, "");

  if (!/^[A-Za-z0-9_.-]{2,30}$/.test(handle)) {
    throw new Error("Enter a valid Venmo handle or Venmo profile URL");
  }

  return `@${handle}`;
}

function normalizeZelle_(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text)) {
    return text.toLowerCase();
  }
  const digits = text.replace(/[^\d]/g, "");
  if (digits.length >= 10 && digits.length <= 11) {
    return digits;
  }
  return sanitizeText_(text);
}

function normalizeMessenger_(value) {
  const text = String(value || "").trim();
  const messengerMatch = text.match(
    /^(?:https?:\/\/)?m\.me\/([A-Za-z0-9._-]{3,80})\/?(?:[?#].*)?$/i,
  );
  if (messengerMatch) {
    return `https://www.facebook.com/${messengerMatch[1]}`;
  }

  const profileIdMatch = text.match(
    /^(?:https?:\/\/)?(?:(?:www|m)\.)?(?:facebook|fb)\.com\/profile\.php\?id=([0-9]+)(?:[&#].*)?$/i,
  );
  if (profileIdMatch) {
    return `https://www.facebook.com/profile.php?id=${profileIdMatch[1]}`;
  }

  const facebookMatch = text.match(
    /^(?:https?:\/\/)?(?:(?:www|m)\.)?(?:facebook|fb)\.com\/([A-Za-z0-9._-]{3,80})\/?(?:[?#].*)?$/i,
  );
  const handle = facebookMatch ? facebookMatch[1] : text.replace(/^@/, "");

  if (
    !/^[A-Za-z0-9._-]{3,80}$/.test(handle) ||
    handle.toLowerCase() === "profile.php"
  ) {
    throw new Error("Enter a valid Facebook profile URL or profile handle");
  }

  return `https://www.facebook.com/${handle}`;
}

function sanitizeText_(value) {
  const text = String(value || "").trim();
  return /^[=+\-]/.test(text) ? `'${text}` : text;
}

function normalizeDate_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd",
    );
  }

  return String(value || "").trim();
}

function normalizeMonth_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "yyyy-MM",
    );
  }

  const text = String(value || "").trim();
  const isoMonth = text.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (isoMonth) {
    return `${isoMonth[1]}-${isoMonth[2]}`;
  }

  const slashDate = text.match(/^(\d{1,2})\/\d{1,2}\/(\d{4})$/);
  if (slashDate) {
    return `${slashDate[2]}-${String(slashDate[1]).padStart(2, "0")}`;
  }

  return text;
}

function required_(value, message) {
  if (!String(value || "").trim()) {
    throw new Error(message);
  }
  return String(value);
}

function jsonp_(callback, payload) {
  const safeCallback = String(callback).replace(/[^\w.$]/g, "");
  return ContentService.createTextOutput(
    `${safeCallback}(${JSON.stringify(payload)});`,
  ).setMimeType(ContentService.MimeType.JAVASCRIPT);
}
