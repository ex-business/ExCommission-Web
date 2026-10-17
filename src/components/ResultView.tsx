import { label } from "../catalog";
import { enumLabel } from "../lib/labels";
const states: Record<string, string> = {
  PENDING: "待审批",
  APPROVED: "已批准",
  REJECTED: "已驳回",
  FAILED: "执行失败",
  SUCCEEDED: "执行成功",
  SUCCESS: "沙箱成功",
  UNKNOWN: "结果未知 · 核验原单",
  SUBMITTED: "已提交 · 等待确认",
  SUSPENDED: "已挂起 · 待补证据",
  QUEUED: "已排队",
  RUNNING: "执行中",
  ACTIVE: "正常",
  FROZEN: "已冻结",
  DEAD: "重试耗尽",
  RETRY_WAIT: "等待重试",
};
export function ResultView({
  value,
  depth = 0,
  field,
}: {
  value: any;
  depth?: number;
  field?: string;
}) {
  if (value === null || value === undefined)
    return <span className="muted">空值</span>;
  if (typeof value === "boolean") return <span>{value ? "是" : "否"}</span>;
  if (typeof value !== "object")
    return (
      <span
        className={
          states[value]
            ? "badge " +
              (["FAILED", "DEAD", "SUSPENDED", "UNKNOWN"].includes(value)
                ? "warning"
                : "")
            : ""
        }
      >
        {states[value] ||
          (field === "kind" ? enumLabel(String(value)) : String(value))}
      </span>
    );
  if (Array.isArray(value)) {
    if (!value.length) return <div className="empty small">暂无记录</div>;
    if (value.every((x) => x && typeof x === "object" && !Array.isArray(x))) {
      const keys = [...new Set(value.flatMap(Object.keys))];
      return (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {keys.map((k) => (
                  <th key={k}>{label(k)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {value.map((row, i) => (
                <tr key={i}>
                  {keys.map((k) => (
                    <td key={k}>
                      <ResultView value={row[k]} field={k} depth={depth + 1} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return (
      <div className="value-list">
        {value.map((x, i) => (
          <div key={i}>
            <ResultView value={x} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <dl className={"result-grid " + (depth ? "nested-result" : "")}>
      {Object.entries(value).map(([k, v]) => (
        <div
          className={typeof v === "object" && v !== null ? "wide" : ""}
          key={k}
        >
          <dt>{label(k)}</dt>
          <dd>
            <ResultView value={v} field={k} depth={depth + 1} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
