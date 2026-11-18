import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import Attachments from "./Attachments";
import { Banknote, ChevronRight, Clock, Paperclip, Plus, Printer, ReceiptText, RefreshCw, ShieldCheck, Trash2, Wallet, X } from "lucide-react";
import { printInvoice } from "./invoicePdf";

type InvStatus = "draft" | "sent" | "void";
type Currency = "XAF" | "USD" | "EUR";
type Method = "cash" | "mobile_money" | "bank_transfer" | "card" | "other";

type Invoice = { id: string; client_id: string; project_id: string | null; invoice_number: string; status: InvStatus; currency: Currency; issue_date: string; due_date: string | null; notes: string | null; created_at: string };
type Item = { id: string; invoice_id: string; description: string; quantity: number; unit_price: number };
type Payment = { id: string; invoice_id: string; amount: number; method: Method; paid_on: string; reference: string | null };
type Expense = { id: string; project_id: string | null; category: string; description: string; amount: number; currency: Currency; spent_on: string };

const methodLabels: Record<Method, string> = { cash: "Cash", mobile_money: "Mobile money", bank_transfer: "Bank transfer", card: "Card", other: "Other" };
const categories = ["Internet & hosting", "Software & licences", "Transport", "Contractors & salaries", "Office & utilities", "Marketing", "Other"];
const currencies: Currency[] = ["XAF", "USD", "EUR"];
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString() : "—");
const money = (n: number, c: Currency) => `${new Intl.NumberFormat(undefined, { maximumFractionDigits: c === "XAF" ? 0 : 2 }).format(n)} ${c}`;

const emptyInvoice = () => ({ client_id: "", project_id: "", currency: "XAF" as Currency, issue_date: today(), due_date: "", notes: "", items: [{ description: "", quantity: "1", unit_price: "" }] });
const emptyExpense = () => ({ category: categories[0], description: "", amount: "", currency: "XAF" as Currency, spent_on: today(), project_id: "" });

export default function FinanceModule({ organizationId, clients, canAccess }: {
  organizationId: string;
  clients: { id: string; client_name: string }[];
  canAccess: boolean;
}) {
  const [tab, setTab] = useState<"invoices" | "expenses">("invoices");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string; client_id: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [cur, setCur] = useState<Currency>("XAF");
  const [showInvoice, setShowInvoice] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  const [invForm, setInvForm] = useState(emptyInvoice());
  const [expForm, setExpForm] = useState(emptyExpense());
  const [payForm, setPayForm] = useState({ amount: "", method: "mobile_money" as Method, paid_on: today(), reference: "" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expenseFilesId, setExpenseFilesId] = useState<string | null>(null);

  const clientName = useMemo(() => new Map(clients.map(c => [c.id, c.client_name])), [clients]);

  useEffect(() => { if (canAccess) load(); else setLoading(false); /* eslint-disable-next-line */ }, [organizationId, canAccess]);

  async function load() {
    if (!supabase) return;
    setLoading(true); setMessage("");
    const [i, it, p, ex, pr] = await Promise.all([
      supabase.from("invoices").select("id,client_id,project_id,invoice_number,status,currency,issue_date,due_date,notes,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }),
      supabase.from("invoice_items").select("id,invoice_id,description,quantity,unit_price").eq("organization_id", organizationId),
      supabase.from("payments").select("id,invoice_id,amount,method,paid_on,reference").eq("organization_id", organizationId).order("paid_on", { ascending: true }),
      supabase.from("expenses").select("id,project_id,category,description,amount,currency,spent_on").eq("organization_id", organizationId).order("spent_on", { ascending: false }),
      supabase.from("projects").select("id,name,client_id").eq("organization_id", organizationId).order("name")
    ]);
    const firstError = [i, it, p, ex].find(r => r.error);
    if (firstError?.error) setMessage(`Could not load finance data: ${firstError.error.message}. Run nexora_support_finance.sql in the Supabase SQL Editor if you have not yet.`);
    setInvoices((i.data ?? []) as Invoice[]);
    setItems(((it.data ?? []) as Item[]).map(x => ({ ...x, quantity: Number(x.quantity), unit_price: Number(x.unit_price) })));
    setPayments(((p.data ?? []) as Payment[]).map(x => ({ ...x, amount: Number(x.amount) })));
    setExpenses(((ex.data ?? []) as Expense[]).map(x => ({ ...x, amount: Number(x.amount) })));
    setProjects((pr.data ?? []) as { id: string; name: string; client_id: string | null }[]);
    setLoading(false);
  }

  const calc = useMemo(() => {
    const map = new Map<string, { total: number; paid: number }>();
    invoices.forEach(inv => map.set(inv.id, { total: 0, paid: 0 }));
    items.forEach(x => { const m = map.get(x.invoice_id); if (m) m.total += x.quantity * x.unit_price; });
    payments.forEach(x => { const m = map.get(x.invoice_id); if (m) m.paid += x.amount; });
    return map;
  }, [invoices, items, payments]);

  function derived(inv: Invoice): { label: string; cls: string; balance: number; overdue: boolean } {
    const c = calc.get(inv.id) ?? { total: 0, paid: 0 };
    const balance = Math.max(c.total - c.paid, 0);
    if (inv.status === "void") return { label: "Void", cls: "inactive", balance: 0, overdue: false };
    if (inv.status === "draft") return { label: "Draft", cls: "prospect", balance, overdue: false };
    if (c.total > 0 && balance <= 0) return { label: "Paid", cls: "active", balance: 0, overdue: false };
    const overdue = !!inv.due_date && inv.due_date < today();
    if (overdue) return { label: "Overdue", cls: "urgent", balance, overdue: true };
    return { label: c.paid > 0 ? "Part paid" : "Sent", cls: "onboarding", balance, overdue: false };
  }

  const stats = useMemo(() => {
    let invoiced = 0, collected = 0, overdue = 0;
    invoices.filter(i => i.currency === cur && i.status === "sent").forEach(inv => {
      const c = calc.get(inv.id) ?? { total: 0, paid: 0 };
      invoiced += c.total; collected += c.paid;
      const d = derived(inv); if (d.overdue) overdue += d.balance;
    });
    const spent = expenses.filter(e => e.currency === cur).reduce((s, e) => s + e.amount, 0);
    return { invoiced, collected, outstanding: invoiced - collected, overdue, spent };
    // eslint-disable-next-line
  }, [invoices, calc, expenses, cur]);

  const selected = invoices.find(i => i.id === selectedId) ?? null;
  const selItems = items.filter(x => x.invoice_id === selectedId);
  const selPayments = payments.filter(x => x.invoice_id === selectedId);
  const selCalc = selected ? (calc.get(selected.id) ?? { total: 0, paid: 0 }) : { total: 0, paid: 0 };
  const selBalance = Math.max(selCalc.total - selCalc.paid, 0);

  async function printSelected() {
    if (!selected) return;
    try {
      await printInvoice({
        number: selected.invoice_number, status: selected.status, currency: selected.currency,
        issueDate: selected.issue_date, dueDate: selected.due_date, notes: selected.notes,
        clientName: clientName.get(selected.client_id) ?? "Client",
        projectName: projects.find(p => p.id === selected.project_id)?.name ?? null,
        items: selItems.map(x => ({ description: x.description, quantity: x.quantity, unitPrice: x.unit_price })),
        payments: selPayments.map(x => ({ amount: x.amount, method: methodLabels[x.method], paidOn: x.paid_on, reference: x.reference }))
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not open the print dialog.");
    }
  }

  const formTotal = invForm.items.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.unit_price) || 0), 0);

  async function createInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    const rows = invForm.items.filter(r => r.description.trim() || r.unit_price);
    if (!invForm.client_id) { setMessage("Choose a client for this invoice."); return; }
    if (!rows.length || rows.some(r => !r.description.trim() || !(Number(r.quantity) > 0) || !(Number(r.unit_price) >= 0) || r.unit_price === "")) {
      setMessage("Every line needs a description, a quantity above zero and a unit price."); return;
    }
    if (invForm.due_date && invForm.due_date < invForm.issue_date) { setMessage("The due date cannot be earlier than the issue date."); return; }
    setSaving(true); setMessage("");
    const { data: inv, error } = await supabase.from("invoices").insert({
      organization_id: organizationId, client_id: invForm.client_id, project_id: invForm.project_id || null,
      currency: invForm.currency, issue_date: invForm.issue_date, due_date: invForm.due_date || null, notes: invForm.notes.trim() || null
    }).select("id").single();
    if (error || !inv) { setMessage(`Invoice not saved: ${error?.message ?? "unknown error"}`); setSaving(false); return; }
    const { error: itemsError } = await supabase.from("invoice_items").insert(rows.map(r => ({
      organization_id: organizationId, invoice_id: inv.id, description: r.description.trim(), quantity: Number(r.quantity), unit_price: Number(r.unit_price)
    })));
    if (itemsError) {
      await supabase.from("invoices").delete().eq("id", inv.id).eq("organization_id", organizationId);
      setMessage(`Invoice lines not saved, so the draft was discarded: ${itemsError.message}`);
    } else {
      setShowInvoice(false); setInvForm(emptyInvoice()); setMessage("Draft invoice created. Mark it as sent when you issue it to the client.");
      await load(); setSelectedId(inv.id);
    }
    setSaving(false);
  }

  async function setInvoiceStatus(inv: Invoice, status: InvStatus) {
    if (!supabase) return;
    if (status === "void" && !window.confirm(`Void ${inv.invoice_number}? It will stop counting towards your totals.`)) return;
    setBusyId(inv.id); setMessage("");
    const { error } = await supabase.from("invoices").update({ status }).eq("id", inv.id).eq("organization_id", organizationId);
    if (error) setMessage(`Update failed: ${error.message}`); else await load();
    setBusyId(null);
  }

  async function deleteInvoice(inv: Invoice) {
    if (!supabase) return;
    if (!window.confirm(`Delete draft ${inv.invoice_number}? This cannot be undone.`)) return;
    setBusyId(inv.id); setMessage("");
    const { error } = await supabase.from("invoices").delete().eq("id", inv.id).eq("organization_id", organizationId);
    if (error) setMessage(`Delete failed: ${error.message}`);
    else { setSelectedId(null); await load(); }
    setBusyId(null);
  }

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !selected) return;
    const amount = Number(payForm.amount);
    if (!(amount > 0)) { setMessage("Enter a payment amount above zero."); return; }
    if (amount > selBalance) { setMessage(`The payment is more than the remaining balance (${money(selBalance, selected.currency)}).`); return; }
    setBusyId("pay"); setMessage("");
    const { error } = await supabase.from("payments").insert({
      organization_id: organizationId, invoice_id: selected.id, amount, method: payForm.method,
      paid_on: payForm.paid_on, reference: payForm.reference.trim() || null
    });
    if (error) setMessage(`Payment not recorded: ${error.message}`);
    else { setPayForm({ amount: "", method: "mobile_money", paid_on: today(), reference: "" }); setMessage("Payment recorded."); await load(); }
    setBusyId(null);
  }

  async function deletePayment(p: Payment) {
    if (!supabase) return;
    if (!window.confirm("Remove this payment record?")) return;
    setBusyId(p.id);
    const { error } = await supabase.from("payments").delete().eq("id", p.id).eq("organization_id", organizationId);
    if (error) setMessage(`Removal failed: ${error.message}`); else await load();
    setBusyId(null);
  }

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    const amount = Number(expForm.amount);
    if (!(amount > 0)) { setMessage("Enter an expense amount above zero."); return; }
    setSaving(true); setMessage("");
    const { error } = await supabase.from("expenses").insert({
      organization_id: organizationId, category: expForm.category, description: expForm.description.trim(),
      amount, currency: expForm.currency, spent_on: expForm.spent_on, project_id: expForm.project_id || null
    });
    if (error) setMessage(`Expense not saved: ${error.message}`);
    else { setShowExpense(false); setExpForm(emptyExpense()); setMessage("Expense recorded."); await load(); }
    setSaving(false);
  }

  async function deleteExpense(x: Expense) {
    if (!supabase) return;
    if (!window.confirm(`Delete the expense "${x.description}"?`)) return;
    setBusyId(x.id);
    const { error } = await supabase.from("expenses").delete().eq("id", x.id).eq("organization_id", organizationId);
    if (error) setMessage(`Delete failed: ${error.message}`); else setExpenses(l => l.filter(e => e.id !== x.id));
    setBusyId(null);
  }

  if (!canAccess) return <section className="panel coming"><div className="app-icon"><ShieldCheck/></div><h2>Finance is restricted</h2>
    <p className="muted">Invoices, payments and expenses are visible to finance officers, operations managers and organisation administrators. Ask your organisation administrator if you need access.</p></section>;

  const projectsForClient = projects.filter(p => !invForm.client_id || p.client_id === invForm.client_id || !p.client_id);

  return <>
    <div className="stats">
      <div className="stat-card"><div className="stat-top"><span>Invoiced</span><span className="stat-icon"><ReceiptText/></span></div><strong>{money(stats.invoiced, cur)}</strong><small>Sent invoices</small></div>
      <div className="stat-card"><div className="stat-top"><span>Collected</span><span className="stat-icon"><Wallet/></span></div><strong>{money(stats.collected, cur)}</strong><small>Payments received</small></div>
      <div className="stat-card"><div className="stat-top"><span>Outstanding</span><span className="stat-icon"><Clock/></span></div><strong>{money(stats.outstanding, cur)}</strong><small>{stats.overdue > 0 ? `${money(stats.overdue, cur)} is overdue` : "Nothing overdue"}</small></div>
      <div className="stat-card"><div className="stat-top"><span>Expenses</span><span className="stat-icon"><Banknote/></span></div><strong>{money(stats.spent, cur)}</strong><small>All recorded spending</small></div>
    </div>

    <section className="panel">
      <div className="toolbar">
        <div style={{display:"flex",gap:8}}>
          <button type="button" className={tab==="invoices"?"primary":"secondary"} onClick={()=>setTab("invoices")}>Invoices</button>
          <button type="button" className={tab==="expenses"?"primary":"secondary"} onClick={()=>setTab("expenses")}>Expenses</button>
        </div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
          <select aria-label="Currency shown in summary" value={cur} onChange={e=>setCur(e.target.value as Currency)}>{currencies.map(c=><option key={c} value={c}>{c} totals</option>)}</select>
          <button className="secondary" type="button" onClick={load} disabled={loading}><RefreshCw size={15}/> Refresh</button>
          {tab==="invoices" ? <button className="primary" type="button" onClick={()=>setShowInvoice(true)}><Plus size={17}/> New invoice</button>
                            : <button className="primary" type="button" onClick={()=>setShowExpense(true)}><Plus size={17}/> Add expense</button>}
        </div>
      </div>
      {message && <div className="alert" style={{marginBottom:15}}>{message}</div>}
      {loading ? <p className="muted">Loading finance records…</p> : tab==="invoices" ?
        <div className="table-wrap"><table>
          <thead><tr><th>INVOICE</th><th>STATUS</th><th>TOTAL</th><th>BALANCE</th><th>DUE</th><th></th></tr></thead>
          <tbody>
            {invoices.map(inv => { const c = calc.get(inv.id) ?? {total:0,paid:0}; const d = derived(inv);
              return <tr key={inv.id}>
                <td><b>{inv.invoice_number}</b><small className="subcell">{clientName.get(inv.client_id) ?? "Client"}</small></td>
                <td><span className={`status ${d.cls}`}>{d.label}</span></td>
                <td>{money(c.total, inv.currency)}</td>
                <td>{inv.status==="sent" ? money(d.balance, inv.currency) : "—"}</td>
                <td>{fmtDate(inv.due_date)}</td>
                <td><button type="button" className="secondary" onClick={()=>setSelectedId(inv.id)}>Open <ChevronRight size={14}/></button></td>
              </tr>; })}
            {!invoices.length && <tr><td colSpan={6} className="empty">No invoices yet. Select New invoice to bill a client.</td></tr>}
          </tbody></table></div>
        :
        <div className="table-wrap"><table>
          <thead><tr><th>EXPENSE</th><th>CATEGORY</th><th>DATE</th><th>AMOUNT</th><th></th></tr></thead>
          <tbody>
            {expenses.map(x => <tr key={x.id}>
              <td><b>{x.description}</b><small className="subcell">{projects.find(p=>p.id===x.project_id)?.name ?? "Not linked to a project"}</small></td>
              <td>{x.category}</td><td>{fmtDate(x.spent_on)}</td><td>{money(x.amount, x.currency)}</td>
              <td style={{whiteSpace:"nowrap"}}><button type="button" className="icon-btn" aria-label={`Receipts for ${x.description}`} onClick={()=>setExpenseFilesId(x.id)}><Paperclip size={15}/></button> <button type="button" className="icon-btn" aria-label={`Delete ${x.description}`} disabled={busyId===x.id} onClick={()=>deleteExpense(x)}><Trash2 size={15}/></button></td>
            </tr>)}
            {!expenses.length && <tr><td colSpan={5} className="empty">No expenses recorded yet.</td></tr>}
          </tbody></table></div>}
    </section>

    {tab==="expenses" && expenseFilesId && <section className="panel" style={{marginTop:18}}>
      <div className="toolbar"><div><b>Receipts and files</b><p className="muted tiny">{expenses.find(e=>e.id===expenseFilesId)?.description ?? "Expense"}</p></div>
        <button type="button" className="icon-btn" aria-label="Close files" onClick={()=>setExpenseFilesId(null)}><X size={18}/></button></div>
      <Attachments organizationId={organizationId} entityType="expense" entityId={expenseFilesId} canWrite={canAccess} title="Receipts"/>
    </section>}

    {selected && tab==="invoices" && <section className="panel" style={{marginTop:18}}>
      <div className="toolbar">
        <div><b>{selected.invoice_number}</b><p className="muted tiny">{clientName.get(selected.client_id) ?? "Client"} · issued {fmtDate(selected.issue_date)} · due {fmtDate(selected.due_date)}</p></div>
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
          <button type="button" className="secondary" onClick={printSelected}><Printer size={14}/> Print / PDF</button>
          {selected.status==="draft" && <button type="button" className="primary" disabled={busyId===selected.id} onClick={()=>setInvoiceStatus(selected,"sent")}>Mark as sent</button>}
          {selected.status==="draft" && <button type="button" className="secondary" disabled={busyId===selected.id} onClick={()=>deleteInvoice(selected)}><Trash2 size={14}/> Delete draft</button>}
          {selected.status==="sent" && <button type="button" className="secondary" disabled={busyId===selected.id} onClick={()=>setInvoiceStatus(selected,"void")}>Void invoice</button>}
          <button type="button" className="icon-btn" aria-label="Close invoice" onClick={()=>setSelectedId(null)}><X size={18}/></button>
        </div>
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>DESCRIPTION</th><th>QTY</th><th>UNIT PRICE</th><th>AMOUNT</th></tr></thead>
        <tbody>
          {selItems.map(x=><tr key={x.id}><td>{x.description}</td><td>{x.quantity}</td><td>{money(x.unit_price, selected.currency)}</td><td>{money(x.quantity*x.unit_price, selected.currency)}</td></tr>)}
          <tr><td colSpan={3}><b>Total</b></td><td><b>{money(selCalc.total, selected.currency)}</b></td></tr>
          <tr><td colSpan={3}>Paid</td><td>{money(selCalc.paid, selected.currency)}</td></tr>
          <tr><td colSpan={3}><b>Balance due</b></td><td><b>{money(selBalance, selected.currency)}</b></td></tr>
        </tbody></table></div>
      {selected.notes && <p className="muted tiny" style={{marginTop:12}}>Notes: {selected.notes}</p>}

      <div style={{marginTop:18}}><b>Payments</b>
        {selPayments.map(p=><div className="list-row" key={p.id}>
          <div className="grow"><b>{money(p.amount, selected.currency)}</b><small>{methodLabels[p.method]} · {fmtDate(p.paid_on)}{p.reference ? ` · ref ${p.reference}` : ""}</small></div>
          <button type="button" className="icon-btn" aria-label="Remove payment" disabled={busyId===p.id} onClick={()=>deletePayment(p)}><Trash2 size={15}/></button>
        </div>)}
        {!selPayments.length && <p className="empty">{selected.status==="sent" ? "No payments recorded yet." : "Payments can be recorded once the invoice is marked as sent."}</p>}
      </div>
      {selected.status==="sent" && selBalance>0 && <form onSubmit={recordPayment} style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:14}}>
        <input type="number" min="0" step="0.01" required placeholder={`Amount (max ${selBalance})`} value={payForm.amount} onChange={e=>setPayForm({...payForm,amount:e.target.value})} aria-label="Payment amount"/>
        <select value={payForm.method} onChange={e=>setPayForm({...payForm,method:e.target.value as Method})} aria-label="Payment method">{(Object.keys(methodLabels) as Method[]).map(m=><option key={m} value={m}>{methodLabels[m]}</option>)}</select>
        <input type="date" required value={payForm.paid_on} onChange={e=>setPayForm({...payForm,paid_on:e.target.value})} aria-label="Payment date"/>
        <input placeholder="Reference (optional)" value={payForm.reference} onChange={e=>setPayForm({...payForm,reference:e.target.value})} aria-label="Payment reference"/>
        <button className="primary" disabled={busyId==="pay"}><Plus size={16}/> Record payment</button>
      </form>}
      <Attachments organizationId={organizationId} entityType="invoice" entityId={selected.id} canWrite={canAccess} title="Invoice files"/>
    </section>}

    {showInvoice && <div className="modal-backdrop"><form className="modal" onSubmit={createInvoice}>
      <div className="modal-head"><div><h2>New invoice</h2><p className="muted tiny">The invoice number is generated automatically.</p></div><button type="button" className="icon-btn" aria-label="Close" onClick={()=>setShowInvoice(false)}><X/></button></div>
      <label>Client<select required value={invForm.client_id} onChange={e=>setInvForm({...invForm,client_id:e.target.value,project_id:""})}>
        <option value="">Select a client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.client_name}</option>)}</select></label>
      <label>Project<select value={invForm.project_id} onChange={e=>setInvForm({...invForm,project_id:e.target.value})}>
        <option value="">Not linked</option>{projectsForClient.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Currency<select value={invForm.currency} onChange={e=>setInvForm({...invForm,currency:e.target.value as Currency})}>{currencies.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
      <label>Issue date<input type="date" required value={invForm.issue_date} onChange={e=>setInvForm({...invForm,issue_date:e.target.value})}/></label>
      <label>Due date<input type="date" value={invForm.due_date} onChange={e=>setInvForm({...invForm,due_date:e.target.value})}/></label>
      <b style={{marginTop:6}}>Lines</b>
      {invForm.items.map((r, idx) => <div key={idx} style={{display:"grid",gridTemplateColumns:"1fr 70px 110px auto",gap:8,marginBottom:8}}>
        <input placeholder="Description" value={r.description} onChange={e=>setInvForm({...invForm,items:invForm.items.map((x,i)=>i===idx?{...x,description:e.target.value}:x)})} aria-label={`Line ${idx+1} description`}/>
        <input type="number" min="0" step="0.01" value={r.quantity} onChange={e=>setInvForm({...invForm,items:invForm.items.map((x,i)=>i===idx?{...x,quantity:e.target.value}:x)})} aria-label={`Line ${idx+1} quantity`}/>
        <input type="number" min="0" step="0.01" placeholder="Unit price" value={r.unit_price} onChange={e=>setInvForm({...invForm,items:invForm.items.map((x,i)=>i===idx?{...x,unit_price:e.target.value}:x)})} aria-label={`Line ${idx+1} unit price`}/>
        <button type="button" className="icon-btn" aria-label={`Remove line ${idx+1}`} disabled={invForm.items.length===1} onClick={()=>setInvForm({...invForm,items:invForm.items.filter((_,i)=>i!==idx)})}><Trash2 size={15}/></button>
      </div>)}
      <button type="button" className="secondary" onClick={()=>setInvForm({...invForm,items:[...invForm.items,{description:"",quantity:"1",unit_price:""}]})}><Plus size={14}/> Add line</button>
      <p style={{marginTop:10}}><b>Total: {money(formTotal, invForm.currency)}</b></p>
      <label>Notes<textarea rows={2} value={invForm.notes} onChange={e=>setInvForm({...invForm,notes:e.target.value})} placeholder="Payment instructions or terms"/></label>
      <div className="modal-actions"><button type="button" className="secondary" onClick={()=>setShowInvoice(false)}>Cancel</button><button className="primary" disabled={saving}>{saving?"Saving…":"Save as draft"}</button></div>
    </form></div>}

    {showExpense && <div className="modal-backdrop"><form className="modal" onSubmit={addExpense}>
      <div className="modal-head"><div><h2>Add an expense</h2><p className="muted tiny">Record money Nexora has spent.</p></div><button type="button" className="icon-btn" aria-label="Close" onClick={()=>setShowExpense(false)}><X/></button></div>
      <label>Description<input required value={expForm.description} onChange={e=>setExpForm({...expForm,description:e.target.value})}/></label>
      <label>Category<select value={expForm.category} onChange={e=>setExpForm({...expForm,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
      <label>Amount<input type="number" min="0" step="0.01" required value={expForm.amount} onChange={e=>setExpForm({...expForm,amount:e.target.value})}/></label>
      <label>Currency<select value={expForm.currency} onChange={e=>setExpForm({...expForm,currency:e.target.value as Currency})}>{currencies.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
      <label>Date<input type="date" required value={expForm.spent_on} onChange={e=>setExpForm({...expForm,spent_on:e.target.value})}/></label>
      <label>Project<select value={expForm.project_id} onChange={e=>setExpForm({...expForm,project_id:e.target.value})}><option value="">Not linked</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <div className="modal-actions"><button type="button" className="secondary" onClick={()=>setShowExpense(false)}>Cancel</button><button className="primary" disabled={saving}>{saving?"Saving…":"Save expense"}</button></div>
    </form></div>}
  </>;
}
