import { ProgramRewards } from "./ProgramRewards";
import { CommissionRuleSummary } from "../../affiliate/CommissionRuleSummary";
import { RewardHistory } from "./RewardHistory";
import { useMemberLocale } from "./locale";
import { CommissionCalculator } from "./CommissionCalculator";
import { useEffect, useRef, useState } from "react";
import { request, ApiError } from "../../../lib/api";
import type { Session } from "../../../auth/Login";
import "./affiliate.css";
import {
  amount,
  rewardScale,
  progressPercent as ratio,
} from "../../affiliate/money";
export { amount } from "../../affiliate/money";
type Row = Record<string, any>;
const names: Record<string, string> = {
  REFERRAL: "推荐奖励",
  INVITEE: "受邀奖励",
  COMMISSION: "每日佣金",
  ALL: "推荐与佣金",
};
const states: Record<string, string> = {
  CLAIMABLE: "待领取",
  CLAIMED: "已领取",
  PENDING_REVIEW: "待审核",
  CANCELLED: "已取消",
};
function Gauge({
  title,
  current,
  target,
  scale,
  currency,
}: {
  title: string;
  current: string;
  target: string;
  scale: number;
  currency: string;
}) {
  return (
    <div className="affiliate-gauge">
      <div>
        <span>{title}</span>
        <strong>
          {amount(current, scale)} / {amount(target, scale)} {currency}
        </strong>
      </div>
      <progress max={100} value={ratio(current, target)} />
    </div>
  );
}
export function AffiliateRewards({
  session,
  enabled,
  onExpired,
  fallback,
}: {
  session: Session;
  enabled: boolean;
  onExpired: () => void;
  fallback: React.ReactNode;
}) {
  const { t, locale } = useMemberLocale();
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [view, setView] = useState<Row | null>(null),
    [legacy, setLegacy] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [detail, setDetail] = useState<Row | null>(null),
    [historyVersion, setHistoryVersion] = useState(0);
  const claimKeys = useRef(new Map<string, string>()),
    generation = useRef(0);
  async function load() {
    const serial = ++generation.current;
    try {
      const response = await request("/v1/me/affiliate/overview");
      if (serial !== generation.current) return;
      setView(response.data);
      setLegacy(false);
      setHistoryVersion((v) => v + 1);
    } catch (e) {
      if (serial !== generation.current) return;
      if (e instanceof ApiError && e.status === 404) setLegacy(true);
      else {
        if (e instanceof ApiError && e.status === 401) onExpired();
        setError((e as Error).message);
      }
    }
  }
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, []);
  async function claim(kind: string) {
    setBusy(true);
    setError("");
    setNotice("");
    let key = claimKeys.current.get(kind);
    if (!key) {
      key = crypto.randomUUID();
      claimKeys.current.set(kind, key);
    }
    try {
      const result = await request("/v1/me/affiliate/claims", {
        method: "POST",
        body: { kind },
        key,
        csrf: session.csrf,
      });
      setNotice(
        t("到账提示", {
          kind: t(names[kind]),
          count: result.data.rewards.length,
        }),
      );
      claimKeys.current.delete(kind);
      await load();
    } catch (e) {
      // 瞬时网络错误保留原幂等键用于核验；明确业务拒绝后，新操作使用新键。
      if (e instanceof ApiError && e.status < 500)
        claimKeys.current.delete(kind);
      if (e instanceof ApiError && e.status === 401) onExpired();
      setError(
        e instanceof ApiError && e.data?.error?.code === "STATE_CONFLICT"
          ? t("奖励状态已变化，请刷新后重试。")
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  if (legacy) return <>{fallback}</>;
  if (!view)
    return (
      <section className="member-card" aria-live="polite">
        {error || t("正在读取奖励与等级进度…")}
      </section>
    );
  if (!view.configured)
    return (
      <section className="member-card">
        <h2>{t("推荐奖励")}</h2>
        <p>{t("本站尚未发布代理奖励规则，请稍后查看。")}</p>
      </section>
    );
  const config = view.configuration.config,
    p = view.progress,
    grade = view.current_grade,
    scale = config.currency_scale;
  const totals = (kind: string) =>
    (p?.rewards || [])
      .filter((r: Row) => r.kind === kind && r.status === "CLAIMABLE")
      .reduce((a: bigint, r: Row) => a + BigInt(r.amount_minor), 0n);
  const eligible = enabled && p?.enabled;
  const claimsReady = view.claim_context_available;
  const next = config.levels.find((level: Row) => level.level > grade.level);
  const cards = [
    "REFERRAL",
    "COMMISSION",
    ...(p?.is_invited ? ["INVITEE"] : []),
  ];
  return (
    <div className="affiliate-member">
      <ProgramRewards session={session} onExpired={onExpired} />
      {/* 只汇总已实际领取的不可变奖励金额，待审核与待领取不算已到账收益。 */}
      <section className="member-card" aria-label={t("原有方案已领取收益")}>
        <h2>{t("原有方案已领取收益")}</h2>
        <strong>
          {amount(
            (p?.rewards || [])
              .filter((r: Row) => r.status === "CLAIMED")
              .reduce((sum: bigint, r: Row) => sum + BigInt(r.amount_minor), 0n)
              .toString(),
            scale,
          )}{" "}
          {config.currency}
        </strong>
      </section>
      <div className="affiliate-toolbar">
        <span>
          {t("实绩更新于")} {new Date(view.observed_at).toLocaleString(locale)}{" "}
          · {config.timezone}
        </span>
        <button disabled={busy} onClick={() => void load()}>
          {t("刷新")}
        </button>
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="affiliate-success">
          {notice}
        </p>
      )}
      {!eligible && (
        <p className="member-banner">
          {t("奖励新增和领取已暂停，历史权益保留。")}
        </p>
      )}
      {eligible && !claimsReady && (
        <p className="member-banner">
          {t("领取服务暂未开放，已解锁奖励保留。")}
        </p>
      )}
      <div className="affiliate-cards">
        {cards.map((kind) => (
          <section className="member-card" key={kind}>
            <span>{t(names[kind])}</span>
            <h2>
              {amount(totals(kind).toString(), scale)}{" "}
              <small>{config.currency}</small>
            </h2>
            <p className="muted">
              {kind === "COMMISSION"
                ? t("已审核通过的待领佣金")
                : kind === "INVITEE"
                  ? t("本人达标后，终身领取一次")
                  : t("各阶梯独立解锁，每阶梯奖励一次")}
            </p>
            <button
              className="primary"
              disabled={
                !eligible || !claimsReady || busy || totals(kind) === 0n
              }
              onClick={() => void claim(kind)}
            >
              {busy
                ? t("处理中…")
                : kind === "INVITEE"
                  ? t("领取受邀奖励")
                  : t("领取全部待领")}
            </button>
          </section>
        ))}
      </div>
      <section className="member-card">
        <div className="affiliate-toolbar">
          <div>
            <h2>{t("一键领取推荐与佣金")}</h2>
            <p className="muted">
              {t("每笔奖励分别生成交易和账变，受邀奖励单独领取。")}
            </p>
          </div>
          <button
            className="primary"
            disabled={
              !eligible ||
              !claimsReady ||
              busy ||
              totals("REFERRAL") + totals("COMMISSION") === 0n
            }
            onClick={() => void claim("ALL")}
          >
            {t("全部领取")}
          </button>
        </div>
      </section>
      {p?.is_invited && (
        <section className="member-card">
          <h2>{t("我的受邀达标进度")}</h2>
          <p className="muted">
            {t(
              "充值与有效业务量同时满足才解锁。达标时间由已确认业务事实记录。",
            )}
          </p>
          <Gauge
            title={t("累计成功充值")}
            current={p.qualification.invitee.deposit_minor}
            target={config.invitee_condition.deposit_minor}
            scale={scale}
            currency={config.currency}
          />
          <Gauge
            title={t("累计有效业务量")}
            current={p.qualification.invitee.valid_bet_minor}
            target={config.invitee_condition.valid_bet_minor}
            scale={scale}
            currency={config.currency}
          />
          {p.qualification.invitee.qualified_at && (
            <p>
              {t("达标于")}{" "}
              {new Date(p.qualification.invitee.qualified_at).toLocaleString(
                locale,
              )}
            </p>
          )}
        </section>
      )}
      <section className="member-card">
        <h2>{t("推荐阶梯")}</h2>
        <p className="muted">
          {t("每一档使用新增达标会员；同一会员不会重复占用不同阶梯。")}
        </p>
        <div className="affiliate-steps">
          {(p?.steps || []).map((step: Row, stepIndex: number) => {
            const reward = p.rewards.find(
              (r: Row) => r.kind === "REFERRAL" && r.step === step.step,
            );
            return (
              <article
                className={step.unlocked ? "affiliate-step-complete" : ""}
                key={step.step}
              >
                <img
                  className="affiliate-reward-logo"
                  src={`/affiliate-assets/reward-${Math.min(3, Math.floor((stepIndex * 3) / Math.max(1, p.steps.length)) + 1)}.svg`}
                  alt={t("推荐奖励图标")}
                />
                <div className="affiliate-toolbar">
                  <strong>
                    {t("第{step}档 · 再推荐{members}人", {
                      step: step.step,
                      members: step.additional_members,
                    })}
                  </strong>
                  <span>
                    {reward
                      ? t(states[reward.status])
                      : step.unlocked
                        ? t("达标处理中")
                        : t("进行中")}
                  </span>
                </div>
                <p>
                  {step.completed_members} / {step.additional_members} {t("人")}{" "}
                  ·{t("累计需要")} {step.cumulative_required} {t("人")}
                </p>
                <progress
                  max={step.additional_members}
                  value={step.completed_members}
                />
                <p>
                  {t("奖励")} {amount(step.reward_minor, scale)}{" "}
                  {config.currency}
                </p>
                {reward && (
                  <button onClick={() => setDetail(reward)}>
                    {t("查看达标会员")}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </section>
      <section className="member-card">
        <h2>
          {t("当前等级")} Lv{grade.level}
        </h2>
        <p className="muted">
          {t("今日实绩预估，关账后按最终等级计算当天佣金。")}
        </p>
        <p>
          {t("有效直属")} {grade.qualified_members} {t("人")} ·{" "}
          {t("今日三层有效业务量")} {amount(grade.valid_bet_minor, scale)}{" "}
          {config.currency}
        </p>
        {next ? (
          <>
            <p>
              {t("下一等级")} Lv{next.level}：{t("有效直属")}{" "}
              {grade.qualified_members} / {next.qualified_members} {t("人")}
            </p>
            <Gauge
              title={t("今日三层有效业务量")}
              current={grade.valid_bet_minor}
              target={next.daily_valid_bet_minor}
              scale={scale}
              currency={config.currency}
            />
          </>
        ) : (
          <p>{t("已达到当前规则最高等级")}</p>
        )}
        <div className="affiliate-table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("等级")}</th>
                <th>{t("有效直属")}</th>
                <th>{t("日有效业务量")}</th>
                <th>
                  {t(
                    config.commission_policy
                      ? "返佣规则"
                      : "一级 / 二级 / 三级",
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {config.levels.map((row: Row) => (
                <tr key={row.level}>
                  <td>Lv{row.level}</td>
                  <td>{row.qualified_members}</td>
                  <td>{amount(row.daily_valid_bet_minor, scale)}</td>
                  <td>
                    {config.commission_policy ? (
                      <CommissionRuleSummary
                        policy={config.commission_policy}
                        level={row.level}
                        scale={scale}
                        currency={config.currency}
                      />
                    ) : (
                      row.rates_ppm
                        .map((r: number) => `${amount(String(r), 4)}%`)
                        .join(" / ")
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="member-card">
        <h2>{t("团队等级预览")}</h2>
        <label>
          {t("等级")}
          <select
            aria-label={t("团队等级预览")}
            value={selectedLevel ?? grade.level}
            onChange={(e) => setSelectedLevel(Number(e.target.value))}
          >
            {config.levels.map((level: Row) => (
              <option key={level.level} value={level.level}>
                Lv{level.level}
              </option>
            ))}
          </select>
        </label>
        {config.commission_policy ? (
          <CommissionRuleSummary
            policy={config.commission_policy}
            level={selectedLevel ?? grade.level}
            scale={scale}
            currency={config.currency}
          />
        ) : (
          <>
            <p>
              {t("最高佣金比例")}{" "}
              {amount(
                String(
                  Math.max(
                    ...(config.levels.find(
                      (level: Row) =>
                        level.level === (selectedLevel ?? grade.level),
                    )?.rates_ppm || [0]),
                  ),
                ),
                4,
              )}
              %
            </p>
          </>
        )}
        <p>
          {t("推荐奖励总额")}{" "}
          {amount(
            config.steps
              .reduce(
                (sum: bigint, step: Row) => sum + BigInt(step.reward_minor),
                0n,
              )
              .toString(),
            scale,
          )}{" "}
          {config.currency}
        </p>
      </section>
      <section className="member-card">
        <h2>{t("直属推荐人进度")}</h2>
        <div className="member-grid">
          {(view.direct_members || []).map((member: Row) => (
            <article key={member.user_id}>
              <strong>ID: {member.user_id}</strong>
              <p>
                {t("加入时间")}{" "}
                {new Date(member.registered_at).toLocaleString(locale)}
              </p>
              <Gauge
                title={t("累计成功充值")}
                current={member.qualification.deposit_minor}
                target={config.referral_condition.deposit_minor}
                scale={scale}
                currency={config.currency}
              />
              <Gauge
                title={t("累计有效业务量")}
                current={member.qualification.valid_bet_minor}
                target={config.referral_condition.valid_bet_minor}
                scale={scale}
                currency={config.currency}
              />
              {member.qualification.qualified_at && <span>{t("已达标")}</span>}
            </article>
          ))}
        </div>
      </section>
      <CommissionCalculator
        key={`${view.configuration.revision}:${config.currency}:${scale}:${config.commission_policy?.depth || 3}`}
        revision={view.configuration.revision}
        scale={scale}
        currency={config.currency}
        depth={config.commission_policy?.depth || 3}
      />
      <RewardHistory
        scale={scale}
        reloadKey={historyVersion}
        onDetail={setDetail}
        onExpired={onExpired}
      />
      {detail && (
        <div className="affiliate-overlay" onClick={() => setDetail(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label={t("奖励详情")}
            className="member-card affiliate-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="affiliate-toolbar">
              <h2>
                {t(names[detail.kind])} {t("详情")}
              </h2>
              <button onClick={() => setDetail(null)}>{t("关闭")}</button>
            </div>
            <p>
              {t(states[detail.status])} ·{" "}
              {amount(detail.amount_minor, rewardScale(detail, scale))}{" "}
              {detail.currency}
            </p>
            <p className="muted">
              {t("奖励编号")}：{detail.reward_id}
            </p>
            {detail.claimed_at && (
              <p>
                {t("领取时间")}：
                {new Date(detail.claimed_at).toLocaleString(locale)}
                <br />
                {t("领取 IP")}：{detail.claim_ip || "—"}
              </p>
            )}
            {(detail.member_qualifications || []).map((member: Row) => (
              <div key={member.user_id} className="affiliate-detail-member">
                <strong>{member.user_id}</strong>
                <p>
                  {t("累计充值")}{" "}
                  {amount(
                    member[detail.kind === "INVITEE" ? "invitee" : "referral"]
                      .deposit_minor,
                    rewardScale(detail, scale),
                  )}
                  ，{t("有效业务量")}{" "}
                  {amount(
                    member[detail.kind === "INVITEE" ? "invitee" : "referral"]
                      .valid_bet_minor,
                    rewardScale(detail, scale),
                  )}
                </p>
                <p>
                  {t("达标时间")}：
                  {member[detail.kind === "INVITEE" ? "invitee" : "referral"]
                    .qualified_at
                    ? new Date(
                        member[
                          detail.kind === "INVITEE" ? "invitee" : "referral"
                        ].qualified_at,
                      ).toLocaleString(locale)
                    : "—"}
                </p>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
