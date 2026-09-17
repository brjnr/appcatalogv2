import { cn } from "@/lib/utils";
import { AppIcon } from "./AppIcon";

// Category icon: custom uploaded image when present, lucide glyph otherwise.
// Rendered everywhere a category appears (hero pills, admin pages, access matrix).
export function CategoryIcon({
  icon,
  iconUrl,
  className,
}: {
  icon: string;
  iconUrl?: string | null;
  className?: string;
}) {
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt=""
        loading="lazy"
        className={cn("h-full w-full object-contain", className)}
        aria-hidden="true"
      />
    );
  }
  return <AppIcon name={icon} className={className} />;
}
