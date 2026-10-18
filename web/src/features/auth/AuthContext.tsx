import React, { createContext, useState, useContext, useEffect, useCallback, type ReactNode } from "react";
import { auth, type Me } from "@/api";

// Makes the signed-in user available to every screen via useAuth().
// On load it asks the server to confirm the stored login (auth.refresh).
export interface AuthValue {
  user: Me | null;
  /** The signed-in team member (name, callsign, role). Same as user. */
  volunteer: Me | null;
  isAuthenticated: boolean;
  isLoadingAuth: boolean;
  isLoadingProfile: boolean;
  isLoadingPublicSettings: boolean;
  authError: string | null;
  authChecked: boolean;
  accessLevel: "admin" | "user" | "limited";
  isAdmin: boolean;
  isLimited: boolean;
  reloadVolunteer: () => Promise<Me | null>;
  logout: () => void;
  checkUserAuth: () => Promise<Me | null>;
}

const AuthContext = createContext<AuthValue | null>(null);

// Roles come straight from the signed-in user record (users.role):
//   admin | operator | priority_watch
// accessLevel keeps the two tiers the UI already understands: "admin" and "user".
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<Me | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    const me = await auth.refresh();
    setUser(me);
    setIsLoadingAuth(false);
    setAuthChecked(true);
    return me;
  }, []);

  useEffect(() => {
    checkUserAuth();
    // Keep the UI in step if the session changes (sign-in, sign-out, token expiry).
    return auth.onChange(() => {
      auth.me().then(setUser).catch(() => setUser(null));
    });
  }, [checkUserAuth]);

  const logout = () => {
    auth.logout();
    setUser(null);
    window.location.href = "/login";
  };

  const accessLevel: AuthValue["accessLevel"] = user ? (user.role === "admin" ? "admin" : "user") : "limited";

  return (
    <AuthContext.Provider
      value={{
        user,
        volunteer: user, // the signed-in team member (name, callsign, role)
        isAuthenticated: !!user,
        isLoadingAuth,
        isLoadingProfile: false,
        isLoadingPublicSettings: false,
        authError: null,
        authChecked,
        accessLevel,
        isAdmin: accessLevel === "admin",
        isLimited: accessLevel === "limited",
        reloadVolunteer: checkUserAuth,
        logout,
        checkUserAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
