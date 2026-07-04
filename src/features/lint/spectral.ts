import { type LintDiagnostic, mapSpectralResult, type RawResult } from "./diagnostics";

interface Linter {
  run: (source: string) => Promise<RawResult[]>;
}

let linterPromise: Promise<Linter> | null = null;

async function createLinter(): Promise<Linter> {
  const [core, parsers, rulesets] = await Promise.all([
    import("@stoplight/spectral-core"),
    import("@stoplight/spectral-parsers"),
    import("@stoplight/spectral-rulesets"),
  ]);
  const spectral = new core.Spectral();
  // `rulesets.oas`'s published .d.ts widens some `severity` literals (e.g. "warn")
  // to `string`, which is not assignable to `RulesetDefinition`'s severity union.
  // `new core.Ruleset(...)` accepts `unknown`, sidestepping that upstream typing
  // defect without weakening our own types or touching diagnostics.ts.
  spectral.setRuleset(new core.Ruleset(rulesets.oas));
  return {
    run: async (source: string) => {
      const document = new core.Document(source, parsers.Yaml);
      const results = await spectral.run(document);
      return results as unknown as RawResult[];
    },
  };
}

export async function lintDocument(source: string): Promise<LintDiagnostic[]> {
  if (source.trim() === "") {
    return [];
  }
  linterPromise ??= createLinter();
  const linter = await linterPromise;
  const results = await linter.run(source);
  return results.map(mapSpectralResult);
}
