// T-038 修订继承与下架保旧 E2E（真实 API 模式）：
//   1. 教师修订已发布课程（以已发布内容为基线）→ 确认 → 沙箱 → 发布 patch
//   2. 下架：仅影响新获取；已获取学员保留访问权（教师侧标记 + 学员市场列表不再出现）

import { test, expect } from "@playwright/test";
import { switchAccount, gotoView, expectNotice, CAFE_TITLE, openApp } from "./helpers.js";

async function cafeListItem(page: import("@playwright/test").Page) {
  const items = page.locator(".studio-dlc-list li");
  await expect(items.first()).toBeVisible();
  return items.filter({ hasText: CAFE_TITLE }).first();
}

test("修订已发布课程 → 发布 patch", async ({ page }) => {
  await openApp(page);
  await switchAccount(page, "teacher");
  await gotoView(page, "创作");

  const item = await cafeListItem(page);
  await item.getByRole("button", { name: "修订" }).click();
  await expectNotice(page, "修订草稿已创建：以已发布内容为基线");

  // 继承基线内容进入 review → 确认 → 沙箱 → 发布 patch
  await expect(page.getByRole("button", { name: "确认内容" })).toBeVisible();
  await page.getByRole("button", { name: "确认内容" }).click();
  await expectNotice(page, "已确认");
  await page.getByRole("button", { name: "开始试运行" }).click();
  await expect(page.locator(".studio-report[role=status]")).toContainText("试运行完成");
  await page.getByRole("button", { name: "去发布" }).click();

  await page.getByPlaceholder("一句话介绍这门课").fill("E2E 修订 patch");
  await page.getByPlaceholder("餐饮 旅行").fill("e2e 修订");
  await page.locator(".studio-ack input[type=checkbox]").check();
  await page.getByRole("button", { name: "发布（免费）" }).click();
  await expect(page.locator(".studio-done[role=status]")).toContainText("已发布到市场");
});

test("下架保旧：教师侧标记 + 学员市场不再出现", async ({ page }) => {
  // 教师：下架（dialog 确认）
  await openApp(page);
  await switchAccount(page, "teacher");
  await gotoView(page, "创作");

  const dialogPromise = page.waitForEvent("dialog");
  const item = await cafeListItem(page);
  await item.getByRole("button", { name: "下架" }).click();
  const dialog = await dialogPromise;
  await dialog.accept();

  await expectNotice(page, "已下架：市场不再接受新获取，已获取学员保留访问权");
  await expect(page.locator(".studio-dlc-list")).toContainText("已下架");

  // 学员：市场列表不再展示下架课程（query 过滤 delisted；已获取学员的访问不受影响）
  await switchAccount(page, "learner");
  await gotoView(page, "市场");
  await expect(page.locator(".market-list").first()).toBeVisible();
  await expect(page.locator(".market-list")).not.toContainText(CAFE_TITLE);
});
