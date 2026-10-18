import {PagedTable} from '../../components/PagedTable';
import { useEffect, useState } from "react";
import type { Rules, RuleVersion, Alert } from "./taskModel";
import { time } from "./taskModel";
export function TaskAlerts({
  configuration,
  events,
  writable,
  busy,
  onSave,
  onApproval,
  onTask,
}: {
  configuration: RuleVersion;
  events: Alert[];
  writable: boolean;
  busy: boolean;
  onSave: (rules: Rules, reason: string) => Promise<string>;
  onApproval: (id: string) => void;
  onTask: (id: string) => void;
}) {
  const [rules, setRules] = useState(configuration.rules),
    [reason, setReason] = useState(""),
    [approval, setApproval] = useState("");
  useEffect(() => setRules(configuration.rules), [configuration.revision]);
  const fields: [keyof Rules, string, number, number][] = [
    ["watermark_wait_minutes", "水位等待告警（分钟）", 1, 10080],
    ["failure_count", "连续失败告警（次数）", 1, 100],
    ["overdue_minutes", "超期未完成告警（分钟）", 1, 43200],
    ["max_auto_attempts", "自动执行次数上限", 1, 100],
    ["retry_base_seconds", "重试基础间隔（秒）", 5, 3600],
    ["retry_max_seconds", "重试最大间隔（秒）", 5, 86400],
  ];
  return (
    <>
      <section className="panel">
        <h2>任务告警与重试配置</h2>
        <p>
          当前版本 {configuration.revision}
          。配置需独立审批；站内告警保留触发与恢复记录。人工重试仍检查原方案状态、水位和资金幂等。
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const id = await onSave(rules, reason);
            if (id) setApproval(id);
          }}
        >
          <fieldset disabled={!writable || busy}>
            <div className="task-grid">
              <label className="task-check">
                <input
                  type="checkbox"
                  checked={rules.enabled}
                  onChange={(e) =>
                    setRules((v) => ({ ...v, enabled: e.target.checked }))
                  }
                />
                启用站内告警
              </label>
              <label className="task-check">
                <input
                  type="checkbox"
                  checked={rules.auto_retry}
                  onChange={(e) =>
                    setRules((v) => ({ ...v, auto_retry: e.target.checked }))
                  }
                />
                启用失败自动重试
              </label>
              {fields.map(([key, label, min, max]) => (
                <label key={key}>
                  {label}
                  <input
                    required
                    type="number"
                    min={min}
                    max={max}
                    value={Number(rules[key])}
                    onChange={(e) =>
                      setRules((v) => ({ ...v, [key]: Number(e.target.value) }))
                    }
                  />
                </label>
              ))}
              <label>
                变更说明
                <input
                  required
                  maxLength={128}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            </div>
            <button className="primary" type="submit">
              提交独立审批
            </button>
          </fieldset>
        </form>
        {approval && (
          <button onClick={() => onApproval(approval)}>查看配置审批</button>
        )}
      </section>
      <section className="panel">
        <h2>站内告警记录（最近300条）</h2>
        <div className="table-scroll">
          <PagedTable>
            <thead>
              <tr>
                <th>类型</th>
                <th>状态</th>
                <th>任务</th>
                <th>触发时间</th>
                <th>恢复 / 解除时间</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {events.map((a, i) => (
                <tr key={a.alert_id + a.state + i}>
                  <td>
                    {{
                      WATERMARK: "水位等待超时",
                      FAILURE: "连续执行失败",
                      OVERDUE: "日结超期未完成",
                    }[a.kind as "WATERMARK"] || a.kind}
                  </td>
                  <td>{a.state === "TRIGGERED" ? "已触发" : "已解除"}</td>
                  <td title={a.task_id}>
                    <button onClick={() => onTask(a.task_id)}>
                      {a.task_id.slice(0, 12)}
                    </button>
                  </td>
                  <td>{time(a.triggered_at)}</td>
                  <td>{time(a.resolved_at)}</td>
                  <td>{a.reason}</td>
                </tr>
              ))}
            </tbody>
          </PagedTable>
          {!events.length && <p>暂无告警记录。</p>}
        </div>
      </section>
    </>
  );
}
