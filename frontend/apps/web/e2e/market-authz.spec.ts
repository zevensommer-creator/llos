// T-038 市场与授权 E2E（真实 API 模式）：
//   1. 学员市场获取 reference listing → 开始训练入口
//   2. 服务端重新授权：create_dlc_draft 属 BASE 能力（学习者可建草稿、走完沙箱），
//      publish_dlc 门禁在发布时由服务端裁决 → 教学化拒绝，页面不崩溃

import { test, expect } from "@playwright/test";
import { switchAccount, gotoView, expectNotice, expectWarn, openApp, REFERENCE_TITLE } from "./helpers.js";

test("学员获取 reference 训练内容", async ({ page }) => {
  await openApp(page);
  await switchAccount(page, "learner");
  await gotoView(page, "市场");

  // 打开 reference listing 详情
  await page.getByRole("button", { name: `查看详情：${REFERENCE_TITLE}` }).click();
  await expect(page.locator(".market-detail")).toContainText(REFERENCE_TITLE);

  // 免费获取 → 已获得 → 开始训练
  await page.getByRole("button", { name: "免费获取" }).click();
  await expect(page.locator(".notice.notice--ok")).toContainText("获取成功，现在可以开始训练了。");
  await expect(page.locator(".market-owned-badge")).toContainText("已获得");
  await expect(page.locator(".market-detail").getByRole("button", { name: "开始训练" })).toBeVisible();
});

test("服务端重新授权：学习者建草稿允许、发布被拒", async ({ page }) => {
  await openApp(page);
  await switchAccount(page, "learner");
  await gotoView(page, "创作");

  // UI 不隐藏入口（隐藏按钮只是表现层）；create_dlc_draft 是 BASE 能力，草稿可建
  await page.getByPlaceholder("如：咖啡馆德语速成").fill("学习者试探课");
  await page.locator(".studio-textarea").first().fill("Szenario: 测试权限\nKonstruktion: 学习者不应能发布。");
  await page.getByRole("button", { name: "AI 结构化" }).click();
  await expect(page.getByRole("button", { name: "确认内容" })).toBeVisible();

  await page.getByRole("button", { name: "确认内容" }).click();
  await expectNotice(page, "已确认");
  await page.getByRole("button", { name: "开始试运行" }).click();
  await expect(page.locator(".studio-report[role=status]")).toContainText("试运行完成");
  await page.getByRole("button", { name: "去发布" }).click();

  // publish_dlc 门禁在服务端裁决（teacher_verified 才有）：教学化警告，页面不崩溃
  await page.getByPlaceholder("一句话介绍这门课").fill("学习者不应能发布");
  await page.locator(".studio-ack input[type=checkbox]").check();
  await page.getByRole("button", { name: "发布（免费）" }).click();
  await expectWarn(page, "publish_dlc");
});
