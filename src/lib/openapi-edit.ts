export type EditPath = (string | number)[];
export type Edit = { path: EditPath; value: unknown } | { path: EditPath; delete: true };

export function detectJsonIndent(source: string): number | "\t" {
  const match = source.match(/\n([ \t]+)\S/);
  if (!match) {
    return 2;
  }
  const ws = match[1];
  if (ws.startsWith("\t")) {
    return "\t";
  }
  return ws.length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function applyJsonEdit(root: unknown, edit: Edit): void {
  const { path } = edit;
  if (path.length === 0) {
    throw new Error("空路径不支持");
  }
  let node: unknown = root;
  for (const seg of path.slice(0, -1)) {
    if (Array.isArray(node)) {
      node = node[seg as number];
    } else if (isRecord(node)) {
      node = node[seg as string];
    } else {
      throw new Error(`路径无法定位：${path.join("/")}`);
    }
  }
  const last = path[path.length - 1];
  if (Array.isArray(node)) {
    const index = last as number;
    if ("delete" in edit) {
      node.splice(index, 1);
    } else {
      node[index] = edit.value;
    }
  } else if (isRecord(node)) {
    const key = last as string;
    if ("delete" in edit) {
      delete node[key];
    } else {
      node[key] = edit.value;
    }
  } else {
    throw new Error(`路径无法定位：${path.join("/")}`);
  }
}

export async function applyEdits(
  source: string,
  language: "yaml" | "json",
  edits: Edit[],
): Promise<string> {
  if (language === "yaml") {
    const { parseDocument } = await import("yaml");
    const doc = parseDocument(source);
    if (doc.errors.length > 0) {
      throw new Error(doc.errors[0].message);
    }
    for (const edit of edits) {
      if ("delete" in edit) {
        doc.deleteIn(edit.path);
      } else {
        doc.setIn(edit.path, edit.value);
      }
    }
    return doc.toString({ lineWidth: 0 });
  }
  const root = JSON.parse(source) as unknown;
  for (const edit of edits) {
    applyJsonEdit(root, edit);
  }
  return `${JSON.stringify(root, null, detectJsonIndent(source))}\n`;
}
