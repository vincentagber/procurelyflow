import { Client } from "pg";

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();
  console.log("Connected to Postgres.");

  // 1. Ensure avatar_url column in profiles
  await client.query(`ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;`);
  console.log("✓ profiles.avatar_url exists.");

  // 2. Insert or update buckets
  const buckets = [
    { id: "procurement-files", name: "procurement-files", public: false, limit: 52428800 },
    { id: "requisition-attachments", name: "requisition-attachments", public: true, limit: 52428800 },
    { id: "delivery-photos", name: "delivery-photos", public: true, limit: 52428800 },
    { id: "invoices", name: "invoices", public: true, limit: 52428800 },
    { id: "avatars", name: "avatars", public: true, limit: 10485760 },
  ];

  for (const b of buckets) {
    await client.query(
      `INSERT INTO storage.buckets (id, name, public, file_size_limit)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
       SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit;`,
      [b.id, b.name, b.public, b.limit]
    );
    console.log(`✓ Bucket ready: ${b.id}`);
  }

  // 3. Apply Storage RLS Policies
  const policies = [
    `CREATE POLICY "Public Read Avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');`,
    `CREATE POLICY "Authenticated Insert Avatars" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');`,
    `CREATE POLICY "Authenticated Update Avatars" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars');`,
    `CREATE POLICY "Authenticated Insert Documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('procurement-files', 'requisition-attachments', 'delivery-photos', 'invoices'));`,
    `CREATE POLICY "Authenticated Select Documents" ON storage.objects FOR SELECT TO authenticated USING (bucket_id IN ('procurement-files', 'requisition-attachments', 'delivery-photos', 'invoices'));`,
    `CREATE POLICY "Public Read Attachments" ON storage.objects FOR SELECT USING (bucket_id IN ('requisition-attachments', 'delivery-photos', 'invoices'));`,
  ];

  for (const p of policies) {
    try {
      await client.query(p);
      console.log(`✓ Policy created: ${p.slice(14, 45)}`);
    } catch (e) {
      if (e.message.includes("already exists")) {
        console.log(`ℹ Policy already exists: ${p.slice(14, 45)}`);
      } else {
        console.warn(`⚠ Policy notice: ${e.message}`);
      }
    }
  }

  const res = await client.query(`SELECT id, name, public, file_size_limit, allowed_mime_types FROM storage.buckets;`);
  console.log("\nStorage Buckets Status:");
  console.table(res.rows);

  await client.end();
}

main().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
