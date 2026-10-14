import React from "react";

const palette = [
  "bg-sky-500/30 text-sky-200",
  "bg-emerald-500/30 text-emerald-200",
  "bg-amber-500/30 text-amber-200",
  "bg-violet-500/30 text-violet-200",
  "bg-rose-500/30 text-rose-200",
];

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

function hashIndex(str, mod) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % mod;
}

export default function OwnerBadge({ name, className = "" }) {
  if (!name) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border border-dashed border-gray-600 text-gray-500 ${className}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
        Unassigned
      </span>
    );
  }
  const cls = palette[hashIndex(name, palette.length)];
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold border border-white/10 ${cls}`}>
        {initials(name)}
      </span>
      <span className="text-xs font-medium text-gray-100">{name}</span>
    </span>
  );
}