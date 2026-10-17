import { useEffect, useState } from "react";
import { operations } from "./catalog";
import { Login, type Session } from "./auth/Login";
import { request, setOpsSite } from "./lib/api";
import { Layout } from "./components/Layout";
import type { Seed } from "./modules/OperationPanel";
import { MemberPortal } from "./modules/member/MemberPortal";
import { GuestAffiliate } from "./modules/member/affiliate/GuestAffiliate";
import { AdminWorkspace } from "./admin/AdminWorkspace";
export default function App() {
  const [showLogin, setShowLogin] = useState(false);
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [op, setOp] = useState(
      operations.find((o) => o.title === "代理业务总表") || operations[0],
    ),
    [seed, setSeed] = useState<Seed>(),
    [serial, setSerial] = useState(0);
  useEffect(() => {
    request("/auth/session")
      .then((r) => {
        setOpsSite(r.data.ops ? r.data.site_id || "" : undefined);
        setSession(r.data);
      })
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
  if (!session)
    return (
      <Login
        onLogin={(s) => {
          setOpsSite(s.ops ? s.site_id || "" : undefined);
          setSession(s);
        }}
      />
    );
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
      <AdminWorkspace
        op={op}
        session={session}
        seed={seed}
        serial={serial}
        onNavigate={navigate}
        onExpired={() => setSession(null)}
      />
    </Layout>
  );
}
