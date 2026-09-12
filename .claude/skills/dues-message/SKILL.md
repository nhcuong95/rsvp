---
name: dues-message
description: Write a paste-ready soccer dues message that lists the unpaid people (and what each owes) for a given month, to post in the Facebook Messenger group chat. Use when asked to draft/generate the monthly dues, remind who hasn't paid, or make a "who owes" message for a month (live from the billing backend, or from a finalized CSV).
---

# Dues message for the group chat

Generate a plain-text message listing everyone who still owes for a month, ready
to paste into the Messenger group chat. Facebook Messenger does not render
Markdown, so the output is deliberately plain text with a few emoji. Each unpaid
line shows the player's play dates with per-date fees, plus `paid X, missing Y
of <total>` so people can reconcile which session they missed.

## Data sources

The script picks a source automatically for a month token:

- **Live backend (default for current/open months):** queries the Apps Script
  Web App used by `billing.html` and computes balances the same way the billing
  page does — including per-player **Paid** status, so paid members are dropped
  automatically. Used when there is no local CSV for the month.
- **Finalized CSV:** a file in `data/` (e.g. `data/04_2026.csv`). Used when that
  CSV exists, or when a CSV path is passed directly. CSVs have no Paid status, so
  use `--paid` to drop people who have settled.

`--live` always forces the live backend even if a CSV exists.

## How to run

From the repo root (`rsvp/`), run the helper script with the month:

```bash
node .claude/skills/dues-message/generate-dues-message.js 2026-08
```

The month argument accepts any of:
- `2026-08` (ISO year-month)
- `08_2026` (the CSV file stem)
- a direct path like `./data/04_2026.csv`

Print the resulting message back to the user in a fenced code block so it is
easy to copy, and tell them to paste it into the Messenger group chat. The live
path prints a `Note:` to stderr when the month is still in draft (not finalized).

## Reminder mode (only the stragglers)

The live path already excludes members marked Paid. To drop additional names
(e.g. someone who just paid), pass `--paid` (comma-separated, case-insensitive):

```bash
node .claude/skills/dues-message/generate-dues-message.js 2026-08 --paid "Thong Le, Cơ Trần"
```

## Overriding the payment target

The payment target defaults to the group's collector — Venmo `@nhcuong95`,
Zelle `7744208189` (Cuong Tipu) — matching `billing.js`. Override if needed:

```bash
node .claude/skills/dues-message/generate-dues-message.js 2026-08 --venmo somehandle --zelle 5551234567 --recipient "Some Name"
```

## Notes

- The live path needs network access and Node 18+ (uses global `fetch`); it reads
  `APPS_SCRIPT_URL` straight from `billing.js` so it can't drift.
- Payments are stored as one lump-sum credit per player, not per date, so the
  message shows every date's fee plus paid/missing totals rather than labeling a
  specific unpaid date.
- If everyone is paid up, the script says so instead of printing an empty list.
- This produces text for a human to paste. There is no supported way to have a
  bot auto-post into a Messenger group chat; posting stays a manual send.
- The billing page has the same generator as a **Copy dues for Messenger** button
  (`billing.html`), which respects each player's Paid status live.
