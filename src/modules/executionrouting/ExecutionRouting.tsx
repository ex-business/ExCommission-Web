import { useEffect, useState } from "react";
import type { Session } from "../../auth/Login";
import { ApiError, request } from "../../lib/api";
import { commandKey } from "../../lib/idempotency";

type Rule = {
  id: string;
  source_id: string;
  event_kind: string;
  engine: "GENERAL" | "AFFILIATE";
  effective_from: string;
};
type Config = { rules: Rule[] };
const base = "/v1/execution-routing";
const engineName = (engine: string) =>
  engine === "GENERAL" ? "通用方案" : "代理返佣";

export function ExecutionRouting({
  session,
  onExpired,
  onApproval,
}: {
  session: Session;
  onExpired: () => void;
  onApproval: (id: string) => void;
}) {
  const [revision, setRevision] = useState(0);
  const [published, setPublished] = useState<Rule[]>([]);
  const [drafts, setDrafts] = useState<Rule[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [approval, setApproval] = useState("");
  const [records, setRecords] = useState<Record<string, any>[]>([]);
  const [sample, setSample] = useState({
    source_id: "sandbox",
    event_kind: "BET_SETTLED",
    business_time: "",
  });
  const [preview, setPreview] = useState<any>();
  const canWrite = session.role === "operator";
  // 输入和草稿变化后丢弃旧预览，避免把上次判断当成当前切流结果。
  useEffect(() => setPreview(undefined), [sample, published, drafts]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      const err = e as ApiError;
      setError(
        err.data?.error?.code === "STATE_CONFLICT"
          ? "执行路由或业务归属发生冲突，请刷新配置并核对原归属。"
          : err.message || "请求失败",
      );
      if (err.status === 401) onExpired();
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    await run(async () => {
      const head = (await request(base + "/config")).data;
      const rows = (await request(base + "/records")).data.rows;
      setRevision(head.revision);
      setPublished(head.config.rules || []);
      setRecords(rows);
      setDrafts([]);
      setLoaded(true);
    });
  }
  useEffect(() => {
    void load();
  }, []);
  const config: Config = { rules: [...published, ...drafts] };
  const update = (index: number, field: keyof Rule, value: string) =>
    setDrafts((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  return (
    <section>
      <div className="panel-heading">
        <h2>执行路由</h2>
        <button disabled={busy} onClick={() => void load()}>
          刷新
        </button>
      </div>
      <p>
        按来源、标准事件类型和业务发生时间指定计佣引擎。已发布规则保留，只能追加未来生效的规则；已受理业务维持原归属。
      </p>
      {error && <p role="alert">{error}</p>}
      {approval && (
        <p role="status">
          申请已提交，等待独立审批。
          <button onClick={() => onApproval(approval)}>查看审批</button>
        </p>
      )}
      <h3>已发布规则 · 修订 {revision}</h3>
      <table>
        <thead>
          <tr>
            <th>规则编号</th>
            <th>来源</th>
            <th>标准事件类型</th>
            <th>执行引擎</th>
            <th>生效时间</th>
          </tr>
        </thead>
        <tbody>
          {published.map((row) => (
            <tr key={row.id}>
              <td>{row.id}</td>
              <td>{row.source_id}</td>
              <td>{row.event_kind}</td>
              <td>{engineName(row.engine)}</td>
              <td>{row.effective_from}</td>
            </tr>
          ))}
          {!published.length && (
            <tr>
              <td colSpan={5}>
                尚未配置，继续使用原接入入口，并校验执行归属。
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {canWrite && (
        <fieldset disabled={busy || !loaded}>
          <legend>追加规则</legend>
          {drafts.map((row, index) => (
            <fieldset key={index}>
              <legend>规则 {index + 1}</legend>
              <div className="parameter-grid">
                <label className="field">
                  规则编号
                  <input
                    value={row.id}
                    onChange={(e) => update(index, "id", e.target.value)}
                    maxLength={128}
                  />
                </label>
                <label className="field">
                  来源编号
                  <input
                    value={row.source_id}
                    onChange={(e) => update(index, "source_id", e.target.value)}
                    maxLength={128}
                  />
                </label>
                <label className="field">
                  标准事件类型
                  <input
                    value={row.event_kind}
                    onChange={(e) =>
                      update(index, "event_kind", e.target.value)
                    }
                    maxLength={128}
                  />
                </label>
                <label className="field">
                  执行引擎
                  <select
                    value={row.engine}
                    onChange={(e) => update(index, "engine", e.target.value)}
                  >
                    <option value="AFFILIATE">代理返佣</option>
                    <option value="GENERAL">通用方案</option>
                  </select>
                </label>
                <label className="field">
                  生效时间（含时区）
                  <input
                    value={row.effective_from}
                    placeholder="2026-11-01T00:00:00Z"
                    onChange={(e) =>
                      update(index, "effective_from", e.target.value)
                    }
                  />
                </label>
              </div>
              <button
                onClick={() =>
                  setDrafts((rows) => rows.filter((_, i) => i !== index))
                }
              >
                移除此草稿
              </button>
            </fieldset>
          ))}
          <button
            onClick={() =>
              setDrafts((rows) => [
                ...rows,
                {
                  id: "",
                  source_id: "",
                  event_kind: "",
                  engine: "AFFILIATE",
                  effective_from: "",
                },
              ])
            }
          >
            添加规则
          </button>
          <label className="field">
            申请原因
            <textarea
              value={reason}
              maxLength={1000}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            className="primary"
            disabled={!drafts.length || !reason.trim()}
            onClick={() =>
              void run(async () => {
                const result = await request(base + "/config-requests", {
                  method: "POST",
                  body: { expected_revision: revision, config, reason },
                  csrf: session.csrf,
                  key: await commandKey(
                    session.subject + ":" + (session.site_id || ""),
                    "execution-routing-request",
                    JSON.stringify({
                      expected_revision: revision,
                      config,
                      reason,
                    }),
                  ),
                });
                setApproval(result.data.approval_id);
              })
            }
          >
            提交独立审批
          </button>
        </fieldset>
      )}
      <fieldset disabled={busy || !loaded}>
        <legend>检查业务归属</legend>
        <p>检查当前规则与草稿，不接收事实、不计算佣金、不修改既有归属。</p>
        <div className="parameter-grid">
          <label className="field">
            来源编号
            <input
              value={sample.source_id}
              onChange={(e) =>
                setSample({ ...sample, source_id: e.target.value })
              }
            />
          </label>
          <label className="field">
            标准事件类型
            <input
              value={sample.event_kind}
              onChange={(e) =>
                setSample({ ...sample, event_kind: e.target.value })
              }
            />
          </label>
          <label className="field">
            业务发生时间（含时区）
            <input
              value={sample.business_time}
              placeholder="2026-11-01T00:00:00Z"
              onChange={(e) =>
                setSample({ ...sample, business_time: e.target.value })
              }
            />
          </label>
        </div>
        <button
          disabled={!sample.business_time}
          onClick={() =>
            void run(async () =>
              setPreview(
                (
                  await request(base + "/preview", {
                    method: "POST",
                    body: { config, ...sample },
                    csrf: session.csrf,
                    key: await commandKey(
                      session.subject + ":" + (session.site_id || ""),
                      "execution-routing-preview",
                      JSON.stringify({ config, ...sample }),
                    ),
                  })
                ).data,
              ),
            )
          }
        >
          检查
        </button>
        {preview && (
          <p role="status">
            {preview.matched
              ? `采用${engineName(preview.rule.engine)}，规则 ${preview.rule.id}`
              : "未命中配置，沿用原接入入口并校验执行归属。"}
          </p>
        )}
      </fieldset>
      <h3>最近执行归属</h3>
      <table>
        <thead>
          <tr>
            <th>来源</th>
            <th>事件编号</th>
            <th>业务单号</th>
            <th>执行引擎</th>
            <th>路由 / 修订</th>
            <th>业务时间</th>
          </tr>
        </thead>
        <tbody>
          {records.map((row, index) => (
            <tr key={index}>
              <td>{row.source_id}</td>
              <td>{row.event_id}</td>
              <td>{row.business_id}</td>
              <td>{engineName(row.engine)}</td>
              <td>
                {row.route_id === "LEGACY" ? "原入口" : row.route_id} /{" "}
                {row.config_revision}
              </td>
              <td>{row.business_time}</td>
            </tr>
          ))}
          {!records.length && (
            <tr>
              <td colSpan={6}>暂无归属记录。</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
