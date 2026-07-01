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

  constructor(status: number, body: ApiErrorBody | string | null, responseText: string, statusText: string) {
    const message = getApiErrorMessageFromBody(body) || responseText || statusText || `Request failed with ${status}`;
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.responseText = responseText;
  }
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

export function getApiErrorMessage(error: unknown, fallback = "An unexpected error occurred"): string {
  if (error instanceof ApiError) {
    return error.message || fallback;
  }
  if (error instanceof Error) {
    return error.message || fallback;
  }
  return fallback;
}

async function throwIfResNotOk(res: Response) {
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

    throw new ApiError(res.status, body, text, res.statusText);
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

  await throwIfResNotOk(res);
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

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
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
