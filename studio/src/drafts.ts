import type { InMemoryAccountStore } from "@llos/core";
import type { ProviderGateway } from "@llos/gateway";
import type { DLCManifest, MaterialPack } from "@llos/contracts";
import { validate } from "@llos/contracts";
import {
  CompilationError,
  parseTrainingModes,
  sha256Hex,
  TRAINING_MODES_EXTENSION_KEY,
} from "@llos/compiler";
import { StudioError, translateSchemaErrors } from "./errors.js";
import { ingestSource, type IngestSource, type StructuredUnit } from "./ingest.js";
import { compileDraft } from "./sandbox.js";
import {
  buildManifestDraft,
  buildMaterialPack,
  type CefrLevel,
} from "./build.js";

// 草稿生命周期（product_spec §6.2/§6.6 向导模式）：
// structured（AI 结构化产出）→ confirmed（表单确认）→ published（经发布门禁）。

export type DraftStatus = "structured" | "confirmed" | "published" | "discarded";

export const CREATE_DRAFT_CAPABILITY = "create_dlc_draft";

export interface DraftBase {
  pack: MaterialPack;
  manifest: DLCManifest;
}

export interface StudioDraft {
  draft_id: string;
  creator_id: string;
  status: DraftStatus;
  language: string;
  cefr_level: CefrLevel;
  units: StructuredUnit[];
  material_pack: MaterialPack;
  manifest: DLCManifest;
  structured_by: { provider_id: string; model_id?: string };
  /** 图片摄入时记录 OCR 所用 provider（格式解析步骤溯源）。 */
  ocr_by?: { provider_id: string; model_id?: string };
  /** 专家模式：训练模式定义资源内容（manifest extensions 经 sha256 引用它）。 */
  training_modes_json?: string;
  /** 专家模式：manifest 或训练模式被直接编辑过；向导编辑随之锁定。 */
  expert_edited?: boolean;
  /** 修订草稿的已发布基线（发布时用于版本判定 §6.7）。 */
  base?: DraftBase;
  created_at: string;
  updated_at: string;
}

export interface CreateDraftInput {
  source: IngestSource;
  cefrLevel: CefrLevel;
  description?: string;
  creatorName?: string;
}

export interface DraftEdit {
  title?: string;
  description?: string;
  units?: StructuredUnit[];
}

export interface StudioDraftsDeps {
  accountStore: InMemoryAccountStore;
  gateway: ProviderGateway;
  clock: () => string;
  preferProviderIds?: readonly string[];
}

export class StudioDrafts {
  readonly #accounts: InMemoryAccountStore;
  readonly #gateway: ProviderGateway;
  readonly #clock: () => string;
  readonly #preferProviderIds?: readonly string[];
  readonly #drafts = new Map<string, StudioDraft>();
  #nextId = 1;

  constructor(deps: StudioDraftsDeps) {
    this.#accounts = deps.accountStore;
    this.#gateway = deps.gateway;
    this.#clock = deps.clock;
    this.#preferProviderIds = deps.preferProviderIds;
  }

  async createDraft(creatorId: string, input: CreateDraftInput): Promise<StudioDraft> {
    if (!this.#accounts.hasCapability(creatorId, CREATE_DRAFT_CAPABILITY)) {
      throw new StudioError(
        "capability_missing",
        `账户 ${creatorId} 没有创建课程草稿的权限（create_dlc_draft）`,
      );
    }
    const structured = await ingestSource(input.source, {
      gateway: this.#gateway,
      ...(this.#preferProviderIds ? { preferProviderIds: this.#preferProviderIds } : {}),
    });
    const n = this.#nextId++;
    const now = this.#clock();
    const title = input.source.title;
    const draft: StudioDraft = {
      draft_id: `draft.studio.${n}`,
      creator_id: creatorId,
      status: "structured",
      language: input.source.language,
      cefr_level: input.cefrLevel,
      units: structured.units,
      material_pack: buildMaterialPack(structured, {
        language: input.source.language,
        title,
        ...(input.description ? { description: input.description } : {}),
        cefrLevel: input.cefrLevel,
        creatorName: input.creatorName ?? creatorId,
        packId: `material.studio.${n}`,
        dlcId: `dlc.studio.${n}`,
        version: "0.1.0",
        createdAt: now,
      }),
      manifest: buildManifestDraft({
        language: input.source.language,
        title,
        ...(input.description ? { description: input.description } : {}),
        cefrLevel: input.cefrLevel,
        creatorName: input.creatorName ?? creatorId,
        packId: `material.studio.${n}`,
        dlcId: `dlc.studio.${n}`,
        version: "0.1.0",
        createdAt: now,
      }),
      structured_by: structured.structured_by,
      ...(structured.ocr_by ? { ocr_by: structured.ocr_by } : {}),
      created_at: now,
      updated_at: now,
    };
    this.#drafts.set(draft.draft_id, draft);
    return draft;
  }

  get(creatorId: string, draftId: string): StudioDraft {
    const draft = this.#drafts.get(draftId);
    if (!draft) {
      throw new StudioError("draft_not_found", `草稿不存在：${draftId}`);
    }
    if (draft.creator_id !== creatorId) {
      throw new StudioError("not_draft_owner", "只有草稿作者可以访问这份草稿");
    }
    return draft;
  }

  listByCreator(creatorId: string): StudioDraft[] {
    return [...this.#drafts.values()].filter((d) => d.creator_id === creatorId);
  }

  /** 表单确认与调整（§6.2 创作者在表单中确认）；每次编辑后重建并重校验。 */
  edit(creatorId: string, draftId: string, edit: DraftEdit): StudioDraft {
    const draft = this.get(creatorId, draftId);
    if (draft.status === "published" || draft.status === "discarded") {
      throw new StudioError(
        "draft_state_invalid",
        `草稿已${draft.status === "published" ? "发布" : "废弃"}，不能继续编辑；如需修改请发起修订`,
      );
    }
    if (draft.expert_edited) {
      throw new StudioError(
        "draft_state_invalid",
        "此草稿包含专家模式修改（训练模式或清单），向导编辑会覆盖它们；请继续用专家模式编辑，或重新创建草稿",
      );
    }
    const units = edit.units ?? draft.units;
    const title = edit.title?.trim() || draft.manifest.display_name;
    const description =
      edit.description !== undefined ? edit.description : draft.material_pack.description;
    const now = this.#clock();
    const structured = {
      units,
      structured_by: draft.structured_by,
    };
    const pack = buildMaterialPack(structured, {
      language: draft.language,
      title,
      ...(description ? { description } : {}),
      cefrLevel: draft.cefr_level,
      creatorName: draft.creator_id,
      packId: draft.material_pack.pack_id,
      dlcId: draft.manifest.dlc_id,
      version: draft.material_pack.version,
      createdAt: draft.material_pack.provenance.created_at,
    });
    // 修订基线锁定的是已发布版本，编辑期间版本号不动（§6.7 创作者不接触版本号）。
    const manifest = buildManifestDraft({
      language: draft.language,
      title,
      ...(description ? { description } : {}),
      cefrLevel: draft.cefr_level,
      creatorName: draft.creator_id,
      packId: pack.pack_id,
      dlcId: draft.manifest.dlc_id,
      version: draft.manifest.version,
      createdAt: now,
    });
    const updated: StudioDraft = {
      ...draft,
      units,
      material_pack: pack,
      manifest,
      ...(draft.base ? { base: draft.base } : {}),
      updated_at: now,
    };
    this.#drafts.set(draftId, updated);
    return updated;
  }

  confirm(creatorId: string, draftId: string, edit: DraftEdit = {}): StudioDraft {
    const draft = this.get(creatorId, draftId);
    const hasEdit = edit.title !== undefined || edit.description !== undefined || edit.units !== undefined;
    if (draft.expert_edited && hasEdit) {
      throw new StudioError(
        "draft_state_invalid",
        "此草稿包含专家模式修改，不能再用向导表单调整；如需改动请继续用专家模式编辑",
      );
    }
    if (draft.expert_edited) {
      const confirmed: StudioDraft = { ...draft, status: "confirmed", updated_at: this.#clock() };
      this.#drafts.set(draftId, confirmed);
      return confirmed;
    }
    const updated = this.edit(creatorId, draftId, edit);
    const confirmed: StudioDraft = { ...updated, status: "confirmed", updated_at: this.#clock() };
    this.#drafts.set(draftId, confirmed);
    return confirmed;
  }

  /**
   * 专家模式：直接提交训练模式定义（§6.6）。定义经编译器同一套校验，
   * 并以 sha256 信封写入 manifest extensions；写回前过编译门禁。
   */
  editTrainingModes(creatorId: string, draftId: string, modesJson: string): StudioDraft {
    const draft = this.#requireEditable(creatorId, draftId);
    let payload: unknown;
    try {
      payload = JSON.parse(modesJson);
    } catch {
      throw new StudioError(
        "draft_schema_invalid",
        "训练模式定义不是有效的 JSON，请检查括号、引号与逗号",
      );
    }
    try {
      parseTrainingModes(payload);
    } catch (err) {
      throw new StudioError(
        "draft_schema_invalid",
        err instanceof CompilationError
          ? `训练模式定义无法使用：${err.message.replace(/^\[[^\]]+\]\s*[^:]*:\s*/, "")}`
          : "训练模式定义无法使用，请检查内容",
      );
    }
    const manifest = structuredClone(draft.manifest);
    manifest.extensions = {
      ...manifest.extensions,
      [TRAINING_MODES_EXTENSION_KEY]: {
        schema_id: TRAINING_MODES_EXTENSION_KEY,
        schema_version: "0.1.0",
        payload_ref: {
          uri: `artifact://dlc/${manifest.dlc_id}/templates/training-modes`,
          sha256: sha256Hex(modesJson),
        },
      },
    };
    this.#assertCompilable(draft, manifest, modesJson);
    const updated: StudioDraft = {
      ...draft,
      manifest,
      training_modes_json: modesJson,
      expert_edited: true,
      status: "structured",
      updated_at: this.#clock(),
    };
    this.#drafts.set(draftId, updated);
    return updated;
  }

  /** 专家模式：直接编辑完整 manifest JSON（§6.6）；schema 校验 + 编译门禁 + 教学化错误。 */
  editManifest(creatorId: string, draftId: string, manifestJson: string): StudioDraft {
    const draft = this.#requireEditable(creatorId, draftId);
    let parsed: unknown;
    try {
      parsed = JSON.parse(manifestJson);
    } catch {
      throw new StudioError(
        "draft_schema_invalid",
        "课程清单不是有效的 JSON，请检查括号、引号与逗号",
      );
    }
    const result = validate("dlc-manifest", parsed);
    if (!result.valid) {
      throw new StudioError(
        "draft_schema_invalid",
        "课程清单暂不满足格式要求",
        translateSchemaErrors("dlc-manifest", result.errors),
      );
    }
    const manifest = parsed as DLCManifest;
    if (manifest.dlc_id !== draft.manifest.dlc_id) {
      throw new StudioError(
        "draft_schema_invalid",
        `课程标识（dlc_id）不能修改：清单声明 ${manifest.dlc_id}，草稿是 ${draft.manifest.dlc_id}`,
      );
    }
    this.#assertCompilable(draft, manifest, draft.training_modes_json);
    const updated: StudioDraft = {
      ...draft,
      manifest,
      expert_edited: true,
      status: "structured",
      updated_at: this.#clock(),
    };
    this.#drafts.set(draftId, updated);
    return updated;
  }

  #requireEditable(creatorId: string, draftId: string): StudioDraft {
    const draft = this.get(creatorId, draftId);
    if (draft.status === "published" || draft.status === "discarded") {
      throw new StudioError(
        "draft_state_invalid",
        `草稿已${draft.status === "published" ? "发布" : "废弃"}，不能继续编辑；如需修改请发起修订`,
      );
    }
    return draft;
  }

  /** 专家编辑的编译门禁：与沙箱/发布共用同一条编译链（§6.7 发布前编译校验）。 */
  #assertCompilable(
    draft: StudioDraft,
    manifest: DLCManifest,
    trainingModes: string | undefined,
  ): void {
    try {
      compileDraft(draft.material_pack, manifest, {
        clock: this.#clock,
        ...(trainingModes ? { trainingModes } : {}),
      });
    } catch (err) {
      if (err instanceof StudioError) {
        throw new StudioError(
          "draft_schema_invalid",
          `修改后的课程暂不能通过编译检查：${err.message.replace(/^试运行前的编译检查未通过，暂时无法试用：/, "")}`,
          err.details,
        );
      }
      throw err;
    }
  }

  discard(creatorId: string, draftId: string): StudioDraft {
    const draft = this.get(creatorId, draftId);
    if (draft.status === "published") {
      throw new StudioError("draft_state_invalid", "已发布的课程请走下架流程，不能直接废弃草稿");
    }
    const discarded: StudioDraft = { ...draft, status: "discarded", updated_at: this.#clock() };
    this.#drafts.set(draftId, discarded);
    return discarded;
  }

  /** 从已发布课程发起修订：新草稿以已发布内容为基线（§6.7/§6.8 自动更新）。 */
  startRevision(creatorId: string, publishedDraftId: string): StudioDraft {
    const published = this.get(creatorId, publishedDraftId);
    if (published.status !== "published") {
      throw new StudioError("draft_state_invalid", "只能对已发布的课程发起修订");
    }
    const n = this.#nextId++;
    const now = this.#clock();
    const draft: StudioDraft = {
      draft_id: `draft.studio.${n}`,
      creator_id: creatorId,
      status: "structured",
      language: published.language,
      cefr_level: published.cefr_level,
      units: published.units.map((u) => ({ ...u })),
      material_pack: structuredClone(published.material_pack),
      manifest: structuredClone(published.manifest),
      structured_by: published.structured_by,
      ...(published.training_modes_json
        ? { training_modes_json: published.training_modes_json }
        : {}),
      ...(published.expert_edited ? { expert_edited: published.expert_edited } : {}),
      base: {
        pack: structuredClone(published.material_pack),
        manifest: structuredClone(published.manifest),
      },
      created_at: now,
      updated_at: now,
    };
    this.#drafts.set(draft.draft_id, draft);
    return draft;
  }

  /** 发布成功后落状态与版本（由 StudioService 调用）。 */
  markPublished(draft: StudioDraft, pack: MaterialPack, manifest: DLCManifest): StudioDraft {
    const published: StudioDraft = {
      ...draft,
      status: "published",
      material_pack: pack,
      manifest,
      base: undefined,
      updated_at: this.#clock(),
    };
    this.#drafts.set(draft.draft_id, published);
    return published;
  }
}
