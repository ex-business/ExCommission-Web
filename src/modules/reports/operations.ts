export const reportsOperations: string[][] = [
  ["reports", "报表查询", "查询报表", "GET", "/v1/reports/{kind}"],
  ["reports", "快照导出", "创建导出", "POST", "/v1/report-exports"],
  ["reports", "快照导出", "导出详情", "GET", "/v1/report-exports/{id}"],
  [
    "reports",
    "快照导出",
    "下载快照",
    "GET",
    "/v1/report-exports/{id}/download",
  ],
];
