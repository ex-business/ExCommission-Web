import { useMemberLocale } from "../member/affiliate/locale";
import { useEffect, useState } from "react";
import { request, ApiError } from "../../lib/api";
import { amount } from "./money";
import "./business.css";
type Row = Record<string, any>;
export function AgentBusinessReport({
  member = false,
  onExpired,
  fallback,
}: {
  member?: boolean;
  onExpired: () => void;
  fallback?: React.ReactNode;
}) {
  const { t, locale } = useMemberLocale();
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [user, setUser] = useState(""),
    [sort, setSort] = useState("became_agent_at"),
    [page, setPage] = useState<Row | null>(null),
    [detail, setDetail] = useState<Row | null>(null),
    [depth, setDepth] = useState("0"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [legacy, setLegacy] = useState(false);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && e.status === 404 && member && !page)
        setLegacy(true);
      else {
        if (e instanceof ApiError && e.status === 401) onExpired();
        setError((e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }
  async function load(offset?: number) {
    await run(async () => {
      const q = new URLSearchParams({ limit: "25", sort, descending: "true" });
      if (offset !== undefined && page) {
        q.set("snapshot_id", page.snapshot_id);
        q.set("offset", String(offset));
      } else {
        if (from) q.set("from", from);
        if (to) q.set("to", to);
        if (user.trim() && !member) q.set("user_id", user.trim());
      }
      const response = await request(
        (member
          ? "/v1/me/affiliate/team-report?"
          : "/v1/affiliate/agent-report?") + q,
      );
      setPage(response.data);
      setLegacy(false);
    });
  }
  useEffect(() => {
    void load();
  }, []);
  async function download() {
    if (!page) return;
    await run(async () => {
      const response = await request(
        "/v1/affiliate/agent-report/export?snapshot_id=" + page.snapshot_id,
      );
      const blob = new Blob(
          ["\ufeff" + String(response.data).replace(/^\ufeff/, "")],
          { type: "text/csv;charset=utf-8" },
        ),
        url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = "代理总表.csv";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  if (legacy) return <>{fallback}</>;
  const scale = page?.currency_scale ?? 2;
  const summary = (value: Row, title: string) =>
    value && (
      <div className="af-summary">
        <strong>{title}</strong>
        <span>
          {value.agents} {t("位代理")} · {t("直属")} {value.direct_members}{" "}
          {t("人")} · {t("团队")} {value.team_members} {t("人")}
        </span>
        <span>
          {t("团队充值")} {amount(value.team_deposit_minor, scale)} ·{" "}
          {t("提现")} {amount(value.team_withdrawal_minor, scale)} ·{" "}
          {t("存提差")} {amount(value.net_deposit_minor, scale)}
        </span>
        <span>
          {t("有效业务量")} {amount(value.team_valid_bet_minor, scale)} ·{" "}
          {t("已领推荐")} {amount(value.claimed_referral_minor, scale)} ·{" "}
          {t("已领佣金")} {amount(value.claimed_commission_minor, scale)}{" "}
          {page?.currency}
        </span>
      </div>
    );
  return (
    <section className="af-admin">
      <header>
        <h2>{member ? t("我的团队") : t("代理业务总表")}</h2>
        <p>
          {t(
            "按站点业务日期查询，默认今日。展示统计期末三层团队与有效会员；已冻结贡献和当前日预估分别显示。",
          )}
        </p>
      </header>
      <form
        className="af-filters"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label>
          {t("开始日期")}
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          {t("结束日期（不含）")}
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        {!member && (
          <label>
            {t("会员编号")}
            <input value={user} onChange={(e) => setUser(e.target.value)} />
          </label>
        )}
        <label>
          {t("排序")}
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="became_agent_at">{t("成为代理时间")}</option>
            <option value="direct_members">{t("直属人数")}</option>
            <option value="effective_direct">{t("有效直属")}</option>
            <option value="team_valid_bet_minor">{t("团队有效业务量")}</option>
            <option value="claimed_commission_minor">{t("已领佣金")}</option>
          </select>
        </label>
        <button className="primary" disabled={busy}>
          {t("查询")}
        </button>
        {!member && (
          <button
            type="button"
            disabled={busy || !page}
            onClick={() => void download()}
          >
            {t("导出本次快照")}
          </button>
        )}
      </form>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {page && (
        <>
          {summary(page.summary, t("全部条件汇总"))}
          {summary(page.page_summary, t("当前页汇总"))}
          <p className="muted">
            {page.timezone} · {t("观察于")}{" "}
            {new Date(page.as_of).toLocaleString(locale)}。
            {t("团队汇总按代理口径相加，跨代理团队成员可能重叠。")}
            {page.provisional ? t("当前日数据尚未关账。") : ""}
          </p>
          <div className="af-table">
            <table>
              <thead>
                <tr>
                  <th>{t("会员 / 代理")}</th>
                  <th>{t("成为代理时间")}</th>
                  <th>{t("直属 / 团队")}</th>
                  <th>{t("有效直属 / 团队")}</th>
                  <th>{t("直属 / 团队充值")}</th>
                  <th>{t("团队提现 / 存提差")}</th>
                  <th>{t("直属 / 团队有效量")}</th>
                  <th>{t("冻结 / 今日预估佣金")}</th>
                  <th>{t("已领推荐 / 佣金")}</th>
                  <th>{t("单代理开关")}</th>
                  <th>{t("明细")}</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((row: Row) => (
                  <tr key={row.user_id}>
                    <td>
                      <code>{row.user_id}</code>
                      <small>{row.agent_id}</small>
                    </td>
                    <td>
                      {new Date(row.became_agent_at).toLocaleString(locale)}
                    </td>
                    <td>
                      {row.direct_members} / {row.team_members}
                    </td>
                    <td>
                      {row.effective_direct} / {row.effective_team}
                    </td>
                    <td>
                      {amount(row.direct_deposit_minor, scale)} /{" "}
                      {amount(row.team_deposit_minor, scale)}
                    </td>
                    <td>
                      {amount(row.team_withdrawal_minor, scale)} /{" "}
                      {amount(row.net_deposit_minor, scale)}
                    </td>
                    <td>
                      {amount(row.direct_valid_bet_minor, scale)} /{" "}
                      {amount(row.team_valid_bet_minor, scale)}
                    </td>
                    <td>
                      {amount(row.calculated_commission_minor, scale)} /{" "}
                      {amount(row.provisional_commission_minor, scale)}
                    </td>
                    <td>
                      {amount(row.claimed_referral_minor, scale)} /{" "}
                      {amount(row.claimed_commission_minor, scale)}
                    </td>
                    <td>{row.enabled ? t("开启") : t("暂停")}</td>
                    <td>
                      <button
                        onClick={() => {
                          setDetail(row);
                          setDepth("0");
                        }}
                      >
                        {t("团队与贡献")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!page.rows.length && <p>{t("暂无有直属会员的代理")}</p>}
          {page.next_offset !== null && (
            <button disabled={busy} onClick={() => void load(page.next_offset)}>
              {t("下一页")}
            </button>
          )}
        </>
      )}
      {detail && (
        <div className="affiliate-overlay" onClick={() => setDetail(null)}>
          <section
            className="af-card affiliate-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t("团队与贡献明细")}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="affiliate-toolbar">
              <h2>{t("团队与贡献明细")}</h2>
              <button onClick={() => setDetail(null)}>{t("关闭")}</button>
            </div>
            <p>{detail.user_id}</p>
            <label>
              {t("层级")}
              <select value={depth} onChange={(e) => setDepth(e.target.value)}>
                <option value="0">{t("全部三层")}</option>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? t("直属一级") : t("第{depth}层", { depth: n })}
                  </option>
                ))}
              </select>
            </label>
            <div className="af-table">
              <table>
                <thead>
                  <tr>
                    <th>{t("会员")}</th>
                    <th>{t("层级")}</th>
                    <th>{t("注册时间")}</th>
                    <th>{t("首次达标时间")}</th>
                    <th>{t("充值 / 提现")}</th>
                    <th>{t("有效业务量")}</th>
                    <th>{t("冻结贡献 / 今日预估")}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.members
                    .filter(
                      (m: Row) => depth === "0" || m.depth === Number(depth),
                    )
                    .map((m: Row) => (
                      <tr key={`${m.user_id}:${m.depth}`}>
                        <td>{m.user_id}</td>
                        <td>
                          {m.depth}
                          {m.historical_relation ? t("（历史关系）") : ""}
                        </td>
                        <td>
                          {new Date(m.registered_at).toLocaleString(locale)}
                        </td>
                        <td>
                          {m.qualified_at
                            ? new Date(m.qualified_at).toLocaleString(locale)
                            : t("未达标")}
                        </td>
                        <td>
                          {amount(m.deposit_minor, scale)} /{" "}
                          {amount(m.withdrawal_minor, scale)}
                        </td>
                        <td>{amount(m.valid_bet_minor, scale)}</td>
                        <td>
                          {amount(m.contribution_minor, scale)} /{" "}
                          {amount(m.provisional_contribution_minor, scale)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
