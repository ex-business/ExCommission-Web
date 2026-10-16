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
      setError(e instanceof Error ? e.message : "查询失败");
    } finally {
      setBusy(false);
    }
  }
  const money = (r: Row, key: string) =>
    r.statistics ? displayMoney(r.statistics[key], currency) : "尚未接入";
  return (
    <section aria-label={member ? "我的团队" : "代理总表"}>
      <h2>{member ? "我的团队" : "代理总表及下线明细"}</h2>
      <div className="review-filters">
        {!member && (
          <label>
            下线所属代理
            <input
              aria-label="下线所属代理"
              placeholder="留空查看代理总表"
              value={root}
              onChange={(e) => setRoot(e.target.value)}
            />
          </label>
        )}
        <label>
          统计币种
          <select
            aria-label="统计币种"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option>USD</option>
            <option>BTC</option>
            <option>POINT</option>
          </select>
        </label>
        <label>
          下线层级
          <select
            aria-label="下线层级"
            value={depth}
            onChange={(e) => setDepth(e.target.value)}
          >
            <option value="">全部三层</option>
            <option value="1">第一层</option>
            <option value="2">第二层</option>
            <option value="3">第三层</option>
          </select>
        </label>
        <button disabled={busy} onClick={() => load()}>
          查询代理与团队
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {summary && (
        <div aria-label="全部匹配汇总">
          <p>
            共 {summary.members} 人 · 缺少统计 {summary.missing_statistics} 人 ·{" "}
            {summary.complete ? "数据完整" : "汇总仅含已接入数据"}
          </p>
          <p>
            存款 {displayMoney(summary.deposit_minor, currency)} · 提款{" "}
            {displayMoney(summary.withdrawal_minor, currency)} · 投注{" "}
            {displayMoney(summary.bet_minor, currency)} · 有效投注{" "}
            {displayMoney(summary.valid_bet_minor, currency)}
          </p>
          <small>截至 {asOf} 的累计数据，汇总覆盖全部匹配成员。</small>
        </div>
      )}
      <div className="review-table">
        <table>
          <thead>
            <tr>
              {[
                "会员",
                "代理",
                "层级",
                "存款",
                "提款",
                "投注",
                "有效投注",
                "VIP",
                ...(!member ? ["登录IP"] : []),
              ].map((x) => (
                <th key={x}>{x}</th>
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
                <td>{r.agent_id || "普通会员"}</td>
                <td>{r.depth || "—"}</td>
                <td>{money(r, "deposit_minor")}</td>
                <td>{money(r, "withdrawal_minor")}</td>
                <td>{money(r, "bet_minor")}</td>
                <td>{money(r, "valid_bet_minor")}</td>
                <td>{r.statistics?.vip || "未知"}</td>
                {!member && (
                  <td>{r.statistics?.login_ip || "未提供或无权限"}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {next && (
        <button disabled={busy} onClick={() => load(next)}>
          下一页团队
        </button>
      )}
    </section>
  );
}
