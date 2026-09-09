---
name: dues-message
description: Write a paste-ready badminton dues message that lists the unpaid people (and what each owes) for a given month, to post in the Facebook Messenger group chat. Use when asked to draft/generate the monthly dues, remind who hasn't paid, or make a "who owes" message from a billing CSV.
---

# Dues message for the group chat

Generate a plain-text message listing everyone who still owes for a month, ready
to paste into the Messenger group chat. Facebook Messenger does not render
Markdown, so the output is deliberately plain text with a few emoji.

The numbers come from the finalized monthly billing CSVs in `data/` (e.g.
`data/04_2026.csv`) — the same files the billing page reads. Each member's
`MEMBER PAY` column is the amount owed; anyone with a positive balance is unpaid.

## How to run

From the repo root (`rsvp/`), run the helper script with the month:

```bash
node .claude/skills/dues-message/generate-dues-message.js 2026-04
```

The month argument accepts any of:
- `2026-04` (ISO year-month)
- `04_2026` (the CSV file stem)
- a direct path like `./data/04_2026.csv`

Print the resulting message back to the user in a fenced code block so it is
easy to copy, and tell them to paste it into the Messenger group chat.

## Reminder mode (only the stragglers)

For a follow-up reminder that leaves out people who have already paid, pass their
names with `--paid` (comma-separated, matched case-insensitively):

```bash
node .claude/skills/dues-message/generate-dues-message.js 2026-04 --paid "Harvey Le, Son Nguyen"
```

## Overriding the payment target

The payment target defaults to the group's collector — Venmo `@nhcuong95`,
Zelle `7744208189` (Cuong Tipu) — matching `billing.js`. Override if needed:

```bash
node .claude/skills/dues-message/generate-dues-message.js 2026-04 --venmo somehandle --zelle 5551234567 --recipient "Some Name"
```

## Notes

- If a month's CSV is missing, list `data/` and ask which month to use.
- If everyone is paid up, the script says so instead of printing an empty list.
- This produces text for a human to paste. There is no supported way to have a
  bot auto-post into a Messenger group chat; posting stays a manual send.
- The live billing page has the same generator as a **Copy dues for Messenger**
  button (`billing.html`), which also respects each player's Paid status. Use
  this skill when working from an exported/finalized CSV instead of the app.
