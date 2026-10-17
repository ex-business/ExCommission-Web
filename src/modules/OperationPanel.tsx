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
    [requestId, setRequestId] = useState<string | null>(null),
    [totp, setTotp] = useState("");
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
    setTotp("");
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
        totp,
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
  // 身份、来源签名和历史扩展契约只供接入方参考，不能把后台表单变成代注册或伪造业务事实的入口。
  if (op.section === "扩展接入目录" || op.path.startsWith("/v1/auth/") || op.path === "/v1/affiliate/business-facts" || op.path === "/v1/affiliate/source-watermarks") return (
    <section className="panel"><h2>扩展接入说明</h2><p><code>{op.method} {op.path}</code></p>
    <p>此接口由对应业务模块或受控来源调用。会员注册和登录请使用模拟用户项目的真实入口；事实与日结水位必须由来源服务签名提交。历史资格、阶梯和里程碑模块保留独立契约。</p>
    <p>当前代理闭环请使用代理配置、奖励记录及代理总表页面，避免混用不同规则模块。</p></section>
  );
  return (
    <div className="operation-layout">
      <section className="panel editor">
        <div className="panel-heading">
          <div>

            <h2>{op.title}</h2>
          </div>

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
              name="参数"
            />
          )}
          {!schema && !parameters.length && (
            <div className="empty">
              <p>点击查询</p>
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
          {op.method === "POST" &&
            (op.path.includes("/approvals/") ||
              op.path === "/v1/site-agent-config-requests") && (
              <label>
                谷歌验证码（站点配置批准或恢复时必填）
                <input
                  aria-label="谷歌验证码"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  value={totp}
                  onChange={(e) => setTotp(e.target.value)}
                />
              </label>
            )}
          <div className="form-actions">
            <button className="primary" disabled={busy}>
              {busy
                ? "处理中…"
                : op.method === "GET"
                  ? "查询" + (op.title === "下载快照" ? "并下载" : "")
                  : "提交"}
            </button>
            <button type="button" disabled={busy} onClick={reset}>
              重置
            </button>
          </div>

        </form>
      </section>
      <section className="panel result-panel" aria-live="polite">
        <div className="panel-heading">
          <div>

            <h2>结果</h2>
          </div>
          {result && (
            <button onClick={() => setJson(!json)}>
              {json ? "业务视图" : "原始响应"}
            </button>
          )}
        </div>
        {busy && <div className="loading">查询中…</div>}
        {error && (
          <div className="error-box" role="alert">
            <ResultView value={error} />
            <p>请根据提示检查记录后再操作。付款结果未知时，请查询原付款单。</p>
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
              <p>暂无数据</p>
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
            <p>
              当前身份：
              {session.role === "operator" ? "业务申请人" : "独立审批人"}
            </p>
            <p className="info">
              请确认以下内容。需要审批的操作，提交后由审批人处理。
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
