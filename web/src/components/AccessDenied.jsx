import { ShieldAlert } from "lucide-react";

export default function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-4">
        <ShieldAlert className="w-7 h-7 text-red-400" />
      </div>
      <h2 className="text-lg font-semibold text-gray-100">Access restricted</h2>
      <p className="text-sm text-gray-400 mt-2 max-w-sm">
        You don't have access to this section. Contact a team admin if you believe this is an error.
      </p>
    </div>
  );
}