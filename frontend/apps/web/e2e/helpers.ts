// T-038 Playwright 通用助手：账户切换 / 导航 / 教学化反馈断言 / PNG fixture。

import { expect, type Page } from "@playwright/test";

export const PNG_STUB_MARKER = "%PNG-STUB";

/** 构造「真实 PNG 字节」：deterministic OCR 为 base64→UTF-8 解码，文本即字面内容。 */
export function pngStub(text: string): Buffer {
  return Buffer.from(`${PNG_STUB_MARKER}\n${text}`, "utf-8");
}

/** 打开应用首页（baseURL http://127.0.0.1:5173）。 */
export async function openApp(page: Page) {
  await page.goto("/");
  // app-header 之外旅程视图还有 journey-head 的 <header>，必须用类名消歧（strict mode）。
  await expect(page.locator("header.app-header")).toBeVisible();
}

/** 切换账户（真实模式：accountKind → REAL_ACCOUNT_IDS 映射到种子账户）。 */
export async function switchAccount(page: Page, kind: "teacher" | "learner") {
  await page.locator("header.app-header select").selectOption(kind);
  await expect(page.locator("header.app-header select")).toHaveValue(kind);
}

/** 点击顶部导航 tab（创作 / 市场 / 班级 / 学习…）。 */
export async function gotoView(page: Page, label: string) {
  await page.getByRole("button", { name: label, exact: false }).first().click();
}

/** 等待教学化警告（错误被捕获并以可读形式呈现，而非崩溃）。 */
export async function expectWarn(page: Page, fragment?: string) {
  const warn = page.locator('.studio-warn[role="alert"]').first();
  await expect(warn).toBeVisible();
  if (fragment) await expect(warn).toContainText(fragment);
  return warn;
}

/** 等待 ok 提示（Market 用 .notice--ok；Studio 用 .class-notice-line）。 */
export async function expectNotice(page: Page, fragment: string) {
  const notice = page
    .locator(".notice.notice--ok, .class-notice-line")
    .filter({ hasText: fragment })
    .first();
  await expect(notice).toBeVisible();
}

export const CAFE_TITLE = "咖啡馆点单（Café Deutsch）";
export const REFERENCE_TITLE = "酒店入住场景训练";

export const OCR_TEXT = [
  "Szenario: 服务员和顾客在咖啡厅",
  "Valenz: 服务员 (NOM) + 提供 (AKK)",
  "Konstruktion: 我们想要两份浓缩咖啡。",
].join("\n");

/** 专家训练模式定义（合法；与向导 placeholder 同构）。 */
export const EXPERT_MODES_JSON = JSON.stringify({
  modes: [
    {
      mode_ref: "mode.expert.dictation",
      claim_suffix: "checkin_dialogue",
      steps: [
        { primitive: "present" },
        { primitive: "capture_text" },
        { primitive: "evaluate" },
        { primitive: "feedback" },
        { primitive: "schedule" },
      ],
    },
  ],
  stage_modes: { "frame.1": "mode.expert.dictation" },
});

/** 未知 stage 引用 → 编译检查必须教学化拒绝。 */
export const BAD_STAGE_MODES_JSON = JSON.stringify({
  modes: [
    {
      mode_ref: "mode.expert.unknown",
      claim_suffix: "x",
      steps: [{ primitive: "present" }],
    },
  ],
  stage_modes: { "frame.99": "mode.expert.unknown" },
});
