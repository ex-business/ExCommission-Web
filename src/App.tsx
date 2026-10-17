import { GuestAffiliate } from "./modules/member/affiliate/GuestAffiliate";
import { useEffect, useState } from "react";
import { operations } from "./catalog";
import { Login, type Session } from "./auth/Login";
import { request } from "./lib/api";
import { Layout } from "./components/Layout";
import { OperationPanel, type Seed } from "./modules/OperationPanel";
import { CommissionReview } from "./modules/finance/CommissionReview";
import { AffiliateSiteCatalog } from "./modules/affiliate/SiteCatalog";
import { AgentBusinessReport } from "./modules/affiliate/AgentReport";
import { BusinessRewards } from "./modules/affiliate/BusinessRewards";
import {
  AgentRewardSwitch,
  BusinessSourceStatus,
} from "./modules/affiliate/BusinessOperations";
import { AffiliateConfig } from "./modules/affiliate/AffiliateConfig";
import { SiteAgentConfig } from "./modules/sites/SiteAgentConfig";
import { AgentDirectory } from "./modules/agents/AgentDirectory";
import { MemberPortal } from "./modules/member/MemberPortal";
import { MemberCommissions } from "./modules/finance/MemberCommissions";
export default function App() {
  const [showLogin, setShowLogin] = useState(false);
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [op, setOp] = useState(operations[0]),
    [seed, setSeed] = useState<Seed>(),
    [serial, setSerial] = useState(0);
  useEffect(() => {
    request("/auth/session")
      .then((r) => setSession(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const route = () => {
      const group = location.hash.slice(1);
      if (group) {
        const next = operations.find((o) => o.group === group);
        if (next) {
          setOp(next);
          setSeed(undefined);
          setSerial((s) => s + 1);
        }
      }
    };
    window.addEventListener("hashchange", route);
    return () => window.removeEventListener("hashchange", route);
  }, []);
  function navigate(title: string, next?: Seed) {
    const target = operations.find((o) => o.title === title);
    if (!target) return;
    setOp(target);
    setSeed(next);
    setSerial((s) => s + 1);
    window.scrollTo({ top: 0 });
  }
  if (loading) return <div className="loading-page">正在读取本地会话…</div>;
  if (
    !session &&
    !showLogin &&
    (new URLSearchParams(location.search).get("affiliate") === "1" ||
      new URLSearchParams(location.search).get("role") === "member")
  )
    return (
      <GuestAffiliate
        onLogin={() => {
          const u = new URL(location.href);
          u.searchParams.set("role", "member");
          history.replaceState(null, "", u);
          setShowLogin(true);
        }}
      />
    );
  if (!session) return <Login onLogin={setSession} />;
  if (session.role === "member")
    return (
      <MemberPortal
        session={session}
        onExpired={() => setSession(null)}
        onLogout={async () => {
          try {
            await request("/auth/logout", {
              method: "POST",
              body: {},
              csrf: session.csrf,
            });
          } finally {
            setSession(null);
          }
        }}
      />
    );
  const sectionOps = operations.filter(
    (o) => o.section === op.section && o.group === op.group,
  );
  return (
    <Layout
      op={op}
      session={session}
      onSelect={(o) => navigate(o.title)}
      onLogout={async () => {
        try {
          await request("/auth/logout", {
            method: "POST",
            body: {},
            csrf: session.csrf,
          });
        } finally {
          setSession(null);
          setSeed(undefined);
          setSerial((s) => s + 1);
        }
      }}
    >
      <div className="tabs" role="navigation" aria-label="业务操作">
        {sectionOps.map((o) => (
          <button
            className={o.key === op.key ? "selected" : ""}
            key={o.key}
            onClick={() => navigate(o.title)}
          >
            {o.title}
          </button>
        ))}
      </div>
      {op.title === "已授权站点代理配置" ? (
        <AffiliateSiteCatalog
          session={session}
          onExpired={() => setSession(null)}
          onApproval={(id) => navigate("审批详情", { params: { id } })}
        />
      ) : op.section === "代理业务总表" ? (
        <AgentBusinessReport onExpired={() => setSession(null)} />
      ) : op.section === "代理业务奖励" ? (
        <BusinessRewards session={session} onExpired={() => setSession(null)} />
      ) : op.section === "代理日结" ? (
        <BusinessSourceStatus onExpired={() => setSession(null)} />
      ) : op.section === "代理奖励开关" ? (
        <AgentRewardSwitch
          session={session}
          onExpired={() => setSession(null)}
        />
      ) : op.title === "推荐返佣配置" ? (
        <AffiliateConfig
          session={session}
          onExpired={() => setSession(null)}
          onApproval={(id) => navigate("审批详情", { params: { id } })}
        />
      ) : op.title === "站点代理配置" ? (
        <SiteAgentConfig
          session={session}
          onExpired={() => setSession(null)}
          onApproval={(id) => navigate("审批详情", { params: { id } })}
        />
      ) : op.title === "代理总表及下线明细" ? (
        <AgentDirectory onExpired={() => setSession(null)} />
      ) : op.title === "我的佣金" ? (
        <MemberCommissions
          session={session}
          onExpired={() => setSession(null)}
        />
      ) : op.title === "佣金审核与派发" ? (
        <CommissionReview
          session={session}
          onExpired={() => setSession(null)}
        />
      ) : (
        <OperationPanel
          key={op.key + serial}
          op={op}
          session={session}
          seed={seed}
          onNavigate={navigate}
          onResult={() => {}}
          onExpired={() => setSession(null)}
        />
      )}
    </Layout>
  );
}
