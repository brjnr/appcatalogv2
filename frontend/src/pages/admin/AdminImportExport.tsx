import { useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { apiErrorMessage } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Entity = "categories" | "applications" | "servers" | "pics";

interface EntitySpec {
  entity: Entity;
  title: string;
  description: string;
}

const ENTITIES: EntitySpec[] = [
  {
    entity: "categories",
    title: "App Categories",
    description: "Bulk-add or edit the categories the catalog is grouped by.",
  },
  {
    entity: "applications",
    title: "Applications",
    description: "Bulk-add or edit applications. Requires category_id from the Categories reference sheet.",
  },
  {
    entity: "servers",
    title: "Servers",
    description: "Bulk-add or edit servers. Includes date_created and decommission fields.",
  },
  {
    entity: "pics",
    title: "PIC Management",
    description: "Bulk-add or edit persons in charge. Requires department_id from the Departments reference sheet.",
  },
];

interface ImportRow {
  row: number;
  status: "created" | "updated" | "skipped" | "error";
  id?: string;
  name?: string;
  detail?: string;
}

interface ImportResponse {
  entity: Entity;
  rows: number;
  summary: { created: number; updated: number; skipped: number; errors: number };
  results: ImportRow[];
}

async function downloadFile(url: string, filename: string): Promise<void> {
  // Uses fetch (not <a download>) so the session cookie is sent and we can
  // trigger a save-as with a stable filename.
  const res = await fetch(`/api${url}`, { credentials: "include" });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

async function uploadEntity(entity: Entity, file: File): Promise<ImportResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`/api/imports/${entity}`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.detail ?? `Upload failed (${res.status})`);
  }
  return body as ImportResponse;
}

export default function AdminImportExport() {
  const [lastReport, setLastReport] = useState<ImportResponse | null>(null);

  return (
    <div data-testid="import-export-page" className="pb-10">
      <div>
        <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
          Import & export
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Download a live export or blank template, edit in Excel, and re-upload. Uploaded files are parsed
          in memory and discarded immediately.
        </p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {ENTITIES.map((spec) => (
          <EntityCard key={spec.entity} spec={spec} onReport={setLastReport} />
        ))}
      </div>

      {lastReport && <ImportReport report={lastReport} onClose={() => setLastReport(null)} />}
    </div>
  );
}

function EntityCard({
  spec,
  onReport,
}: {
  spec: EntitySpec;
  onReport: (report: ImportResponse) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const downloadTemplate = useMutation({
    mutationFn: () => downloadFile(`/exports/${spec.entity}/template`, `${spec.entity}-template.xlsx`),
    onSuccess: () => toast.success(`${spec.title} template downloaded`),
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const downloadExport = useMutation({
    mutationFn: () => downloadFile(`/exports/${spec.entity}`, `${spec.entity}-export.xlsx`),
    onSuccess: () => toast.success(`${spec.title} export downloaded`),
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const upload = useMutation({
    mutationFn: (file: File) => uploadEntity(spec.entity, file),
    onSuccess: (report) => {
      const s = report.summary;
      toast.success(
        `${spec.title}: +${s.created} created · ${s.updated} updated · ${s.skipped} skipped · ${s.errors} errors`,
      );
      onReport(report);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  return (
    <Card data-testid={`import-export-card-${spec.entity}`} className="flex flex-col gap-3 p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="font-heading text-base font-semibold text-foreground">{spec.title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{spec.description}</p>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadTemplate.mutate()}
          disabled={downloadTemplate.isPending}
          data-testid={`download-template-${spec.entity}`}
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" /> Template
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadExport.mutate()}
          disabled={downloadExport.isPending}
          data-testid={`download-export-${spec.entity}`}
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export live data
        </Button>
        <Button
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
          data-testid={`upload-${spec.entity}`}
        >
          <Upload className="h-3.5 w-3.5" aria-hidden="true" /> Upload
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xlsm,.csv,.tsv"
          className="hidden"
          data-testid={`upload-input-${spec.entity}`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload.mutate(file);
            event.target.value = "";
          }}
        />
      </div>
    </Card>
  );
}

function ImportReport({ report, onClose }: { report: ImportResponse; onClose: () => void }) {
  const rows = useMemo(() => report.results.slice(0, 200), [report.results]);
  return (
    <div className="mt-6 overflow-hidden rounded-xl border bg-card" data-testid="import-report">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <h2 className="font-heading text-base font-semibold text-foreground">
          {report.entity} import — {report.rows} row(s)
        </h2>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="default">created {report.summary.created}</Badge>
          <Badge variant="secondary">updated {report.summary.updated}</Badge>
          <Badge variant="outline">skipped {report.summary.skipped}</Badge>
          <Badge variant={report.summary.errors ? "destructive" : "outline"}>
            errors {report.summary.errors}
          </Badge>
        </div>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>
          Dismiss
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Row</TableHead>
            <TableHead className="w-32">Status</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Detail</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.row}>
              <TableCell className="font-mono text-xs">{r.row}</TableCell>
              <TableCell>
                <Badge
                  variant={
                    r.status === "error"
                      ? "destructive"
                      : r.status === "created"
                        ? "default"
                        : r.status === "updated"
                          ? "secondary"
                          : "outline"
                  }
                >
                  {r.status}
                </Badge>
              </TableCell>
              <TableCell className="text-sm">{r.name ?? "—"}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{r.detail ?? r.id ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
