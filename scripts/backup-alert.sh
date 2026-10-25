#!/usr/bin/env bash
# Raises an alarm when the backup of the platform failed.
#
# It is used as the OnFailure target of the backup unit, so it runs only when
# something went wrong. It never fails itself: a missing webhook must not
# turn a failed backup into a failed alarm.
#
# The alarm is sent to a webhook when BACKUP_ALERT_WEBHOOK_URL is set, and by
# mail when SMTP_URL is set. When neither is set, the alarm is written to the
# journal of the machine, which is the only place an operator can see it.
#
# Usage: scripts/backup-alert.sh [reason]
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REASON="${1:-the backup of the Blipmade platform failed}"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
HOST="$(hostname -f 2>/dev/null || hostname)"

MESSAGE="The backup of the Blipmade platform failed on ${HOST} at ${TIMESTAMP}: ${REASON}"

if [[ -z "${BACKUP_ALERT_WEBHOOK_URL:-}" && -z "${SMTP_URL:-}" ]]; then
  echo "BACKUP-ALERT: ${MESSAGE}" >&2
  echo "BACKUP-ALERT: no BACKUP_ALERT_WEBHOOK_URL and no SMTP_URL are configured," >&2
  echo "BACKUP-ALERT: the alarm was only written to the journal of the machine." >&2
  exit 0
fi

SENT=0

if [[ -n "${BACKUP_ALERT_WEBHOOK_URL:-}" ]]; then
  PAYLOAD="$(printf '{"text":"%s","host":"%s","timestamp":"%s"}' \
    "$(printf '%s' "$MESSAGE" | sed 's/"/\\"/g')" "$HOST" "$TIMESTAMP")"
  CODE="$(curl -sS -m 20 -o /dev/null -w '%{http_code}' \
    -X POST -H 'Content-Type: application/json' \
    --data "$PAYLOAD" "$BACKUP_ALERT_WEBHOOK_URL" 2>/dev/null || echo 000)"
  if [[ "$CODE" =~ ^2 ]]; then
    echo "BACKUP-ALERT: the alarm was sent to the webhook (HTTP $CODE)." >&2
    SENT=1
  else
    echo "BACKUP-ALERT: the webhook answered HTTP ${CODE:-none}." >&2
  fi
fi

if [[ -n "${SMTP_URL:-}" ]] && command -v node >/dev/null 2>&1; then
  # The mail goes through the mailer of the platform, so it uses the same
  # relay and the same configuration as the rest of the platform. The script
  # runs in the directory of the API, because that is where the mailer and
  # its packages live.
  if (cd "$ROOT/api" && node -e '
const { readFileSync } = require("node:fs");
const url = process.env.SMTP_URL;
const message = process.argv[1];
(async () => {
  const nodemailer = await import("nodemailer");
  const parsed = new URL(url);
  const port = parsed.port ? Number(parsed.port) : parsed.protocol === "smtps:" ? 465 : 587;
  const options = {
    host: parsed.hostname,
    port,
    secure: parsed.protocol === "smtps:" || port === 465,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  };
  if (parsed.username) {
    options.auth = {
      user: decodeURIComponent(parsed.username),
      pass: decodeURIComponent(parsed.password),
    };
  }
  // The certificate of the relay is verified and never simply accepted, the
  // same way the platform verifies it. A relay whose certificate cannot be
  // read is a relay that must not be used.
  const caFile = (process.env.SMTP_CA_FILE || "").trim();
  if (caFile) {
    options.tls = { ca: readFileSync(caFile, "utf-8") };
  }
  const transport = nodemailer.createTransport(options);
  await transport.sendMail({
    from: process.env.MAIL_FROM || "no-reply@blipmade.com",
    to: process.env.BACKUP_ALERT_EMAIL || process.env.MAIL_TO || "platform@blipmade.com",
    subject: "The Blipmade backup failed",
    text: message,
  });
})().catch(() => process.exit(1));
' "$MESSAGE" 2>/dev/null); then
    echo "BACKUP-ALERT: the alarm was sent by mail." >&2
    SENT=1
  else
    echo "BACKUP-ALERT: the alarm could not be sent by mail." >&2
  fi
fi

if [[ "$SENT" -eq 0 ]]; then
  echo "BACKUP-ALERT: ${MESSAGE}" >&2
fi
exit 0
