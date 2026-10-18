import { PageBoundary } from "./PageBoundary";
import { lazy, Suspense } from "react";
import type { Session } from "../auth/Login";
import { operations, type Operation } from "../catalog";
import type { Seed } from "../modules/OperationPanel";
import { planTemplate } from "../modules/plans/template";
const TaskRuns = lazy(() =>
  import("../modules/finance/TaskRuns").then((m) => ({ default: m.TaskRuns })),
);
const Programs = lazy(() =>
  import("../modules/affiliate/Programs").then((m) => ({
    default: m.Programs,
  })),
);
const AffiliateReversals = lazy(() =>
  import("../modules/finance/AffiliateReversals").then((m) => ({
    default: m.AffiliateReversals,
  })),
);
const DataIngestion = lazy(() =>
  import("../modules/ingestion/DataIngestion").then((m) => ({
    default: m.DataIngestion,
  })),
);
const AffiliateSiteCatalog = lazy(() =>
  import("../modules/affiliate/SiteCatalog").then((m) => ({
    default: m.AffiliateSiteCatalog,
  })),
);
const AgentBusinessReport = lazy(() =>
  import("../modules/affiliate/AgentReport").then((m) => ({
    default: m.AgentBusinessReport,
  })),
);
const BusinessRewards = lazy(() =>
  import("../modules/affiliate/BusinessRewards").then((m) => ({
    default: m.BusinessRewards,
  })),
);
const BusinessSourceStatus = lazy(() =>
  import("../modules/affiliate/BusinessOperations").then((m) => ({
    default: m.BusinessSourceStatus,
  })),
);
const AgentRewardSwitch = lazy(() =>
  import("../modules/affiliate/BusinessOperations").then((m) => ({
    default: m.AgentRewardSwitch,
  })),
);
const AffiliateConfig = lazy(() =>
  import("../modules/affiliate/AffiliateConfig").then((m) => ({
    default: m.AffiliateConfig,
  })),
);
const SiteAgentConfig = lazy(() =>
  import("../modules/sites/SiteAgentConfig").then((m) => ({
    default: m.SiteAgentConfig,
  })),
);
const AgentDirectory = lazy(() =>
  import("../modules/agents/AgentDirectory").then((m) => ({
    default: m.AgentDirectory,
  })),
);
const AdminCommissionCalculator = lazy(() =>
  import("../modules/affiliate/AdminCommissionCalculator").then((m) => ({
    default: m.AdminCommissionCalculator,
  })),
);
const MemberCommissions = lazy(() =>
  import("../modules/finance/MemberCommissions").then((m) => ({
    default: m.MemberCommissions,
  })),
);
const CommissionReview = lazy(() =>
  import("../modules/finance/CommissionReview").then((m) => ({
    default: m.CommissionReview,
  })),
);
const OperationPanel = lazy(() =>
  import("../modules/OperationPanel").then((m) => ({
    default: m.OperationPanel,
  })),
);

// 这里只组合业务页面；登录、站点会话和权限由原入口及服务端处理，懒加载不作为授权边界。
export function AdminWorkspace({
  op,
  session,
  seed,
  serial,
  onNavigate,
  onExpired,
}: {
  op: Operation;
  session: Session;
  seed?: Seed;
  serial: number;
  onNavigate: (title: string, seed?: Seed) => void;
  onExpired: () => void;
}) {
  const sectionOps = operations.filter(
    (o) => o.section === op.section && o.group === op.group,
  );
  return (
    <PageBoundary key={op.key + serial}>
      <Suspense fallback={<p role="status">正在加载页面…</p>}>
        <div className="tabs" role="navigation" aria-label="业务操作">
          {sectionOps.map((o) => (
            <button
              className={o.key === op.key ? "selected" : ""}
              key={o.key}
              onClick={() => onNavigate(o.title)}
            >
              {o.title}
            </button>
          ))}
        </div>
        {op.section === "任务运行管理" ? (
          <TaskRuns
            session={session}
            onExpired={onExpired}
            onApproval={(id) => onNavigate("审批详情", { params: { id } })}
          />
        ) : op.section === "方案发布与运行" ? (
          <Programs
            session={session}
            onExpired={onExpired}
            onApproval={(id) => onNavigate("审批详情", { params: { id } })}
          />
        ) : op.title === "代理冲正记录" ? (
          <AffiliateReversals onExpired={onExpired} />
        ) : op.title === "数据接入配置" ? (
          <DataIngestion
            session={session}
            onExpired={onExpired}
            onApproval={(id) => onNavigate("审批详情", { params: { id } })}
          />
        ) : op.title === "已授权站点代理配置" ? (
          <AffiliateSiteCatalog
            session={session}
            onExpired={onExpired}
            onApproval={(id) => onNavigate("审批详情", { params: { id } })}
          />
        ) : op.section === "代理业务总表" ? (
          <AgentBusinessReport onExpired={onExpired} />
        ) : op.section === "代理业务奖励" ? (
          <BusinessRewards session={session} onExpired={onExpired} />
        ) : op.section === "代理日结" ? (
          <BusinessSourceStatus onExpired={onExpired} />
        ) : op.section === "代理奖励开关" ? (
          <AgentRewardSwitch session={session} onExpired={onExpired} />
        ) : op.title === "推荐返佣配置" || op.title === "方案变更预检接口" ? (
          <AffiliateConfig
            session={session}
            onExpired={onExpired}
            onApproval={(id) => onNavigate("审批详情", { params: { id } })}
            onIndependentPlan={(currency) =>
              onNavigate("创建方案", {
                body: {
                  ...structuredClone(planTemplate),
                  currency,
                  name: "独立代理方案",
                },
              })
            }
          />
        ) : op.title === "站点代理配置" ? (
          <SiteAgentConfig
            session={session}
            onExpired={onExpired}
            onApproval={(id) => onNavigate("审批详情", { params: { id } })}
          />
        ) : op.title === "代理总表及下线明细" ? (
          <AgentDirectory onExpired={onExpired} />
        ) : op.title === "佣金计算器" ? (
          <AdminCommissionCalculator />
        ) : op.title === "我的佣金" ? (
          <MemberCommissions session={session} onExpired={onExpired} />
        ) : op.title === "佣金审核与派发" ? (
          <CommissionReview session={session} onExpired={onExpired} />
        ) : (
          <OperationPanel
            key={op.key + serial}
            op={op}
            session={session}
            seed={seed}
            onNavigate={onNavigate}
            onResult={() => {}}
            onExpired={onExpired}
          />
        )}
      </Suspense>
    </PageBoundary>
  );
}
