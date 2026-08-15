const { test } = require("node:test");
const assert = require("node:assert");
const {
  MockApiClient,
  resetMockMarket,
  resetMockStudio,
} = require("../dist/index.js");

const CAFE_TEXT = [
  "Szenario: Im Café bestellen | Ich hätte gern einen Kaffee, bitte.",
  "Valenz: empfehlen | Der Kellner empfiehlt uns den Kuchen. | empfehlen",
  "Konstruktion: Höfliche Bitte | Könnten Sie bitte das Wasser bringen?",
].join("\n");

function setup(account = "teacher") {
  resetMockStudio();
  resetMockMarket();
  return new MockApiClient({ account });
}

async function createCafeDraft(client) {
  const outcome = await client.createStudioDraft({
    text: CAFE_TEXT,
    title: "Café Deutsch",
    language: "de-DE",
    cefrLevel: "A2",
  });
  assert.equal(outcome.status, "created");
  return outcome.draft;
}

test("byok keys are listed masked only; plaintext never leaves the store", async () => {
  const teacher = setup();
  const keys = await teacher.listByokKeys();
  assert.equal(keys.length, 1);
  assert.match(keys[0].masked_key, /^sk-…[0-9a-z]{4}$/);
  assert.ok(!keys[0].masked_key.includes("0123456789abcdef"));

  const registered = await teacher.registerByokKey("openai", "教室备用", "sk-classroom-abcdefghijklmnop");
  assert.equal(registered.status, "registered");
  assert.equal(registered.entry.masked_key, "sk-…mnop");

  const tooShort = await teacher.registerByokKey("openai", "x", "short");
  assert.equal(tooShort.status, "invalid_key");

  // 账户隔离：学习者看不到教师的密钥。
  const learner = new MockApiClient({ account: "learner" });
  const learnerKeys = await learner.listByokKeys();
  assert.equal(learnerKeys.length, 0);
});

test("drafting is open to every account; publishing gates on publish_dlc", async () => {
  const learner = setup("learner");
  // create_dlc_draft 是基础能力（与 core identity BASE_CAPABILITIES 一致）：人人可创作。
  const draft = await createCafeDraft(learner);
  assert.equal(draft.status, "structured");
  await learner.confirmStudioDraft(draft.draft_id, {});
  // 发布必须 publish_dlc（verified 创作者；服务端重新授权）。
  const outcome = await learner.publishStudioDraft(draft.draft_id, {
    summary: "学生私课",
    difficulty: "A1",
    tags: [],
    acknowledged_delist_terms: true,
  });
  assert.equal(outcome.status, "permission_denied");
  assert.equal(outcome.required_capability, "publish_dlc");
});

test("empty and unrecognizable input produce typed ingest outcomes", async () => {
  const teacher = setup();
  const empty = await teacher.createStudioDraft({ text: "   ", title: "空", language: "de-DE", cefrLevel: "A1" });
  assert.equal(empty.status, "ingest_empty");

  const garbage = await teacher.createStudioDraft({
    text: "没有任何格式的一行字",
    title: "乱",
    language: "de-DE",
    cefrLevel: "A1",
  });
  assert.equal(garbage.status, "structure_invalid");
});

test("create → edit → confirm: units renumber and teaching-language errors", async () => {
  const teacher = setup();
  const draft = await createCafeDraft(teacher);
  assert.equal(draft.status, "structured");
  assert.equal(draft.units.length, 3);
  assert.equal(draft.units[0].frame_type, "scenario");
  assert.equal(draft.units[1].frame_type, "argument_structure");
  assert.equal(draft.units[1].lemma, "empfehlen");

  const edited = await teacher.editStudioDraft(draft.draft_id, {
    units: [
      ...draft.units.slice(0, 2).map((u) => ({ ...u })),
      { frame_type: "concept", title: "Höfliche Bitte", pattern: "Könnten Sie …?" },
    ],
  });
  assert.equal(edited.status, "saved");
  assert.equal(edited.draft.units.length, 3);
  assert.equal(edited.draft.units[2].unit_no, 3);

  const missing = await teacher.confirmStudioDraft(draft.draft_id, {
    units: [{ frame_type: "concept", title: "  ", pattern: "x" }],
  });
  assert.equal(missing.status, "confirm_failed");
  assert.match(missing.message, /第 1 课还没有标题/);
});

test("sandbox trial report never touches the real event store", async () => {
  const teacher = setup();
  const draft = await createCafeDraft(teacher);
  const outcome = await teacher.runSandboxTrial(draft.draft_id);
  assert.equal(outcome.status, "ran");
  assert.equal(outcome.report.status, "completed");
  assert.ok(outcome.report.steps_completed > 0);
  assert.ok(outcome.report.events_appended > 0);
  assert.equal(outcome.report.real_event_store_used, false);
});

test("publish gates: state, delist acknowledgement, then market visibility", async () => {
  const teacher = setup();
  const draft = await createCafeDraft(teacher);

  const notConfirmed = await teacher.publishStudioDraft(draft.draft_id, {
    summary: "咖啡馆德语速成",
    difficulty: "A2",
    tags: ["餐饮"],
    acknowledged_delist_terms: true,
  });
  assert.equal(notConfirmed.status, "state_invalid");

  await teacher.confirmStudioDraft(draft.draft_id, {});
  const noAck = await teacher.publishStudioDraft(draft.draft_id, {
    summary: "咖啡馆德语速成",
    difficulty: "A2",
    tags: ["餐饮"],
    acknowledged_delist_terms: false,
  });
  assert.equal(noAck.status, "acknowledgement_required");
  assert.match(noAck.message, /长期授权/);

  const published = await teacher.publishStudioDraft(draft.draft_id, {
    summary: "咖啡馆德语速成",
    difficulty: "A2",
    tags: ["餐饮"],
    acknowledged_delist_terms: true,
  });
  assert.equal(published.status, "published");
  const { dlc } = published;

  // 版本对创作者隐形：视图不含任何 version 字段。
  assert.ok(!("version" in dlc));

  // 发布联动市场：学员立即可见、可获取。
  const learner = new MockApiClient({ account: "learner" });
  const market = await learner.queryMarket({ search: "Café" });
  assert.equal(market.length, 1);
  assert.equal(market[0].dlc_id, dlc.dlc_id);
  const acquired = await learner.acquireListing(dlc.dlc_id);
  assert.equal(acquired.status, "acquired");
  const again = await learner.acquireListing(dlc.dlc_id);
  assert.equal(again.status, "already_owned");

  const mine = await teacher.listStudioDlcs();
  assert.equal(mine.length, 1);
  assert.equal(mine[0].dlc_id, dlc.dlc_id);
});

test("delist hides from catalog but keeps existing learners' access (§6.9)", async () => {
  const teacher = setup();
  const draft = await createCafeDraft(teacher);
  await teacher.confirmStudioDraft(draft.draft_id, {});
  const { dlc } = await teacher.publishStudioDraft(draft.draft_id, {
    summary: "咖啡馆德语速成",
    difficulty: "A2",
    tags: [],
    acknowledged_delist_terms: true,
  });

  const learnerA = new MockApiClient({ account: "learner" });
  assert.equal((await learnerA.acquireListing(dlc.dlc_id)).status, "acquired");

  const delisted = await teacher.delistStudioDlc(dlc.dlc_id);
  assert.equal(delisted.status, "delisted");

  const learnerB = new MockApiClient({ account: "teacher" });
  const hidden = await learnerB.queryMarket({ search: "Café" });
  assert.equal(hidden.length, 0);
  assert.equal(await learnerB.getMarketListing(dlc.dlc_id), null);
  assert.equal((await learnerB.acquireListing(dlc.dlc_id)).status, "not_found");

  // 已获取学员：幂等保留。
  assert.equal((await learnerA.acquireListing(dlc.dlc_id)).status, "already_owned");
  const mine = await teacher.listStudioDlcs();
  assert.equal(mine[0].delisted, true);
});

test("published draft is immutable; revision starts from published baseline", async () => {
  const teacher = setup();
  const draft = await createCafeDraft(teacher);
  await teacher.confirmStudioDraft(draft.draft_id, {});
  const { dlc } = await teacher.publishStudioDraft(draft.draft_id, {
    summary: "咖啡馆德语速成",
    difficulty: "A2",
    tags: [],
    acknowledged_delist_terms: true,
  });

  const edit = await teacher.editStudioDraft(draft.draft_id, { title: "改名" });
  assert.equal(edit.status, "state_invalid");
  const discard = await teacher.discardStudioDraft(draft.draft_id);
  assert.equal(discard.status, "state_invalid");

  const revision = await teacher.startRevision(dlc.dlc_id);
  assert.equal(revision.status, "created");
  assert.equal(revision.draft.status, "structured");
  assert.equal(revision.draft.units.length, 3, "revision copies the published units as baseline");
});

test("drafts are isolated per creator", async () => {
  const teacher = setup();
  const draft = await createCafeDraft(teacher);
  const learner = new MockApiClient({ account: "learner" });
  assert.equal(await learner.getStudioDraft(draft.draft_id), null);
  assert.equal((await learner.editStudioDraft(draft.draft_id, {})).status, "not_found");
});
