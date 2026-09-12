const SHEET_NAME = "RSVPs";
const ROSTER_SHEET_NAME = "Roster";
const AUDIT_SHEET_NAME = "RSVP Audit Log";
const LOCKS_SHEET_NAME = "Roster Locks";
const LOCKS_HEADERS = ["Play Date", "Locked", "Updated At", "Updated By"];
const OPEN_DATES_SHEET_NAME = "RSVP Dates";
const OPEN_DATES_HEADERS = ["Play Date", "Added At", "Added By"];
const SPREADSHEET_ID_PROPERTY = "RSVP_SPREADSHEET_ID";
const ROSTER_CACHE_KEY = "rsvp-public-roster-v1";
const ROSTER_CACHE_TTL_SECONDS = 6 * 60 * 60;
const PLAY_START_HOUR = 6;
const UNVOTE_LOCK_HOURS_BEFORE_PLAY = 6;
const UNVOTE_LOCK_MESSAGE =
  "This game is locked. Drop-outs are closed — message the admin if you can't make it. No-shows may still be charged field fees.";

const HEADERS = [
  "Play Date",
  "Player Name",
  "Vote",
  "Participant Count",
  "Submitted At",
  "Updated At",
];
const ROSTER_HEADERS = ["Name", "Venmo", "Facebook", "Note", "Zelle"];
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

function doGet(event) {
  const params = event && event.parameter ? event.parameter : {};
  const callback = params.callback || "callback";

  try {
    if (params.action === "listRoster") {
      return jsonp_(callback, {
        ok: true,
        roster: getRoster_(),
      });
    }

    if (params.action === "refreshRosterCache") {
      return jsonp_(callback, {
        ok: true,
        action: "refreshRosterCache",
        roster: refreshRosterCache_(),
      });
    }

    if (params.action === "listPlayDates") {
      return jsonp_(callback, {
        ok: true,
        dates: getOpenDates_(),
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

function deleteRsvp_(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const playDate = required_(params.playDate, "Missing play date");
    const playerName = required_(params.playerName, "Missing player name").trim();
    const sheet = getSheet_();
    const rosterNameSet = getRosterNameSet_();
    validatePlayerName_(playerName, rosterNameSet);
    const snapshot = readRsvpRows_(sheet);
    const rows = findExistingRowsInSnapshot_(snapshot, playDate, playerName);
    const existingRsvp = rows.length > 0
      ? getRsvpFromSnapshot_(snapshot, rows[0])
      : null;

    if (isUnvoteLocked_(playDate)) {
      appendAuditLog_(params, "blocked_unvote", rows[0] || null, existingRsvp);
      throw new Error(UNVOTE_LOCK_MESSAGE);
    }

    if (rows.length === 0) {
      const audit = appendAuditLog_(params, "delete_not_found", null, null);
      return {
        action: "not_found",
        row: null,
        audit,
        tally: buildTallyFromSnapshot_(snapshot, playDate, rosterNameSet),
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
      tally: buildTallyFromSnapshot_(
        removeRowsFromSnapshot_(snapshot, rows),
        playDate,
        rosterNameSet,
      ),
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
  const rosterNameSet = getRosterNameSet_();
  validatePlayerName_(playerName, rosterNameSet);
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
  const snapshot = readRsvpRows_(sheet);
  const matchingRows = findExistingRowsInSnapshot_(snapshot, playDate, playerName);
  const row = matchingRows[0] || null;
  const existingRsvp = row ? getRsvpFromSnapshot_(snapshot, row) : null;
  let audit;

  if (normalize_(vote) === "no") {
    if (isUnvoteLocked_(playDate)) {
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
        tally: buildTallyFromSnapshot_(
          removeRowsFromSnapshot_(snapshot, matchingRows),
          playDate,
          rosterNameSet,
        ),
      };
    }

    audit = appendAuditLog_(params, "delete_not_found", null, null);
    return {
      action: "not_found",
      row: null,
      audit,
      tally: buildTallyFromSnapshot_(snapshot, playDate, rosterNameSet),
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
        tally: buildTallyFromSnapshot_(snapshot, playDate, rosterNameSet),
      };
    }

    const originalSubmittedAt = sheet.getRange(row, 5).getValue() || submittedAt;
    values[4] = originalSubmittedAt;
    sheet.getRange(row, 1, 1, values.length).setValues([values]);
    audit = appendAuditLog_(params, "updated", row, existingRsvp);
    return {
      action: "updated",
      row,
      audit,
      tally: buildTallyFromSnapshot_(
        upsertSnapshotRow_(
          removeRowsFromSnapshot_(
            snapshot,
            matchingRows.filter((rowNumber) => rowNumber !== row),
          ),
          row,
          values,
        ),
        playDate,
        rosterNameSet,
      ),
    };
  }

  sheet.appendRow(values);
  const appendedRow = sheet.getLastRow();
  audit = appendAuditLog_(params, "created", appendedRow, null);
  return {
    action: "created",
    row: appendedRow,
    audit,
    tally: buildTallyFromSnapshot_(
      upsertSnapshotRow_(snapshot, appendedRow, values),
      playDate,
      rosterNameSet,
    ),
  };
}

function getSheet_() {
  const spreadsheet = getSpreadsheet_();
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

function getRosterSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(ROSTER_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(ROSTER_SHEET_NAME);
  }

  const headerRange = sheet.getRange(1, 1, 1, ROSTER_HEADERS.length);
  const currentHeaders = headerRange.getValues()[0];
  const needsHeaders = ROSTER_HEADERS.some(
    (header, index) => currentHeaders[index] !== header,
  );

  if (needsHeaders) {
    headerRange.setValues([ROSTER_HEADERS]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function getAuditSheet_() {
  const spreadsheet = getSpreadsheet_();
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

function getSpreadsheet_() {
  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (activeSpreadsheet) {
    return activeSpreadsheet;
  }

  const spreadsheetId = PropertiesService
    .getScriptProperties()
    .getProperty(SPREADSHEET_ID_PROPERTY);
  if (!spreadsheetId) {
    throw new Error(`Set script property ${SPREADSHEET_ID_PROPERTY}`);
  }

  return SpreadsheetApp.openById(spreadsheetId);
}

function getLocksSheet_() {
  const spreadsheet = getSpreadsheet_();
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

function getOpenDatesSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(OPEN_DATES_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(OPEN_DATES_SHEET_NAME);
  }
  const headerRange = sheet.getRange(1, 1, 1, OPEN_DATES_HEADERS.length);
  const currentHeaders = headerRange.getValues()[0];
  const needsHeaders = OPEN_DATES_HEADERS.some(
    (header, index) => currentHeaders[index] !== header,
  );
  if (needsHeaders) {
    headerRange.setValues([OPEN_DATES_HEADERS]);
    sheet.setFrozenRows(1);
  }
  sheet.getRange("A:A").setNumberFormat("@");
  return sheet;
}

function getOpenDates_() {
  const sheet = getOpenDatesSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }
  const rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const seen = {};
  rows.forEach((row) => {
    const date = normalizeDate_(row[0]);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      seen[date] = true;
    }
  });
  return Object.keys(seen).sort();
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
    console.warn(`Could not append RSVP audit log: ${error.message}`);
    return {
      ok: false,
      sheet: AUDIT_SHEET_NAME,
      action,
      playDate: normalizeDate_(params.playDate || ""),
      error: error.message,
    };
  }
}

function getRoster_() {
  const cached = CacheService.getScriptCache().get(ROSTER_CACHE_KEY);
  if (cached) {
    try {
      const roster = JSON.parse(cached);
      if (Array.isArray(roster)) {
        return roster;
      }
    } catch {
      // Fall through and refresh the cache from the sheet.
    }
  }

  return refreshRosterCache_();
}

function refreshRosterCache_() {
  const roster = getRosterFromSheet_();
  CacheService
    .getScriptCache()
    .put(ROSTER_CACHE_KEY, JSON.stringify(roster), ROSTER_CACHE_TTL_SECONDS);
  return roster;
}

function getRosterFromSheet_() {
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

function getRosterNameSet_() {
  return getRoster_().reduce((names, member) => {
    names[normalize_(member.name)] = true;
    return names;
  }, {});
}

function readRsvpRows_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  return sheet
    .getRange(2, 1, lastRow - 1, HEADERS.length)
    .getValues()
    .map((values, index) => ({
      rowNumber: index + 2,
      values,
    }));
}

function findExistingRowsInSnapshot_(snapshot, playDate, playerName) {
  const normalizedName = normalize_(playerName);
  return snapshot
    .filter((entry) => {
      const rowDate = normalizeDate_(entry.values[0]);
      const rowName = normalize_(entry.values[1]);
      return rowDate === playDate && rowName === normalizedName;
    })
    .map((entry) => entry.rowNumber);
}

function getRsvpFromSnapshot_(snapshot, rowNumber) {
  const entry = snapshot.find((candidate) => candidate.rowNumber === rowNumber);
  if (!entry) {
    return null;
  }

  return rsvpValuesToRecord_(entry.values);
}

function removeRowsFromSnapshot_(snapshot, rowNumbers) {
  const rowsToRemove = rowNumbers.reduce((rows, rowNumber) => {
    rows[rowNumber] = true;
    return rows;
  }, {});

  return snapshot.filter((entry) => !rowsToRemove[entry.rowNumber]);
}

function upsertSnapshotRow_(snapshot, rowNumber, values) {
  const nextEntry = {
    rowNumber,
    values,
  };
  const existingIndex = snapshot.findIndex((entry) => entry.rowNumber === rowNumber);
  if (existingIndex === -1) {
    return snapshot.concat(nextEntry);
  }

  return snapshot.map((entry, index) => (
    index === existingIndex ? nextEntry : entry
  ));
}

function rsvpValuesToRecord_(values) {
  return {
    playDate: normalizeDate_(values[0]),
    playerName: String(values[1] || "").trim(),
    vote: String(values[2] || "").trim(),
    participantCount: clampStoredParticipantCount_(values[3]),
    submittedAt: String(values[4] || ""),
    updatedAt: String(values[5] || ""),
  };
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
  return rsvpValuesToRecord_(values);
}

function getTally_(playDate) {
  const sheet = getSheet_();
  const rosterNameSet = getRosterNameSet_();
  const tally = buildTallyFromSnapshot_(
    readRsvpRows_(sheet),
    playDate,
    rosterNameSet,
  );
  tally.locked = isDateLocked_(playDate);
  return tally;
}

function buildTallyFromSnapshot_(snapshot, playDate, rosterNameSet) {
  const tally = {
    playDate,
    playerCount: 0,
    totalCount: 0,
    players: [],
  };

  snapshot.forEach((entry) => {
    const rsvp = rsvpValuesToRecord_(entry.values);

    if (
      rsvp.playDate !== playDate ||
      normalize_(rsvp.vote) !== "yes" ||
      !isRosterPlayer_(rsvp.playerName, rosterNameSet)
    ) {
      return;
    }

    const normalizedPlayer = normalize_(rsvp.playerName);
    const existingPlayer = tally.players.find(
      (player) => normalize_(player.name) === normalizedPlayer,
    );

    if (existingPlayer) {
      existingPlayer.participantCount += rsvp.participantCount;
      return;
    }

    tally.players.push({
      name: rsvp.playerName,
      participantCount: rsvp.participantCount,
    });
  });

  tally.players.sort((first, second) => first.name.localeCompare(second.name));
  tally.playerCount = tally.players.length;
  tally.totalCount = tally.players.reduce(
    (sum, player) => sum + player.participantCount,
    0,
  );

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

function isUnvoteLocked_(playDate) {
  // Locking is now manual: a game date is locked only when an admin locks it
  // from the Admin page (stored in the "Roster Locks" sheet). The old 6-hour
  // automatic lock has been removed.
  return isDateLocked_(playDate);
}

function isRosterPlayer_(playerName, rosterNameSet) {
  const normalizedName = normalize_(playerName);
  if (rosterNameSet) {
    return Boolean(rosterNameSet[normalizedName]);
  }
  return getRoster_().some((member) => normalize_(member.name) === normalizedName);
}

function validatePlayerName_(playerName) {
  if (!isRosterPlayer_(playerName)) {
    throw new Error("Please choose a player from the roster");
  }
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
