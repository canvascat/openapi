import { FileJson, Folder } from "lucide-react";

export interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[] | null;
}

export function buildFileTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const path of paths) {
    const segments = path.split("/");
    let level = root;
    let prefix = "";
    for (const [i, name] of segments.entries()) {
      prefix = prefix ? `${prefix}/${name}` : name;
      const isFile = i === segments.length - 1;
      let node = level.find((n) => n.name === name);
      if (!node) {
        node = { name, path: prefix, children: isFile ? null : [] };
        level.push(node);
      }
      if (!isFile) {
        level = node.children!;
      }
    }
  }
  const sortLevel = (nodes: TreeNode[]): TreeNode[] => {
    nodes.sort((a, b) => {
      const aDir = a.children !== null ? 0 : 1;
      const bDir = b.children !== null ? 0 : 1;
      return aDir - bDir || a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      if (n.children) {
        sortLevel(n.children);
      }
    }
    return nodes;
  };
  return sortLevel(root);
}

export function FileTree({
  nodes,
  onSelectFile,
}: {
  nodes: TreeNode[];
  onSelectFile: (path: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {nodes.map((node) => (
        <li key={node.path}>
          {node.children === null ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent"
              onClick={() => onSelectFile(node.path)}
            >
              <FileJson className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{node.name}</span>
            </button>
          ) : (
            <div>
              <div className="flex items-center gap-2 px-2 py-1 text-sm font-medium">
                <Folder className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{node.name}</span>
              </div>
              <div className="pl-4">
                <FileTree nodes={node.children} onSelectFile={onSelectFile} />
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
