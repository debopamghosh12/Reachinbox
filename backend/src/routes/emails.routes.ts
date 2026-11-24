import { Router } from "express";
import { listQuerySchema, normalizeLeads, scheduleSchema, searchQuerySchema } from "../schemas/email.schemas";
import { scheduleEmails } from "../services/schedule.service";
import { listEmails, searchEmails } from "../services/emails.service";
import { getUserId } from "../utils/requestUser";

// Routes stay thin: validate input -> call a service -> send JSON.
// .parse() throws ZodError on bad input, which the error handler turns into a 400.
export const emailsRouter = Router();

emailsRouter.post("/schedule", async (req, res) => {
  const input = scheduleSchema.parse(req.body);
  const { leads, duplicatesRemoved } = normalizeLeads(input.leads);
  const result = await scheduleEmails(getUserId(req), input, leads);
  res.status(201).json({ ...result, duplicatesRemoved });
});

emailsRouter.get("/", async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  res.json(await listEmails(getUserId(req), query));
});

emailsRouter.get("/search", async (req, res) => {
  const query = searchQuerySchema.parse(req.query);
  res.json(await searchEmails(getUserId(req), query));
});
