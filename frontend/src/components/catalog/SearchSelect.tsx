import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface PickerOption {
  id: string;
  label: string;
  hint?: string;
}

interface SearchSelectProps {
  value: string; // "" = the allOption
  onChange: (value: string) => void;
  options: PickerOption[];
  placeholder?: string;
  allLabel?: string; // when provided, an entry that clears the selection
  testid: string;
  className?: string;
}

/**
 * Small searchable dropdown (popover + filter input + option list). Used where a plain
 * <Select> would be unwieldy — department pickers with many entries.
 */
export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = "Search…",
  allLabel,
  testid,
  className,
}: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.label.toLowerCase().includes(q));
  }, [options, query]);

  const current = options.find((option) => option.id === value);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            data-testid={`${testid}-trigger`}
            aria-label={placeholder}
            className={cn("h-9 min-w-52 justify-between font-normal", className)}
          >
            <span className="truncate">{current?.label ?? allLabel ?? placeholder}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-64 p-0">
        <div className="relative border-b p-2">
          <Search
            className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            data-testid={`${testid}-search`}
            aria-label="Filter options"
            placeholder={placeholder}
            className="h-8 pl-7 text-sm"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1" data-testid={`${testid}-options`}>
          {allLabel && (
            <OptionRow
              label={allLabel}
              selected={value === ""}
              testid={`${testid}-option-all`}
              onSelect={() => {
                onChange("");
                setOpen(false);
              }}
            />
          )}
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">No match.</p>
          ) : (
            filtered.map((option) => (
              <OptionRow
                key={option.id}
                label={option.label}
                hint={option.hint}
                selected={option.id === value}
                testid={`${testid}-option-${option.id}`}
                onSelect={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
              />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function OptionRow({
  label,
  hint,
  selected,
  testid,
  onSelect,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  testid: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-muted",
        selected && "bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
      )}
    >
      <Check
        className={cn("h-3.5 w-3.5 shrink-0", selected ? "opacity-100" : "opacity-0")}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="shrink-0 text-[11px] text-muted-foreground">{hint}</span>}
    </button>
  );
}

interface MultiSearchSelectProps {
  values: string[]; // [] = the emptyLabel state (e.g. "Everyone")
  onChange: (values: string[]) => void;
  options: PickerOption[];
  placeholder?: string;
  emptyLabel?: string;
  testid: string;
  className?: string;
}

/**
 * Multi-select flavour of SearchSelect: a searchable dropdown where several options can be
 * ticked (note sharing across departments). An empty selection shows `emptyLabel`.
 */
export function MultiSearchSelect({
  values,
  onChange,
  options,
  placeholder = "Search…",
  emptyLabel = "Everyone",
  testid,
  className,
}: MultiSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.label.toLowerCase().includes(q));
  }, [options, query]);

  const label =
    values.length === 0
      ? emptyLabel
      : options
          .filter((option) => values.includes(option.id))
          .map((option) => option.label)
          .join(", ") || `${values.length} selected`;

  const toggle = (id: string) =>
    onChange(values.includes(id) ? values.filter((value) => value !== id) : [...values, id]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            data-testid={`${testid}-trigger`}
            aria-label={placeholder}
            className={cn("h-9 w-full justify-between font-normal", className)}
          >
            <span className="truncate">{label}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-72 p-0">
        <div className="relative border-b p-2">
          <Search
            className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            data-testid={`${testid}-search`}
            aria-label="Filter options"
            placeholder={placeholder}
            className="h-8 pl-7 text-sm"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1" data-testid={`${testid}-options`}>
          <OptionRow
            label={emptyLabel}
            selected={values.length === 0}
            testid={`${testid}-option-everyone`}
            onSelect={() => onChange([])}
          />
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">No match.</p>
          ) : (
            filtered.map((option) => (
              <OptionRow
                key={option.id}
                label={option.label}
                hint={option.hint}
                selected={values.includes(option.id)}
                testid={`${testid}-option-${option.id}`}
                onSelect={() => toggle(option.id)}
              />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
