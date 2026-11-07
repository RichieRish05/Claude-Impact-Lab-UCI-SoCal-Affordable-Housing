export const CHECKLIST_KEYS = [
  "zoning",
  "size_urban",
  "min_parcel_size",
  "max_parcels_homes",
  "tentative_map",
  "owner_authorization",
  "occupancy_affidavit",
  "application_submitted",
] as const;

export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];

export const CHECKLIST_ITEMS: readonly { key: ChecklistKey; label: string }[] = [
  { key: "zoning", label: "Lot is zoned multifamily, or is vacant and zoned single-family" },
  { key: "size_urban", label: "Lot is no larger than 1.5 acres and substantially surrounded by urban uses" },
  { key: "min_parcel_size", label: "New parcels at least 600 sq ft (multifamily zone) or 1,200 sq ft (single-family zone)" },
  { key: "max_parcels_homes", label: "10 or fewer parcels and 10 or fewer homes" },
  { key: "tentative_map", label: "Tentative parcel map prepared" },
  { key: "owner_authorization", label: "Owner authorization (if applicant is not the owner)" },
  { key: "occupancy_affidavit", label: "Occupancy affidavit (if an existing unit is demolished or altered)" },
  { key: "application_submitted", label: "Complete application submitted; record the date" },
];

export const SUBMITTED_ITEM: ChecklistKey = "application_submitted";
