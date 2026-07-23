import { ChevronLeft, ChevronRight, Database, Pencil, Save, Search, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { AdminTableData, AdminTableSummary } from "../types";

const PAGE_SIZE = 25;
const readOnlyColumns = new Set(["id", "created_at", "updated_at"]);

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

export default function AdminTab() {
  const [tables, setTables] = useState<AdminTableSummary[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [data, setData] = useState<AdminTableData | null>(null);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null);
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
    setEditingRow(row);
    setDraft(Object.fromEntries(Object.entries(row).map(([key, value]) => [key, displayValue(value)])));
  };

  const saveEdit = async () => {
    if (!selectedTable || !editingRow) return;
    const changes = Object.fromEntries(
      Object.entries(draft)
        .filter(([key]) => !readOnlyColumns.has(key))
        .map(([key, value]) => [key, parseValue(value)]),
    );
    try {
      await api.updateAdminRow(selectedTable, Number(editingRow.id), changes);
      setEditingRow(null);
      await loadTable();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const removeRow = async (row: Record<string, unknown>) => {
    if (!selectedTable || !window.confirm(`Delete row ${row.id}? This cannot be undone.`)) return;
    try {
      await api.deleteAdminRow(selectedTable, Number(row.id));
      if (data?.rows.length === 1 && page > 1) setPage((current) => current - 1);
      else await loadTable();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <section className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-heading"><Database size={18} aria-hidden="true" /><strong>Database tables</strong></div>
        {tables.map((table) => (
          <button className={`admin-table-link ${selectedTable === table.name ? "active" : ""}`} key={table.name} onClick={() => chooseTable(table.name)}>
            <span>{table.name}</span><small>{table.columns.length}</small>
          </button>
        ))}
      </aside>
      <main className="admin-content">
        <div className="admin-toolbar">
          <div><h2>{selectedTable ?? "Tables"}</h2>{data && <p className="meta">{data.total} row{data.total === 1 ? "" : "s"}</p>}</div>
          <form className="admin-search" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchInput); }}>
            <Search size={16} aria-hidden="true" />
            <input aria-label="Search table" value={searchInput} placeholder="Search rows" onChange={(event) => setSearchInput(event.target.value)} />
          </form>
        </div>
        {error && <p className="error">{error}</p>}
        {loading ? <p className="meta">Loading table…</p> : data && (
          <>
            <div className="admin-table-wrap" ref={tableWrapRef}>
              <table className="admin-table">
                <thead><tr>{data.columns.map((column) => <th key={column}><button onClick={() => sort(column)}>{column}{sortBy === column && <span aria-hidden="true"> {sortDir === "asc" ? "↑" : "↓"}</span>}</button></th>)}<th aria-label="Row actions" /></tr></thead>
                <tbody>{data.rows.length === 0 ? <tr><td colSpan={data.columns.length + 1} className="admin-empty">No matching rows.</td></tr> : data.rows.map((row) => <tr key={String(row.id)}>{data.columns.map((column) => <td key={column} title={displayValue(row[column])}>{displayValue(row[column])}</td>)}<td className="admin-row-actions"><button className="icon-btn" onClick={() => startEdit(row)} title="Edit row" aria-label={`Edit row ${row.id}`}><Pencil size={15} /></button><button className="icon-btn danger" onClick={() => void removeRow(row)} title="Delete row" aria-label={`Delete row ${row.id}`}><Trash2 size={15} /></button></td></tr>)}</tbody>
              </table>
            </div>
            {tableOverflows && <p className="admin-scroll-cue" aria-hidden="true">Scroll horizontally to view all columns <span>→</span></p>}
            <div className="admin-pagination"><span className="meta">Page {data.page} of {totalPages}</span><div><button className="icon-btn" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button><button className="icon-btn" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} aria-label="Next page"><ChevronRight size={16} /></button></div></div>
          </>
        )}
      </main>
      {editingRow && data && <div className="modal-backdrop" onClick={() => setEditingRow(null)} role="presentation"><section className="modal admin-edit-modal" role="dialog" aria-modal="true" aria-labelledby="admin-edit-title" onClick={(event) => event.stopPropagation()}><div className="modal-header"><strong id="admin-edit-title">Edit {selectedTable} row</strong><button className="icon-btn" onClick={() => setEditingRow(null)} aria-label="Close editor"><X size={18} /></button></div><div className="admin-edit-fields">{data.columns.map((column) => <label key={column}>{column}{readOnlyColumns.has(column) ? <input value={draft[column] ?? ""} readOnly /> : <textarea value={draft[column] ?? ""} onChange={(event) => setDraft((current) => ({ ...current, [column]: event.target.value }))} />}</label>)}</div><div className="actions"><button className="btn" onClick={() => void saveEdit()}><Save size={16} /> Save changes</button><button className="btn secondary" onClick={() => setEditingRow(null)}>Cancel</button></div></section></div>}
    </section>
  );
}
