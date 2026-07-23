import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Database, Pencil, RefreshCw, Save, ScrollText, Search, Server, Trash2, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { AdminTableData, AdminTableSummary, AdminUser, AIModelsData, AIUsageData } from "../types";

const PAGE_SIZE = 25;
const SKIP_DELETE_CONFIRMATION_KEY = "admin.skipDeleteConfirmation";

function displayValue(value: unknown): string {
  if (value == null) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function parseValue(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    return JSON.parse(trimmed);
  }
  return value;
}

function protectedFieldReason(data: AdminTableData, column: string): string | null {
  if (data.primary_key.includes(column)) {
    return "This field cannot be changed because it is a primary key.";
  }
  if (data.foreign_keys?.includes(column)) {
    return "This field cannot be changed because it is a foreign key.";
  }
  return null;
}

export default function AdminTab({ currentUserId }: { currentUserId: number }) {
  const [view, setView] = useState<"users" | "logs" | "usage" | "models" | "tables">("users");
  const [systemExpanded, setSystemExpanded] = useState(true);
  const [tablesExpanded, setTablesExpanded] = useState(true);
  const [tables, setTables] = useState<AdminTableSummary[]>([]);
  const [dbInfo, setDbInfo] = useState<{ host: string; port: number | null; database: string | null } | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [data, setData] = useState<AdminTableData | null>(null);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [detailRow, setDetailRow] = useState<Record<string, unknown> | null>(null);
  const [deleteRow, setDeleteRow] = useState<Record<string, unknown> | null>(null);
  const [skipDeleteConfirmation, setSkipDeleteConfirmation] = useState(false);
  const [deletingRow, setDeletingRow] = useState(false);
  const [deleteResult, setDeleteResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tableOverflows, setTableOverflows] = useState(false);
  const tableWrapRef = useRef<HTMLDivElement>(null);

  const loadTable = async () => {
    if (!selectedTable) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api.getAdminTable(selectedTable, { page, page_size: PAGE_SIZE, search: search || undefined, sort_by: sortBy ?? undefined, sort_dir: sortDir }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.listAdminTables().then((items) => {
      setTables(items);
      setSelectedTable(items[0]?.name ?? null);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
    api.getDatabaseInfo().then(setDbInfo).catch(() => setDbInfo(null));
  }, []);

  useEffect(() => {
    void loadTable();
  }, [selectedTable, page, search, sortBy, sortDir]);

  useEffect(() => {
    const tableWrap = tableWrapRef.current;
    if (!tableWrap) return;
    const checkOverflow = () => setTableOverflows(tableWrap.scrollWidth > tableWrap.clientWidth);
    checkOverflow();
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(tableWrap);
    return () => observer.disconnect();
  }, [data]);

  const chooseTable = (name: string) => {
    setView("tables");
    setSelectedTable(name);
    setPage(1);
    setSearch("");
    setSearchInput("");
    setSortBy(null);
    setSortDir("asc");
    setEditingRow(null);
  };

  const sort = (column: string) => {
    if (sortBy === column) setSortDir((direction) => direction === "asc" ? "desc" : "asc");
    else {
      setSortBy(column);
      setSortDir("asc");
    }
    setPage(1);
  };

  const startEdit = (row: Record<string, unknown>) => {
    setEditError(null);
    setEditingRow(row);
    setDraft(Object.fromEntries(Object.entries(row).map(([key, value]) => [key, displayValue(value)])));
  };

  const saveEdit = async () => {
    if (!selectedTable || !editingRow || !data) return;
    const changes = Object.fromEntries(
      Object.entries(draft)
        .filter(([key, value]) =>
          protectedFieldReason(data, key) == null
          && value !== displayValue(editingRow[key])
        )
        .map(([key, value]) => [key, parseValue(value)]),
    );
    if (Object.keys(changes).length === 0) {
      setEditingRow(null);
      return;
    }
    setEditError(null);
    try {
      await api.updateAdminRow(selectedTable, Number(editingRow.id), changes);
      setEditingRow(null);
      await loadTable();
    } catch (reason) {
      setEditError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const removeRow = async (row: Record<string, unknown>) => {
    if (!selectedTable) return;
    setDeletingRow(true);
    setDeleteResult(null);
    try {
      await api.deleteAdminRow(selectedTable, Number(row.id));
      setTables((current) => current.map((table) =>
        table.name === selectedTable
          ? { ...table, row_count: Math.max(0, table.row_count - 1) }
          : table
      ));
      if (data?.rows.length === 1 && page > 1) setPage((current) => current - 1);
      else await loadTable();
      setDeleteResult({ type: "success", message: "Record successfully deleted." });
    } catch (reason) {
      setDeleteResult({
        type: "error",
        message: reason instanceof Error ? reason.message : String(reason),
      });
    } finally {
      setDeletingRow(false);
      setDeleteRow(null);
    }
  };

  const requestRemoveRow = (row: Record<string, unknown>) => {
    setDeleteResult(null);
    if (localStorage.getItem(SKIP_DELETE_CONFIRMATION_KEY) === "true") {
      void removeRow(row);
      return;
    }
    setSkipDeleteConfirmation(false);
    setDeleteRow(row);
  };

  const confirmRemoveRow = () => {
    if (!deleteRow) return;
    if (skipDeleteConfirmation) {
      localStorage.setItem(SKIP_DELETE_CONFIRMATION_KEY, "true");
    }
    void removeRow(deleteRow);
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <section className="admin-layout">
      <aside className="admin-sidebar">
        <button className="admin-sidebar-heading" aria-expanded={systemExpanded} onClick={() => setSystemExpanded((open) => !open)}>
          <ScrollText size={18} aria-hidden="true" /><strong>System</strong>
          {systemExpanded ? <ChevronDown size={16} aria-hidden="true" className="admin-sidebar-caret" /> : <ChevronRight size={16} aria-hidden="true" className="admin-sidebar-caret" />}
        </button>
        {systemExpanded && (
          <>
            <button className={`admin-table-link ${view === "users" ? "active" : ""}`} onClick={() => setView("users")}>
              <span><Users size={15} aria-hidden="true" /> Users &amp; Access</span>
            </button>
            <button className={`admin-table-link ${view === "logs" ? "active" : ""}`} onClick={() => setView("logs")}>
              <span>System Logs</span>
            </button>
            <button className={`admin-table-link ${view === "usage" ? "active" : ""}`} onClick={() => setView("usage")}>
              <span>AI Usage</span>
            </button>
            <button className={`admin-table-link ${view === "models" ? "active" : ""}`} onClick={() => setView("models")}>
              <span>Models &amp; Pricing</span>
            </button>
          </>
        )}
        <button className="admin-sidebar-heading" aria-expanded={tablesExpanded} style={{ marginTop: 14 }} onClick={() => setTablesExpanded((open) => !open)}>
          <Database size={18} aria-hidden="true" /><strong>Database</strong>
          {tablesExpanded ? <ChevronDown size={16} aria-hidden="true" className="admin-sidebar-caret" /> : <ChevronRight size={16} aria-hidden="true" className="admin-sidebar-caret" />}
        </button>
        {tablesExpanded && tables.map((table) => (
          <button className={`admin-table-link ${view === "tables" && selectedTable === table.name ? "active" : ""}`} key={table.name} onClick={() => chooseTable(table.name)}>
            <span>{table.name}</span><small>{table.row_count}</small>
          </button>
        ))}
      </aside>
      {view === "users" ? <UsersView currentUserId={currentUserId} /> : view === "logs" ? <SystemLogsView /> : view === "usage" ? <AIUsageView /> : view === "models" ? <AIModelsView /> : (
      <main className="admin-content">
        {dbInfo && (
          <div className="db-host-banner">
            <Server size={16} aria-hidden="true" />
            <span>Connected to <strong>{dbInfo.host}{dbInfo.port != null ? `:${dbInfo.port}` : ""}</strong>{dbInfo.database ? ` · ${dbInfo.database}` : ""}</span>
          </div>
        )}
        <div className="admin-toolbar">
          <div><h2>{selectedTable ?? "Tables"}</h2>{data && <p className="meta">{data.total} row{data.total === 1 ? "" : "s"}</p>}</div>
          <form className="admin-search" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchInput); }}>
            <Search size={16} aria-hidden="true" />
            <input aria-label="Search table" value={searchInput} placeholder="Search rows" onChange={(event) => setSearchInput(event.target.value)} />
          </form>
        </div>
        {deleteResult && (
          <div className={`admin-delete-result ${deleteResult.type}`} role={deleteResult.type === "error" ? "alert" : "status"}>
            <span>{deleteResult.message}</span>
            <button className="icon-btn" onClick={() => setDeleteResult(null)} aria-label="Dismiss message"><X size={15} /></button>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        {loading ? <p className="meta">Loading table…</p> : data && (
          <>
            <div className="admin-table-wrap" ref={tableWrapRef}>
              <table className="admin-table">
                <thead><tr>{data.columns.map((column) => <th key={column}><button onClick={() => sort(column)}>{column}{sortBy === column && <span aria-hidden="true"> {sortDir === "asc" ? "↑" : "↓"}</span>}</button></th>)}<th aria-label="Row actions" /></tr></thead>
                <tbody>{data.rows.length === 0 ? <tr><td colSpan={data.columns.length + 1} className="admin-empty">No matching rows.</td></tr> : data.rows.map((row) => <tr key={String(row.id)} className="log-row" onClick={() => setDetailRow(row)}>{data.columns.map((column) => <td key={column} title={displayValue(row[column])}>{displayValue(row[column])}</td>)}<td className="admin-row-actions"><button className="icon-btn" onClick={(event) => { event.stopPropagation(); startEdit(row); }} title="Edit row" aria-label={`Edit row ${row.id}`}><Pencil size={15} /></button><button className="icon-btn danger" onClick={(event) => { event.stopPropagation(); requestRemoveRow(row); }} title="Delete row" aria-label={`Delete row ${row.id}`}><Trash2 size={15} /></button></td></tr>)}</tbody>
              </table>
            </div>
            {tableOverflows && <p className="admin-scroll-cue" aria-hidden="true">Scroll horizontally to view all columns <span>→</span></p>}
            <div className="admin-pagination"><span className="meta">Page {data.page} of {totalPages}</span><div><button className="icon-btn" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button><button className="icon-btn" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} aria-label="Next page"><ChevronRight size={16} /></button></div></div>
          </>
        )}
      </main>
      )}
      {editingRow && data && (
        <div className="modal-backdrop" onClick={() => setEditingRow(null)} role="presentation">
          <section className="modal admin-edit-modal" role="dialog" aria-modal="true" aria-labelledby="admin-edit-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <strong id="admin-edit-title">Edit {selectedTable} row</strong>
              <button className="icon-btn" onClick={() => setEditingRow(null)} aria-label="Close editor"><X size={18} /></button>
            </div>
            <div className="admin-edit-fields">
              {data.columns.map((column) => {
                const protectedReason = protectedFieldReason(data, column);
                return (
                  <label key={column} title={protectedReason ?? undefined}>
                    {column}
                    {protectedReason ? (
                      <input value={draft[column] ?? ""} disabled aria-describedby={`protected-${column}`} />
                    ) : (
                      <textarea value={draft[column] ?? ""} onChange={(event) => setDraft((current) => ({ ...current, [column]: event.target.value }))} />
                    )}
                    {protectedReason && <span id={`protected-${column}`} className="admin-protected-hint">{protectedReason}</span>}
                  </label>
                );
              })}
            </div>
            {editError && <p className="error" role="alert">{editError}</p>}
            <div className="actions"><button className="btn" onClick={() => void saveEdit()}><Save size={16} /> Save changes</button><button className="btn secondary" onClick={() => setEditingRow(null)}>Cancel</button></div>
          </section>
        </div>
      )}
      {detailRow && data && <div className="modal-backdrop" onClick={() => setDetailRow(null)} role="presentation"><section className="modal admin-edit-modal" role="dialog" aria-modal="true" aria-labelledby="admin-detail-title" onClick={(event) => event.stopPropagation()}><div className="modal-header"><strong id="admin-detail-title">{selectedTable} · row {String(detailRow.id)}</strong><button className="icon-btn" onClick={() => setDetailRow(null)} aria-label="Close details"><X size={18} /></button></div><div className="admin-detail-fields">{data.columns.map((column) => <div key={column} className="admin-detail-field"><span className="admin-detail-label">{column}</span><pre className="admin-detail-value">{displayValue(detailRow[column]) || "—"}</pre></div>)}</div><div className="actions"><button className="btn" onClick={() => { const row = detailRow; setDetailRow(null); startEdit(row); }}><Pencil size={16} /> Edit</button><button className="btn secondary" onClick={() => setDetailRow(null)}>Close</button></div></section></div>}
      {deleteRow && (
        <div className="modal-backdrop" role="presentation" onClick={() => !deletingRow && setDeleteRow(null)}>
          <section className="modal admin-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="admin-delete-title" aria-describedby="admin-delete-description" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <strong id="admin-delete-title">Delete record</strong>
              <button className="icon-btn" disabled={deletingRow} onClick={() => setDeleteRow(null)} aria-label="Close confirmation"><X size={18} /></button>
            </div>
            <p id="admin-delete-description">Are you sure you want to delete this record? It cannot be undone.</p>
            <label className="admin-delete-skip">
              <input type="checkbox" checked={skipDeleteConfirmation} onChange={(event) => setSkipDeleteConfirmation(event.target.checked)} />
              <span>I understand. Do not show again.</span>
            </label>
            <div className="actions">
              <button className="btn admin-delete-button" disabled={deletingRow} onClick={confirmRemoveRow}>{deletingRow ? "Deleting..." : "Delete"}</button>
              <button className="btn secondary" disabled={deletingRow} onClick={() => setDeleteRow(null)}>Cancel</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

const LOGS_PAGE_SIZE = 25;

const USER_ROLES: AdminUser["role"][] = ["user", "admin"];
const USER_PLANS: AdminUser["plan"][] = ["trial", "essential", "pro", "power"];

function UsersView({ currentUserId }: { currentUserId: number }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Pick<AdminUser, "role" | "plan">>>({});
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadUsers = async () => {
    setError(null);
    try {
      const items = await api.listAdminUsers();
      setUsers(items);
      setDrafts(Object.fromEntries(items.map((user) => [user.id, { role: user.role, plan: user.plan }])));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const saveUser = async (user: AdminUser) => {
    const draft = drafts[user.id];
    if (!draft) return;
    setSavingId(user.id);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.updateAdminUser(user.id, draft);
      setUsers((current) => current.map((item) => item.id === updated.id ? updated : item));
      setNotice(`${updated.email} access updated.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSavingId(null);
    }
  };

  const filteredUsers = users.filter((user) => user.email.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <main className="admin-content">
      <div className="admin-toolbar">
        <div><h2>Users &amp; Access</h2><p className="meta">{users.length} registered user{users.length === 1 ? "" : "s"}</p></div>
        <div className="admin-search"><Search size={16} aria-hidden="true" /><input aria-label="Search users" value={search} placeholder="Search by email" onChange={(event) => setSearch(event.target.value)} /></div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <div className="admin-delete-result success" role="status"><span>{notice}</span><button className="icon-btn" onClick={() => setNotice(null)} aria-label="Dismiss message"><X size={15} /></button></div>}
      <div className="admin-table-wrap">
        <table className="admin-table admin-users-table">
          <thead><tr><th>User</th><th>Verified</th><th>Role</th><th>Plan</th><th>Joined</th><th aria-label="Actions" /></tr></thead>
          <tbody>{filteredUsers.length === 0 ? <tr><td colSpan={6} className="admin-empty">No matching users.</td></tr> : filteredUsers.map((user) => {
            const draft = drafts[user.id] ?? { role: user.role, plan: user.plan };
            const unchanged = draft.role === user.role && draft.plan === user.plan;
            return <tr key={user.id}>
              <td><strong>{user.email}</strong>{user.id === currentUserId && <small className="admin-current-user">You</small>}</td>
              <td>{user.is_email_verified ? "Verified" : "Pending"}</td>
              <td><select aria-label={`Role for ${user.email}`} value={draft.role} disabled={user.id === currentUserId} onChange={(event) => setDrafts((current) => ({ ...current, [user.id]: { ...draft, role: event.target.value as AdminUser["role"] } }))}>{USER_ROLES.map((role) => <option key={role} value={role}>{role === "admin" ? "Administrator" : "User"}</option>)}</select></td>
              <td><select aria-label={`Plan for ${user.email}`} value={draft.plan} onChange={(event) => setDrafts((current) => ({ ...current, [user.id]: { ...draft, plan: event.target.value as AdminUser["plan"] } }))}>{USER_PLANS.map((plan) => <option key={plan} value={plan}>{plan.charAt(0).toUpperCase() + plan.slice(1)}</option>)}</select></td>
              <td>{new Date(user.created_at).toLocaleDateString()}</td>
              <td><button className="icon-btn" disabled={unchanged || savingId === user.id} onClick={() => void saveUser(user)} title="Save user access" aria-label={`Save access for ${user.email}`}><Save size={15} /></button></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </main>
  );
}

function AIModelsView() {
  const [data, setData] = useState<AIModelsData | null>(null);
  const [draftProvider, setDraftProvider] = useState<"anthropic" | "openai">("anthropic");
  const [draftModel, setDraftModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api.getAIModels().then((models) => {
      setData(models);
      const provider = models.providers.find((item) => item.id === models.active_provider) ?? models.providers[0];
      setDraftProvider(provider.id);
      setDraftModel(provider.selected_model);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, []);

  const applyModel = async () => {
    if (!data || !draftModel) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.selectAIModel(draftProvider, draftModel);
      setData({
        ...data,
        active_provider: result.active_provider,
        providers: data.providers.map((provider) => provider.id === result.active_provider ? { ...provider, selected_model: result.selected_model } : provider),
      });
      const provider = data.providers.find((item) => item.id === result.active_provider);
      setNotice(`${provider?.models.find((model) => model.id === result.selected_model)?.name ?? result.selected_model} on ${provider?.name ?? result.active_provider} is now active.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  const provider = data?.providers.find((item) => item.id === draftProvider) ?? null;
  const unchanged = data?.active_provider === draftProvider && provider?.selected_model === draftModel;

  return (
    <main className="admin-content">
      <div className="admin-toolbar">
        <div><h2>Models &amp; Pricing</h2><p className="meta">Standard API rates · USD per million tokens</p></div>
        <button className="btn" disabled={!provider?.configured || saving || unchanged} onClick={() => void applyModel()}>{saving ? "Applying…" : "Use selected model"}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <div className="admin-delete-result success" role="status"><span>{notice}</span><button className="icon-btn" onClick={() => setNotice(null)} aria-label="Dismiss message"><X size={15} /></button></div>}
      {!data ? !error && <p className="meta">Loading models…</p> : (
        <>
          <div className="ai-provider-tabs" role="tablist" aria-label="AI provider">
            {data.providers.map((item) => <button key={item.id} role="tab" aria-selected={draftProvider === item.id} className={draftProvider === item.id ? "active" : ""} onClick={() => { setDraftProvider(item.id); setDraftModel(item.selected_model); setNotice(null); }}>{item.name}{data.active_provider === item.id && <span>Active</span>}</button>)}
          </div>
          {!provider?.configured && <p className="error">{provider?.name} cannot be activated until its API key is configured.</p>}
          <div className="admin-table-wrap">
            <table className="admin-table ai-model-table">
              <thead><tr><th aria-label="Select model" /><th>Model</th><th>Input</th>{draftProvider === "openai" && <th>Cached input</th>}<th>Output</th><th>Model ID</th></tr></thead>
              <tbody>{provider?.models.map((model) => (
                <tr key={model.id} className={data.active_provider === draftProvider && model.id === provider.selected_model ? "ai-model-active" : ""} onClick={() => provider.configured && setDraftModel(model.id)}>
                  <td><input type="radio" name="ai-model" value={model.id} checked={draftModel === model.id} onChange={() => setDraftModel(model.id)} aria-label={`Select ${model.name}`} /></td>
                  <td><strong>{model.name}</strong>{data.active_provider === draftProvider && model.id === provider.selected_model && <span className="ai-model-current">Current</span>}{model.note && <small>{model.note}</small>}</td>
                  <td>${model.input_price.toFixed(2)} / MTok</td>
                  {draftProvider === "openai" && <td>{model.cached_input_price == null ? "—" : `$${model.cached_input_price.toFixed(3)} / MTok`}</td>}
                  <td>${model.output_price.toFixed(2)} / MTok</td>
                  <td><code>{model.id}</code></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="meta ai-pricing-source">Pricing source: <a href={provider?.pricing_source} target="_blank" rel="noreferrer">{provider?.name} API pricing</a>. Estimates use standard uncached input and output rates; they exclude service tiers, batch discounts, caching adjustments, data residency, tools, and other feature charges.</p>
        </>
      )}
    </main>
  );
}

function formatTokens(value: number | null): string {
  return (value ?? 0).toLocaleString();
}

function formatCost(value: number | null): string {
  return value == null ? "Unavailable" : `$${value.toFixed(4)}`;
}

function formatDuration(value: number | null): string {
  if (value == null) return "Unavailable";
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.round(value)} ms`;
}

function operationName(value: string): string {
  return value.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function AIUsageView() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AIUsageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUsage = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getAIUsage(days));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  return (
    <main className="admin-content">
      <div className="admin-toolbar">
        <div><h2>AI Usage</h2><p className="meta">Provider-reported token consumption</p></div>
        <div className="ai-usage-controls">
          <label>Period<select value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option><option value={365}>1 year</option></select></label>
          <button className="icon-btn" onClick={() => void loadUsage()} title="Refresh" aria-label="Refresh AI usage"><RefreshCw size={16} /></button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {loading && !data ? <p className="meta">Loading AI usage…</p> : data && (
        <>
          <div className="ai-usage-metrics">
            <div><span>Requests</span><strong>{formatTokens(data.totals.requests)}</strong></div>
            <div><span>Total tokens</span><strong>{formatTokens(data.totals.total_tokens)}</strong><small>{formatTokens(data.totals.input_tokens)} in · {formatTokens(data.totals.output_tokens)} out</small></div>
            <div><span>Failures</span><strong>{formatTokens(data.totals.failures)}</strong></div>
            <div><span>Average AI time</span><strong>{formatDuration(data.totals.average_duration_ms)}</strong><small>Provider response latency</small></div>
            <div><span>Estimated spend</span><strong>{formatCost(data.totals.estimated_cost_usd)}</strong><small>{data.pricing_configured ? "Based on configured rates" : "Set LLM token pricing in the backend"}</small></div>
          </div>
          <section className="ai-usage-section">
            <h3>Usage by user</h3>
            <div className="admin-table-wrap"><table className="admin-table ai-usage-table"><thead><tr><th>User</th><th>Requests</th><th>Tokens</th><th>Avg time</th><th>Failures</th><th>Estimated spend</th></tr></thead><tbody>{data.users.length === 0 ? <tr><td colSpan={6} className="admin-empty">No attributed AI calls in this period.</td></tr> : data.users.map((item) => <tr key={item.user_id ?? "unknown"}><td>{item.email ?? "Unknown / historical"}</td><td>{formatTokens(item.requests)}</td><td>{formatTokens(item.total_tokens)}</td><td>{formatDuration(item.average_duration_ms)}</td><td>{formatTokens(item.failures)}</td><td>{formatCost(item.estimated_cost_usd)}</td></tr>)}</tbody></table></div>
          </section>
          <section className="ai-usage-section">
            <h3>Usage by operation</h3>
            <div className="admin-table-wrap"><table className="admin-table ai-usage-table"><thead><tr><th>Operation</th><th>Requests</th><th>Tokens</th><th>Avg time</th><th>Estimated spend</th></tr></thead><tbody>{data.operations.length === 0 ? <tr><td colSpan={5} className="admin-empty">No AI calls in this period.</td></tr> : data.operations.map((item) => <tr key={item.operation}><td>{operationName(item.operation)}</td><td>{formatTokens(item.requests)}</td><td>{formatTokens(item.total_tokens)}</td><td>{formatDuration(item.average_duration_ms)}</td><td>{formatCost(item.estimated_cost_usd)}</td></tr>)}</tbody></table></div>
          </section>
          <section className="ai-usage-section">
            <h3>Recent calls</h3>
            <div className="admin-table-wrap"><table className="admin-table ai-usage-table"><thead><tr><th>Time</th><th>Operation</th><th>Provider / model</th><th>Tokens</th><th>Duration</th><th>Status</th></tr></thead><tbody>{data.recent.length === 0 ? <tr><td colSpan={6} className="admin-empty">No AI calls recorded yet.</td></tr> : data.recent.map((item) => <tr key={item.id}><td>{formatLogTime(item.created_at)}</td><td>{operationName(item.operation)}</td><td>{item.provider} · {item.model}</td><td>{item.total_tokens == null ? "Unavailable" : formatTokens(item.total_tokens)}</td><td>{formatDuration(item.duration_ms)}</td><td title={item.error ?? undefined}><span className={`ai-call-status ${item.successful ? "success" : "failed"}`}>{item.successful ? "Success" : "Failed"}</span></td></tr>)}</tbody></table></div>
          </section>
        </>
      )}
    </main>
  );
}

interface SystemLogRow {
  id: number;
  level: string;
  message: string;
  source: string | null;
  method: string | null;
  status_code: number | null;
  detail: string | null;
  created_at: string;
}

function formatLogTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function SystemLogsView() {
  const [data, setData] = useState<AdminTableData | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(LOGS_PAGE_SIZE);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SystemLogRow | null>(null);

  const loadLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getAdminTable("system_logs", {
        page,
        page_size: pageSize,
        search: search || undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, sortBy, sortDir, search]);

  const removeLog = async (id: number) => {
    if (!window.confirm(`Delete log ${id}? This cannot be undone.`)) return;
    try {
      await api.deleteAdminRow("system_logs", id);
      if (data?.rows.length === 1 && page > 1) setPage((current) => current - 1);
      else await loadLogs();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const rows = (data?.rows ?? []) as unknown as SystemLogRow[];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <main className="admin-content">
      <div className="admin-toolbar">
        <div><h2>System Logs</h2>{data && <p className="meta">{data.total} entr{data.total === 1 ? "y" : "ies"}</p>}</div>
        <div className="admin-search" style={{ gap: 10 }}>
          <form className="admin-search" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchInput); }}>
            <Search size={16} aria-hidden="true" />
            <input aria-label="Search logs" value={searchInput} placeholder="Search logs" onChange={(event) => setSearchInput(event.target.value)} />
          </form>
          <button className="icon-btn" onClick={() => void loadLogs()} title="Refresh" aria-label="Refresh logs"><RefreshCw size={16} /></button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {data && data.total > 0 && (
        <div className="search-results-pagination">
          <div className="log-controls">
            <label>
              Sort by
              <select value={sortBy} onChange={(event) => { setSortBy(event.target.value); setPage(1); }}>
                <option value="created_at">Time</option>
                <option value="level">Level</option>
                <option value="status_code">Status</option>
                <option value="method">Method</option>
                <option value="source">Path</option>
              </select>
            </label>
            <label>
              Order
              <select value={sortDir} onChange={(event) => { setSortDir(event.target.value as "asc" | "desc"); setPage(1); }}>
                <option value="desc">Newest / Descending</option>
                <option value="asc">Oldest / Ascending</option>
              </select>
            </label>
            <label>
              Display
              <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              entries
            </label>
          </div>
          <div className="search-results-pages">
            <span className="meta">Page {data.page} of {totalPages}</span>
            <button className="icon-btn" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} aria-label="Previous page" title="Previous page"><ChevronLeft size={16} /></button>
            <button className="icon-btn" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} aria-label="Next page" title="Next page"><ChevronRight size={16} /></button>
          </div>
        </div>
      )}
      {loading ? <p className="meta">Loading logs…</p> : rows.length === 0 ? (
        <div className="panel"><p className="meta" style={{ margin: 0 }}>No log entries.</p></div>
      ) : (
        rows.map((log) => (
          <div className="job log-card" key={log.id} role="button" tabIndex={0} onClick={() => setSelected(log)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(log); } }}>
            <div className="log-card-header">
              <span className={`log-level ${log.level}`}>{log.level}</span>
              <span className="meta">{formatLogTime(log.created_at)}</span>
              <button className="icon-btn danger log-card-delete" onClick={(event) => { event.stopPropagation(); void removeLog(log.id); }} title="Delete log" aria-label={`Delete log ${log.id}`}><Trash2 size={15} /></button>
            </div>
            <div className="log-card-message">{log.message}</div>
            <div className="meta">
              {[log.method, log.status_code != null ? `status ${log.status_code}` : null, log.source].filter(Boolean).join(" · ")}
            </div>
          </div>
        ))
      )}
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)} role="presentation">
          <section className="modal admin-edit-modal" role="dialog" aria-modal="true" aria-labelledby="log-detail-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <strong id="log-detail-title"><AlertTriangle size={16} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 6 }} />Log #{selected.id}</strong>
              <button className="icon-btn" onClick={() => setSelected(null)} aria-label="Close log detail"><X size={18} /></button>
            </div>
            <p className="meta">{formatLogTime(selected.created_at)} · <span className={`log-level ${selected.level}`}>{selected.level}</span>{selected.status_code != null && ` · ${selected.status_code}`}{selected.method && ` · ${selected.method}`}{selected.source && ` · ${selected.source}`}</p>
            <p><strong>{selected.message}</strong></p>
            {selected.detail && <pre>{selected.detail}</pre>}
            <div className="actions"><button className="btn secondary" onClick={() => void removeLog(selected.id).then(() => setSelected(null))}><Trash2 size={16} /> Delete</button><button className="btn secondary" onClick={() => setSelected(null)}>Close</button></div>
          </section>
        </div>
      )}
    </main>
  );
}
