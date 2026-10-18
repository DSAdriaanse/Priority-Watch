// The ONLY door between the screens and the server. Pages import from "@/api"
// and never from "pocketbase" directly. If you ever swap the backend, this
// folder is the only part of the front end that has to change.
//   pb          the raw PocketBase client (rarely needed)
//   entities    read and write records:   entities.Incident.list(), .create(), ...
//   functions   call server routes:       functions.invoke("resolveIncident", {...})
//   auth        sign in, sign out, who am I
//   team        manage volunteer accounts (admin screens)
export { pb } from "./pb";
export { entities } from "./entities";
export { functions, configStatus } from "./functions";
export { auth } from "./auth";
export * as team from "./volunteers";
