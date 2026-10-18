import {PagedTable} from '../../components/PagedTable';
import { useEffect, useState } from "react";
import type { Session } from "../../auth/Login";
import { ApiError, request } from "../../lib/api";
import { commandKey } from "../../lib/idempotency";

type Rule = {
  event_type: string;
  schema_version: string;
  target_kind: string;
  fields: Record<string, string>;
  amount_unit: string;
  currency_scale: number;
};
type Source = {
  source_id: string;
  name: string;
  enabled: boolean;
  subject_id: string;
  member_source_id: string;
  key_ref: string;
  rules: Rule[];
};
type Config = { sources: Source[] };
type State = { revision: number; config: Config };
const base = "/v1/affiliate/ingestion";
const fields: Record<string, string> = {
  event_id: "事件编号",
  business_id: "原业务单号",
  external_user_id: "会员编号",
  currency: "币种",
  amount_minor: "原始金额",
  valid_bet_minor: "有效投注金额",
  venue_type_id: "场馆类型",
  business_time: "业务时间",
  ip_hash: "IP摘要（可选）",
  device_hash: "设备摘要（可选）",
  account_hash: "共享账户摘要（可选）",
};
const freshRule = (): Rule => ({
  event_type: "deposit.success",
  schema_version: "1",
  target_kind: "DEPOSIT_SUCCEEDED",
  fields: {
    event_id: "eventId",
    business_id: "orderNo",
    external_user_id: "memberId",
    currency: "currency",
    amount_minor: "amount",
    business_time: "occurredAt",
  },
  amount_unit: "MINOR",
  currency_scale: 2,
});
export function DataIngestion({
  session,
  onExpired,
  onApproval,
}: {
  session: Session;
  onExpired: () => void;
  onApproval: (id: string) => void;
}) {
  const [head, setHead] = useState<State>();
  const [config, setConfig] = useState<Config>({ sources: [] });
  const [keys, setKeys] = useState<string[]>([]);
  const [tab, setTab] = useState("config");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [approval, setApproval] = useState("");
  const [reviewID, setReviewID] = useState("");
  const [review, setReview] = useState<any>();
  const [records, setRecords] = useState<any[]>([]);
  const [sample, setSample] = useState(
    '{\n  "source_id": "sports",\n  "event_type": "deposit.success",\n  "schema_version": "1",\n  "data": {\n    "eventId": "event-001",\n    "orderNo": "order-001",\n    "memberId": "member-001",\n    "currency": "USD",\n    "amount": "100",\n    "occurredAt": "2026-10-17T00:00:00Z"\n  }\n}',
  );
  const [preview, setPreview] = useState<any>();
  const canWrite = session.role === "operator";
  // 草稿或样例变化后旧转换不再代表当前输入。请求期间禁止切换栏目和编辑样例。
  useEffect(() => { setPreview(undefined); }, [config, sample]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      const err = e as ApiError;
      setError(err.message || "请求失败");
      if (err.status === 401) onExpired();
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    await run(async () => {
      const [state, refs] = await Promise.all([
        request(base + "/config"),
        request(base + "/key-refs"),
      ]);
      setHead(state.data);
      setConfig(structuredClone(state.data.config));
      setKeys(refs.data.key_refs);
    });
  }
  useEffect(() => {
    void load();
  }, []);
  function patchSource(index: number, patch: Partial<Source>) {
    setConfig((c) => ({
      ...c,
      sources: c.sources.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  }
  function patchRule(si: number, ri: number, patch: Partial<Rule>) {
    const s = config.sources[si];
    patchSource(si, {
      rules: s.rules.map((r, i) => (i === ri ? { ...r, ...patch } : r)),
    });
  }
  async function post(path: string, body: unknown) {
    return request(base + path, {
      method: "POST",
      body,
      csrf: session.csrf,
      key: await commandKey(
        session.subject,
        "ingestion" + path,
        JSON.stringify(body),
      ),
    });
  }
  return (
    <section className="ingestion-workspace" aria-label="数据接入管理">
      <h2>数据接入管理</h2>
      <div className="tabs" aria-label="数据接入栏目">
        {[
          ["config", "来源与事件"],
          ["preview", "映射预览"],
          ["records", "接入记录"],
          ["review", "配置审批"],
        ].map(([id, title]) => (
          <button
            key={id}
            disabled={busy}
            className={tab === id ? "selected" : ""}
            onClick={() => {
              setTab(id);
              if (id === "records")
                void run(async () =>
                  setRecords((await request(base + "/records")).data.rows),
                );
            }}
          >
            {title}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="error-box">
          {error}。请核对配置；模块未开放时请管理员检查接入开关。
        </p>
      )}
      {tab === "config" && (
        <>
          <div className="ingestion-toolbar">
            <span>当前发布修订：{head?.revision ?? "—"}</span>
            <button disabled={busy} onClick={() => void load()}>
              重新读取
            </button>
          </div>
          <p className="muted">
            旧sandbox接入保留。已发布的事件版本和会员映射不能覆盖；修改映射请新增版本。新来源开始计入日结关账检查。
          </p>
          {!keys.length && (
            <p className="info">
              暂无本站密钥引用。请管理员部署私有密钥后重新读取，页面不会显示或保存密钥。
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (!head) throw new Error("请先读取配置");
                const r = await post("/config-requests", {
                  config,
                  expected_revision: head.revision,
                  reason,
                });
                setApproval(r.data.approval_id);
                setReviewID(r.data.approval_id);
              });
            }}
          >
            <fieldset disabled={busy || !canWrite} className="ingestion-editor">
              {config.sources.map((s, si) => {
                const published = head?.config.sources.find(
                  (x) => x.source_id === s.source_id,
                );
                return (
                  <section className="ingestion-source" key={si}>
                    <h3>
                      来源 {si + 1} · {s.name || "未命名"}
                    </h3>
                    <div className="ingestion-fields">
                      <label>
                        来源编号
                        <input
                          required
                          value={s.source_id}
                          disabled={!!published}
                          onChange={(e) =>
                            patchSource(si, { source_id: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        来源名称
                        <input
                          required
                          value={s.name}
                          onChange={(e) =>
                            patchSource(si, { name: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        服务主体编号
                        <input
                          required
                          value={s.subject_id}
                          disabled={!!published}
                          onChange={(e) =>
                            patchSource(si, { subject_id: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        会员注册来源编号
                        <input
                          required
                          value={s.member_source_id}
                          disabled={!!published}
                          onChange={(e) =>
                            patchSource(si, {
                              member_source_id: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        本站密钥引用
                        <select
                          required
                          value={s.key_ref}
                          onChange={(e) =>
                            patchSource(si, { key_ref: e.target.value })
                          }
                        >
                          <option value="">请选择</option>
                          {[
                            ...new Set([...keys, s.key_ref].filter(Boolean)),
                          ].map((k) => (
                            <option key={k}>{k}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={s.enabled}
                          onChange={(e) =>
                            patchSource(si, { enabled: e.target.checked })
                          }
                        />
                        允许接收新事件
                      </label>
                    </div>
                    {s.rules.map((r, ri) => {
                      const locked = published?.rules.some(
                        (x) =>
                          x.event_type === r.event_type &&
                          x.schema_version === r.schema_version,
                      );
                      return (
                        <fieldset key={ri}>
                          <legend>
                            事件 {ri + 1}
                            {locked ? " · 已发布" : ""}
                          </legend>
                          <fieldset
                            disabled={locked}
                            className="ingestion-fields ingestion-rule"
                          >
                            <label>
                              外部事件名称
                              <input
                                required
                                value={r.event_type}
                                onChange={(e) =>
                                  patchRule(si, ri, {
                                    event_type: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label>
                              结构版本
                              <input
                                required
                                value={r.schema_version}
                                onChange={(e) =>
                                  patchRule(si, ri, {
                                    schema_version: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label>
                              内部业务事实
                              <select
                                value={r.target_kind}
                                onChange={(e) => {
                                  const kind = e.target.value;
                                  const next = { ...r.fields };
                                  if (kind === "BET_SETTLED") {
                                    next.valid_bet_minor ||= "validAmount";
                                    next.venue_type_id ||= "venueType";
                                  } else {
                                    delete next.valid_bet_minor;
                                    delete next.venue_type_id;
                                  }
                                  patchRule(si, ri, {
                                    target_kind: kind,
                                    fields: next,
                                  });
                                }}
                              >
                                <option value="DEPOSIT_SUCCEEDED">
                                  充值成功
                                </option>
                                <option value="BET_SETTLED">投注已结算</option>
                                <option value="WITHDRAWAL_SUCCEEDED">
                                  提现成功（统计）
                                </option>
                              </select>
                            </label>
                            <label>
                              来源金额单位
                              <select
                                value={r.amount_unit}
                                onChange={(e) =>
                                  patchRule(si, ri, {
                                    amount_unit: e.target.value,
                                  })
                                }
                              >
                                <option value="MINOR">最小货币单位</option>
                                <option value="MAJOR">主货币单位</option>
                              </select>
                            </label>
                            <label>
                              货币小数位
                              <input
                                required
                                type="number"
                                min="0"
                                max="18"
                                value={r.currency_scale}
                                onChange={(e) =>
                                  patchRule(si, ri, {
                                    currency_scale: Number(e.target.value),
                                  })
                                }
                              />
                            </label>
                            {Object.entries(fields)
                              .filter(
                                ([key]) =>
                                  r.target_kind === "BET_SETTLED" ||
                                  ![
                                    "valid_bet_minor",
                                    "venue_type_id",
                                  ].includes(key),
                              )
                              .map(([key, title]) => (
                                <label key={key}>
                                  {title}字段路径
                                  <input
                                    required={!key.endsWith("_hash")}
                                    placeholder={key}
                                    value={r.fields[key] || ""}
                                    onChange={(e) => {
                                      const next = { ...r.fields };
                                      if (e.target.value)
                                        next[key] = e.target.value;
                                      else delete next[key];
                                      patchRule(si, ri, { fields: next });
                                    }}
                                  />
                                </label>
                              ))}
                          </fieldset>
                          {locked ? (
                            <button
                              type="button"
                              onClick={() =>
                                patchSource(si, {
                                  rules: [
                                    ...s.rules,
                                    {
                                      ...structuredClone(r),
                                      schema_version:
                                        r.schema_version + "-next",
                                    },
                                  ],
                                })
                              }
                            >
                              复制为新版本
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                patchSource(si, {
                                  rules: s.rules.filter((_, i) => i !== ri),
                                })
                              }
                            >
                              移除未发布事件
                            </button>
                          )}
                        </fieldset>
                      );
                    })}
                    <div className="ingestion-toolbar">
                      <button
                        type="button"
                        onClick={() =>
                          patchSource(si, { rules: [...s.rules, freshRule()] })
                        }
                      >
                        添加事件类型
                      </button>
                      {!published && (
                        <button
                          type="button"
                          onClick={() =>
                            setConfig((c) => ({
                              ...c,
                              sources: c.sources.filter((_, i) => i !== si),
                            }))
                          }
                        >
                          移除未发布来源
                        </button>
                      )}
                    </div>
                  </section>
                );
              })}
              <button
                type="button"
                onClick={() =>
                  setConfig((c) => ({
                    ...c,
                    sources: [
                      ...c.sources,
                      {
                        source_id: "",
                        name: "",
                        enabled: true,
                        subject_id: "",
                        member_source_id: "sandbox",
                        key_ref: keys[0] || "",
                        rules: [freshRule()],
                      },
                    ],
                  }))
                }
              >
                添加来源
              </button>
              <label className="field">
                变更原因
                <textarea
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button className="primary" disabled={!head}>
                提交配置审批
              </button>
            </fieldset>
          </form>
          {approval && (
            <p role="status">
              已提交：{approval}，待另一位审批人处理。
              <button onClick={() => onApproval(approval)}>查看审批</button>
            </p>
          )}
        </>
      )}
      {tab === "preview" && (
        <>
          <p>
            使用当前页面草稿转换样例，仅校验映射，不保存事实、不计佣、不入账。金额和编号必须是字符串，字段路径支持a.b形式。
          </p>
          <label className="field">
            外部事件样例
            <textarea
              rows={15}
              disabled={busy}
              value={sample}
              onChange={(e) => { setSample(e.target.value); setPreview(undefined); }}
            />
          </label>
          <button
            disabled={busy || !canWrite}
            onClick={() =>
              void run(async () => {
                // 每次重新转换先清理旧结果，失败时不把旧事实当作本次预览。
                setPreview(undefined);
                setPreview(
                  (
                    await post("/preview", {
                      config,
                      envelope: JSON.parse(sample),
                    })
                  ).data,
                );
              })
            }
          >
            预览转换
          </button>
          {preview && <pre>{JSON.stringify(preview, null, 2)}</pre>}
        </>
      )}
      {tab === "records" && (
        <>
          <p>
            最近100条已提交到业务事务的接入记录。失败请求不产生奖励，按请求号查询安全审计；原事件可使用原签名和幂等键重试。
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () =>
                setRecords((await request(base + "/records")).data.rows),
              )
            }
          >
            刷新记录
          </button>
          <div className="table-scroll">
            <PagedTable>
              <thead>
                <tr>
                  {[
                    "来源",
                    "事件编号",
                    "业务单号",
                    "事件类型 / 版本",
                    "配置修订",
                    "结果",
                    "接收时间",
                  ].map((x) => (
                    <th key={x}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.source_id + r.event_id}>
                    <td>{r.source_id}</td>
                    <td>{r.event_id}</td>
                    <td>{r.business_id}</td>
                    <td>
                      {r.event_type} / {r.schema_version}
                    </td>
                    <td>{r.config_revision}</td>
                    <td>
                      {{
                        ACCEPTED: "已接入",
                        DUPLICATE: "重复业务",
                        LATE_ADJUSTMENT: "迟到调整",
                      }[r.status as string] || r.status}
                    </td>
                    <td>{r.received_at}</td>
                  </tr>
                ))}
              </tbody>
            </PagedTable>
            {!records.length && <p>暂无接入记录</p>}
          </div>
        </>
      )}
      {tab === "review" && (
        <>
          <label className="field">
            配置申请编号
            <input
              value={reviewID}
              onChange={(e) => setReviewID(e.target.value)}
            />
          </label>
          <button
            disabled={busy || !reviewID}
            onClick={() =>
              void run(async () =>
                setReview(
                  (
                    await request(
                      base + "/config-requests/" + encodeURIComponent(reviewID),
                    )
                  ).data,
                ),
              )
            }
          >
            读取待审配置
          </button>
          {review && (
            <>
              <p>
                申请人：{review.approval.applicant_id} · 状态：
                {review.approval.approval_status}
              </p>
              <details>
                <summary>查看配置内容</summary>
                <pre>{JSON.stringify(review.change, null, 2)}</pre>
              </details>
              <button onClick={() => onApproval(review.approval.approval_id)}>
                前往独立审批
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
