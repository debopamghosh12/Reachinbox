// Adds our own field to Express's Request type.
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export {};
