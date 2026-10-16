import type { ReactNode } from "react";
import { groups, operations, type Operation } from "../catalog";
import type { Session } from "../auth/Login";
export function Layout({
  op,
  session,
  onSelect,
  onLogout,
  children,
}: {
  op: Operation;
  session: Session;
  onSelect: (o: Operation) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const group = groups.find((g) => g.id === op.group)!;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#plans">
          <span className="logo small-logo">
            E<span>↗</span>
          </span>
          <span>
            ExCommission<small>佣金与分润管理</small>
          </span>
        </a>
        <div className="nav-label">工作空间</div>
        <nav aria-label="主导航">
          {groups.map((g) => (
            <div className="nav-group" key={g.id}>
              <button
                className={"nav-main " + (op.group === g.id ? "active" : "")}
                onClick={() =>
                  onSelect(operations.find((o) => o.group === g.id)!)
                }
              >
                <span>{g.icon}</span>
                {g.name}
                <span className="nav-arrow">
                  {op.group === g.id ? "⌄" : "›"}
                </span>
              </button>
              {op.group === g.id && (
                <div className="subnav">
                  {[
                    ...new Set(
                      operations
                        .filter((o) => o.group === g.id)
                        .map((o) => o.section),
                    ),
                  ].map((section) => (
                    <button
                      className={op.section === section ? "selected" : ""}
                      key={section}
                      onClick={() =>
                        onSelect(
                          operations.find(
                            (o) => o.group === g.id && o.section === section,
                          )!,
                        )
                      }
                    >
                      {section}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" /> 本地沙箱环境
          <small>
            UTC 日历 · 双身份审批
            <br />
            真实身份与银行渠道未接入
          </small>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            工作空间 <span className="muted"> / </span> {group.name}
          </span>
          <div>
            <span className="scope-pill">local-sandbox / commission</span>
            <span className="avatar">
              {session.role === "operator" ? "申" : "审"}
            </span>
            <span>
              {session.role === "operator" ? "业务申请人" : "独立审批人"}
            </span>
            <button className="link-button" onClick={onLogout}>
              退出 / 切换身份
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <span className="eyebrow">EXCOMMISSION / V1</span>
              <h1>{op.section}</h1>
              <p>{group.desc}</p>
            </div>
            <span className="badge local-badge">● 本地沙箱</span>
          </div>
          {children}
          <footer>
            ExCommission-Web · 标准 V1{" "}
            <span>批准不等于执行成功 · 沙箱结果不代表真实银行到账</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
