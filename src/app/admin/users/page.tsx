"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  FilterX,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";

import PageHeader from "@/src/components/PageHeader";
import StatusBadge from "@/src/components/StatusBadge";
import EmptyState from "@/src/components/EmptyState";
import ErrorState from "@/src/components/ErrorState";
import Breadcrumbs from "@/src/components/Breadcrumbs";
import { SkeletonRegion, SkeletonTable } from "@/src/components/Skeleton";
import { useConfirm } from "@/src/components/ConfirmDialog";
import { useToast } from "@/src/components/Toast";
import {
  MAX_DISPLAY_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  type UserRole,
} from "@/src/lib/user-validation";
import { roleRank, userStatus } from "@/src/lib/status";

type AdminUser = {
  id: string;
  displayName: string;
  email: string;
  role: UserRole;
  status: "ACTIVE" | "DISABLED";
  created_at?: string;
};

const ROLES: Array<{ value: UserRole; label: string; hint: string }> = [
  { value: "USER", label: "User", hint: "Read-only access to the public noticeboard" },
  { value: "ADMIN", label: "Admin", hint: "Manage notices, files, audit and operations" },
  { value: "OWNER", label: "Owner", hint: "Full control, including user administration" },
];

const ROLE_TONE: Record<UserRole, string> = {
  OWNER: "Owner · full control",
  ADMIN: "Admin · operations",
  USER: "User · read-only",
};

function initialsOf(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[parts.length - 1][0]}`;
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  const message = body?.error;
  return typeof message === "string" && message.trim() ? message : fallback;
}

export default function UsersPage() {
  const confirm = useConfirm();
  const { toast } = useToast();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [roleHint, setRoleHint] = useState("USER");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(await readError(response, "The user list could not be loaded."));
      }
      const data = await response.json();
      setUsers(Array.isArray(data?.users) ? data.users : []);
      setLoadError("");
    } catch (error) {
      setUsers([]);
      setLoadError(
        error instanceof Error ? error.message : "The user list could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((user) => {
      if (roleFilter && user.role !== roleFilter) return false;
      if (statusFilter && user.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        user.displayName.toLowerCase().includes(needle) ||
        user.email.toLowerCase().includes(needle)
      );
    });
  }, [users, query, roleFilter, statusFilter]);

  const filtersActive = Boolean(query.trim() || roleFilter || statusFilter);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setCreating(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: fields.get("email"),
          password: fields.get("password"),
          displayName: fields.get("displayName"),
          role: fields.get("role"),
        }),
      });
      if (!response.ok) {
        toast({
          tone: "danger",
          title: "The user was not created",
          text: await readError(response, "Check the details and try again."),
        });
        return;
      }
      form.reset();
      setRoleHint("USER");
      toast({ tone: "success", title: "User created" });
      await load();
    } catch {
      toast({ tone: "danger", title: "Could not reach the server", text: "No account was created." });
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(user: AdminUser, status: "ACTIVE" | "DISABLED") {
    const enabling = status === "ACTIVE";
    const ok = await confirm({
      title: enabling ? "Enable this account?" : "Disable this account?",
      subject: `${user.displayName} — ${user.email}`,
      consequence: enabling
        ? "The account can sign in again immediately."
        : "Existing sessions are no longer usable and the account cannot sign in. Nothing is deleted and it can be re-enabled at any time.",
      confirmLabel: enabling ? "Enable account" : "Disable account",
      tone: enabling ? "default" : "warning",
    });
    if (!ok) return;

    setBusyId(user.id);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        toast({
          tone: "danger",
          title: "The account was not updated",
          text: await readError(response, "Update failed."),
        });
        return;
      }
      toast({
        tone: "success",
        title: enabling ? "Account enabled" : "Account disabled",
        text: user.email,
      });
      await load();
    } catch {
      toast({ tone: "danger", title: "Could not reach the server", text: "Nothing was changed." });
    } finally {
      setBusyId(null);
    }
  }

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = { OWNER: 0, ADMIN: 0, USER: 0 };
    for (const user of users) counts[user.role] = (counts[user.role] ?? 0) + 1;
    return counts;
  }, [users]);

  return (
    <>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Users" }]} />
        }
        eyebrow="Governance"
        title="Users"
        description="Owner-only account administration. Accounts are never deleted from here — they are disabled, which revokes access while preserving the audit trail."
        meta={
          <>
            <span className="badge badge-role-owner">
              {roleCounts.OWNER} owner{roleCounts.OWNER === 1 ? "" : "s"}
            </span>
            <span className="badge badge-role-admin">
              {roleCounts.ADMIN} admin{roleCounts.ADMIN === 1 ? "" : "s"}
            </span>
            <span className="badge badge-role-user">
              {roleCounts.USER} user{roleCounts.USER === 1 ? "" : "s"}
            </span>
          </>
        }
      />

      <section className="form-section" aria-label="Create a user">
        <div className="admin-section-head">
          <div>
            <h2 className="form-section-heading">
              <UserPlus aria-hidden="true" style={{ width: 15, height: 15, display: "inline", verticalAlign: "-2px" }} />{" "}
              Create an account
            </h2>
            <p className="form-section-desc">
              New accounts are active immediately and must be given credentials out of band.
            </p>
          </div>
        </div>

        <form onSubmit={submit}>
          <fieldset className="form-grid-2" disabled={creating} style={{ border: 0, padding: 0, margin: 0 }}>
            <div className="field">
              <label className="field-label" htmlFor="user-display-name">
                Display name
              </label>
              <input
                id="user-display-name"
                className="input"
                name="displayName"
                required
                maxLength={MAX_DISPLAY_NAME_LENGTH}
                autoComplete="off"
              />
              <p className="field-hint">
                Shown as the notice author and on every audit entry.
              </p>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="user-email">
                Email address
              </label>
              <input
                id="user-email"
                className="input"
                name="email"
                type="email"
                required
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
              <p className="field-hint">Used to sign in. Must be unique.</p>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="user-password">
                Password
              </label>
              <input
                id="user-password"
                className="input"
                name="password"
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
              />
              <p className="field-hint">At least {MIN_PASSWORD_LENGTH} characters.</p>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="user-role">
                Role
              </label>
              <select
                id="user-role"
                className="select"
                name="role"
                value={roleHint}
                onChange={(event) => setRoleHint(event.target.value)}
              >
                {ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
              <p className="field-hint">
                {ROLES.find((role) => role.value === roleHint)?.hint}
              </p>
            </div>
          </fieldset>

          <div className="form-actions">
            <button className="btn" type="submit" disabled={creating}>
              {creating ? <span className="spinner" aria-hidden="true" /> : <UserPlus aria-hidden="true" />}
              {creating ? "Creating…" : "Create account"}
            </button>
          </div>
        </form>
      </section>

      <form
        className="filter-bar"
        style={{ marginTop: "var(--space-5)" }}
        role="search"
        aria-label="Filter users"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="field">
          <label className="field-label" htmlFor="user-search">
            Search
          </label>
          <div className="search-field">
            <Search aria-hidden="true" />
            <input
              id="user-search"
              className="input"
              type="search"
              value={query}
              placeholder="Name or email"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="user-role-filter">
            Role
          </label>
          <select
            id="user-role-filter"
            className="select"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
          >
            <option value="">All roles</option>
            {ROLES.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="user-status-filter">
            Status
          </label>
          <select
            id="user-status-filter"
            className="select"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="DISABLED">Disabled</option>
          </select>
        </div>
        <div className="filter-bar-actions">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!filtersActive}
            onClick={() => {
              setQuery("");
              setRoleFilter("");
              setStatusFilter("");
            }}
          >
            <FilterX aria-hidden="true" />
            Clear filters
          </button>
          <p className="meta" style={{ marginLeft: "auto" }}>
            {loading
              ? "Loading…"
              : `${visible.length} of ${users.length} account${users.length === 1 ? "" : "s"}`}
          </p>
        </div>
      </form>

      {loadError ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <ErrorState
            title="The user list could not be loaded"
            message={loadError}
            onRetry={() => void load()}
          />
        </div>
      ) : loading ? (
        <div className="table-wrap" style={{ marginTop: "var(--space-5)" }}>
          <div style={{ padding: "var(--space-4)" }}>
            <SkeletonRegion label="Loading accounts.">
              <SkeletonTable rows={5} columns={4} />
            </SkeletonRegion>
          </div>
        </div>
      ) : users.length === 0 ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <EmptyState
            icon={Users}
            title="No accounts exist yet"
            description="The noticeboard has no user accounts. Create the first one using the form above — an owner account is needed to reach this page at all, so at least one account must already exist."
          />
        </div>
      ) : visible.length === 0 ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <EmptyState
            icon={Search}
            title="No accounts match these filters"
            description="Nothing in the account list matches the current search or filters. Clear them to see every account."
            actions={
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setQuery("");
                  setRoleFilter("");
                  setStatusFilter("");
                }}
              >
                <FilterX aria-hidden="true" />
                Clear filters
              </button>
            }
          />
        </div>
      ) : (
        <>
          <div className="table-wrap show-desktop" style={{ marginTop: "var(--space-5)" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="row row-3" style={{ alignItems: "center" }}>
                        <span className="app-avatar" style={{ width: 32, height: 32 }} aria-hidden="true">
                          {initialsOf(user.displayName)}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div className="cell-primary">{user.displayName}</div>
                          <div className="cell-sub" style={{ overflowWrap: "anywhere" }}>
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-role-${roleRank(user.role)}`}>
                        <ShieldCheck aria-hidden="true" />
                        {ROLE_TONE[user.role]}
                      </span>
                    </td>
                    <td>
                      <StatusBadge descriptor={userStatus(user.status)} dot />
                    </td>
                    <td className="actions-cell">
                      {user.status === "ACTIVE" ? (
                        <button
                          type="button"
                          className="btn btn-danger-outline btn-sm"
                          disabled={busyId === user.id}
                          onClick={() => void setStatus(user, "DISABLED")}
                        >
                          <XCircle aria-hidden="true" />
                          {busyId === user.id ? "Working…" : "Disable"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={busyId === user.id}
                          onClick={() => void setStatus(user, "ACTIVE")}
                        >
                          <CheckCircle2 aria-hidden="true" />
                          {busyId === user.id ? "Working…" : "Enable"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="data-list show-mobile" style={{ listStyle: "none", padding: 0, marginTop: "var(--space-5)" }}>
            {visible.map((user) => (
              <li className="data-list-item" key={user.id}>
                <div className="data-list-head">
                  <div className="row row-3" style={{ minWidth: 0 }}>
                    <span className="app-avatar" style={{ width: 32, height: 32 }} aria-hidden="true">
                      {initialsOf(user.displayName)}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <p className="data-list-title">{user.displayName}</p>
                      <p className="cell-sub" style={{ overflowWrap: "anywhere" }}>
                        {user.email}
                      </p>
                    </div>
                  </div>
                  <StatusBadge descriptor={userStatus(user.status)} dot />
                </div>
                <div className="data-list-actions" style={{ alignItems: "center" }}>
                  <span className={`badge badge-role-${roleRank(user.role)}`}>
                    <ShieldCheck aria-hidden="true" />
                    {ROLE_TONE[user.role]}
                  </span>
                  <span className="spacer" />
                  {user.status === "ACTIVE" ? (
                    <button
                      type="button"
                      className="btn btn-danger-outline btn-sm"
                      disabled={busyId === user.id}
                      onClick={() => void setStatus(user, "DISABLED")}
                    >
                      Disable
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busyId === user.id}
                      onClick={() => void setStatus(user, "ACTIVE")}
                    >
                      Enable
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
