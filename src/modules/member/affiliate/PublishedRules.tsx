import { CommissionRuleSummary } from "../../affiliate/CommissionRuleSummary";
import { useState } from "react";
import { toMinor } from "../../affiliate/money";
import { useMemberLocale } from "./locale";
import { amount } from "../../affiliate/money";
type Row = Record<string, any>;
export function PublishedRules({ presentation }: { presentation: Row }) {
  const { t } = useMemberLocale();
  const [turnover, setTurnover] = useState("70000"),
    [customRate, setCustomRate] = useState<string | null>(null);
  const version = presentation.configuration;
  if (!version) return <p>{t("本站尚未发布代理奖励规则，请稍后查看。")}</p>;
  const c = version.config;
  const maximumRate = Math.max(
    0,
    ...c.levels.flatMap((level: Row) => level.rates_ppm),
  );
  const rate = customRate ?? amount(String(maximumRate), 4);
  let estimate = "";
  try {
    // 原型简易计算器允许自填比例；仅本地试算，不修改已发布规则或实际奖励。
    const minor = BigInt(
      /^0(?:\.0+)?$/.test(turnover) ? "0" : toMinor(turnover, c.currency_scale),
    );
    const ppm = BigInt(/^0(?:\.0+)?$/.test(rate) ? "0" : toMinor(rate, 4));
    if (minor < 0n || ppm < 0n || ppm > 1000000n) throw new Error();
    estimate = amount(((minor * ppm) / 1000000n).toString(), c.currency_scale);
  } catch {}
  const money = (v: string) => `${amount(v, c.currency_scale)} ${c.currency}`;
  const periods: Row = {
    DAY: t("自然日"),
    WEEK: t("自然周"),
    MONTH: t("自然月"),
    LIFETIME: t("永久"),
  };
  return (
    <section className="member-card" aria-label={t("已发布代理规则")}>
      <h2>{t("代理规则")}</h2>
      <p>
        {t("配置版本")} {version.revision} · {periods[c.grade_period]} ·{" "}
        {c.timezone}
      </p>
      <p>
        {t("同时满足充值与有效投注；等级人数只统计直属，日投注统计下线三层。")}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("达标类型")}</th>
              <th>{t("累计成功充值")}</th>
              <th>{t("累计有效业务量")}</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["代理等级", c.grade_condition],
              ["推荐奖励", c.referral_condition],
              ["受邀奖励", c.invitee_condition],
            ].map(([name, condition]: any) => (
              <tr key={name}>
                <td>{t(name)}</td>
                <td>{money(condition.deposit_minor)}</td>
                <td>{money(condition.valid_bet_minor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>
        {t(c.commission_policy ? "等级与返佣规则" : "等级与三层返佣比例")}
      </h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("等级")}</th>
              <th>{t("有效直属")}</th>
              <th>{t("日有效业务量")}</th>
              <th>
                {t(c.commission_policy ? "返佣规则" : "一级 / 二级 / 三级")}
              </th>
            </tr>
          </thead>
          <tbody>
            {c.levels.map((l: Row) => (
              <tr key={l.level}>
                <td>Lv{l.level}</td>
                <td>{l.qualified_members}</td>
                <td>{money(l.daily_valid_bet_minor)}</td>
                <td>
                  {c.commission_policy ? (
                    <CommissionRuleSummary
                      policy={c.commission_policy}
                      level={l.level}
                      scale={c.currency_scale}
                      currency={c.currency}
                    />
                  ) : (
                    l.rates_ppm
                      .map((r: number) => amount(String(r), 4) + "%")
                      .join(" / ")
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>{t("推荐阶梯")}</h3>
      {c.steps.map((s: Row) => (
        <p key={s.step}>
          {t("第{step}档，再推荐{members}人，奖励{reward}", {
            step: s.step,
            members: s.additional_members,
            reward: money(s.reward_minor),
          })}
        </p>
      ))}
      <p>
        {t("受邀本人一次性奖励：{reward}", {
          reward: money(c.invitee_reward_minor),
        })}
      </p>
      <p>
        {t(
          "奖励无需流水，领取至真金钱包；佣金按当天最终等级结算，次日01:00进入审核。",
        )}
      </p>
      <h3>{t("佣金计算器")}</h3>
      <p>
        {t("自定义比例仅用于本地试算，实际佣金以已发布规则和审核结果为准。")}
      </p>
      <label>
        {t("有效投注")} ({c.currency})
        <input
          aria-label={t("试算有效投注")}
          inputMode="decimal"
          value={turnover}
          onChange={(e) => setTurnover(e.target.value)}
        />
      </label>
      <label>
        {t("佣金比例")} (%)
        <input
          aria-label={t("试算佣金比例")}
          inputMode="decimal"
          value={rate}
          onChange={(e) => setCustomRate(e.target.value)}
        />
      </label>
      <p role="status">
        {estimate ? `= ${estimate} ${c.currency}` : t("请输入有效金额")}
      </p>
      <h3>{t("参与游戏场馆类型")}</h3>
      <div className="member-grid">
        {presentation.venues
          .filter((v: Row) => c.venue_type_ids.includes(v.venue_type_id))
          .map((v: Row) => (
            <div key={v.venue_type_id}>
              {v.icon_url && (
                <img src={v.icon_url} alt={t(v.name)} width={40} height={40} />
              )}
              <span>{t(v.name)}</span>
            </div>
          ))}
      </div>
    </section>
  );
}
