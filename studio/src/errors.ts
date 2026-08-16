export type StudioErrorCode =
  | "capability_missing"
  | "ingest_source_empty"
  | "structure_output_invalid"
  | "ocr_output_invalid"
  | "provider_unavailable"
  | "draft_not_found"
  | "not_draft_owner"
  | "draft_state_invalid"
  | "draft_schema_invalid"
  | "sandbox_compile_failed"
  | "delist_acknowledgement_required"
  | "update_without_published_base";

export class StudioError extends Error {
  readonly code: StudioErrorCode;
  readonly details: readonly string[];

  constructor(code: StudioErrorCode, message: string, details: readonly string[] = []) {
    super(message);
    this.name = "StudioError";
    this.code = code;
    this.details = details;
  }
}

// product_spec §6.2：校验失败提示必须翻译成教学语言，不得暴露技术错误。
// Ajv 错误形如 "/semantic_frames/0/facts must have required ..."，这里把
// 实例路径映射成"第 N 课"的人类措辞；未识别的路径给保守的通用说法。
const PATH_RULES: { pattern: RegExp; render: (m: RegExpMatchArray) => string }[] = [
  {
    pattern: /^\/semantic_frames\/(\d+)/,
    render: (m) => `第 ${Number(m[1]) + 1} 课`,
  },
  {
    pattern: /^\/languages/,
    render: () => "语言信息",
  },
  {
    pattern: /^\/display_name/,
    render: () => "课程标题",
  },
  {
    pattern: /^\/description/,
    render: () => "课程说明",
  },
  {
    pattern: /^\/version/,
    render: () => "版本信息",
  },
];

export function translateSchemaErrors(contract: string, errors: readonly string[]): string[] {
  return errors.map((raw) => {
    const path = raw.split(" ")[0] ?? "/";
    for (const rule of PATH_RULES) {
      const m = path.match(rule.pattern);
      if (m) {
        return `${rule.render(m)}存在内容问题：${technicalToTeaching(raw)}`;
      }
    }
    return `草稿存在内容问题：${technicalToTeaching(raw)}`;
  });
}

function technicalToTeaching(raw: string): string {
  let msg = raw;
  msg = msg.replace(/must have required property '([^']+)'/g, "缺少“$1”");
  msg = msg.replace(/must be equal to one of the allowed values/g, "取值不在允许范围");
  msg = msg.replace(/must be string/g, "应为文字内容");
  msg = msg.replace(/must be integer/g, "应为整数");
  msg = msg.replace(/must NOT have fewer than (\d+) characters/g, "内容太短（至少 $1 字）");
  msg = msg.replace(/must match a format in "date-time"/g, "日期格式不正确");
  msg = msg.replace(/\/semantic_frames\/(\d+)/g, "第 $1 课");
  msg = msg.replace(/\/titles\/0\/text/g, "标题");
  msg = msg.replace(/\/facts/g, "例句与要点");
  msg = msg.replace(/\/participants/g, "对话角色");
  msg = msg.replace(/\/lexical_candidates/g, "生词表");
  msg = msg.replace(/\//g, "");
  if (msg.length > 160) msg = `${msg.slice(0, 157)}…`;
  return msg.trim();
}
