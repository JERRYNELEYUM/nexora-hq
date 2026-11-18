// Edit this file to change what appears on every printed invoice.
// Leave a text field as "" to hide it. To show your logo, put logo.png in the /public folder
// and set logoUrl to "/logo.png".
export const invoiceConfig = {
  companyName: "Nexora Smart Services Ltd",
  tagline: "Data management · IT consulting · Web & app development · Business automation",
  addressLines: ["Buea, South-West Region, Cameroon", "Yaoundé, Centre Region, Cameroon"],
  phone: "",
  email: "",
  website: "",
  logoUrl: "",
  brandColor: "#102b46",
  // One line per payment option. REPLACE these placeholders with your real details before sending invoices.
  paymentInstructions: [
    "MTN Mobile Money: [add number and account name]",
    "Orange Money: [add number and account name]",
    "Bank transfer: [add bank name, account name and account number]"
  ],
  footerNote: "Thank you for your business."
};
