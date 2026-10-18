// The ONLY door between the screens and the server. Pages import from "@/api"
// and never from "pocketbase" directly.
//   incidents.js   incidents, their log, notify and resolve
//   repeaters.js   repeaters and emergency contacts
//   guidance.js    guidance scripts
//   dtmf.js        DTMF commands, log, run
//   settings.js    app settings, config status
//   team.js        volunteers (admin screens) and the active team directory
//   auth.js        sign in, sign out, who am I
//   pb             the raw PocketBase client (rarely needed)
// To add something: put a named function in the matching file and export it here.
export { pb } from "./pb";
export * from "./incidents";
export * from "./repeaters";
export * from "./guidance";
export * from "./dtmf";
export * from "./settings";
export { auth } from "./auth";
export * as team from "./team";
