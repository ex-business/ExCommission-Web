import { useEffect, useState, type ReactNode } from "react";
import { groups, operations, type Operation } from "../catalog";
import { NavigationIcon } from "./NavigationIcon";
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
  const [menuCollapsed, setMenuCollapsed] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(op.group);
  // 导航展开状态与业务选择分离，折叠菜单不跳页、不清空尚未提交的表单。
  useEffect(() => {
    setExpandedGroup(op.group);
  }, [op.group]);
  const group = groups.find((g) => g.id === op.group)!;
  // 身份接入只决定接口授权，保留原后台全部业务菜单，避免功能入口因登录方式改变而丢失。
  const navOps = operations;
  const navGroups = groups;
  return (
    <div className={"app-shell" + (menuCollapsed ? " menu-collapsed" : "")}>
      <aside className="sidebar" id="business-navigation">
        <a className="brand" href="#agents">
          <span className="logo small-logo">佣</span>
          <span className="brand-title">
            {session.ops ? "代理业务" : "佣金分润"}
            <small>管理系统</small>
          </span>
        </a>
        <div className="nav-label">管理后台</div>
        <nav aria-label="主导航">
          {navGroups.map((g) => (
            <div className="nav-group" key={g.id}>
              <button
                className={"nav-main " + (op.group === g.id ? "active" : "")}
                aria-label={g.name}
                title={menuCollapsed ? g.name : undefined}
                aria-expanded={!menuCollapsed && expandedGroup === g.id}
                aria-controls={"nav-sections-" + g.id}
                onClick={() => {
                  // 收起时保留图标入口，点击图标先展开栏目，不触发业务导航。
                  if (menuCollapsed) {
                    setMenuCollapsed(false);
                    setExpandedGroup(g.id);
                  } else
                    setExpandedGroup((current) =>
                      current === g.id ? null : g.id,
                    );
                }}
              >
                <span className="nav-icon">
                  <NavigationIcon name={g.id} />
                </span>
                <span className="nav-title">{g.name}</span>
                <span
                  className={
                    "nav-arrow" + (expandedGroup === g.id ? " is-open" : "")
                  }
                >
                  <NavigationIcon name="chevron" />
                </span>
              </button>
              {!menuCollapsed && expandedGroup === g.id && (
                <div className="subnav" id={"nav-sections-" + g.id}>
                  {[
                    ...new Set(
                      navOps
                        .filter((o) => o.group === g.id)
                        .map((o) => o.section),
                    ),
                  ].map((section) => (
                    <button
                      className={op.section === section ? "selected" : ""}
                      key={section}
                      onClick={() =>
                        onSelect(
                          navOps.find(
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
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="topbar-location">
            <button
              type="button"
              className="menu-toggle"
              aria-label={menuCollapsed ? "展开菜单" : "折叠菜单"}
              aria-expanded={!menuCollapsed}
              aria-controls="business-navigation"
              title={menuCollapsed ? "展开菜单" : "折叠菜单"}
              onClick={() => setMenuCollapsed((current) => !current)}
            >
              <NavigationIcon name={menuCollapsed ? "expand" : "collapse"} />
            </button>
            管理后台 <span className="muted"> / </span> {group.name}
          </span>
          <div style={session.ops ? { whiteSpace: "nowrap" } : undefined}>
            {session.ops ? (
              <select
                style={{
                  width: "auto",
                  maxWidth: "min(40vw, 240px)",
                  flexShrink: 0,
                }}
                aria-label="当前站点"
                value={session.site_id || ""}
                onChange={async (e) => {
                  // 切站由服务端校验并更新独立业务会话，刷新清除原站点结果和表单。
                  const r = await fetch("/auth/site", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "X-CSRF-Token": session.csrf,
                    },
                    body: JSON.stringify({ site_id: e.target.value }),
                  });
                  if (r.ok) location.reload();
                  else window.alert("切换站点失败，请重新登录");
                }}
              >
                {(session.sites || []).map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="scope-pill">本地应用</span>
            )}
            <span className="avatar">
              {session.ops
                ? session.name?.slice(0, 1) || "运"
                : session.role === "operator"
                  ? "申"
                  : "审"}
            </span>
            <span>
              {session.ops
                ? session.name
                : session.role === "operator"
                  ? "业务申请人"
                  : "独立审批人"}
            </span>
            <button className="link-button" onClick={onLogout}>
              退出 / 切换身份
            </button>
          </div>
        </header>
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
