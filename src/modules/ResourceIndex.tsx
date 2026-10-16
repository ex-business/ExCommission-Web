import { useState } from "react";
import { getIndex, type IndexEntry } from "../lib/storage";
export function ResourceIndex({
  version,
  onOpen,
}: {
  version: number;
  onOpen: (entry: IndexEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  const entries = getIndex();
  return (
    <details
      className="resource-index"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        最近访问 <span className="badge">{entries.length}</span>
        <span className="muted">仅显示当前浏览器访问过的记录</span>
      </summary>
      <div className="index-content">
        {entries.length ? (
          <>
            <div className="index-grid">
              {entries.map((e) => (
                <button key={e.field + e.id} onClick={() => onOpen(e)}>
                  <span>{e.title}</span>
                  <code>{e.id}</code>
                  <small>{e.time}</small>
                </button>
              ))}
            </div>
            <button
              className="danger-text"
              onClick={() => {
                localStorage.removeItem("ec-index-v1");
                setOpen(false);
              }}
            >
              清除访问记录
            </button>
          </>
        ) : (
          <p className="muted">
            暂无访问记录。查询或新建记录后，可在这里再次打开。
          </p>
        )}
      </div>
    </details>
  );
}
