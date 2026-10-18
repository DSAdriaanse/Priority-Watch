# Code map

A guided tour of the repository for someone who wants to read the code. Start here, then open the files in the order given.

## The big picture

```
Browser (React app, web/)
   |  listRecentIncidents()   resolveIncident({ incident_id })
   v
web/src/api/            <- the only code that talks to the server
   |  HTTPS, through Nginx
   v
PocketBase (one program)
   |-- built-in: database, sign-in, access rules, live updates, file storage
   |-- backend/pb_migrations/   creates the tables and the access rules (runs once)
   `-- backend/pb_hooks/        our own server routes and start-up settings
          |
          v
   Outside services: Textbelt (SMS), Slack, SMTP email, Anthropic (AI summary),
   WordPress, Allmon3 (radio commands)
```

Two rules explain most of the design:

1. **Secrets and outside calls live on the server.** The browser never sees an API key. Anything that sends an SMS, posts to Slack, calls the AI or talks to Allmon3 is in `backend/pb_hooks/`.
2. **The server enforces permissions, the screens only hide things.** The access rules in `backend/pb_migrations/1760000000_schema.js` decide who can read or change each table. Hiding a button in the UI is a convenience, not security.

## What is in each folder

| Folder | What it is | Do you need to read it? |
|---|---|---|
| `web/src/features/` | The screens and their pieces, one folder per feature: `auth`, `incidents`, `guidance`, `repeaters`, `dtmf`, `settings`, `team`. Screens are the files named like the page (Dashboard.jsx, Repeaters.jsx) | Yes |
| `web/src/components/` | Pieces shared by every feature: Layout (sidebar), ScrollToTop | Occasionally |
| `web/src/api/` | The only place the front end talks to the server | Yes, it is short |
| `web/src/lib/` | Small shared helpers: class-name helper, query client, 404 page | Occasionally |
| `web/src/components/ui/` | Generic buttons, dialogs, inputs (shadcn) | No, skip it |
| `backend/pb_migrations/` | The tables and who may read or write them | Yes |
| `backend/pb_hooks/` | The server routes and start-up settings | Yes |
| `backend/test/` | Automated tests for the server routes | When changing the backend |
| `deploy/` | Scripts that install and update the server | Only for server work |
| `scripts/` | One-off tools: data importer for the previous app (remove after cutover), create the first admin | Rarely |
| `docs/` | Written explanations (this file included) | |

## Reading order

Front end:

1. `web/src/App.jsx` the map of web addresses to screens, and who may open each
2. `web/src/api/index.ts`, then `types.ts` (the shape of every record, matching the schema), then one feature file such as `incidents.ts` (named functions per feature; `records.ts` holds the shared helpers)
3. `web/src/features/incidents/Dashboard.jsx` the simplest real screen
4. `web/src/features/incidents/IncidentDetail.jsx` the busiest screen (it loads data and runs the actions; the header and three panels are in `features/incidents/detail/`)
5. `web/src/components/Layout.jsx` the sidebar around every screen

Back end:

1. `backend/pb_migrations/1760000000_schema.js` every table and rule
2. `backend/pb_hooks/lib/util.js` the shared helpers
3. `backend/pb_hooks/webhook.pb.js` how an alert arrives
4. `backend/pb_hooks/incidents.pb.js` notify and resolve

## Following one feature through the code

### "An operator resolves an incident"

1. **Screen:** the Resolve button in `web/src/features/incidents/IncidentDetail.jsx` calls `resolve()`, which calls `resolveIncident({ incident_id })`.
2. **Bridge:** `resolveIncident` in `web/src/api/incidents.ts` sends `POST /api/pw/resolve`.
3. **Server:** `backend/pb_hooks/incidents.pb.js` handles that route. It checks the person is an active admin or operator, loads the incident and its log, asks the AI for a write-up, posts it to WordPress if configured, then marks the incident resolved and adds a log entry.
4. **Rules:** once the status is `resolved`, the `incidents` and `incident_updates` rules in the schema file refuse further edits.
5. **Back on screen:** `resolve()` shows a message and reloads the incident.

### "An alert arrives from the repeater system"

1. The repeater system sends `POST /api/pw/webhook/inbound` with the shared secret.
2. `backend/pb_hooks/webhook.pb.js` checks the secret, finds the repeater, creates an active incident and a first log entry, then alerts Slack, SMS and email.
3. The dashboard is already subscribed to incident changes (`watchIncidents` in `Dashboard.jsx`), so the new incident appears on every open screen with no reload.

### "An admin edits a guidance script"

1. `web/src/features/guidance/Guidance.jsx` lists the scripts; clicking one goes to `/guidance/:id`.
2. `web/src/features/guidance/GuidanceEditor.jsx` loads it with `getGuidance(id)` and keeps edits in a `draft`.
3. The Write-up tab uses `features/guidance/ListEditor.jsx`; the Triage tab uses `features/guidance/TriageFlowBuilder.jsx`, with `features/incidents/TriageRunner.jsx` as the live preview.
4. Save calls `updateGuidance`. There is no custom server code; the table rules in the schema allow admins to write it.
5. On an incident, the same `TriageRunner` is what operators answer.

## Where do I change...

| I want to change | Look in |
|---|---|
| The wording of the alert text | Settings page (stored in the database); default in `schema.js` and `lib/notify.js` |
| The prompt sent to the AI for incident reports | `backend/pb_hooks/incidents.pb.js`, the `prompt` variable |
| Who can see or edit a table | `backend/pb_migrations/` (add a **new** migration file; do not edit the existing one on a live database) |
| Add a field to a table | A new migration file, then the screens that show or edit it |
| Add an incident category | `schema.js` (`CATEGORIES`) and `web/src/features/incidents/incidentTaxonomy.ts`, plus a new migration |
| Which menu items each role sees | `navItems` in `web/src/components/Layout.jsx` and the guards in `web/src/App.jsx` |
| Add a new server action | A route in `backend/pb_hooks/`, a named function in the matching `web/src/api/` feature file (export it from `index.ts`), then call it from a screen |
| Server settings (SMTP, rate limits) | `/etc/priority-watch/env`; applied at start-up by `backend/pb_hooks/bootstrap.pb.js` |
| Colors and spacing | Tailwind classes in the screens; theme in `web/tailwind.config.js` and `web/src/index.css` |

## Words you will see

- **Collection:** PocketBase's word for a table. `incidents`, `repeaters` and so on.
- **Record:** one row in a collection.
- **Hook:** a JavaScript file in `backend/pb_hooks/` that PocketBase loads and runs. `*.pb.js` is the required file name pattern.
- **Migration:** a script that changes the database structure, run once per database in filename order.
- **Roles:** `admin` (everything), `operator` (work incidents and control repeaters), `priority_watch` (read only).

## Gotchas worth knowing

- Inside a hook route handler, load helpers with `require(...)` **inside** the handler. Top-level variables in the file are not visible there. Every hook file does this.
- PocketBase hands JSON fields to hooks as raw bytes. `repeaterNames()` in `lib/util.js` decodes them. Anything new that reads a JSON field in a hook needs the same treatment.
- The built-in `users` collection uses `created`/`updated`; every other collection uses `created_date`/`updated_date`. `web/src/api/records.ts` hides the difference for sorting.
- Rolling back an update restores the code but does not undo database migrations.
- **TypeScript:** `web/src/api/`, `lib/` and the category list are TypeScript; screens are still `.jsx`. Run `npm run typecheck` in `web/` (CI does too). When you change a field in the schema, change `api/types.ts` to match. Screens move to TypeScript one at a time, because switching on checking for all of them at once reports about a thousand errors, mostly from untyped UI components.
