import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { ApiClient, MarketListingDetail } from "@llos/api-client";
import { PRICE_LABEL } from "./MarketJourney";

interface Notice {
  kind: "ok" | "warn" | "danger";
  text: string;
}

interface MarketDetailProps {
  client: ApiClient;
  dlcId: string;
  onBack: () => void;
  onStartTraining: () => void;
}

/**
 * DLC 详情页：摘要/评分/下载量/发布者 + 获取流程 + 训练入口 + 评价。
 * 评价门禁（product_spec §4.3）：显隐只是体验层，Mock 层按服务端语义
 * 返回 requires_entitlement——隐藏表单不是安全控制（§2）。
 */
export function MarketDetail({ client, dlcId, onBack, onStartTraining }: MarketDetailProps) {
  const [detail, setDetail] = useState<MarketListingDetail | null | "loading">("loading");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");

  const load = useCallback(() => {
    void client.getMarketListing(dlcId).then((d) => setDetail(d));
  }, [client, dlcId]);

  useEffect(load, [load]);

  useEffect(() => {
    if (detail !== "loading" && detail?.my_review) {
      setRating(detail.my_review.rating);
      setReviewText(detail.my_review.text ?? "");
    }
  }, [detail]);

  async function acquire() {
    const outcome = await client.acquireListing(dlcId);
    switch (outcome.status) {
      case "acquired":
        setNotice({ kind: "ok", text: "获取成功，现在可以开始训练了。" });
        load();
        break;
      case "already_owned":
        setNotice({ kind: "ok", text: "你已获得该内容，无需重复获取。" });
        break;
      case "payment_not_available":
        setNotice({
          kind: "warn",
          text: `付费获取（${PRICE_LABEL[outcome.price_model]}）将在支付阶段（P8）上线，当前仅支持免费内容。`,
        });
        break;
      case "not_found":
        setNotice({ kind: "danger", text: "内容不存在或已下架。" });
        break;
    }
  }

  async function submitReview(e: FormEvent) {
    e.preventDefault();
    const outcome = await client.submitReview(dlcId, rating, reviewText);
    switch (outcome.status) {
      case "submitted":
        setNotice({ kind: "ok", text: `评价已提交（${outcome.rating} 星），可覆盖更新。` });
        setReviewText("");
        load();
        break;
      case "requires_entitlement":
        setNotice({ kind: "warn", text: outcome.message });
        break;
      case "invalid_rating":
        setNotice({ kind: "danger", text: outcome.message });
        break;
      case "not_found":
        setNotice({ kind: "danger", text: "内容不存在或已下架。" });
        break;
    }
  }

  if (detail === "loading") {
    return (
      <div className="state--loading" role="status">
        <span className="spinner" aria-hidden="true" />
        正在加载详情…
      </div>
    );
  }

  if (detail === null) {
    return (
      <div className="state-panel state-panel--danger">
        <p className="state-title">内容不存在或已下架</p>
        <button type="button" className="btn" onClick={onBack}>
          返回市场
        </button>
      </div>
    );
  }

  return (
    <div className="journey">
      <button type="button" className="btn-secondary market-back" onClick={onBack}>
        ← 返回市场
      </button>

      <article className="market-detail">
        <header className="journey-head">
          <span className="mode-badge mode-badge--learning">{detail.language.toUpperCase()} · {detail.difficulty}</span>
          <h2 className="journey-title">{detail.title}</h2>
          {detail.owned ? <span className="market-owned-badge">已获得</span> : null}
        </header>

        <p className="market-summary">{detail.summary}</p>

        <dl className="market-facts">
          <div>
            <dt>发布者</dt>
            <dd>{detail.publisher_name}</dd>
          </div>
          <div>
            <dt>计费</dt>
            <dd>{PRICE_LABEL[detail.price_model]}</dd>
          </div>
          <div>
            <dt>评分</dt>
            <dd>
              {detail.rating_average === null ? "暂无评分" : `${detail.rating_average} / 5`}
              {detail.rating_count > 0 ? `（${detail.rating_count} 条）` : ""}
            </dd>
          </div>
          <div>
            <dt>获取次数</dt>
            <dd>{detail.downloads}</dd>
          </div>
        </dl>

        {detail.tags.length > 0 ? (
          <ul className="market-tags" aria-label="标签">
            {detail.tags.map((tag) => (
              <li key={tag} className="tag-chip">
                {tag}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="market-actions">
          {detail.owned ? (
            <button type="button" className="btn" onClick={onStartTraining}>
              开始训练
            </button>
          ) : detail.price_model === "free" ? (
            <button type="button" className="btn" onClick={() => void acquire()}>
              免费获取
            </button>
          ) : (
            <button type="button" className="btn" onClick={() => void acquire()}>
              {PRICE_LABEL[detail.price_model]}获取
            </button>
          )}
        </div>

        <div aria-live="polite">
          {notice ? <p className={`notice notice--${notice.kind}`}>{notice.text}</p> : null}
        </div>

        <section className="review-block">
          <h3 className="review-title">我的评价</h3>
          {detail.can_review ? (
            <form className="review-form" onSubmit={(e) => void submitReview(e)}>
              <label className="control">
                评分
                <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} 星
                    </option>
                  ))}
                </select>
              </label>
              <label className="control review-text">
                评语（可选）
                <textarea
                  rows={3}
                  value={reviewText}
                  placeholder="训练体验、内容质量…"
                  onChange={(e) => setReviewText(e.target.value)}
                />
              </label>
              <button type="submit" className="btn">
                {detail.my_review ? "更新评价" : "提交评价"}
              </button>
            </form>
          ) : (
            <p className="hint">获取该内容后即可评价（product_spec §4.3；服务端重新授权）。</p>
          )}
        </section>
      </article>
    </div>
  );
}
