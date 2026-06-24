// Core domain types for NailLib.

export type TagKey =
  | "style"
  | "color"
  | "shape"
  | "length"
  | "occasion"
  | "mood"
  | "technique"
  | "detail";

/** A fully-tagged design carries exactly one value per tag group. */
export type NailTags = Record<TagKey, string>;

export type InstagramSource = {
  platform: "instagram";
  handle: string;
  url: string;
};

export type Nail = NailTags & {
  id: string;
  title: string;
  /** Optional real image URL (e.g. an uploaded object URL). Absent => gradient placeholder. */
  imageUrl?: string;
  source: InstagramSource;
  /** Original caption, kept for later AI tagging context. */
  caption?: string;
  /**
   * Moderation state. "pending" = imported, awaiting admin approval (hidden
   * from visitors); "approved" = live in the public gallery. Missing is
   * treated as approved (legacy items).
   */
  status?: "pending" | "approved";
};

/** A post pulled from Instagram awaiting AI tagging + admin confirmation. */
export type PendingPost = {
  id: string;
  title: string;
  source: InstagramSource;
  /** Real image fetched from the Instagram post (absent => gradient placeholder). */
  imageUrl?: string;
  caption?: string;
  /** AI-suggested tags the admin can edit before approving. */
  suggestedTags: Partial<NailTags>;
  status: "analyzing" | "review";
};

export type Element = "Metal" | "Wood" | "Water" | "Fire" | "Earth";

/** A scored recommendation produced by the AI advisor. */
export type ScoredNail = {
  nail: Nail;
  score: number;
};
