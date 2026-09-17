import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appName: string;
  pending: boolean;
  onConfirm: () => void;
  /** What is being deleted, e.g. "department" — defaults to the catalog application copy. */
  description?: string;
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  appName,
  pending,
  onConfirm,
  description,
}: ConfirmDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="delete-confirm-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete “{appName}”?</DialogTitle>
          <DialogDescription>
            {description ??
              "This permanently removes the application from the catalog. Existing bookmarks to its detail page will stop resolving."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="delete-cancel-btn"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={pending}
            data-testid="delete-confirm-btn"
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
