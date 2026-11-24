import { PrismaClient } from "@prisma/client";

// Node caches modules, so every `import { prisma }` gets this same instance
// (one connection pool per process) - that is the whole "singleton".
export const prisma = new PrismaClient();
