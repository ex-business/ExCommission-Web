import { useEffect, useState } from "react";
import { request, ApiError } from "../../lib/api";
type Row = {
  business_id: string;
  original_business_id: string;
  original_event_id: string;
  kind: string;
  adjustment_id: string;
  reversal_id: string;
  reward_id: string;
  user_id: string;
  currency: string;
  before_target: string;
  after_target: string;
  debt_added: string;
  status: string;
  created_at: string;
};
type Receipt = {
  event_id: string;
  business_id: string;
  original_business_id: string;
  kind: string;
  currency: string;
  amount_minor: string;
  valid_bet_minor: string;
  business_time: string;
};
const labels: Record<string, string> = {
  ADJUSTED: "已调整",
  RECOVERY_OPEN: "待追偿",
  REVIEW_REQUIRED: "待复核补偿",
};
// 本页仅查询本站冲正依据；退款撤单由会员业务来源发出，不提供后台手填金额入口。
export function AffiliateReversals({ onExpired }: { onExpired: () => void }) {
  const [events, setEvents] = useState<Receipt[]>([]);
  const [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  async function load() {
    setBusy(true);
    setError("");
    try {
      const r = await request("/v1/affiliate/reversals");
      setRows(r.data.items);
      setEvents(r.data.events || []);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired();
      setError(e instanceof Error ? e.message : "查询失败");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  const selected = rows.filter((r) => !status || r.status === status);
  return (
    <section className="panel">
      <h2>代理冲正记录</h2>
      <p>按原充值、投注事件调整奖励。已领取金额保留原流水，差额记入追偿。</p>
      <div
        className="toolbar"
        style={{ display: "flex", gap: 12, alignItems: "end" }}
      >
        <label style={{ maxWidth: 220 }}>
          处理状态
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">全部</option>
            {Object.entries(labels).map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button disabled={busy} onClick={load}>
          {busy ? "查询中…" : "刷新"}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {[
                "退款／原单",
                "奖励／会员",
                "币种",
                "原应付额",
                "调整后应付额",
                "新增追偿",
                "处理状态",
                "时间",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {selected.map((r) => (
              <tr key={r.adjustment_id}>
                <td>
                  {r.business_id}
                  <div title={r.original_event_id}>
                    原单：{r.original_business_id}
                  </div>
                  <small>
                    {r.kind === "DEPOSIT_REFUNDED" ? "充值退款" : "投注撤单"}
                  </small>
                </td>
                <td title={r.reward_id}>
                  {r.reward_id.slice(0, 12)}
                  <div title={r.user_id}>{r.user_id.slice(0, 16)}</div>
                </td>
                <td>{r.currency}</td>
                <td>{r.before_target}</td>
                <td>{r.after_target}</td>
                <td>{r.debt_added}</td>
                <td>{labels[r.status] || r.status}</td>
                <td>{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!busy && !selected.length && <p>暂无冲正记录</p>}
      <details>
        <summary>已接收退款和撤单（{events.length}）</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "退款／撤单号",
                  "原业务单号",
                  "类型",
                  "币种",
                  "退款／撤单金额",
                  "撤销有效投注",
                  "业务时间",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.event_id}>
                  <td>{e.business_id}</td>
                  <td>{e.original_business_id}</td>
                  <td>
                    {e.kind === "DEPOSIT_REFUNDED" ? "充值退款" : "投注撤单"}
                  </td>
                  <td>{e.currency}</td>
                  <td>{e.amount_minor}</td>
                  <td>{e.valid_bet_minor}</td>
                  <td>{new Date(e.business_time).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          接收成功的事件可能未产生新的奖励差额，例如同一奖励已被此前退款取消。
        </p>
      </details>
      <p>
        金额以最小货币单位展示。每次最多查询1000条；追偿记录不会自动扣除会员钱包。
      </p>
    </section>
  );
}
