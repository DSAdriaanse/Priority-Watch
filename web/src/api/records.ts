// Shared helpers for the feature files in this folder (incidents.js, repeaters.js ...).
// Pages do not import this; they use the named functions the feature files export.
//
// The server decides who may read or write each table (see
// backend/pb_migrations/1760000000_schema.js), so a call the signed-in person is not
// allowed to make simply fails with an error.
import { pb } from "./pb";
import type { ChangeEvent } from "./types";

// System fields the server owns: they are removed before saving, so a record that
// was loaded and edited can be sent straight back without the server rejecting it.
const STRIP = ["id", "collectionId", "collectionName", "expand", "created_date", "updated_date", "created", "updated"];
const clean = (data: Record<string, unknown>) => {
  const out = { ...data };
  STRIP.forEach((k) => delete out[k]);
  return out;
};

// Turns { status: "active" } into a safe PocketBase filter. Values go in as
// parameters (never pasted into the text), which prevents filter injection.
const toFilter = (query?: Record<string, unknown>) => {
  const where = query || {};
  const keys = Object.keys(where);
  if (!keys.length) return "";
  const params: Record<string, unknown> = {};
  const parts = keys.map((k, i) => {
    params[`p${i}`] = where[k];
    return `${k} = {:p${i}}`;
  });
  return pb.filter(parts.join(" && "), params);
};

// Small toolkit for one table. Each feature file calls table("incidents") and exposes
// only the operations that feature needs.
export interface ListOptions {
  sort?: string;
  limit?: number;
  /** Equality filters, for example { status: "active" }. */
  where?: Record<string, unknown>;
}

export function table<T>(collection: string) {
  const col = () => pb.collection(collection);
  // The built-in users collection keeps PocketBase's own `created`/`updated` fields.
  const fix = (sort?: string) => (collection === "users" && sort ? sort.replace(/created_date/g, "created").replace(/updated_date/g, "updated") : sort);
  // With a limit: just that many rows. Without: fetch everything, page by page.
  const page = async (options: Record<string, unknown>, limit?: number): Promise<T[]> =>
    limit ? (await col().getList<T>(1, limit, { ...options, skipTotal: true })).items : col().getFullList<T>(options);

  return {
    list: ({ sort = "-created_date", limit, where }: ListOptions = {}) =>
      page({ sort: fix(sort), ...(where ? { filter: toFilter(where) } : {}) }, limit),
    get: (id: string) => col().getOne<T>(id),
    create: (data: Partial<T>) => col().create<T>(clean(data as Record<string, unknown>)),
    update: (id: string, data: Partial<T>) => col().update<T>(id, clean(data as Record<string, unknown>)),
    remove: (id: string) => col().delete(id),
    // Live updates over a long-lived connection (Server-Sent Events). The callback
    // fires whenever anyone creates, changes or deletes a record in this table.
    // Returns a function that stops listening.
    watch: (callback: (event: ChangeEvent<T>) => void) => {
      const ready = col().subscribe<T>("*", (e) => callback({ type: e.action as ChangeEvent<T>["type"], id: (e.record as { id: string }).id, data: e.record }));
      return () => { ready.then((off) => off()).catch(() => {}); };
    },
  };
}

// Call a server route (PocketBase hook) and return its JSON. Errors are reshaped so
// pages can read err.message and err.response.data.error whatever went wrong.
/** An error from a server route, with the HTTP status and the server's answer attached. */
export interface RouteError extends Error {
  status?: number;
  response: { data: { error?: string; message?: string; [key: string]: unknown } };
}

export async function post<R = Record<string, unknown>>(path: string, body: Record<string, unknown> = {}): Promise<R> {
  try {
    return await pb.send<R>(path, { method: "POST", body });
  } catch (e) {
    const failure = e as { response?: RouteError["response"]["data"]; status?: number; message?: string };
    const payload = failure?.response || {};
    const err = new Error(payload.error || payload.message || failure?.message || "Request failed") as RouteError;
    err.status = failure?.status;
    err.response = { data: payload };
    throw err;
  }
}
