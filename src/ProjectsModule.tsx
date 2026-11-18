import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import Attachments from "./Attachments";
import { Activity, CheckCircle2, ChevronRight, Plus, RefreshCw, Search, Trash2, X, Clock, Hammer } from "lucide-react";

type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "cancelled";
type Priority = "low" | "medium" | "high";
type TaskStatus = "todo" | "in_progress" | "done";

type Project = {
  id: string; client_id: string | null; application_id: string | null;
  name: string; description: string | null; status: ProjectStatus; priority: Priority;
  start_date: string | null; due_date: string | null; created_at: string;
};
type Task = { id: string; project_id: string; title: string; status: TaskStatus; due_date: string | null; created_at: string };

const statusLabels: Record<ProjectStatus, string> = {
  planning: "Planning", active: "Active", on_hold: "On hold", completed: "Completed", cancelled: "Cancelled"
};
const priorityLabels: Record<Priority, string> = { low: "Low", medium: "Medium", high: "High" };
const taskLabels: Record<TaskStatus, string> = { todo: "To do", in_progress: "In progress", done: "Done" };

const emptyForm = {
  name: "", description: "", client_id: "", application_id: "",
  status: "planning" as ProjectStatus, priority: "medium" as Priority, start_date: "", due_date: ""
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmt = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString() : "—");

export default function ProjectsModule({ organizationId, clients, apps, canManage }: {
  organizationId: string;
  clients: { id: string; client_name: string }[];
  apps: { id: string; app_name: string }[];
  canManage: boolean;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProjectStatus>("all");
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTask, setNewTask] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const clientName = useMemo(() => new Map(clients.map(c => [c.id, c.client_name])), [clients]);
  const appName = useMemo(() => new Map(apps.map(a => [a.id, a.app_name])), [apps]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [organizationId]);

  async function load() {
    if (!supabase) return;
    setLoading(true); setMessage("");
    const [p, t] = await Promise.all([
      supabase.from("projects")
        .select("id,client_id,application_id,name,description,status,priority,start_date,due_date,created_at")
        .eq("organization_id", organizationId).order("created_at", { ascending: false }),
      supabase.from("project_tasks")
        .select("id,project_id,title,status,due_date,created_at")
        .eq("organization_id", organizationId).order("created_at", { ascending: true })
    ]);
    if (p.error) setMessage(`Could not load projects: ${p.error.message}. Run nexora_projects.sql in the Supabase SQL Editor if you have not yet.`);
    else setProjects((p.data ?? []) as Project[]);
    if (t.error) setMessage(m => m || `Could not load tasks: ${t.error!.message}`);
    else setTasks((t.data ?? []) as Task[]);
    setLoading(false);
  }

  const progress = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>();
    tasks.forEach(t => {
      const cur = map.get(t.project_id) ?? { done: 0, total: 0 };
      cur.total += 1; if (t.status === "done") cur.done += 1;
      map.set(t.project_id, cur);
    });
    return map;
  }, [tasks]);

  const isOverdue = (p: Project) => !!p.due_date && p.due_date < todayStr() && p.status !== "completed" && p.status !== "cancelled";

  const stats = useMemo(() => ({
    active: projects.filter(p => p.status === "active").length,
    planning: projects.filter(p => p.status === "planning").length,
    overdue: projects.filter(isOverdue).length,
    completed: projects.filter(p => p.status === "completed").length
  }), [projects]);

  const filtered = useMemo(() => projects.filter(p => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    const hay = `${p.name} ${clientName.get(p.client_id ?? "") ?? ""} ${appName.get(p.application_id ?? "") ?? ""}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  }), [projects, statusFilter, search, clientName, appName]);

  const selected = projects.find(p => p.id === selectedId) ?? null;
  const selectedTasks = tasks.filter(t => t.project_id === selectedId);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (form.start_date && form.due_date && form.due_date < form.start_date) {
      setMessage("The due date cannot be earlier than the start date."); return;
    }
    setSaving(true); setMessage("");
    const { data, error } = await supabase.from("projects").insert({
      organization_id: organizationId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      client_id: form.client_id || null,
      application_id: form.application_id || null,
      status: form.status, priority: form.priority,
      start_date: form.start_date || null, due_date: form.due_date || null
    }).select("id").single();
    if (error) setMessage(`Project not saved: ${error.message}`);
    else {
      setShowNew(false); setForm(emptyForm); setMessage("Project created.");
      await load(); if (data?.id) setSelectedId(data.id);
    }
    setSaving(false);
  }

  async function patchProject(p: Project, patch: Partial<Pick<Project, "status" | "priority">>) {
    if (!supabase) return;
    setBusyId(p.id); setMessage("");
    const { error } = await supabase.from("projects").update(patch).eq("id", p.id).eq("organization_id", organizationId);
    if (error) setMessage(`Update failed: ${error.message}`);
    else setProjects(list => list.map(x => x.id === p.id ? { ...x, ...patch } : x));
    setBusyId(null);
  }

  async function deleteProject(p: Project) {
    if (!supabase) return;
    if (!window.confirm(`Delete "${p.name}" and all of its tasks? This cannot be undone.`)) return;
    setBusyId(p.id); setMessage("");
    const { error } = await supabase.from("projects").delete().eq("id", p.id).eq("organization_id", organizationId);
    if (error) setMessage(`Delete failed: ${error.message}`);
    else {
      setProjects(list => list.filter(x => x.id !== p.id));
      setTasks(list => list.filter(t => t.project_id !== p.id));
      setSelectedId(null); setMessage("Project deleted.");
    }
    setBusyId(null);
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !selected || !newTask.trim()) return;
    setBusyId("new-task"); setMessage("");
    const { data, error } = await supabase.from("project_tasks")
      .insert({ organization_id: organizationId, project_id: selected.id, title: newTask.trim() })
      .select("id,project_id,title,status,due_date,created_at").single();
    if (error) setMessage(`Task not added: ${error.message}`);
    else { setTasks(list => [...list, data as Task]); setNewTask(""); }
    setBusyId(null);
  }

  async function setTaskStatus(t: Task, status: TaskStatus) {
    if (!supabase) return;
    setBusyId(t.id); setMessage("");
    const { error } = await supabase.from("project_tasks").update({ status }).eq("id", t.id).eq("organization_id", organizationId);
    if (error) setMessage(`Task update failed: ${error.message}`);
    else setTasks(list => list.map(x => x.id === t.id ? { ...x, status } : x));
    setBusyId(null);
  }

  async function deleteTask(t: Task) {
    if (!supabase) return;
    setBusyId(t.id); setMessage("");
    const { error } = await supabase.from("project_tasks").delete().eq("id", t.id).eq("organization_id", organizationId);
    if (error) setMessage(`Task removal failed: ${error.message}`);
    else setTasks(list => list.filter(x => x.id !== t.id));
    setBusyId(null);
  }

  return <>
    <div className="stats">
      <div className="stat-card"><div className="stat-top"><span>Active</span><span className="stat-icon"><Hammer/></span></div><strong>{stats.active}</strong><small>In delivery now</small></div>
      <div className="stat-card"><div className="stat-top"><span>Planning</span><span className="stat-icon"><Activity/></span></div><strong>{stats.planning}</strong><small>Not yet started</small></div>
      <div className="stat-card"><div className="stat-top"><span>Overdue</span><span className="stat-icon"><Clock/></span></div><strong>{stats.overdue}</strong><small>Past their due date</small></div>
      <div className="stat-card"><div className="stat-top"><span>Completed</span><span className="stat-icon"><CheckCircle2/></span></div><strong>{stats.completed}</strong><small>Delivered</small></div>
    </div>

    <section className="panel">
      <div className="toolbar">
        <div><b>Project portfolio</b><p className="muted tiny">Client work and internal builds, with task progress</p></div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
          <div className="search"><Search size={16}/><input placeholder="Search projects…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
          <select aria-label="Filter by status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value as "all" | ProjectStatus)}>
            <option value="all">All statuses</option>
            {(Object.keys(statusLabels) as ProjectStatus[]).map(s=><option key={s} value={s}>{statusLabels[s]}</option>)}
          </select>
          <button className="secondary" type="button" onClick={load} disabled={loading}><RefreshCw size={15}/> Refresh</button>
          {canManage && <button className="primary" type="button" onClick={()=>setShowNew(true)}><Plus size={17}/> New project</button>}
        </div>
      </div>
      {message && <div className="alert" style={{marginBottom:15}}>{message}</div>}
      {loading ? <p className="muted">Loading projects…</p> :
      <div className="table-wrap"><table>
        <thead><tr><th>PROJECT</th><th>STATUS</th><th>PRIORITY</th><th>DUE</th><th>PROGRESS</th><th></th></tr></thead>
        <tbody>
          {filtered.map(p => {
            const pr = progress.get(p.id) ?? { done: 0, total: 0 };
            const pct = pr.total ? Math.round((pr.done / pr.total) * 100) : 0;
            return <tr key={p.id}>
              <td><b>{p.name}</b><small className="subcell">{clientName.get(p.client_id ?? "") ?? "Internal"}{p.application_id && appName.get(p.application_id) ? ` · ${appName.get(p.application_id)}` : ""}</small></td>
              <td>{canManage
                ? <select aria-label={`Status for ${p.name}`} value={p.status} disabled={busyId===p.id} onChange={e=>patchProject(p,{status:e.target.value as ProjectStatus})}>
                    {(Object.keys(statusLabels) as ProjectStatus[]).map(s=><option key={s} value={s}>{statusLabels[s]}</option>)}
                  </select>
                : <span className={`status ${p.status}`}>{statusLabels[p.status]}</span>}</td>
              <td><span className={`status ${p.priority}`}>{priorityLabels[p.priority]}</span></td>
              <td>{fmt(p.due_date)}{isOverdue(p) && <small className="subcell" style={{color:"#b42318"}}>Overdue</small>}</td>
              <td style={{minWidth:130}}>
                <div style={{height:7,borderRadius:99,background:"rgba(120,130,150,.25)",overflow:"hidden"}} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div style={{width:`${pct}%`,height:"100%",background:"#1f9d6b",transition:"width .25s"}}/>
                </div>
                <small className="subcell">{pr.total ? `${pr.done} of ${pr.total} tasks done` : "No tasks yet"}</small>
              </td>
              <td><button type="button" className="secondary" onClick={()=>setSelectedId(p.id)}>Open <ChevronRight size={14}/></button></td>
            </tr>;
          })}
          {!filtered.length && <tr><td colSpan={6} className="empty">{projects.length ? "No projects match your search or filter." : canManage ? "No projects yet. Select New project to plan your first one." : "No projects have been created yet."}</td></tr>}
        </tbody>
      </table></div>}
      {!canManage && <p className="tiny muted" style={{marginTop:15}}>You can view projects and tasks. Operations managers, technical administrators and organisation administrators can make changes.</p>}
    </section>

    {selected && <section className="panel" style={{marginTop:18}}>
      <div className="toolbar">
        <div>
          <b>{selected.name}</b>
          <p className="muted tiny">{clientName.get(selected.client_id ?? "") ?? "Internal project"} · {fmt(selected.start_date)} to {fmt(selected.due_date)}</p>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          {canManage && <select aria-label="Priority" value={selected.priority} disabled={busyId===selected.id} onChange={e=>patchProject(selected,{priority:e.target.value as Priority})}>
            {(Object.keys(priorityLabels) as Priority[]).map(x=><option key={x} value={x}>{priorityLabels[x]} priority</option>)}
          </select>}
          {canManage && <button type="button" className="secondary" disabled={busyId===selected.id} onClick={()=>deleteProject(selected)}><Trash2 size={14}/> Delete project</button>}
          <button type="button" className="icon-btn" aria-label="Close project" onClick={()=>setSelectedId(null)}><X size={18}/></button>
        </div>
      </div>
      {selected.description && <p style={{marginBottom:16}}>{selected.description}</p>}
      <b>Tasks</b>
      <div style={{marginTop:10}}>
        {selectedTasks.map(t => <div className="list-row" key={t.id}>
          <div className="grow"><b style={{textDecoration:t.status==="done"?"line-through":"none",opacity:t.status==="done"?.6:1}}>{t.title}</b></div>
          {canManage
            ? <select aria-label={`Status for ${t.title}`} value={t.status} disabled={busyId===t.id} onChange={e=>setTaskStatus(t,e.target.value as TaskStatus)}>
                {(Object.keys(taskLabels) as TaskStatus[]).map(s=><option key={s} value={s}>{taskLabels[s]}</option>)}
              </select>
            : <span className="status">{taskLabels[t.status]}</span>}
          {canManage && <button type="button" className="icon-btn" aria-label={`Remove task ${t.title}`} disabled={busyId===t.id} onClick={()=>deleteTask(t)}><Trash2 size={15}/></button>}
        </div>)}
        {!selectedTasks.length && <p className="empty">No tasks yet.{canManage ? " Add the first step below." : ""}</p>}
      </div>
      {canManage && <form onSubmit={addTask} style={{display:"flex",gap:10,marginTop:14}}>
        <input style={{flex:1}} value={newTask} onChange={e=>setNewTask(e.target.value)} placeholder="Describe the next task…" aria-label="New task title"/>
        <button className="primary" disabled={busyId==="new-task" || !newTask.trim()}><Plus size={16}/> Add task</button>
      </form>}
      <Attachments organizationId={organizationId} entityType="project" entityId={selected.id} canWrite={canManage} title="Project files"/>
    </section>}

    {showNew && <div className="modal-backdrop"><form className="modal" onSubmit={createProject}>
      <div className="modal-head"><div><h2>New project</h2><p className="muted tiny">Plan client work or an internal build.</p></div><button type="button" className="icon-btn" aria-label="Close" onClick={()=>setShowNew(false)}><X/></button></div>
      <label>Project name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
      <label>Client<select value={form.client_id} onChange={e=>setForm({...form,client_id:e.target.value})}>
        <option value="">Internal (no client)</option>
        {clients.map(c=><option key={c.id} value={c.id}>{c.client_name}</option>)}
      </select></label>
      <label>Application<select value={form.application_id} onChange={e=>setForm({...form,application_id:e.target.value})}>
        <option value="">None</option>
        {apps.map(a=><option key={a.id} value={a.id}>{a.app_name}</option>)}
      </select></label>
      <label>Stage<select value={form.status} onChange={e=>setForm({...form,status:e.target.value as ProjectStatus})}>
        {(Object.keys(statusLabels) as ProjectStatus[]).map(s=><option key={s} value={s}>{statusLabels[s]}</option>)}
      </select></label>
      <label>Priority<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value as Priority})}>
        {(Object.keys(priorityLabels) as Priority[]).map(x=><option key={x} value={x}>{priorityLabels[x]}</option>)}
      </select></label>
      <label>Start date<input type="date" value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})}/></label>
      <label>Due date<input type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})}/></label>
      <label>Description<textarea rows={3} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Scope, deliverables, anything the team should know"/></label>
      <div className="modal-actions"><button type="button" className="secondary" onClick={()=>setShowNew(false)}>Cancel</button><button className="primary" disabled={saving}>{saving?"Saving…":"Save project"}</button></div>
    </form></div>}
  </>;
}
