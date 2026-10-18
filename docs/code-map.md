# Code map

A guided tour of the repository for someone who wants to read the code. Start here, then open the files in the order given.

## The big picture

```
Browser (React app, web/)
   |  entities.Incident.list()   functions.invoke("resolveIncident")
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
| `web/src/pages/` | One file per screen | Yes |
| `web/src/components/` | Reusable pieces used by the screens | Yes |
| `web/src/api/` | The only place the front end talks to the server | Yes, it is short |
| `web/src/lib/` | Small helpers: sign-in state, category list, Excel columns | Occasionally |
| `web/src/components/ui/` | Generic buttons, dialogs, inputs (shadcn) | No, skip it |
| `backend/pb_migrations/` | The tables and who may read or write them | Yes |
| `backend/pb_hooks/` | The server routes and start-up settings | Yes |
| `backend/test/` | Automated tests for the server routes | When changing the backend |
| `deploy/` | Scripts that install and update the server | Only for server work |
| `scripts/` | One-off tools: Base44 importer, create the first admin | Rarely |
| `docs/` | Written explanations (this file included) | |

## Reading order

Front end:

1. `web/src/App.jsx` the map of web addresses to screens, and who may open each
2. `web/src/api/index.js`, then `entities.js` and `functions.js`
3. `web/src/pages/Dashboard.jsx` the simplest real screen
4. `web/src/pages/IncidentDetail.jsx` the busiest screen
5. `web/src/components/Layout.jsx` the sidebar around every screen

Back end:

1. `backend/pb_migrations/1760000000_schema.js` every table and rule
2. `backend/pb_hooks/lib/util.js` the shared helpers
3. `backend/pb_hooks/webhook.pb.js` how an alert arrives
4. `backend/pb_hooks/incidents.pb.js` notify and resolve

## Following one feature through the code

### "An operator resolves an incident"

1. **Screen:** the Resolve button in `web/src/pages/IncidentDetail.jsx` calls `resolve()`, which runs `functions.invoke("resolveIncident", { incident_id })`.
2. **Bridge:** `web/src/api/functions.js` looks up `resolveIncident` in its `ROUTES` table and sends `POST /api/pw/resolve`.
3. **Server:** `backend/pb_hooks/incidents.pb.js` handles that route. It checks the person is an active admin or operator, loads the incident and its log, asks the AI for a write-up, posts it to WordPress if configured, then marks the incident resolved and adds a log entry.
4. **Rules:** once the status is `resolved`, the `incidents` and `incident_updates` rules in the schema file refuse further edits.
5. **Back on screen:** `resolve()` shows a message and reloads the incident.

### "An alert arrives from the repeater system"

1. The repeater system sends `POST /api/pw/webhook/inbound` with the shared secret.
2. `backend/pb_hooks/webhook.pb.js` checks the secret, finds the repeater, creates an active incident and a first log entry, then alerts Slack, SMS and email.
3. The dashboard is already subscribed to incident changes (`entities.Incident.subscribe` in `Dashboard.jsx`), so the new incident appears on every open screen with no reload.

### "An admin edits a guidance script"

1. `web/src/pages/Guidance.jsx` lists the scripts; clicking one goes to `/guidance/:id`.
2. `web/src/pages/GuidanceEditor.jsx` loads it with `entities.GuidanceScript.get(id)` and keeps edits in a `draft`.
3. The Write-up tab uses `components/ListEditor.jsx`; the Triage tab uses `components/TriageFlowBuilder.jsx`, with `components/TriageRunner.jsx` as the live preview.
4. Save calls `entities.GuidanceScript.update`. There is no custom server code; the table rules in the schema allow admins to write it.
5. On an incident, the same `TriageRunner` is what operators answer.

## Where do I change...

| I want to change | Look in |
|---|---|
| The wording of the alert text | Settings page (stored in the database); default in `schema.js` and `lib/notify.js` |
| The prompt sent to the AI for incident reports | `backend/pb_hooks/incidents.pb.js`, the `prompt` variable |
| Who can see or edit a table | `backend/pb_migrations/` (add a **new** migration file; do not edit the existing one on a live database) |
| Add a field to a table | A new migration file, then the screens that show or edit it |
| Add an incident category | `schema.js` (`CATEGORIES`) and `web/src/lib/incidentTaxonomy.js`, plus a new migration |
| Which menu items each role sees | `navItems` in `web/src/components/Layout.jsx` and the guards in `web/src/App.jsx` |
| Add a new server action | A route in `backend/pb_hooks/`, a line in `web/src/api/functions.js`, then call it from a screen |
| Server settings (SMTP, rate limits) | `/etc/priority-watch/env`; applied at start-up by `backend/pb_hooks/bootstrap.pb.js` |
| Colors and spacing | Tailwind classes in the screens; theme in `web/tailwind.config.js` and `web/src/index.css` |

## Words you will see

- **Collection:** PocketBase's word for a table. `incidents`, `repeaters` and so on.
- **Record:** one row in a collection.
- **Hook:** a JavaScript file in `backend/pb_hooks/` that PocketBase loads and runs. `*.pb.js` is the required file name pattern.
- **Migration:** a script that changes the database structure, run once per database in filename order.
- **Entity:** the front end's name for a collection (`entities.Incident` is the `incidents` collection).
- **Roles:** `admin` (everything), `operator` (work incidents and control repeaters), `priority_watch` (read only).

## Gotchas worth knowing

- Inside a hook route handler, load helpers with `require(...)` **inside** the handler. Top-level variables in the file are not visible there. Every hook file does this.
- PocketBase hands JSON fields to hooks as raw bytes. `repeaterNames()` in `lib/util.js` decodes them. Anything new that reads a JSON field in a hook needs the same treatment.
- The built-in `users` collection uses `created`/`updated`; every other collection uses `created_date`/`updated_date`. `entities.js` hides the difference for sorting.
- Rolling back an update restores the code but does not undo database migrations.
