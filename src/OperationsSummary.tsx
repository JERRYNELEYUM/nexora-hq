import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { AlertTriangle, CircleHelp, Clock, Hammer, Wallet, CheckCircle2 } from "lucide-react";

type SectionName = "Projects" | "Support" | "Finance";
type Go = (section: SectionName) => void;
type Currency = "XAF" | "USD" | "EUR";

type P = { id: string; name: string; status: string; due_date: string | null };
type T = { id: string; title: string; status: string; priority: string };
type I = { id: string; invoice_number: string; status: string; currency: Currency; due_date: string | null };
type It = { invoice_id: string; quantity: number; unit_price: number };
type Pay = { invoice_id: string; amount: number };

const today = () => new Date().toISOString().slice(0, 10);
const money = (n: number, c: Currency) => `${new Intl.NumberFormat(undefined, { maximumFractionDigits: c === "XAF" ? 0 : 2 }).format(n)} ${c}`;
const fmt = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString() : "no date");

export default function OperationsSummary({ organizationId, canAccessFinance, onGo }: {
  organizationId: string; canAccessFinance: boolean; onGo: Go;
}) {
  const [projects, setProjects] = useState<P[]>([]);
  const [tickets, setTickets] = useState<T[]>([]);
  const [invoices, setInvoices] = useState<I[]>([]);
  const [items, setItems] = useState<It[]>([]);
  const [payments, setPayments] = useState<Pay[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return;
      setLoading(true); setFailed(false);
      const base = [
        supabase.from("projects").select("id,name,status,due_date").eq("organization_id", organizationId),
        supabase.from("support_tickets").select("id,title,status,priority").eq("organization_id", organizationId)
      ] as const;
      const [p, t] = await Promise.all(base);
      let bad = !!(p.error || t.error);
      let inv: I[] = [], it: It[] = [], pay: Pay[] = [];
      if (canAccessFinance) {
        const [i, x, y] = await Promise.all([
          supabase.from("invoices").select("id,invoice_number,status,currency,due_date").eq("organization_id", organizationId),
          supabase.from("invoice_items").select("invoice_id,quantity,unit_price").eq("organization_id", organizationId),
          supabase.from("payments").select("invoice_id,amount").eq("organization_id", organizationId)
        ]);
        if (i.error || x.error || y.error) bad = true;
        inv = (i.data ?? []) as I[];
        it = ((x.data ?? []) as It[]).map(r => ({ ...r, quantity: Number(r.quantity), unit_price: Number(r.unit_price) }));
        pay = ((y.data ?? []) as Pay[]).map(r => ({ ...r, amount: Number(r.amount) }));
      }
      if (cancelled) return;
      setProjects((p.data ?? []) as P[]); setTickets((t.data ?? []) as T[]);
      setInvoices(inv); setItems(it); setPayments(pay);
      setFailed(bad); setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [organizationId, canAccessFinance]);

  const data = useMemo(() => {
    const day = today();
    const openTickets = tickets.filter(t => !["resolved", "closed"].includes(t.status));
    const hot = openTickets.filter(t => t.priority === "urgent" || t.priority === "high");
    const activeProjects = projects.filter(p => p.status === "active");
    const lateProjects = projects.filter(p => !!p.due_date && p.due_date < day && !["completed", "cancelled"].includes(p.status));

    const totals = new Map<string, number>(), paid = new Map<string, number>();
    items.forEach(r => totals.set(r.invoice_id, (totals.get(r.invoice_id) ?? 0) + r.quantity * r.unit_price));
    payments.forEach(r => paid.set(r.invoice_id, (paid.get(r.invoice_id) ?? 0) + r.amount));
    const sent = invoices.filter(i => i.status === "sent");
    const balance = (i: I) => Math.max((totals.get(i.id) ?? 0) - (paid.get(i.id) ?? 0), 0);
    const lateInvoices = sent.filter(i => balance(i) > 0 && !!i.due_date && i.due_date < day);
    const owed = new Map<Currency, number>();
    sent.forEach(i => owed.set(i.currency, (owed.get(i.currency) ?? 0) + balance(i)));
    const owedList = [...owed.entries()].filter(([, v]) => v > 0);
    return { openTickets, hot, activeProjects, lateProjects, lateInvoices, owedList, balance };
  }, [projects, tickets, invoices, items, payments]);

  type Row = { key: string; icon: JSX.Element; title: string; note: string; go: SectionName };
  const rows: Row[] = [
    ...data.hot.slice(0, 4).map(t => ({ key: `t${t.id}`, icon: <AlertTriangle size={17}/>, title: t.title, note: `${t.priority === "urgent" ? "Urgent" : "High priority"} ticket`, go: "Support" as SectionName })),
    ...data.lateProjects.slice(0, 4).map(p => ({ key: `p${p.id}`, icon: <Clock size={17}/>, title: p.name, note: `Project overdue, was due ${fmt(p.due_date)}`, go: "Projects" as SectionName })),
    ...data.lateInvoices.slice(0, 4).map(i => ({ key: `i${i.id}`, icon: <Wallet size={17}/>, title: i.invoice_number, note: `Invoice overdue, ${money(data.balance(i), i.currency)} unpaid since ${fmt(i.due_date)}`, go: "Finance" as SectionName }))
  ].slice(0, 8);

  if (loading) return <section className="panel" style={{marginBottom:18}}><p className="muted">Loading today's operations…</p></section>;

  return <>
    <div className="stats">
      <div className="stat-card"><div className="stat-top"><span>Open tickets</span><span className="stat-icon"><CircleHelp/></span></div><strong>{data.openTickets.length}</strong><small>{data.hot.length ? `${data.hot.length} high or urgent` : "None high priority"}</small></div>
      <div className="stat-card"><div className="stat-top"><span>Active projects</span><span className="stat-icon"><Hammer/></span></div><strong>{data.activeProjects.length}</strong><small>{data.lateProjects.length ? `${data.lateProjects.length} overdue` : "None overdue"}</small></div>
      {canAccessFinance && <div className="stat-card"><div className="stat-top"><span>Overdue invoices</span><span className="stat-icon"><Clock/></span></div><strong>{data.lateInvoices.length}</strong><small>{data.lateInvoices.length ? "Follow up with clients" : "Nothing overdue"}</small></div>}
      {canAccessFinance && <div className="stat-card"><div className="stat-top"><span>Money owed to you</span><span className="stat-icon"><Wallet/></span></div>
        <strong style={{fontSize:data.owedList.length > 1 ? "1.1rem" : undefined}}>{data.owedList.length ? data.owedList.map(([c, v]) => money(v, c)).join(" · ") : "0"}</strong><small>Unpaid balance on sent invoices</small></div>}
    </div>

    <section className="panel" style={{marginBottom:18}}>
      <div className="panel-title"><div><h3>Needs attention</h3><p className="muted tiny">Urgent tickets, late projects{canAccessFinance ? " and overdue invoices" : ""}</p></div></div>
      {failed && <p className="muted tiny" style={{marginBottom:10}}>Some figures could not be loaded. Open the Projects, Support or Finance page for details.</p>}
      {rows.map(r => <div className="list-row" key={r.key}>
        <div className="round-icon">{r.icon}</div>
        <div className="grow"><b>{r.title}</b><small>{r.note}</small></div>
        <button className="text-btn" type="button" onClick={() => onGo(r.go)}>Open →</button>
      </div>)}
      {!rows.length && <div className="list-row"><div className="round-icon"><CheckCircle2 size={17}/></div><div className="grow"><b>All clear</b><small>No urgent tickets, late projects{canAccessFinance ? " or overdue invoices" : ""} right now.</small></div></div>}
    </section>
  </>;
}
