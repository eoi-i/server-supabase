// Local configuration for this test project.
// Do not commit this file to a public repository or share the ZIP with credentials.
// Replace the values below with NEW credentials after rotating the exposed password.
module.exports = {
  adminPassword: "SET_A_NEW_UNIQUE_ADMIN_PASSWORD_HERE",
  databaseUrl: "postgresql://postgres:SET_NEW_DATABASE_PASSWORD_HERE@db.cxhapudqfbzojsnandfc.supabase.co:5432/postgres?sslmode=require",
  port: 8080,
  maxFileSizeMb: 20,
  supabaseUrl: "SET_YOUR_SUPABASE_PROJECT_URL_HERE",
  supabaseServiceRoleKey: "SET_YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE",
  supabaseBucket: "files"
};
