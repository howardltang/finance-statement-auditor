const API_BASE = "/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text();
    let code: string | undefined;
    let message = body || res.statusText;
    try {
      const parsed = JSON.parse(body) as { error?: string };
      if (parsed.error) {
        code = parsed.error;
        message = parsed.error;
      }
    } catch {
      // body wasn't JSON; fall back to raw text above
    }
    throw new ApiError(message, res.status, code);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  return handleResponse<T>(res);
}

/** For multipart uploads — no Content-Type header, so the browser sets the multipart boundary itself. */
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  return handleResponse<T>(res);
}
