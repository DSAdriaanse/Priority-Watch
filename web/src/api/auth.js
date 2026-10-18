// Sign-in, sign-out and password flows.
import { pb } from "./pb";

const users = () => pb.collection("users");

// The app expects a full_name field; PocketBase stores the name as `name`.
const shape = (record) => (record ? { ...record, full_name: record.name || record.email } : null);

export const auth = {
  // The signed-in user (with role, name, callsign) or a rejected promise.
  async me() {
    if (!pb.authStore.isValid) {
      const err = new Error("Not signed in");
      err.status = 401;
      throw err;
    }
    return shape(pb.authStore.record);
  },

  // Validate the stored session with the server and pick up any role changes.
  // Only a real "your session is not valid" answer from the server (401/403/404 etc.) signs the user out.
  // A network blip, a restarting server, a rate limit or a request aborted by a page reload must NOT:
  // those keep the stored session so people are not logged out by a hiccup.
  async refresh() {
    if (!pb.authStore.isValid) return null;
    try {
      const res = await users().authRefresh();
      return shape(res.record);
    } catch (e) {
      const status = e?.status ?? 0;
      const sessionRejected = status >= 400 && status < 500 && status !== 408 && status !== 429;
      if (sessionRejected) {
        pb.authStore.clear();
        return null;
      }
      return shape(pb.authStore.record);
    }
  },

  isAuthenticated: () => pb.authStore.isValid,

  async login(email, password) {
    const res = await users().authWithPassword(email, password);
    return shape(res.record);
  },

  async loginWithGoogle() {
    const res = await users().authWithOAuth2({ provider: "google" });
    return shape(res.record);
  },

  // Providers the server has turned on (to decide whether to show "Continue with Google").
  async providers() {
    try {
      const methods = await users().listAuthMethods();
      return (methods?.oauth2?.providers || []).map((p) => p.name);
    } catch {
      return [];
    }
  },

  logout() {
    pb.authStore.clear();
  },

  requestPasswordReset: (email) => users().requestPasswordReset(email),
  confirmPasswordReset: (token, password) => users().confirmPasswordReset(token, password, password),
  onChange: (cb) => pb.authStore.onChange(cb),
};
