import { PagedTable } from "../../components/PagedTable";

type Row = {
  delivery_id: string; claim_id: string; reward_id: string; user_id: string;
  currency: string; amount_minor: string; wallet_amount_minor: string;
  receipt_ref: string | null; wallet_receipt_ref: string | null;
  paid_minor: string; target_minor: string; debt_minor: string;
  result: string; reason: string;
};
type Report = {
  status: string; statement_ref: string; observed_at: string;
  checked_count: number; matched_count: number; difference_count: number; pending_count: number;
  rows: Row[];
};
const states: Record<string,string> = {MATCHED:"核对一致",MISMATCH:"存在差异",PENDING_CONFIRMATION:"等待原单确认",NO_AFFILIATE_ORDERS:"无代理领取账单"};
// 单列历史已付和冲正追偿，不把目标金额归零误显示为钱包已退款；本组件没有资金操作。
export function WalletReconciliationResult({value}:{value:{run_id:string;affiliate_wallet:Report}}) {
  const report=value.affiliate_wallet;
  return <section aria-label="代理钱包对账结果">
    <h3>{states[report.status] || report.status}</h3>
    <p>账单日期：{report.statement_ref} · 核对 {report.checked_count} 笔 · 一致 {report.matched_count} 笔 · 差异 {report.difference_count} 笔 · 待确认 {report.pending_count} 笔</p>
    <p>核对本日钱包账单中的代理领取原单，其他日期的缺单另行查询。</p>
    <div className="table-scroll"><PagedTable>
      <thead><tr>{["派发原单", "领取金额 / 钱包金额（最小单位）", "已付 / 调整后应付 / 追偿（最小单位）", "钱包回执", "核对结果"].map(h=><th key={h}>{h}</th>)}</tr></thead>
      <tbody>{report.rows.map(row=><tr key={row.delivery_id}>
        <td><details><summary>{row.delivery_id.slice(0,16)}…</summary><p>派发：{row.delivery_id}</p><p>领取：{row.claim_id}</p><p>奖励：{row.reward_id}</p><p>会员：{row.user_id}</p></details></td>
        <td>{row.amount_minor} / {row.wallet_amount_minor} {row.currency}</td>
        <td>{row.paid_minor} / {row.target_minor} / {row.debt_minor} {row.currency}</td>
        <td>{row.wallet_receipt_ref || "—"}</td>
        <td>{states[row.result] || row.result}<div>{row.reason}</div></td>
      </tr>)}</tbody>
    </PagedTable></div>
    <p>对账编号：{value.run_id} · 核对时间：{new Date(report.observed_at).toLocaleString()}</p>
  </section>;
}
