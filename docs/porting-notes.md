# Porting notes (Base44 to PocketBase)

Findings from reviewing `legacy/base44-original`.

## Entities to collections

Repeater, Incident, IncidentUpdate, GuidanceScript, EmergencyContact, DtmfCommand, DtmfLog, Volunteer (merged into users), Settings (non-secret fields only).

## Functions to hooks

| Base44 function | Replacement | Auth required |
|---|---|---|
| handleInboundWebhook | public route, secret required, constant-time compare, rate limited | shared secret header |
| notifyVolunteers | route | operator or admin |
| resolveIncident | route | operator or admin |
| controlRepeater | route | operator or admin |
| runDtmf | route | operator or admin (already enforced in legacy) |
| exportWorkbook / importWorkbook | admin routes, direct file upload (no fetch of caller-supplied URLs) | admin |

## Known problems in the legacy app, fixed in the rebuild

- Only runDtmf checked the caller's role; other functions accepted any logged-in user, and signup was open.
- Settings held third-party secrets in a table the browser could load. Secrets now come from environment variables.
- Webhook secret was optional and sent in the query string on GET.
- importWorkbook fetched an arbitrary caller-supplied URL.
- Slack and email failures were swallowed silently.
- SMS notifications were sent one at a time.

## Replacements needed for Base44 platform services

Email verification and password reset (PocketBase auth + SMTP), Google sign-in (PocketBase OAuth2), SendEmail (SMTP), InvokeLLM (Anthropic API), Slack connector (bot token), secret store (environment), file upload (direct multipart).

## Data migration notes

- Base44 IDs are 24 hex characters; PocketBase IDs are 15. The import script builds an ID map and rewrites `Incident.repeater_id` (array), `IncidentUpdate.incident_id` and `EmergencyContact.repeater_id`.
- Some EmergencyContact rows are leftover sample data for Snohomish County, WA and Ada County, ID, attached to Arizona repeaters. Review before import.
- Heliograph 700 and Pinal 675 still have placeholder `repeater.example.com` link webhooks.
- The notification template still contains test text.
- User passwords cannot be migrated; operators will need invites or reset links.
