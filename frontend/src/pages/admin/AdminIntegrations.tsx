import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BellRing,
  BookOpen,
  MessageCircle,
  Plug,
  Send,
  Server as ServerIcon,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { apiErrorMessage, apiGet, apiPost, apiPut } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

type IntegrationKind = "jira" | "smtp" | "teams" | "telegram" | "vcenter";

interface IntegrationRow {
  kind: IntegrationKind;
  enabled: boolean;
  config: Record<string, unknown>;
  updated_at: string | null;
  has_secret: boolean;
}

interface FieldSpec {
  name: string;
  label: string;
  type?: "text" | "password" | "number" | "email";
  placeholder?: string;
  optional?: boolean;
  isCheckbox?: boolean;
  masked?: boolean; // true = server returned a hint; blank input = keep existing
}

interface Connector {
  kind: IntegrationKind;
  title: string;
  description: string;
  icon: LucideIcon;
  fields: FieldSpec[];
  liveDelivery: string; // human note about which delivery is wired live
}

// Which UI fields each connector shows. The masked flag drives the "leave
// blank to keep the current secret" behaviour required by the backend.
const CONNECTORS: Connector[] = [
  {
    kind: "smtp",
    title: "Email (SMTP)",
    description: "Outbound email for alerts and digests. Wired to send expiring-note reminders.",
    icon: BellRing,
    liveDelivery: "Live: test email + expiring-note digest",
    fields: [
      { name: "host", label: "SMTP host", placeholder: "smtp.corp.com" },
      { name: "port", label: "Port", type: "number", placeholder: "587" },
      { name: "username", label: "Username", placeholder: "alerts@corp.com" },
      { name: "password", label: "Password", type: "password", masked: true, optional: true },
      { name: "use_tls", label: "Use STARTTLS", isCheckbox: true },
      { name: "from_address", label: "From address", type: "email", placeholder: "alerts@corp.com" },
      { name: "from_name", label: "From name", placeholder: "Application Catalog" },
    ],
  },
  {
    kind: "jira",
    title: "Jira",
    description: "Link Jira issues and (later) auto-open tickets from note actions.",
    icon: ShieldCheck,
    liveDelivery: "Config-only in this release",
    fields: [
      { name: "base_url", label: "Base URL", placeholder: "https://corp.atlassian.net" },
      { name: "email", label: "Account email", type: "email" },
      { name: "api_token", label: "API token", type: "password", masked: true, optional: true },
    ],
  },
  {
    kind: "teams",
    title: "Microsoft Teams",
    description: "Post catalog alerts into a Teams channel via an incoming webhook.",
    icon: MessageCircle,
    liveDelivery: "Config-only in this release",
    fields: [
      {
        name: "webhook_url",
        label: "Incoming webhook URL",
        type: "password",
        masked: true,
        optional: true,
        placeholder: "https://…webhook.office.com/…",
      },
    ],
  },
  {
    kind: "telegram",
    title: "Telegram",
    description: "Send alerts to a Telegram chat via a bot token.",
    icon: BookOpen,
    liveDelivery: "Config-only in this release",
    fields: [
      { name: "bot_token", label: "Bot token", type: "password", masked: true, optional: true },
      { name: "chat_id", label: "Chat ID", placeholder: "-1002001234567" },
    ],
  },
  {
    kind: "vcenter",
    title: "vCenter",
    description: "Pull VM inventory into the server catalog. Slot reserved for a future release.",
    icon: ServerIcon,
    liveDelivery: "Config-only in this release",
    fields: [
      { name: "host", label: "vCenter host", placeholder: "vcsa.corp.internal" },
      { name: "username", label: "Username", placeholder: "administrator@vsphere.local" },
      { name: "password", label: "Password", type: "password", masked: true, optional: true },
      { name: "verify_ssl", label: "Verify SSL certificate", isCheckbox: true },
    ],
  },
];

const KIND_TO_CONNECTOR = new Map<IntegrationKind, Connector>(CONNECTORS.map((c) => [c.kind, c]));

export default function AdminIntegrations() {
  const [editing, setEditing] = useState<IntegrationKind | null>(null);
  const [testEmailOpen, setTestEmailOpen] = useState(false);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => apiGet<IntegrationRow[]>("/integrations"),
  });

  return (
    <div data-testid="integrations-page" className="pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
            Integrations
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Connect the catalog to external systems. Secrets are encrypted at rest.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setTestEmailOpen(true)}
            data-testid="integrations-send-test-email-btn"
          >
            <Send className="h-4 w-4" aria-hidden="true" /> Send test email
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading integrations…</p>
        ) : (
          (rows ?? []).map((row) => {
            const connector = KIND_TO_CONNECTOR.get(row.kind);
            if (!connector) return null;
            const Icon = connector.icon;
            return (
              <Card
                key={row.kind}
                data-testid={`integration-card-${row.kind}`}
                className="flex flex-col gap-3 p-5"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-heading text-base font-semibold text-foreground">
                        {connector.title}
                      </h3>
                      <Badge variant={row.enabled ? "default" : "secondary"}>
                        {row.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {connector.description}
                    </p>
                  </div>
                </div>
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  {connector.liveDelivery}
                </p>
                <div className="mt-auto flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {row.has_secret ? "Secret stored" : "No secret yet"}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => setEditing(row.kind)}
                    data-testid={`integration-edit-btn-${row.kind}`}
                  >
                    <Plug className="h-3.5 w-3.5" aria-hidden="true" /> Configure
                  </Button>
                </div>
              </Card>
            );
          })
        )}
      </div>

      <IntegrationEditor
        kind={editing}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      />
      <TestEmailDialog open={testEmailOpen} onOpenChange={setTestEmailOpen} />
    </div>
  );
}

interface EditorProps {
  kind: IntegrationKind | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function IntegrationEditor({ kind, open, onOpenChange }: EditorProps) {
  const queryClient = useQueryClient();
  const connector = kind ? KIND_TO_CONNECTOR.get(kind) : null;
  const [enabled, setEnabled] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>({});

  const { data: row } = useQuery({
    queryKey: ["integrations", kind],
    queryFn: () => apiGet<IntegrationRow>(`/integrations/${kind}`),
    enabled: open && kind !== null,
  });

  useEffect(() => {
    if (!open || !connector) return;
    const cfg = row?.config ?? {};
    const seeded: Record<string, unknown> = {};
    for (const field of connector.fields) {
      const stored = cfg[field.name];
      if (field.isCheckbox) seeded[field.name] = stored ?? true;
      else if (field.masked) seeded[field.name] = ""; // never prefill secrets
      else seeded[field.name] = stored ?? "";
    }
    setValues(seeded);
    setEnabled(row?.enabled ?? false);
  }, [open, connector, row]);

  const save = useMutation({
    mutationFn: () => {
      if (!connector) throw new Error("no connector");
      const config: Record<string, unknown> = {};
      for (const field of connector.fields) {
        const raw = values[field.name];
        if (field.isCheckbox) {
          config[field.name] = Boolean(raw);
        } else if (field.type === "number") {
          const parsed = Number(raw);
          if (!Number.isNaN(parsed)) config[field.name] = parsed;
        } else {
          // Blank secret = keep existing; blank non-secret = clear.
          config[field.name] = typeof raw === "string" ? raw.trim() : "";
        }
      }
      return apiPut<IntegrationRow>(`/integrations/${connector.kind}`, {
        enabled,
        config,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      toast.success("Integration saved");
      onOpenChange(false);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  if (!connector) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid={`integration-form-${connector.kind}`}
        className="max-h-[90svh] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>{connector.title}</DialogTitle>
          <DialogDescription>{connector.description}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            save.mutate();
          }}
          className="grid gap-4"
        >
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={enabled}
              onCheckedChange={(checked) => setEnabled(checked === true)}
              data-testid={`integration-enabled-${connector.kind}`}
            />
            Enabled — send traffic through this connector
          </label>

          {connector.fields.map((field) => {
            if (field.isCheckbox) {
              return (
                <label
                  key={field.name}
                  className="flex items-center gap-2 text-sm text-foreground"
                >
                  <Checkbox
                    checked={Boolean(values[field.name])}
                    onCheckedChange={(checked) =>
                      setValues((prev) => ({ ...prev, [field.name]: checked === true }))
                    }
                    data-testid={`integration-field-${connector.kind}-${field.name}`}
                  />
                  {field.label}
                </label>
              );
            }
            const hint =
              field.masked && (row?.config as Record<string, string> | undefined)?.[field.name]
                ? `Currently stored: ${(row?.config as Record<string, string>)[field.name]}. Leave blank to keep it.`
                : field.optional
                  ? "Optional"
                  : "";
            return (
              <div key={field.name} className="grid gap-1.5">
                <Label htmlFor={`integration-${connector.kind}-${field.name}`}>{field.label}</Label>
                <Input
                  id={`integration-${connector.kind}-${field.name}`}
                  type={field.type ?? "text"}
                  autoComplete="off"
                  spellCheck={false}
                  value={(values[field.name] as string | number | undefined) ?? ""}
                  onChange={(event) =>
                    setValues((prev) => ({ ...prev, [field.name]: event.target.value }))
                  }
                  data-testid={`integration-field-${connector.kind}-${field.name}`}
                  placeholder={field.placeholder}
                />
                {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
              </div>
            );
          })}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid={`integration-cancel-${connector.kind}`}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={save.isPending}
              data-testid={`integration-save-${connector.kind}`}
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TestEmailDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [to, setTo] = useState("");
  const send = useMutation({
    mutationFn: () =>
      apiPost<{ status: string; to: string }>("/integrations/email/test", {
        to: to.trim(),
      }),
    onSuccess: () => {
      toast.success(`Test email queued to ${to.trim()}`);
      onOpenChange(false);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  useEffect(() => {
    if (open) setTo("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="test-email-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send a test email</DialogTitle>
          <DialogDescription>
            Uses whatever SMTP settings are saved and enabled right now.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (!to.trim()) return;
            send.mutate();
          }}
          className="grid gap-3"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="test-email-to">Recipient</Label>
            <Input
              id="test-email-to"
              type="email"
              required
              value={to}
              onChange={(event) => setTo(event.target.value)}
              data-testid="test-email-to-input"
              placeholder="you@corp.com"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="test-email-cancel"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={send.isPending} data-testid="test-email-send">
              {send.isPending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
