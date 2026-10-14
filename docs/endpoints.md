# Custom endpoints

Everything else is PocketBase's standard collection API, protected by the rules in `backend/pb_migrations`.

| Method and path | Who | Purpose |
|---|---|---|
| `POST /api/pw/webhook/inbound` (alias `/api/functions/handleInboundWebhook`) | shared secret | Create an incident from a repeater alert, notify volunteers and Slack |
| `POST /api/pw/notify` `{incidentId}` | operator, admin | Send SMS/email to active volunteers |
| `POST /api/pw/resolve` `{incidentId, falseAlarm?}` | operator, admin | Close an incident, AI summary, WordPress post |
| `POST /api/pw/repeater-control` | operator, admin | Call a repeater's link/delink webhook; status changes only if it succeeded |
| `POST /api/pw/dtmf/run` `{repeaterId, commandId}` | operator, admin | Send a DTMF command through Allmon3 and log it |
| `GET /api/pw/config-status` | admin | Which secrets are configured (booleans, never values) |

Roles: `admin` (everything), `operator` (incidents, repeater control, DTMF), `priority_watch` (read-only member).
Resolved incidents and their log are append-only.
