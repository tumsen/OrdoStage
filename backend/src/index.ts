// Vibecode proxy — only load when using SQLite (Vibecode dev). Skip on Railway (PostgreSQL).
if (!(process.env.DATABASE_URL || "").startsWith("postgresql")) {
  try { await import("@vibecodeapp/proxy"); } catch { /* not in Vibecode */ }
}
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import "./env";
import { auth } from "./auth";
import { deductCredits } from "./credits";
import venuesRouter from "./routes/venues";
import peopleRouter from "./routes/people";
import eventsRouter from "./routes/events";
import documentsRouter from "./routes/documents";
import calendarsRouter from "./routes/calendars";
import orgRouter from "./routes/org";
import billingRouter from "./routes/billing";
import adminRouter from "./routes/admin";
import bookingsRouter from "./routes/bookings";
import scheduleRouter from "./routes/schedule";
import departmentsRouter from "./routes/departments";
import teamRouter from "./routes/team";
import toursRouter from "./routes/tours";
import publicRouter from "./routes/public";
import siteContentRouter from "./routes/site-content";
import { seedPacks } from "./seed-packs";
import { prisma } from "./prisma";

seedPacks().catch(console.error);
const SUPPORT_EMAILS = new Set(["tumsen@gmail.com"]);

const app = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  };
}>();

// CORS
app.use(
  "*",
  cors({
    origin: (origin) => origin,
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  })
);

// Logging
app.use("*", logger());

// Auth session middleware — runs on every request
app.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", session?.user ?? null);
  c.set("session", session?.session ?? null);
  await next();
});

// Block inactive org members from API (except auth, public, billing webhook, GET /api/me)
app.use("/api/*", async (c, next) => {
  const path = c.req.path;
  if (path.startsWith("/api/auth/") || path === "/api/billing/webhook" || path.startsWith("/api/public")) {
    await next();
    return;
  }
  if (path === "/api/me" && c.req.method === "GET") {
    await next();
    return;
  }
  const sessionUser = c.get("user");
  if (!sessionUser?.id) {
    await next();
    return;
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { isActive: true, isAdmin: true, email: true },
  });
  const isSupport =
    Boolean(dbUser?.isAdmin) || SUPPORT_EMAILS.has((dbUser?.email || "").toLowerCase());
  if (dbUser && !dbUser.isActive && !isSupport) {
    return c.json(
      {
        error: {
          message: "Your account has been deactivated. Contact your organization.",
          code: "INACTIVE",
        },
      },
      403
    );
  }
  await next();
});

// Auth handler
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Health check endpoint
app.get("/health", (c) => c.json({ status: "ok", version: "1.0.0" }));

// Public routes (no auth required — mount before credit check middleware)
app.route("/api/public", publicRouter);

// Billing routes (webhook must be before credit check middleware)
app.route("/api", billingRouter);

// Credit check middleware for all API routes (except auth and webhook)
app.use("/api/*", async (c, next) => {
  const path = c.req.path;

  // Skip auth routes and billing webhook
  if (path.startsWith("/api/auth/") || path === "/api/billing/webhook") {
    await next();
    return;
  }

  const user = c.get("user");
  if (!user?.organizationId) {
    await next();
    return;
  }

  const isSupportAdmin =
    Boolean((user as any).isAdmin) || SUPPORT_EMAILS.has((user.email || "").toLowerCase());
  if (isSupportAdmin) {
    await next();
    return;
  }

  const { balance, warning, blocked } = await deductCredits(user.organizationId);

  // Set info headers
  c.header("X-Credits-Remaining", String(balance));
  c.header("X-Credits-Warning", String(warning));

  // Block writes when out of credits
  const method = c.req.method;
  if (blocked && ["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    return c.json(
      {
        error: {
          message: "No credits remaining. Please top up to continue.",
          code: "NO_CREDITS",
        },
      },
      402
    );
  }

  await next();
});

// App routes
app.route("/api", orgRouter);
app.route("/api", venuesRouter);
app.route("/api", peopleRouter);
app.route("/api", eventsRouter);
app.route("/api", documentsRouter);
app.route("/api", calendarsRouter);
app.route("/api", adminRouter);
app.route("/api", bookingsRouter);
app.route("/api", scheduleRouter);
app.route("/api", departmentsRouter);
app.route("/api", teamRouter);
app.route("/api", toursRouter);
app.route("/api", siteContentRouter);

const port = Number(process.env.PORT) || 3000;

export default {
  port,
  hostname: "0.0.0.0",
  fetch: app.fetch,
};
