// Server routes (PocketBase hooks). Same call style the pages already use:
//   const res = await functions.invoke("resolveIncident", { incident_id });  // res.data
import { pb } from "./pb";

// Friendly function name -> route in backend/pb_hooks. Add a line here when you
// add a new server route.
const ROUTES = {
  notifyVolunteers: "/api/pw/notify",
  resolveIncident: "/api/pw/resolve",
  runDtmf: "/api/pw/dtmf/run",
  controlRepeater: "/api/pw/repeater-control",
};

export const functions = {
  async invoke(name, body = {}) {
    const path = ROUTES[name];
    if (!path) throw new Error(`Unknown function: ${name}`);
    try {
      const data = await pb.send(path, { method: "POST", body });
      return { data };
    } catch (e) {
      // Reshape errors so pages can read err.message and err.response.data.error
      // the same way regardless of what went wrong.
      const payload = e?.response || {};
      const err = new Error(payload.error || payload.message || e.message || "Request failed");
      err.status = e?.status;
      err.response = { data: payload };
      throw err;
    }
  },
};

// Which server-side secrets are configured (admin only). Never returns the secrets themselves.
export const configStatus = () => pb.send("/api/pw/config-status", { method: "GET" });
