// T-037 集成测试：真实 node:http server + fetch 全链路。
//
// 覆盖（对齐交付模板 §19 测试矩阵的服务端部分）：
//  1. 健康检查与传输层错误（health / 无效 JSON / 未知方法 / 缺身份）
//  2. 组合根种子（账户能力、班级分配授权、市场种子）
//  3. Studio 全流程（text 摄入 → 编辑 → 表单确认 → sandbox → 发布 → 列表）
//  4. OCR 摄入路径（base64 图片 → 确定性解码 → 结构化）
//  5. 服务端重授权（学习者 create_class / publish_dlc 必须被拒）
//  6. 市场（免费获取 / 重复获取 / 已下架不可获取）
//  7. 班级（建班 → 邀请 → 加入 → 重复加入 → 公告 → 详情 → 统计）
//  8. BYOK 明文密钥零泄漏（响应 JSON 不含明文）
//  9. 修订（revision.start 生成可继续编辑的草稿）

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { createHttpApiServer } = require("../dist/server.js");
const { createRpcHandler } = require("../dist/rpc.js");
const { getBackend, resetBackend, ACCOUNTS } = require("../dist/backend.js");

let server;
let baseUrl;

before(async () => {
  const handler = createRpcHandler(getBackend);
  server = createHttpApiServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => {
  server.close();
});

async function rpc(method, params, accountId) {
  const res = await fetch(`${baseUrl}/api/rpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params: params ?? {}, auth: accountId ? { account_id: accountId } : undefined }),
  });
  assert.equal(res.status, 200, "RPC 响应永远 200");
  return res.json();
}

test("health 探活", async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, "llos-api");
});

test("传输层错误：无效 JSON / 未知方法 / 缺身份", async () => {
  const badJson = await fetch(`${baseUrl}/api/rpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not-json",
  });
  const parsed = await badJson.json();
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error.code, "invalid_request");

  const unknown = await rpc("no.such.method", {}, ACCOUNTS.learner);
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error.code, "method_not_found");

  const noAuth = await fetch(`${baseUrl}/api/rpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method: "account.get", params: {} }),
  }).then((r) => r.json());
  assert.equal(noAuth.ok, false);
  assert.equal(noAuth.error.code, "session_expired");
});

test("组合根种子：账户能力与班级分配授权", async () => {
  const backend = await resetBackend();
  const teacher = await rpc("account.get", {}, ACCOUNTS.teacher);
  assert.equal(teacher.result.display_name, "王老师");
  assert.ok(teacher.result.capabilities.includes("create_class"));
  assert.ok(teacher.result.capabilities.includes("publish_dlc"));

  const learner = await rpc("account.get", {}, ACCOUNTS.learner);
  assert.ok(!learner.result.capabilities.includes("create_class"), "学习者不应有 create_class");

  // 学习者通过种子班级分配获得课程授权 → 学习旅程 ready
  const learning = await rpc("journey.learning.load", {}, ACCOUNTS.learner);
  assert.equal(learning.result.status, "ready");
  assert.ok(learning.result.data.session.activities.length >= 1);
  assert.equal(learning.result.data.session.snapshot.item_count, 3);
});

test("Studio 全流程：text 摄入 → 编辑 → 确认 → sandbox → 发布 → 列表", async () => {
  await resetBackend();
  const create = await rpc(
    "studio.draft.create",
    {
      text: ["Szenario: Nach dem Weg fragen | Wie komme ich zum Bahnhof?", "Konstruktion: Höfliche Frage | Könnten Sie mir sagen, …?"].join("\n"),
      language: "de-DE",
      title: "问路（Weg fragen）",
      cefrLevel: "A2",
    },
    ACCOUNTS.teacher,
  );
  assert.equal(create.result.status, "created", JSON.stringify(create.result));
  const draftId = create.result.draft.draft_id;
  assert.equal(create.result.draft.units.length, 2);

  // 编辑（改标题 + 第二单元）
  const edit = await rpc(
    "studio.draft.edit",
    {
      draftId,
      title: "问路（Weg fragen）· 修订",
      units: [
        { frame_type: "scenario", title: "Szenario: Nach dem Weg fragen", pattern: "Wie komme ich zum Bahnhof?" },
        { frame_type: "argument_structure", title: "Konstruktion: Höfliche Frage", pattern: "Könnten Sie mir sagen, …?" },
        { frame_type: "concept", title: "Konzept: der Bahnhof", pattern: "der Bahnhof, -höfe" },
      ],
    },
    ACCOUNTS.teacher,
  );
  assert.equal(edit.result.status, "saved");
  assert.equal(edit.result.draft.units.length, 3);

  // 确认
  const confirm = await rpc("studio.draft.confirm", { draftId }, ACCOUNTS.teacher);
  assert.equal(confirm.result.status, "saved");
  assert.equal(confirm.result.draft.status, "confirmed");

  // sandbox
  const sandbox = await rpc("studio.sandbox.run", { draftId }, ACCOUNTS.teacher);
  assert.equal(sandbox.result.status, "ran", JSON.stringify(sandbox.result));
  assert.ok(sandbox.result.report.steps_completed >= 1);
  assert.equal(sandbox.result.report.real_event_store_used, false, "sandbox 不得写入真实事件存储");

  // 发布
  const publish = await rpc(
    "studio.draft.publish",
    { draftId, summary: "问路与礼貌提问训练", difficulty: "A2", tags: ["场景"], acknowledged_delist_terms: true },
    ACCOUNTS.teacher,
  );
  assert.equal(publish.result.status, "published", JSON.stringify(publish.result));
  assert.equal(publish.result.dlc.price_model, "free");

  // 我的课程列表
  const dlcs = await rpc("studio.dlcs.list", {}, ACCOUNTS.teacher);
  assert.ok(dlcs.result.some((d) => d.dlc_id === publish.result.dlc.dlc_id && !d.delisted));
});

test("OCR 摄入路径：base64 图片 → 确定性解码 → 结构化", async () => {
  await resetBackend();
  const text = "Szenario: Im Hotel einchecken | Ich habe eine Reservierung.\nValenz: zeigen | Zeigen Sie mir bitte das Zimmer.";
  const base64 = Buffer.from(text, "utf-8").toString("base64");
  const create = await rpc(
    "studio.draft.create",
    { image: { media_type: "image/png", base64 }, language: "de-DE", title: "入住酒店", cefrLevel: "A1" },
    ACCOUNTS.teacher,
  );
  assert.equal(create.result.status, "created", JSON.stringify(create.result));
  assert.equal(create.result.draft.units.length, 2);
  assert.ok(create.result.draft.ocr_by, "应记录 OCR 来源");
});

test("服务端重授权：学习者 create_class / publish_dlc 必须被拒", async () => {
  await resetBackend();
  // create_class
  const createClass = await rpc("classes.create", { name: "越权班" }, ACCOUNTS.learner);
  assert.equal(createClass.result.status, "permission_denied");
  assert.equal(createClass.result.required_capability, "create_class");

  // publish_dlc：学习者创建并确认草稿后发布
  const draft = await rpc(
    "studio.draft.create",
    { text: "Szenario: Test | Test", language: "de-DE", title: "T", cefrLevel: "A1" },
    ACCOUNTS.learner,
  );
  assert.equal(draft.result.status, "created");
  await rpc("studio.draft.confirm", { draftId: draft.result.draft.draft_id }, ACCOUNTS.learner);
  const publish = await rpc(
    "studio.draft.publish",
    { draftId: draft.result.draft.draft_id, summary: "s", difficulty: "A1", tags: [], acknowledged_delist_terms: true },
    ACCOUNTS.learner,
  );
  assert.equal(publish.result.status, "permission_denied");
  assert.equal(publish.result.required_capability, "publish_dlc");
});

test("市场：免费获取 / 重复获取 / 已下架", async () => {
  await resetBackend();
  const acquire = await rpc("market.acquire", { listingId: "listing.dlc.reference.fsi" }, ACCOUNTS.learner);
  assert.equal(acquire.result.status, "acquired");

  const again = await rpc("market.acquire", { listingId: "listing.dlc.reference.fsi" }, ACCOUNTS.learner);
  assert.equal(again.result.status, "already_owned");

  // 不存在 listing
  const missing = await rpc("market.acquire", { listingId: "listing.dlc.nope" }, ACCOUNTS.learner);
  assert.equal(missing.result.status, "not_found");

  // 详情：own 状态与评价入口
  const detail = await rpc("market.listing.get", { listingId: "listing.dlc.reference.fsi" }, ACCOUNTS.learner);
  assert.equal(detail.result.owned, true);
  assert.equal(detail.result.can_review, true);
  const review = await rpc("market.review", { listingId: "listing.dlc.reference.fsi", rating: 5, text: "很好" }, ACCOUNTS.learner);
  assert.equal(review.result.status, "submitted");
  // 未获取者不可评价
  const teacherReview = await rpc("market.review", { listingId: "listing.dlc.reference.fsi", rating: 4 }, ACCOUNTS.teacher);
  assert.equal(teacherReview.result.status, "requires_entitlement");
});

test("班级：建班 → 邀请 → 加入 → 重复加入 → 公告 → 详情 → 统计", async () => {
  await resetBackend();
  const created = await rpc("classes.create", { name: "集成测试班", description: "测试班级" }, ACCOUNTS.teacher);
  assert.equal(created.result.status, "created");
  const classId = created.result.class.class_id;

  const invitation = await rpc("classes.invitation.issue", { classId, maxUses: 3 }, ACCOUNTS.teacher);
  assert.ok(invitation.result.code.startsWith("llos-class-"));

  const joined = await rpc("classes.join", { code: invitation.result.code }, ACCOUNTS.learner);
  assert.equal(joined.result.status, "joined");

  const again = await rpc("classes.join", { code: invitation.result.code }, ACCOUNTS.learner);
  assert.equal(again.result.status, "already_member");

  const posted = await rpc("classes.notice.post", { classId, text: "欢迎加入" }, ACCOUNTS.teacher);
  assert.equal(posted.result.status, "posted");
  assert.equal(posted.result.notice.author_name, "王老师");

  const detail = await rpc("classes.detail.get", { classId }, ACCOUNTS.learner);
  assert.equal(detail.result.class_summary.member_count, 2);
  assert.equal(detail.result.notices.length, 1);

  const stats = await rpc("classes.stats.load", { classId }, ACCOUNTS.teacher);
  assert.equal(stats.result.members_total, 2);
  assert.equal(stats.result.completion_rate_overall, null, "无分配时无完成率（§5.5）");

  // 非创建者看统计 → null
  const learnerStats = await rpc("classes.stats.load", { classId }, ACCOUNTS.learner);
  assert.equal(learnerStats.result, null);
});

test("BYOK：明文密钥零泄漏", async () => {
  await resetBackend();
  const secret = "sk-byok-secret-0123456789abcdef";
  const registered = await rpc(
    "byok.register",
    { provider_family: "deepseek", label: "集成测试密钥", api_key: secret },
    ACCOUNTS.teacher,
  );
  assert.equal(registered.result.status, "registered");
  const raw = JSON.stringify(registered.result);
  assert.ok(!raw.includes(secret), "响应 JSON 不得包含明文密钥");
  assert.ok(registered.result.entry.masked_key.includes("…"), "应返回掩码");

  const list = await rpc("byok.list", {}, ACCOUNTS.teacher);
  assert.equal(list.result.length, 1);
  assert.ok(!JSON.stringify(list.result).includes(secret));

  // 无效家族 → invalid_key
  const bad = await rpc("byok.register", { provider_family: "not-a-family", label: "x", api_key: "sk-x" }, ACCOUNTS.teacher);
  assert.equal(bad.result.status, "invalid_key");
});

test("修订：revision.start 生成可继续编辑的草稿", async () => {
  await resetBackend();
  const backend = await getBackend();
  const rev = await rpc("studio.revision.start", { dlcId: backend.seed.publishedDlcId }, ACCOUNTS.teacher);
  assert.equal(rev.result.status, "created");
  assert.equal(rev.result.draft.status, "structured", "修订草稿从已结构化内容开始");
  assert.equal(rev.result.draft.units.length, 3);

  const edit = await rpc("studio.draft.edit", { draftId: rev.result.draft.draft_id, title: "修订版" }, ACCOUNTS.teacher);
  assert.equal(edit.result.status, "saved");
  assert.equal(edit.result.draft.title, "修订版");
});
