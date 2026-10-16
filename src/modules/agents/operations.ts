export const agentsOperations: string[][] = [
  ["agents", "代理与关系", "创建代理", "POST", "/v1/agents"],
  ["agents", "代理与关系", "代理详情", "GET", "/v1/agents/{id}"],
  ["agents", "代理与关系", "历史祖先链", "GET", "/v1/agents/{id}/ancestors"],
  [
    "agents",
    "代理与关系",
    "申请关系迁移",
    "POST",
    "/v1/relationship-change-requests",
  ],
  ["agents", "资格与等级", "申请资格变更", "POST", "/v1/grade-change-requests"],
  ["agents", "资格与等级", "等级评估", "POST", "/v1/grade-evaluations"],
  [
    "agents",
    "代理与关系",
    "申请状态变更",
    "POST",
    "/v1/agent-status-change-requests",
  ],
];
