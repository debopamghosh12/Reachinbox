import { Router } from "express";
import {
  cleanBody,
  emailIdSchema,
  listQuerySchema,
  normalizeLeads,
  scheduleSchema,
  searchQuerySchema,
} from "../schemas/email.schemas";
import { scheduleEmails } from "../services/schedule.service";
import { getEmail, listEmails, searchEmails } from "../services/emails.service";
import { AppError } from "../utils/AppError";
import { getUserId } from "../utils/requestUser";

// Routes stay thin: validate input -> call a service -> send JSON.
// .parse() throws ZodError on bad input, which the error handler turns into a 400.
export const emailsRouter = Router();

emailsRouter.post("/schedule", async (req, res) => {
  const input = scheduleSchema.parse(req.body);
  const body = cleanBody(input.body);
  const { leads, duplicatesRemoved } = normalizeLeads(input.leads);
  const result = await scheduleEmails(getUserId(req), { ...input, body }, leads);
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

// Declared after /search, otherwise "search" would be read as an :id.
// "Not found" and "someone else's" get the same 404, so other users' ids
// can't be probed.
emailsRouter.get("/:id", async (req, res) => {
  const id = emailIdSchema.safeParse(req.params.id);
  const email = id.success ? await getEmail(getUserId(req), id.data) : null;
  if (!email) throw new AppError(404, "Email not found", "NotFound");
  res.json(email);
});
