export const plansOperations: string[][] = [
  ["plans", "方案发布与运行", "独立代理方案", "GET", "/v1/affiliate/programs"],
  ["plans", "方案管理", "创建方案", "POST", "/v1/plans"],
  ["plans", "方案管理", "读取方案", "GET", "/v1/plans/{id}"],
  ["plans", "方案管理", "读取草稿", "GET", "/v1/plans/{id}/draft"],
  ["plans", "方案管理", "修订草稿", "PUT", "/v1/plans/{id}/draft"],
  ["plans", "试算与发布", "试算验证", "POST", "/v1/simulations"],
  [
    "plans",
    "试算与发布",
    "申请发布",
    "POST",
    "/v1/plans/{id}/publication-requests",
  ],
  ["plans", "版本历史", "版本列表", "GET", "/v1/plans/{id}/versions"],
  [
    "plans",
    "版本历史",
    "版本详情",
    "GET",
    "/v1/plans/{id}/versions/{version_id}",
  ],
  ["plans", "版本历史", "申请回退", "POST", "/v1/plans/{id}/rollback-requests"],
];
