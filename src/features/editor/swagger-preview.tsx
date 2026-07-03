import { Component, type ReactNode } from "react";
import SwaggerUI from "swagger-ui-react";
import { hasOpenApiRoot, parseDocument } from "@/lib/openapi";
import "swagger-ui-react/swagger-ui.css";

class PreviewBoundary extends Component<
  { resetKey: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (this.state.failed) {
      return <Notice text="预览渲染失败，请检查文档结构。" tone="error" />;
    }
    return this.props.children;
  }
}

function Notice({ text, tone }: { text: string; tone: "error" | "info" }) {
  return (
    <div
      className={`p-4 text-sm ${tone === "error" ? "text-destructive" : "text-muted-foreground"}`}
    >
      {text}
    </div>
  );
}

export function SwaggerPreview({ source }: { source: string }) {
  const result = parseDocument(source);
  if (!result.ok) {
    return <Notice text={`解析失败：${result.error}`} tone="error" />;
  }
  if (!hasOpenApiRoot(result.doc)) {
    return <Notice text="缺少 openapi/swagger 顶级字段，暂不渲染预览。" tone="info" />;
  }
  return (
    <PreviewBoundary resetKey={source}>
      <SwaggerUI spec={result.doc} />
    </PreviewBoundary>
  );
}
