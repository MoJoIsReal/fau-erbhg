/**
 * API request utilities for making authenticated requests to the backend
 * Note: QueryClient is created in main.tsx, not here
 */

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
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
