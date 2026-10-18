import {PagedTable} from '../../components/PagedTable';
import { useMemberLocale } from "../member/affiliate/locale";
import { MemberIdentity } from "../member/affiliate/MemberIdentity";
import { useEffect, useState, useRef } from "react";
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
    [query, setQuery] = useState(""),
    [enabledState, setEnabledState] = useState(""),
    [loginIP, setLoginIP] = useState(""),
    [detailFrom, setDetailFrom] = useState(""),
    [detailTo, setDetailTo] = useState(""),
    [detailOffset, setDetailOffset] = useState(0),
    [detailSize, setDetailSize] = useState(20),
    [mainSize,setMainSize]=useState(20),[mainOffset,setMainOffset]=useState(0),
    [sort, setSort] = useState("became_agent_at"),
    [page, setPage] = useState<Row | null>(null),
    [detail, setDetail] = useState<Row | null>(null),
    [depth, setDepth] = useState("1"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [legacy, setLegacy] = useState(false);
  const requestSerial = useRef(0),
    detailSerial = useRef(0),
    detailApplied = useRef({ from: "", to: "", period: "yesterday" });
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
  async function load(offset?: number,size=mainSize) {
    const serial = ++requestSerial.current;
    await run(async () => {
      const q = new URLSearchParams({ limit: String(size), sort, descending: "true" });
      if (offset !== undefined && page) {
        q.set("snapshot_id", page.snapshot_id);
        q.set("offset", String(offset));
      } else {
        if (query) q.set("search", query.trim());
        if (enabledState) q.set("state", enabledState);
        if (loginIP) q.set("login_ip", loginIP.trim());
        if (from) q.set("from", from);
        if (to) q.set("to", to);
        if (user.trim() && !member) q.set("user_id", user.trim());
      }
      const response = await request(
        (member
          ? "/v1/me/affiliate/team-report?"
          : "/v1/affiliate/agent-report?") + q,
      );
      if (serial !== requestSerial.current) return;
      setPage(response.data);setMainOffset(offset??0);
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
  function closeDetail() {
    detailSerial.current++;
    setDetail(null);
  }
  useEffect(
    () => () => {
      requestSerial.current++;
      detailSerial.current++;
    },
    [],
  );
  async function loadDetail(
    row: Row,
    from = "",
    to = "",
    period = "yesterday",
  ) {
    const serial = ++detailSerial.current;
    await run(async () => {
      const q = new URLSearchParams({
        user_id: row.user_id,
        limit: "100",
        period,
      });
      if (from) q.set("from", from);
      if (to) q.set("to", to);
      const result = (
        await request(
          (member
            ? "/v1/me/affiliate/team-report?"
            : "/v1/affiliate/agent-report?") + q,
        )
      ).data;
      if (serial !== detailSerial.current) return;
      setDetail({
        ...row,
        ...(result.rows[0] || {}),
        members: result.rows[0]?.members || [],
        as_of: result.as_of,
      });
      const siteDate = (at: string) =>
        new Intl.DateTimeFormat("en-CA", {
          timeZone: result.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(at));
      const df = siteDate(result.filters.from),
        dt = siteDate(result.filters.to);
      setDetailFrom(df);
      setDetailTo(dt);
      detailApplied.current = { from: df, to: dt, period: "" };
      setDetailOffset(0);
    });
  }
  useEffect(() => {
    if (!detail) return;
    const timer = setInterval(() => {
      const f = detailApplied.current;
      void loadDetail(detail, f.from, f.to, f.period);
    }, 600000);
    return () => clearInterval(timer);
  }, [detail?.user_id]);
  const detailMembers = (detail?.members || [])
    .filter((m: Row) => depth === "0" || m.depth === Number(depth))
    .sort((a: Row, b: Row) => {
      const av = BigInt(a.contribution_minor || "0"),
        bv = BigInt(b.contribution_minor || "0");
      return av === bv ? a.user_id.localeCompare(b.user_id) : av > bv ? -1 : 1;
    });
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
        {!member && (
          <>
            <label>
              {t("代理账号 / 展示ID")}
              <input value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <label>
              {t("状态")}
              <select
                value={enabledState}
                onChange={(e) => setEnabledState(e.target.value)}
              >
                <option value="">{t("全部")}</option>
                <option value="enabled">{t("开启")}</option>
                <option value="disabled">{t("暂停")}</option>
              </select>
            </label>
            <label>
              {t("最近登录IP")}
              <input
                value={loginIP}
                onChange={(e) => setLoginIP(e.target.value)}
              />
            </label>
          </>
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
            <PagedTable paging={{page:Math.floor(mainOffset/mainSize)+1,size:mainSize,more:page.next_offset!==null,busy,onNext:()=>void load(page.next_offset),onPrevious:()=>void load(Math.max(0,mainOffset-mainSize)),onSize:size=>{setMainSize(size);void load(undefined,size)}}}>
              <thead>
                <tr>
                  <th>{t("会员 / 代理")}</th>
                  <th>{t("最近登录时间 / IP")}</th>
                  <th>{t("成为代理时间")}</th>
                  <th>{t("直属 / 团队")}</th>
                  <th>{t("有效直属 / 团队")}</th>
                  <th>{t("直属 / 团队充值")}</th>
                  <th>{t("团队提现 / 存提差")}</th>
                  <th>{t("直属 / 团队投注")}</th>
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
                      <MemberIdentity id={row.user_id} profile={row.profile} />
                    </td>
                    <td>
                      {row.profile?.last_login_at
                        ? new Date(row.profile.last_login_at).toLocaleString(
                            locale,
                          )
                        : "—"}
                      <small>{row.profile?.last_login_ip || "—"}</small>
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
                      {amount(row.direct_bet_minor || "0", scale)} /{" "}
                      {amount(row.team_bet_minor || "0", scale)}
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
                          setDepth("1");
                          void loadDetail(row);
                        }}
                      >
                        {t("团队与贡献")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </PagedTable>
          </div>
          {!page.rows.length && <p>{t("暂无有直属会员的代理")}</p>}
        </>
      )}
      {detail && (
        <div className="affiliate-overlay" onClick={closeDetail}>
          <section
            className="af-card affiliate-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t("团队与贡献明细")}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="affiliate-toolbar">
              <h2>{t("团队与贡献明细")}</h2>
              <button onClick={closeDetail}>{t("关闭")}</button>
            </div>
            <MemberIdentity id={detail.user_id} profile={detail.profile} />
            <p>{t("明细默认昨日，每10分钟更新，按冻结贡献佣金倒序。")}</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void loadDetail(detail, detailFrom, detailTo, "");
              }}
            >
              <label>
                {t("开始日期")}
                <input
                  type="date"
                  value={detailFrom}
                  onChange={(e) => setDetailFrom(e.target.value)}
                  required
                />
              </label>
              <label>
                {t("结束日期（不含）")}
                <input
                  type="date"
                  value={detailTo}
                  onChange={(e) => setDetailTo(e.target.value)}
                  required
                />
              </label>
              <button disabled={busy}>{t("查询")}</button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void loadDetail(detail, "", "", "yesterday")}
              >
                {t("昨日")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void loadDetail(detail, "", "", "")}
              >
                {t("今日")}
              </button>
            </form>
            <div className="af-tabs">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    setDepth(String(n));
                    setDetailOffset(0);
                  }}
                  aria-selected={depth === String(n)}
                >
                  {t("第{depth}层", { depth: n })}
                </button>
              ))}
            </div>
            <label>
              {t("层级")}
              <select
                value={depth}
                onChange={(e) => {
                  setDepth(e.target.value);
                  setDetailOffset(0);
                }}
              >
                <option value="0">{t("全部三层")}</option>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? t("直属一级") : t("第{depth}层", { depth: n })}
                  </option>
                ))}
              </select>
            </label>
            <div className="af-table">
              <PagedTable>
                <thead>
                  <tr>
                    <th>{t("会员")}</th>
                    <th>{t("层级")}</th>
                    <th>{t("注册时间")}</th>
                    <th>{t("有效会员 / 类型")}</th>
                    <th>{t("首次达标时间")}</th>
                    <th>{t("充值 / 提现")}</th>
                    <th>{t("投注金额 / 有效业务量")}</th>
                    <th>{t("每日结算比例")}</th>
                    <th>{t("冻结贡献 / 今日预估")}</th>
                  </tr>
                </thead>
                <tbody>
                  {detailMembers.map((m: Row) => (
                      <tr key={`${m.user_id}:${m.depth}`}>
                        <td>
                          <MemberIdentity id={m.user_id} profile={m.profile} />
                        </td>
                        <td>
                          {m.depth}
                          {m.historical_relation ? t("（历史关系）") : ""}
                        </td>
                        <td>
                          {new Date(m.registered_at).toLocaleString(locale)}
                        </td>
                        <td>
                          {m.effective_member == null
                            ? "—"
                            : t(m.effective_member ? "是" : "否")}{" "}
                          / {t(m.member_type === "AGENT" ? "代理" : "会员")}
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
                        <td>
                          {amount(m.bet_minor || "0", scale)} /{" "}
                          {amount(m.valid_bet_minor, scale)}
                        </td>
                        <td>
                          {(m.settlements || []).map((s: Row, i: number) => (
                            <div key={i}>
                              {s.business_day}: {amount(String(s.rate_ppm), 4)}%
                              · {amount(s.commission_minor, scale)}
                            </div>
                          ))}
                        </td>
                        <td>
                          {amount(m.contribution_minor, scale)} /{" "}
                          {amount(m.provisional_contribution_minor, scale)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </PagedTable>
            </div>

          </section>
        </div>
      )}
    </section>
  );
}
