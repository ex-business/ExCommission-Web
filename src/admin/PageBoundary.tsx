import { Component, type ReactNode } from "react";
// 单个业务模块加载失败只替换工作区，保留导航与退出入口，避免整页空白。
export class PageBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div role="alert">
          <p>页面加载失败，请刷新后重试。</p>
          <button onClick={() => window.location.reload()}>刷新页面</button>
        </div>
      );
    return this.props.children;
  }
}
