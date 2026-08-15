import type { Account, InMemoryAccountStore } from "@llos/core";
import type { Entitlement, InMemoryEntitlementStore } from "@llos/core";

export type PricingModel = "free" | "purchase" | "subscription";

export const DIFFICULTY_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

export interface ListingDlcRef {
  dlc_id: string;
  version: string;
  sha256: string;
}

export interface ListingPricing {
  model: PricingModel;
  price_cents?: number;
}

export interface PublishInput {
  dlc_ref: ListingDlcRef;
  title: string;
  summary: string;
  language: string;
  difficulty?: DifficultyLevel;
  tags?: string[];
  pricing: ListingPricing;
}

export interface MarketListing {
  listing_id: string;
  dlc_ref: ListingDlcRef;
  title: string;
  summary: string;
  language: string;
  difficulty?: DifficultyLevel;
  tags: string[];
  pricing: ListingPricing;
  publisher_id: string;
  published_at: string;
  updated_at: string;
  /** §6.9 创作者下架：停止新获取；已获取用户保留访问权（授权不受影响）。 */
  delisted_at?: string;
}

export interface RatingSummary {
  average: number | null;
  count: number;
}

export interface ListingView {
  listing: MarketListing;
  rating_summary: RatingSummary;
  downloads: number;
}

export interface Review {
  listing_id: string;
  account_id: string;
  rating: number;
  text?: string;
  created_at: string;
  updated_at: string;
}

export interface AcquisitionResult {
  entitlement: Entitlement;
  view: ListingView;
  already_acquired: boolean;
}

export interface CatalogQuery {
  language?: string;
  difficulty?: DifficultyLevel;
  tags?: string[];
  search?: string;
  sort?: "newest" | "rating_desc" | "downloads_desc";
}

export type MarketErrorCode =
  | "publisher_capability_missing"
  | "listing_not_found"
  | "not_listing_publisher"
  | "pricing_not_available"
  | "review_requires_entitlement"
  | "invalid_rating"
  | "invalid_listing_input"
  | "listing_delisted"
  | "listing_already_delisted";

export class MarketError extends Error {
  readonly code: MarketErrorCode;
  constructor(code: MarketErrorCode, message: string) {
    super(message);
    this.name = "MarketError";
    this.code = code;
  }
}

export const PUBLISH_CAPABILITY = "publish_dlc";

// Entitlement resource refs are version-free: DLC updates reach every owner
// automatically (product_spec §6.7 — version management invisible to users).
export function dlcResourceRef(dlcId: string): string {
  return `dlc/${dlcId}`;
}

export interface MarketServiceDeps {
  accountStore: InMemoryAccountStore;
  entitlementStore: InMemoryEntitlementStore;
  clock: () => string;
}

// Product-layer orchestration only: every authorization WRITE goes through the
// Core entitlement store injected here; the market package never owns
// entitlement state (baseline §12 market must not bypass Core).
export class MarketService {
  readonly #accounts: InMemoryAccountStore;
  readonly #entitlements: InMemoryEntitlementStore;
  readonly #clock: () => string;
  readonly #listings = new Map<string, MarketListing>();
  readonly #reviews = new Map<string, Review>();
  readonly #downloads = new Map<string, number>();

  constructor(deps: MarketServiceDeps) {
    this.#accounts = deps.accountStore;
    this.#entitlements = deps.entitlementStore;
    this.#clock = deps.clock;
  }

  publish(actorId: string, input: PublishInput): MarketListing {
    const actor: Account | undefined = this.#accounts.get(actorId);
    if (!actor || !actor.capabilities.has(PUBLISH_CAPABILITY)) {
      throw new MarketError(
        "publisher_capability_missing",
        `account ${actorId} cannot publish listings: ${PUBLISH_CAPABILITY} required`,
      );
    }
    if (input.title.trim().length === 0) {
      throw new MarketError("invalid_listing_input", "title must be non-empty");
    }
    if (!/^[a-z][a-z0-9.-]*$/i.test(input.language)) {
      throw new MarketError("invalid_listing_input", `invalid language: ${input.language}`);
    }
    if (
      input.pricing.model !== "free" &&
      (input.pricing.price_cents === undefined || input.pricing.price_cents <= 0)
    ) {
      throw new MarketError(
        "invalid_listing_input",
        "paid pricing requires a positive price_cents",
      );
    }
    const now = this.#clock();
    const listing: MarketListing = Object.freeze({
      listing_id: `listing.${input.dlc_ref.dlc_id}`,
      dlc_ref: { ...input.dlc_ref },
      title: input.title,
      summary: input.summary,
      language: input.language,
      difficulty: input.difficulty,
      tags: [...(input.tags ?? [])],
      pricing: { ...input.pricing },
      publisher_id: actorId,
      published_at: now,
      updated_at: now,
    });
    if (this.#listings.has(listing.listing_id)) {
      throw new MarketError(
        "invalid_listing_input",
        `listing ${listing.listing_id} already exists (use updateVersion)`,
      );
    }
    this.#listings.set(listing.listing_id, listing);
    return listing;
  }

  updateVersion(publisherId: string, listingId: string, dlcRef: ListingDlcRef): MarketListing {
    const listing = this.#requireListing(listingId);
    if (listing.publisher_id !== publisherId) {
      throw new MarketError(
        "not_listing_publisher",
        `listing ${listingId} can only be updated by its publisher`,
      );
    }
    if (listing.delisted_at) {
      throw new MarketError(
        "listing_delisted",
        `listing ${listingId} is delisted; delisted listings no longer receive updates`,
      );
    }
    const updated: MarketListing = Object.freeze({
      ...listing,
      dlc_ref: { ...dlcRef },
      updated_at: this.#clock(),
    });
    this.#listings.set(listingId, updated);
    return updated;
  }

  // §6.9 创作者主动下架：目录不再展示、新用户不能获取；已获取用户
  // （买断/有效订阅）的授权完全不受影响——entitlement 存储不做任何回收。
  delist(publisherId: string, listingId: string): MarketListing {
    const listing = this.#requireListing(listingId);
    if (listing.publisher_id !== publisherId) {
      throw new MarketError(
        "not_listing_publisher",
        `listing ${listingId} can only be delisted by its publisher`,
      );
    }
    if (listing.delisted_at) {
      throw new MarketError(
        "listing_already_delisted",
        `listing ${listingId} was already delisted at ${listing.delisted_at}`,
      );
    }
    const now = this.#clock();
    const delisted: MarketListing = Object.freeze({ ...listing, delisted_at: now, updated_at: now });
    this.#listings.set(listingId, delisted);
    return delisted;
  }

  query(query: CatalogQuery = {}): ListingView[] {
    const views = [...this.#listings.values()]
      .filter((listing) => !listing.delisted_at)
      .map((listing) => this.#viewOf(listing));
    const search = query.search?.trim().toLowerCase();
    const filtered = views.filter(({ listing }) => {
      if (query.language && listing.language !== query.language) return false;
      if (query.difficulty && listing.difficulty !== query.difficulty) return false;
      if (query.tags?.length) {
        const owned = new Set(listing.tags);
        if (!query.tags.every((tag) => owned.has(tag))) return false;
      }
      if (search) {
        const inTitle = listing.title.toLowerCase().includes(search);
        const inTags = listing.tags.some((tag) => tag.toLowerCase().includes(search));
        if (!inTitle && !inTags) return false;
      }
      return true;
    });
    const sort = query.sort ?? "newest";
    filtered.sort((a, b) => {
      if (sort === "rating_desc") {
        const ra = a.rating_summary.average ?? -1;
        const rb = b.rating_summary.average ?? -1;
        if (rb !== ra) return rb - ra;
        return b.rating_summary.count - a.rating_summary.count;
      }
      if (sort === "downloads_desc") {
        return b.downloads - a.downloads;
      }
      return b.listing.published_at.localeCompare(a.listing.published_at);
    });
    return filtered;
  }

  view(listingId: string): ListingView | null {
    const listing = this.#listings.get(listingId);
    return listing ? this.#viewOf(listing) : null;
  }

  acquireFree(accountId: string, listingId: string): AcquisitionResult {
    const listing = this.#requireListing(listingId);
    if (listing.pricing.model !== "free") {
      throw new MarketError(
        "pricing_not_available",
        `listing ${listingId} uses ${listing.pricing.model} pricing; paid acquisition arrives with P8`,
      );
    }
    const resource = dlcResourceRef(listing.dlc_ref.dlc_id);
    const now = this.#clock();
    const existing = this.#entitlements.get(accountId, resource);
    if (existing && this.#entitlements.has(accountId, resource, now)) {
      // 已获取用户不受下架影响（§6.9：保留访问权）。
      return { entitlement: existing, view: this.#viewOf(listing), already_acquired: true };
    }
    if (listing.delisted_at) {
      throw new MarketError(
        "listing_delisted",
        `listing ${listingId} is delisted; new acquisitions stopped at ${listing.delisted_at} (existing owners keep access, product_spec §6.9)`,
      );
    }
    const entitlement = this.#entitlements.grant(accountId, resource, now);
    this.#downloads.set(listingId, (this.#downloads.get(listingId) ?? 0) + 1);
    return { entitlement, view: this.#viewOf(listing), already_acquired: false };
  }

  review(accountId: string, listingId: string, rating: number, text?: string): Review {
    const listing = this.#requireListing(listingId);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new MarketError("invalid_rating", "rating must be an integer between 1 and 5");
    }
    const now = this.#clock();
    const resource = dlcResourceRef(listing.dlc_ref.dlc_id);
    if (!this.#entitlements.has(accountId, resource, now)) {
      throw new MarketError(
        "review_requires_entitlement",
        `account ${accountId} must acquire ${resource} before reviewing ${listingId} (product_spec §4.3)`,
      );
    }
    const key = `${accountId}::${listingId}`;
    const existing = this.#reviews.get(key);
    const review: Review = Object.freeze({
      listing_id: listingId,
      account_id: accountId,
      rating,
      text: text && text.trim().length > 0 ? text : undefined,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    });
    this.#reviews.set(key, review);
    return review;
  }

  reviewsFor(listingId: string): Review[] {
    return [...this.#reviews.values()]
      .filter((review) => review.listing_id === listingId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  #requireListing(listingId: string): MarketListing {
    const listing = this.#listings.get(listingId);
    if (!listing) {
      throw new MarketError("listing_not_found", `unknown listing: ${listingId}`);
    }
    return listing;
  }

  #viewOf(listing: MarketListing): ListingView {
    const reviews = this.reviewsFor(listing.listing_id);
    const average =
      reviews.length === 0
        ? null
        : Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 100) / 100;
    return {
      listing,
      rating_summary: { average, count: reviews.length },
      downloads: this.#downloads.get(listing.listing_id) ?? 0,
    };
  }
}
