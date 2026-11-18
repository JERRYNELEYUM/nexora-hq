import { invoiceConfig as cfg } from "./invoiceConfig";

type Currency = "XAF" | "USD" | "EUR";

export type PrintableInvoice = {
  number: string;
  status: "draft" | "sent" | "void";
  currency: Currency;
  issueDate: string;
  dueDate: string | null;
  notes: string | null;
  clientName: string;
  projectName: string | null;
  items: { description: string; quantity: number; unitPrice: number }[];
  payments: { amount: number; method: string; paidOn: string; reference: string | null }[];
};

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (n: number, c: Currency) =>
  `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: c === "XAF" ? 0 : 2, minimumFractionDigits: c === "XAF" ? 0 : 2 }).format(n)} ${c}`;
const date = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function buildHtml(inv: PrintableInvoice): string {
  const total = inv.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
  const balance = Math.max(total - paid, 0);
  const label = inv.status === "void" ? "VOID" : inv.status === "draft" ? "DRAFT" : total > 0 && balance <= 0 ? "PAID" : "";
  const contact = [cfg.phone, cfg.email, cfg.website].filter(Boolean).map(esc).join(" · ");

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(inv.number)}</title><style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; color: #1c2430; font-size: 12px; line-height: 1.5; margin: 0; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${esc(cfg.brandColor)}; padding-bottom: 14px; }
  .brand { display: flex; gap: 12px; align-items: center; }
  .mark { width: 46px; height: 46px; border-radius: 10px; background: ${esc(cfg.brandColor)}; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 700; }
  .logo { max-height: 52px; max-width: 160px; }
  h1 { margin: 0; font-size: 26px; letter-spacing: 2px; color: ${esc(cfg.brandColor)}; text-align: right; }
  .co { font-weight: 700; font-size: 15px; }
  .muted { color: #5b6573; }
  .meta { display: flex; justify-content: space-between; gap: 24px; margin: 20px 0; }
  .meta h4 { margin: 0 0 4px; font-size: 10px; letter-spacing: 1px; color: #5b6573; text-transform: uppercase; }
  .stamp { display: inline-block; border: 2px solid #b42318; color: #b42318; font-weight: 700; padding: 2px 10px; border-radius: 6px; letter-spacing: 2px; margin-top: 6px; }
  .stamp.paid { border-color: #1f9d6b; color: #1f9d6b; }
  table { width: 100%; border-collapse: collapse; }
  th { background: ${esc(cfg.brandColor)}; color: #fff; text-align: left; font-size: 10px; letter-spacing: 1px; padding: 8px; }
  td { padding: 8px; border-bottom: 1px solid #e3e7ee; vertical-align: top; }
  .r { text-align: right; } th.r { text-align: right; }
  .totals { margin: 14px 0 0 auto; width: 280px; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals .grand { border-top: 2px solid ${esc(cfg.brandColor)}; font-weight: 700; font-size: 14px; margin-top: 4px; padding-top: 8px; }
  .box { margin-top: 22px; padding: 12px 14px; border: 1px solid #e3e7ee; border-radius: 8px; page-break-inside: avoid; }
  .box h4 { margin: 0 0 6px; font-size: 10px; letter-spacing: 1px; color: #5b6573; text-transform: uppercase; }
  .box p { margin: 2px 0; }
  .foot { margin-top: 28px; text-align: center; color: #5b6573; font-size: 11px; }
  </style></head><body>
  <div class="top">
    <div class="brand">${cfg.logoUrl ? `<img class="logo" src="${esc(cfg.logoUrl)}" alt="">` : `<div class="mark">N</div>`}
      <div><div class="co">${esc(cfg.companyName)}</div>
        ${cfg.tagline ? `<div class="muted">${esc(cfg.tagline)}</div>` : ""}
        ${cfg.addressLines.map(l => `<div class="muted">${esc(l)}</div>`).join("")}
        ${contact ? `<div class="muted">${contact}</div>` : ""}</div></div>
    <div><h1>INVOICE</h1><div class="r"><b>${esc(inv.number)}</b></div>${label ? `<div class="r"><span class="stamp ${label === "PAID" ? "paid" : ""}">${label}</span></div>` : ""}</div>
  </div>
  <div class="meta">
    <div><h4>Billed to</h4><div><b>${esc(inv.clientName)}</b></div>${inv.projectName ? `<div class="muted">Project: ${esc(inv.projectName)}</div>` : ""}</div>
    <div class="r"><h4>Details</h4><div>Issued: ${date(inv.issueDate)}</div><div>Due: ${date(inv.dueDate)}</div><div>Currency: ${inv.currency}</div></div>
  </div>
  <table><thead><tr><th>DESCRIPTION</th><th class="r">QTY</th><th class="r">UNIT PRICE</th><th class="r">AMOUNT</th></tr></thead><tbody>
    ${inv.items.map(i => `<tr><td>${esc(i.description)}</td><td class="r">${i.quantity}</td><td class="r">${money(i.unitPrice, inv.currency)}</td><td class="r">${money(i.quantity * i.unitPrice, inv.currency)}</td></tr>`).join("")}
  </tbody></table>
  <div class="totals">
    <div><span>Total</span><span>${money(total, inv.currency)}</span></div>
    <div><span>Paid</span><span>${money(paid, inv.currency)}</span></div>
    <div class="grand"><span>Balance due</span><span>${money(balance, inv.currency)}</span></div>
  </div>
  ${inv.payments.length ? `<div class="box"><h4>Payments received</h4>${inv.payments.map(p => `<p>${date(p.paidOn)} · ${esc(p.method)} · ${money(p.amount, inv.currency)}${p.reference ? ` · ref ${esc(p.reference)}` : ""}</p>`).join("")}</div>` : ""}
  ${balance > 0 && cfg.paymentInstructions.length ? `<div class="box"><h4>How to pay</h4>${cfg.paymentInstructions.map(l => `<p>${esc(l)}</p>`).join("")}<p class="muted">Please quote ${esc(inv.number)} as the payment reference.</p></div>` : ""}
  ${inv.notes ? `<div class="box"><h4>Notes</h4><p>${esc(inv.notes)}</p></div>` : ""}
  ${cfg.footerNote ? `<div class="foot">${esc(cfg.footerNote)}</div>` : ""}
  </body></html>`;
}

// Opens the browser print dialog for a clean A4 invoice. Choose "Save as PDF" as the destination.
export async function printInvoice(inv: PrintableInvoice): Promise<void> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) { frame.remove(); throw new Error("Could not prepare the invoice for printing."); }
  doc.open(); doc.write(buildHtml(inv)); doc.close();
  await Promise.all(Array.from(doc.images).map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = () => r(null); })));
  await new Promise(r => setTimeout(r, 150));
  win.focus();
  win.print();
  setTimeout(() => frame.remove(), 60000);
}
