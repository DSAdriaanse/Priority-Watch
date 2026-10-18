// Repeaters and their emergency contacts.
import { table } from "./records";

const repeaters = table("repeaters");
const contacts = table("emergency_contacts");

export const listRepeaters = () => repeaters.list();
export const getRepeater = repeaters.get;
export const createRepeater = repeaters.create;
export const updateRepeater = repeaters.update;
export const deleteRepeater = repeaters.remove;
export const watchRepeaters = repeaters.watch;

export const listContacts = () => contacts.list();
export const listContactsFor = (repeaterId) => contacts.list({ where: { repeater_id: repeaterId } });
export const createContact = contacts.create;
export const deleteContact = contacts.remove;
