import { useEffect, useRef, useState } from "react";
import type { Session } from "../../auth/Login";
import { ApiError, request } from "../../lib/api";
import { TaskDetails } from "./TaskDetails";
import { TaskAlerts } from "./TaskAlerts";
import {
  type Task,
  type Attempt,
  type RuleVersion,
  type Alert,
  type Rules,
  states,
  phases,
  time,
  programName,
  retryAllowed,
} from "./taskModel";
import "./taskRuns.css";
// 日结操作只提交原任务编号和重试原因，日期、方案版本和资金幂等键均由服务端持久化记录决定。
export function TaskRuns({
  session,
  onExpired,
  onApproval,
}: {
  session: Session;
  onExpired: () => void;
  onApproval: (id: string) => void;
}) {
  const [rows, setRows] = useState<Task[]>([]),
    [events, setEvents] = useState<Alert[]>([]),
    [configuration, setConfiguration] = useState<RuleVersion | null>(null),
    [status, setStatus] = useState(""),
    [program, setProgram] = useState(""),
    [tab, setTab] = useState("runs"),
    [detail, setDetail] = useState<{ task: Task; attempts: Attempt[] } | null>(
      null,
    ),
    [retry, setRetry] = useState<Task | null>(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const keys = useRef(new Map<string, string>()),
    generation = useRef(0);
  const writable = session.role === "operator";
  function key(fingerprint: string) {
    let value = keys.current.get(fingerprint);
    if (!value) {
      value = crypto.randomUUID();
      keys.current.set(fingerprint, value);
    }
    return value;
  }
  async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError("");
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired();
      setError(
        e instanceof ApiError && e.status === 409
          ? "任务或配置状态已变化，请刷新后检查方案状态、水位及配置版本。"
          : e instanceof Error
            ? e.message
            : "操作失败",
      );
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    const current = ++generation.current;
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (program.trim()) params.set("program_id", program.trim());
    const [r, a] = await Promise.all([
      request("/v1/affiliate/task-runs?" + params),
      request("/v1/affiliate/task-alerts"),
    ]);
    if (current !== generation.current) return;
    setRows(r.data.rows);
    setEvents(a.data.events);
    setConfiguration(a.data.configuration);
  }
  useEffect(() => {
    void guard(load);
    return () => {
      generation.current++;
    };
  }, []);
  async function open(task: Task | string) {
    await guard(async () => {
      const r = await request(
        "/v1/affiliate/task-runs/" +
          (typeof task === "string" ? task : task.task_id),
      );
      setDetail(r.data);
      setTab("runs");
    });
  }
  async function submitRetry() {
    if (!retry) return;
    await guard(async () => {
      const fingerprint = retry.task_id + ":" + reason;
      await request(
        "/v1/affiliate/task-runs/" + retry.task_id + "/retry-requests",
        {
          method: "POST",
          body: { reason },
          csrf: session.csrf,
          key: key(fingerprint),
        },
      );
      keys.current.delete(fingerprint);
      setNotice("重试已排队。缺失水位仍需来源补齐，已停止方案不会新增结算。");
      setRetry(null);
      setReason("");
      setDetail(null);
      await load();
    });
  }
  async function saveRules(rules: Rules, why: string) {
    const value = await guard(async () => {
      if (!configuration) throw new Error("请先加载配置");
      const body = {
        expected_revision: configuration.revision,
        rules,
        reason: why,
      };
      const fingerprint = JSON.stringify(body);
      const r = await request("/v1/affiliate/task-alert-config-requests", {
        method: "POST",
        body,
        csrf: session.csrf,
        key: key(fingerprint),
      });
      keys.current.delete(fingerprint);
      setNotice("告警配置申请已提交，独立审批通过后生效。");
      return r.data.approval_id as string;
    });
    return value || "";
  }
  return (
    <div className="task-manager">
      <div className="tabs">
        <button
          className={tab === "runs" ? "selected" : ""}
          onClick={() => setTab("runs")}
        >
          日结任务
        </button>
        <button
          className={tab === "alerts" ? "selected" : ""}
          onClick={() => setTab("alerts")}
        >
          告警与重试配置
        </button>
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {tab === "runs" ? (
        <>
          <section className="panel">
            <h2>任务运行管理</h2>
            <p>
              查看最近200个代理日结任务。阶段和处理人数以真实执行为准；事务确认前不代表佣金已生成。
            </p>
            <form
              className="task-toolbar"
              onSubmit={(e) => {
                e.preventDefault();
                void guard(load);
              }}
            >
              <label>
                任务状态
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">全部</option>
                  {Object.entries(states)
                    .filter(([k]) => k !== "INTERRUPTED")
                    .map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                方案编号
                <input
                  placeholder="留空查看全部；原方案为 legacy"
                  value={program}
                  onChange={(e) => setProgram(e.target.value)}
                />
              </label>
              <button disabled={busy} type="submit">
                查询 / 刷新
              </button>
            </form>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>方案 / 版本</th>
                    <th>业务日 / 时区</th>
                    <th>状态 / 阶段</th>
                    <th>缺失水位</th>
                    <th>次数 / 连续失败</th>
                    <th>最近检查 / 下次重试</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((task) => (
                    <tr key={task.task_id}>
                      <td>
                        {programName(task.program_id)}
                        <small>版本 {task.program_revision}</small>
                      </td>
                      <td>
                        {task.business_day}
                        <small>{task.timezone}</small>
                      </td>
                      <td>
                        {states[task.status]}
                        <small>{phases[task.phase] || task.phase}</small>
                        {task.retry_requested && <small>人工重试已排队</small>}
                      </td>
                      <td>
                        {task.missing_watermarks?.map((m) => (
                          <small key={m.source_id + m.business_day}>
                            {m.source_id} · {m.business_day}
                          </small>
                        ))}
                        {!task.missing_watermarks?.length ? "—" : ""}
                      </td>
                      <td>
                        {task.attempts} / {task.consecutive_failures}
                      </td>
                      <td>
                        {time(task.checked_at)}
                        <small>{time(task.next_retry_at)}</small>
                      </td>
                      <td>
                        <button onClick={() => void open(task)}>详情</button>
                        {writable && retryAllowed(task) && (
                          <button
                            disabled={busy}
                            onClick={() => {
                              setRetry(task);
                              setReason("");
                            }}
                          >
                            重试
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && (
                <p>
                  暂无匹配任务。本站 worker
                  会按已发布方案和原始业务日自动发现任务。
                </p>
              )}
            </div>
          </section>
          {detail && (
            <TaskDetails
              {...detail}
              writable={writable}
              busy={busy}
              onClose={() => setDetail(null)}
              onRetry={(task) => {
                setRetry(task);
                setReason("");
              }}
            />
          )}
        </>
      ) : (
        configuration && (
          <TaskAlerts
            configuration={configuration}
            events={events}
            writable={writable}
            busy={busy}
            onSave={saveRules}
            onApproval={onApproval}
            onTask={(id) => void open(id)}
          />
        )
      )}
      {retry && (
        <section className="panel">
          <h2>安全重试</h2>
          <p>
            {programName(retry.program_id)} / 版本 {retry.program_revision} /{" "}
            {retry.business_day}。保留原日结业务键，重新检查运行状态和水位。
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitRetry();
            }}
          >
            <label>
              重试原因
              <input
                required
                maxLength={128}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <div className="task-toolbar">
              <button className="primary" disabled={busy} type="submit">
                加入重试队列
              </button>
              <button type="button" onClick={() => setRetry(null)}>
                取消
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
