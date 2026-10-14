import { useAuth } from "@/lib/AuthContext";
import AccessDenied from "@/components/AccessDenied";

export default function RequireRole({ role, children }) {
  const { accessLevel, isLoadingAuth, isLoadingProfile } = useAuth();

  if (isLoadingAuth || isLoadingProfile) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-gray-700 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  const allowed = role === "admin" ? accessLevel === "admin" : accessLevel === role;
  return allowed ? children : <AccessDenied />;
}