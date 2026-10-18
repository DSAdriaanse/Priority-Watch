// The ONLY door between the screens and the server. Pages import from "@/api"
// and never from "pocketbase" directly.
//   incidents.ts   incidents, their log, notify and resolve
//   repeaters.ts   repeaters and emergency contacts
//   guidance.ts    guidance scripts
//   dtmf.ts        DTMF commands, log, run
//   settings.ts    app settings, config status
//   team.ts        volunteers (admin screens) and the active team directory
//   auth.ts        sign in, sign out, who am I
//   pb             the raw PocketBase client (rarely needed)
// To add something: put a named function in the matching file and export it here.
export { pb } from "./pb";
export type * from "./types";
export * from "./incidents";
export * from "./repeaters";
export * from "./guidance";
export * from "./dtmf";
export * from "./settings";
export { auth } from "./auth";
export * as team from "./team";
