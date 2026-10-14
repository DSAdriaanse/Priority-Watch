// The one PocketBase client for the whole app.
// In dev, Vite proxies /api to PocketBase. In production, Nginx serves both from one origin.
import PocketBase from "pocketbase";

export const pb = new PocketBase(import.meta.env.VITE_PB_URL || window.location.origin);
// Several requests (dashboard loads) fire at once; do not cancel the earlier ones.
pb.autoCancellation(false);
