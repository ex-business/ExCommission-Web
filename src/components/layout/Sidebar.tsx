import { groups, operations, type Operation } from "../../catalog";
import { NavigationIcon } from "../NavigationIcon";
// 导航仅负责展示与展开事件，不维护身份或业务权限，所有业务入口继续保留。
export function Sidebar({
  op,
  collapsed,
  expandedGroup,
  onToggleGroup,
  onSelect,
  brandTitle,
}: {
  op: Operation;
  collapsed: boolean;
  expandedGroup: string | null;
  onToggleGroup: (id: string) => void;
  onSelect: (op: Operation) => void;
  brandTitle: string;
}) {
  const navOps = operations;
  const navGroups = groups;
  return (
    <aside className="sidebar" id="business-navigation">
      <a className="brand" href="#agents">
        <span className="logo small-logo">佣</span>
        <span className="brand-title">
          {brandTitle}
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
              title={collapsed ? g.name : undefined}
              aria-expanded={!collapsed && expandedGroup === g.id}
              aria-controls={"nav-sections-" + g.id}
              onClick={() => onToggleGroup(g.id)}
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
            {!collapsed && expandedGroup === g.id && (
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
  );
}
