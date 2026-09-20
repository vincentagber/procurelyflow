import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jmbblxmpukiwurfxxqxw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_SXkIbIxSfhNZEprveEh2Jw_O2ebQSSR";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const users = [
  { email: "admin@procurely.com", password: "Procurely@2026!", name: "Chidi Admin" },
  { email: "requester@procurely.com", password: "Procurely@2026!", name: "Tunde Requester" },
  { email: "approver@procurely.com", password: "Procurely@2026!", name: "Ngozi Approver" },
  { email: "procurement@procurely.com", password: "Procurely@2026!", name: "Emeka Procurement" },
  { email: "finance@procurely.com", password: "Procurely@2026!", name: "Amina Finance" },
  { email: "executive@procurely.com", password: "Procurely@2026!", name: "Folake Executive" },
];

async function main() {
  console.log("Creating/verifying demo accounts via Supabase Auth API...");

  for (const u of users) {
    const { data, error } = await supabase.auth.signUp({
      email: u.email,
      password: u.password,
      options: {
        data: { full_name: u.name },
      },
    });

    if (error) {
      if (
        error.message.includes("already registered") ||
        error.message.includes("User already exists")
      ) {
        console.log(`✓ ${u.email} already exists.`);
      } else {
        console.log(`⚠ ${u.email}: ${error.message}`);
      }
    } else {
      console.log(`✓ ${u.email} created (User ID: ${data.user?.id})`);
    }
  }

  console.log("Done!");
}

main().catch(console.error);
