import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiErrorMessage, apiGet, apiPost, apiPut } from "@/lib/api";
import type { AppCategory, Department, Role, SessionUser } from "@/lib/types";
import { slugify } from "@/lib/types";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: SessionUser | null; // null = create mode
}

// Password policy must stay in lockstep with backend/models/users.py.
const PASSWORD_MIN = 13;
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,40}$/;

function passwordIssue(pw: string): string | null {
  if (pw.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (!/[A-Z]/.test(pw)) return "Password must include at least one uppercase letter.";
  if (!/[a-z]/.test(pw)) return "Password must include at least one lowercase letter.";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Password must include at least one symbol.";
  return null;
}

// Create/edit a user: identity, role, active flag, and assigned app categories.
export function UserFormDialog({ open, onOpenChange, initial }: UserFormDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [role, setRole] = useState<Role>("normal_user");
  const [isActive, setIsActive] = useState(true);
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [departmentId, setDepartmentId] = useState("");

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: () => apiGet<Department[]>("/departments"),
    enabled: open,
  });
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<AppCategory[]>("/categories"),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setUsername(initial?.username ?? "");
    setEmail(initial?.email ?? "");
    setPassword("");
    setPasswordConfirm("");
    setRole(initial?.role ?? "normal_user");
    setIsActive(initial?.is_active ?? true);
    setAssignedIds(initial?.assigned_category_ids ?? []);
    setDepartmentId(initial?.department_id ?? "");
  }, [open, initial]);

  const passwordError = useMemo(() => {
    if (!password && !passwordConfirm) return null; // both empty = keep current
    const structural = passwordIssue(password);
    if (structural) return structural;
    if (password !== passwordConfirm) return "Passwords do not match.";
    return null;
  }, [password, passwordConfirm]);

  const usernameError = useMemo(() => {
    if (!username) return null;
    return USERNAME_RE.test(username.trim())
      ? null
      : "Username must be 3–40 characters using letters, numbers, dot, underscore, or hyphen.";
  }, [username]);

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      initial
        ? apiPut<SessionUser>(`/users/${initial.id}`, payload)
        : apiPost<SessionUser>("/users", payload),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(initial ? "User updated" : `${saved.name} created`);
      onOpenChange(false);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const toggleCategory = (categoryId: string, checked: boolean) => {
    setAssignedIds((prev) =>
      checked ? [...new Set([...prev, categoryId])] : prev.filter((id) => id !== categoryId),
    );
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    // Blocked-in-the-UI validation. The backend re-checks — this is UX, not gate.
    if (!initial && !password) {
      toast.error("A password is required for new users.");
      return;
    }
    if (passwordError) {
      toast.error(passwordError);
      return;
    }
    if (usernameError) {
      toast.error(usernameError);
      return;
    }

    const payload: Record<string, unknown> = {
      name: name.trim(),
      username: username.trim().toLowerCase(),
      email: email.trim(),
      role,
      assigned_category_ids: assignedIds,
      department_id: departmentId,
    };
    if (initial) payload.is_active = isActive;
    else payload.is_active = true;

    if (password) {
      payload.password = password;
      payload.password_confirm = passwordConfirm;
    }

    saveMutation.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="user-form-dialog"
        className="max-h-[90svh] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>{initial ? "Edit user" : "Add user"}</DialogTitle>
          <DialogDescription>
            {initial
              ? "Update identity, role, status, or category assignments."
              : "Create an account and assign its role and app categories."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="user-form-name">Full name</Label>
            <Input
              id="user-form-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              data-testid="user-form-name-input"
              placeholder="e.g. John Doe"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="user-form-username">Username</Label>
            <Input
              id="user-form-username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              data-testid="user-form-username-input"
              placeholder="e.g. john.doe"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={usernameError ? true : undefined}
            />
            <p className="text-xs text-muted-foreground">
              Users can sign in with either the email or the username.
            </p>
            {usernameError && (
              <p
                data-testid="user-form-username-error"
                className="text-xs text-red-600 dark:text-red-400"
              >
                {usernameError}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="user-form-email">Email</Label>
            <Input
              id="user-form-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              data-testid="user-form-email-input"
              placeholder="john.doe@corp.com"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="user-form-password">
              {initial ? "New password (leave blank to keep current)" : "Password"}
            </Label>
            <Input
              id="user-form-password"
              type="password"
              required={!initial}
              minLength={initial && !password ? undefined : PASSWORD_MIN}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              data-testid="user-form-password-input"
              placeholder={`min ${PASSWORD_MIN} chars, incl. upper, lower & symbol`}
              autoComplete="new-password"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="user-form-password-confirm">Retype password</Label>
            <Input
              id="user-form-password-confirm"
              type="password"
              required={!initial || password.length > 0}
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              data-testid="user-form-password-confirm-input"
              placeholder="Retype the password to confirm"
              autoComplete="new-password"
              aria-invalid={passwordError ? true : undefined}
            />
            {passwordError && (
              <p
                data-testid="user-form-password-error"
                className="text-xs text-red-600 dark:text-red-400"
              >
                {passwordError}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="user-form-role">Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as Role)}>
              <SelectTrigger id="user-form-role" data-testid="user-form-role-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal_user">Normal User</SelectItem>
                <SelectItem value="administrator">Administrator</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="user-form-department">Department</Label>
            <Select
              value={departmentId || "__none__"}
              onValueChange={(value) => setDepartmentId(value === "__none__" ? "" : value)}
            >
              <SelectTrigger id="user-form-department" data-testid="user-form-department-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="__none__">No department</SelectItem>
                {(departments ?? []).map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Members of a department can read and edit notes shared with it.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label>Assigned app categories</Label>
            <p className="text-xs text-muted-foreground">
              Normal users can only see applications in these categories. Administrators have full
              access regardless.
            </p>
            <div className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-2">
              {(categories ?? []).map((category) => (
                <label
                  key={category.id}
                  className="flex items-center gap-2 text-sm text-foreground"
                >
                  <Checkbox
                    checked={assignedIds.includes(category.id)}
                    onCheckedChange={(checked) => toggleCategory(category.id, checked === true)}
                    data-testid={`user-form-category-checkbox-${slugify(category.name)}`}
                  />
                  {category.name}
                </label>
              ))}
              {categories && categories.length === 0 && (
                <p className="text-xs text-muted-foreground">No categories yet.</p>
              )}
            </div>
          </div>

          {initial && (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked === true)}
                data-testid="user-form-active-checkbox"
              />
              Active (user can sign in)
            </label>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="user-form-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saveMutation.isPending || !!passwordError || !!usernameError}
              data-testid="user-form-submit-btn"
            >
              {saveMutation.isPending ? "Saving…" : initial ? "Save changes" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
