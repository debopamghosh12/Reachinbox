// The one place that talks HTTP. Every request:
//  - goes to VITE_API_URL
//  - sends the session cookie (credentials: "include"; the API allows our origin)
//  - turns a non-2xx answer into an ApiError carrying the backend's { error, message, details }
import type { ApiErrorBody } from "../../types/api";

export const API_URL: string = import.meta.env.VITE_API_URL;
if (!API_URL) throw new Error("VITE_API_URL is not set (copy frontend/.env.example to frontend/.env)");

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.status = status;
    this.code = body.error;
    this.details = body.details;
  }
}

export function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

type Query = Record<string, string | number | undefined>;

export async function api<T>(path: string, options: { method?: string; body?: unknown; query?: Query } = {}): Promise<T> {
  const url = new URL(path, API_URL);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? "GET",
      credentials: "include",
      headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    // fetch only rejects when there is no response at all (API down, network, CORS).
    throw new ApiError(0, { error: "NetworkError", message: "Can't reach the server. Is the API running?" });
  }

  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const body = isApiErrorBody(data) ? data : { error: "HttpError", message: `Request failed (HTTP ${res.status})` };
    throw new ApiError(res.status, body);
  }
  return data as T;
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === "object" && value !== null && "error" in value && "message" in value;
}
