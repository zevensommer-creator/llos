// T-038 Studio 浏览器 E2E（真实 API 模式）：
//   1. 教师模板建草稿 → 沙箱 → 发布（happy path 全流程）
//   2. PNG 上传（OCR 摄入）→ 结构化成功
//   3. 空图 OCR 教学化拒绝
//   4. 专家模式：训练模式保存 → 清单保存不丢扩展 → 未知 stage/坏 manifest 拒绝 → 确认 → 沙箱 → 发布

import { test, expect } from "@playwright/test";
import {
  openApp,
  switchAccount,
  gotoView,
  expectWarn,
  expectNotice,
  pngStub,
  OCR_TEXT,
  EXPERT_MODES_JSON,
  BAD_STAGE_MODES_JSON,
} from "./helpers.js";

async function fillPublishForm(page: import("@playwright/test").Page, title: string) {
  await page.getByPlaceholder("一句话介绍这门课").fill(`E2E 发布：${title}`);
  await page.getByPlaceholder("餐饮 旅行").fill("e2e 会话");
  await page.locator(".studio-ack input[type=checkbox]").check();
  await page.getByRole("button", { name: "发布（免费）" }).click();
}

test("教师模板建草稿 → 沙箱 → 发布", async ({ page }) => {
  await openApp(page);
  await switchAccount(page, "teacher");
  await gotoView(page, "创作");

  // 模板加速器：点卡片即建草稿并完成 AI 结构化
  await page.getByRole("button", { name: "情景对话" }).click();
  await expect(page.getByRole("button", { name: "确认内容" })).toBeVisible();
  await expectNotice(page, "已从模板「情景对话」预填");

  // review：改标题 → 确认
  const titleInput = page.locator(".studio-review label.control input[type=text]").first();
  await titleInput.fill("E2E 发布会话课");
  await page.getByRole("button", { name: "确认内容" }).click();
  await expectNotice(page, "已确认");

  // 沙箱：真实编译产物（经 Gateway adapter + RPC）
  await page.getByRole("button", { name: "开始试运行" }).click();
  const report = page.locator(".studio-report[role=status]");
  await expect(report).toContainText("试运行完成");
  await page.getByRole("button", { name: "去发布" }).click();

  // 发布（服务端 publish_dlc 门禁 + 下架告知确认）
  await fillPublishForm(page, "E2E 发布会话课");
  const done = page.locator(".studio-done[role=status]");
  await expect(done).toContainText("已发布到市场");

  // 侧栏「我的课程」出现新课程
  await expect(page.locator(".studio-dlc-list")).toContainText("E2E 发布会话课");
});

test("PNG 上传 OCR 摄入成功", async ({ page }) => {
  await openApp(page);
  await switchAccount(page, "teacher");
  await gotoView(page, "创作");

  // 选择文件即自动触发 OCR → AI 结构化（FileReader → createStudioDraft image 路径）
  await page.locator('input[type=file][accept*="png"]').setInputFiles({
    name: "cafe-flyer.png",
    mimeType: "image/png",
    buffer: pngStub(OCR_TEXT),
  });

  await expect(page.getByRole("button", { name: "确认内容" })).toBeVisible();
  await expect(page.locator(".studio-review")).toContainText("已通过图片 OCR");
  await expect(page.locator(".studio-units")).toContainText("第 1 课");

  // 清理：放弃草稿，避免遗留
  await page.getByRole("button", { name: "放弃草稿" }).click();
  await expect(page.locator(".studio-review")).not.toBeVisible();
});

test("空图 OCR 教学化拒绝", async ({ page }) => {
  await openApp(page);
  await switchAccount(page, "teacher");
  await gotoView(page, "创作");

  // 空 OCR 结果（仅 marker 行，无内容）→ 服务端教学化拒绝，页面不崩溃
  await page.locator('input[type=file][accept*="png"]').setInputFiles({
    name: "empty.png",
    mimeType: "image/png",
    buffer: pngStub(""),
  });

  await expectWarn(page, "图片文字识别失败");
});

test("专家模式：训练模式 + 清单不丢扩展 + 教学化拒绝 + 发布", async ({ page }) => {
  await openApp(page);
  await switchAccount(page, "teacher");
  await gotoView(page, "创作");
  await page.getByRole("button", { name: "动词配价" }).click();
  await expect(page.getByRole("button", { name: "确认内容" })).toBeVisible();

  // 进入专家模式
  await page.locator(".studio-expert-toggle").getByRole("button", { name: /专家模式/ }).click();
  const modes = page.locator(".studio-expert textarea.studio-textarea--code").nth(0);
  const manifest = page.locator(".studio-expert textarea.studio-textarea--code").nth(1);
  await expect(modes).toBeVisible();

  // 保存自定义训练模式
  await modes.fill(EXPERT_MODES_JSON);
  await page.getByRole("button", { name: "保存训练模式" }).click();
  await expectNotice(page, "训练模式已保存并通过编译检查");

  // 再改清单并保存：断言训练模式定义不丢（extension 保留）
  const manifestText = await manifest.inputValue();
  const patched = manifestText.replace(
    /"description":\s*"[^"]*"/,
    '"description": "E2E 专家清单（含自定义训练模式）"',
  );
  await manifest.fill(patched);
  await page.getByRole("button", { name: "保存清单" }).click();
  await expectNotice(page, "课程清单已保存并通过编译检查");
  await expect(modes).toHaveValue(expect.stringContaining("mode.expert.dictation"));

  // 未知 stage 引用 → 教学化拒绝（保存失败，页面不崩溃）
  await modes.fill(BAD_STAGE_MODES_JSON);
  await page.getByRole("button", { name: "保存训练模式" }).click();
  await expectWarn(page);
  await expect(modes).toBeVisible();

  // 坏 manifest（dlc_id 不可改）→ 教学化拒绝
  await modes.fill(EXPERT_MODES_JSON);
  await page.getByRole("button", { name: "保存训练模式" }).click();
  await expectNotice(page, "训练模式已保存并通过编译检查");
  await manifest.fill('{"dlc_id":"dlc.hacked"}');
  await page.getByRole("button", { name: "保存清单" }).click();
  await expectWarn(page);

  // 恢复合法清单 → 确认 → 沙箱 → 发布（含自定义训练模式步骤序列）
  await manifest.fill(manifestText);
  await page.getByRole("button", { name: "保存清单" }).click();
  await expectNotice(page, "课程清单已保存并通过编译检查");
  await page.getByRole("button", { name: "确认并继续" }).click();
  await page.getByRole("button", { name: "开始试运行" }).click();
  const report = page.locator(".studio-report[role=status]");
  await expect(report).toContainText("试运行完成");
  await page.getByRole("button", { name: "去发布" }).click();
  await fillPublishForm(page, "E2E 专家发布会话课");
  await expect(page.locator(".studio-done[role=status]")).toContainText("已发布到市场");
});
