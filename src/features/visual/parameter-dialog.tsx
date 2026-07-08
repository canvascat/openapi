import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Edit } from "@/lib/openapi-edit";

export interface ParameterFormValue {
  name: string;
  location: string;
  type: string;
  required: boolean;
  description: string;
}

const EMPTY: ParameterFormValue = {
  name: "",
  location: "query",
  type: "string",
  required: false,
  description: "",
};

const LOCATIONS = ["query", "path", "header", "cookie"];
const TYPES = ["string", "number", "integer", "boolean", "array", "object"];

export function ParameterDialog({
  open,
  onOpenChange,
  mode,
  basePath,
  existingCount,
  initial,
  index,
  isPathLevel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  basePath: (string | number)[];
  existingCount: number;
  initial?: ParameterFormValue;
  index?: number;
  isPathLevel?: boolean;
  onSubmit: (edits: Edit[]) => void;
}) {
  const [form, setForm] = useState<ParameterFormValue>(initial ?? EMPTY);

  useEffect(() => {
    if (open) {
      setForm(initial ?? EMPTY);
    }
  }, [open, initial]);

  const set = <K extends keyof ParameterFormValue>(key: K, value: ParameterFormValue[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function handleSubmit() {
    if (form.name.trim() === "") {
      return;
    }
    if (mode === "create") {
      onSubmit([
        {
          path: [...basePath, existingCount],
          value: {
            name: form.name.trim(),
            in: form.location,
            required: form.required,
            description: form.description,
            schema: { type: form.type },
          },
        },
      ]);
    } else if (index !== undefined) {
      const row = [...basePath, index];
      onSubmit([
        { path: [...row, "name"], value: form.name.trim() },
        { path: [...row, "in"], value: form.location },
        { path: [...row, "required"], value: form.required },
        { path: [...row, "description"], value: form.description },
        { path: [...row, "schema", "type"], value: form.type },
      ]);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "添加参数" : "编辑参数"}</DialogTitle>
          {isPathLevel && (
            <DialogDescription className="text-destructive">
              该参数定义在路径级，修改将影响此路径下所有接口。
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="param-name">名称</Label>
            <Input
              id="param-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>位置</Label>
            <Select value={form.location} onValueChange={(v) => set("location", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCATIONS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>类型</Label>
            <Select value={form.type} onValueChange={(v) => set("type", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="param-required"
              checked={form.required}
              onCheckedChange={(v) => set("required", v)}
            />
            <Label htmlFor="param-required">必填</Label>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="param-desc">说明</Label>
            <Textarea
              id="param-desc"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={form.name.trim() === ""} onClick={handleSubmit}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
