import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { AlertTriangle, CheckCircle2, ChevronRight, CircleHelp, Plus, RefreshCw, Search, Trash2, X, Wrench } from "lucide-react";

type TStatus = "open" | "in_progress" | "waiting" | "resolved" | "closed";
type TPriority = "low" | "medium" | "high" | "urgent";
type Channel = "phone" | "whatsapp" | "email" | "in_person" | "other";

type Ticket = {
  id: string; client_id: string | null; application_id: string | null; title: string; description: string | null;
  contact_name: string | null; channel: Channel; status: TStatus; priority: TPriority; created_at: string; resolved_at: string | null;
};
type Note = { id: string; ticket_id: string; body: string; author_email: string | null; created_at: string };

const statusLabels: Record<TStatus, string> = { open: "Open", in_progress: "In progress", waiting: "Waiting on client", resolved: "Resolved", closed: "Closed" };
const priorityLabels: Record<TPriority, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
const channelLabels: Record<Channel, string> = { phone: "Phone call", whatsapp: "WhatsApp", email: "Email", in_person: "In person", other: "Other" };
const isDone = (s: TStatus) => s === "resolved" || s === "closed";
const emptyForm = { title: "", description: "", client_id: "", application_id: "", contact_name: "", channel: "whatsapp" as Channel, priority: "medium" as TPriority };

export default function SupportModule({ organizationId, clients, apps, canManage }: {
  organizationId: string;
  clients: { id: string; client_name: string }[];
  apps: { id: string; app_name: string }[];
  canManage: boolean;
}) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"active" | "all" | TStatus>("active");
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newNote, setNewNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const clientName = useMemo(() => new Map(clients.map(c => [c.id, c.client_name])), [clients]);
  const appName = useMemo(() => new Map(apps.map(a => [a.id, a.app_name])), [apps]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [organizationId]);

  async function load() {
    if (!supabase) return;
    setLoading(true); setMessage("");
    const [t, n] = await Promise.all([
      supabase.from("support_tickets")
        .select("id,client_id,application_id,title,description,contact_name,channel,status,priority,created_at,resolved_at")
        .eq("organization_id", organizationId).order("created_at", { ascending: false }),
      supabase.from("ticket_notes").select("id,ticket_id,body,author_email,created_at")
        .eq("organization_id", organizationId).order("created_at", { ascending: true })
    ]);
    if (t.error) setMessage(`Could not load tickets: ${t.error.message}. Run nexora_support_finance.sql in the Supabase SQL Editor if you have not yet.`);
    else setTickets((t.data ?? []) as Ticket[]);
    if (n.error) setMessage(m => m || `Could not load notes: ${n.error!.message}`);
    else setNotes((n.data ?? []) as Note[]);
    setLoading(false);
  }

  const stats = useMemo(() => ({
    open: tickets.filter(t => t.status === "open").length,
    progress: tickets.filter(t => t.status === "in_progress" || t.status === "waiting").length,
    urgent: tickets.filter(t => !isDone(t.status) && (t.priority === "urgent" || t.priority === "high")).length,
    resolved: tickets.filter(t => isDone(t.status)).length
  }), [tickets]);

  const filtered = useMemo(() => tickets.filter(t => {
    if (filter === "active" && isDone(t.status)) return false;
    if (filter !== "active" && filter !== "all" && t.status !== filter) return false;
    const hay = `${t.title} ${t.contact_name ?? ""} ${clientName.get(t.client_id ?? "") ?? ""}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  }), [tickets, filter, search, clientName]);

  const selected = tickets.find(t => t.id === selectedId) ?? null;
  const selectedNotes = notes.filter(n => n.ticket_id === selectedId);

  async function createTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setSaving(true); setMessage("");
    const { data, error } = await supabase.from("support_tickets").insert({
      organization_id: organizationId, title: form.title.trim(),
      description: form.description.trim() || null,
      client_id: form.client_id || null, application_id: form.application_id || null,
      contact_name: form.contact_name.trim() || null, channel: form.channel, priority: form.priority
    }).select("id").single();
    if (error) setMessage(`Ticket not saved: ${error.message}`);
    else { setShowNew(false); setForm(emptyForm); setMessage("Ticket logged."); await load(); if (data?.id) setSelectedId(data.id); }
    setSaving(false);
  }

  async function patchTicket(t: Ticket, patch: Partial<Pick<Ticket, "status" | "priority">>) {
    if (!supabase) return;
    setBusyId(t.id); setMessage("");
    const { error } = await supabase.from("support_tickets").update(patch).eq("id", t.id).eq("organization_id", organizationId);
    if (error) setMessage(`Update failed: ${error.message}`);
    else await load();
    setBusyId(null);
  }

  async function deleteTicket(t: Ticket) {
    if (!supabase) return;
    if (!window.confirm(`Delete ticket "${t.title}" and its notes? This cannot be undone.`)) return;
    setBusyId(t.id); setMessage("");
    const { error } = await supabase.from("support_tickets").delete().eq("id", t.id).eq("organization_id", organizationId);
    if (error) setMessage(`Delete failed: ${error.message}`);
    else { setTickets(l => l.filter(x => x.id !== t.id)); setNotes(l => l.filter(n => n.ticket_id !== t.id)); setSelectedId(null); setMessage("Ticket deleted."); }
    setBusyId(null);
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !selected || !newNote.trim()) return;
    setBusyId("note"); setMessage("");
    const { data, error } = await supabase.from("ticket_notes")
      .insert({ organization_id: organizationId, ticket_id: selected.id, body: newNote.trim() })
      .select("id,ticket_id,body,author_email,created_at").single();
    if (error) setMessage(`Note not added: ${error.message}`);
    else { setNotes(l => [...l, data as Note]); setNewNote(""); }
    setBusyId(null);
  }

  async function deleteNote(n: Note) {
    if (!supabase) return;
    setBusyId(n.id);
    const { error } = await supabase.from("ticket_notes").delete().eq("id", n.id).eq("organization_id", organizationId);
    if (error) setMessage(`Note removal failed: ${error.message}`);
    else setNotes(l => l.filter(x => x.id !== n.id));
    setBusyId(null);
  }

  return <>
    <div className="stats">
      <div className="stat-card"><div className="stat-top"><span>Open</span><span className="stat-icon"><CircleHelp/></span></div><strong>{stats.open}</strong><small>Waiting for a first response</small></div>
      <div className="stat-card"><div className="stat-top"><span>In progress</span><span className="stat-icon"><Wrench/></span></div><strong>{stats.progress}</strong><small>Being worked on</small></div>
      <div className="stat-card"><div className="stat-top"><span>High priority</span><span className="stat-icon"><AlertTriangle/></span></div><strong>{stats.urgent}</strong><small>High or urgent, still unresolved</small></div>
      <div className="stat-card"><div className="stat-top"><span>Resolved</span><span className="stat-icon"><CheckCircle2/></span></div><strong>{stats.resolved}</strong><small>Resolved or closed</small></div>
    </div>

    <section className="panel">
      <div className="toolbar">
        <div><b>Support tickets</b><p className="muted tiny">Client issues, requests and follow-ups</p></div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
          <div className="search"><Search size={16}/><input placeholder="Search tickets…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
          <select aria-label="Filter tickets" value={filter} onChange={e=>setFilter(e.target.value as "active" | "all" | TStatus)}>
            <option value="active">Unresolved</option><option value="all">All tickets</option>
            {(Object.keys(statusLabels) as TStatus[]).map(s=><option key={s} value={s}>{statusLabels[s]}</option>)}
          </select>
          <button className="secondary" type="button" onClick={load} disabled={loading}><RefreshCw size={15}/> Refresh</button>
          {canManage && <button className="primary" type="button" onClick={()=>setShowNew(true)}><Plus size={17}/> Log ticket</button>}
        </div>
      </div>
      {message && <div className="alert" style={{marginBottom:15}}>{message}</div>}
      {loading ? <p className="muted">Loading tickets…</p> :
      <div className="table-wrap"><table>
        <thead><tr><th>TICKET</th><th>STATUS</th><th>PRIORITY</th><th>CHANNEL</th><th>LOGGED</th><th></th></tr></thead>
        <tbody>
          {filtered.map(t => <tr key={t.id}>
            <td><b>{t.title}</b><small className="subcell">{clientName.get(t.client_id ?? "") ?? "No client"}{t.contact_name ? ` · ${t.contact_name}` : ""}</small></td>
            <td>{canManage
              ? <select aria-label={`Status for ${t.title}`} value={t.status} disabled={busyId===t.id} onChange={e=>patchTicket(t,{status:e.target.value as TStatus})}>
                  {(Object.keys(statusLabels) as TStatus[]).map(s=><option key={s} value={s}>{statusLabels[s]}</option>)}
                </select>
              : <span className={`status ${t.status}`}>{statusLabels[t.status]}</span>}</td>
            <td><span className={`status ${t.priority}`}>{priorityLabels[t.priority]}</span></td>
            <td>{channelLabels[t.channel]}</td>
            <td>{new Date(t.created_at).toLocaleDateString()}</td>
            <td><button type="button" className="secondary" onClick={()=>setSelectedId(t.id)}>Open <ChevronRight size={14}/></button></td>
          </tr>)}
          {!filtered.length && <tr><td colSpan={6} className="empty">{tickets.length ? "No tickets match this view." : canManage ? "No tickets yet. Select Log ticket when a client reports an issue." : "No tickets have been logged yet."}</td></tr>}
        </tbody>
      </table></div>}
      {!canManage && <p className="tiny muted" style={{marginTop:15}}>You can view tickets and notes. Support officers, technical administrators, operations managers and organisation administrators can make changes.</p>}
    </section>

    {selected && <section className="panel" style={{marginTop:18}}>
      <div className="toolbar">
        <div>
          <b>{selected.title}</b>
          <p className="muted tiny">{clientName.get(selected.client_id ?? "") ?? "No client"}{selected.application_id && appName.get(selected.application_id) ? ` · ${appName.get(selected.application_id)}` : ""} · via {channelLabels[selected.channel]}{selected.resolved_at ? ` · resolved ${new Date(selected.resolved_at).toLocaleDateString()}` : ""}</p>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          {canManage && <select aria-label="Priority" value={selected.priority} disabled={busyId===selected.id} onChange={e=>patchTicket(selected,{priority:e.target.value as TPriority})}>
            {(Object.keys(priorityLabels) as TPriority[]).map(x=><option key={x} value={x}>{priorityLabels[x]} priority</option>)}
          </select>}
          {canManage && <button type="button" className="secondary" disabled={busyId===selected.id} onClick={()=>deleteTicket(selected)}><Trash2 size={14}/> Delete</button>}
          <button type="button" className="icon-btn" aria-label="Close ticket" onClick={()=>setSelectedId(null)}><X size={18}/></button>
        </div>
      </div>
      {selected.description && <p style={{marginBottom:16}}>{selected.description}</p>}
      <b>Activity notes</b>
      <div style={{marginTop:10}}>
        {selectedNotes.map(n => <div className="list-row" key={n.id}>
          <div className="grow"><span>{n.body}</span><small>{n.author_email ?? "Team member"} · {new Date(n.created_at).toLocaleString()}</small></div>
          {canManage && <button type="button" className="icon-btn" aria-label="Remove note" disabled={busyId===n.id} onClick={()=>deleteNote(n)}><Trash2 size={15}/></button>}
        </div>)}
        {!selectedNotes.length && <p className="empty">No notes yet.{canManage ? " Record what was said or done." : ""}</p>}
      </div>
      {canManage && <form onSubmit={addNote} style={{display:"flex",gap:10,marginTop:14}}>
        <input style={{flex:1}} value={newNote} onChange={e=>setNewNote(e.target.value)} placeholder="Add a note about this ticket…" aria-label="New note"/>
        <button className="primary" disabled={busyId==="note" || !newNote.trim()}><Plus size={16}/> Add note</button>
      </form>}
    </section>}

    {showNew && <div className="modal-backdrop"><form className="modal" onSubmit={createTicket}>
      <div className="modal-head"><div><h2>Log a ticket</h2><p className="muted tiny">Record an issue or request from a client.</p></div><button type="button" className="icon-btn" aria-label="Close" onClick={()=>setShowNew(false)}><X/></button></div>
      <label>Summary<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Receipts not printing at the till"/></label>
      <label>Client<select value={form.client_id} onChange={e=>setForm({...form,client_id:e.target.value})}>
        <option value="">No client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.client_name}</option>)}</select></label>
      <label>Application<select value={form.application_id} onChange={e=>setForm({...form,application_id:e.target.value})}>
        <option value="">None</option>{apps.map(a=><option key={a.id} value={a.id}>{a.app_name}</option>)}</select></label>
      <label>Contact person<input value={form.contact_name} onChange={e=>setForm({...form,contact_name:e.target.value})}/></label>
      <label>Reported through<select value={form.channel} onChange={e=>setForm({...form,channel:e.target.value as Channel})}>
        {(Object.keys(channelLabels) as Channel[]).map(c=><option key={c} value={c}>{channelLabels[c]}</option>)}</select></label>
      <label>Priority<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value as TPriority})}>
        {(Object.keys(priorityLabels) as TPriority[]).map(x=><option key={x} value={x}>{priorityLabels[x]}</option>)}</select></label>
      <label>Details<textarea rows={3} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="What happened, and what has the client already tried?"/></label>
      <div className="modal-actions"><button type="button" className="secondary" onClick={()=>setShowNew(false)}>Cancel</button><button className="primary" disabled={saving}>{saving?"Saving…":"Log ticket"}</button></div>
    </form></div>}
  </>;
}
