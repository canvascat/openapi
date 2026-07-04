export interface LintDiagnostic {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  code: string;
  severity: "error" | "warning" | "info";
}

export type SpectralSeverity = 0 | 1 | 2 | 3;

export function mapSeverity(s: number): LintDiagnostic["severity"] {
  if (s === 0) {
    return "error";
  }
  if (s === 1) {
    return "warning";
  }
  return "info";
}

export interface RawResult {
  code: string | number;
  message: string;
  severity: number;
  range: {
    start: { line: number; character: number };
    end?: { line: number; character: number };
  };
}

export function mapSpectralResult(raw: RawResult): LintDiagnostic {
  const start = raw.range.start;
  const end = raw.range.end ?? start;
  return {
    line: start.line + 1,
    column: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
    message: raw.message,
    code: String(raw.code),
    severity: mapSeverity(raw.severity),
  };
}

export function severityRank(s: LintDiagnostic["severity"]): number {
  return s === "error" ? 0 : s === "warning" ? 1 : 2;
}
