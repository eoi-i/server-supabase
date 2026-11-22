// Local configuration for this test project.
// Values are read from Fly.io secrets / environment variables first, then fall back to the defaults below.
// Do not commit real credentials to this file.
module.exports = {
  adminPassword: process.env.ADMIN_PASSWORD || process.env.supervisor_Password || "SET_A_NEW_UNIQUE_ADMIN_PASSWORD_HERE",
  databaseUrl: process.env.DATABASE_URL || process.env.secret_database || "postgresql://postgres:SET_NEW_DATABASE_PASSWORD_HERE@db.cxhapudqfbzojsnandfc.supabase.co:5432/postgres?sslmode=require",
  port: Number(process.env.PORT || 8080)
};
