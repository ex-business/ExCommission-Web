import { useMemberLocale } from "../member/affiliate/locale";
import { useState } from "react";
import { request, ApiError } from "../../lib/api";
import { displayMoney } from "../finance/CommissionReview";
type Row = Record<string, any>;
export function AgentDirectory({
  onExpired,
  member = false,
}: {
  onExpired: () => void;
  member?: boolean;
}) {
  const { t, locale } = useMemberLocale();
  const [root, setRoot] = useState(""),
    [currency, setCurrency] = useState("USD"),
    [depth, setDepth] = useState(""),
    [rows, setRows] = useState<Row[]>([]),
    [summary, setSummary] = useState<Row | null>(null),
    [next, setNext] = useState<string | null>(null),
    [asOf, setAsOf] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load(after = "") {
    setBusy(true);
    setError("");
    try {
      const q = new URLSearchParams({ currency, limit: "25" });
      if (depth) q.set("depth", depth);
      if (after) {
        q.set("after_id", after);
        q.set("as_of", asOf);
      }
      const path = member
        ? "/v1/me/team"
        : root
          ? "/v1/agents/" + encodeURIComponent(root) + "/team"
          : "/v1/agent-directory";
      const r = await request(path + "?" + q);
      setRows(r.data.rows);
      setSummary(r.data.summary);
      setNext(r.data.next_after_id);
      setAsOf(r.data.as_of);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired();
      setError(e instanceof Error ? e.message : t("查询失败"));
    } finally {
      setBusy(false);
    }
  }
  const money = (r: Row, key: string) =>
    r.statistics ? displayMoney(r.statistics[key], currency) : t("尚未接入");
  return (
    <section aria-label={member ? t("我的团队") : t("代理总表")}>
      <h2>{member ? t("我的团队") : t("代理总表及下线明细")}</h2>
      <div className="review-filters">
        {!member && (
          <label>
            {t("下线所属代理")}
            <input
              aria-label={t("下线所属代理")}
              placeholder="留空查看代理总表"
              value={root}
              onChange={(e) => setRoot(e.target.value)}
            />
          </label>
        )}
        <label>
          {t("统计币种")}
          <select
            aria-label={t("统计币种")}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option>USD</option>
            <option>BTC</option>
            <option>POINT</option>
          </select>
        </label>
        <label>
          {t("下线层级")}
          <select
            aria-label={t("下线层级")}
            value={depth}
            onChange={(e) => setDepth(e.target.value)}
          >
            <option value="">{t("全部三层")}</option>
            <option value="1">{t("第一层")}</option>
            <option value="2">{t("第二层")}</option>
            <option value="3">{t("第三层")}</option>
          </select>
        </label>
        <button disabled={busy} onClick={() => load()}>
          {t("查询代理与团队")}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {summary && (
        <div aria-label={t("全部匹配汇总")}>
          <p>
            {t("共")}
            {summary.members}
            {t("人 · 缺少统计")}
            {summary.missing_statistics}
            {t("人 ·")}{" "}
            {t(summary.complete ? "数据完整" : "汇总仅含已接入数据")}
          </p>
          <p>
            {t("存款")}
            {displayMoney(summary.deposit_minor, currency)}
            {t("· 提款")} {displayMoney(summary.withdrawal_minor, currency)}
            {t("· 投注")} {displayMoney(summary.bet_minor, currency)}
            {t("· 有效投注")} {displayMoney(summary.valid_bet_minor, currency)}
          </p>
          <small>
            {t("截至")}
            {asOf}
            {t("的累计数据，汇总覆盖全部匹配成员。")}
          </small>
        </div>
      )}
      <div className="review-table">
        <table>
          <thead>
            <tr>
              {[
                t("会员"),
                "代理",
                t("层级"),
                "存款",
                "提款",
                "投注",
                "有效投注",
                "VIP",
                ...(!member ? ["登录IP"] : []),
              ].map((x) => (
                <th key={x}>{t(x)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id}>
                <td>
                  {r.display_name}
                  <small>{r.user_id}</small>
                </td>
                <td>{r.agent_id || t("普通会员")}</td>
                <td>{r.depth || "—"}</td>
                <td>{money(r, "deposit_minor")}</td>
                <td>{money(r, "withdrawal_minor")}</td>
                <td>{money(r, "bet_minor")}</td>
                <td>{money(r, "valid_bet_minor")}</td>
                <td>{r.statistics?.vip || t("未知")}</td>
                {!member && (
                  <td>{r.statistics?.login_ip || t("未提供或无权限")}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {next && (
        <button disabled={busy} onClick={() => load(next)}>
          {t("下一页团队")}
        </button>
      )}
    </section>
  );
}
