import { useEffect, useMemo, useState } from "react";
import { supabase, configured } from "./supabase";
import {
  Activity, AppWindow, Building2, CircleHelp, CreditCard, LayoutDashboard,
  LogOut, Menu, Plus, Search, Settings, ShieldCheck, Users, X
} from "lucide-react";

type Client = { id: string; client_name: string; business_type: string | null; location: string | null; status: string; created_at: string };
type Product = { id: string; app_name: string; app_code: string; status: string; production_url: string | null; current_version: string | null };
type Section = "Overview" | "Clients" | "Applications" | "Projects" | "Support" | "Finance" | "Team & access";

const nav: { label: Section; icon: typeof LayoutDashboard }[] = [
  { label: "Overview", icon: LayoutDashboard }, { label: "Clients", icon: Building2 },
  { label: "Applications", icon: AppWindow }, { label: "Projects", icon: Activity },
  { label: "Support", icon: CircleHelp }, { label: "Finance", icon: CreditCard },
  { label: "Team & access", icon: ShieldCheck }
];

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [section, setSection] = useState<Section>("Overview");
  const [clients, setClients] = useState<Client[]>([]);
  const [apps, setApps] = useState<Product[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [form, setForm] = useState({ client_name: "", business_type: "Hotel", location: "Buea", status: "prospect" });

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadData();
  }, [session]);

  async function loadData() {
    if (!supabase) return;
    setLoading(true); setError("");
    const membership = await supabase.from("organization_members")
      .select("organization_id").eq("user_id", session.user.id).limit(1).maybeSingle();
    if (membership.error || !membership.data?.organization_id) {
      setError(membership.error?.message || "This account has no Nexora HQ organization membership. Ask the super administrator to assign your role.");
      setClients([]); setApps([]); setLoading(false); return;
    }
    const orgId = membership.data.organization_id as string;
    setOrganizationId(orgId);
    const [c, a] = await Promise.all([
      supabase.from("clients").select("id,client_name,business_type,location,status,created_at").eq("organization_id", orgId).order("created_at", { ascending: false }),
      supabase.from("applications").select("id,app_name,app_code,status,production_url,current_version").eq("organization_id", orgId).order("app_name")
    ]);
    if (c.error) setError(c.error.message);
    else setClients((c.data ?? []) as Client[]);
    if (a.error) setError(a.error.message);
    else setApps((a.data ?? []) as Product[]);
    setLoading(false);
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setAuthBusy(true); setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setAuthBusy(false);
  }

  async function addClient(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (!organizationId) { setError("Your account is not linked to a Nexora organization."); return; }
    const { error } = await supabase.from("clients").insert({ ...form, organization_id: organizationId });
    if (error) setError(error.message);
    else { setShowAdd(false); setForm({ client_name: "", business_type: "Hotel", location: "Buea", status: "prospect" }); await loadData(); }
  }

  async function signOut() { await supabase?.auth.signOut(); }

  const filtered = useMemo(() => clients.filter(c => `${c.client_name} ${c.business_type ?? ""} ${c.location ?? ""}`.toLowerCase().includes(search.toLowerCase())), [clients, search]);

  if (!configured) return <SetupNotice />;
  if (!session) return <main className="login-wrap"><form className="login-card" onSubmit={signIn}>
    <div className="brand-mark">N</div><p className="eyebrow">NEXORA SMART SERVICES LTD</p><h1>Welcome to Nexora HQ</h1>
    <p className="muted">Sign in to your company management workspace.</p>
    {error && <div className="alert">{error}</div>}
    <label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@yourcompany.com" /></label>
    <label>Password<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password" /></label>
    <button className="primary full" disabled={authBusy}>{authBusy ? "Signing in…" : "Sign in securely"}</button>
    <p className="tiny muted">Accounts are created/invited by the Nexora administrator in Supabase Auth.</p>
  </form></main>;

  return <div className="shell">
    <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
      <div className="brand"><div className="brand-mark small">N</div><div><b>NEXORA HQ</b><small>SMART SERVICES LTD</small></div><button className="icon-btn mobile-close" onClick={()=>setMobileNav(false)}><X size={18}/></button></div>
      <div className="workspace"><span className="dot"/> Company workspace <span className="chevron">⌄</span></div>
      <p className="nav-label">WORKSPACE</p>
      {nav.map(item => <button key={item.label} className={`nav-item ${section===item.label?"active":""}`} onClick={()=>{setSection(item.label);setMobileNav(false)}}><item.icon size={18}/>{item.label}</button>)}
      <div className="sidebar-bottom"><div className="secure"><ShieldCheck size={17}/><span><b>Protected workspace</b><small>Access is role-controlled</small></span></div><button className="nav-item" onClick={signOut}><LogOut size={18}/> Sign out</button></div>
    </aside>
    {mobileNav && <div className="scrim" onClick={()=>setMobileNav(false)} />}
    <main className="main">
      <header className="topbar"><button className="icon-btn mobile-menu" onClick={()=>setMobileNav(true)}><Menu/></button><div className="crumb">Nexora HQ <span>/</span> {section}</div><div className="top-user"><span className="avatar">{(session.user.email ?? "N").slice(0,1).toUpperCase()}</span><span>{session.user.email}</span></div></header>
      <div className="content">
        <div className="page-head"><div><p className="eyebrow">COMPANY CONTROL CENTRE</p><h1>{section}</h1><p className="muted">{section==="Overview"?"A single view of Nexora operations, clients and applications.":`Manage ${section.toLowerCase()} across Nexora Smart Services Ltd.`}</p></div>
        {section==="Clients" && <button className="primary" onClick={()=>setShowAdd(true)}><Plus size={17}/> Add client</button>}</div>
        {error && <div className="alert">{error}</div>}
        {loading ? <div className="panel loading">Loading your secure workspace…</div> : section==="Overview" ? <Overview clients={clients} apps={apps} onGo={setSection}/> :
          section==="Clients" ? <section className="panel"><div className="toolbar"><div><b>Client directory</b><p className="muted tiny">Prospects and active client accounts</p></div><div className="search"><Search size={16}/><input placeholder="Search clients…" value={search} onChange={e=>setSearch(e.target.value)}/></div></div><div className="table-wrap"><table><thead><tr><th>CLIENT</th><th>BUSINESS TYPE</th><th>LOCATION</th><th>STATUS</th><th>CREATED</th></tr></thead><tbody>{filtered.map(c=><tr key={c.id}><td><b>{c.client_name}</b><small className="subcell">{c.id.slice(0,8)}</small></td><td>{c.business_type||"—"}</td><td>{c.location||"—"}</td><td><span className={`status ${c.status}`}>{c.status}</span></td><td>{new Date(c.created_at).toLocaleDateString()}</td></tr>)}{!filtered.length&&<tr><td colSpan={5} className="empty">No client records found.</td></tr>}</tbody></table></div></section> :
          section==="Applications" ? <section className="panel"><div className="toolbar"><div><b>Application registry</b><p className="muted tiny">Software products owned or managed by Nexora</p></div></div><div className="app-grid">{apps.map(a=><article className="app-card" key={a.id}><div className="app-icon"><AppWindow/></div><span className={`status ${a.status}`}>{a.status}</span><h3>{a.app_name}</h3><p className="muted tiny">{a.app_code}</p><p className="tiny">Version: {a.current_version||"Not recorded"}</p>{a.production_url&&<a href={a.production_url} target="_blank" rel="noreferrer">Open production site ↗</a>}</article>)}{!apps.length&&<p className="empty">No applications registered yet. Add seed records using the setup SQL.</p>}</div></section> :
          <section className="panel coming"><div className="app-icon"><Settings/></div><h2>{section} module</h2><p className="muted">This module is planned for the next build phase. The database foundation is prepared for staged expansion; no live financial, project or support actions are enabled yet.</p><span className="status planned">Planned module</span></section>}
      </div>
    </main>
    {showAdd && <div className="modal-backdrop"><form className="modal" onSubmit={addClient}><div className="modal-head"><div><h2>Add a client</h2><p className="muted tiny">Create a new prospect or client record.</p></div><button type="button" className="icon-btn" onClick={()=>setShowAdd(false)}><X/></button></div>
      <label>Business name<input required value={form.client_name} onChange={e=>setForm({...form,client_name:e.target.value})}/></label>
      <label>Business type<select value={form.business_type} onChange={e=>setForm({...form,business_type:e.target.value})}><option>Hotel</option><option>Retail / Supermarket</option><option>Clinic</option><option>School</option><option>NGO</option><option>SME</option><option>Other</option></select></label>
      <label>Location<input value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/></label>
      <label>Stage<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="prospect">Prospect</option><option value="onboarding">Onboarding</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      <div className="modal-actions"><button type="button" className="secondary" onClick={()=>setShowAdd(false)}>Cancel</button><button className="primary">Save client</button></div>
    </form></div>}
  </div>;
}

function Overview({clients,apps,onGo}:{clients:Client[];apps:Product[];onGo:(s:Section)=>void}) {
  const active = clients.filter(c=>c.status==="active").length;
  const prospect = clients.filter(c=>c.status==="prospect").length;
  return <><div className="stats">
    <Stat label="Total clients" value={clients.length} icon={<Building2/>} note="Registered accounts"/>
    <Stat label="Active clients" value={active} icon={<Users/>} note="Currently active"/>
    <Stat label="Applications" value={apps.length} icon={<AppWindow/>} note="In the product registry"/>
    <Stat label="Prospects" value={prospect} icon={<Activity/>} note="Awaiting conversion"/>
  </div><div className="two-col"><section className="panel"><div className="panel-title"><div><h3>Recent clients</h3><p className="muted tiny">Latest records in your directory</p></div><button className="text-btn" onClick={()=>onGo("Clients")}>View all →</button></div>{clients.slice(0,5).map(c=><div className="list-row" key={c.id}><div className="round-icon"><Building2 size={17}/></div><div className="grow"><b>{c.client_name}</b><small>{c.business_type||"Business"} · {c.location||"Location not set"}</small></div><span className={`status ${c.status}`}>{c.status}</span></div>)}{!clients.length&&<p className="empty">Your client directory is ready. Add your first client record.</p>}</section><section className="panel"><div className="panel-title"><div><h3>Application portfolio</h3><p className="muted tiny">Registered Nexora products</p></div><button className="text-btn" onClick={()=>onGo("Applications")}>View all →</button></div>{apps.slice(0,5).map(a=><div className="list-row" key={a.id}><div className="round-icon"><AppWindow size={17}/></div><div className="grow"><b>{a.app_name}</b><small>{a.app_code} · {a.current_version||"Version pending"}</small></div><span className={`status ${a.status}`}>{a.status}</span></div>)}{!apps.length&&<p className="empty">Add your Nexora products to the application registry.</p>}</section></div><section className="notice"><ShieldCheck/><div><b>Security-first rollout</b><p>Client data is protected by database access policies. Only publish this portal after completing the administrator bootstrap and verifying role-based access.</p></div></section></>;
}
function Stat({label,value,icon,note}:{label:string;value:number;icon:React.ReactNode;note:string}) { return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><strong>{value}</strong><small>{note}</small></div>; }
function SetupNotice(){return <main className="login-wrap"><div className="login-card"><div className="brand-mark">N</div><p className="eyebrow">NEXORA SMART SERVICES LTD</p><h1>Connect your HQ backend</h1><p className="muted">The app files are ready. Add your Supabase project URL and publishable/anon key in a local <code>.env</code> file, then restart the development server.</p><ol className="steps"><li>Create a Supabase project.</li><li>Run <code>supabase/schema.sql</code> in the SQL Editor.</li><li>Copy <code>.env.example</code> to <code>.env</code> and add your project credentials.</li><li>Run <code>npm install</code> then <code>npm run dev</code>.</li></ol><p className="tiny muted">Never put a Supabase service-role key in this frontend.</p></div></main>}
