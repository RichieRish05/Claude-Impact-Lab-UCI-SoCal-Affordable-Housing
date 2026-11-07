export interface ProgramRule {
  id: string;
  name: string;
  agency: string;
  type:
    | "grant"
    | "deferred_loan"
    | "forgivable_loan"
    | "below_market_first"
    | "tax_credit";
  jurisdiction: { state: "CA"; counties: string[]; cities: string[] };
  assistance: {
    kind: "percent_of_price" | "fixed" | "percent_of_loan";
    value: number;
    cap_usd: number | null;
  };
  income_limit: {
    basis: "ami_pct" | "fixed_by_household_size";
    ami_pct?: number;
    by_household_size?: Record<string, number>;
  };
  requirements: {
    first_time_buyer: boolean;
    primary_residence: boolean;
    homebuyer_education: boolean;
    min_credit?: number;
    veteran_only?: boolean;
    property_types?: string[];
  };
  stacking: {
    requires: string[];
    excludes: string[];
    max_lien_position?: number;
  };
  prerequisites: string[];
  funding_status: "open" | "waitlist" | "exhausted" | "unknown";
  source_url: string;
  last_verified: string;
  verified: boolean;
}

export interface UserProfile {
  id: string;
  user_id: string;
  created_via: "web" | "voice";
  household_size: number;
  annual_income_usd: number;
  savings_usd: number;
  city: string;
  county: string;
  first_time_buyer: boolean;
  veteran: boolean;
  credit_band: "lt620" | "620-679" | "680-739" | "740plus" | "unknown";
  target_price_usd?: number;
}

type ProfileIdentity = Pick<UserProfile, "id" | "user_id" | "created_via">;
type OnboardingAnswers = Required<Omit<UserProfile, keyof ProfileIdentity>>;

// A saved profile that may be missing answers, such as after a dropped call.
// The matcher only accepts a complete UserProfile, never a draft.
export type ProfileDraft = ProfileIdentity & {
  [K in keyof OnboardingAnswers]: OnboardingAnswers[K] | null;
};

export interface MatchResult {
  program_id: string;
  eligible: boolean;
  reasons: string[];
  estimated_amount_usd: number;
}
