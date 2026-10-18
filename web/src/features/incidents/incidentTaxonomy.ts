import type { IncidentCategory } from "@/api";

// CAP-aligned incident taxonomy shared across the app.
// Must match the category list in backend/pb_migrations/1760000000_schema.js.
// Adding a category means changing both, plus a new migration.
export const INCIDENT_CATEGORIES: IncidentCategory[] = [
  "medical",
  "fire",
  "law_enforcement",
  "weather",
  "transportation",
  "utility",
  "rescue",
  "hazard",
  "other",
];

export const CATEGORY_LABELS: Record<IncidentCategory, string> = {
  medical: "Medical",
  fire: "Fire",
  law_enforcement: "Law Enforcement",
  weather: "Weather",
  transportation: "Transportation",
  utility: "Utility / Infrastructure",
  rescue: "Rescue / SAR",
  hazard: "Hazard / Environment",
  other: "Other",
};

export const formatCategory = (c?: string | null): string =>
  c ? CATEGORY_LABELS[c as IncidentCategory] || c.replace(/_/g, " ") : "";
