import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Database, Pencil, RefreshCw, Save, ScrollText, Search, Server, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { AdminTableData, AdminTableSummary } from "../types";

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

export default function AdminTab() {
  const [view, setView] = useState<"logs" | "tables">("logs");
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
          <button className={`admin-table-link ${view === "logs" ? "active" : ""}`} onClick={() => setView("logs")}>
            <span>System Logs</span>
          </button>
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
      {view === "logs" ? <SystemLogsView /> : (
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
