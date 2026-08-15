const { test } = require("node:test");
const assert = require("node:assert");
const { MockApiClient } = require("../dist/index.js");

const LOADERS = {
  chat: (c) => c.loadChatSession(),
  learning: (c) => c.loadLearningSession(),
  teacher: (c) => c.loadTeacherDashboard(),
  workbench: (c) => c.loadWorkbench(),
};

// 七态：每个旅程都要能进入（UI-2 验收：正常/空白/加载/权限不足/离线/可恢复/不可恢复）。
const SCENARIOS = [
  "normal",
  "empty",
  "loading",
  "permission_denied",
  "offline",
  "error_recoverable",
  "error_unrecoverable",
];

test("normal scenario: all four journeys resolve ready with data (teacher account)", async () => {
  const client = new MockApiClient({ account: "teacher" });
  for (const journey of Object.keys(LOADERS)) {
    const state = await LOADERS[journey](client);
    assert.equal(state.status, "ready", `${journey} should be ready`);
    assert.ok(state.data, `${journey} should carry data`);
  }
});

test("scenario drives state: loading / empty / offline / both error kinds", async () => {
  const expectStatus = {
    loading: "loading",
    empty: "empty",
    offline: "offline",
    error_recoverable: "error_recoverable",
    error_unrecoverable: "error_unrecoverable",
  };
  for (const [scenario, status] of Object.entries(expectStatus)) {
    const client = new MockApiClient({ account: "teacher", scenarios: { chat: scenario } });
    const state = await client.loadChatSession();
    assert.equal(state.status, status, `scenario ${scenario} -> ${status}`);
  }
});

test("every journey supports every one of the 7 scenarios", async () => {
  for (const journey of Object.keys(LOADERS)) {
    for (const scenario of SCENARIOS) {
      const client = new MockApiClient({ account: "teacher", scenarios: { [journey]: scenario } });
      const state = await LOADERS[journey](client);
      assert.ok(state.status, `${journey}/${scenario} returned a state`);
    }
  }
});

test("recoverable and unrecoverable failures are distinct states", async () => {
  const rec = new MockApiClient({ scenarios: { chat: "error_recoverable" } });
  const unrec = new MockApiClient({ scenarios: { chat: "error_unrecoverable" } });
  const a = await rec.loadChatSession();
  const b = await unrec.loadChatSession();
  assert.equal(a.status, "error_recoverable");
  assert.equal(b.status, "error_unrecoverable");
  assert.notEqual(a.status, b.status);
  assert.ok(a.error.code);
});

test("permission gate: learner account denied teacher dashboard (§2 server re-auth)", async () => {
  const learner = new MockApiClient({ account: "learner" });
  const state = await learner.loadTeacherDashboard();
  assert.equal(state.status, "permission_denied");
  assert.equal(state.required_capability, "create_class");
});

test("teacher account passes the create_class gate", async () => {
  const teacher = new MockApiClient({ account: "teacher" });
  const state = await teacher.loadTeacherDashboard();
  assert.equal(state.status, "ready");
  assert.ok(Array.isArray(state.data.classes));
});

test("forced permission_denied scenario works even for capable account", async () => {
  const teacher = new MockApiClient({ account: "teacher", scenarios: { workbench: "permission_denied" } });
  const state = await teacher.loadWorkbench();
  assert.equal(state.status, "permission_denied");
});

test("offline: learning keeps cached snapshot, chat has none (§9)", async () => {
  const client = new MockApiClient({ scenarios: { learning: "offline", chat: "offline" } });
  const learning = await client.loadLearningSession();
  const chat = await client.loadChatSession();
  assert.equal(learning.status, "offline");
  assert.ok(learning.cached, "offline_allowed snapshot should be cached for learning");
  assert.equal(chat.status, "offline");
  assert.equal(chat.cached, null, "online-provider chat must not be usable offline");
});

test("ChatSession never carries learning progress (§6)", async () => {
  const client = new MockApiClient();
  const state = await client.loadChatSession();
  assert.equal(state.status, "ready");
  assert.equal(state.data.session.mode, "chat");
  assert.equal(state.data.session.learning_state, undefined);
  assert.equal(state.data.session.snapshot, undefined);
  assert.equal(state.data.session.activities, undefined);
});

test("LearningSession carries snapshot + activities + learning_state (three-layer ready)", async () => {
  const client = new MockApiClient();
  const state = await client.loadLearningSession();
  assert.equal(state.status, "ready");
  assert.equal(state.data.session.mode, "learning");
  assert.ok(state.data.session.snapshot);
  assert.ok(state.data.session.activities.length >= 3);
  assert.ok(state.data.session.learning_state.length >= 1);
  // 状态可撤销、版本化，永不显示“永久学会”：provisional 是合法值，"learned-forever" 不是。
  assert.ok(["not_yet", "provisional", "learned", "uncertain", "lapsed"].includes(state.data.session.learning_state[0].status));
});

test("evaluator abstain path is representable (不变量 7 / §7)", async () => {
  const client = new MockApiClient();
  const state = await client.loadLearningSession();
  assert.equal(state.data.feedback.verdict, "abstained");
});

test("workbench view exposes capability-gated sections", async () => {
  const client = new MockApiClient({ account: "learner" });
  const state = await client.loadWorkbench();
  assert.equal(state.status, "ready");
  const gated = state.data.sections.filter((s) => s.required_capability);
  assert.ok(gated.length >= 3, "desktop-only sections must declare required capability");
  assert.ok(gated.every((s) => ["create_class", "publish_dlc", "manage_users"].includes(s.required_capability)));
});
