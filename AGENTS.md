# AGENTS.md

Deployment guide for the Soccer RSVP app. Read this before shipping any change.

## Architecture

Static front-end (GitHub Pages) + **two** separate Google Apps Script Web App
backends. Deploys are **manual** — there is no `clasp` setup in this repo.

| Piece | Source | Hosting |
| --- | --- | --- |
| Front-end (HTML/CSS/JS) | repo root (`index.html`, `app.js`, `export.js`, …) | GitHub Pages, `main` branch, `/` root |
| RSVP form backend | `google-apps-script/rsvp-web-app/Code.gs` | Apps Script project **"Soccer RSVP backend"** (standalone) |
| Admin/export/billing backend | `google-apps-script/Code.gs` | Apps Script project **"Soccer RSVP admin"** (bound to the RSVP Google Sheet) |

Two backends exist on purpose so the hot RSVP form does not cold-start the
larger admin/billing/export backend.

### Which front-end file calls which backend

Each front-end file hard-codes its backend's Web App URL as `APPS_SCRIPT_URL`
(`https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`).

| Front-end file(s) | Backend | Deployment ID (prefix) |
| --- | --- | --- |
| `app.js` (RSVP form) | Soccer RSVP backend | `AKfycbxKfZ8FlMDgVJ5weT9rOmFbfPlExX0DIFNuvCuvumkFUBgGu1Jzc77_utdzp_JghDyL` |
| `admin.js`, `export.js`, `billing.js`, `roster.js`, `backfill-finalized.js` | Soccer RSVP admin | `AKfycbyc_NEAxzm_0R2Mp05vHYURAHKNYqvjccBFTBh7JAgi7UThHi-W3F-2qM9akXiyrdJGMg` |

## Deploying a backend change (`*.gs`)

1. **Open the right project** at <https://script.google.com/home/my>:
   - Admin backend → **"Soccer RSVP admin"** (or the RSVP Google Sheet →
     `Extensions > Apps Script`).
   - RSVP form backend → **"Soccer RSVP backend"**.
2. **Confirm you're in the right project** before touching anything — compare the
   header constants against the repo file (e.g. the admin backend has
   `EXPORT_SPREADSHEET_ID`, `BILLING_*`, `PLAY_DAYS = [2, 4, 6]`).
3. In the editor, select all in `Code.gs`, paste the **full** repo file, and
   **Save** (`Cmd/Ctrl+S`). Wait for "Saved to Drive".
4. `Deploy` ▸ **Manage deployments** ▸ **Edit** (pencil icon) ▸ set
   **Version = "New version"** ▸ **Deploy**.
5. **⚠️ Never use "New deployment".** It mints a *new* URL and breaks every
   front-end file that points at the old one. Editing the existing deployment
   keeps the same Deployment ID.
6. After deploying, confirm the dialog's **Deployment ID is unchanged** and
   still matches the `macros/s/<ID>/exec` URL in the front-end file(s) above.

## Deploying a front-end change (HTML/CSS/JS)

GitHub Pages publishes from `main` automatically — just commit and push.

**After editing any JS/CSS file, bump its `?v=` cache-buster** in every HTML file
that references it, or Pages/browsers serve stale assets. Convention:
`?v=YYYYMMDD-N` (e.g. `./export.js?v=20260916-1`). Find references with:

```bash
grep -rn "export.js?v=" *.html
```

## Verify after deploying

- **Backend:** exercise the affected page end to end (e.g. Report tab ▸
  **Recreate Latest Report**; RSVP submit for the form backend).
- **Client timeouts (JSONP):** `export.js` uses 15s for view loads and 60s for
  report recreate; `app.js`/`admin.js` use their own. A "Request timed out"
  error is the client giving up, not necessarily a server failure.

## Git

Solo repo (`origin` = `github.com/nhcuong95/rsvp.git`), commits go straight to
`main`. End commit messages with:

```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
