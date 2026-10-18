// Shared helpers for the feature files in this folder (incidents.js, repeaters.js ...).
// Pages do not import this; they use the named functions the feature files export.
//
// The server decides who may read or write each table (see
// backend/pb_migrations/1760000000_schema.js), so a call the signed-in person is not
// allowed to make simply fails with an error.
import { pb } from "./pb";

// System fields the server owns: they are removed before saving, so a record that
// was loaded and edited can be sent straight back without the server rejecting it.
const STRIP = ["id", "collectionId", "collectionName", "expand", "created_date", "updated_date", "created", "updated"];
const clean = (data) => {
  const out = { ...data };
  STRIP.forEach((k) => delete out[k]);
  return out;
};

// Turns { status: "active" } into a safe PocketBase filter. Values go in as
// parameters (never pasted into the text), which prevents filter injection.
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

// Small toolkit for one table. Each feature file calls table("incidents") and exposes
// only the operations that feature needs.
export function table(collection) {
  const col = () => pb.collection(collection);
  // The built-in users collection keeps PocketBase's own `created`/`updated` fields.
  const fix = (sort) => (collection === "users" && sort ? sort.replace(/created_date/g, "created").replace(/updated_date/g, "updated") : sort);
  // With a limit: just that many rows. Without: fetch everything, page by page.
  const page = async (options, limit) =>
    limit ? (await col().getList(1, limit, { ...options, skipTotal: true })).items : col().getFullList(options);

  return {
    list: ({ sort = "-created_date", limit, where } = {}) =>
      page({ sort: fix(sort), ...(where ? { filter: toFilter(where) } : {}) }, limit),
    get: (id) => col().getOne(id),
    create: (data) => col().create(clean(data)),
    update: (id, data) => col().update(id, clean(data)),
    remove: (id) => col().delete(id),
    // Live updates over a long-lived connection (Server-Sent Events). The callback
    // fires whenever anyone creates, changes or deletes a record in this table.
    // Returns a function that stops listening.
    watch: (callback) => {
      const ready = col().subscribe("*", (e) => callback({ type: e.action, id: e.record.id, data: e.record }));
      return () => { ready.then((off) => off()).catch(() => {}); };
    },
  };
}

// Call a server route (PocketBase hook) and return its JSON. Errors are reshaped so
// pages can read err.message and err.response.data.error whatever went wrong.
export async function post(path, body = {}) {
  try {
    return await pb.send(path, { method: "POST", body });
  } catch (e) {
    const payload = e?.response || {};
    const err = new Error(payload.error || payload.message || e.message || "Request failed");
    err.status = e?.status;
    err.response = { data: payload };
    throw err;
  }
}
