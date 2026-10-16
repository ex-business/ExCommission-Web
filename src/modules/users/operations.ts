export const usersOperations: string[][] = [
  ["users", "用户与来源", "查找用户", "GET", "/v1/users/lookup"],
  ["users", "用户与来源", "同步用户", "POST", "/v1/user-sync-jobs"],
  ["users", "用户与来源", "同步结果", "GET", "/v1/user-sync-jobs/{id}"],
];
