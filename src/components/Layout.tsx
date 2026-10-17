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
          <span className="logo small-logo">佣</span>
          <span>
            佣金分润<small>管理系统</small>
          </span>
        </a>
        <div className="nav-label">管理后台</div>
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
          <span className="status-dot" /> 本地测试环境
          <small>
            结算时区：UTC
            <br />
            付款仅用于测试
          </small>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            管理后台 <span className="muted"> / </span> {group.name}
          </span>
          <div>
            <span className="scope-pill">本地应用</span>
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
          {children}

        </main>
      </div>
    </div>
  );
}
