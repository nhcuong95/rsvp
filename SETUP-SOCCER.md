# Soccer RSVP — Setup Guide

Your fork is a static website (hosted free on GitHub Pages) that reads and writes a
**Google Sheet** through **Google Apps Script**. There are two small backends by design:

- **RSVP backend** — public, locked down. Handles player sign-ups and the "who's in" tally.
- **Admin backend** — password-protected. Powers the Members, Report, Billing, and Admin pages.

Both talk to the **same** Google Sheet.

Do these steps in order. When you finish Part 2 and Part 3, send me the two Web App URLs
and I'll wire them into the code for you.

---

## Part 1 — Create the Google Sheet

1. Go to <https://sheets.google.com> and create a **blank** spreadsheet.
2. Name it something like `Soccer RSVP`.
3. Copy its **Sheet ID** from the URL. The URL looks like:
   `https://docs.google.com/spreadsheets/d/`**`THIS_LONG_ID_HERE`**`/edit`
   Save that ID — you'll paste it in Part 3.

> You don't need to add any tabs or headers — the scripts create them automatically on first run.

---

## Part 2 — RSVP backend (public)

1. Go to <https://script.google.com> → **New project**.
2. Delete the sample code. Paste the entire contents of
   `google-apps-script/rsvp-web-app/Code.gs` from this repo.
3. Left sidebar → **Project Settings** (gear icon) → **Script Properties** → **Add script property**:
   - Property: `RSVP_SPREADSHEET_ID`
   - Value: *your Sheet ID from Part 1*
4. **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**  ← required so players don't need a Google login
5. Authorize when prompted (it's your own script).
6. Copy the **Web app URL** (ends in `/exec`). This is your **RSVP URL**.

---

## Part 3 — Admin backend (password-protected)

1. Back in your **Google Sheet**, open **Extensions → Apps Script**. (This creates a
   script *bound* to the sheet — that's intentional; it's different from Part 2.)
2. Delete the sample code. Paste the entire contents of `google-apps-script/Code.gs`.
3. Near the top, line 10, change the hardcoded Sheet ID to **yours**:
   ```js
   const EXPORT_SPREADSHEET_ID = "PASTE_YOUR_SHEET_ID_HERE";
   ```
4. **Project Settings → Script Properties → Add script property**:
   - Property: `ADMIN_PASSWORD`
   - Value: *a password you choose* (this is what unlocks the admin pages — pick something
     only organizers know)
5. **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Authorize when prompted.
7. Copy the **Web app URL** (ends in `/exec`). This is your **ADMIN URL**.

---

## Part 4 — Send me the URLs (I finish the code)

Send me:
- **RSVP URL** (from Part 2)
- **ADMIN URL** (from Part 3)

I'll paste them into the 7 JavaScript files that need them, commit, and push. (Right now
those files still point at the original owner's backend, so this step is required before the
site works for your group.)

---

## Part 5 — Publish the website (GitHub Pages)

1. Go to your repo: <https://github.com/nhcuong95/rsvp>
2. **Settings → Pages**.
3. Under "Build and deployment": Source = **Deploy from a branch**, Branch = **main**,
   Folder = **/ (root)** → **Save**.
4. Wait ~1 minute. Your site goes live at:
   **https://nhcuong95.github.io/rsvp/**
5. Share that link with your players. They open it, search their name, pick a date, submit.

Organizers use the same link + the **Admin / Billing / Members** tabs, entering the
`ADMIN_PASSWORD` when prompted.

---

## Notes

- **Play days** are set to **Tuesday, Thursday, Saturday** (the quick-pick date buttons).
- **Roster** is your 30 players. Once the app is live you can also add/remove members from the
  **Members** page instead of editing code.
- If you ever change the Apps Script code, you must **Deploy → Manage deployments → Edit →
  New version** for changes to take effect (a fresh "New deployment" makes a *new* URL).
