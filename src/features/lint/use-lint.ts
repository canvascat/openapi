import { useEffect, useState } from "react";
import type { LintDiagnostic } from "./diagnostics";
import { lintDocument } from "./spectral";

export type LintStatus = "idle" | "linting" | "error";

export function useLint(source: string): {
  diagnostics: LintDiagnostic[];
  status: LintStatus;
} {
  const [diagnostics, setDiagnostics] = useState<LintDiagnostic[]>([]);
  const [status, setStatus] = useState<LintStatus>("idle");

  useEffect(() => {
    let cancelled = false;
    setStatus("linting");
    lintDocument(source)
      .then((result) => {
        if (!cancelled) {
          setDiagnostics(result);
          setStatus("idle");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDiagnostics([]);
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  return { diagnostics, status };
}
