import React from "react";

const statusStyles = {
  active: "bg-red-500/15 text-red-300 border-red-500/40",
  standby: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  resolved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  online: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  offline: "bg-gray-500/15 text-gray-300 border-gray-500/40",
  linked: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  maintenance: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  critical: "bg-red-500/15 text-red-300 border-red-500/40",
  high: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  medium: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  low: "bg-gray-500/15 text-gray-300 border-gray-500/40",
};

export default function StatusBadge({ status }) {
  const cls = statusStyles[status] || statusStyles.low;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${cls} capitalize`}>
      {status}
    </span>
  );
}