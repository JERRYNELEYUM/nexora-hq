# Nexora HQ — starter MVP

This is an independent Nexora HQ starter application. It is intentionally separate from Nexora Stay, Nexora POS and other customer-facing products.

## Included in this first build

- React + TypeScript + Vite frontend
- Supabase email/password authentication
- Central organization membership model
- Client directory with create-client flow
- Application registry
- Initial project, support, invoice and audit-log database tables
- Row Level Security (RLS) policies
- Responsive admin dashboard layout

## Not yet production-complete

The Projects, Support, Finance and Team screens are placeholders. There is no client-facing portal, payment gateway, email/WhatsApp notification automation, staff invitation UI, full audit event pipeline, or integration with Nexora Stay/POS yet. Do not treat this starter as a finished production system.

## 1. Create the GitHub repository

Create a new repository named `nexora-hq` under the Nexora GitHub account. Use Private visibility. Do not reuse or overwrite the Nexora Stay or Nexora POS repositories.

Upload the contents of this folder to the repository root.

## 2. Create Supabase project

1. Sign in at https://supabase.com/dashboard
2. Create a new project named `nexora-hq-prod` (or `nexora-hq-dev` for initial testing).
3. Select a strong database password and save it in a password manager.
4. Choose a region suitable for your users and acceptable latency. Check available regions and data-residency needs before choosing.
5. Wait for provisioning to finish.

For the safest start, use separate development and production Supabase projects. Do not test schema changes on the production database.

## 3. Create the database schema

1. Open the Supabase project.
2. Go to SQL Editor.
3. Open `supabase/schema.sql` from this repository.
4. Review it, then paste and run it.
5. Confirm the tables and RLS policies were created.

## 4. Create the first administrator

1. In Supabase, open Authentication > Users.
2. Add/invite your own administrator email.
3. Confirm the user exists.
4. Return to SQL Editor.
5. In the commented FIRST-ADMIN BOOTSTRAP section at the bottom of `schema.sql`, copy the organization INSERT and run it. Copy the returned UUID.
6. Replace `PASTE_ORGANIZATION_UUID` and `YOUR_ADMIN_EMAIL` in the membership INSERT, then run it.
7. Confirm one `organization_members` row exists with role `super_admin`.

Do not turn off email confirmation in production merely to make setup easier. Configure the desired email delivery and password reset flow before inviting staff.

## 5. Seed the application registry

Use the seed SQL at the bottom of `schema.sql`. Replace the organization UUID and run it. Check the actual repository URLs and app names before inserting. Update status and production URLs only after verifying the live deployments.

## 6. Run locally on Windows

Install the current Node.js LTS release from https://nodejs.org/.

Open PowerShell in the project folder:

```powershell
npm install
Copy-Item .env.example .env
```

Open `.env` and fill in:

- `VITE_SUPABASE_URL`: Supabase Project URL
- `VITE_SUPABASE_ANON_KEY`: Supabase publishable key (or legacy anon key)

Find these in Supabase Project Settings > API. Never use the `service_role` / secret key in a Vite frontend.

Then run:

```powershell
npm run dev
```

Open the localhost URL printed in the terminal, normally `http://localhost:5173`.

## 7. Verify the first release

- Sign in as the administrator.
- Confirm the dashboard loads.
- Add a test client (use clearly marked test data).
- Confirm the client appears in the client list.
- Confirm the application registry loads.
- Sign out and verify the dashboard is no longer accessible.
- Test with a second user who is not a member: they must not see organization records.
- Check Supabase Logs and browser console for errors.

## 8. Deploy to Cloudflare Pages

1. Push the project to GitHub.
2. In Cloudflare Dashboard, open Workers & Pages > Create > Pages > Connect to Git.
3. Select the private `nexora-hq` repository.
4. Framework preset: Vite.
5. Build command: `npm run build`.
6. Build output directory: `dist`.
7. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
8. Deploy.
9. In Supabase Authentication > URL Configuration, set the deployed site URL as the Site URL and add the production URL and local development URL to Redirect URLs as required.
10. Test login, refresh, logout and data access on the deployed URL.

## 9. Before using real client data

This starter has only the first security layer. Before production client records are loaded:

- Add automated tests for every RLS policy and role.
- Add a proper permission matrix (especially finance, support and technical roles).
- Add audit logging for create/update/delete and sensitive actions.
- Add staff invitation and account revocation workflows.
- Add database backup schedules and perform a restore test.
- Add server-side validation and rate limits for privileged actions.
- Add pagination, input validation and error monitoring.
- Review data protection, retention and client contract requirements.
- Perform an independent security review.
- Keep development and production projects separate.

## Architecture decision

Nexora HQ owns company-level client, project, application, support and finance metadata. It should not copy all hotel guest records, POS sales, payroll or clinic records into the HQ database. Those remain in their respective application databases unless a carefully designed, consented integration requires limited summary data.

## Recommended next modules

1. Staff invitations and granular permissions
2. Client onboarding checklist and documents
3. Contracts, subscriptions and invoices
4. Project tasks and milestones
5. Support ticket workflow
6. Deployment registry and release log
7. Client portal
8. Secure integrations with Nexora Stay and Nexora POS
