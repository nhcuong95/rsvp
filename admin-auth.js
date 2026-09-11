(function () {
  const APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbyc_NEAxzm_0R2Mp05vHYURAHKNYqvjccBFTBh7JAgi7UThHi-W3F-2qM9akXiyrdJGMg/exec";
  const ADMIN_AUTH_KEY = "play-rsvp.adminAuth";

  let adminToken = "";
  let expiresAt = 0;
  const listeners = new Set();
  const REQUEST_TIMEOUT_MS = 12000;

  function readAdminAuth() {
    try {
      const auth = JSON.parse(localStorage.getItem(ADMIN_AUTH_KEY));
      return auth && auth.token ? auth : null;
    } catch {
      return null;
    }
  }

  function writeAdminAuth(auth) {
    localStorage.setItem(ADMIN_AUTH_KEY, JSON.stringify(auth));
  }

  function clearAdminAuth() {
    adminToken = "";
    expiresAt = 0;
    localStorage.removeItem(ADMIN_AUTH_KEY);
  }

  function getState() {
    return {
      token: adminToken,
      expiresAt,
      isLoggedIn: Boolean(adminToken),
    };
  }

  function applyBodyAdminClass() {
    if (document.body) {
      document.body.classList.toggle("is-admin", Boolean(adminToken));
    }
  }

  function notify() {
    applyBodyAdminClass();
    const state = getState();
    listeners.forEach((listener) => listener(state));
  }

  function buildAppsScriptUrl(payload, callbackName) {
    const url = new URL(APPS_SCRIPT_URL);
    url.searchParams.set("callback", callbackName);
    Object.entries(payload).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });
    return url.toString();
  }

  function requestAppsScript(payload) {
    return new Promise((resolve, reject) => {
      const callbackName = `adminAuthCallback_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`;
      const script = document.createElement("script");
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Request timed out"));
      }, REQUEST_TIMEOUT_MS);

      function cleanup() {
        window.clearTimeout(timeout);
        script.remove();
        delete window[callbackName];
      }

      window[callbackName] = (parsed) => {
        cleanup();
        if (parsed?.ok) {
          resolve(parsed);
          return;
        }
        reject(new Error(parsed?.error || "Request failed"));
      };
      script.onerror = () => {
        cleanup();
        reject(new Error("Unable to reach Apps Script"));
      };
      script.referrerPolicy = "no-referrer";
      script.src = buildAppsScriptUrl(payload, callbackName);
      document.head.append(script);
    });
  }

  async function login(password) {
    const result = await requestAppsScript({
      action: "adminLogin",
      password,
    });
    adminToken = result.token;
    expiresAt = Number(result.expiresAt || 0);
    writeAdminAuth({
      token: adminToken,
      expiresAt,
    });
    notify();
    return getState();
  }

  function logout() {
    clearAdminAuth();
    notify();
  }

  async function validateStoredAuth() {
    const auth = readAdminAuth();
    if (!auth?.token) {
      clearAdminAuth();
      notify();
      return getState();
    }

    try {
      await requestAppsScript({
        action: "validateAdmin",
        adminToken: auth.token,
      });
      adminToken = auth.token;
      expiresAt = Number(auth.expiresAt || 0);
    } catch {
      clearAdminAuth();
    }

    notify();
    return getState();
  }

  function onChange(listener) {
    listeners.add(listener);
    listener(getState());
    return () => listeners.delete(listener);
  }

  // Optimistically mark admin if a token is stored, so admin-only UI does not
  // flash hidden on load for a logged-in admin. validateStoredAuth() corrects
  // this (removing the class) if the token turns out to be invalid.
  const storedAuth = readAdminAuth();
  if (storedAuth && storedAuth.token && document.body) {
    document.body.classList.add("is-admin");
  }

  const ready = validateStoredAuth();

  window.RsvpAdminAuth = {
    getState,
    login,
    logout,
    onChange,
    ready,
  };
})();
