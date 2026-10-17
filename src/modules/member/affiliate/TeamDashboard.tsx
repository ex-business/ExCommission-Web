import { useEffect, useState } from "react";
import { request, ApiError } from "../../../lib/api";
import { amount } from "../../affiliate/money";
import { useMemberLocale } from "./locale";
export function MemberTeamDashboard({ onExpired }: { onExpired: () => void }) {
  const { t } = useMemberLocale();
  const [view, setView] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const r = await request("/v1/me/affiliate/overview");
        if (active) {
          setView(r.data);
          setError("");
        }
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) onExpired();
        if (!(e instanceof ApiError && e.status === 404))
          setError((e as Error).message);
      }
    }
    void load();
    const timer = setInterval(() => void load(), 600000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  if (error) return <p role="alert">{error}</p>;
  if (!view?.team_stats) return null;
  const stats = view.team_stats,
    c = view.configuration.config;
  return (
    <section className="member-card">
      <h2>{t("团队数据")}</h2>
      <div className="affiliate-dashboard">
        {[
          ["today_referrals", "今日推荐"],
          ["total_referrals", "总推荐人数"],
          ["today_qualified", "今日有效推荐人数"],
          ["total_qualified", "总有效推荐人数"],
          ["today_deposit_minor", "今日新会员存款"],
          ["total_deposit_minor", "总存款"],
          ["total_earned_minor", "累计已领取"],
        ].map(([field, label]) => (
          <article className="member-stat" key={field}>
            <small>{t(label)}</small>
            <strong>
              {field.endsWith("_minor")
                ? amount(stats[field], c.currency_scale) + " " + c.currency
                : stats[field]}
            </strong>
          </article>
        ))}
      </div>
      <p>
        {t(
          "统计三层团队；今日存款仅含今日新注册会员，有效人数按已发布统计周期。",
        )}
      </p>
    </section>
  );
}
