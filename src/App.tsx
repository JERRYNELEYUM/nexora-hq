import { useEffect, useMemo, useState } from "react";
import { supabase, configured } from "./supabase";
import ProjectsModule from "./ProjectsModule";
import SupportModule from "./SupportModule";
import FinanceModule from "./FinanceModule";
import OperationsSummary from "./OperationsSummary";
import Attachments from "./Attachments";
import {
  Activity, AppWindow, Building2, CircleHelp, CreditCard, LayoutDashboard,
  LogOut, Menu, Plus, Search, Settings, ShieldCheck, Users, X, UserPlus,
  Trash2, RefreshCw, Paperclip
} from "lucide-react";

type AccessibleOrganization = {
  organization_id: string;
  organization_name: string;
  user_role: string;
};
type Client = {
  id: string;
  client_name: string;
  business_type: string | null;
  location: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  status: string;
  created_at: string;
};
type Product = {
  id: string;
  app_name: string;
  app_code: string;
  description: string | null;
  status: "development" | "staging" | "production" | "maintenance" | "archived";
  repository_url: string | null;
  production_url: string | null;
  hosting_provider: string | null;
  current_version: string | null;
  created_at: string;
};
type ClientApplication = {
  id: string;
  organization_id: string;
  client_id: string;
  application_id: string;
  status: "planned" | "configuring" | "active" | "paused" | "ended";
  start_date: string | null;
  created_at: string;
};
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
  const [filesClientId, setFilesClientId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientAssignments, setClientAssignments] = useState<
  Record<string, "view" | "edit">
>({});
const [projectAssignments, setProjectAssignments] = useState<
  Record<string, "view" | "edit">
>({});
  const [apps, setApps] = useState<Product[]>([]);
  const [clientApplications, setClientApplications] = useState<ClientApplication[]>([]);
  const [showClientApplicationsModal, setShowClientApplicationsModal] = useState(false);
  const [selectedApplicationsClient, setSelectedApplicationsClient] = useState<Client | null>(null);
  const [savingClientApplication, setSavingClientApplication] = useState(false);
  const [clientApplicationMessage, setClientApplicationMessage] = useState("");
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<AccessibleOrganization[]>([]);
  const [isCentralAdmin, setIsCentralAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [teamLoading, setTeamLoading] = useState(false);
  const [error, setError] = useState("");
  const [teamMessage, setTeamMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [applicationSearch, setApplicationSearch] = useState("");
  const [applicationStatusFilter, setApplicationStatusFilter] = useState<"all" | Product["status"]>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const emptyClientForm = {
  client_name: "",
  business_type: "Hotel",
  location: "Buea",
  contact_person: "",
  phone: "",
  email: "",
  notes: "",
  status: "prospect"
};

const [form, setForm] = useState(emptyClientForm);
const [selectedClient, setSelectedClient] = useState<Client | null>(null);
const [savingClient, setSavingClient] = useState(false);
  const [memberForm, setMemberForm] = useState({ email: "", role: "staff" as TeamRole, invite: true });
const emptyApplicationForm = {
  app_name: "",
  app_code: "",
  description: "",
  repository_url: "",
  production_url: "",
  hosting_provider: "",
  current_version: "",
  status: "development" as Product["status"]
};

const [showApplicationModal, setShowApplicationModal] = useState(false);
const [selectedApplication, setSelectedApplication] = useState<Product | null>(null);
const [applicationForm, setApplicationForm] = useState(emptyApplicationForm);
const [applicationMode, setApplicationMode] = useState<"add" | "view" | "edit">("add");
const [savingApplication, setSavingApplication] = useState(false);
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


async function loadOrganizationData(orgId: string) {
  if (!supabase) return;

  setLoading(true);
  setError("");
  setFilesClientId(null);
  setTeam([]);
  setClientApplications([]);

  const [c, a, assignments, projectRows, clientAppRows] = await Promise.all([
    // Load clients
    supabase
      .from("clients")
      .select("id,client_name,business_type,location,contact_person,phone,email,notes,status,created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),

    // Load registered applications
    supabase
      .from("applications")
      .select("id,app_name,app_code,description,repository_url,production_url,hosting_provider,current_version,status,created_at")
      .eq("organization_id", orgId)
      .order("app_name"),

    // Load client record permissions
    supabase
      .from("record_assignments")
      .select("entity_id,permission")
      .eq("organization_id", orgId)
      .eq("entity_type", "client")
      .eq("user_id", session.user.id),

    // Load project record permissions
    supabase
      .from("record_assignments")
      .select("entity_id,permission")
      .eq("organization_id", orgId)
      .eq("entity_type", "project")
      .eq("user_id", session.user.id),

    // Load client application assignments
    supabase
      .from("client_applications")
      .select("id,organization_id,client_id,application_id,status,start_date,created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
  ]);

  if (assignments.error) {
    setClientAssignments({});
    setError(`Could not load client permissions: ${assignments.error.message}`);
  } else {
    setClientAssignments(
      Object.fromEntries(
        (assignments.data ?? []).map(a => [a.entity_id, a.permission])
      ) as Record<string, "view" | "edit">
    );
  }

  if (projectRows.error) {
    setProjectAssignments({});
    setError(`Could not load project permissions: ${projectRows.error.message}`);
  } else {
    setProjectAssignments(
      Object.fromEntries(
        (projectRows.data ?? []).map(a => [a.entity_id, a.permission])
      ) as Record<string, "view" | "edit">
    );
  }

  if (clientAppRows.error) {
    setClientApplications([]);
    setError(`Could not load client applications: ${clientAppRows.error.message}`);
  } else {
    setClientApplications(
      (clientAppRows.data ?? []) as ClientApplication[]
    );
  }

  if (c.error) {
    setError(c.error.message);
  } else {
    setClients((c.data ?? []) as Client[]);
  }

  if (a.error) {
    setError(a.error.message);
  } else {
    setApps((a.data ?? []) as Product[]);
  }

  setLoading(false);
}

async function loadData() {
  if (!supabase || !session) return;

  setLoading(true);
  setError("");

  const { data: centralData, error: centralError } =
    await supabase.rpc("is_nexora_super_admin");

  const central = !centralError && centralData === true;
  setIsCentralAdmin(central);

  const { data, error: organizationError } =
    await supabase.rpc("get_accessible_organizations");

  if (organizationError) {
    setError(`Could not load organisations: ${organizationError.message}`);
    setOrganizations([]);
    setOrganizationId(null);
    setCurrentRole(null);
    setClients([]);
    setApps([]);
    setTeam([]);
    setLoading(false);
    return;
  }

  const accessible = (data ?? []) as AccessibleOrganization[];

  setOrganizations(accessible);

  if (!accessible.length) {
    setError("This account has no accessible Nexora HQ organisation. Ask the central Nexora administrator to assign your role.");
    setOrganizationId(null);
    setCurrentRole(null);
    setClients([]);
    setApps([]);
    setTeam([]);
    setLoading(false);
    return;
  }

  const selected =
    accessible.find(org => org.organization_id === organizationId) ??
    accessible[0];

  setOrganizationId(selected.organization_id);
  setCurrentRole(selected.user_role);

  await loadOrganizationData(selected.organization_id);
}

async function switchOrganization(orgId: string) {
  const selected = organizations.find(
    org => org.organization_id === orgId
  );

  if (!selected) return;

  setOrganizationId(selected.organization_id);
  setCurrentRole(selected.user_role);

  await loadOrganizationData(selected.organization_id);
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

  if (!canManageClients) {
    setError("You do not have permission to manage clients.");
    return;
  }

  if (!organizationId) {
    setError("Your account is not linked to a Nexora organisation.");
    return;
  }

    setError("");
  setSavingClient(true);

  try {
    const result = selectedClient
      ? await supabase
          .from("clients")
          .update(form)
          .eq("id", selectedClient.id)
          .eq("organization_id", organizationId)
      : await supabase
          .from("clients")
          .insert({
            ...form,
            organization_id: organizationId
          });

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setShowAdd(false);
    setSelectedClient(null);
    setForm(emptyClientForm);

    await loadData();
  } finally {
    setSavingClient(false);
  }
}


  function openApplication(application?: Product) {
    if (application) {
      setSelectedApplication(application);
      setApplicationForm({
        app_name: application.app_name,
        app_code: application.app_code,
        description: application.description ?? "",
        repository_url: application.repository_url ?? "",
        production_url: application.production_url ?? "",
        hosting_provider: application.hosting_provider ?? "",
        current_version: application.current_version ?? "",
        status: application.status
      });
      setApplicationMode("view");
    } else {
      setSelectedApplication(null);
      setApplicationForm(emptyApplicationForm);
      setApplicationMode("add");
    }
    setShowApplicationModal(true);
    setError("");
  }

  async function saveApplication(e: React.FormEvent) {
    e.preventDefault();

    if (!supabase || !organizationId) {
      setError("Your account is not linked to a Nexora organisation.");
      return;
    }

    if (!isCentralAdmin && currentRole !== "organization_admin") {
      setError("You do not have permission to manage applications.");
      return;
    }

    setSavingApplication(true);
    setError("");

    const payload = {
      app_name: applicationForm.app_name.trim(),
      app_code: applicationForm.app_code.trim().toUpperCase(),
      description: applicationForm.description.trim() || null,
      repository_url: applicationForm.repository_url.trim() || null,
      production_url: applicationForm.production_url.trim() || null,
      hosting_provider: applicationForm.hosting_provider.trim() || null,
      current_version: applicationForm.current_version.trim() || null,
      status: applicationForm.status,
      organization_id: organizationId
    };

    const result = applicationMode === "edit" && selectedApplication
      ? await supabase.from("applications")
          .update(payload)
          .eq("id", selectedApplication.id)
          .eq("organization_id", organizationId)
      : await supabase.from("applications").insert(payload);

    if (result.error) {
      setError(result.error.message);
    } else {
      setShowApplicationModal(false);
      setSelectedApplication(null);
      setApplicationForm(emptyApplicationForm);
      await loadData();
    }

    setSavingApplication(false);
  }

  
async function changeApplicationArchiveStatus(archive: boolean) {
  if (!supabase || !organizationId || !selectedApplication) {
    setError("Application or organisation information is missing.");
    return;
  }

  if (!isCentralAdmin && currentRole !== "organization_admin") {
    setError("You do not have permission to manage applications.");
    return;
  }

  const action = archive ? "archive" : "restore";

  const confirmed = window.confirm(
    `Are you sure you want to ${action} ${selectedApplication.app_name}?`
  );

  if (!confirmed) return;

  setSavingApplication(true);
  setError("");

  const { error: updateError } = await supabase
    .from("applications")
    .update({
      status: archive ? "archived" : "development"
    })
    .eq("id", selectedApplication.id)
    .eq("organization_id", organizationId);

  if (updateError) {
    setError(updateError.message);
  } else {
    setShowApplicationModal(false);
    setSelectedApplication(null);
    await loadData();
  }

  setSavingApplication(false);
}
  async function saveClientApplication(
    applicationId: string,
    status: ClientApplication["status"],
    startDate: string
  ) {
    if (!supabase || !organizationId || !selectedApplicationsClient) {
      setClientApplicationMessage("Client or organisation information is missing.");
      return;
    }

    if (!canManageClientApplications) {
      setClientApplicationMessage("You do not have permission to manage client applications.");
      return;
    }

    const applicationExists = apps.some(
      app => app.id === applicationId
    );

    if (!applicationExists) {
      setClientApplicationMessage("This application is not registered in the selected organisation.");
      return;
    }

    setSavingClientApplication(true);
    setClientApplicationMessage("");

    try {
      const { data, error: saveError } = await supabase
        .from("client_applications")
        .upsert(
          {
            organization_id: organizationId,
            client_id: selectedApplicationsClient.id,
            application_id: applicationId,
            status,
            start_date: startDate || null
          },
          {
            onConflict: "client_id,application_id"
          }
        )
        .select("id,organization_id,client_id,application_id,status,start_date,created_at")
        .single();

      if (saveError) {
        setClientApplicationMessage(saveError.message);
        return;
      }

      setClientApplications(current => [
        ...current.filter(item => item.id !== data.id &&
          !(item.client_id === data.client_id &&
            item.application_id === data.application_id)),
        data as ClientApplication
      ]);

      setClientApplicationMessage("Application assignment saved successfully.");
    } finally {
      setSavingClientApplication(false);
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
  const filteredApplications = useMemo(() => {
  return apps.filter(app => {
    const matchesSearch = `${app.app_name} ${app.app_code} ${app.description ?? ""}`
      .toLowerCase()
      .includes(applicationSearch.toLowerCase());

    const matchesStatus =
      applicationStatusFilter === "all" ||
      app.status === applicationStatusFilter;

    return matchesSearch && matchesStatus;
  });
}, [apps, applicationSearch, applicationStatusFilter]);
  const canManageTeam = isCentralAdmin || currentRole === "organization_admin";
  const canManageApplications = isCentralAdmin || currentRole === "organization_admin";
  const canManageClientApplications =
  isCentralAdmin ||
  ["organization_admin", "operations_manager"].includes(currentRole ?? "");
  const canManageClients = isCentralAdmin || ["organization_admin", "operations_manager", "technical_admin"].includes(currentRole ?? "");
  const canManageSupport = isCentralAdmin || ["organization_admin", "operations_manager", "technical_admin", "support_officer"].includes(currentRole ?? "");
  const canAccessFinance = isCentralAdmin || ["organization_admin", "operations_manager", "finance_officer"].includes(currentRole ?? "");
  const canManageClientFiles = isCentralAdmin || ["organization_admin", "operations_manager", "technical_admin"].includes(currentRole ?? "");
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
      <div className="workspace">
  <label className="workspace-label" htmlFor="organization-switcher">
    <span className="dot" />
    ACTIVE ORGANISATION
  </label>

  <select
    id="organization-switcher"
    className="workspace-select"
    value={organizationId ?? ""}
    onChange={e => switchOrganization(e.target.value)}
    disabled={loading || organizations.length <= 1}
  >
    {organizations.map(org => (
      <option key={org.organization_id} value={org.organization_id}>
        {org.organization_name}
      </option>
    ))}
  </select>

  {isCentralAdmin && <small>Central Nexora Super Admin</small>}
</div>
      <p className="nav-label">WORKSPACE</p>
      {nav.map(item => <button key={item.label} className={`nav-item ${section===item.label?"active":""}`} onClick={()=>{setSection(item.label);setMobileNav(false)}}><item.icon size={18}/>{item.label}</button>)}
      <div className="sidebar-bottom"><div className="secure"><ShieldCheck size={17}/><span><b>Protected workspace</b><small>Access is role-controlled</small></span></div><button className="nav-item" onClick={signOut}><LogOut size={18}/> Sign out</button></div>
    </aside>
    {mobileNav && <div className="scrim" onClick={()=>setMobileNav(false)} />}
    <main className="main">
      <header className="topbar"><button className="icon-btn mobile-menu" onClick={()=>setMobileNav(true)}><Menu/></button><div className="crumb">Nexora HQ <span>/</span> {section}</div><div className="top-user"><span className="avatar">{(session.user.email ?? "N").slice(0,1).toUpperCase()}</span><span>{session.user.email}</span></div></header>
      <div className="content">
        <div className="page-head"><div><p className="eyebrow">COMPANY CONTROL CENTRE</p><h1>{section}</h1><p className="muted">{section==="Overview"?"A single view of Nexora operations, clients and applications.":`Manage ${section.toLowerCase()} across Nexora Smart Services Ltd.`}</p></div>
        
{section==="Clients" && (
  <button
    className="primary"
    onClick={() => {
      setSelectedClient(null);
      setForm(emptyClientForm);
      setShowAdd(true);
    }}
  >
    <Plus size={17}/> Add client
  </button>
)}

        {section==="Applications" && canManageApplications && <button className="primary" onClick={()=>openApplication()}><Plus size={17}/> Add application</button>}
        {section==="Team & access" && canManageTeam && <button className="primary" onClick={()=>setShowAddMember(true)}><UserPlus size={17}/> Add team member</button>}</div>
        {error && <div className="alert">{error}</div>}
        {loading ? <div className="panel loading">Loading your secure workspace…</div> : section==="Overview" ? <Overview clients={clients} apps={apps} onGo={setSection} organizationId={organizationId} canAccessFinance={canAccessFinance}/> :
          section==="Clients" ? <><section className="panel"><div className="toolbar"><div><b>Client directory</b><p className="muted tiny">Prospects and active client accounts</p></div><div className="search"><Search size={16}/><input placeholder="Search clients…" value={search} onChange={e=>setSearch(e.target.value)}/></div></div><div className="table-wrap"><table><thead><tr><th>CLIENT</th><th>BUSINESS TYPE</th><th>LOCATION</th><th>STATUS</th><th>CREATED</th><th></th></tr></thead><tbody>{filtered.map(c=><tr key={c.id}><td><b>{c.client_name}</b><small className="subcell">{c.id.slice(0,8)}</small></td><td>{c.business_type||"—"}</td><td>{c.location||"—"}</td><td><span className={`status ${c.status}`}>{c.status}</span></td><td>{new Date(c.created_at).toLocaleDateString()}</td>
<td>
  {(canManageClients || clientAssignments[c.id] === "edit") && (
    <button
      type="button"
      className="secondary"
      onClick={() => {
        setSelectedClient(c);
        setForm({
          client_name: c.client_name,
          business_type: c.business_type ?? "Other",
          location: c.location ?? "",
          contact_person: c.contact_person ?? "",
          phone: c.phone ?? "",
          email: c.email ?? "",
          notes: c.notes ?? "",
          status: c.status
        });
        setShowAdd(true);
        setFilesClientId(null);
      }}
    >
      Edit
    </button>
  )}
  <button
    type="button"
    className="secondary"
    onClick={() => setFilesClientId(c.id)}
  >
    <Paperclip size={14}/> Files
  </button>
    {canManageClientApplications && (
    <button
      type="button"
      className="secondary"
      onClick={() => {
        setSelectedApplicationsClient(c);
        setClientApplicationMessage("");
        setShowClientApplicationsModal(true);
      }}
    >
      <AppWindow size={14}/> Applications
    </button>
  )}
</td>
</tr>)}{!filtered.length&&<tr><td colSpan={6} className="empty">No client records found.</td></tr>}</tbody></table></div></section>{filesClientId && organizationId && <section className="panel" style={{marginTop:18}}><div className="toolbar"><div><b>{clients.find(c=>c.id===filesClientId)?.client_name ?? "Client"}</b><p className="muted tiny">Contracts, agreements and other client documents</p></div><button type="button" className="icon-btn" aria-label="Close files" onClick={()=>setFilesClientId(null)}><X size={18}/></button></div><Attachments organizationId={organizationId} entityType="client" entityId={filesClientId} canWrite={
  canManageClientFiles ||
  clientAssignments[filesClientId] === "edit"
} title="Client files"/></section>}</> :
          section==="Applications" ? <section className="panel"><div className="toolbar">
  <div>
    <b>Application registry ({apps.length})</b>
    <p className="muted tiny">Software products owned or managed by Nexora</p>
  </div>

  <div className="toolbar">
    <div className="search">
      <Search size={16}/>
      <input
        placeholder="Search applications..."
        value={applicationSearch}
        onChange={e => setApplicationSearch(e.target.value)}
      />
    </div>

    <select
      value={applicationStatusFilter}
      onChange={e => setApplicationStatusFilter(e.target.value as "all" | Product["status"])}
    >
      <option value="all">All statuses</option>
      <option value="development">Development</option>
      <option value="staging">Staging</option>
      <option value="production">Production</option>
      <option value="maintenance">Maintenance</option>
      <option value="archived">Archived</option>
    </select>
  </div>
</div><div className="app-grid">{filteredApplications.map(a=><article
  className="app-card"
  key={a.id}
  role="button"
  tabIndex={0}
  onClick={() => openApplication(a)}
  onKeyDown={e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openApplication(a);
    }
  }}
><div className="app-icon"><AppWindow/></div><span className={`status ${a.status}`}>{a.status}</span><h3>{a.app_name}</h3><p className="muted tiny">{a.app_code}</p><p className="app-description">
  {a.description || "No description provided yet."}
</p><p className="tiny">Version: {a.current_version||"Not recorded"}</p>{a.production_url&&<a
  href={a.production_url}
  target="_blank"
  rel="noreferrer"
  onClick={e => e.stopPropagation()}
>
  Open production site ↗
</a>}</article>)}{!filteredApplications.length && (
  <p className="empty">
    {apps.length === 0
      ? "No applications registered yet. Add your Nexora products to the application registry."
      : "No applications match your search or selected status."}
  </p>
)}</div></section> :
          section==="Support" && organizationId ? <SupportModule organizationId={organizationId} clients={clients} apps={apps} canManage={canManageSupport}/> :
          section==="Finance" && organizationId ? <FinanceModule organizationId={organizationId} clients={clients} canAccess={canAccessFinance}/> :
          section==="Projects" && organizationId ? <ProjectsModule organizationId={organizationId} clients={clients} apps={apps} canManage={canManageProjects} projectAssignments={projectAssignments}/> :
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
    
{showAdd && (canManageClients || (!!selectedClient && clientAssignments[selectedClient.id] === "edit")) && (
  <div className="modal-backdrop">
    <form className="modal client-form-modal" onSubmit={addClient}>
      <div className="modal-head">
        <div>
          <h2>{selectedClient ? "Edit client" : "Add a client"}</h2>
          <p className="muted tiny">
            {selectedClient
              ? "Update the client account details."
              : "Create a new prospect or client record."}
          </p>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            setShowAdd(false);
            setSelectedClient(null);
            setForm(emptyClientForm);
          }}
        >
          <X />
        </button>
      </div>

      <label>
        Business name
        <input
          required
          value={form.client_name}
          onChange={e => setForm({...form, client_name: e.target.value})}
        />
      </label>

      <label>
        Business type
        <select
          value={form.business_type}
          onChange={e => setForm({...form, business_type: e.target.value})}
        >
          <option>Hotel</option>
          <option>Retail / Supermarket</option>
          <option>Clinic</option>
          <option>School</option>
          <option>NGO</option>
          <option>SME</option>
          <option>Other</option>
        </select>
      </label>

      <label>
        Location
        <input
          value={form.location}
          onChange={e => setForm({...form, location: e.target.value})}
        />
      </label>

      <label>
        Contact person
        <input
          value={form.contact_person}
          onChange={e => setForm({...form, contact_person: e.target.value})}
        />
      </label>

      <label>
        Phone number
        <input
          type="tel"
          value={form.phone}
          onChange={e => setForm({...form, phone: e.target.value})}
        />
      </label>

      <label>
        Email address
        <input
          type="email"
          value={form.email}
          onChange={e => setForm({...form, email: e.target.value})}
        />
      </label>

      <label>
        Notes
        <textarea
          value={form.notes}
          onChange={e => setForm({...form, notes: e.target.value})}
        />
      </label>

      <label>
        Stage
        <select
          value={form.status}
          onChange={e => setForm({...form, status: e.target.value})}
        >
          <option value="prospect">Prospect</option>
          <option value="onboarding">Onboarding</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </label>

      <div className="modal-actions">
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setShowAdd(false);
            setSelectedClient(null);
            setForm(emptyClientForm);
          }}
        >
          Cancel
        </button>
        <button className="primary" disabled={savingClient}>
          {savingClient
            ? "Saving…"
            : selectedClient
              ? "Save changes"
              : "Save client"}
        </button>
      </div>
    </form>
  </div>
)}

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
    {showApplicationModal && <div className="modal-backdrop" onClick={() => setShowApplicationModal(false)}>
      <form
        className="modal application-modal"
        onSubmit={saveApplication}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2>
              {applicationMode === "add" ? "Register application" :
               applicationMode === "edit" ? "Edit application" : "Application details"}
            </h2>
            <p className="muted tiny">{organizations.find(org => org.organization_id === organizationId)?.organization_name ?? "Selected organisation"} application registry</p>
          </div>
          <button type="button" className="icon-btn" onClick={() => setShowApplicationModal(false)}>
            <X />
          </button>
        </div>

        <label>Application name
          <input required disabled={applicationMode === "view"} value={applicationForm.app_name}
            onChange={e => setApplicationForm({...applicationForm, app_name: e.target.value})}
            placeholder="e.g. Nexora POS" />
        </label>

        <label>Application code
          <input required disabled={applicationMode === "view"} value={applicationForm.app_code}
            onChange={e => setApplicationForm({...applicationForm, app_code: e.target.value})}
            placeholder="e.g. NEXORA-POS" />
        </label>
        <label>Application description
  <textarea
    disabled={applicationMode === "view"}
    value={applicationForm.description}
    onChange={e => setApplicationForm({
      ...applicationForm,
      description: e.target.value
    })}
    placeholder="Describe what this application does and who it serves..."
    rows={4}
  />
</label>

        <label>Repository URL
          <input disabled={applicationMode === "view"} type="url" value={applicationForm.repository_url}
            onChange={e => setApplicationForm({...applicationForm, repository_url: e.target.value})}
            placeholder="https://github.com/..." />
        </label>

        <label>Production URL
          <input disabled={applicationMode === "view"} type="url" value={applicationForm.production_url}
            onChange={e => setApplicationForm({...applicationForm, production_url: e.target.value})}
            placeholder="https://..." />
        </label>

        <label>Hosting provider
          <input disabled={applicationMode === "view"} value={applicationForm.hosting_provider}
            onChange={e => setApplicationForm({...applicationForm, hosting_provider: e.target.value})}
            placeholder="e.g. Cloudflare Pages, Netlify" />
        </label>

        <label>Current version
          <input disabled={applicationMode === "view"} value={applicationForm.current_version}
            onChange={e => setApplicationForm({...applicationForm, current_version: e.target.value})}
            placeholder="e.g. 1.0.0" />
        </label>

        <label>Application status
          <select disabled={applicationMode === "view"} value={applicationForm.status}
            onChange={e => setApplicationForm({...applicationForm, status: e.target.value as Product["status"]})}>
            <option value="development">Development</option>
            <option value="staging">Staging</option>
            <option value="production">Production</option>
            <option value="maintenance">Maintenance</option>
            <option value="archived">Archived</option>
          </select>
        </label>

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={() => setShowApplicationModal(false)}>
            Close
          </button>

          
{applicationMode === "view" && canManageApplications &&
  <>
    <button
      type="button"
      className="primary"
      onClick={() => setApplicationMode("edit")}
    >
      Edit application
    </button>

    {selectedApplication?.status === "archived" ? (
      <button
        type="button"
        className="secondary"
        disabled={savingApplication}
        onClick={() => changeApplicationArchiveStatus(false)}
      >
        Restore application
      </button>
    ) : (
      <button
        type="button"
        className="secondary"
        disabled={savingApplication}
        onClick={() => changeApplicationArchiveStatus(true)}
      >
        Archive application
      </button>
    )}
  </>
}


          {applicationMode !== "view" &&
            <button type="submit" className="primary" disabled={savingApplication}>
              {savingApplication ? "Saving…" : applicationMode === "add" ? "Register application" : "Save changes"}
            </button>
          }
        </div>

      </form>
    </div>}

    {showClientApplicationsModal && selectedApplicationsClient && (
      <div
        className="modal-backdrop"
        onClick={() => setShowClientApplicationsModal(false)}
      >
        <div className="modal client-applications-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h2>Client applications</h2>
              <p className="muted tiny">
                Manage applications assigned to {selectedApplicationsClient.client_name}
              </p>
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label="Close"
              onClick={() => setShowClientApplicationsModal(false)}
            >
              <X />
            </button>
          </div>

          {clientApplicationMessage && (
            <div className="alert">{clientApplicationMessage}</div>
          )}

          {apps.length === 0 ? (
            <p className="muted">No applications are registered yet.</p>
          ) : (
            <div>
              {apps.map(application => {
                const assignment = clientApplications.find(
                  item =>
                    item.client_id === selectedApplicationsClient.id &&
                    item.application_id === application.id
                );

                const currentStatus = assignment?.status ?? "planned";

                return (
                  <div
                    key={application.id}
                    className="panel"
                    style={{ marginBottom: 12 }}
                  >
                    <div className="toolbar">
                      <div>
                        <b>{application.app_name}</b>
                        <p className="muted tiny">
                          {application.app_code} · Application status: {application.status}
                        </p>
                      </div>
                      <span className={`status ${currentStatus}`}>
                        {currentStatus}
                      </span>
                    </div>

                    <label>
                      Client assignment status
                      <select
                        value={currentStatus}
                        disabled={savingClientApplication || !canManageClientApplications}
                        onChange={e =>
                          saveClientApplication(
                            application.id,
                            e.target.value as ClientApplication["status"],
                            assignment?.start_date ?? ""
                          )
                        }
                      >
                        <option value="planned">Planned</option>
                        <option value="configuring">Configuring</option>
                        <option value="active">Active</option>
                        <option value="paused">Paused</option>
                        <option value="ended">Ended</option>
                      </select>
                    </label>

                    {assignment?.status === "active" &&
                      application.status === "production" &&
                      application.production_url && (
                        <p style={{ marginTop: 12 }}>
                          <a
                            href={application.production_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open application ↗
                          </a>
                        </p>
                      )}

                    {assignment && (
                      <p className="muted tiny">
                        Assigned: {assignment.start_date || "Start date not specified"}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setShowClientApplicationsModal(false)}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )}

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

function Overview({clients,apps,onGo,organizationId,canAccessFinance}:{clients:Client[];apps:Product[];onGo:(s:Section)=>void;organizationId:string|null;canAccessFinance:boolean}) {
  const active = clients.filter(c=>c.status==="active").length;
  const prospect = clients.filter(c=>c.status==="prospect").length;
  return <><div className="stats">
    <Stat label="Total clients" value={clients.length} icon={<Building2/>} note="Registered accounts"/>
    <Stat label="Active clients" value={active} icon={<Users/>} note="Currently active"/>
    <Stat label="Applications" value={apps.length} icon={<AppWindow/>} note="In the product registry"/>
    <Stat label="Prospects" value={prospect} icon={<Activity/>} note="Awaiting conversion"/>
  </div>{organizationId && <OperationsSummary organizationId={organizationId} canAccessFinance={canAccessFinance} onGo={onGo}/>}<div className="two-col"><section className="panel"><div className="panel-title"><div><h3>Recent clients</h3><p className="muted tiny">Latest records in your directory</p></div><button className="text-btn" onClick={()=>onGo("Clients")}>View all →</button></div>{clients.slice(0,5).map(c=><div className="list-row" key={c.id}><div className="round-icon"><Building2 size={17}/></div><div className="grow"><b>{c.client_name}</b><small>{c.business_type||"Business"} · {c.location||"Location not set"}</small></div><span className={`status ${c.status}`}>{c.status}</span></div>)}{!clients.length&&<p className="empty">Your client directory is ready. Add your first client record.</p>}</section><section className="panel"><div className="panel-title"><div><h3>Application portfolio</h3><p className="muted tiny">Registered Nexora products</p></div><button className="text-btn" onClick={()=>onGo("Applications")}>View all →</button></div>{apps.slice(0,5).map(a=><div className="list-row" key={a.id}><div className="round-icon"><AppWindow size={17}/></div><div className="grow"><b>{a.app_name}</b><small>{a.app_code} · {a.current_version||"Version pending"}</small></div><span className={`status ${a.status}`}>{a.status}</span></div>)}{!apps.length&&<p className="empty">Add your Nexora products to the application registry.</p>}</section></div><section className="notice"><ShieldCheck/><div><b>Security-first rollout</b><p>Client data is protected by database access policies. Complete administrator bootstrap and verify role-based access before publishing this portal.</p></div></section></>;
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
