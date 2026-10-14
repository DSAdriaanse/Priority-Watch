// CAP-aligned incident taxonomy shared across the app.
export const INCIDENT_CATEGORIES = [
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

export const CATEGORY_LABELS = {
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

export const formatCategory = (c) => (c ? CATEGORY_LABELS[c] || c.replace(/_/g, " ") : "");