(function () {
  const APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbxKfZ8FlMDgVJ5weT9rOmFbfPlExX0DIFNuvCuvumkFUBgGu1Jzc77_utdzp_JghDyL/exec";
  // Admin backend (locking is an admin-only action handled there).
  const ADMIN_APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbyc_NEAxzm_0R2Mp05vHYURAHKNYqvjccBFTBh7JAgi7UThHi-W3F-2qM9akXiyrdJGMg/exec";
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
  const LAST_RSVP_KEY = "play-rsvp.lastRsvp";
  const LAST_PLAYER_KEY = "play-rsvp.lastPlayerName";
  const ROSTER_CONTACTS_KEY = "play-rsvp.rosterContacts";
  const BROWSER_ID_KEY = "play-rsvp.browserId";
  const DISPLAY_LOCALE = "en-US";
  const PLAY_DAYS = [2, 4, 6]; // Tuesday, Thursday, Saturday
  // Weather forecast shown on each voting date chip (Open-Meteo, no API key).
  // Each date's forecast is fetched for its own field: the saved address is
  // geocoded (OpenStreetMap Nominatim) and the forecast pulled for that point.
  // These coordinates are the FALLBACK used when a date has no address or the
  // geocode fails (the group's play area, Mercer Island / Seattle, WA).
  const WEATHER_LAT = 47.5707;
  const WEATHER_LON = -122.2221;
  const WEATHER_TIMEZONE = "America/Los_Angeles";
  // Open-Meteo only forecasts ~16 days out; dates beyond that just show no
  // weather. Cache forecasts per coordinate for an hour so revisits/date
  // changes stay cheap; geocoded addresses are cached for the whole session.
  const WEATHER_FORECAST_DAYS = 16;
  const WEATHER_CACHE_MS = 60 * 60 * 1000;
  const FETCH_TIMEOUT_MS = 45000;
  const JSONP_TIMEOUT_MS = 45000;
  const PARTICIPANT_OPTIONS = [
    { value: "0", label: "Not going", isUnvote: true },
    { value: "1", label: "Just me" },
    { value: "2", label: "Me + 1" },
    { value: "3", label: "Me + 2" },
    { value: "4", label: "Me + 3" },
    { value: "5", label: "Me + 4" },
  ];
  const rsvpRules = window.RsvpRules;

  const form = document.querySelector("#rsvp-form");
  const playerInput = document.querySelector("#player-name");
  const playerList = document.querySelector("#player-list");
  const playerMemory = document.querySelector("#player-memory");
  const changePlayerButton = document.querySelector("#change-player-button");
  const rsvpDetails = document.querySelector("#rsvp-details");
  const dateInput = document.querySelector("#play-date");
  const dateOptions = document.querySelector("#date-options");
  const customDateField = document.querySelector("#custom-date-field");
  const customDateInput = document.querySelector("#custom-play-date");
  const participantInput = document.querySelector("#participant-count");
  const status = document.querySelector("#status");
  const submitButton = document.querySelector("#submit-button");
  const removeRsvpButton = document.querySelector("#remove-rsvp-button");
  const tallySection = document.querySelector("#tally-section");
  const tallyTitle = document.querySelector("#tally-title");
  const tallyCount = document.querySelector("#tally-count");
  const tallyList = document.querySelector("#tally-list");
  const adminLockBar = document.querySelector("#admin-lock-bar");
  const adminLockStatus = document.querySelector("#admin-lock-status");
  const adminLockToggle = document.querySelector("#admin-lock-toggle");
  const adminDateToggle = document.querySelector("#admin-date-toggle");
  const adminFieldName = document.querySelector("#admin-field-name");
  const adminAddress = document.querySelector("#admin-address");
  const adminStartTime = document.querySelector("#admin-start-time");
  const adminEndTime = document.querySelector("#admin-end-time");
  const adminSaveDateDetails = document.querySelector("#admin-save-date-details");
  const dateInfo = document.querySelector("#date-info");
  const dateInfoLocation = document.querySelector("#date-info-location");
  const dateInfoLocationText = document.querySelector("#date-info-location-text");
  const dateInfoMap = document.querySelector("#date-info-map");
  const dateInfoTime = document.querySelector("#date-info-time");
  const dateInfoTimeText = document.querySelector("#date-info-time-text");
  let adminToken = "";
  const overrideDialog = document.querySelector("#override-dialog");
  const previousRsvp = document.querySelector("#previous-rsvp");
  const newRsvp = document.querySelector("#new-rsvp");
  const cancelOverride = document.querySelector("#cancel-override");
  const confirmOverride = document.querySelector("#confirm-override");
  let pendingOverridePayload = null;
  let latestTallyRequest = 0;
  const dateLockCache = new Map();
  const dateDetailsByDate = new Map();
  const weatherByDate = new Map();
  const geocodeCache = new Map(); // address key -> Promise<{lat, lon} | null>
  const forecastCache = new Map(); // "lat,lon" -> { at, promise: Map<date, info> }
  let openDates = [];
  let rememberedPlayerName = "";
  let selectedPlayerName = "";
  let lastSubmittedPayload = null;
  let publicIpPromise = null;
  let activePlayerOptionIndex = -1;
  const rosterContactsByName = new Map();
  const rosterContactsByNormalizedName = new Map();

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

  function readString(key) {
    return localStorage.getItem(key) || "";
  }

  function writeString(key, value) {
    localStorage.setItem(key, value);
  }

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getNextPlayDate() {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    for (let offset = 0; offset <= 21; offset += 1) {
      const candidate = new Date(today);
      candidate.setDate(today.getDate() + offset);
      const playStart = new Date(candidate);
      playStart.setHours(6, 0, 0, 0);
      if (PLAY_DAYS.includes(candidate.getDay()) && playStart > now) {
        return candidate;
      }
    }

    return getUpcomingPlayDates(1)[0] || new Date();
  }

  function getUpcomingPlayDates(count) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dates = [];

    for (let offset = 0; offset <= 21 && dates.length < count; offset += 1) {
      const candidate = new Date(today);
      candidate.setDate(today.getDate() + offset);
      if (PLAY_DAYS.includes(candidate.getDay())) {
        dates.push(candidate);
      }
    }

    return dates;
  }

  function formatDateOption(date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfThisWeek = new Date(today);
    const daysUntilSunday = (7 - today.getDay()) % 7;
    endOfThisWeek.setDate(today.getDate() + daysUntilSunday);

    const day = date.toLocaleDateString(DISPLAY_LOCALE, { weekday: "long" });
    const full = date.toLocaleDateString(DISPLAY_LOCALE, {
      month: "short",
      day: "numeric",
    });
    if (date < today) {
      return {
        day: day,
        full,
      };
    }

    const prefix = date <= endOfThisWeek ? "This" : "Next";

    return {
      day:
        date.getTime() === today.getTime()
          ? "Today"
          : `${prefix} ${day}`,
      full,
    };
  }

  function formatSubmitDateLine(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
      return "";
    }

    const label = formatDateOption(new Date(`${value}T00:00:00`));
    return `${label.day} · ${label.full}`;
  }

  function selectPlayDate(value, options) {
    const isCustom = Boolean(options?.isCustom);
    dateInput.value = value;
    if (isCustom && customDateInput && customDateInput.value !== value) {
      customDateInput.value = value;
    }
    customDateField?.classList.toggle("active", isCustom);
    dateOptions.querySelectorAll(".date-option").forEach((button) => {
      const isActive =
        button.dataset.date === value ||
        (isCustom && button.dataset.date === "custom");
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-checked", String(isActive));
    });
    setRemoveRsvpAction(null);
    renderParticipantOptions();
    updatePlayerMemory();
    updateDateInfo();
    updateAdminLockBar();
    loadTally(value);
  }

  function selectCustomDateOption() {
    customDateField?.classList.add("active");
    dateInput.value = customDateInput?.value || "";
    latestTallyRequest += 1;
    setRemoveRsvpAction(null);
    renderParticipantOptions();
    updatePlayerMemory();
    updateDateInfo();
    updateAdminLockBar();
    tallyCount.textContent = "Choose a date";
    tallyList.replaceChildren();
    dateOptions.querySelectorAll(".date-option").forEach((button) => {
      const isActive = button.dataset.date === "custom";
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-checked", String(isActive));
    });
    customDateInput?.focus();
    customDateInput?.showPicker?.();
  }

  // Map a WMO weather code (returned by Open-Meteo) to a compact emoji plus a
  // spoken-friendly label used for the chip's title/aria description.
  function describeWeatherCode(code) {
    const map = {
      0: ["☀️", "Clear"],
      1: ["🌤️", "Mostly sunny"],
      2: ["⛅", "Partly cloudy"],
      3: ["☁️", "Overcast"],
      45: ["🌫️", "Fog"],
      48: ["🌫️", "Fog"],
      51: ["🌦️", "Light drizzle"],
      53: ["🌦️", "Drizzle"],
      55: ["🌦️", "Heavy drizzle"],
      56: ["🌧️", "Freezing drizzle"],
      57: ["🌧️", "Freezing drizzle"],
      61: ["🌧️", "Light rain"],
      63: ["🌧️", "Rain"],
      65: ["🌧️", "Heavy rain"],
      66: ["🌧️", "Freezing rain"],
      67: ["🌧️", "Freezing rain"],
      71: ["🌨️", "Light snow"],
      73: ["🌨️", "Snow"],
      75: ["🌨️", "Heavy snow"],
      77: ["🌨️", "Snow grains"],
      80: ["🌦️", "Light showers"],
      81: ["🌦️", "Showers"],
      82: ["⛈️", "Heavy showers"],
      85: ["🌨️", "Snow showers"],
      86: ["🌨️", "Snow showers"],
      95: ["⛈️", "Thunderstorm"],
      96: ["⛈️", "Thunderstorm w/ hail"],
      99: ["⛈️", "Thunderstorm w/ hail"],
    };
    return map[code] || ["🌡️", "Weather"];
  }

  // Build the visible text + accessible label for one date's forecast, or null
  // when we have no forecast for that date (too far out, or fetch failed).
  function weatherSummaryFor(value) {
    const info = weatherByDate.get(value);
    if (!info) {
      return null;
    }
    const [icon, condition] = describeWeatherCode(info.code);
    const hi = Number.isFinite(info.high) ? `${Math.round(info.high)}°` : "";
    const lo = Number.isFinite(info.low) ? `${Math.round(info.low)}°` : "";
    const temp = hi && lo ? `${hi}/${lo}` : hi || lo;
    const showRain = Number.isFinite(info.precip) && info.precip >= 20;
    const text = [temp, showRain ? `☔ ${Math.round(info.precip)}%` : ""]
      .filter(Boolean)
      .join(" · ");
    const rainLabel = Number.isFinite(info.precip)
      ? `, ${Math.round(info.precip)}% chance of rain`
      : "";
    const tempLabel = hi && lo ? `, high ${hi}, low ${lo}` : temp ? `, ${temp}` : "";
    return { icon, text, label: `${condition}${tempLabel}${rainLabel}` };
  }

  // Add or refresh the little weather line on each date chip. Runs after the
  // chips are (re)built and again once a forecast arrives, without re-rendering
  // the chips (so the current selection and tally are left untouched).
  function decorateDateOptionsWithWeather() {
    dateOptions
      .querySelectorAll(".date-option[data-date]")
      .forEach((button) => {
        const value = button.dataset.date;
        if (!value || value === "custom") {
          return;
        }
        const summary = weatherSummaryFor(value);
        let line = button.querySelector(".date-weather");
        if (!summary) {
          if (line) {
            line.remove();
          }
          return;
        }
        if (!line) {
          line = document.createElement("span");
          line.className = "date-weather";
          button.append(line);
        }
        line.textContent = summary.text
          ? `${summary.icon} ${summary.text}`
          : summary.icon;
        line.title = summary.label;
        line.setAttribute("aria-label", `Forecast: ${summary.label}`);
      });
  }

  // Geocode a field address to coordinates via OpenStreetMap Nominatim (free,
  // CORS-enabled). Cached per address for the session; resolves null on any
  // miss so the caller can fall back to the default coordinate.
  function geocodeAddress(query) {
    const key = query.trim().toLowerCase();
    if (!key) {
      return Promise.resolve(null);
    }
    if (geocodeCache.has(key)) {
      return geocodeCache.get(key);
    }
    const params = new URLSearchParams({
      q: query,
      format: "json",
      limit: "1",
    });
    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
    // Keep the default referrer so Nominatim can attribute the request to this
    // site (its usage policy expects an identifying Referer). force-cache lets
    // the browser reuse a geocode result across reloads.
    const promise = withTimeout(
      fetch(url, { cache: "force-cache", credentials: "omit" })
        .then((response) => (response.ok ? response.json() : null))
        .then((rows) => {
          const hit = Array.isArray(rows) ? rows[0] : null;
          const lat = Number(hit?.lat);
          const lon = Number(hit?.lon);
          return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
        }),
      6000,
      null,
    );
    geocodeCache.set(key, promise);
    return promise;
  }

  // Fetch the daily forecast for one coordinate as a Map<date, info>. Cached
  // per coordinate for an hour.
  function fetchForecastForCoord(lat, lon) {
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    const now = Date.now();
    const cached = forecastCache.get(key);
    if (cached && now - cached.at < WEATHER_CACHE_MS) {
      return cached.promise;
    }
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      daily:
        "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      temperature_unit: "celsius",
      timezone: WEATHER_TIMEZONE,
      forecast_days: String(WEATHER_FORECAST_DAYS),
    });
    const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
    const promise = withTimeout(
      fetch(url, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          const daily = data?.daily;
          const times = Array.isArray(daily?.time) ? daily.time : [];
          const byDate = new Map();
          times.forEach((date, index) => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
              return;
            }
            byDate.set(String(date), {
              code: Number(daily.weather_code?.[index]),
              high: Number(daily.temperature_2m_max?.[index]),
              low: Number(daily.temperature_2m_min?.[index]),
              precip: Number(daily.precipitation_probability_max?.[index]),
            });
          });
          return byDate;
        }),
      8000,
      new Map(),
    );
    forecastCache.set(key, { at: now, promise });
    return promise;
  }

  // For every open date, fetch the forecast at that date's own field (its saved
  // address, geocoded) and paint the chips. Dates that share a field are
  // geocoded/fetched once; dates with no address use the fallback coordinate.
  // Safe to call repeatedly — geocodes and forecasts are cached.
  async function loadWeather() {
    const groups = new Map();
    openDates.forEach((date) => {
      const { fieldName, address } = getDateDetail(date);
      const key = `${address}|${fieldName}`.toLowerCase();
      if (!groups.has(key)) {
        groups.set(key, { fieldName, address, dates: [] });
      }
      groups.get(key).dates.push(date);
    });
    if (!groups.size) {
      return;
    }
    await Promise.all(
      [...groups.values()].map(async ({ fieldName, address, dates }) => {
        // Nominatim resolves a clean street address well but chokes on a
        // "Field Name, 123 St" combo, so try the address first, then the field
        // name as a place, then fall back to the group's default coordinate.
        let geo = address ? await geocodeAddress(address) : null;
        if (!geo && fieldName) {
          geo = await geocodeAddress(fieldName);
        }
        const lat = geo ? geo.lat : WEATHER_LAT;
        const lon = geo ? geo.lon : WEATHER_LON;
        const byDate = await fetchForecastForCoord(lat, lon);
        dates.forEach((date) => {
          if (byDate.has(date)) {
            weatherByDate.set(date, byDate.get(date));
          }
        });
        // Paint as each field resolves so weather appears progressively.
        decorateDateOptionsWithWeather();
      }),
    );
    decorateDateOptionsWithWeather();
  }

  function pickDefaultOpenDate() {
    if (!openDates.length) {
      return "";
    }
    const today = formatDate(new Date());
    const upcoming = openDates.find((value) => value >= today);
    return upcoming || openDates[openDates.length - 1];
  }

  function renderDateOptions() {
    if (customDateInput) {
      customDateInput.min = rsvpRules.getStartOfMonthValue();
    }
    // Dates shown are the ones an admin has opened for RSVP (fetched into
    // openDates), not an auto-generated Tue/Thu/Sat list.
    dateOptions.replaceChildren(
      ...openDates.map((value) => {
        const date = new Date(`${value}T00:00:00`);
        const label = formatDateOption(date);
        const button = document.createElement("button");
        const day = document.createElement("span");
        const full = document.createElement("span");

        button.type = "button";
        button.className = "date-option";
        button.dataset.date = value;
        button.setAttribute("role", "radio");
        button.setAttribute("aria-checked", "false");
        day.className = "date-day";
        full.className = "date-full";
        day.textContent = label.day;
        full.textContent = label.full;

        button.append(day, full);
        button.addEventListener("click", () => {
          selectPlayDate(value);
        });
        return button;
      }),
    );

    const otherButton = document.createElement("button");
    const otherTitle = document.createElement("span");

    otherButton.type = "button";
    otherButton.className = "date-option";
    otherButton.dataset.date = "custom";
    otherButton.setAttribute("role", "radio");
    otherButton.setAttribute("aria-checked", "false");
    otherTitle.className = "date-day";
    otherTitle.textContent = "Other date";
    otherButton.append(otherTitle);
    otherButton.addEventListener("click", () => {
      selectCustomDateOption();
    });
    dateOptions.append(otherButton);

    // Paint any already-cached forecast onto the freshly built chips; a
    // pending/first fetch repaints them when it resolves.
    decorateDateOptionsWithWeather();

    // Keep the current selection if it is still a valid open date; otherwise
    // fall back to the default open date (leaving nothing selected if the admin
    // has not opened any dates yet — members can still use "Other date").
    const current = dateInput.value;
    if (current && (openDates.includes(current) || current === customDateInput?.value)) {
      selectPlayDate(current, { isCustom: current === customDateInput?.value });
    } else {
      const def = pickDefaultOpenDate();
      if (def) {
        selectPlayDate(def);
      }
    }
  }

  async function loadPlayDates(attempt) {
    try {
      const result = await requestAppsScript({ action: "listPlayDates" });
      openDates = Array.isArray(result.dates)
        ? result.dates.filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort()
        : [];
      setDateDetails(result.dateDetails);
      renderDateOptions();
      // Now that dates and their field addresses are known, fetch per-field
      // weather and paint it onto the chips.
      loadWeather();
    } catch (error) {
      // The first request often times out while the Apps Script backend cold
      // starts; retry a couple of times so dates (and the field/time info) show
      // up for everyone, not just whoever already warmed the backend.
      if ((attempt || 0) < 2) {
        window.setTimeout(() => loadPlayDates((attempt || 0) + 1), 1500);
        return;
      }
      openDates = [];
      renderDateOptions();
    }
  }

  // Replace the cached field details for every date from a backend
  // `dateDetails` array (older backends omit it, so we simply keep nothing).
  function setDateDetails(details) {
    dateDetailsByDate.clear();
    if (!Array.isArray(details)) {
      return;
    }
    details.forEach((entry) => {
      const date = String(entry?.date || "");
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        dateDetailsByDate.set(date, {
          fieldName: String(entry.fieldName || "").trim(),
          address: String(entry.address || "").trim(),
          startTime: String(entry.startTime || "").trim(),
          endTime: String(entry.endTime || "").trim(),
        });
      }
    });
  }

  function getDateDetail(playDate) {
    return (
      dateDetailsByDate.get(playDate) || {
        fieldName: "",
        address: "",
        startTime: "",
        endTime: "",
      }
    );
  }

  // "8:00 PM - 10:00 PM", or just one side when only one is set.
  function formatTimeRange(startTime, endTime) {
    if (startTime && endTime) {
      return `${startTime} - ${endTime}`;
    }
    return startTime || endTime || "";
  }

  // Player-facing "where & when" block under the date picker. Hidden entirely
  // when the selected date has no field, address, or time set.
  function updateDateInfo() {
    if (!dateInfo) {
      return;
    }
    const { fieldName, address, startTime, endTime } = getDateDetail(dateInput.value);
    const locationLabel = [fieldName, address].filter(Boolean).join(" · ");
    const mapQuery = [fieldName, address].filter(Boolean).join(", ");
    const timeLabel = formatTimeRange(startTime, endTime);
    const hasLocation = Boolean(locationLabel);
    const hasTime = Boolean(timeLabel);

    if (dateInfoLocation) {
      dateInfoLocation.hidden = !hasLocation;
      if (dateInfoLocationText) {
        dateInfoLocationText.textContent = locationLabel;
      }
      if (dateInfoMap) {
        if (mapQuery) {
          dateInfoMap.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`;
          dateInfoMap.hidden = false;
        } else {
          dateInfoMap.hidden = true;
        }
      }
    }
    if (dateInfoTime) {
      dateInfoTime.hidden = !hasTime;
      if (dateInfoTimeText) {
        dateInfoTimeText.textContent = timeLabel;
      }
    }
    dateInfo.hidden = !(hasLocation || hasTime);
  }

  // Fill the start/end <select>s with 30-minute options (12:00 AM–11:30 PM)
  // plus a blank "—" default. Called once on init.
  function populateTimeOptions() {
    [adminStartTime, adminEndTime].forEach((select) => {
      if (!select) {
        return;
      }
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "—";
      select.append(blank);
      for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
        const hour24 = Math.floor(minutes / 60);
        const minute = minutes % 60;
        const period = hour24 < 12 ? "AM" : "PM";
        const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
        const label = `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
        const option = document.createElement("option");
        option.value = label;
        option.textContent = label;
        select.append(option);
      }
    });
  }

  // Keep the admin inputs in sync with the selected date, unless the admin is
  // actively editing a text field (don't clobber mid-typing).
  function prefillAdminDateDetails() {
    const { fieldName, address, startTime, endTime } = getDateDetail(dateInput.value);
    if (adminFieldName && document.activeElement !== adminFieldName) {
      adminFieldName.value = fieldName;
    }
    if (adminAddress && document.activeElement !== adminAddress) {
      adminAddress.value = address;
    }
    if (adminStartTime) {
      adminStartTime.value = startTime;
    }
    if (adminEndTime) {
      adminEndTime.value = endTime;
    }
  }

  function canSelectNotGoing(playDate) {
    // A date is only closed to drop-outs when the admin has manually locked it.
    // The lock flag arrives with the tally; unknown dates default to open, and
    // the server is the final authority on submit.
    return !playDate || dateLockCache.get(playDate) !== true;
  }

  function requestAdminLock(payload) {
    return new Promise((resolve, reject) => {
      const callbackName = `playRsvpLock_${Date.now()}_${Math.random()
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
        } else {
          reject(new Error(response?.error || "Lock update failed"));
        }
      };
      script.onerror = () => {
        cleanup();
        reject(new Error("Could not reach Apps Script"));
      };
      const url = new URL(ADMIN_APPS_SCRIPT_URL);
      url.searchParams.set("callback", callbackName);
      Object.entries(payload).forEach(([key, value]) => {
        url.searchParams.set(key, String(value));
      });
      script.src = url.toString();
      document.body.append(script);
    });
  }

  function updateAdminLockBar() {
    if (!adminLockBar) {
      return;
    }
    const playDate = dateInput.value;
    const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(playDate || "");
    if (!adminToken || !isValidDate) {
      adminLockBar.hidden = true;
      return;
    }

    adminLockBar.hidden = false;
    const locked = dateLockCache.get(playDate) === true;
    adminLockStatus.textContent = locked ? "🔒 Locked" : "🔓 Unlocked";
    adminLockStatus.classList.toggle("is-locked", locked);
    adminLockToggle.textContent = locked ? "Unlock this date" : "Lock this date";
    adminLockToggle.classList.toggle("is-locked", locked);

    if (adminDateToggle) {
      const listed = openDates.includes(playDate);
      adminDateToggle.textContent = listed
        ? "Remove from RSVP list"
        : "Add to RSVP list";
      adminDateToggle.classList.toggle("is-listed", listed);
    }

    prefillAdminDateDetails();
  }

  async function toggleSelectedDateInList() {
    const playDate = dateInput.value;
    if (!adminToken || !/^\d{4}-\d{2}-\d{2}$/.test(playDate || "")) {
      return;
    }
    const nextListed = !openDates.includes(playDate);
    adminDateToggle.disabled = true;
    adminDateToggle.textContent = nextListed ? "Adding..." : "Removing...";
    try {
      const result = await requestAdminLock({
        action: "setPlayDate",
        adminToken,
        playDate,
        open: nextListed ? "true" : "false",
      });
      openDates = Array.isArray(result.dates)
        ? result.dates.filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v)).sort()
        : openDates;
      if (result.dateDetails) {
        setDateDetails(result.dateDetails);
      }
      renderDateOptions();
      updateDateInfo();
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      adminDateToggle.disabled = false;
      updateAdminLockBar();
    }
  }

  async function saveSelectedDateDetails() {
    const playDate = dateInput.value;
    if (!adminToken || !/^\d{4}-\d{2}-\d{2}$/.test(playDate || "")) {
      return;
    }
    const fieldName = (adminFieldName?.value || "").trim();
    const address = (adminAddress?.value || "").trim();
    const startTime = (adminStartTime?.value || "").trim();
    const endTime = (adminEndTime?.value || "").trim();
    const originalLabel = adminSaveDateDetails.textContent;
    adminSaveDateDetails.disabled = true;
    adminSaveDateDetails.textContent = "Saving...";
    try {
      const result = await requestAdminLock({
        action: "savePlayDateDetails",
        adminToken,
        playDate,
        fieldName,
        address,
        startTime,
        endTime,
      });
      if (result.dateDetails) {
        setDateDetails(result.dateDetails);
      } else {
        dateDetailsByDate.set(playDate, { fieldName, address, startTime, endTime });
      }
      if (Array.isArray(result.dates)) {
        openDates = result.dates
          .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v))
          .sort();
        renderDateOptions();
      }
      updateDateInfo();
      // The field/address may have changed, so refresh this date's forecast.
      loadWeather();
      setStatus("Field and time saved.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      adminSaveDateDetails.disabled = false;
      adminSaveDateDetails.textContent = originalLabel;
      updateAdminLockBar();
    }
  }

  async function toggleSelectedDateLock() {
    const playDate = dateInput.value;
    if (!adminToken || !/^\d{4}-\d{2}-\d{2}$/.test(playDate || "")) {
      return;
    }
    const nextLocked = dateLockCache.get(playDate) !== true;
    adminLockToggle.disabled = true;
    adminLockToggle.textContent = nextLocked ? "Locking..." : "Unlocking...";
    try {
      const result = await requestAdminLock({
        action: "setDateLock",
        adminToken,
        playDate,
        locked: nextLocked ? "true" : "false",
      });
      dateLockCache.set(playDate, Boolean(result.locked));
      renderParticipantOptions();
      if (dateInput.value === playDate) {
        loadTally(playDate);
      }
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      adminLockToggle.disabled = false;
      updateAdminLockBar();
    }
  }

  function renderParticipantOptions() {
    const previousValue = participantInput.value || "1";
    const availableOptions = PARTICIPANT_OPTIONS.filter(
      (option) => !option.isUnvote || canSelectNotGoing(dateInput.value),
    );

    participantInput.replaceChildren(
      ...availableOptions.map((participantOption) => {
        const option = document.createElement("option");
        option.value = participantOption.value;
        option.textContent = participantOption.label;
        return option;
      }),
    );

    participantInput.value = availableOptions.some(
      (participantOption) => participantOption.value === previousValue,
    )
      ? previousValue
      : "1";
  }

  function renderPlayerOptions() {
    renderPlayerMatches("");
  }

  function getPlayerMatches(query) {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) {
      return rememberedPlayerName ? [rememberedPlayerName] : [];
    }

    return prioritizeRememberedPlayer(
      PLAYERS.filter((name) =>
        normalizeSearchText(name).includes(normalizedQuery),
      ),
    ).slice(0, 8);
  }

  function prioritizeRememberedPlayer(names) {
    if (!rememberedPlayerName) return names;
    const remembered = names.find((name) => name === rememberedPlayerName);
    if (!remembered) return names;
    return [remembered, ...names.filter((name) => name !== remembered)];
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  function hidePlayerList() {
    activePlayerOptionIndex = -1;
    playerInput.removeAttribute("aria-activedescendant");
    playerInput.setAttribute("aria-expanded", "false");
    playerList.hidden = true;
    playerList.style.display = "none";
  }

  function updatePlayerMemory() {
    if (!playerMemory) return;
    const currentName = playerInput.value.trim();
    const selectedValidName =
      selectedPlayerName && currentName === selectedPlayerName && isValidPlayerName(currentName);
    const changedFromRemembered =
      selectedValidName && rememberedPlayerName && currentName !== rememberedPlayerName;

    playerMemory.classList.toggle("warning", Boolean(changedFromRemembered));
    if (changePlayerButton) {
      changePlayerButton.hidden = !selectedValidName;
    }

    if (!currentName && rememberedPlayerName) {
      const lastUsedButton = document.createElement("button");
      lastUsedButton.type = "button";
      lastUsedButton.className = "last-used-player-button";
      lastUsedButton.textContent = rememberedPlayerName;
      lastUsedButton.addEventListener("click", () => {
        selectPlayerName(rememberedPlayerName, { scrollToDetails: true });
      });

      playerMemory.hidden = false;
      playerMemory.replaceChildren(
        document.createTextNode("Last used: "),
        lastUsedButton,
      );
    } else if (changedFromRemembered) {
      playerMemory.hidden = false;
      playerMemory.replaceChildren(
        document.createTextNode("Warning: selected "),
        createSubmitName(currentName),
        document.createTextNode(`, not your last used name ${rememberedPlayerName}.`),
      );
      const identityHint = createPlayerIdentityHint(currentName);
      if (identityHint) {
        playerMemory.append(document.createTextNode(" "), identityHint);
      }
    } else if (selectedValidName) {
      playerMemory.hidden = false;
      playerMemory.replaceChildren();
      const identityHint = createPlayerIdentityHint(currentName);
      if (identityHint) {
        playerMemory.append(identityHint);
      } else {
        playerMemory.hidden = true;
      }
    } else if (currentName) {
      playerMemory.hidden = false;
      playerMemory.textContent = "Choose the matching name from the list before submitting.";
    } else {
      playerMemory.hidden = true;
      playerMemory.textContent = "";
    }

    updateSubmitButton(selectedValidName ? currentName : "");
    updateSectionVisibility(selectedValidName);
  }

  function updateSubmitButton(playerName) {
    submitButton.replaceChildren();
    if (!playerName) {
      submitButton.textContent = "Submit RSVP";
      return;
    }

    const count = Number(participantInput.value || 1);
    const countText = count === 1 ? "1 spot" : `${count} spots`;
    const actionLine = document.createElement("span");
    const dateLine = document.createElement("span");

    actionLine.className = "submit-action-line";
    actionLine.append(
      document.createTextNode(count === 0 ? "Mark not going for " : `Reserve ${countText} for `),
      createSubmitName(playerName),
    );
    submitButton.append(actionLine);

    const submitDate = formatSubmitDateLine(dateInput.value);
    if (submitDate) {
      dateLine.className = "submit-date-line";
      dateLine.textContent = submitDate;
      submitButton.append(dateLine);
    }
  }

  function updateSectionVisibility(showDetails) {
    if (rsvpDetails) {
      rsvpDetails.hidden = !showDetails;
    }
    if (tallySection) {
      // Show the roster for the selected date even before a player picks their
      // name, so people can see who's already joined without signing in.
      tallySection.hidden = !dateInput.value;
    }
  }

  function createSubmitName(name) {
    const nameElement = document.createElement("span");
    nameElement.className = "submit-player-name";
    nameElement.textContent = name;
    return nameElement;
  }

  function createPlayerIdentityHint(name) {
    const hints = getPlayerIdentityHints(name);
    if (hints.length === 0) {
      return null;
    }

    const hint = document.createElement("span");
    hint.className = "player-identity-hint";
    hint.textContent = hints.join(", ");
    return hint;
  }

  function getPlayerIdentityHints(name) {
    const member =
      rosterContactsByName.get(name) ||
      rosterContactsByNormalizedName.get(normalizeSearchText(name));
    if (!member) {
      return [];
    }

    return [
      formatFacebookHint(member.messenger),
    ].filter(Boolean);
  }

  function setRosterContacts(roster) {
    rosterContactsByName.clear();
    rosterContactsByNormalizedName.clear();
    roster.forEach((member) => {
      const name = String(member.name || "").trim();
      if (name) {
        rosterContactsByName.set(name, member);
        rosterContactsByNormalizedName.set(normalizeSearchText(name), member);
      }
    });
  }

  function restoreRosterContacts() {
    const cachedRoster = readJson(ROSTER_CONTACTS_KEY, []);
    if (Array.isArray(cachedRoster) && cachedRoster.length > 0) {
      setRosterContacts(cachedRoster);
    }
  }

  function cacheRosterContacts(roster) {
    const contacts = roster
      .map((member) => ({
        name: String(member.name || "").trim(),
        messenger: String(member.messenger || "").trim(),
      }))
      .filter((member) => member.name);
    writeJson(ROSTER_CONTACTS_KEY, contacts);
  }

  function formatFacebookHint(value) {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }

    const profileIdMatch = text.match(/[?&]id=([0-9]+)/i);
    if (profileIdMatch) {
      return `FB: ${profileIdMatch[1]}`;
    }

    const pathMatch = text.match(
      /^(?:https?:\/\/)?(?:(?:www|m)\.)?(?:facebook|fb)\.com\/([^/?#]+)/i,
    );
    const handle = pathMatch ? pathMatch[1] : text.replace(/^@/, "");
    return handle ? `FB: ${handle}` : "";
  }

  function rememberPlayerName(name) {
    if (!isValidPlayerName(name)) return;
    rememberedPlayerName = name;
    writeString(LAST_PLAYER_KEY, name);
  }

  function selectPlayerName(name, options) {
    playerInput.value = name;
    selectedPlayerName = name;
    updatePlayerMemory();
    hidePlayerList();
    if (!options?.keepFocus) {
      playerInput.blur();
    }
    if (options?.scrollToDetails && isMobileViewport()) {
      window.setTimeout(() => {
        rsvpDetails?.scrollIntoView({ block: "start", behavior: "smooth" });
      }, 160);
    }
  }

  function renderPlayerMatches(query) {
    const matches = getPlayerMatches(query);
    activePlayerOptionIndex = -1;
    playerInput.removeAttribute("aria-activedescendant");
    playerList.replaceChildren(
      ...matches.map((name, index) => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "player-option";
        option.id = `player-option-${index}`;
        option.dataset.name = name;
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", "false");
        option.textContent = name;
        option.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          event.stopPropagation();
          selectPlayerName(name, { scrollToDetails: true });
        });
        option.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          selectPlayerName(name, { scrollToDetails: true });
        });
        option.addEventListener("mouseenter", () => {
          setActivePlayerOption(index);
        });
        return option;
      }),
    );
    playerList.setAttribute("role", "listbox");
    playerList.hidden = matches.length === 0;
    playerList.style.display = matches.length === 0 ? "none" : "grid";
    playerInput.setAttribute("aria-expanded", String(matches.length > 0));
  }

  function getPlayerOptionButtons() {
    return Array.from(playerList.querySelectorAll(".player-option"));
  }

  function setActivePlayerOption(index) {
    const options = getPlayerOptionButtons();
    if (options.length === 0) {
      activePlayerOptionIndex = -1;
      playerInput.removeAttribute("aria-activedescendant");
      return;
    }

    activePlayerOptionIndex = Math.max(0, Math.min(index, options.length - 1));
    options.forEach((option, optionIndex) => {
      const isActive = optionIndex === activePlayerOptionIndex;
      option.classList.toggle("active", isActive);
      option.setAttribute("aria-selected", String(isActive));
    });
    playerInput.setAttribute(
      "aria-activedescendant",
      options[activePlayerOptionIndex].id,
    );
    options[activePlayerOptionIndex].scrollIntoView({ block: "nearest" });
  }

  function moveActivePlayerOption(offset) {
    if (playerList.hidden) {
      renderPlayerMatches(playerInput.value);
    }

    const options = getPlayerOptionButtons();
    if (options.length === 0) {
      return;
    }

    const nextIndex =
      activePlayerOptionIndex < 0
        ? offset > 0
          ? 0
          : options.length - 1
        : (activePlayerOptionIndex + offset + options.length) % options.length;
    setActivePlayerOption(nextIndex);
  }

  function selectActivePlayerOption() {
    const options = getPlayerOptionButtons();
    const option =
      options[activePlayerOptionIndex] ||
      (!playerList.hidden && options.length === 1 ? options[0] : null);

    if (!option?.dataset.name) {
      return false;
    }

    selectPlayerName(option.dataset.name, { scrollToDetails: true });
    return true;
  }

  function isValidPlayerName(name) {
    return PLAYERS.some((player) => player === name);
  }

  function exactPlayerMatch(value) {
    const normalizedValue = normalizeSearchText(value);
    if (!normalizedValue) return "";
    const matches = PLAYERS.filter((player) => normalizeSearchText(player) === normalizedValue);
    return matches.length === 1 ? matches[0] : "";
  }

  function setStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type || ""}`.trim();
  }

  function setStatusWithLink(message, linkText, href, type) {
    const link = document.createElement("a");
    status.textContent = `${message} `;
    status.className = `status ${type || ""}`.trim();
    link.href = href;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = linkText;
    status.append(link);
  }

  function setRemoveRsvpAction(payload) {
    lastSubmittedPayload = payload;
    const hasActiveRsvp = Boolean(payload && Number(payload.participantCount) > 0);
    submitButton.hidden = hasActiveRsvp;

    if (!removeRsvpButton) return;
    if (!hasActiveRsvp) {
      removeRsvpButton.hidden = true;
      removeRsvpButton.textContent = "Made a mistake? Remove this RSVP";
      return;
    }
    removeRsvpButton.hidden = false;
    removeRsvpButton.textContent = `Made a mistake? Remove RSVP for ${payload.playerName} on ${formatShortDisplayDate(payload.playDate)}`;
  }

  function formatShortDisplayDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
      return value || "selected date";
    }
    const date = new Date(`${value}T00:00:00`);
    return date.toLocaleDateString(DISPLAY_LOCALE, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  function collectPayload() {
    const formData = new FormData(form);
    return {
      playerName: String(formData.get("playerName") || "").trim(),
      playDate: String(formData.get("playDate") || ""),
      participantCount: Number.parseInt(
        String(formData.get("participantCount") || "1"),
        10,
      ),
      submittedAt: new Date().toISOString(),
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
    };
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

  async function enrichPayloadWithAuditMetadata(payload) {
    const publicIp = await getPublicIpInfo();
    return {
      ...payload,
      clientPublicIp: publicIp.ip,
      clientPublicIpSource: publicIp.source,
    };
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

  function getClientDeviceClass() {
    const userAgent = navigator.userAgent || "";
    const hasCoarsePointer =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    const narrowViewport = Math.min(window.innerWidth || 0, window.innerHeight || 0) <= 820;
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

  function focusPlayerInput() {
    if (document.activeElement === playerInput) return;
    playerInput.focus({ preventScroll: true });
    playerInput.select?.();
  }

  function formatParticipantCount(count) {
    return count === 1 ? "1 participant" : `${count} participants`;
  }

  function renderRsvpDetails(container, rsvp) {
    const detailsSource = rsvp || {};
    const participantCount = Math.max(
      0,
      Number(detailsSource.participantCount || 0),
    );
    const details = [
      ["Player", detailsSource.playerName],
      ["Date", detailsSource.playDate],
      [
        "Reserved spots",
        participantCount > 0 ? formatParticipantCount(participantCount) : "0",
      ],
    ];

    container.replaceChildren(
      ...details.map(([label, value]) => {
        const row = document.createElement("div");
        const term = document.createElement("dt");
        const description = document.createElement("dd");

        term.textContent = label;
        description.textContent = String(value || "-");
        row.append(term, description);
        return row;
      }),
    );
  }

  function askOverrideConfirmation(existing, payload) {
    const previous = existing || {
      playerName: payload.playerName,
      playDate: payload.playDate,
      participantCount: 0,
    };

    if (
      !overrideDialog ||
      typeof overrideDialog.showModal !== "function" ||
      !previousRsvp ||
      !newRsvp
    ) {
      if (window.confirm("This player already has an RSVP. Update it?")) {
        submitRsvp({
          ...payload,
          confirmOverride: "true",
        });
      } else {
        setStatus("Kept the previous RSVP.", "");
      }
      return;
    }

    pendingOverridePayload = payload;
    renderRsvpDetails(previousRsvp, previous);
    renderRsvpDetails(newRsvp, payload);
    overrideDialog.showModal();
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
    if (!APPS_SCRIPT_URL) {
      throw new Error("Missing Apps Script URL in app.js");
    }

    const callbackName = `playRsvpFetch_${Date.now()}_${Math.random()
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
    const text = await response.text();

    if (!response.ok) {
      throw new Error("Could not reach Apps Script");
    }

    const parsed = parseJsonpResponse(text, callbackName);
    if (parsed && parsed.ok) {
      return parsed;
    }

    throw new Error(parsed?.error || "Submission failed");
  }

  function requestViaJsonp(payload) {
    return new Promise((resolve, reject) => {
      if (!APPS_SCRIPT_URL) {
        reject(new Error("Missing Apps Script URL in app.js"));
        return;
      }

      const callbackName = `playRsvpCallback_${Date.now()}_${Math.random()
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
        } else {
          reject(new Error(response?.error || "Submission failed"));
        }
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("Could not reach Apps Script"));
      };
      script.src = buildAppsScriptUrl(payload, callbackName);
      document.body.append(script);
    });
  }

  function requestAppsScript(payload, attempt) {
    return requestViaFetch(payload).catch(() => requestViaJsonp(payload)).catch((error) => {
      if (!attempt) {
        return new Promise((resolve) => {
          window.setTimeout(resolve, 1200);
        }).then(() => requestAppsScript(payload, 1));
      }

      throw error;
    });
  }

  async function submitRsvp(payload) {
    submitButton.disabled = true;
    setStatus("Submitting...", "");

    try {
      const result = await requestAppsScript(payload);

      if (result.action === "needs_confirmation") {
        askOverrideConfirmation(result.existing, payload);
        setStatus("Confirm whether to update the existing RSVP.", "");
        return;
      }

      writeJson(LAST_RSVP_KEY, payload);
      rememberPlayerName(payload.playerName);
      selectedPlayerName = payload.playerName;
      updatePlayerMemory();
      renderTally(result.tally);
      if (result.action === "deleted") {
        setRemoveRsvpAction(null);
        setStatus("Removed your RSVP.", "success");
      } else if (result.action === "not_found") {
        setRemoveRsvpAction(null);
        setStatus("No RSVP was on file for that date.", "");
      } else {
        setRemoveRsvpAction(payload);
        setStatus(
          result.action === "updated"
            ? "Updated your existing RSVP."
            : "RSVP submitted.",
          "success",
        );
      }
    } catch (error) {
      if (error.message === "Could not reach Apps Script") {
        setStatusWithLink(
          "Your browser blocked the embedded submit.",
          "Open fallback submit.",
          buildAppsScriptUrl(payload),
          "error",
        );
        return;
      }

      setStatus(error.message, "error");
    } finally {
      submitButton.disabled = false;
    }
  }

  async function removeExistingRsvp(payload) {
    submitButton.disabled = true;
    if (removeRsvpButton) {
      removeRsvpButton.disabled = true;
    }
    setStatus("Removing RSVP...", "");

    try {
      const result = await requestAppsScript(
        await enrichPayloadWithAuditMetadata({
          action: "delete",
          playerName: payload.playerName,
          playDate: payload.playDate,
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
          submittedAt: new Date().toISOString(),
        }),
      );

      renderTally(result.tally);
      setRemoveRsvpAction(null);
      setStatus("Removed the existing RSVP.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      submitButton.disabled = false;
      if (removeRsvpButton) {
        removeRsvpButton.disabled = false;
      }
    }
  }

  function renderTally(tally) {
    const players = Array.isArray(tally?.players) ? tally.players : [];
    const totalCount = Number(tally?.totalCount || 0);

    if (tallyTitle) {
      tallyTitle.textContent = dateInput.value
        ? `Joining ${formatShortDisplayDate(dateInput.value)}`
        : "Joining this date";
    }

    const base =
      totalCount > 0
        ? formatParticipantCount(totalCount)
        : "No reservations yet";
    tallyCount.textContent = tally?.locked ? `${base} · 🔒 Locked` : base;

    tallyList.replaceChildren(
      ...players.map((player) => {
        const item = document.createElement("li");
        const name = document.createElement("span");
        const participants = document.createElement("span");
        const participantCount = Math.max(1, Number(player.participantCount || 1));

        name.className = "tally-name";
        participants.className = "tally-participants";
        name.textContent = player.name;
        participants.textContent = formatParticipantCount(participantCount);

        item.append(name, participants);
        return item;
      }),
    );
  }

  async function loadTally(playDate, attempt) {
    if (!playDate || !APPS_SCRIPT_URL) {
      return;
    }

    const requestId = latestTallyRequest + 1;
    latestTallyRequest = requestId;

    try {
      tallyCount.textContent = "Loading reservations...";
      tallyList.replaceChildren();
      tallySection?.setAttribute("aria-busy", "true");
      const result = await requestAppsScript({
        action: "list",
        playDate,
      });
      if (requestId !== latestTallyRequest || dateInput.value !== playDate) {
        return;
      }
      tallySection?.removeAttribute("aria-busy");
      dateLockCache.set(playDate, Boolean(result.tally?.locked));
      renderTally(result.tally);
      if (dateInput.value === playDate) {
        renderParticipantOptions();
        updateAdminLockBar();
      }
    } catch (error) {
      if (requestId !== latestTallyRequest || dateInput.value !== playDate) {
        return;
      }
      if (!attempt) {
        window.setTimeout(() => {
          loadTally(playDate, 1);
        }, 1200);
        return;
      }

      tallySection?.removeAttribute("aria-busy");
      tallyCount.textContent = "Could not load reservations. Try refreshing.";
      tallyList.replaceChildren();
    }
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
      setRosterContacts(roster);
      cacheRosterContacts(roster);
      if (names.length > 0) {
        PLAYERS = names;
      }
    } catch {
      // Keep the built-in roster as a fallback when Apps Script is unavailable.
    }
  }

  function isMobileViewport() {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches
    ) || window.innerWidth <= 720;
  }

  function restoreLastPlayer() {
    // Auto-fill of the last-used player name is intentionally disabled:
    // the field always starts empty so players type/pick their own name each time.
  }

  function initialize() {
    restoreRosterContacts();
    restoreLastPlayer();
    populateTimeOptions();
    if (customDateInput) {
      customDateInput.min = rsvpRules.getStartOfMonthValue();
      customDateInput.addEventListener("change", () => {
        if (customDateInput.value) {
          selectPlayDate(customDateInput.value, { isCustom: true });
        }
      });
    }
    renderDateOptions();
    loadPlayDates();

    if (adminLockToggle) {
      adminLockToggle.addEventListener("click", toggleSelectedDateLock);
    }
    if (adminDateToggle) {
      adminDateToggle.addEventListener("click", toggleSelectedDateInList);
    }
    if (adminSaveDateDetails) {
      adminSaveDateDetails.addEventListener("click", saveSelectedDateDetails);
    }
    if (window.RsvpAdminAuth) {
      window.RsvpAdminAuth.onChange((state) => {
        adminToken = state.isLoggedIn ? state.token : "";
        updateAdminLockBar();
      });
    }

    participantInput.value = "1";
    updatePlayerMemory();

    loadRoster().then(() => {
      if (playerInput.value && !selectedPlayerName) {
        const exactMatch = exactPlayerMatch(playerInput.value);
        if (exactMatch) {
          selectPlayerName(exactMatch, { remember: false, keepFocus: true });
        }
      }
      updatePlayerMemory();
      if (document.activeElement === playerInput && !selectedPlayerName) {
        renderPlayerMatches(playerInput.value);
      }
    });

    if (!selectedPlayerName && !isMobileViewport()) {
      focusPlayerInput();
      renderPlayerMatches("");
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = collectPayload();
    if (
      !payload.playerName ||
      !payload.playDate ||
      Number.isNaN(payload.participantCount)
    ) {
      setStatus("Please fill out the required fields.", "error");
      return;
    }

    if (!isValidPlayerName(payload.playerName)) {
      setStatus("Please choose a player from the list.", "error");
      return;
    }

    if (payload.playerName !== selectedPlayerName) {
      setStatus("Please choose your name from the list before submitting.", "error");
      renderPlayerMatches(payload.playerName);
      return;
    }

    payload.participantCount = Math.min(5, Math.max(0, payload.participantCount));
    payload.vote = payload.participantCount > 0 ? "Yes" : "No";

    if (payload.vote === "No" && !canSelectNotGoing(payload.playDate)) {
      setStatus("Not going is closed for this date.", "error");
      renderParticipantOptions();
      updatePlayerMemory();
      return;
    }

    if (
      payload.vote === "Yes" &&
      !rsvpRules.isDateInCurrentMonthOrLater(payload.playDate)
    ) {
      setStatus("Choose a date from this month or later.", "error");
      return;
    }

    submitRsvp(await enrichPayloadWithAuditMetadata(payload));
  });

  playerInput.addEventListener("focus", () => {
    if (selectedPlayerName && playerInput.value.trim() === selectedPlayerName) {
      hidePlayerList();
      return;
    }
    renderPlayerMatches(playerInput.value);
  });

  playerInput.addEventListener("input", () => {
    const exactMatch = exactPlayerMatch(playerInput.value);
    if (exactMatch) {
      playerInput.value = exactMatch;
      selectedPlayerName = exactMatch;
    } else if (playerInput.value.trim() !== selectedPlayerName) {
      selectedPlayerName = "";
    }
    setRemoveRsvpAction(null);
    updatePlayerMemory();
    renderPlayerMatches(playerInput.value);
  });

  playerInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActivePlayerOption(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActivePlayerOption(-1);
      return;
    }

    if (event.key === "Enter" && !playerList.hidden) {
      if (selectActivePlayerOption()) {
        event.preventDefault();
      }
      return;
    }

    if (event.key === "Escape") {
      hidePlayerList();
    }
  });

  participantInput.addEventListener("change", () => {
    setRemoveRsvpAction(null);
    updatePlayerMemory();
  });

  playerInput.addEventListener("blur", () => {
    window.setTimeout(hidePlayerList, 120);
  });

  initialize();

  cancelOverride?.addEventListener("click", () => {
    pendingOverridePayload = null;
    setStatus("Kept the previous RSVP.", "");
  });

  confirmOverride?.addEventListener("click", () => {
    if (!pendingOverridePayload) {
      return;
    }

    const payload = {
      ...pendingOverridePayload,
      confirmOverride: "true",
    };
    pendingOverridePayload = null;
    submitRsvp(payload);
  });

  removeRsvpButton?.addEventListener("click", () => {
    if (!lastSubmittedPayload) {
      return;
    }
    removeExistingRsvp(lastSubmittedPayload);
  });

  changePlayerButton?.addEventListener("click", () => {
    selectedPlayerName = "";
    playerInput.value = "";
    setRemoveRsvpAction(null);
    updatePlayerMemory();
    focusPlayerInput();
    hidePlayerList();
  });
})();
