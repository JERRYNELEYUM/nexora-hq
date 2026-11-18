import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { Download, FileText, Paperclip, Trash2, Upload } from "lucide-react";

export type EntityType = "client" | "project" | "ticket" | "invoice" | "expense";
type Row = { id: string; file_name: string; storage_path: string; mime_type: string | null; size_bytes: number; uploaded_by_email: string | null; created_at: string };

const BUCKET = "hq-attachments";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  "application/pdf": "PDF", "image/png": "PNG", "image/jpeg": "JPG", "image/webp": "WEBP", "text/plain": "TXT", "text/csv": "CSV",
  "application/zip": "ZIP",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX"
};
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.zip,.docx,.xlsx";

const size = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;
const safeName = (name: string) => {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot).replace(/[^A-Za-z0-9.]/g, "").slice(0, 10) : "";
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "file";
  return base + ext;
};

export default function Attachments({ organizationId, entityType, entityId, canWrite, title = "Files" }: {
  organizationId: string; entityType: EntityType; entityId: string; canWrite: boolean; title?: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [organizationId, entityType, entityId]);

  async function load() {
    if (!supabase) return;
    setLoading(true); setMessage("");
    const { data, error } = await supabase.from("attachments")
      .select("id,file_name,storage_path,mime_type,size_bytes,uploaded_by_email,created_at")
      .eq("organization_id", organizationId).eq("entity_type", entityType).eq("entity_id", entityId)
      .order("created_at", { ascending: false });
    if (error) setMessage(`Could not load files: ${error.message}. Run nexora_attachments.sql in the Supabase SQL Editor if you have not yet.`);
    else setRows((data ?? []) as Row[]);
    setLoading(false);
  }

  async function upload(file: File) {
    if (!supabase) return;
    if (file.size === 0) { setMessage("That file is empty."); return; }
    if (file.size > MAX_BYTES) { setMessage(`"${file.name}" is ${size(file.size)}. The limit is 10 MB per file.`); return; }
    if (!ALLOWED[file.type]) { setMessage(`"${file.name}" is not an allowed file type. Allowed: PDF, PNG, JPG, WEBP, TXT, CSV, ZIP, DOCX, XLSX.`); return; }
    setBusy("upload"); setMessage("");
    const path = `${organizationId}/${entityType}/${entityId}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (up.error) { setMessage(`Upload failed: ${up.error.message}`); setBusy(null); return; }
    const { error } = await supabase.from("attachments").insert({
      organization_id: organizationId, entity_type: entityType, entity_id: entityId,
      file_name: file.name, storage_path: path, mime_type: file.type, size_bytes: file.size
    });
    if (error) {
      await supabase.storage.from(BUCKET).remove([path]);
      setMessage(`File not saved: ${error.message}`);
    } else { setMessage(`"${file.name}" uploaded.`); await load(); }
    setBusy(null);
    if (input.current) input.current.value = "";
  }

  async function open(row: Row) {
    if (!supabase) return;
    setBusy(row.id); setMessage("");
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_path, 60, { download: row.file_name });
    if (error || !data?.signedUrl) setMessage(`Could not open the file: ${error?.message ?? "no link returned"}`);
    else { const a = document.createElement("a"); a.href = data.signedUrl; a.rel = "noreferrer"; document.body.appendChild(a); a.click(); a.remove(); }
    setBusy(null);
  }

  async function remove(row: Row) {
    if (!supabase) return;
    if (!window.confirm(`Delete "${row.file_name}"? This cannot be undone.`)) return;
    setBusy(row.id); setMessage("");
    const { error } = await supabase.from("attachments").delete().eq("id", row.id).eq("organization_id", organizationId);
    if (error) { setMessage(`Delete failed: ${error.message}`); setBusy(null); return; }
    const rm = await supabase.storage.from(BUCKET).remove([row.storage_path]);
    if (rm.error) setMessage("The record was removed, but the stored file could not be deleted. Ask an administrator to clean it up.");
    setRows(l => l.filter(r => r.id !== row.id));
    setBusy(null);
  }

  return <div style={{marginTop:20}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
      <b><Paperclip size={15} style={{verticalAlign:"-2px"}}/> {title}</b>
      {canWrite && <>
        <input ref={input} type="file" accept={ACCEPT} style={{display:"none"}} aria-label="Choose a file to upload"
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }}/>
        <button type="button" className="secondary" disabled={busy === "upload"} onClick={() => input.current?.click()}>
          <Upload size={14}/> {busy === "upload" ? "Uploading…" : "Upload file"}
        </button>
      </>}
    </div>
    {message && <div className="alert" style={{marginTop:10}}>{message}</div>}
    <div style={{marginTop:10}}>
      {loading ? <p className="muted tiny">Loading files…</p> : rows.map(r => <div className="list-row" key={r.id}>
        <div className="round-icon"><FileText size={17}/></div>
        <div className="grow"><b>{r.file_name}</b><small>{ALLOWED[r.mime_type ?? ""] ?? "File"} · {size(r.size_bytes)} · {new Date(r.created_at).toLocaleDateString()}{r.uploaded_by_email ? ` · ${r.uploaded_by_email}` : ""}</small></div>
        <button type="button" className="secondary" disabled={busy === r.id} onClick={() => open(r)}><Download size={14}/> Download</button>
        {canWrite && <button type="button" className="icon-btn" aria-label={`Delete ${r.file_name}`} disabled={busy === r.id} onClick={() => remove(r)}><Trash2 size={15}/></button>}
      </div>)}
      {!loading && !rows.length && <p className="empty">No files attached yet.{canWrite ? " Upload contracts, screenshots or receipts (max 10 MB each)." : ""}</p>}
    </div>
  </div>;
}
