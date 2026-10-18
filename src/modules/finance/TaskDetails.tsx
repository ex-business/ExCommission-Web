import type { Task, Attempt } from "./taskModel";
import { states, phases, time, programName, retryAllowed } from "./taskModel";
export function TaskDetails({
  task,
  attempts,
  writable,
  busy,
  onClose,
  onRetry,
}: {
  task: Task;
  attempts: Attempt[];
  writable: boolean;
  busy: boolean;
  onClose: () => void;
  onRetry: (task: Task) => void;
}) {
  return (
    <section className="panel task-details">
      <div className="task-toolbar">
        <h2>日结任务详情</h2>
        <button onClick={onClose}>关闭详情</button>
      </div>
      <dl>
        <dt>方案 / 版本</dt>
        <dd>
          {programName(task.program_id)} / {task.program_revision}
        </dd>
        <dt>业务日 / 时区</dt>
        <dd>
          {task.business_day} / {task.timezone}
        </dd>
        <dt>状态与阶段</dt>
        <dd>
          {states[task.status]} · {phases[task.phase] || task.phase}
        </dd>
        <dt>原因</dt>
        <dd>{task.reason}</dd>
        <dt>处理进度</dt>
        <dd>
          {task.total_units || task.status === "SUCCEEDED"
            ? `${task.completed_units} / ${task.total_units} 位会员（事务确认前不代表已生成权益）`
            : "按当前阶段处理"}
        </dd>
        <dt>预计日结时间</dt>
        <dd>{time(task.due_at)}</dd>
        <dt>最近检查 / 下次自动重试</dt>
        <dd>
          {time(task.checked_at)} / {time(task.next_retry_at)}
        </dd>
        <dt>任务编号</dt>
        <dd>{task.task_id}</dd>
        <dt>追踪编号</dt>
        <dd>{task.request_id || "—"}</dd>
      </dl>
      {task.last_error && (
        <p role="alert" className="error-text">
          {task.last_error}
        </p>
      )}
      <h3>缺失来源水位</h3>
      {task.missing_watermarks?.length ? (
        <ul>
          {task.missing_watermarks.map((m) => (
            <li key={m.source_id + m.business_day}>
              {m.source_id} · 业务日 {m.business_day}
            </li>
          ))}
        </ul>
      ) : (
        <p>
          {task.status === "WAITING_WATERMARK"
            ? "尚未配置有效来源，请检查数据接入配置。"
            : "当前没有缺失项。"}
        </p>
      )}
      {writable && retryAllowed(task) && (
        <button disabled={busy} onClick={() => onRetry(task)}>
          申请安全重试
        </button>
      )}
      {task.retry_requested && (
        <p role="status">
          已进入重试队列，等待本站 worker 检查依赖与运行状态。
        </p>
      )}
      <h3>执行历史（最近100次）</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>次数</th>
              <th>触发方式 / 操作人</th>
              <th>状态</th>
              <th>开始 / 结束</th>
              <th>说明 / 错误</th>
              <th>追踪编号</th>
            </tr>
          </thead>
          <tbody>
            {attempts.map((a) => (
              <tr key={a.attempt}>
                <td>{a.attempt}</td>
                <td>
                  {{ AUTO: "自动", MANUAL: "人工重试", RECOVERY: "中断恢复" }[
                    a.trigger as "AUTO"
                  ] || a.trigger}{" "}
                  / {a.actor_id}
                </td>
                <td>{states[a.status] || a.status}</td>
                <td>
                  {time(a.started_at)}
                  <br />
                  {time(a.finished_at)}
                </td>
                <td>{a.error || a.reason}</td>
                <td>{a.request_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
