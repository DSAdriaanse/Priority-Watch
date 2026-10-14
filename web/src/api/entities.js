// Data access with the same shape the pages already use:
//   entities.Incident.list("-created_date", 50)
//   entities.Incident.filter({ status: "active" }, "-created_date", 20)
//   entities.Incident.get(id) / create(data) / update(id, data) / delete(id)
//   entities.Incident.subscribe(callback)  -> returns an unsubscribe function
//
// Pages never touch PocketBase directly; everything goes through here.
import { pb } from "./pb";

const COLLECTIONS = {
  Incident: "incidents",
  IncidentUpdate: "incident_updates",
  Repeater: "repeaters",
  GuidanceScript: "guidance_scripts",
  EmergencyContact: "emergency_contacts",
  DtmfCommand: "dtmf_commands",
  DtmfLog: "dtmf_logs",
  Settings: "settings",
  // Team directory: name, callsign, role, active. Phones live in volunteer_contacts (admin only).
  Volunteer: "users",
};

// System fields the server owns. Never sent back on create or update.
const STRIP = ["id", "collectionId", "collectionName", "expand", "created_date", "updated_date", "created", "updated"];
const clean = (data) => {
  const out = { ...data };
  STRIP.forEach((k) => delete out[k]);
  return out;
};

const toFilter = (query) => {
  const keys = Object.keys(query || {});
  if (!keys.length) return "";
  const params = {};
  const parts = keys.map((k, i) => {
    params[`p${i}`] = query[k];
    return `${k} = {:p${i}}`;
  });
  return pb.filter(parts.join(" && "), params);
};

function makeEntity(collection) {
  const col = () => pb.collection(collection);
  // The built-in users collection keeps PocketBase's own `created`/`updated` fields.
  const fix = (sort) => (collection === "users" && sort ? sort.replace(/created_date/g, "created").replace(/updated_date/g, "updated") : sort);
  const page = async (options, limit) =>
    limit ? (await col().getList(1, limit, { ...options, skipTotal: true })).items : col().getFullList(options);

  return {
    list: (sort = "-created_date", limit) => page({ sort: fix(sort) }, limit),
    filter: (query = {}, sort = "-created_date", limit) => page({ sort: fix(sort), filter: toFilter(query) }, limit),
    get: (id) => col().getOne(id),
    create: (data) => col().create(clean(data)),
    update: (id, data) => col().update(id, clean(data)),
    delete: (id) => col().delete(id),
    // Apply several updates: [{ id, ...fields }]
    bulkUpdate: (items) => Promise.all(items.map(({ id, ...rest }) => col().update(id, clean(rest)))),
    subscribe: (callback) => {
      const ready = col().subscribe("*", (e) => callback({ type: e.action, id: e.record.id, data: e.record }));
      return () => { ready.then((off) => off()).catch(() => {}); };
    },
  };
}

export const entities = Object.fromEntries(Object.entries(COLLECTIONS).map(([name, col]) => [name, makeEntity(col)]));
