// Team management for admins: a login account (users) plus private contact details
// (volunteer_contacts: phone and which alerts they get).
import { pb } from "./pb";

const users = () => pb.collection("users");
const contacts = () => pb.collection("volunteer_contacts");

// A throwaway password for new accounts. Nobody ever sees it; the person is emailed
// a link to choose their own.
const randomPassword = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

// Joins each login account (users) with its private contact row (volunteer_contacts).
// Non-admins cannot read volunteer_contacts, which is how phone numbers stay private.
export async function listVolunteers() {
  const [people, cons] = await Promise.all([users().getFullList({ sort: "name" }), contacts().getFullList()]);
  const byUser = new Map(cons.map((c) => [c.user, c]));
  return people.map((u) => {
    const c = byUser.get(u.id);
    return {
      id: u.id,
      name: u.name || "",
      callsign: u.callsign || "",
      role: u.role || "operator",
      active: !!u.active,
      email: u.email || "",
      phone: c?.phone || "",
      notify_sms: c ? !!c.notify_sms : true,
      notify_email: c ? !!c.notify_email : true,
      contactId: c?.id || null,
    };
  });
}

async function saveContact(userId, v, existingId) {
  const data = { user: userId, phone: v.phone || "", notify_sms: !!v.notify_sms, notify_email: !!v.notify_email };
  return existingId ? contacts().update(existingId, data) : contacts().create(data);
}

// Create or update. For a new person with no password set, they get an email to choose one.
export async function saveVolunteer(v) {
  const profile = { name: v.name, callsign: v.callsign || "", role: v.role, active: !!v.active };

  if (v.id) {
    const patch = { ...profile };
    if (v.email) patch.email = v.email;
    if (v.password) { patch.password = v.password; patch.passwordConfirm = v.password; }
    await users().update(v.id, patch);
    await saveContact(v.id, v, v.contactId);
    return { id: v.id, resetEmailSent: false };
  }

  // New person: create the login first, then the contact row. If the contact row
  // fails, remove the login again so we never leave a half-made account behind.
  const password = v.password || randomPassword();
  const created = await users().create({
    ...profile,
    email: v.email,
    password,
    passwordConfirm: password,
    verified: true,
    emailVisibility: false,
  });
  try {
    await saveContact(created.id, v, null);
  } catch (e) {
    await users().delete(created.id).catch(() => {});
    throw e;
  }
  let resetEmailSent = false;
  if (!v.password) {
    try { await users().requestPasswordReset(v.email); resetEmailSent = true; } catch { /* SMTP not set up */ }
  }
  return { id: created.id, resetEmailSent };
}

export const deleteVolunteer = (id) => users().delete(id);
export const sendPasswordReset = (email) => users().requestPasswordReset(email);
