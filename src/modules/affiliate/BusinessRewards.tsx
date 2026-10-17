import { MemberIdentity } from "../member/affiliate/MemberIdentity";
import { useEffect, useRef, useState } from "react";
import { request, ApiError } from "../../lib/api";
import type { Session } from "../../auth/Login";
import { amount, toMinor } from "./money";
import "./business.css";
type Row = Record<string, any>;
const kinds: Record<string, string> = {
  REFERRAL: "推荐奖励",
  INVITEE: "受邀奖励",
  COMMISSION: "每日佣金",
};
const statuses: Record<string, string> = {
  PENDING_REVIEW: "待审核",
  CLAIMABLE: "待领取",
  CLAIMED: "已领取",
  CANCELLED: "已取消",
};
const localInput = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
export function BusinessRewards({
  session,
  onExpired,
}: {
  session: Session;
  onExpired: () => void;
}) {
  const [kind, setKind] = useState("REFERRAL"),
    [status, setStatus] = useState(""),
    [user, setUser] = useState(""),
    [rewardID, setRewardID] = useState(""),
    [claimID, setClaimID] = useState(""),
    [claimIP, setClaimIP] = useState(""),
    [businessDay, setBusinessDay] = useState(""),
    [sort, setSort] = useState("time_desc"),
    [timeField, setTimeField] = useState("unlocked_at"),
    [from, setFrom] = useState(localInput(new Date(Date.now() - 7 * 86400000))),
    [to, setTo] = useState(localInput(new Date(Date.now() + 60000))),
    [page, setPage] = useState<Row | null>(null),
    [config, setConfig] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [detail, setDetail] = useState<Row | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [decision, setDecision] = useState(""),
    [reason, setReason] = useState(""),
    [adjust, setAdjust] = useState(false),
    [adjustment, setAdjustment] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const sequence = useRef(0),
    keys = useRef(new Map<string, string>()),
    querySnapshot = useRef<Record<string, string> | null>(null);
  const scale = config?.current?.config.currency_scale ?? 2;
  function parameters(after = "", frozen = false, initial = false) {
    // 翻页及导出复用已展示结果的完整查询，输入框未提交的编辑不改变快照。
    if ((after || frozen) && querySnapshot.current) {
      const saved = new URLSearchParams(querySnapshot.current);
      if (after) saved.set("after_id", after);
      return saved;
    }
    const q = new URLSearchParams({
      kind,
      sort: initial
        ? kind === "COMMISSION"
          ? "amount_desc"
          : "time_desc"
        : sort,
      time_field: timeField,
      limit: "50",
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
    });
    if (initial && kind === "COMMISSION") {
      q.set("status", "PENDING_REVIEW");
      q.set("period", "yesterday");
    } else {
      if (status) q.set("status", status);
      if (businessDay && kind === "COMMISSION")
        q.set("business_day", businessDay);
    }
    if (!initial && rewardID.trim()) q.set("reward_id", rewardID.trim());
    if (!initial && claimID.trim()) q.set("claim_id", claimID.trim());
    if (!initial && claimIP.trim()) q.set("claim_ip", claimIP.trim());
    if (user.trim()) q.set("user_id", user.trim());
    return q;
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function load(after = "", initial = false) {
    const serial = ++sequence.current;
    await run(async () => {
      const q = parameters(after, false, initial);
      const data = await request("/v1/affiliate/rewards?" + q);
      if (serial === sequence.current) {
        q.delete("after_id");
        q.set("as_of", data.data.as_of);
        q.set("snapshot_revision", String(data.data.snapshot_revision));
        querySnapshot.current = Object.fromEntries(q);
        setPage(data.data);
        setSelected([]);
      }
    });
  }
  useEffect(() => {
    void run(async () => {
      setConfig((await request("/v1/affiliate/config")).data);
    });
  }, []);
  useEffect(() => {
    querySnapshot.current = null;
    setPage(null);
    setSelected([]);
    setDetail(null);
    setDecision("");
    setStatus(kind === "COMMISSION" ? "PENDING_REVIEW" : "");
    setSort(kind === "COMMISSION" ? "amount_desc" : "time_desc");
    setRewardID("");
    setClaimID("");
    setClaimIP("");
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: config?.current?.config.timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const day = new Date(today + "T12:00:00Z");
    day.setUTCDate(day.getUTCDate() - 1);
    setBusinessDay(kind === "COMMISSION" ? day.toISOString().slice(0, 10) : "");
    void load("", true);
    return () => {
      sequence.current++;
    };
  }, [kind]);
  async function open(row: Row) {
    await run(async () => {
      const result = (await request("/v1/affiliate/rewards/" + row.reward_id))
        .data;
      setDetail({
        ...result,
        reward: { ...result.reward, profile: row.profile },
      });
      setDecision("");
      setReason("");
      setAdjust(false);
      setAdjustment("");
      setConfirmed(false);
    });
  }
  function reviewKey(id: string, body: Row) {
    const signature = JSON.stringify([id, body]);
    let key = keys.current.get(signature);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(signature, key);
    }
    return key;
  }
  async function review(rows: Row[], allowAdjustment = false) {
    if (!confirmed || !reason.trim()) {
      setError("请填写审核备注并确认操作");
      return;
    }
    await run(async () => {
      const results = await Promise.allSettled(
        rows.map(async (row) => {
          const body: Row = {
            decision,
            expected_revision: row.revision,
            reason: reason.trim(),
          };
          if (decision === "APPROVE" && adjust && allowAdjustment)
            body.amount_minor = toMinor(adjustment, scale);
          await request(
            "/v1/affiliate/commissions/" + row.reward_id + "/review",
            {
              method: "POST",
              body,
              key: reviewKey(row.reward_id, body),
              csrf: session.csrf,
            },
          );
        }),
      );
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failures = results.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      setNotice(`已完成 ${succeeded} 笔，未完成 ${failures.length} 笔。`);
      if (failures.length)
        setError(
          failures.map((r) => String(r.reason?.message || r.reason)).join("；"),
        );
      setDetail(null);
      setDecision("");
      await load();
      if (failures.length)
        setError(
          failures.map((r) => String(r.reason?.message || r.reason)).join("；"),
        );
    });
  }
  async function download() {
    await run(async () => {
      const q = parameters("", true);
      if (page) {
        q.set("as_of", page.as_of);
        q.set("snapshot_revision", page.snapshot_revision);
      }
      const result = await request("/v1/affiliate/rewards/export?" + q);
      const link = document.createElement("a"),
        url = URL.createObjectURL(
          new Blob(["\ufeff" + String(result.data).replace(/^\ufeff/, "")], {
            type: "text/csv;charset=utf-8",
          }),
        );
      link.href = url;
      link.download = `代理奖励-${kinds[querySnapshot.current?.kind || kind]}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  const summary = (values: Row[], label: string) => (
    <div className="af-summary">
      <strong>{label}</strong>
      {values?.map((v) => (
        <span key={v.currency}>
          {v.count} 笔 · 待领 {amount(v.claimable_minor, scale)} · 已领{" "}
          {amount(v.claimed_minor, scale)} · 待审核{" "}
          {amount(v.pending_review_minor, scale)} · 已取消{" "}
          {amount(v.cancelled_minor, scale)} {v.currency}
        </span>
      ))}
    </div>
  );
  return (
    <div className="af-admin">
      <header>
        <h2>奖励记录</h2>
      </header>
      <div className="af-tabs">
        {Object.entries(kinds).map(([id, label]) => (
          <button
            className={kind === id ? "primary" : ""}
            key={id}
            onClick={() => setKind(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <form
        className="af-filters"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label>
          派发 / 解锁订单ID
          <input
            aria-label="奖励订单ID"
            value={rewardID}
            onChange={(e) => setRewardID(e.target.value)}
            maxLength={128}
          />
        </label>
        <label>
          领取订单ID
          <input
            value={claimID}
            onChange={(e) => setClaimID(e.target.value)}
            maxLength={128}
          />
        </label>
        <label>
          领取IP
          <input
            value={claimIP}
            onChange={(e) => setClaimIP(e.target.value)}
            maxLength={64}
          />
        </label>
        {kind === "COMMISSION" && (
          <label>
            佣金统计日期
            <input
              type="date"
              value={businessDay}
              onChange={(e) => setBusinessDay(e.target.value)}
            />
          </label>
        )}
        <label>
          查询时间口径
          <select
            value={timeField}
            onChange={(e) => setTimeField(e.target.value)}
          >
            <option value="unlocked_at">派发 / 解锁时间</option>
            <option value="claimed_at">领取时间</option>
          </select>
        </label>
        <label>
          排序
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="time_desc">时间倒序</option>
            <option value="amount_desc">金额从大到小</option>
          </select>
        </label>
        <label>
          开始时间
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
          />
        </label>
        <label>
          结束时间（不含）
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
          />
        </label>
        <label>
          会员编号
          <input value={user} onChange={(e) => setUser(e.target.value)} />
        </label>
        <label>
          状态
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">全部</option>
            {Object.entries(statuses).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" disabled={busy}>
          查询
        </button>
        <button
          type="button"
          disabled={busy || !page || session.role !== "operator"}
          onClick={() => void download()}
        >
          导出本次查询
        </button>
      </form>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {page && (
        <>
          {summary(page.summary, "全部条件汇总")}
          {summary(page.page_summary, "当前页汇总")}
          <p className="muted">
            观察时点 {new Date(page.as_of).toLocaleString()}
          </p>
          <div className="af-table">
            <table>
              <thead>
                <tr>
                  <th>选择</th>
                  <th>会员 / 代理</th>
                  <th>业务</th>
                  <th>金额</th>
                  <th>状态</th>
                  <th>解锁 / 领取时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((row: Row) => (
                  <tr key={row.reward_id}>
                    <td>
                      <input
                        aria-label={`选择奖励 ${row.reward_id}`}
                        type="checkbox"
                        checked={selected.includes(row.reward_id)}
                        disabled={
                          kind !== "COMMISSION" ||
                          !["PENDING_REVIEW", "CLAIMABLE"].includes(row.status)
                        }
                        onChange={(e) =>
                          setSelected((previous) =>
                            e.target.checked
                              ? [...previous, row.reward_id]
                              : previous.filter((id) => id !== row.reward_id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <MemberIdentity id={row.user_id} profile={row.profile} />
                    </td>
                    <td>
                      <small>{row.reward_id}</small>
                      <small>领取：{row.claim_id || "—"}</small>
                      {row.business_day ||
                        (row.step ? `第 ${row.step} 档` : "本人一次奖励")}
                    </td>
                    <td>
                      {amount(row.amount_minor, scale)} {row.currency}
                    </td>
                    <td>{statuses[row.status]}</td>
                    <td>
                      {new Date(
                        row.claimed_at || row.unlocked_at,
                      ).toLocaleString()}
                    </td>
                    <td>
                      <button disabled={busy} onClick={() => void open(row)}>
                        详情{row.status === "PENDING_REVIEW" ? " / 审核" : ""}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!page.rows.length && <p>暂无符合条件的奖励</p>}
          {page.next_after_id && (
            <button
              disabled={busy}
              onClick={() => void load(page.next_after_id)}
            >
              下一页
            </button>
          )}
        </>
      )}
      {kind === "COMMISSION" && selected.length > 0 && (
        <section className="af-card">
          <h3>批量审核（{selected.length} 笔）</h3>
          <label>
            操作
            <select
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
            >
              <option value="">请选择</option>
              <option value="APPROVE">通过待审核记录</option>
              <option value="CANCEL">取消未领取记录</option>
            </select>
          </label>
          <label>
            备注
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            确认逐笔执行所选操作
          </label>
          <button
            className="primary"
            disabled={busy || !decision || session.role !== "approver"}
            onClick={() =>
              void review(
                page?.rows.filter((r: Row) => selected.includes(r.reward_id)) ||
                  [],
              )
            }
          >
            执行批量审核
          </button>
        </section>
      )}
      {detail && (
        <div className="affiliate-overlay" onClick={() => setDetail(null)}>
          <section
            className="af-card affiliate-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="代理奖励详情"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="affiliate-toolbar">
              <h2>{kinds[detail.reward.kind]}详情</h2>
              <button onClick={() => setDetail(null)}>关闭</button>
            </div>
            <p>
              {statuses[detail.reward.status]} ·{" "}
              {amount(detail.reward.amount_minor, scale)}{" "}
              {detail.reward.currency}
            </p>
            <dl>
              <dt>奖励编号</dt>
              <dd>{detail.reward.reward_id}</dd>
              <dt>配置版本</dt>
              <dd>{detail.reward.config_revision}</dd>
              <dt>原计算金额</dt>
              <dd>{amount(detail.reward.calculated_minor, scale)}</dd>
              <dt>审核人 / 时间</dt>
              <dd>
                {detail.reward.reviewer_id || "—"} /{" "}
                {detail.reward.reviewed_at
                  ? new Date(detail.reward.reviewed_at).toLocaleString()
                  : "—"}
              </dd>
              <dt>领取时间 / IP</dt>
              <dd>
                {detail.reward.claimed_at
                  ? new Date(detail.reward.claimed_at).toLocaleString()
                  : "—"}{" "}
                / {detail.reward.claim_ip || "—"}
              </dd>
              <dt>备注</dt>
              <dd>{detail.reward.reason || "—"}</dd>
            </dl>
            {(detail.reward.member_qualifications || []).map((m: Row) => (
              <div className="af-card" key={m.user_id}>
                <strong>{m.user_id}</strong>
                <p>
                  充值{" "}
                  {amount(
                    m[detail.reward.kind === "INVITEE" ? "invitee" : "referral"]
                      .deposit_minor,
                    scale,
                  )}{" "}
                  · 有效业务量{" "}
                  {amount(
                    m[detail.reward.kind === "INVITEE" ? "invitee" : "referral"]
                      .valid_bet_minor,
                    scale,
                  )}
                </p>
                <p>
                  达标时间{" "}
                  {m[detail.reward.kind === "INVITEE" ? "invitee" : "referral"]
                    .qualified_at
                    ? new Date(
                        m[
                          detail.reward.kind === "INVITEE"
                            ? "invitee"
                            : "referral"
                        ].qualified_at,
                      ).toLocaleString()
                    : "—"}
                </p>
              </div>
            ))}
            {detail.daily_calculation && (
              <>
                {!!detail.daily_calculation.risk_decisions?.length && (
                  <section>
                    <h3>去重命中记录</h3>
                    <p>
                      依据此奖励保存的配置版本核算，以下事实未计入佣金业务量。
                    </p>
                    {detail.daily_calculation.risk_decisions.map((r: Row) => (
                      <p key={r.fact_id + r.rule_id}>
                        会员 {r.user_id} · 规则 {r.rule_id} · 原因{" "}
                        {(
                          {
                            IDENTITY_MISSING: "缺少识别信息",
                            DUPLICATE_IP: "重复IP",
                            DUPLICATE_DEVICE: "重复设备",
                            DUPLICATE_ACCOUNT: "重复共享账户",
                          } as Record<string, string>
                        )[r.reason] || r.reason}{" "}
                        · 事实 {r.fact_id}
                      </p>
                    ))}
                  </section>
                )}
                <h3>三层贡献明细 · 最终 Lv{detail.daily_calculation.level}</h3>
                <div className="af-table">
                  <table>
                    <thead>
                      <tr>
                        <th>会员</th>
                        <th>层级</th>
                        <th>有效业务量</th>
                        <th>费率</th>
                        <th>贡献佣金</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.daily_calculation.contributions.map((c: Row) => (
                        <tr key={`${c.user_id}:${c.depth}`}>
                          <td>{c.user_id}</td>
                          <td>{c.depth}</td>
                          <td>{amount(c.valid_bet_minor, scale)}</td>
                          <td>{amount(String(c.rate_ppm), 4)}%</td>
                          <td>{amount(c.commission_minor, scale)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {detail.reward.kind === "COMMISSION" &&
              ["PENDING_REVIEW", "CLAIMABLE"].includes(detail.reward.status) &&
              session.role === "approver" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void review([detail.reward], true);
                  }}
                >
                  <h3>独立业务审核</h3>
                  <label>
                    操作
                    <select
                      value={decision}
                      onChange={(e) => setDecision(e.target.value)}
                      required
                    >
                      <option value="">请选择</option>
                      {detail.reward.status === "PENDING_REVIEW" && (
                        <option value="APPROVE">通过并转待领取</option>
                      )}
                      <option value="CANCEL">取消派发</option>
                    </select>
                  </label>
                  {decision === "APPROVE" && (
                    <>
                      <label>
                        <input
                          type="checkbox"
                          checked={adjust}
                          onChange={(e) => setAdjust(e.target.checked)}
                        />
                        调整佣金金额
                      </label>
                      {adjust && (
                        <label>
                          调整后金额（{detail.reward.currency}，至少1）
                          <input
                            inputMode="decimal"
                            value={adjustment}
                            onChange={(e) => setAdjustment(e.target.value)}
                            required
                          />
                        </label>
                      )}
                    </>
                  )}
                  <label>
                    审核备注
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    确认金额、会员与配置依据
                  </label>
                  <button className="primary" disabled={busy || !confirmed}>
                    确认审核
                  </button>
                </form>
              )}
          </section>
        </div>
      )}
    </div>
  );
}
