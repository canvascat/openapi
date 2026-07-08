import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Edit } from "@/lib/openapi-edit";
import type { OperationDetail, OperationSummary } from "@/lib/openapi-ir";

export function EditOperationDialog({
  open,
  onOpenChange,
  operation,
  detail,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operation: OperationSummary;
  detail: OperationDetail;
  onSubmit: (edits: Edit[]) => void;
}) {
  const [summary, setSummary] = useState(operation.summary);
  const [description, setDescription] = useState(detail.description);
  const [deprecated, setDeprecated] = useState(operation.deprecated);
  const [tags, setTags] = useState(operation.tags.join(", "));

  useEffect(() => {
    if (open) {
      setSummary(operation.summary);
      setDescription(detail.description);
      setDeprecated(operation.deprecated);
      setTags(operation.tags.join(", "));
    }
  }, [open, operation, detail]);

  function handleSubmit() {
    const base = ["paths", operation.path, operation.method] as const;
    const edits: Edit[] = [];
    if (summary !== operation.summary) {
      edits.push({ path: [...base, "summary"], value: summary });
    }
    if (description !== detail.description) {
      edits.push({ path: [...base, "description"], value: description });
    }
    if (deprecated !== operation.deprecated) {
      if (deprecated) {
        edits.push({ path: [...base, "deprecated"], value: true });
      } else {
        edits.push({ path: [...base, "deprecated"], delete: true });
      }
    }
    const nextTags = tags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t !== "");
    if (nextTags.join(",") !== operation.tags.join(",")) {
      if (nextTags.length > 0) {
        edits.push({ path: [...base, "tags"], value: nextTags });
      } else {
        edits.push({ path: [...base, "tags"], delete: true });
      }
    }
    if (edits.length > 0) {
      onSubmit(edits);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑接口</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="op-summary">摘要</Label>
            <Input id="op-summary" value={summary} onChange={(e) => setSummary(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="op-desc">描述</Label>
            <Textarea
              id="op-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="op-deprecated" checked={deprecated} onCheckedChange={setDeprecated} />
            <Label htmlFor="op-deprecated">已废弃</Label>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="op-tags">标签（逗号分隔）</Label>
            <Input id="op-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit}>确定</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
