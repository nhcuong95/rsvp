const SHEET_NAME = "RSVPs";
const ROSTER_SHEET_NAME = "Roster";
const AUDIT_SHEET_NAME = "RSVP Audit Log";
const LOCKS_SHEET_NAME = "Roster Locks";
const LOCKS_HEADERS = ["Play Date", "Locked", "Updated At", "Updated By"];
const OPEN_DATES_SHEET_NAME = "RSVP Dates";
const OPEN_DATES_HEADERS = [
  "Play Date",
  "Added At",
  "Added By",
  "Field Name",
  "Address",
  "Start Time",
  "End Time",
  // Max spots (guests included) for the date. Blank = no limit / no waitlist.
  "Capacity",
];
// Vote value for an RSVP that did not fit under the date's Capacity. Billing,
// the report, and the admin tally only count Vote = "Yes", so waitlisted rows
// are never charged; promotion flips the row to "Yes".
const WAITLIST_VOTE = "Waitlist";
const SPREADSHEET_ID_PROPERTY = "RSVP_SPREADSHEET_ID";
const ROSTER_CACHE_KEY = "rsvp-public-roster-v1";
const ROSTER_CACHE_TTL_SECONDS = 6 * 60 * 60;
const PLAY_START_HOUR = 6;
const UNVOTE_LOCK_HOURS_BEFORE_PLAY = 6;
const UNVOTE_LOCK_MESSAGE =
  "This game is locked. Drop-outs are closed \u2014 tap \"Request to withdraw\" if you can't make it. No-shows may still be charged field fees.";

const HEADERS = [
  "Play Date",
  "Player Name",
  "Vote",
  "Participant Count",
  "Submitted At",
  "Updated At",
  // Set when a confirmed player asks to drop out of a locked game. They keep
  // their spot (Vote stays "Yes") until an admin accepts, which deletes the
  // row, or declines, which clears this cell.
  "Withdraw Requested At",
];
const WITHDRAW_COLUMN = 7;
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
        dateDetails: getOpenDatesDetailed_(),
      });
    }

    if (params.action === "list") {
      return jsonp_(callback, {
        ok: true,
        tally: getTally_(required_(params.playDate, "Missing play date")),
      });
    }

    if (params.action === "requestWithdraw" || params.action === "cancelWithdraw") {
      const result = setWithdrawRequest_(params, params.action === "requestWithdraw");
      return jsonp_(callback, {
        ok: true,
        action: result.action,
        row: result.row,
        audit: result.audit || null,
        tally: result.tally,
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
      // "confirmed" | "waitlisted" | "none" (absent on needs_confirmation).
      status: result.status || null,
      waitlistPosition: result.waitlistPosition || null,
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

    // A waitlisted player holds no spot, so they may leave even when locked.
    const wasWaitlisted = Boolean(existingRsvp) && isWaitlistVote_(existingRsvp.vote);
    if (!wasWaitlisted && isUnvoteLocked_(playDate)) {
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
    // A freed spot goes to the next person in line. Re-read: deleting rows
    // shifted the row numbers below them.
    const next = promoteWaitlist_(
      sheet,
      readRsvpRows_(sheet),
      playDate,
      getDateCapacity_(playDate),
      rosterNameSet,
    );
    return {
      action: "deleted",
      row: rows[0],
      audit,
      tally: buildTallyFromSnapshot_(next, playDate, rosterNameSet),
    };
  } finally {
    lock.releaseLock();
  }
}

// A confirmed player asks to drop out of a locked game (requested = true), or
// takes that back. They keep their spot until an admin accepts on the RSVP
// page (admin backend resolveWithdrawRequest_), which removes them and lets
// the waitlist in. Repeating a request or a cancel is a no-op, so retries are
// safe.
function setWithdrawRequest_(params, requested) {
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
    if (rows.length === 0) {
      throw new Error("No RSVP on file for this player and date.");
    }
    const existingRsvp = getRsvpFromSnapshot_(snapshot, rows[0]);
    const locked = isDateLocked_(playDate);
    if (requested && !isYesVote_(existingRsvp.vote)) {
      throw new Error("You're on the waitlist, so you can leave anytime: choose \"Not going\" instead.");
    }
    if (requested && !locked) {
      throw new Error("This game isn't locked, so you can just choose \"Not going\".");
    }

    let current = snapshot;
    let action = requested ? "withdraw_already_requested" : "withdraw_not_requested";
    let audit = null;
    if (Boolean(existingRsvp.withdrawRequestedAt) !== requested) {
      const value = requested ? new Date().toISOString() : "";
      rows.forEach((row) => {
        sheet.getRange(row, WITHDRAW_COLUMN).setValue(value);
      });
      action = requested ? "withdraw_requested" : "withdraw_cancelled";
      audit = appendAuditLog_(
        Object.assign({}, params, { participantCount: existingRsvp.participantCount }),
        action,
        rows[0],
        existingRsvp,
      );
      current = snapshot.map((entry) => {
        if (rows.indexOf(entry.rowNumber) === -1) {
          return entry;
        }
        const values = entry.values.slice();
        values[WITHDRAW_COLUMN - 1] = value;
        return { rowNumber: entry.rowNumber, values };
      });
    }

    const tally = buildTallyFromSnapshot_(current, playDate, rosterNameSet);
    tally.locked = locked;
    return { action, row: rows[0], audit, tally };
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
  // Server time, not the client's params.submittedAt: this column decides
  // waitlist order, so a client must not be able to backdate it. (The audit
  // log still records the client-sent value.)
  const submittedAt = new Date().toISOString();
  const updatedAt = new Date().toISOString();
  const capacity = getDateCapacity_(playDate);

  const sheet = getSheet_();
  const snapshot = readRsvpRows_(sheet);
  const matchingRows = findExistingRowsInSnapshot_(snapshot, playDate, playerName);
  const row = matchingRows[0] || null;
  const existingRsvp = row ? getRsvpFromSnapshot_(snapshot, row) : null;
  const wasWaitlisted = Boolean(existingRsvp) && isWaitlistVote_(existingRsvp.vote);
  let audit;

  if (normalize_(vote) === "no") {
    // A waitlisted player holds no spot, so they may leave even when locked.
    if (!wasWaitlisted && isUnvoteLocked_(playDate)) {
      appendAuditLog_(params, "blocked_unvote", row, existingRsvp);
      throw new Error(UNVOTE_LOCK_MESSAGE);
    }

    if (row) {
      matchingRows.sort((first, second) => second - first).forEach((rowNumber) => {
        sheet.deleteRow(rowNumber);
      });
      audit = appendAuditLog_(params, "deleted", row, existingRsvp);
      // Re-read: deleting rows shifted the row numbers below them.
      const next = promoteWaitlist_(
        sheet,
        readRsvpRows_(sheet),
        playDate,
        capacity,
        rosterNameSet,
      );
      return {
        action: "deleted",
        row,
        audit,
        status: "none",
        waitlistPosition: null,
        tally: buildTallyFromSnapshot_(next, playDate, rosterNameSet),
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

  // New RSVPs join the waitlist when the date has a capacity; promotion then
  // lets them straight in if they fit (after anyone already waiting).
  const values = [
    playDate,
    playerName,
    capacity === null ? "Yes" : WAITLIST_VOTE,
    participantCount,
    submittedAt,
    updatedAt,
  ];

  if (row) {
    deleteDuplicateRows_(sheet, matchingRows, row);
    let current = removeRowsFromSnapshot_(
      snapshot,
      matchingRows.filter((rowNumber) => rowNumber !== row),
    );
    if (normalize_(existingRsvp.vote) !== "no" && params.confirmOverride !== "true") {
      audit = appendAuditLog_(params, "needs_confirmation", row, existingRsvp);
      return {
        action: "needs_confirmation",
        row,
        existing: existingRsvp,
        audit,
        tally: buildTallyFromSnapshot_(current, playDate, rosterNameSet),
      };
    }

    if (isYesVote_(existingRsvp.vote)) {
      // Confirmed players keep their spot. They can always shrink their RSVP,
      // but adding guests must fit — nobody else gets bumped for it.
      if (capacity !== null && participantCount > existingRsvp.participantCount) {
        const available =
          capacity - confirmedSpots_(current, playDate, rosterNameSet, row);
        if (participantCount > available) {
          appendAuditLog_(params, "blocked_capacity", row, existingRsvp);
          throw new Error(
            capacityErrorMessage_(available, existingRsvp.participantCount),
          );
        }
      }
      values[2] = "Yes";
    }

    const originalSubmittedAt = sheet.getRange(row, 5).getValue() || submittedAt;
    values[4] = originalSubmittedAt;
    sheet.getRange(row, 1, 1, values.length).setValues([values]);
    audit = appendAuditLog_(params, "updated", row, existingRsvp);
    // Duplicate rows were deleted above, shifting rows below them: re-read.
    // Otherwise keep the untouched Withdraw Requested cell in the snapshot.
    current = matchingRows.length > 1
      ? readRsvpRows_(sheet)
      : upsertSnapshotRow_(
        current,
        row,
        values.concat(snapshot.find((entry) => entry.rowNumber === row).values.slice(values.length)),
      );
    current = promoteWaitlist_(sheet, current, playDate, capacity, rosterNameSet);
    return Object.assign(
      {
        action: "updated",
        row,
        audit,
        tally: buildTallyFromSnapshot_(current, playDate, rosterNameSet),
      },
      getPlayerStatus_(current, playDate, playerName, rosterNameSet),
    );
  }

  sheet.appendRow(values);
  const appendedRow = sheet.getLastRow();
  audit = appendAuditLog_(params, "created", appendedRow, null);
  const current = promoteWaitlist_(
    sheet,
    upsertSnapshotRow_(snapshot, appendedRow, values),
    playDate,
    capacity,
    rosterNameSet,
  );
  return Object.assign(
    {
      action: "created",
      row: appendedRow,
      audit,
      tally: buildTallyFromSnapshot_(current, playDate, rosterNameSet),
    },
    getPlayerStatus_(current, playDate, playerName, rosterNameSet),
  );
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
  // One-time migration from the older ["...","Location","Time"] layout: the old
  // "Location" (col D) held the address, so preserve it as the new Address
  // (col E) and leave Field Name / Start Time / End Time blank. The old free-text
  // "Time" (col E) can't map to the new dropdowns, so it is dropped.
  if (currentHeaders[3] === "Location" && currentHeaders[4] === "Time") {
    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      const oldLocations = sheet.getRange(2, 4, lastRow - 1, 1).getValues();
      const migrated = oldLocations.map((r) => ["", String(r[0] || ""), "", ""]);
      sheet.getRange(2, 4, lastRow - 1, 4).setValues(migrated);
    }
  }
  const needsHeaders = OPEN_DATES_HEADERS.some(
    (header, index) => currentHeaders[index] !== header,
  );
  if (needsHeaders) {
    headerRange.setValues([OPEN_DATES_HEADERS]);
    sheet.setFrozenRows(1);
  }
  sheet.getRange("A:A").setNumberFormat("@");
  // Keep Start Time / End Time as plain text so Sheets never reparses a picked
  // time like "8:00 PM" into a datetime value.
  sheet.getRange("F:G").setNumberFormat("@");
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

// Returns one entry per open date with its field name, address, and start/end
// time so the RSVP page can show players where and when to play. Shape:
// [{ date: "2026-09-24", fieldName: "Magnuson Park Field #6",
//    address: "7400 Sand Point Way NE", startTime: "8:00 PM", endTime: "10:00 PM",
//    capacity: 24 }]  (capacity is null when no limit is set).
function getOpenDatesDetailed_() {
  const sheet = getOpenDatesSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }
  const rows = sheet.getRange(2, 1, lastRow - 1, OPEN_DATES_HEADERS.length).getValues();
  const byDate = {};
  rows.forEach((row) => {
    const date = normalizeDate_(row[0]);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      byDate[date] = {
        date,
        fieldName: sanitizeText_(row[3] || ""),
        address: sanitizeText_(row[4] || ""),
        startTime: formatTimeCellValue_(row[5]),
        endTime: formatTimeCellValue_(row[6]),
        capacity: parseCapacity_(row[7]),
      };
    }
  });
  return Object.keys(byDate)
    .sort()
    .map((date) => byDate[date]);
}

// Sheets can store a picked time ("8:00 PM") as a datetime value, which reads
// back as a Date. Format such values as "h:mm a" to match the dropdown options;
// otherwise return the stored text as-is.
function formatTimeCellValue_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "h:mm a");
  }
  return sanitizeText_(value == null ? "" : value);
}

// A positive whole number of spots, or null for "no limit".
function parseCapacity_(value) {
  const count = Math.trunc(Number(value));
  return Number.isFinite(count) && count > 0 ? count : null;
}

// Capacity for one date, read straight from the "RSVP Dates" sheet (skipping
// getOpenDatesSheet_'s header upkeep, which writes, to keep submits fast).
// Later rows win when a date is duplicated, matching getOpenDatesDetailed_.
function getDateCapacity_(playDate) {
  const sheet = getSpreadsheet_().getSheetByName(OPEN_DATES_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) {
    return null;
  }
  const rows = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, OPEN_DATES_HEADERS.length)
    .getValues();
  let capacity = null;
  rows.forEach((row) => {
    if (normalizeDate_(row[0]) === playDate) {
      capacity = parseCapacity_(row[7]);
    }
  });
  return capacity;
}

function isWaitlistVote_(vote) {
  return normalize_(vote) === normalize_(WAITLIST_VOTE);
}

// Waitlist order: when the player first signed up for the date ("Submitted
// At" is kept when an RSVP is edited), then sheet row as a tie-break.
function signupTime_(entry) {
  const value = entry.values[4];
  const time = Object.prototype.toString.call(value) === "[object Date]"
    ? value.getTime()
    : Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

function compareSignupOrder_(first, second) {
  return signupTime_(first) - signupTime_(second) || first.rowNumber - second.rowNumber;
}

// Roster players' RSVP entries for a date whose vote passes `voteTest`.
function dateEntries_(snapshot, playDate, rosterNameSet, voteTest) {
  return snapshot.filter((entry) => {
    const rsvp = rsvpValuesToRecord_(entry.values);
    return (
      rsvp.playDate === playDate &&
      voteTest(rsvp.vote) &&
      isRosterPlayer_(rsvp.playerName, rosterNameSet)
    );
  });
}

function isYesVote_(vote) {
  return normalize_(vote) === "yes";
}

// Spots taken by confirmed ("Yes") RSVPs for the date, optionally ignoring
// one sheet row (the RSVP being edited).
function confirmedSpots_(snapshot, playDate, rosterNameSet, exceptRow) {
  return dateEntries_(snapshot, playDate, rosterNameSet, isYesVote_)
    .filter((entry) => entry.rowNumber !== exceptRow)
    .reduce((sum, entry) => sum + clampStoredParticipantCount_(entry.values[3]), 0);
}

// The date's waitlist in line order.
function waitlistEntries_(snapshot, playDate, rosterNameSet) {
  return dateEntries_(snapshot, playDate, rosterNameSet, isWaitlistVote_)
    .sort(compareSignupOrder_);
}

// Fill open spots from the waitlist in sign-up order. An RSVP too big for the
// spots left is skipped (it keeps its place) so a smaller one behind it can
// use them; confirmed RSVPs are never demoted. A null capacity (limit removed)
// lets everyone in. Writes the promoted rows' Vote cells, logs each promotion,
// and returns the updated snapshot. Snapshot row numbers must match the sheet,
// so re-read it after deleting rows.
function promoteWaitlist_(sheet, snapshot, playDate, capacity, rosterNameSet) {
  let open = capacity === null
    ? Infinity
    : capacity - confirmedSpots_(snapshot, playDate, rosterNameSet);
  const promoted = {};
  waitlistEntries_(snapshot, playDate, rosterNameSet).forEach((entry) => {
    const count = clampStoredParticipantCount_(entry.values[3]);
    if (count > open) {
      return;
    }
    open -= count;
    sheet.getRange(entry.rowNumber, 3).setValue("Yes");
    promoted[entry.rowNumber] = true;
    appendAuditLog_(
      { playDate, playerName: String(entry.values[1] || ""), participantCount: count },
      "promoted_from_waitlist",
      entry.rowNumber,
      rsvpValuesToRecord_(entry.values),
    );
  });
  return snapshot.map((entry) => (
    promoted[entry.rowNumber]
      ? { rowNumber: entry.rowNumber, values: entry.values.slice(0, 2).concat("Yes", entry.values.slice(3)) }
      : entry
  ));
}

// Where a player stands for a date after a change: confirmed, waitlisted
// (with their 1-based place in line), or no RSVP.
function getPlayerStatus_(snapshot, playDate, playerName, rosterNameSet) {
  const name = normalize_(playerName);
  const place = waitlistEntries_(snapshot, playDate, rosterNameSet)
    .findIndex((entry) => normalize_(entry.values[1]) === name);
  if (place !== -1) {
    return { status: "waitlisted", waitlistPosition: place + 1 };
  }
  const confirmed = dateEntries_(snapshot, playDate, rosterNameSet, isYesVote_)
    .some((entry) => normalize_(entry.values[1]) === name);
  return { status: confirmed ? "confirmed" : "none", waitlistPosition: null };
}

// Why a confirmed player's bigger RSVP was refused. `available` counts the
// spots they could hold, themselves included.
function capacityErrorMessage_(available, currentCount) {
  if (available <= currentCount) {
    return "The game is full, so you can't add guests right now. Your RSVP is unchanged.";
  }
  return `There's only room for you + ${available - 1} right now. Your RSVP is unchanged.`;
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
    withdrawRequestedAt: String(values[WITHDRAW_COLUMN - 1] || "").trim(),
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
      existingPlayer.withdrawRequested =
        existingPlayer.withdrawRequested || Boolean(rsvp.withdrawRequestedAt);
      return;
    }

    tally.players.push({
      name: rsvp.playerName,
      participantCount: rsvp.participantCount,
      // Asked to drop out of the locked game; still holds the spot.
      withdrawRequested: Boolean(rsvp.withdrawRequestedAt),
    });
  });

  tally.players.sort((first, second) => first.name.localeCompare(second.name));
  tally.playerCount = tally.players.length;
  tally.totalCount = tally.players.reduce(
    (sum, player) => sum + player.participantCount,
    0,
  );
  // Waitlisted RSVPs in line order (players/totalCount above are confirmed
  // only, so older front-ends keep showing just who is in).
  tally.waitlist = waitlistEntries_(snapshot, playDate, rosterNameSet).map((entry) => ({
    name: String(entry.values[1] || "").trim(),
    participantCount: clampStoredParticipantCount_(entry.values[3]),
  }));
  tally.waitlistCount = tally.waitlist.reduce(
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
