import { slugify } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Clickable PIC avatar badge — manually entered initials (uppercase, 1–3 chars)
 * rendered as [JS] Jane Smith. Used on application and server details.
 */
export function PicBadge({
  id,
  name,
  initials,
  onClick,
  showName = true,
  className,
}: {
  id: string;
  name: string;
  initials?: string | null;
  onClick: (id: string) => void;
  showName?: boolean;
  className?: string;
}) {
  const label = (initials ?? name.slice(0, 2)).toUpperCase();
  return (
    <button
      type="button"
      data-testid={`pic-badge-${slugify(name)}`}
      onClick={() => onClick(id)}
      title={`View ${name}'s details`}
      aria-label={`View ${name}'s details`}
      className={cn(
        "group inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-sm transition-[border-color,background-color] duration-150 hover:border-sky-400/70 hover:bg-sky-50 dark:hover:border-sky-500/60 dark:hover:bg-sky-950/40",
        className,
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-semibold text-white dark:bg-sky-600">
        {label}
      </span>
      {showName && <span className="font-medium text-foreground">{name}</span>}
    </button>
  );
}
