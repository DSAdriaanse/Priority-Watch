// Sign-in, sign-out and password flows.
import { pb } from "./pb";
import type { Me, User } from "./types";

const users = () => pb.collection("users");

// The app expects a full_name field; PocketBase stores the name as `name`.
const shape = (record: unknown): Me | null => {
  const user = record as User | null | undefined;
  return user ? { ...user, full_name: user.name || user.email } : null;
};

export const auth = {
  // The signed-in user (with role, name, callsign) or a rejected promise.
  async me(): Promise<Me | null> {
    if (!pb.authStore.isValid) {
      throw Object.assign(new Error("Not signed in"), { status: 401 });
    }
    return shape(pb.authStore.record);
  },

  // Validate the stored session with the server and pick up any role changes.
  // Only a real "your session is not valid" answer from the server (401/403/404 etc.) signs the user out.
  // A network blip, a restarting server, a rate limit or a request aborted by a page reload must NOT:
  // those keep the stored session so people are not logged out by a hiccup.
  async refresh(): Promise<Me | null> {
    if (!pb.authStore.isValid) return null;
    try {
      const res = await users().authRefresh();
      return shape(res.record);
    } catch (e) {
      const status = (e as { status?: number })?.status ?? 0;
      const sessionRejected = status >= 400 && status < 500 && status !== 408 && status !== 429;
      if (sessionRejected) {
        pb.authStore.clear();
        return null;
      }
      return shape(pb.authStore.record);
    }
  },

  isAuthenticated: () => pb.authStore.isValid,

  async login(email: string, password: string) {
    const res = await users().authWithPassword(email, password);
    return shape(res.record);
  },

  async loginWithGoogle() {
    const res = await users().authWithOAuth2({ provider: "google" });
    return shape(res.record);
  },

  // Providers the server has turned on (to decide whether to show "Continue with Google").
  async providers(): Promise<string[]> {
    try {
      const methods = await users().listAuthMethods();
      return (methods?.oauth2?.providers || []).map((p: { name: string }) => p.name);
    } catch {
      return [];
    }
  },

  logout() {
    pb.authStore.clear();
  },

  requestPasswordReset: (email: string) => users().requestPasswordReset(email),
  confirmPasswordReset: (token: string, password: string) => users().confirmPasswordReset(token, password, password),
  onChange: (cb: () => void) => pb.authStore.onChange(cb),
};
