import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { adminMiddleware } from "../admin-middleware";

const siteContentRouter = new Hono<{
  Variables: { user: typeof auth.$Infer.Session.user | null };
}>();

siteContentRouter.get("/site-content", async (c) => {
  const rows = await prisma.siteContent.findMany();
  const data = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return c.json({ data });
});

siteContentRouter.use("/admin/site-content/*", adminMiddleware);
siteContentRouter.use("/admin/site-content", adminMiddleware);

siteContentRouter.get("/admin/site-content", async (c) => {
  const rows = await prisma.siteContent.findMany({ orderBy: { key: "asc" } });
  const data = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return c.json({ data });
});

siteContentRouter.put("/admin/site-content", async (c) => {
  const body = await c.req.json();
  const schema = z.record(z.string(), z.string());
  const updates = schema.parse(body);

  await prisma.$transaction(
    Object.entries(updates).map(([key, value]) =>
      prisma.siteContent.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    )
  );

  const rows = await prisma.siteContent.findMany({ orderBy: { key: "asc" } });
  const data = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return c.json({ data });
});

export default siteContentRouter;
