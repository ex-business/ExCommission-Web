import { useEffect, useRef, useState } from "react";
import { PagedTable } from "../../components/PagedTable";
import { useCursorPages } from "../../components/useCursorPages";
import { ApiError, request } from "../../lib/api";

type Delivery = {
  delivery_id: string;
  reward_id: string;
  claim_id: string;
  user_id: string;
  currency: string;
  amount_minor: string;
  status: string;
  receipt_ref?: string;
  callback_id?: string;
  request_id: string;
  last_error?: string;
  updated_at: string;
};
const statuses: Record<string, string> = {
  PENDING: "等待派发",
  UNKNOWN: "结果未知，等待原单查询",
  SUCCEEDED: "已到账",
  FAILED_FINAL: "明确失败",
};

// 仅查询本站派发原单及回执；不提供重发、改账或手填回执入口，授权仍由原API执行。
export function AffiliateClaimDeliveries({ onExpired }: { onExpired: () => void }) {
  const [rows, setRows] = useState<Delivery[]>([]);
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const serial = useRef(0);
  const paging = useCursorPages();
  async function load(after = "", size = paging.size) {
    const current = ++serial.current;
    setBusy(true);
    setError("");
    try {
      const query = new URLSearchParams({ limit: String(size) });
      if (after) query.set("after_id", after);
      const response = await request("/v1/affiliate/claim-deliveries?" + query);
      // 翻页或卸载后不允许旧响应覆盖当前页；每页仅显示服务端游标返回的原单。
      if (current !== serial.current) return;
      setRows(response.data.rows);
      setNext(response.data.next_after || "");
      paging.record(after);
    } catch (e) {
      if (current !== serial.current) return;
      if (e instanceof ApiError && e.status === 401) onExpired();
      setError(e instanceof Error ? e.message : "查询失败");
    } finally {
      if (current === serial.current) setBusy(false);
    }
  }
  useEffect(() => { void load(); return () => { serial.current++; }; }, []);
  return <section className="panel">
    <h2>代理领取派发记录</h2>
    <button disabled={busy} onClick={() => void load()}>{busy ? "查询中…" : "刷新"}</button>
    {error && <p role="alert">{error}</p>}
    <div className="table-scroll">
      <PagedTable paging={{page:paging.page,size:paging.size,more:Boolean(next),busy,onNext:()=>void load(next),onPrevious:()=>void load(paging.previous),onSize:size=>{paging.setSize(size);void load("",size);}}}>
        <thead><tr>{["派发原单 / 领取 / 奖励", "会员", "金额（最小单位）", "状态", "钱包回执 / 回调", "请求编号", "更新时间 / 原因"].map(label=><th key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.map(row=><tr key={row.delivery_id}>
          <td>{row.delivery_id}<div>领取：{row.claim_id}</div><div>奖励：{row.reward_id}</div></td>
          <td>{row.user_id}</td>
          <td>{row.amount_minor} {row.currency}</td>
          <td>{statuses[row.status] || row.status}</td>
          <td>{row.receipt_ref || "—"}<div>回调：{row.callback_id || "—"}</div></td>
          <td>{row.request_id}</td>
          <td>{new Date(row.updated_at).toLocaleString()}<div>{row.last_error || ""}</div></td>
        </tr>)}</tbody>
      </PagedTable>
    </div>
    {!busy && !error && rows.length===0 && <p>暂无派发记录</p>}
  </section>;
}
