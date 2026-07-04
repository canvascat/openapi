import { AlertCircle, AlertTriangle, ChevronDown, ChevronRight, Info } from "lucide-react";
import { useState } from "react";
import type { LintDiagnostic } from "./diagnostics";
import type { LintStatus } from "./use-lint";

const severityIcon = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

export function ProblemsPanel({
  diagnostics,
  status,
  onGoto,
}: {
  diagnostics: LintDiagnostic[];
  status: LintStatus;
  onGoto: (line: number, column: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warningCount = diagnostics.filter((d) => d.severity === "warning").length;

  return (
    <div className="flex max-h-64 flex-col border-t text-sm">
      <button
        type="button"
        className="flex shrink-0 items-center gap-2 px-3 py-1.5 hover:bg-accent"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        {status === "error" ? (
          <span className="text-destructive">校验器异常，暂不可用</span>
        ) : (
          <span className="flex items-center gap-2">
            <span>{diagnostics.length === 0 ? "无校验问题" : `${diagnostics.length} 个问题`}</span>
            {errorCount > 0 && <span className="text-destructive">{errorCount} 错误</span>}
            {warningCount > 0 && <span className="text-amber-600">{warningCount} 警告</span>}
          </span>
        )}
      </button>
      {open && status !== "error" && diagnostics.length > 0 && (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {diagnostics.map((d, i) => {
            const Icon = severityIcon[d.severity];
            return (
              <li key={`${d.line}:${d.column}:${d.code}:${i}`}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-accent"
                  onClick={() => onGoto(d.line, d.column)}
                >
                  <Icon className="mt-0.5 size-4 shrink-0" />
                  <span className="flex-1">{d.message}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{d.code}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    Ln{d.line}:Col{d.column}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
