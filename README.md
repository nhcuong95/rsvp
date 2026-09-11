# Play RSVP

Static RSVP page for weekly play sessions.

## What it does

- Player name is limited to a fixed roster dropdown.
- Date uses one-tap options for the next Tuesday, Thursday, Friday, and Sunday, plus an optional calendar picker.
- Reserved spots defaults to `1` for the player; increase it to include guests.
- Reserved spots `0` means not going and removes that player/date reservation.
- Submit writes to Google Sheets through Apps Script.
- Dedup key is `Play Date + normalized Player Name`; duplicate submissions update the existing row.
- Existing RSVPs show a confirmation dialog before they are overwritten.
- After submit and when the date changes, the page shows the reserved participant tally for that date.
- `export.html` exports a selected month, then renders clickable group heatmap and player-filtered overview.
- `billing.html` renders monthly billing from attendance, editable field blocks, extras purchases, and local payment statuses.
- `admin.html` lets an admin edit the current month attendance in a player-by-date table.
- `roster.html` lets an admin add, remove, and update roster Venmo and Messenger details.

## Recommended Hosting

Use GitHub Pages for the static website and Google Apps Script as the free backend that writes to Google Sheets.

GitHub Pages can host `index.html`, `styles.css`, and `app.js` for free, but it cannot safely store Google credentials or update a private Sheet by itself. Apps Script fills that backend role and runs as the Google account that owns the Sheet.

## Repo Layout

- `index.html`, `app.js`, `styles.css`: public RSVP page.
- `admin.html`, `admin.js`: admin page for editing player/date attendance counts.
- `roster.html`, `roster.js`: admin page for roster membership, Venmo, and Messenger details.
- `export.html`, `export.js`: admin page for monthly roster export.
- `billing.html`, `billing.js`: billing page for field block entry, extras cost entry, and member balance calculation.
- `billing-parser.js`: parser for old finalized monthly billing CSVs, kept for reconciliation/testing.
- `google-apps-script/Code.gs`: Apps Script backend source. Paste this into Apps Script and deploy it as the Web App backend.

## Google Sheets Setup

1. Create or open the Google Sheet that should store RSVPs.
2. In the Sheet, open `Extensions > Apps Script`.
3. Paste the contents of `google-apps-script/Code.gs`.
4. Deploy with `Deploy > New deployment > Web app`.
5. Set `Execute as` to yourself.
6. Set `Who has access` to the people who should RSVP. If players are outside your Google Workspace, use `Anyone`.
7. Copy the Web App URL.
8. In `app.js`, set:

```js
const APPS_SCRIPT_URL = "YOUR_WEB_APP_URL";
```

Also set the same Web App URL in `export.js`.

The fixed player roster lives in two places and must stay in sync:

- `app.js`: client-side searchable player list.
- `google-apps-script/Code.gs`: server-side roster validation and export columns.

## GitHub Pages Setup

1. Create a GitHub repository.
2. Put the site files at the repository root.
3. Commit and push.
4. In GitHub, open `Settings > Pages`.
5. Under `Build and deployment`, select `Deploy from a branch`.
6. Choose the main branch and `/root`.
7. Open the published GitHub Pages URL.

## Install And Continue Development

```bash
git clone https://github.com/someguylike/rsvp.git
cd rsvp
```

This is a static site. No package install is required. Open `index.html` directly, or run a tiny local server:

```bash
python3 -m http.server 8000
```

Then open:

- RSVP page: `http://localhost:8000/`
- Admin add page: `http://localhost:8000/admin.html`
- Roster management page: `http://localhost:8000/roster.html`
- Export page: `http://localhost:8000/export.html`
- Billing page: `http://localhost:8000/billing.html`
- Browser tests: `http://localhost:8000/tests/rsvp-rules.test.html`
- Billing parser tests: `http://localhost:8000/tests/billing-parser.test.html`

Development workflow:

1. Edit `index.html`, `app.js`, `admin.html`, `admin.js`, `roster.html`, `roster.js`, `export.html`, `export.js`, or `styles.css`.
2. If frontend assets change, bump the query string on the referenced JS/CSS file in the HTML to avoid stale GitHub Pages/browser cache.
3. If backend behavior changes, edit `google-apps-script/Code.gs`.
4. Paste the full `Code.gs` into Apps Script.
5. Deploy a **New version** of the Apps Script Web App.
6. Commit and push changes to `main`.

```bash
git status
git add .
git commit -m "Describe the change"
git push
```

GitHub Pages will publish from `main` after a short delay.

## Apps Script Backend Notes

The backend source is intentionally checked into this public repo.

- `google-apps-script/rsvp-web-app/Code.gs`: small public RSVP backend for `index.html` only.
- `google-apps-script/Code.gs`: full admin backend for roster, report, billing, backfill, and admin tools.

Use two Apps Script Web App deployments so the hot RSVP form does not cold-start the larger Billing/export/admin backend.

Full admin backend deployment is manual:

1. Open the RSVP Google Sheet.
2. Go to `Extensions > Apps Script`.
3. Replace `Code.gs` with the repo version.
4. Click Save.
5. Go to `Deploy > Manage deployments`.
6. Edit the Web App deployment.
7. Select **New version**.
8. Deploy.

The full admin backend Web App URL must stay in:

- `admin-auth.js`
- `admin.js`
- `backfill-finalized.js`
- `billing.js`
- `export.js`
- `roster.js`

RSVP backend deployment is also manual:

1. Open the same RSVP Google Sheet.
2. Create a separate Apps Script project for the RSVP Web App, or open the existing RSVP-only project if it already exists.
3. Replace its `Code.gs` with `google-apps-script/rsvp-web-app/Code.gs`.
4. If the project is standalone, set script property `RSVP_SPREADSHEET_ID` to the RSVP Google Sheet ID.
5. Click Save.
6. Deploy it as a Web App with the same access settings as the current public backend.
7. Copy the RSVP Web App URL into `app.js` as `APPS_SCRIPT_URL`.
8. Bump the `app.js` query string in `index.html`.
9. Commit and push the URL/cachebuster change.

## Production Reset

Before launching for real use, clear testing RSVP rows from the Google Sheet:

1. Open the RSVP Google Sheet.
2. Go to `Extensions > Apps Script`.
3. Replace `Code.gs` with the repo version and save.
4. In the function dropdown, choose `resetRsvpDataForProduction`.
5. Click Run.
6. Deploy a **New version** of the Web App.

This removes all rows below the `RSVPs` header and removes old extra columns.

## Admin Export

Open `export.html`, choose a month, and click `Export Month`. After export, the page shows a shareable month URL like `export.html?month=2026-06`; opening that URL renders the saved export tab when it is current, or a live preview if the saved tab is missing current RSVP dates.

The export writes to the spreadsheet ID configured in `google-apps-script/Code.gs` as `EXPORT_SPREADSHEET_ID`.

Each export recreates the selected month tab as a clean attendance table. It does not copy existing formatting or formulas.

Output format:

- Tab name: `Month YYYY`, for example `March 2026`.
- Row 1: `Name` plus play dates with at least 2 participants.
- Rows: one row per player.
- Cell value: blank when not joining, otherwise the total reserved spots for that player.

## Notes From Tool Research

- Google Forms is append-first. It does not natively upsert by `player + date`.
- Tally/Jotform can create nicer forms and sync to Sheets, but true dedupe/update still needs automation.
- Team tools like BenchApp handle RSVP per player/event well, but they are not Sheets-first.
- A custom static page plus Apps Script is the simplest free path that preserves your exact UX and Google Sheet ownership.
