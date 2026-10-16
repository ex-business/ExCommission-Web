import { useState, useRef } from "react";
import { request, ApiError } from "../../lib/api";
import type { Session } from "../../auth/Login";
type Row = Record<string, any>;
const precision: Record<string, number> = { USD: 2, BTC: 8, POINT: 0 };
const statusNames: Record<string, string> = {
  PENDING: "待审核",
  APPROVED: "审核通过",
  REJECTED: "已拒绝",
  CANCELLED: "已取消",
  STALE: "已失效",
  DRAFT: "待提交",
  QUEUED: "待派发",
  LINKED: "已生成付款，待核验渠道",
  BLOCKED: "需要处理",
  CLAIMABLE: "待领取",
  PROCESSING: "领取处理中",
  CLAIMED: "已领取",
  FAILED: "领取失败",
  RECONCILIATION_EXCEPTION: "核验异常",
  PREPARING: "准备中",
};
export function displayMoney(value: string, currency: string) {
  const e = precision[currency];
  if (e === undefined) return value + " " + currency;
  const s = value.padStart(e + 1, "0");
  return (e ? s.slice(0, -e) + "." + s.slice(-e) : s) + " " + currency;
}
export function minorMoney(value: string, currency: string) {
  const e = precision[currency];
  if (e === undefined) throw new Error("当前币种精度未知");
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error("请输入正数金额");
  const [a, b = ""] = value.split(".");
  if (b.length > e) throw new Error("金额小数位超出币种精度");
  const n = BigInt(a + b.padEnd(e, "0"));
  if (n <= 0n) throw new Error("金额必须大于零");
  return n.toString();
}
export function CommissionReview({
  session,
  onExpired,
}: {
  session: Session;
  onExpired: () => void;
}) {
  const [tab, setTab] = useState<"reviews" | "orders">("reviews"),
    [status, setStatus] = useState("PENDING"),
    [agent, setAgent] = useState(""),
    [currency, setCurrency] = useState(""),
    [period, setPeriod] = useState(""),
    [rows, setRows] = useState<Row[]>([]),
    [next, setNext] = useState<string | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [remark, setRemark] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [results, setResults] = useState<Row[]>([]),
    [draft, setDraft] = useState<Row | null>(null),
    [amount, setAmount] = useState(""),
    [draftRemark, setDraftRemark] = useState(""),
    [deliveryMode, setDeliveryMode] = useState("MEMBER_CLAIM"),
    [channel, setChannel] = useState("wallet");
  const last = useRef({ body: "", key: "" });
  const id = (r: Row) => (tab === "reviews" ? r.approval_id : r.instruction_id);
  async function guarded(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired();
      setError(e instanceof Error ? e.message : "操作未完成");
    } finally {
      setBusy(false);
    }
  }
  async function load(after = "", mode = tab) {
    const q = new URLSearchParams({ limit: "50" });
    if (after) q.set("after_id", after);
    if (mode === "reviews") {
      if (status) q.set("approval_status", status);
      if (agent) q.set("agent_id", agent);
      if (currency) q.set("currency", currency);
      if (period) q.set("period", period);
    }
    const r = await request(
      (mode === "reviews" ? "/v1/commission-reviews" : "/v1/payout-orders") +
        "?" +
        q,
    );
    setRows(r.data.rows);
    setNext(r.data.next_after_id);
    setSelected([]);
  }
  async function mutate(path: string, body: unknown, method = "POST") {
    const text = method + path + JSON.stringify(body);
    if (last.current.body !== text)
      last.current = { body: text, key: crypto.randomUUID() };
    return request(path, {
      method,
      body,
      csrf: session.csrf,
      key: last.current.key,
    });
  }
  async function review(
    decision: string,
    targets = rows.filter((r) => selected.includes(id(r))),
  ) {
    if (!targets.length) return;
    await guarded(async () => {
      const result = await mutate("/v1/commission-review-batches", {
        items: targets.map((r) => ({
          approval_id: r.approval_id,
          decision,
          expected_revision: r.revision,
          object_hash: r.object_hash,
          reason: decision === "APPROVE" ? "审核通过" : "取消派发",
          remark,
        })),
      });
      setResults(result.data.results);
      await load();
    });
  }
  async function act(
    action: string,
    targets = rows.filter((r) => selected.includes(id(r))),
  ) {
    if (!targets.length) return;
    await guarded(async () => {
      const result = await mutate("/v1/payout-order-batches", {
        action,
        items: targets.map((r) => ({
          instruction_id: r.instruction_id,
          expected_revision: r.revision,
          reason: "人工派发操作",
          remark,
        })),
      });
      setResults(result.data.results);
      await load();
    });
  }
  function open(r: Row, edit = false) {
    setDraft({ ...r, editing: edit });
    setChannel(edit ? r.channel_id : "wallet");
    setDeliveryMode(edit ? r.delivery_mode || "DIRECT" : "MEMBER_CLAIM");
    const val = edit ? r.amount.minor_units : r.total_minor;
    const cur = edit ? r.amount.currency : r.currency;
    setAmount(displayMoney(val, cur).split(" ")[0]);
    setDraftRemark(r.remark || "");
  }
  async function save() {
    if (!draft) return;
    await guarded(async () => {
      const cur = draft.editing ? draft.amount.currency : draft.currency;
      const money = { currency: cur, minor_units: minorMoney(amount, cur) };
      if (draft.editing)
        await mutate(
          "/v1/payout-orders/" + draft.instruction_id,
          {
            expected_revision: draft.revision,
            amount: money,
            remark: draftRemark,
          },
          "PUT",
        );
      else
        await mutate("/v1/payout-orders", {
          delivery_mode: deliveryMode,
          statement_id: draft.statement_id,
          expected_statement_revision: draft.statement_revision,
          amount: money,
          channel_id: channel,
          remark: draftRemark,
        });
      setDraft(null);
      setRows([]);
      setSelected([]);
      setNext(null);
      setTab("orders");
      await load("", "orders");
    });
  }
  return (
    <section className="review-workspace">
      <h2>佣金审核与派发</h2>
      <div className="tabs">
        <button
          onClick={() => {
            setTab("reviews");
            setRows([]);
            setSelected([]);
            setNext(null);
            setResults([]);
          }}
        >
          佣金审核
        </button>
        <button
          onClick={() => {
            setTab("orders");
            setRows([]);
            setSelected([]);
            setNext(null);
            setResults([]);
          }}
        >
          派发草稿
        </button>
      </div>
      <div className="review-filters">
        {tab === "reviews" && (
          <>
            <label>
              审核状态
              <select
                aria-label="审核状态"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {[
                  "PENDING",
                  "APPROVED",
                  "REJECTED",
                  "CANCELLED",
                  "STALE",
                  "",
                ].map((s, i) => (
                  <option key={s} value={s}>
                    {
                      [
                        "待审核",
                        "已审核",
                        "已拒绝",
                        "已取消",
                        "已失效",
                        "全部",
                      ][i]
                    }
                  </option>
                ))}
              </select>
            </label>
            <label>
              代理
              <input
                aria-label="代理筛选"
                value={agent}
                onChange={(e) => setAgent(e.target.value)}
              />
            </label>
            <label>
              币种
              <input
                aria-label="币种筛选"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              />
            </label>
            <label>
              结算日期
              <input
                aria-label="结算日期"
                type="date"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            </label>
          </>
        )}
        <button disabled={busy} onClick={() => guarded(() => load())}>
          查询列表
        </button>
      </div>
      <label>
        审核或操作备注
        <textarea
          aria-label="批量备注"
          maxLength={1000}
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
        />
      </label>
      <div className="review-actions">
        {tab === "reviews" ? (
          <>
            <button
              disabled={busy || !selected.length}
              onClick={() => review("APPROVE")}
            >
              批量审核通过
            </button>
            <button
              disabled={busy || !selected.length}
              onClick={() => review("REJECT")}
            >
              批量取消派发
            </button>
          </>
        ) : (
          <>
            <button
              disabled={busy || !selected.length}
              onClick={() => act("RELEASE")}
            >
              批量提交派发
            </button>
            <button
              disabled={busy || !selected.length}
              onClick={() => act("CANCEL")}
            >
              批量取消草稿
            </button>
          </>
        )}
      </div>
      {error && (
        <div role="alert" className="error-box">
          {error}
        </div>
      )}
      <div className="review-table">
        <table>
          <thead>
            <tr>
              <th>选择</th>
              <th>记录</th>
              <th>状态</th>
              <th>金额</th>
              <th>备注</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={id(r)}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={"选择 " + id(r)}
                    checked={selected.includes(id(r))}
                    onChange={(e) =>
                      setSelected((s) =>
                        e.target.checked
                          ? [...s, id(r)]
                          : s.filter((x) => x !== id(r)),
                      )
                    }
                  />
                </td>
                <td>
                  {tab === "reviews" ? (
                    <>
                      {r.agent_id}
                      <small>
                        {r.period} · {r.statement_id}
                      </small>
                    </>
                  ) : (
                    <>
                      {r.instruction_id}
                      <small>
                        {r.payment_id
                          ? "关联付款：" + r.payment_id
                          : "尚未创建付款"}
                      </small>
                    </>
                  )}
                </td>
                <td>
                  {statusNames[
                    tab === "reviews"
                      ? r.approval_status
                      : r.claim_status || r.status
                  ] ||
                    (tab === "reviews"
                      ? r.approval_status
                      : r.claim_status || r.status)}
                  {r.error_code && <small>{r.error_code}</small>}
                </td>
                <td>
                  {tab === "reviews"
                    ? displayMoney(r.total_minor, r.currency)
                    : displayMoney(r.amount.minor_units, r.amount.currency)}
                </td>
                <td>{r.remark || "—"}</td>
                <td>
                  {tab === "reviews" ? (
                    <>
                      {r.approval_status === "PENDING" && (
                        <>
                          <button
                            disabled={busy}
                            onClick={() => review("APPROVE", [r])}
                          >
                            单笔通过
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => review("REJECT", [r])}
                          >
                            取消派发
                          </button>
                        </>
                      )}
                      {r.approval_status === "APPROVED" && (
                        <button disabled={busy} onClick={() => open(r)}>
                          准备派发
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      {r.status === "DRAFT" && (
                        <>
                          <button disabled={busy} onClick={() => open(r, true)}>
                            调整金额与备注
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => act("RELEASE", [r])}
                          >
                            提交派发
                          </button>
                        </>
                      )}
                      {["DRAFT", "BLOCKED", "CLAIMABLE"].includes(r.status) && (
                        <button
                          disabled={busy}
                          onClick={() => act("CANCEL", [r])}
                        >
                          取消草稿
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p>暂无记录，请选择条件后查询。</p>}
      </div>
      {next && (
        <button disabled={busy} onClick={() => guarded(() => load(next))}>
          下一页
        </button>
      )}
      {draft && (
        <div role="dialog" aria-label="派发金额编辑" className="review-editor">
          <h3>{draft.editing ? "调整派发" : "准备派发"}</h3>
          {!draft.editing && (
            <label>
              派发方式
              <select
                aria-label="派发方式"
                value={deliveryMode}
                onChange={(e) => setDeliveryMode(e.target.value)}
              >
                <option value="MEMBER_CLAIM">会员主动领取</option>
                <option value="DIRECT">后台直接派发</option>
              </select>
            </label>
          )}
          {!draft.editing && (
            <label>
              收款位置
              <select
                aria-label="收款位置"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                <option value="wallet">真金钱包</option>
                <option value="sandbox">沙箱通道（测试）</option>
              </select>
            </label>
          )}
          <label>
            本次派发金额
            <input
              aria-label="本次派发金额"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            派发备注
            <textarea
              aria-label="派发备注"
              maxLength={1000}
              value={draftRemark}
              onChange={(e) => setDraftRemark(e.target.value)}
            />
          </label>
          <p>
            少派部分仍保留佣金权益。保存后需提交；会员领取模式提交后进入待领取，由会员本人操作。
          </p>
          <button disabled={busy} onClick={save}>
            保存草稿
          </button>
          <button disabled={busy} onClick={() => setDraft(null)}>
            关闭
          </button>
        </div>
      )}
      {results.length > 0 && (
        <div aria-label="逐项处理结果">
          <h3>处理结果</h3>
          <ul>
            {results.map((r) => (
              <li key={r.resource_id}>
                {r.resource_id}：
                {r.http_status < 300
                  ? "已受理"
                  : r.response?.error?.code || "处理失败"}
                {r.response?.data?.execution_status === "FAILED"
                  ? "（审核执行失败，请处理后恢复）"
                  : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p>
        待审核、已提交派发与渠道到账是不同状态。已提交渠道或结果未知的付款应先核验，不能直接取消。
      </p>
    </section>
  );
}
