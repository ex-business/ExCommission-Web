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
        本浏览器资源索引 <span className="badge">{entries.length}</span>
        <span className="muted">仅记录已操作资源，不代表全量列表</span>
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
              清除本浏览器索引
            </button>
          </>
        ) : (
          <p className="muted">
            暂无资源。完成查询或创建后将记录资源编号，业务数据仍以后端为准。
          </p>
        )}
      </div>
    </details>
  );
}
