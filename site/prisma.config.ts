import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// The Prisma CLI doesn't load env files itself. Same precedence as Next:
// .env.local wins over .env.
config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // Migrations can fail through PgBouncer, so the CLI uses Neon's direct host,
    // which is the pooled host without "-pooler". Not using prisma/config's env()
    // helper, which throws when the var is unset and would break `prisma generate`
    // during install.
    url: (process.env.DATABASE_URL ?? "").replace("-pooler.", "."),
  },
});
