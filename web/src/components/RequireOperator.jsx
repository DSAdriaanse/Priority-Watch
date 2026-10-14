import { useAuth } from "@/lib/AuthContext";
import AccessDenied from "@/components/AccessDenied";

// Guards a route to admin or operator volunteers (not priority_watch or limited).
export default function RequireOperator({ children }) {
  const { volunteer, accessLevel, isLoadingAuth, isLoadingProfile } = useAuth();

  if (isLoadingAuth || isLoadingProfile) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-gray-700 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  const allowed = volunteer && ["admin", "operator"].includes(volunteer.role);
  return allowed ? children : <AccessDenied />;
}