import { commandKey } from "../lib/idempotency";
import { steps, PlanStep } from "./plans/PlanStep";
import { nextActions } from "./workflow";
import { notes, defaults } from "./formDefaults";
import { useEffect, useRef, useState } from "react";
import { type Operation, type Schema, label } from "../catalog";
import { SchemaField } from "../components/SchemaField";
import { ResultView } from "../components/ResultView";
import { request, resourceLinks, ApiError } from "../lib/api";
import { validate } from "../lib/validation";
import { type Session } from "../auth/Login";
export type Seed = { params?: Record<string, any>; body?: any };
type Props = {
  op: Operation;
  session: Session;
  seed?: Seed;
  onResult: (data: any) => void;
  onNavigate: (title: string, seed: Seed) => void;
  onExpired: () => void;
};
export function OperationPanel({
  op,
  session,
  seed,
  onResult,
  onNavigate,
  onExpired,
}: Props) {
  const parameters = (op.parameters || []).filter((p) => p.in !== "header");
  const schema: Schema | undefined =
    op.requestBody?.content?.["application/json"]?.schema;
  const [body, setBody] = useState<any>(() => seed?.body ?? defaults(op));
  const [params, setParams] = useState<Record<string, any>>(() =>
    Object.fromEntries(
      parameters
        .filter((p) => p.required)
        .map((p) => [
          p.name,
          seed?.params?.[p.name] ??
            (p.name === "kind"
              ? "earnings"
              : p.name === "source_id"
                ? "sandbox"
                : ""),
        ]),
    ),
  );
  const [result, setResult] = useState<any>(),
    [error, setError] = useState<any>(),
    [errors, setErrors] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [step, setStep] = useState(0),
    [json, setJson] = useState(false),
    [requestId, setRequestId] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const isPlan = op.title === "创建方案" || op.title === "修订草稿";
  const draft = op.title === "修订草稿" ? body?.draft : body;
  const changeDraft = (d: any) =>
    setBody(op.title === "修订草稿" ? { ...body, draft: d } : d);
  const reset = () => {
    setBody(defaults(op));
    setParams({});
    setResult(undefined);
    setError(undefined);
    setErrors([]);
  };
  function prepare() {
    const problems: string[] = [];
    for (const p of parameters) {
      const value = params[p.name];
      if (p.required && (value === undefined || value === ""))
        problems.push(label(p.name) + "为必填");
      else if (value !== undefined && value !== "")
        problems.push(...validate(p.schema, value));
    }
    if (schema) problems.push(...validate(schema, body));
    setErrors(problems);
    if (problems.length) return;
    if (op.method === "GET") void execute();
    else setConfirm(true);
  }
  async function execute() {
    setConfirm(false);
    setBusy(true);
    setError(undefined);
    setResult(undefined);
    setRequestId(null);
    let path = op.path;
    const query = new URLSearchParams();
    for (const p of parameters) {
      const v = params[p.name];
      if (v !== undefined && v !== "") {
        if (p.in === "path")
          path = path.replace("{" + p.name + "}", encodeURIComponent(v));
        else query.set(p.name, String(v));
      }
    }
    if (query.size) path += "?" + query;
    const key = await commandKey(
      session.subject,
      op.key,
      path + JSON.stringify(body),
    );
    try {
      const r = await request("/api" + path, {
        method: op.method,
        body: op.method === "GET" ? undefined : body,
        csrf: session.csrf,
        key,
      });
      if (!mounted.current) return;
      setRequestId(r.requestId);
      if (r.type.includes("csv") || op.title === "下载快照") {
        const url = URL.createObjectURL(
          new Blob([r.data], { type: "text/csv;charset=utf-8" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "commission-snapshot.csv";
        a.click();
        URL.revokeObjectURL(url);
        setResult({ status: "DOWNLOADED", message: "固定快照已下载" });
      } else {
        setResult(r.data);
        onResult(r.data);
      }
    } catch (e) {
      if (!mounted.current) return;
      const err = e as ApiError;
      setError(
        err.data || {
          error: {
            code: "NETWORK_UNCERTAIN",
            message:
              "网络中断，写入结果可能未知。保留此页原幂等键重试或查询原资源。",
          },
        },
      );
      setRequestId(err.requestId);
      if (err.status === 401) onExpired();
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const links = resourceLinks(result);
  const actions = nextActions(op, result, params, body);
  return (
    <div className="operation-layout">
      <section className="panel editor">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">{op.section}</span>
            <h2>{op.title}</h2>
          </div>
          <span
            className={"badge " + (op.method === "GET" ? "" : "muted-badge")}
          >
            {op.method === "GET" ? "查询" : "业务操作"}
          </span>
        </div>
        {notes[op.title] && <div className="info">{notes[op.title]}</div>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            prepare();
          }}
        >
          {parameters.length > 0 && (
            <div className="parameter-grid">
              {parameters.map((p) => (
                <div key={p.name}>
                  {!p.required && (
                    <label className="check optional">
                      <input
                        type="checkbox"
                        checked={p.name in params}
                        onChange={(e) =>
                          setParams((v) => {
                            const n = { ...v };
                            if (e.target.checked)
                              n[p.name] =
                                p.schema.type === "integer"
                                  ? p.schema.default || 20
                                  : "";
                            else delete n[p.name];
                            return n;
                          })
                        }
                      />
                      筛选{label(p.name)}
                    </label>
                  )}
                  {(p.required || p.name in params) && (
                    <SchemaField
                      schema={
                        p.name === "kind"
                          ? {
                              ...p.schema,
                              enum: ["earnings", "finance", "cost"],
                            }
                          : p.schema
                      }
                      name={p.name}
                      required={p.required}
                      value={params[p.name]}
                      onChange={(v) => setParams({ ...params, [p.name]: v })}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          {isPlan && draft && (
            <>
              <div className="steps" aria-label="方案配置步骤">
                {steps.map(([title], i) => (
                  <button
                    type="button"
                    className={step === i ? "selected" : ""}
                    key={title}
                    onClick={() => setStep(i)}
                  >
                    <span>{i + 1}</span>
                    {title}
                  </button>
                ))}
              </div>
              {op.title === "修订草稿" && (
                <SchemaField
                  schema={{ type: "integer", minimum: 0 }}
                  name="expected_revision"
                  value={body.expected_revision}
                  onChange={(v) => setBody({ ...body, expected_revision: v })}
                  required
                />
              )}
              <PlanStep draft={draft} changeDraft={changeDraft} step={step} />
              <div className="step-footer">
                <button
                  type="button"
                  disabled={step === 0}
                  onClick={() => setStep(step - 1)}
                >
                  上一步
                </button>
                <button
                  type="button"
                  disabled={step === steps.length - 1}
                  onClick={() => setStep(step + 1)}
                >
                  下一步
                </button>
              </div>
            </>
          )}
          {schema && !isPlan && (
            <SchemaField
              schema={schema}
              value={body}
              onChange={setBody}
              name="业务内容"
            />
          )}
          {!schema && !parameters.length && (
            <div className="empty">
              <div className="empty-icon">◎</div>
              <p>读取当前授权范围内的{op.title}</p>
              <small>不会使用演示数据填充结果</small>
            </div>
          )}
          {errors.length > 0 && (
            <div role="alert" className="error-box">
              <strong>请修正表单</strong>
              <ul>
                {errors.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="form-actions">
            <button className="primary" disabled={busy}>
              {busy
                ? "处理中…"
                : op.method === "GET"
                  ? "查询" + (op.title === "下载快照" ? "并下载" : "")
                  : "核对并提交"}
            </button>
            <button type="button" disabled={busy} onClick={reset}>
              重置输入
            </button>
          </div>
          <small className="muted">
            {op.method !== "GET"
              ? "原输入重试沿用会话内同一幂等键；刷新后重新输入原内容仍可核验。冲突先读取原资源。"
              : "编号查询只返回当前授权资源。"}
          </small>
        </form>
      </section>
      <section className="panel result-panel" aria-live="polite">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">服务端事实</span>
            <h2>处理结果</h2>
          </div>
          {result && (
            <button onClick={() => setJson(!json)}>
              {json ? "业务视图" : "原始响应"}
            </button>
          )}
        </div>
        {busy && <div className="loading">正在读取服务端结果…</div>}
        {error && (
          <div className="error-box" role="alert">
            <ResultView value={error} />
            <p>保留原资源、摘要和幂等键核验。失败不会显示为已生效。</p>
          </div>
        )}
        {result ? (
          json ? (
            <pre>{JSON.stringify(result, null, 2)}</pre>
          ) : (
            <ResultView value={result} />
          )
        ) : (
          !busy &&
          !error && (
            <div className="empty">
              <div className="empty-icon">▤</div>
              <p>等待查询或提交</p>
              <small>修订、摘要、执行状态以实际响应为准</small>
            </div>
          )
        )}
        {requestId && <p className="request-id">请求号：{requestId}</p>}
        {(links.length > 0 || actions.length > 0) && (
          <div className="next-actions">
            <h3>继续处理</h3>
            {actions.map((a) => (
              <button key={a.title} onClick={() => onNavigate(a.title, a.seed)}>
                {a.title} →
              </button>
            ))}
            {links.map((l) => (
              <button
                key={l.field + l.id}
                onClick={() => onNavigate(l.title, { params: { id: l.id } })}
              >
                {l.title} · {l.id.slice(0, 16)} →
              </button>
            ))}
          </div>
        )}
      </section>
      {confirm && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <h2 id="confirm-title">核对{op.title}</h2>
            <p>当前身份：{session.subject} · 本地沙箱</p>
            <p className="info">
              提交将由后端鉴权并执行。审批申请需由另一主体处理；付款仅为本地沙箱。
            </p>
            <ResultView value={{ ...params, ...body }} />
            <div className="form-actions">
              <button className="primary" onClick={() => void execute()}>
                确认提交
              </button>
              <button autoFocus onClick={() => setConfirm(false)}>
                返回修改
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
