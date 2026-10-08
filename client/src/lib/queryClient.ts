import { API_ERROR_CODES, type ApiErrorCode } from "@shared/constants";
import type { Translations } from "@/lib/i18n";
import { QueryClient, QueryFunction } from "@tanstack/react-query";

export type ApiErrorBody = {
  error?: string;
  message?: string;
  [key: string]: unknown;
};

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody | string | null;
  responseText: string;
  /** The server's X-Request-Id: the id our logs and Vercel's carry for it. */
  requestId: string | null;

  constructor(status: number, body: ApiErrorBody | string | null, responseText: string, statusText: string, requestId: string | null = null) {
    const message = getApiErrorMessageFromBody(body) || responseText || statusText || `Request failed with ${status}`;
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.responseText = responseText;
    this.requestId = requestId;
  }
}

/** The request id of a failed API call, for a user to quote when reporting it. */
export function apiErrorRequestId(error: unknown): string | null {
  return error instanceof ApiError ? error.requestId : null;
}

function getApiErrorMessageFromBody(body: ApiErrorBody | string | null): string | null {
  if (!body) return null;
  if (typeof body === "string") return body;
  const message = body.error || body.message;
  return typeof message === "string" && message.trim() ? message : null;
}

export function getApiErrorBody(error: unknown): ApiErrorBody | null {
  if (error instanceof ApiError && error.body && typeof error.body === "object") {
    return error.body;
  }
  return null;
}

// What to tell the user about a failed request. A refusal the user can run
// into carries a `code` the API names in API_ERROR_CODES, shown translated;
// anything else gets the caller's own translated `fallback`. The `error` text
// in the body is never shown: it is English (once Norwegian only), so a parent
// using the site in Norwegian used to read "Invalid credentials".
export function apiErrorText(error: unknown, t: Translations, fallback: string): string {
  const code = getApiErrorBody(error)?.code;
  return typeof code === "string" && (API_ERROR_CODES as readonly string[]).includes(code)
    ? t.apiErrors[code as ApiErrorCode]
    : fallback;
}

// Both cookies live exactly 2 hours. When they expire, every council endpoint
// starts returning 401 while `GET /api/auth` returns `200 null` — so nothing
// told the client its session was gone. The header kept showing the user as
// signed in and each list query turned its 401 into `data = []`, rendering the
// EMPTY state: the inbox and the whole blog looked deleted. Clearing the auth
// key the first time any request 401s is what turns that into a re-login.
function notifyUnauthorized() {
  // The shared API client owns session recovery for its entire lifetime.
  // Mounting/unmounting pages or guards must not replace or clear a listener.
  if (queryClient.getQueryData(['/api/auth']) != null) {
    queryClient.setQueryData(['/api/auth'], null);
  }
}

async function throwIfResNotOk(res: Response, recoverSession = true) {
  if (res.status === 401 && recoverSession) {
    notifyUnauthorized();
  }

  if (!res.ok) {
    const text = await res.text();
    let body: ApiErrorBody | string | null = text || null;

    if (text) {
      try {
        body = JSON.parse(text) as ApiErrorBody;
      } catch {
        body = text;
      }
    }

    throw new ApiError(res.status, body, text, res.statusText, res.headers?.get?.("X-Request-Id") ?? null);
  }
}

// Get cookie value by name
export function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || null;
  }
  return null;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {};

  if (data) {
    headers["Content-Type"] = "application/json";
  }

  // Add CSRF token for state-changing requests
  if (method !== 'GET' && method !== 'HEAD') {
    const csrfToken = getCookie('csrf-token');
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }
  }

  // Handle development vs production URLs
  const finalUrl = import.meta.env.DEV && url.startsWith('/api/')
    ? `http://localhost:5000${url}`
    : url;

  const res = await fetch(finalUrl, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  const endpoint = new URL(url, 'http://localhost');
  const isLogin = endpoint.pathname === '/api/auth' && endpoint.searchParams.get('action') === 'login';
  await throwIfResNotOk(res, !isLogin);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const headers: Record<string, string> = {};

    // Handle development vs production URLs
    const baseUrl = queryKey[0] as string;
    const url = import.meta.env.DEV && baseUrl.startsWith('/api/')
      ? `http://localhost:5000${baseUrl}`
      : baseUrl;

    const res = await fetch(url, {
      headers,
      credentials: "include",
    });

    if (res.status === 401 && unauthorizedBehavior === "returnNull") {
      notifyUnauthorized();
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * After a signup or a cancellation: refresh the seat counts (`/api/events`)
 * and every registration list of that event (`…?eventId=7&food=1`,
 * `…&view=council`, `…&cancelled=1`), whatever view a key asks for.
 */
export function invalidateEventRegistrations(eventId: number) {
  const prefix = `/api/registrations?eventId=${eventId}`;
  void queryClient.invalidateQueries({ queryKey: ["/api/events"] });
  void queryClient.invalidateQueries({
    predicate: ({ queryKey }) =>
      typeof queryKey[0] === "string" && (queryKey[0] === prefix || queryKey[0].startsWith(`${prefix}&`)),
  });
}
