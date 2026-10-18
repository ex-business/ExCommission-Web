export type Task = {
  task_id: string;
  program_id: string;
  program_revision: number;
  business_day: string;
  timezone: string;
  due_at: string;
  status: string;
  phase: string;
  reason: string;
  missing_watermarks: { source_id: string; business_day: string }[];
  completed_units: number;
  total_units: number;
  attempts: number;
  consecutive_failures: number;
  created_at: string;
  updated_at: string;
  checked_at: string;
  started_at?: string;
  finished_at?: string;
  next_retry_at?: string;
  lease_until?: string;
  retry_requested: boolean;
  last_error?: string;
  request_id?: string;
};
export type Attempt = {
  task_id: string;
  attempt: number;
  status: string;
  trigger: string;
  actor_id: string;
  reason: string;
  request_id: string;
  started_at: string;
  finished_at?: string;
  error?: string;
};
export type Rules = {
  enabled: boolean;
  watermark_wait_minutes: number;
  failure_count: number;
  overdue_minutes: number;
  auto_retry: boolean;
  max_auto_attempts: number;
  retry_base_seconds: number;
  retry_max_seconds: number;
};
export type RuleVersion = {
  revision: number;
  rules: Rules;
  approval_id?: string;
  published_at?: string;
};
export type Alert = {
  alert_id: string;
  task_id: string;
  kind: string;
  state: string;
  reason: string;
  triggered_at: string;
  resolved_at?: string;
  rule_revision: number;
};
export const states: Record<string, string> = {
  READY: "待执行",
  WAITING_TIME: "等待日结时间",
  WAITING_WATERMARK: "等待来源水位",
  RUNNING: "执行中",
  FAILED: "执行失败",
  SUCCEEDED: "已完成",
  BLOCKED: "已阻止",
  INTERRUPTED: "执行中断",
};
export const phases: Record<string, string> = {
  DISCOVERED: "已发现",
  BUSINESS_DAY_OPEN: "业务日未结束",
  CHECK_WATERMARKS: "检查来源水位",
  WAITING_DUE: "等待日结时间",
  FROZEN: "已冻结，等待结算",
  READY: "依赖已满足",
  EXECUTING: "开始执行",
  FREEZING: "冻结业务快照",
  CALCULATING: "计算会员佣金",
  SETTLING: "生成待审核单",
  SETTLED: "日结事务已完成",
  FAILED: "执行失败",
  STOPPED: "方案未启动或已停止",
  SITE_DISABLED: "站点暂停",
};
export const time = (value?: string) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        timeZone: "UTC",
        hour12: false,
      }) + " UTC"
    : "—";
export const programName = (id: string) =>
  id === "legacy" ? "原有代理方案" : id;
export const retryAllowed = (task: Task) =>
  !task.retry_requested &&
  ["FAILED", "WAITING_WATERMARK", "READY"].includes(task.status);
