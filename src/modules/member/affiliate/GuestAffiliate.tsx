import { useEffect, useState } from "react";
import {
  MemberLocaleProvider,
  MemberLanguage,
  useMemberLocale,
} from "./locale";
import { RewardCommunity } from "./Community";
import { amount } from "../../affiliate/money";
import "./affiliate.css";
export function GuestAffiliate({ onLogin }: { onLogin: () => void }) {
  return (
    <MemberLocaleProvider>
      <Guest onLogin={onLogin} />
    </MemberLocaleProvider>
  );
}
function Guest({ onLogin }: { onLogin: () => void }) {
  const { t } = useMemberLocale();
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/affiliate-public")
      .then(async (r) => {
        if (!r.ok) throw Error("代理信息暂不可用");
        const result = await r.json();
        if (active) setData(result.data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="member-portal">
      <header className="member-header">
        <strong>{t("推荐返佣")}</strong>
        <MemberLanguage />
        <button onClick={onLogin}>{t("登录")}</button>
      </header>
      <main className="member-main">
        {error ? (
          <p role="alert">{t(error)}</p>
        ) : !data ? (
          <p>{t("正在读取奖励与等级进度…")}</p>
        ) : !data.visible ? (
          <p>{t("本站尚未发布代理奖励规则，请稍后查看。")}</p>
        ) : (
          <>
            <section className="member-intro">
              <h1>{t("推荐好友计划")}</h1>
              <p>{t("与朋友分享专属链接，完成条件后双方获得奖励。")}</p>
              <button onClick={onLogin}>{t("注册即赚")}</button>
              {data.registration_url && (
                <a href={data.registration_url}>{t("前往会员注册")}</a>
              )}
            </section>
            <div className="member-grid">
              {[
                [
                  "高额佣金比例",
                  amount(String(data.maximum_rate_ppm), 4) + "%",
                ],
                [
                  "推荐奖励",
                  amount(data.maximum_reward_minor, data.currency_scale) +
                    " " +
                    data.currency,
                ],
                [
                  "受邀奖励",
                  amount(data.invitee_reward_minor, data.currency_scale) +
                    " " +
                    data.currency,
                ],
              ].map(([name, value]) => (
                <section className="member-card" key={name}>
                  <h2>{t(name)}</h2>
                  <strong>{value}</strong>
                  <p>{t("建立团队，按站点已发布规则获得奖励。")}</p>
                  <button onClick={onLogin}>{t("奖励规则")}</button>
                </section>
              ))}
            </div>
            <RewardCommunity feed={data.feed} scale={data.currency_scale} />
          </>
        )}
      </main>
    </div>
  );
}
