import type { DLCManifest, MaterialPack } from "@llos/contracts";
import { contentHash } from "@llos/compiler";
import { MarketService, type ListingDlcRef, type ListingPricing, type MarketListing, type DifficultyLevel } from "@llos/market";
import { StudioError } from "./errors.js";
import { compileDraft } from "./sandbox.js";
import { bumpVersion, decideVersionBump, type VersionDecision } from "./versioning.js";
import { assertManifestValid, assertPackSchema } from "./build.js";
import type { StudioDraft, StudioDrafts } from "./drafts.js";

// 发布对接（product_spec §6.7/§6.9）：
// - 发布门禁：草稿必须 confirmed + 编译检查通过 + publish_dlc 能力（market 层执行）；
// - 告知义务：发布必须显式确认"下架只影响新用户，不收回既有用户权利"；
// - 版本隐形：修订发布时系统自动判定 bump，创作者从不接触版本号；
// - 自动更新：市场条目的资源引用无版本号，授权一次即随更新（§6.8）。

export interface PublishListingInput {
  summary: string;
  difficulty?: DifficultyLevel;
  tags?: string[];
  pricing: ListingPricing;
}

export interface PublishDraftInput {
  listing: PublishListingInput;
  /** §6.9 创作者告知义务：必须显式确认知悉下架规则。 */
  acknowledged_delist_terms: boolean;
}

export interface PublishResult {
  listing: MarketListing;
  version: string;
  first_publish: boolean;
  bump?: VersionDecision;
}

export interface StudioServiceDeps {
  drafts: StudioDrafts;
  market: MarketService;
  clock: () => string;
}

export class StudioService {
  readonly #drafts: StudioDrafts;
  readonly #market: MarketService;
  readonly #clock: () => string;

  constructor(deps: StudioServiceDeps) {
    this.#drafts = deps.drafts;
    this.#market = deps.market;
    this.#clock = deps.clock;
  }

  async publishDraft(creatorId: string, draftId: string, input: PublishDraftInput): Promise<PublishResult> {
    const draft = this.#drafts.get(creatorId, draftId);
    if (draft.status !== "confirmed") {
      throw new StudioError(
        "draft_state_invalid",
        `草稿状态是 ${draft.status}；请先在表单里确认内容，再发布`,
      );
    }
    if (input.acknowledged_delist_terms !== true) {
      throw new StudioError(
        "delist_acknowledgement_required",
        "发布前请确认知悉：学员获取的是长期授权，下架只影响新获取，不收回既有学员的访问权。",
      );
    }
    // §6.7 发布前编译门禁：编译不过不允许发布（专家模式带训练模式定义一起编译）。
    compileDraft(draft.material_pack, draft.manifest, {
      clock: this.#clock,
      ...(draft.training_modes_json ? { trainingModes: draft.training_modes_json } : {}),
    });

    if (!draft.base) {
      return this.#firstPublish(draft, input);
    }
    return this.#updatePublish(draft, input);
  }

  #firstPublish(draft: StudioDraft, input: PublishDraftInput): PublishResult {
    const pack: MaterialPack = assertPackSchema({
      ...draft.material_pack,
      lifecycle: "published",
    });
    const manifestSha = contentHash(draft.manifest);
    const listing = this.#market.publish(draft.creator_id, {
      dlc_ref: {
        dlc_id: draft.manifest.dlc_id,
        version: draft.manifest.version,
        sha256: manifestSha,
      },
      title: draft.manifest.display_name,
      summary: input.listing.summary,
      language: primaryLanguage(draft.language),
      ...(input.listing.difficulty ? { difficulty: input.listing.difficulty } : {}),
      ...(input.listing.tags ? { tags: input.listing.tags } : {}),
      pricing: input.listing.pricing,
    });
    this.#markPublished(draft, pack);
    return { listing, version: draft.manifest.version, first_publish: true };
  }

  #updatePublish(draft: StudioDraft, input: PublishDraftInput): PublishResult {
    if (!draft.base) {
      throw new StudioError("update_without_published_base", "修订发布缺少已发布基线");
    }
    const bump = decideVersionBump(draft.base, { pack: draft.material_pack, manifest: draft.manifest });
    const version = bumpVersion(draft.base.manifest.version, bump.kind);
    const pack: MaterialPack = assertPackSchema({
      ...draft.material_pack,
      version,
      lifecycle: "published",
    });
    const manifest: DLCManifest = assertManifestValid({
      ...draft.manifest,
      version,
      package: {
        ...draft.manifest.package,
        artifact_uri: `artifact://dlc/${draft.manifest.dlc_id}/${version}`,
      },
    });
    const listingId = `listing.${manifest.dlc_id}`;
    const dlcRef: ListingDlcRef = {
      dlc_id: manifest.dlc_id,
      version,
      sha256: contentHash(manifest),
    };
    const listing = this.#market.updateVersion(draft.creator_id, listingId, dlcRef);
    this.#markPublished(draft, pack, manifest);
    return { listing, version, first_publish: false, bump };
  }

  #markPublished(draft: StudioDraft, pack: MaterialPack, manifest?: DLCManifest): void {
    this.#drafts.markPublished(
      draft,
      pack,
      manifest ?? draft.manifest,
    );
  }

  /** 下架（§6.9）：停止新获取；已获取用户保留访问权（市场层执行）。 */
  delist(creatorId: string, draftId: string): { listing_id: string; delisted_at: string } {
    const draft = this.#drafts.get(creatorId, draftId);
    if (draft.status !== "published") {
      throw new StudioError("draft_state_invalid", "只有已发布的课程可以下架");
    }
    const listing = this.#market.delist(creatorId, `listing.${draft.manifest.dlc_id}`);
    return { listing_id: listing.listing_id, delisted_at: listing.delisted_at ?? "" };
  }
}

function primaryLanguage(language: string): string {
  return language.split("-")[0].toLowerCase();
}
