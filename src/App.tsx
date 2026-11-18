import { useEffect, useMemo, useState } from "react";
import { supabase, configured } from "./supabase";
import ProjectsModule from "./ProjectsModule";
import SupportModule from "./SupportModule";
import FinanceModule from "./FinanceModule";
import {
  Activity, AppWindow, Building2, CircleHelp, CreditCard, LayoutDashboard,
  LogOut, Menu, Plus, Search, Settings, ShieldCheck, Users, X, UserPlus,
  Trash2, RefreshCw
} from "lucide-react";

type Client = { id: string; client_name: string; business_type: string | null; location: string | null; status: string; created_at: string };
type Product = { id: string; app_name: string; app_code: string; status: string; production_url: string | null; current_version: string | null };
type TeamMember = {
  member_id: string;
  member_user_id: string;
  member_email: string;
  member_role: string;
  member_created_at: string;
  is_central_admin: boolean;
};
type TeamRole = "organization_admin" | "operations_manager" | "technical_admin" | "finance_officer" | "support_officer" | "staff";
type Section = "Overview" | "Clients" | "Applications" | "Projects" | "Support" | "Finance" | "Team & access";

const nav: { label: Section; icon: typeof LayoutDashboard }[] = [
  { label: "Overview", icon: LayoutDashboard }, { label: "Clients", icon: Building2 },
  { label: "Applications", icon: AppWindow }, { label: "Projects", icon: Activity },
  { label: "Support", icon: CircleHelp }, { label: "Finance", icon: CreditCard },
  { label: "Team & access", icon: ShieldCheck }
];

const roleLabels: Record<TeamRole, string> = {
  organization_admin: "Organisation administrator",
  operations_manager: "Operations manager",
  technical_admin: "Technical administrator",
  finance_officer: "Finance officer",
  support_officer: "Support officer",
  staff: "Staff"
};

const assignableRoles: TeamRole[] = [
  "operations_manager", "technical_admin", "finance_officer", "support_officer", "staff"
];

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [section, setSection] = useState<Section>("Overview");
  const [clients, setClients] = useState<Client[]>([]);
  const [apps, setApps] = useState<Product[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [isCentralAdmin, setIsCentralAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [teamLoading, setTeamLoading] = useState(false);
  const [error, setError] = useState("");
  const [teamMessage, setTeamMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [form, setForm] = useState({ client_name: "", business_type: "Hotel", location: "Buea", status: "prospect" });
  const [memberForm, setMemberForm] = useState({ email: "", role: "staff" as TeamRole, invite: true });
  const [needsPassword, setNeedsPassword] = useState(() => typeof window !== "undefined" && /type=(invite|recovery)/.test(window.location.hash));
  const [authInfo, setAuthInfo] = useState("");
  const [savingMember, setSavingMember] = useState(false);
  const [memberAction, setMemberAction] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => { setSession(next); if (event === "PASSWORD_RECOVERY") setNeedsPassword(true); });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadData();
    else {
      setClients([]); setApps([]); setTeam([]);
      setOrganizationId(null); setCurrentRole(null); setIsCentralAdmin(false);
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (session && section === "Team & access" && organizationId) loadTeam(organizationId);
  }, [session, section, organizationId]);

  async function loadData() {
    if (!supabase || !session) return;
    setLoading(true); setError("");
    const { data: centralData, error: centralError } = await supabase.rpc("is_nexora_super_admin");
    const central = !centralError && centralData === true;
    setIsCentralAdmin(central);

    const membership = await supabase.from("organization_members")
      .select("organization_id,role").eq("user_id", session.user.id).limit(1).maybeSingle();

    if (membership.error || !membership.data?.organization_id) {
      setError(membership.error?.message || "This account has no Nexora HQ organisation membership. Ask the central Nexora administrator to assign your role.");
      setClients([]); setApps([]); setTeam([]); setOrganizationId(null);
      setCurrentRole(null); setLoading(false); return;
    }

    const orgId = membership.data.organization_id as string;
    setOrganizationId(orgId);
    setCurrentRole(membership.data.role as string);

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

  async function loadTeam(orgId: string) {
    if (!supabase) return;
    setTeamLoading(true); setTeamMessage("");
    const { data, error: teamError } = await supabase.rpc("get_organization_team", { p_organization_id: orgId });
    if (teamError) {
      setTeam([]); setTeamMessage(`Could not load team members: ${teamError.message}`);
    } else {
      setTeam((data ?? []) as TeamMember[]);
    }
    setTeamLoading(false);
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
    if (!organizationId) { setError("Your account is not linked to a Nexora organisation."); return; }
    const { error } = await supabase.from("clients").insert({ ...form, organization_id: organizationId });
    if (error) setError(error.message);
    else {
      setShowAdd(false);
      setForm({ client_name: "", business_type: "Hotel", location: "Buea", status: "prospect" });
      await loadData();
    }
  }

  async function sendPasswordReset() {
    if (!supabase) return;
    if (!email.trim()) { setError("Enter your email address above first."); return; }
    setError(""); setAuthInfo("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    if (resetError) setError(resetError.message);
    else setAuthInfo("If that email has an account, a password reset link is on its way.");
  }

  async function savePassword(newPassword: string): Promise<string | null> {
    if (!supabase) return "Supabase is not configured.";
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) return updateError.message;
    window.history.replaceState(null, "", window.location.pathname);
    setNeedsPassword(false);
    return null;
  }

  async function addTeamMember(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !organizationId) return;
    setSavingMember(true); setTeamMessage("");
    let addError: { message: string } | null = null;
    if (memberForm.invite) {
      const { data, error: fnError } = await supabase.functions.invoke("invite-team-member", {
        body: { organization_id: organizationId, email: memberForm.email.trim(), role: memberForm.role, redirect_to: window.location.origin }
      });
      if (fnError) {
        let detail = fnError.message;
        try {
          const body = await (fnError as any).context?.json?.();
          if (body?.error) detail = body.error; else if (body?.message) detail = body.message;
        } catch { /* keep generic message */ }
        const unreachable = (fnError as any).name === "FunctionsFetchError";
        addError = { message: unreachable ? "Could not reach the invite service (a network or browser CORS problem). Check the function logs in Supabase, or untick the invite option to add an existing account." : detail };
      } else if (data?.invited) {
        setTeamMessage("Invitation email sent and the person has been added to this organisation.");
      }
    } else {
      const res = await supabase.rpc("add_organization_member_by_email", {
        p_organization_id: organizationId,
        p_email: memberForm.email.trim(),
        p_role: memberForm.role
      });
      addError = res.error;
    }
    if (addError) {
      setTeamMessage(addError.message);
    } else {
      setTeamMessage(m => m.startsWith("Invitation email sent") ? m : "Team member added successfully.");
      setMemberForm({ email: "", role: "staff", invite: true });
      setShowAddMember(false);
      await loadTeam(organizationId);
    }
    setSavingMember(false);
  }

  async function changeMemberRole(member: TeamMember, nextRole: TeamRole) {
    if (!supabase || !organizationId) return;
    if (member.is_central_admin || member.member_user_id === session?.user?.id) {
      setTeamMessage("For security, you cannot change your own role or the central Nexora Super Admin's role here.");
      return;
    }
    setMemberAction(member.member_id); setTeamMessage("");
    const { error: updateError } = await supabase.rpc("update_organization_member_role", {
      p_organization_id: organizationId, p_member_id: member.member_id, p_role: nextRole
    });
    if (updateError) setTeamMessage(`Role update failed: ${updateError.message}`);
    else {
      setTeamMessage("Member role updated.");
      await loadTeam(organizationId);
    }
    setMemberAction(null);
  }

  async function removeMember(member: TeamMember) {
    if (!supabase || !organizationId) return;
    if (member.is_central_admin || member.member_user_id === session?.user?.id) {
      setTeamMessage("For security, you cannot remove your own membership or the central Nexora Super Admin.");
      return;
    }
    const confirmed = window.confirm(`Remove ${member.member_email} from this organisation? Their login account will not be deleted.`);
    if (!confirmed) return;
    setMemberAction(member.member_id); setTeamMessage("");
    const { error: removeError } = await supabase.rpc("remove_organization_member", {
      p_organization_id: organizationId, p_member_id: member.member_id
    });
    if (removeError) setTeamMessage(`Member removal failed: ${removeError.message}`);
    else {
      setTeamMessage("Member removed from this organisation. Their authentication account remains intact.");
      await loadTeam(organizationId);
    }
    setMemberAction(null);
  }

  async function signOut() { await supabase?.auth.signOut(); }

  const filtered = useMemo(() => clients.filter(c => `${c.client_name} ${c.business_type ?? ""} ${c.location ?? ""}`.toLowerCase().includes(search.toLowerCase())), [clients, search]);
  const canManageTeam = isCentralAdmin || currentRole === "organization_admin";
  const canManageSupport = isCentralAdmin || ["organization_admin", "operations_manager", "technical_admin", "support_officer"].includes(currentRole ?? "");
  const canAccessFinance = isCentralAdmin || ["organization_admin", "operations_manager", "finance_officer"].includes(currentRole ?? "");
  const canManageProjects = isCentralAdmin || ["organization_admin", "operations_manager", "technical_admin"].includes(currentRole ?? "");

  if (!configured) return <SetupNotice />;
  if (session && needsPassword) return <SetPasswordScreen onSave={savePassword} />;
  if (!session) return <main className="login-wrap"><form className="login-card" onSubmit={signIn}>
    <div className="brand-mark">N</div><p className="eyebrow">NEXORA SMART SERVICES LTD</p><h1>Welcome to Nexora HQ</h1>
    <p className="muted">Sign in to your company management workspace.</p>
    {error && <div className="alert">{error}</div>}
    {authInfo && <p className="tiny muted">{authInfo}</p>}
    <label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@yourcompany.com" /></label>
    <label>Password<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password" /></label>
    <button className="primary full" disabled={authBusy}>{authBusy ? "Signing in…" : "Sign in securely"}</button>
    <button type="button" className="secondary full" onClick={sendPasswordReset}>Forgot your password?</button>
    <p className="tiny muted">Accounts are created or invited by the Nexora administrator.</p>
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
        {section==="Clients" && <button className="primary" onClick={()=>setShowAdd(true)}><Plus size={17}/> Add client</button>}
        {section==="Team & access" && canManageTeam && <button className="primary" onClick={()=>setShowAddMember(true)}><UserPlus size={17}/> Add team member</button>}</div>
        {error && <div className="alert">{error}</div>}
        {loading ? <div className="panel loading">Loading your secure workspace…</div> : section==="Overview" ? <Overview clients={clients} apps={apps} onGo={setSection}/> :
          section==="Clients" ? <section className="panel"><div className="toolbar"><div><b>Client directory</b><p className="muted tiny">Prospects and active client accounts</p></div><div className="search"><Search size={16}/><input placeholder="Search clients…" value={search} onChange={e=>setSearch(e.target.value)}/></div></div><div className="table-wrap"><table><thead><tr><th>CLIENT</th><th>BUSINESS TYPE</th><th>LOCATION</th><th>STATUS</th><th>CREATED</th></tr></thead><tbody>{filtered.map(c=><tr key={c.id}><td><b>{c.client_name}</b><small className="subcell">{c.id.slice(0,8)}</small></td><td>{c.business_type||"—"}</td><td>{c.location||"—"}</td><td><span className={`status ${c.status}`}>{c.status}</span></td><td>{new Date(c.created_at).toLocaleDateString()}</td></tr>)}{!filtered.length&&<tr><td colSpan={5} className="empty">No client records found.</td></tr>}</tbody></table></div></section> :
          section==="Applications" ? <section className="panel"><div className="toolbar"><div><b>Application registry</b><p className="muted tiny">Software products owned or managed by Nexora</p></div></div><div className="app-grid">{apps.map(a=><article className="app-card" key={a.id}><div className="app-icon"><AppWindow/></div><span className={`status ${a.status}`}>{a.status}</span><h3>{a.app_name}</h3><p className="muted tiny">{a.app_code}</p><p className="tiny">Version: {a.current_version||"Not recorded"}</p>{a.production_url&&<a href={a.production_url} target="_blank" rel="noreferrer">Open production site ↗</a>}</article>)}{!apps.length&&<p className="empty">No applications registered yet. Add your Nexora products to the application registry.</p>}</div></section> :
          section==="Support" && organizationId ? <SupportModule organizationId={organizationId} clients={clients} apps={apps} canManage={canManageSupport}/> :
          section==="Finance" && organizationId ? <FinanceModule organizationId={organizationId} clients={clients} canAccess={canAccessFinance}/> :
          section==="Projects" && organizationId ? <ProjectsModule organizationId={organizationId} clients={clients} apps={apps} canManage={canManageProjects}/> :
          section==="Team & access" ? <TeamAccess
            members={team} loading={teamLoading} message={teamMessage}
            canManage={canManageTeam} isCentralAdmin={isCentralAdmin}
            currentUserId={session.user.id} actionId={memberAction}
            onRefresh={()=>organizationId && loadTeam(organizationId)}
            onRoleChange={changeMemberRole} onRemove={removeMember}
          /> :
          <section className="panel coming"><div className="app-icon"><Settings/></div><h2>{section} module</h2><p className="muted">This module is planned for the next build phase. The database foundation is prepared for staged expansion; no live {section.toLowerCase()} actions are enabled yet.</p><span className="status planned">Planned module</span></section>}
      </div>
    </main>
    {showAdd && <div className="modal-backdrop"><form className="modal" onSubmit={addClient}><div className="modal-head"><div><h2>Add a client</h2><p className="muted tiny">Create a new prospect or client record.</p></div><button type="button" className="icon-btn" onClick={()=>setShowAdd(false)}><X/></button></div>
      <label>Business name<input required value={form.client_name} onChange={e=>setForm({...form,client_name:e.target.value})}/></label>
      <label>Business type<select value={form.business_type} onChange={e=>setForm({...form,business_type:e.target.value})}><option>Hotel</option><option>Retail / Supermarket</option><option>Clinic</option><option>School</option><option>NGO</option><option>SME</option><option>Other</option></select></label>
      <label>Location<input value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/></label>
      <label>Stage<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="prospect">Prospect</option><option value="onboarding">Onboarding</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      <div className="modal-actions"><button type="button" className="secondary" onClick={()=>setShowAdd(false)}>Cancel</button><button className="primary">Save client</button></div>
    </form></div>}
    {showAddMember && <div className="modal-backdrop"><form className="modal" onSubmit={addTeamMember}>
      <div className="modal-head"><div><h2>Add a team member</h2><p className="muted tiny">Invite someone by email, or attach an account that already exists.</p></div><button type="button" className="icon-btn" onClick={()=>setShowAddMember(false)}><X/></button></div>
      <label>Team member email<input type="email" required value={memberForm.email} onChange={e=>setMemberForm({...memberForm,email:e.target.value})} placeholder="person@example.com"/></label>
      <label>Organisation role<select value={memberForm.role} onChange={e=>setMemberForm({...memberForm,role:e.target.value as TeamRole})}>
        {isCentralAdmin && <option value="organization_admin">Organisation administrator</option>}
        {assignableRoles.map(role=><option key={role} value={role}>{roleLabels[role]}</option>)}
      </select></label>
      <label style={{display:"flex",gap:10,alignItems:"center"}}><input type="checkbox" style={{width:"auto"}} checked={memberForm.invite} onChange={e=>setMemberForm({...memberForm,invite:e.target.checked})}/> Email an invitation if this person has no account yet</label>
      <p className="tiny muted">{memberForm.invite ? "They will receive a link to set their own password. This never grants central Super Admin privileges." : "The person must already have an account in Supabase Authentication. This action does not create a login or grant central Super Admin privileges."}</p>
      <div className="modal-actions"><button type="button" className="secondary" onClick={()=>setShowAddMember(false)}>Cancel</button><button className="primary" disabled={savingMember}>{savingMember?"Adding…":"Add member"}</button></div>
    </form></div>}
  </div>;
}

function TeamAccess({
  members, loading, message, canManage, isCentralAdmin, currentUserId, actionId,
  onRefresh, onRoleChange, onRemove
}: {
  members: TeamMember[]; loading: boolean; message: string; canManage: boolean;
  isCentralAdmin: boolean; currentUserId: string; actionId: string | null;
  onRefresh: () => void;
  onRoleChange: (member: TeamMember, role: TeamRole) => void;
  onRemove: (member: TeamMember) => void;
}) {
  return <section className="panel">
    <div className="toolbar">
      <div><b>Team directory & access roles</b><p className="muted tiny">Manage membership and permissions for this organisation.</p></div>
      <button className="secondary" type="button" onClick={onRefresh} disabled={loading}><RefreshCw size={15}/> Refresh</button>
    </div>
    <div className="notice" style={{marginBottom:18}}>
      <ShieldCheck/><div><b>{isCentralAdmin ? "Central Nexora Super Admin" : "Organisation-level access"}</b>
      <p>{isCentralAdmin ? "You have central administration authority. Organisation administrators remain separate from the global Nexora Super Admin role." : "Your permissions are limited to this organisation. Only an organisation administrator or the central Nexora Super Admin can manage this team."}</p></div>
    </div>
    {message && <div className="alert" style={{marginBottom:15}}>{message}</div>}
    {loading ? <p className="muted">Loading team members…</p> :
      <div className="table-wrap"><table><thead><tr><th>TEAM MEMBER</th><th>ROLE</th><th>JOINED</th>{canManage&&<th>ACTIONS</th>}</tr></thead><tbody>
        {members.map(member => {
          const protectedMember = member.is_central_admin || member.member_user_id === currentUserId || (member.member_role === "organization_admin" && !isCentralAdmin);
          return <tr key={member.member_id}>
            <td><b>{member.member_email || "Email unavailable"}</b><small className="subcell">{member.member_user_id.slice(0,8)}… {member.is_central_admin ? "· Central administrator" : ""}</small></td>
            <td>{canManage && !protectedMember ? <select aria-label={`Role for ${member.member_email}`} value={member.member_role} disabled={actionId===member.member_id} onChange={e=>onRoleChange(member,e.target.value as TeamRole)}>
              {isCentralAdmin && <option value="organization_admin">Organisation administrator</option>}
              {assignableRoles.map(role=><option key={role} value={role}>{roleLabels[role]}</option>)}
            </select> : <span className="status">{roleLabels[member.member_role as TeamRole] || member.member_role}</span>}</td>
            <td>{new Date(member.member_created_at).toLocaleDateString()}</td>
            {canManage&&<td>{protectedMember ? <span className="muted tiny">Protected</span> : <button type="button" className="secondary" disabled={actionId===member.member_id} onClick={()=>onRemove(member)}><Trash2 size={14}/> Remove</button>}</td>}
          </tr>;
        })}
        {!members.length&&<tr><td colSpan={canManage?4:3} className="empty">No team memberships were returned for this organisation.</td></tr>}
      </tbody></table></div>}
    {!canManage && <p className="tiny muted" style={{marginTop:15}}>You can view the team directory, but you cannot add, change or remove members.</p>}
  </section>;
}

function Overview({clients,apps,onGo}:{clients:Client[];apps:Product[];onGo:(s:Section)=>void}) {
  const active = clients.filter(c=>c.status==="active").length;
  const prospect = clients.filter(c=>c.status==="prospect").length;
  return <><div className="stats">
    <Stat label="Total clients" value={clients.length} icon={<Building2/>} note="Registered accounts"/>
    <Stat label="Active clients" value={active} icon={<Users/>} note="Currently active"/>
    <Stat label="Applications" value={apps.length} icon={<AppWindow/>} note="In the product registry"/>
    <Stat label="Prospects" value={prospect} icon={<Activity/>} note="Awaiting conversion"/>
  </div><div className="two-col"><section className="panel"><div className="panel-title"><div><h3>Recent clients</h3><p className="muted tiny">Latest records in your directory</p></div><button className="text-btn" onClick={()=>onGo("Clients")}>View all →</button></div>{clients.slice(0,5).map(c=><div className="list-row" key={c.id}><div className="round-icon"><Building2 size={17}/></div><div className="grow"><b>{c.client_name}</b><small>{c.business_type||"Business"} · {c.location||"Location not set"}</small></div><span className={`status ${c.status}`}>{c.status}</span></div>)}{!clients.length&&<p className="empty">Your client directory is ready. Add your first client record.</p>}</section><section className="panel"><div className="panel-title"><div><h3>Application portfolio</h3><p className="muted tiny">Registered Nexora products</p></div><button className="text-btn" onClick={()=>onGo("Applications")}>View all →</button></div>{apps.slice(0,5).map(a=><div className="list-row" key={a.id}><div className="round-icon"><AppWindow size={17}/></div><div className="grow"><b>{a.app_name}</b><small>{a.app_code} · {a.current_version||"Version pending"}</small></div><span className={`status ${a.status}`}>{a.status}</span></div>)}{!apps.length&&<p className="empty">Add your Nexora products to the application registry.</p>}</section></div><section className="notice"><ShieldCheck/><div><b>Security-first rollout</b><p>Client data is protected by database access policies. Complete administrator bootstrap and verify role-based access before publishing this portal.</p></div></section></>;
}
function Stat({label,value,icon,note}:{label:string;value:number;icon:React.ReactNode;note:string}) { return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><strong>{value}</strong><small>{note}</small></div>; }
function SetupNotice(){return <main className="login-wrap"><div className="login-card"><div className="brand-mark">N</div><p className="eyebrow">NEXORA SMART SERVICES LTD</p><h1>Connect your HQ backend</h1><p className="muted">The app files are ready. Add your Supabase project URL and publishable/anon key in a local <code>.env</code> file, then restart the development server.</p><ol className="steps"><li>Create a Supabase project.</li><li>Run <code>supabase/schema.sql</code> in the SQL Editor.</li><li>Copy <code>.env.example</code> to <code>.env</code> and add your project credentials.</li><li>Run <code>npm install</code> then <code>npm run dev</code>.</li></ol><p className="tiny muted">Never put a Supabase service-role key in this frontend.</p></div></main>}


function SetPasswordScreen({ onSave }: { onSave: (password: string) => Promise<string | null> }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { setErr("Use at least 8 characters."); return; }
    if (pw !== confirm) { setErr("The two passwords do not match."); return; }
    setBusy(true); setErr("");
    const result = await onSave(pw);
    if (result) setErr(result);
    setBusy(false);
  }
  return <main className="login-wrap"><form className="login-card" onSubmit={submit}>
    <div className="brand-mark">N</div><p className="eyebrow">NEXORA SMART SERVICES LTD</p><h1>Set your password</h1>
    <p className="muted">Choose a password to finish setting up your Nexora HQ account.</p>
    {err && <div className="alert">{err}</div>}
    <label>New password<input type="password" required minLength={8} autoComplete="new-password" value={pw} onChange={e=>setPw(e.target.value)}/></label>
    <label>Confirm password<input type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
    <button className="primary full" disabled={busy}>{busy ? "Saving…" : "Save password and continue"}</button>
  </form></main>;
}
