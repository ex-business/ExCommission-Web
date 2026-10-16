export const systemOperations: string[][] = [
  [
    "system",
    "权限管理",
    "主体权限",
    "GET",
    "/v1/identity/subjects/{id}/permissions",
  ],
  [
    "system",
    "权限管理",
    "申请权限变更",
    "POST",
    "/v1/permission-change-requests",
  ],
  ["system", "安全审计", "审计日志", "GET", "/v1/audit-logs"],
  [
    "system",
    "安全审计",
    "安全事件处理",
    "POST",
    "/v1/security-events/{id}/handling-records",
  ],
  ["system", "公共设置", "当前目录", "GET", "/v1/platform/catalogs"],
  ["system", "连接管理", "组件与连接", "GET", "/v1/platform/components"],
  [
    "system",
    "公共设置",
    "申请设置变更",
    "POST",
    "/v1/platform-setting-requests",
  ],
  ["system", "通知收件箱", "本地通知", "GET", "/v1/notifications"],
];
