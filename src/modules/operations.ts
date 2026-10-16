import { spec } from "../lib/schema";
import type { Operation } from "../types";
import { plansOperations } from "./plans/operations";
import { usersOperations } from "./users/operations";
import { agentsOperations } from "./agents/operations";
import { financeOperations } from "./finance/operations";
import { reportsOperations } from "./reports/operations";
import { systemOperations } from "./system/operations";
const definitions = [
  ...plansOperations,
  ...usersOperations,
  ...agentsOperations,
  ...financeOperations,
  ...reportsOperations,
  ...systemOperations,
];
export const operations: Operation[] = definitions.map(
  ([group, section, title, method, path]) => ({
    group,
    section,
    title,
    method,
    path,
    key: method + " " + path,
    ...(spec.paths as any)[path][method.toLowerCase()],
  }),
);
