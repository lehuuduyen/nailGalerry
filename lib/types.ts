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

/** A design uploaded directly by a visitor (not scraped from Instagram). */
export type UserSource = {
  platform: "user";
  /** The contributor's display name. */
  handle: string;
  url?: string;
};

/** Where a design came from — an Instagram import or a user upload. */
export type Source = InstagramSource | UserSource;

export type Nail = NailTags & {
  id: string;
  title: string;
  /** SEO slug (from the DB), used for shareable URLs. */
  slug?: string;
  /** SEO/accessibility alt text for the image (from the DB). */
  altText?: string;
  /** Long-form SEO description (from the DB); only loaded on the design page. */
  description?: string;
  /** Extra accent/secondary colours (Gold, Silver, Green…), beyond the dominant `color`. */
  accentColors?: string[];
  /** Best-fit season (Spring/Summer/Fall/Winter/Holiday). */
  season?: string;
  /** Style origin / regional aesthetic (Korean, Japanese, Western, Russian). */
  styleOrigin?: string;
  /** Skin tone the design flatters most (Fair/Light/Medium/Tan/Deep). */
  skinTone?: string;
  /** Undertone the design flatters most (Warm/Cool/Neutral). */
  undertone?: string;
  /** Optional real image URL (e.g. an uploaded object URL). Absent => gradient placeholder. */
  imageUrl?: string;
  source: Source;
  /** Display name of the visitor who uploaded this design (user submissions). */
  contributor?: string;
  /** Account id of the uploader, so they can manage their own submissions. */
  ownerId?: string;
  /** Global number of likes ("tym") this design has received. */
  likeCount?: number;
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
