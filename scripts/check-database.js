import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jmbblxmpukiwurfxxqxw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_SXkIbIxSfhNZEprveEh2Jw_O2ebQSSR";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const tables = [
  "organizations",
  "profiles",
  "user_roles",
  "platform_admins",
  "org_invitations",
  "projects",
  "sites",
  "units_of_measure",
  "item_categories",
  "suppliers",
  "items",
  "cost_codes",
  "approval_rules",
  "requisitions",
  "requisition_items",
  "approval_steps",
  "approval_audit_log",
  "rfqs",
  "rfq_invitations",
  "quotes",
  "quote_items",
  "purchase_orders",
  "po_line_items",
  "delivery_receipts",
  "delivery_receipt_items",
  "invoices",
  "invoice_items",
  "payments",
  "billing_invoices",
  "notifications",
  "security_events",
  "ndpa_consent_logs",
  "secure_action_tokens"
];

async function check() {
  console.log("Checking Supabase tables status...\n");

  for (const t of tables) {
    const { data, error, count } = await supabase
      .from(t)
      .select("*", { count: "exact", head: true });

    if (error) {
      console.log(`❌ Table [${t}]: Error -> ${error.message} (${error.code})`);
    } else {
      console.log(`✅ Table [${t}]: EXISTS (Row count accessible: ${count ?? 0})`);
    }
  }
}

check().catch(console.error);
