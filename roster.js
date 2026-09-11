(function () {
  const APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbyc_NEAxzm_0R2Mp05vHYURAHKNYqvjccBFTBh7JAgi7UThHi-W3F-2qM9akXiyrdJGMg/exec";
  const RSVP_PUBLIC_APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbxKfZ8FlMDgVJ5weT9rOmFbfPlExX0DIFNuvCuvumkFUBgGu1Jzc77_utdzp_JghDyL/exec";

  const form = document.querySelector("#roster-form");
  const adminAuth = window.RsvpAdminAuth;
  const adminEyebrow = document.querySelector("#admin-eyebrow");
  const nameInput = document.querySelector("#member-name");
  const memberNameList = document.querySelector("#member-name-list");
  const venmoInput = document.querySelector("#venmo");
  const zelleInput = document.querySelector("#zelle");
  const messengerInput = document.querySelector("#messenger");
  const noteInput = document.querySelector("#member-note");
  const memberSearch = document.querySelector("#member-search");
  const saveButton = document.querySelector("#save-button");
  const status = document.querySelector("#status");
  const memberCount = document.querySelector("#member-count");
  const memberTable = document.querySelector("#member-table");
  let roster = [];
  let adminToken = "";
  let editingOriginalName = "";

  function setStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type || ""}`.trim();
  }

  function renderAdminState() {
    adminEyebrow.hidden = !adminToken;
    noteInput.disabled = false;
    // The contact form fields stay visible so members can enter/update their
    // own details. They are never pre-filled for non-admins (see fillForm), so
    // no one sees anyone else's info — the members table also hides those
    // columns from non-admins (see renderRoster).
    updateSaveButtonLabel();
    renderRoster();
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
    const callbackName = `rosterFetch_${Date.now()}_${Math.random()
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
      const callbackName = `rosterCallback_${Date.now()}_${Math.random()
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

  function refreshPublicRsvpRosterCache() {
    return new Promise((resolve) => {
      if (!RSVP_PUBLIC_APPS_SCRIPT_URL) {
        resolve();
        return;
      }

      const callbackName = `publicRosterRefresh_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`;
      const script = document.createElement("script");
      const url = new URL(RSVP_PUBLIC_APPS_SCRIPT_URL);
      const timeout = window.setTimeout(cleanup, 15000);

      function cleanup() {
        window.clearTimeout(timeout);
        script.remove();
        delete window[callbackName];
        resolve();
      }

      window[callbackName] = cleanup;
      script.onerror = cleanup;
      script.referrerPolicy = "no-referrer";
      url.searchParams.set("callback", callbackName);
      url.searchParams.set("action", "refreshRosterCache");
      script.src = url.toString();
      document.body.append(script);
    });
  }

  function clearForm() {
    form.reset();
    editingOriginalName = "";
    updateSaveButtonLabel();
    renderRoster();
    nameInput.focus();
  }

  function focusRelevantMemberField(member) {
    if (!member.venmo) {
      venmoInput.focus();
      return;
    }
    if (!member.messenger) {
      messengerInput.focus();
      return;
    }
    noteInput.focus();
  }

  function fillForm(member, options) {
    editingOriginalName = member.name || "";
    nameInput.value = member.name || "";
    // Only admins see existing contact values pre-filled. For members the
    // fields stay blank so they don't see anyone's info; whatever they type
    // overrides, and blank fields keep the current value.
    const showContact = Boolean(adminToken);
    venmoInput.value = showContact ? member.venmo || "" : "";
    zelleInput.value = showContact ? member.zelle || "" : "";
    messengerInput.value = showContact ? member.messenger || "" : "";
    noteInput.value = showContact ? member.note || "" : "";
    updateSaveButtonLabel();
    if (options?.focusRelevantField) {
      focusRelevantMemberField(member);
    } else {
      nameInput.focus();
    }
  }

  function fillMissingInfoForm(member) {
    fillForm(member, { focusRelevantField: true });
    setStatus("", "");
    renderRoster();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function isRenamingMember() {
    return (
      editingOriginalName &&
      normalizeSearchText(editingOriginalName) !== normalizeSearchText(nameInput.value)
    );
  }

  function updateSaveButtonLabel() {
    if (!adminToken) {
      const selectedMember = findRosterMemberByName(nameInput.value);
      const canUpdateInfo = selectedMember && !isRenamingMember();
      saveButton.disabled = !canUpdateInfo;
      saveButton.textContent = "Update Info";
      return;
    }
    saveButton.disabled = false;
    if (isRenamingMember()) {
      saveButton.textContent = "Rename Member";
      return;
    }
    saveButton.textContent = editingOriginalName ? "Update Member" : "Save Member";
  }

  function findRosterMemberByName(name) {
    const normalizedName = normalizeSearchText(name);
    return roster.find(
      (member) => normalizeSearchText(member.name) === normalizedName,
    );
  }

  function renderMemberNameOptions() {
    memberNameList.replaceChildren(
      ...roster.map((member) => {
        const option = document.createElement("option");
        option.value = member.name || "";
        return option;
      }),
    );
  }

  function appendCell(row, tagName, text, className) {
    const cell = document.createElement(tagName);
    cell.textContent = text;
    if (className) {
      cell.className = className;
    }
    row.append(cell);
    return cell;
  }

  function getInitials(name) {
    return String(name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] || "")
      .join("")
      .toUpperCase();
  }

  function appendMemberNameCell(row, member) {
    const cell = document.createElement("td");
    const wrap = document.createElement("div");
    const initials = document.createElement("span");
    const name = document.createElement("span");

    cell.dataset.label = "Name";
    wrap.className = "member-name-cell";
    initials.className = "member-initials";
    initials.textContent = getInitials(member.name) || "?";
    name.className = "member-name-text";
    name.textContent = member.name || "";

    wrap.append(initials, name);
    cell.append(wrap);
    row.append(cell);
    return cell;
  }

  function getVenmoUrl(value) {
    const handle = normalizeVenmoHandle(value);
    if (!handle) {
      return "";
    }
    return `https://account.venmo.com/u/${handle}`;
  }

  function getMessengerUrl(value) {
    const contact = normalizeMessengerContact(value);
    if (!contact) {
      return "";
    }
    return contact.url;
  }

  function getMessengerDisplayValue(value) {
    const contact = normalizeMessengerContact(value);
    return contact ? contact.url : String(value || "").trim();
  }

  function createMissingContact(fieldName) {
    const missing = document.createElement("span");
    missing.className = `missing-contact missing-${fieldName}`;
    missing.textContent = "Missing";
    return missing;
  }

  function appendLinkCell(row, text, href, warningMessage, fieldName) {
    const cell = document.createElement("td");
    if (text && href) {
      const link = document.createElement("a");
      link.className = "contact-chip";
      link.href = href;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = text;
      cell.append(link);
    } else {
      const fallback = document.createElement("span");
      if (text) {
        fallback.className = "contact-chip muted-contact";
        fallback.textContent = text;
        cell.append(fallback);
      } else {
        cell.append(createMissingContact(fieldName));
      }
    }

    if (warningMessage) {
      const warning = document.createElement("span");
      warning.className = "contact-warning";
      warning.textContent = "!";
      warning.title = warningMessage;
      warning.setAttribute("aria-label", warningMessage);
      cell.append(warning);
    }

    row.append(cell);
    return cell;
  }

  function appendNoteCell(row, member) {
    const cell = document.createElement("td");
    const note = String(member.note || "").trim();

    cell.className = "member-note-cell";
    cell.dataset.label = "Note";

    if (note) {
      const noteText = document.createElement("span");
      noteText.textContent = note;
      cell.append(noteText);
    }

    row.append(cell);
    return cell;
  }

  function normalizeVenmoHandle(value) {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }

    const match = text.match(/^(?:https?:\/\/)?(?:(?:www|account)\.)?venmo\.com\/(?:u\/)?([A-Za-z0-9_.-]+)\/?$/i);
    const handle = match ? match[1] : text.replace(/^@/, "");
    return /^[A-Za-z0-9_.-]{2,30}$/.test(handle) ? handle : "";
  }

  function normalizeMessengerContact(value) {
    const text = String(value || "").trim();
    if (!text) {
      return null;
    }

    const messengerMatch = text.match(
      /^(?:https?:\/\/)?m\.me\/([A-Za-z0-9._-]{3,80})\/?(?:[?#].*)?$/i,
    );
    if (messengerMatch) {
      const handle = messengerMatch[1];
      const url = `https://www.facebook.com/${handle}`;
      return {
        value: url,
        url,
      };
    }

    const profileIdMatch = text.match(
      /^(?:https?:\/\/)?(?:(?:www|m)\.)?(?:facebook|fb)\.com\/profile\.php\?id=([0-9]+)(?:[&#].*)?$/i,
    );
    if (profileIdMatch) {
      const profileId = profileIdMatch[1];
      const url = `https://www.facebook.com/profile.php?id=${profileId}`;
      return { value: url, url };
    }

    const facebookMatch = text.match(
      /^(?:https?:\/\/)?(?:(?:www|m)\.)?(?:facebook|fb)\.com\/([A-Za-z0-9._-]{3,80})\/?(?:[?#].*)?$/i,
    );
    const handle = facebookMatch ? facebookMatch[1] : text.replace(/^@/, "");
    return /^[A-Za-z0-9._-]{3,80}$/.test(handle) &&
      handle.toLowerCase() !== "profile.php"
      ? {
          value: `https://www.facebook.com/${handle}`,
          url: `https://www.facebook.com/${handle}`,
        }
      : null;
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  function getVisibleRoster() {
    const query = normalizeSearchText(memberSearch.value);
    if (!query) {
      return roster;
    }

    return roster.filter((member) =>
      [member.name, member.venmo, member.zelle, member.messenger, member.note].some(
        (value) => normalizeSearchText(value).includes(query),
      ),
    );
  }

  function getMissingMemberInfo(member) {
    return [
      ["Venmo", member.venmo],
      ["Facebook", member.messenger],
      ["Note", member.note],
    ]
      .filter((entry) => !String(entry[1] || "").trim())
      .map((entry) => entry[0]);
  }

  function renderRoster() {
    const visibleRoster = getVisibleRoster();
    memberCount.textContent =
      visibleRoster.length === roster.length
        ? roster.length === 1
          ? "1 member"
          : `${roster.length} members`
        : `${visibleRoster.length} of ${roster.length} members`;

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const headers = adminToken
      ? ["Name", "Venmo", "Zelle", "Facebook", "Note", "Actions"]
      : ["Name"];
    headers.forEach((header) => {
      appendCell(headerRow, "th", header);
    });
    thead.append(headerRow);

    const tbody = document.createElement("tbody");
    visibleRoster.forEach((member) => {
      const row = document.createElement("tr");
      const isSelected =
        !adminToken &&
        editingOriginalName &&
        normalizeSearchText(editingOriginalName) === normalizeSearchText(member.name);
      const venmoUrl = getVenmoUrl(member.venmo);
      if (isSelected) {
        row.className = "selected-member-row";
      }
      row.classList.add("member-row");
      row.tabIndex = 0;
      row.addEventListener("click", (event) => {
        if (event.target.closest("button")) {
          return;
        }
        if (adminToken) {
          fillForm(member, { focusRelevantField: true });
        } else {
          fillMissingInfoForm(member);
        }
      });
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (adminToken) {
            fillForm(member, { focusRelevantField: true });
          } else {
            fillMissingInfoForm(member);
          }
        }
      });
      appendMemberNameCell(row, member);
      if (adminToken) {
        appendLinkCell(
          row,
          member.venmo || "",
          venmoUrl,
          member.venmo && !venmoUrl
            ? "Invalid Venmo handle or profile URL. Use a normal hyphen, not a long dash."
            : "",
          "venmo",
        ).dataset.label = "Venmo";
        appendLinkCell(row, member.zelle || "", "", "", "zelle").dataset.label =
          "Zelle";
        const messengerUrl = getMessengerUrl(member.messenger);
        appendLinkCell(
          row,
          getMessengerDisplayValue(member.messenger),
          messengerUrl,
          member.messenger && !messengerUrl
            ? "Invalid Facebook profile URL. Use a profile URL or plain profile handle."
            : "",
          "facebook",
        ).dataset.label = "Facebook";
        appendNoteCell(row, member);
      }
      if (adminToken) {
        const actions = document.createElement("td");
        const removeButton = document.createElement("button");

        actions.className = "roster-actions-cell";
        actions.dataset.label = "Actions";
        const actionsWrap = document.createElement("div");
        actionsWrap.className = "roster-actions";

        removeButton.className = "secondary-button inline-button danger-button";
        removeButton.type = "button";
        removeButton.textContent = "Remove";
        removeButton.addEventListener("click", () => {
          removeMember(member.name);
        });

        actionsWrap.append(removeButton);
        actions.append(actionsWrap);
        row.append(actions);
      }
      tbody.append(row);
    });

    memberTable.replaceChildren(thead, tbody);
  }

  async function loadRoster() {
    setStatus("Loading roster...", "");
    try {
      const result = await requestAppsScript({
        action: "listRoster",
      });
      roster = Array.isArray(result.roster) ? result.roster : [];
      renderMemberNameOptions();
      renderRoster();
      setStatus("Roster loaded.", "success");
    } catch (error) {
      memberCount.textContent = "Could not load roster";
      setStatus(error.message, "error");
    }
  }

  async function saveMember(payload) {
    saveButton.disabled = true;
    setStatus("Saving member...", "");

    try {
      if (!adminToken) {
        throw new Error("Admin login is required to manage members.");
      }
      const result = await requestAppsScript({
        action: "saveRosterMember",
        adminToken,
        ...payload,
      });
      roster = Array.isArray(result.roster) ? result.roster : [];
      refreshPublicRsvpRosterCache();
      renderMemberNameOptions();
      renderRoster();
      clearForm();
      const renameCounts = result.renameCounts || {};
      const rsvpRows = Number(renameCounts.rsvpRows || 0);
      const auditRows = Number(renameCounts.auditRows || 0);
      const auditExistingRows = Number(renameCounts.auditExistingRows || 0);
      const exportRows = Number(renameCounts.exportRows || 0);
      const renamedMessage = [
        "Renamed member.",
        `${rsvpRows} RSVP row${rsvpRows === 1 ? "" : "s"}`,
        `${auditRows} audit row${auditRows === 1 ? "" : "s"}`,
        `${auditExistingRows} audit detail row${
          auditExistingRows === 1 ? "" : "s"
        }`,
        `${exportRows} exported report row${exportRows === 1 ? "" : "s"}`,
      ].join(" ");
      const updatedFields = Array.isArray(result.updatedFields)
        ? result.updatedFields.filter(Boolean)
        : [];
      const messages = {
        completed:
          updatedFields.length > 0
            ? `Added missing ${updatedFields.join(", ")}.`
            : "Added missing member info.",
        created: "Added member.",
        updated: "Updated member.",
        renamed: renamedMessage,
      };
      setStatus(messages[result.action] || "Saved member.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      updateSaveButtonLabel();
    }
  }

  async function removeMember(playerName) {
    if (!adminToken) {
      setStatus("Log in as admin before removing members.", "error");
      return;
    }

    if (!window.confirm(`Remove ${playerName} from the roster?`)) {
      return;
    }

    setStatus("Removing member...", "");
    try {
      const result = await requestAppsScript({
        action: "removeRosterMember",
        adminToken,
        playerName,
      });
      roster = Array.isArray(result.roster) ? result.roster : [];
      refreshPublicRsvpRosterCache();
      renderMemberNameOptions();
      renderRoster();
      clearForm();
      setStatus(
        result.removed ? "Removed member." : "Member was not on the roster.",
        "success",
      );
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const payload = {
      playerName: nameInput.value.trim(),
      venmo: venmoInput.value.trim(),
      zelle: zelleInput.value.trim(),
      messenger: messengerInput.value.trim(),
      note: noteInput.value.trim(),
    };

    if (!payload.playerName) {
      setStatus("Enter a member name.", "error");
      return;
    }

    if (!adminToken) {
      setStatus("Admin login is required to manage members.", "error");
      return;
    }

    if (payload.venmo) {
      const venmoHandle = normalizeVenmoHandle(payload.venmo);
      if (!venmoHandle) {
        setStatus("Enter a valid Venmo handle or Venmo profile URL.", "error");
        return;
      }
      payload.venmo = `@${venmoHandle}`;
    }

    if (payload.messenger) {
      const messengerContact = normalizeMessengerContact(payload.messenger);
      if (!messengerContact) {
        setStatus("Enter a valid Facebook profile URL or profile handle.", "error");
        return;
      }
      payload.messenger = messengerContact.url;
    }
    if (isRenamingMember()) {
      payload.oldPlayerName = editingOriginalName;
    }

    saveMember(payload);
  });

  nameInput.addEventListener("input", () => {
    updateSaveButtonLabel();
    if (!adminToken) {
      renderRoster();
    }
  });

  nameInput.addEventListener("change", () => {
    const member = findRosterMemberByName(nameInput.value);
    if (member) {
      fillForm(member);
      renderRoster();
    }
  });

  memberSearch.addEventListener("input", () => {
    renderRoster();
  });

  function handleAdminStateChange(state) {
    adminToken = state.token || "";
    renderAdminState();
    // Member management (and the contact data it loads) is admin-only. Only
    // fetch the roster when logged in as admin; otherwise keep it empty.
    if (adminToken) {
      loadRoster();
    } else {
      roster = [];
      renderMemberNameOptions();
      renderRoster();
    }
  }

  adminAuth.onChange(handleAdminStateChange);
  window.addEventListener("storage", (event) => {
    if (event.key === "play-rsvp.adminAuth") {
      window.location.reload();
    }
  });
})();
