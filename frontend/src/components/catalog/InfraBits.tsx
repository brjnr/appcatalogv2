import { slugify } from "@/lib/types";
import { cn } from "@/lib/utils";

const SERVER_STATUS_STYLES: Record<string, string> = {
  Active:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300",
  Maintenance:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300",
  Decommissioned:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300",
  Inactive:
    "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400",
};

export function InfraStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      data-testid={`infra-status-${slugify(status)}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        SERVER_STATUS_STYLES[status] ?? "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {status}
    </span>
  );
}

/** Label/value row used throughout the server and PIC drawers. */
export function DetailRow({
  label,
  value,
  testid,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  testid?: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd
        data-testid={testid}
        className={cn(
          "mt-0.5 break-words text-sm text-foreground",
          mono && "font-mono text-[13px]",
        )}
      >
        {value?.trim() ? value : "—"}
      </dd>
    </div>
  );
}
