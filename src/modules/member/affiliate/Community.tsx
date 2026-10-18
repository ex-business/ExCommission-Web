import { useEffect, useState } from "react";
import { amount, currencyScale } from "../../affiliate/money";
import { useMemberLocale } from "./locale";
type Row = Record<string, any>;
export function RewardCommunity({
  feed,
  scale,
}: {
  feed?: Row;
  scale: number;
}) {
  const { t } = useMemberLocale();
  const [offset, setOffset] = useState(0);
  const [currentFeed, setCurrentFeed] = useState(feed);
  const rows = currentFeed?.rows || [];
  useEffect(() => setCurrentFeed(feed), [feed]);
  useEffect(() => {
    let active = true;
    // 轮播只读取公开奖励投影；网络失败保留最近成功数据，不伪造奖励或重复请求。
    const timer = setInterval(() => {
      void fetch("/affiliate-public")
        .then(async (response) => {
          if (!response.ok) return;
          const value = await response.json();
          if (active && value.data?.visible) setCurrentFeed(value.data.feed);
        })
        .catch(() => {});
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(
      () => setOffset((n) => (rows.length ? (n + 1) % rows.length : 0)),
      4000,
    );
    return () => clearInterval(timer);
  }, [rows.length]);
  return (
    <section className="member-card">
      <h2>{t("实时发放奖励")}</h2>
      <p>
        {t("总发放奖励")}{" "}
        {Object.entries(currentFeed?.totals || {}).map(([currency, value]) => (
          <strong key={currency}>
            {amount(String(value), currencyScale(currency, scale))}{" "}
            {currency}{" "}
          </strong>
        ))}
      </p>
      <div className="reward-carousel">
        {rows.length ? (
          Array.from(
            { length: Math.min(6, rows.length) },
            (_, i) => rows[(offset + i) % rows.length],
          ).map((r: Row, i: number) => (
            <article key={i}>
              <img
                className="affiliate-avatar"
                src={r.avatar_url || "/affiliate-assets/avatar.svg"}
                alt={t("会员头像")}
                width={32}
                height={32}
              />
              {r.member} ·{" "}
              {t(
                r.kind === "INVITEE"
                  ? "受邀奖励"
                  : r.kind === "REFERRAL"
                    ? "推荐奖励"
                    : "每日佣金",
              )}{" "}
              · {amount(r.amount_minor, currencyScale(r.currency, scale))}{" "}
              {r.currency}
            </article>
          ))
        ) : (
          <p>{t("暂无已领取奖励")}</p>
        )}
      </div>
      <h3>{t("常见问题")}</h3>
      {[
        ["参与需要多少费用？", "参与代理计划无需支付费用。"],
        ["能赚多少钱？", "收益由达标人数、有效投注及已发布奖励规则决定。"],
        [
          "如何获得奖励？",
          "分享专属链接，好友注册并完成充值和投注条件后解锁奖励。",
        ],
      ].map(([q, a]) => (
        <details key={q}>
          <summary>{t(q)}</summary>
          <p>{t(a)}</p>
        </details>
      ))}
    </section>
  );
}
export function SocialShare({
  social,
  url,
  text,
  onNotice,
}: {
  social?: Row[];
  url: string;
  text: string;
  onNotice: (s: string) => void;
}) {
  const { t } = useMemberLocale();
  const names: Row = {
    FACEBOOK: "Facebook",
    TELEGRAM: "Telegram",
    WHATSAPP: "WhatsApp",
    TIKTOK: "TikTok",
    MORE: t("更多"),
  };
  async function share(platform: string) {
    try {
      const content = text + " " + url;
      const links: Row = {
        FACEBOOK:
          "https://www.facebook.com/sharer/sharer.php?u=" +
          encodeURIComponent(url) +
          "&quote=" +
          encodeURIComponent(text),
        TELEGRAM:
          "https://t.me/share/url?url=" +
          encodeURIComponent(url) +
          "&text=" +
          encodeURIComponent(text),
        WHATSAPP:
          "https://api.whatsapp.com/send?text=" + encodeURIComponent(content),
      };
      if (links[platform]) {
        window.open(links[platform], "_blank", "noopener,noreferrer");
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: t("邀请加入我的团队"), text, url });
      } else {
        await navigator.clipboard.writeText(content);
        onNotice(t("分享文案和链接已复制，请粘贴到社媒发布页。"));
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        onNotice(t("分享未完成，请复制邀请链接。"));
    }
  }
  return (
    <div className="member-share-actions">
      {(social || [])
        .filter((s) => s.enabled)
        .map((s) => (
          <button key={s.platform} onClick={() => void share(s.platform)}>
            <span
              className={"social-icon social-" + s.platform}
              aria-hidden="true"
            >
              {
                (
                  {
                    FACEBOOK: "f",
                    TELEGRAM: "➤",
                    WHATSAPP: "◉",
                    TIKTOK: "♪",
                    MORE: "…",
                  } as Row
                )[s.platform]
              }
            </span>
            {names[s.platform]}
          </button>
        ))}
    </div>
  );
}
