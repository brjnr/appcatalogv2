import { ArrowDownAZ, Grid3X3, LayoutGrid, Layers, List, type LucideIcon } from "lucide-react";
import type { LayoutId } from "@/lib/types";
import { cn } from "@/lib/utils";

const LAYOUTS: { id: LayoutId; label: string; icon: LucideIcon }[] = [
  { id: "grid", label: "Grid", icon: LayoutGrid },
  { id: "list", label: "List", icon: List },
  { id: "alphabetical", label: "A–Z", icon: ArrowDownAZ },
  { id: "category", label: "Category", icon: Layers },
  { id: "compact", label: "Compact", icon: Grid3X3 },
];

interface LayoutSelectorProps {
  layout: LayoutId;
  onChange: (layout: LayoutId) => void;
}

// Icon-based 5-mode selector — switching is instant, no reload; choice persists via localStorage.
export function LayoutSelector({ layout, onChange }: LayoutSelectorProps) {
  return (
    <div
      role="group"
      aria-label="Layout"
      className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/60 p-0.5"
    >
      {LAYOUTS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          data-testid={`layout-selector-${id}`}
          title={`${label} view`}
          aria-label={`${label} view`}
          aria-pressed={layout === id}
          onClick={() => onChange(id)}
          className={cn(
            "rounded-md px-2 py-1.5 transition-[background-color,color,box-shadow] duration-150",
            layout === id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
