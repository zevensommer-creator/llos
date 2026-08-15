import { useEffect, useState } from "react";
import type { ApiClient, MarketEntry, MarketQuery } from "@llos/api-client";
import { MarketDetail } from "./MarketDetail";

export const PRICE_LABEL: Record<MarketEntry["price_model"], string> = {
  free: "免费",
  one_time: "买断",
  subscription: "订阅",
};

const LANGUAGE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "", label: "全部语言" },
  { value: "de", label: "德语" },
  { value: "fr", label: "法语" },
];

const DIFFICULTY_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "", label: "全部难度" },
  { value: "A1", label: "A1" },
  { value: "B1", label: "B1" },
];

const SORT_OPTIONS: readonly { value: NonNullable<MarketQuery["sort"]>; label: string }[] = [
  { value: "newest", label: "最新" },
  { value: "rating_desc", label: "评分最高" },
  { value: "downloads_desc", label: "下载最多" },
];

interface MarketJourneyProps {
  client: ApiClient;
  /** 已获取内容的训练入口：跳转学习旅程（LearningSession）。 */
  onStartTraining: () => void;
}

/**
 * desktop_web 市场页（CLIENT_SURFACE_SPEC §3：浏览/搜索筛选/详情/已获得内容）。
 * 数据只经 @llos/api-client（页面禁止散落 fetch，VIEW_MODELS §4）。
 */
export function MarketJourney({ client, onStartTraining }: MarketJourneyProps) {
  const [language, setLanguage] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<NonNullable<MarketQuery["sort"]>>("newest");
  const [entries, setEntries] = useState<readonly MarketEntry[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [listVersion, setListVersion] = useState(0);

  useEffect(() => {
    let live = true;
    void client
      .queryMarket({
        language: language || undefined,
        difficulty: difficulty || undefined,
        search: search || undefined,
        sort,
      })
      .then((result) => {
        if (live) setEntries(result);
      });
    return () => {
      live = false;
    };
  }, [client, language, difficulty, search, sort, listVersion]);

  if (selected) {
    return (
      <MarketDetail
        client={client}
        dlcId={selected}
        onBack={() => {
          setSelected(null);
          setListVersion((v) => v + 1);
        }}
        onStartTraining={onStartTraining}
      />
    );
  }

  return (
    <div className="journey">
      <header className="journey-head">
        <span className="mode-badge mode-badge--chat">市场</span>
        <h2 className="journey-title">DLC 市场</h2>
      </header>
      <p className="journey-note">
        浏览、筛选并获取学习内容；免费获取立即生效，付费获取等待 P8。获取操作由服务端重新授权。
      </p>

      <div className="market-filters" role="search" aria-label="市场筛选">
        <label className="control">
          语言
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="control">
          难度
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            {DIFFICULTY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="control">
          排序
          <select value={sort} onChange={(e) => setSort(e.target.value as NonNullable<MarketQuery["sort"]>)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="control market-search">
          搜索
          <input
            type="search"
            value={search}
            placeholder="标题或标签"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      {entries === null ? (
        <div className="state--loading" role="status">
          <span className="spinner" aria-hidden="true" />
          正在加载市场…
        </div>
      ) : entries.length === 0 ? (
        <div className="state-panel">
          <p className="state-title">没有符合条件的内容</p>
          <p className="state-body">试试调整筛选条件或清空搜索词（空白态）。</p>
        </div>
      ) : (
        <ul className="market-grid">
          {entries.map((entry) => (
            <li key={entry.dlc_id}>
              <button
                type="button"
                className="market-card"
                onClick={() => setSelected(entry.dlc_id)}
                aria-label={`查看详情：${entry.title}`}
              >
                <span className="market-card-title">{entry.title}</span>
                <span className="market-card-meta">
                  {entry.language.toUpperCase()} · {entry.difficulty} · {PRICE_LABEL[entry.price_model]}
                </span>
                {entry.owned ? <span className="market-owned-badge">已获得</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
