// App settings (one row) and the admin-only status of server-side secrets.
import { pb } from "./pb";
import { table } from "./records";

const settings = table("settings");

// The settings row, or undefined if none has been saved yet.
export const getSettings = async () => (await settings.list())[0];
export const createSettings = settings.create;
export const updateSettings = settings.update;

// Which server-side secrets are configured (admin only). Never returns the secrets themselves.
export const configStatus = () => pb.send("/api/pw/config-status", { method: "GET" });
