// Repeaters and their emergency contacts.
import { table } from "./records";
import type { EmergencyContact, Repeater } from "./types";

const repeaters = table<Repeater>("repeaters");
const contacts = table<EmergencyContact>("emergency_contacts");

export const listRepeaters = () => repeaters.list();
export const getRepeater = repeaters.get;
export const createRepeater = repeaters.create;
export const updateRepeater = repeaters.update;
export const deleteRepeater = repeaters.remove;
export const watchRepeaters = repeaters.watch;

export const listContacts = () => contacts.list();
export const listContactsFor = (repeaterId: string) => contacts.list({ where: { repeater_id: repeaterId } });
export const createContact = contacts.create;
export const deleteContact = contacts.remove;
