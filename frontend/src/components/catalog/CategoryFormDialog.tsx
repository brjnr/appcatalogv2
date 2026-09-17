import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, Upload } from "lucide-react";import { apiDelete, apiErrorMessage, apiPost, apiPostForm, apiPut } from "@/lib/api";
import type { AppCategory } from "@/lib/types";
import { CATEGORY_STATUSES, slugify } from "@/lib/types";
import { CategoryIcon } from "./CategoryIcon";
import { ICON_OPTIONS } from "./AppIcon";
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
import { Textarea } from "@/components/ui/textarea";

interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: AppCategory | null; // null = create mode
}

// Create/edit a category: name, description, status, lucide fallback icon,
// and a custom uploaded icon image (upload / replace / remove).
export function CategoryFormDialog({ open, onOpenChange, initial }: CategoryFormDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [iconName, setIconName] = useState("Layers");
  const [status, setStatus] = useState("active");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeIcon, setRemoveIcon] = useState(false);
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setIconName(initial?.icon ?? "Layers");
    setStatus(initial?.status ?? "active");
    setFile(null);
    setPreviewUrl(null);
    setRemoveIcon(false);
    setDimensions(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [open, initial]);

  const saveMutation = useMutation({
    mutationFn: async (payload: { name: string; description: string; icon: string; status: string }) => {
      const saved = initial
        ? await apiPut<AppCategory>(`/categories/${initial.id}`, payload)
        : await apiPost<AppCategory>("/categories", payload);
      if (removeIcon && (initial?.icon_url || initial)) {
        await apiDelete<AppCategory>(`/categories/${saved.id}/icon`).catch(() => undefined);
      }
      if (file) {
        const form = new FormData();
        form.append("file", file);
        return apiPostForm<AppCategory>(`/categories/${saved.id}/icon`, form);
      }
      return saved;
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success(initial ? "Category updated" : `Category “${saved.name}” created`);
      onOpenChange(false);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const pickFile = (selected: File | null) => {
    if (!selected) {
      setFile(null);
      setPreviewUrl(null);
      setDimensions(null);
      return;
    }
    if (selected.size > 2 * 1024 * 1024) {
      toast.error("Icon must be 2 MB or smaller");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFile(selected);
    setRemoveIcon(false);
    const url = URL.createObjectURL(selected);
    setPreviewUrl(url);

    // Icons look best square — warn (don't block) when the aspect ratio is far off.
    if (selected.type !== "image/svg+xml") {
      const img = new Image();
      img.onload = () => {
        setDimensions({ w: img.naturalWidth, h: img.naturalHeight });
        const ratio = img.naturalWidth / Math.max(1, img.naturalHeight);
        if (ratio < 0.8 || ratio > 1.25) {
          toast.warning(
            `That image is ${img.naturalWidth}×${img.naturalHeight}. Square icons (1:1) display best — it will be scaled to fit without cropping.`,
          );
        }
      };
      img.src = url;
    } else {
      setDimensions(null);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Category name is required");
      return;
    }
    saveMutation.mutate({
      name: name.trim(),
      description: description.trim(),
      icon: iconName,
      status,
    });
  };

  const shownUrl = removeIcon ? null : (previewUrl ?? initial?.icon_url ?? null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="category-form-dialog"
        className="max-h-[90svh] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>{initial ? "Edit category" : "Add category"}</DialogTitle>
          <DialogDescription>
            Categories group applications and define what normal users can access.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="category-form-name">Name</Label>
            <Input
              id="category-form-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              data-testid="category-form-name-input"
              placeholder="e.g. Security"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="category-form-description">Description</Label>
            <Textarea
              id="category-form-description"
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              data-testid="category-form-description-input"
              placeholder="What belongs in this category?"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="category-form-status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="category-form-status" data-testid="category-form-status-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s === "active" ? "Active" : "Inactive"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="category-form-icon">Fallback glyph</Label>
              <Select value={iconName} onValueChange={setIconName}>
                <SelectTrigger id="category-form-icon" data-testid="category-form-icon-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ICON_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Custom icon image</Label>
            <p className="text-xs text-muted-foreground">
              Square (1:1) works best — 128×128 px or larger. PNG, JPEG, WebP, or SVG up to 2 MB.
              Icons are scaled proportionally to fit, never cropped or stretched.
            </p>
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <span
                data-testid="category-icon-preview"
                className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/50"
              >
                <CategoryIcon
                  icon={iconName}
                  iconUrl={shownUrl}
                  className="h-7 w-7 max-h-7 max-w-7 text-sky-600 dark:text-sky-300"
                />
              </span>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="category-icon-upload-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  {shownUrl ? "Replace icon" : "Upload icon"}
                </Button>
                {shownUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-testid="category-icon-remove-btn"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      setRemoveIcon(true);
                      setFile(null);
                      setPreviewUrl(null);
                      setDimensions(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                  </Button>
                )}
                {dimensions && (
                  <span
                    data-testid="category-icon-dimensions"
                    className="self-center font-mono text-[11px] text-muted-foreground"
                  >
                    {dimensions.w}×{dimensions.h} px
                  </span>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                data-testid="category-icon-input"
                onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="category-form-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              data-testid="category-form-submit-btn"
            >
              {saveMutation.isPending
                ? "Saving…"
                : initial
                  ? "Save changes"
                  : "Create category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
