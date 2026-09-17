import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ENVIRONMENTS, SORT_LABELS, STATUSES } from "@/lib/types";

interface CatalogToolbarProps {
  count: number;
  total: number;
  environment: string;
  onEnvironmentChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  sort: string;
  onSortChange: (value: string) => void;
  filtersActive: boolean;
  onClearFilters: () => void;
}

const ENV_VALUE_LABELS: Record<string, string> = {
  All: "Environment: All",
  Production: "Production",
  Staging: "Staging",
  Internal: "Internal",
  Cloud: "Cloud",
  "On-Premises": "On-Premises",
};

const STATUS_VALUE_LABELS: Record<string, string> = {
  All: "Status: All",
  Active: "Active",
  Maintenance: "Maintenance",
  Deprecated: "Deprecated",
};

// Control ribbon: live result count, environment/status filters, sort. Sits between hero and list.
export function CatalogToolbar({
  count,
  total,
  environment,
  onEnvironmentChange,
  status,
  onStatusChange,
  sort,
  onSortChange,
  filtersActive,
  onClearFilters,
}: CatalogToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-5">
      <span
        data-testid="app-count-badge"
        aria-live="polite"
        className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm font-medium text-sky-700 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-300"
      >
        {count} of {total} applications
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Select value={environment} onValueChange={onEnvironmentChange}>
          <SelectTrigger
            size="sm"
            data-testid="filter-environment-dropdown"
            aria-label="Filter by environment"
            className="w-[150px]"
          >
            <SelectValue>{(v) => ENV_VALUE_LABELS[String(v)] ?? v}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All environments</SelectItem>
            {ENVIRONMENTS.map((env) => (
              <SelectItem key={env} value={env}>
                {env}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={onStatusChange}>
          <SelectTrigger
            size="sm"
            data-testid="filter-status-dropdown"
            aria-label="Filter by status"
            className="w-[140px]"
          >
            <SelectValue>{(v) => STATUS_VALUE_LABELS[String(v)] ?? v}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={onSortChange}>
          <SelectTrigger
            size="sm"
            data-testid="sort-selector-dropdown"
            aria-label="Sort applications"
            className="w-[170px]"
          >
            <SelectValue>{(v) => `Sort: ${SORT_LABELS[String(v)] ?? v}`}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SORT_LABELS).map(([id, label]) => (
              <SelectItem key={id} value={id}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {filtersActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            data-testid="clear-filters-btn"
            className="text-muted-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reset
          </Button>
        )}
      </div>
    </div>
  );
}
