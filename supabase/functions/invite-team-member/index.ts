// Supabase Edge Function: invite-team-member
// Sends a Supabase Auth invite email (if the person has no account yet) and then attaches them
// to the organisation using the SAME secure RPC the app already uses, called as the signed-in user.
// The service-role key stays on the server and never reaches the browser.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Reflect whatever headers the browser asks to send. supabase-js adds new headers over time,
// and a fixed allow-list makes the browser block the call before it ever reaches this function.
const corsFor = (req: Request) => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    req.headers.get("Access-Control-Request-Headers") ?? "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
});

const ROLES = ["organization_admin", "operations_manager", "technical_admin", "finance_officer", "support_officer", "staff"];

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "You must be signed in." }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: who, error: whoErr } = await userClient.auth.getUser();
    if (whoErr || !who?.user) return json({ error: "Your session has expired. Sign in again." }, 401);

    const body = await req.json().catch(() => ({}));
    const organizationId = String(body.organization_id ?? "");
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = String(body.role ?? "");
    const redirectTo = typeof body.redirect_to === "string" ? body.redirect_to : undefined;

    if (!organizationId || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: "Enter a valid email address." }, 400);
    }
    if (!ROLES.includes(role)) return json({ error: "Invalid organisation role." }, 400);

    // Permission check, performed as the caller (RLS / RPC rules apply).
    const { data: central } = await userClient.rpc("is_nexora_super_admin");
    const isCentral = central === true;
    if (!isCentral) {
      const { error: permErr } = await userClient.rpc("get_organization_team", { p_organization_id: organizationId });
      if (permErr) return json({ error: "You are not authorised to manage this organisation team." }, 403);
    }
    if (role === "organization_admin" && !isCentral) {
      return json({ error: "Only the central Nexora Super Admin can assign an organisation administrator." }, 403);
    }

    // Invite (ignore "already registered": we then simply attach the existing account).
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
    let invited = true;
    if (inviteErr) {
      if (/already|registered|exists/i.test(inviteErr.message)) invited = false;
      else return json({ error: `Invite failed: ${inviteErr.message}` }, 400);
    }

    const { error: addErr } = await userClient.rpc("add_organization_member_by_email", {
      p_organization_id: organizationId, p_email: email, p_role: role,
    });
    if (addErr) return json({ error: addErr.message, invited }, 400);

    return json({ ok: true, invited });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error." }, 500);
  }
});
