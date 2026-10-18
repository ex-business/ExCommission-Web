import type { Config } from "./AffiliateConfig";
import { amount } from "./money";
export type Program = {
  program_id: string;
  name: string;
  expected_revision: number;
  revision?: number;
  state: string;
  effective_from: string;
  reason: string;
  match: {
    sources: string[];
    event_types: string[];
    member_ids: string[];
    mode: string;
    group: string;
    priority: number;
  };
  config: Config;
};
export const states: Record<string, string> = {
  READY: "未启动",
  RUNNING: "运行中",
  STOPPED: "已停止",
};
export const modes: Record<string, string> = {
  STACK: "允许叠加",
  PRIORITY: "按优先级",
  EXCLUSIVE: "互斥",
};
export const localTime = (v: string) => {
  const d = new Date(v);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};

export const programMoney = (value: string, currency: string, scale: number) =>
  `${amount(value, scale)} ${currency}`;
