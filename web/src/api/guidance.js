// Guidance scripts: what an operator reads out or follows during an incident.
import { table } from "./records";

const scripts = table("guidance_scripts");

export const listGuidance = () => scripts.list();
export const getGuidance = scripts.get;
export const createGuidance = scripts.create;
export const updateGuidance = scripts.update;
export const deleteGuidance = scripts.remove;
