import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

const createPrismaClient = () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing required env var DATABASE_URL");
  }

  const pool = new Pool({ connectionString });
  // Without a listener, an idle connection dropped by the server, as when Neon
  // scales to zero, would crash the process with an unhandled 'error' event.
  pool.on("error", (err) => console.error("Postgres pool error", err));
  // Closes idle connections before a Vercel Fluid instance suspends. No-op
  // outside Vercel.
  attachDatabasePool(pool);

  return new PrismaClient({
    adapter: new PrismaPg(pool),
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
};

// Kept on globalThis so dev hot reloads don't open a new pool on every edit.
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

// The only place the app creates a database client. Server code only.
export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
