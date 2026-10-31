import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const BASE = "/api/itsm";

export type FieldErrors = Record<string, string[]>;
export class ApiError extends Error {
  fields?: FieldErrors;
  status: number;
  constructor(message: string, status: number, fields?: FieldErrors) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export async function itsmFetch<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (typeof data?.detail === "string") throw new ApiError(data.detail, res.status);
    const fields = data && typeof data === "object" ? (data as FieldErrors) : undefined;
    const first = fields ? Object.entries(fields)[0] : undefined;
    const msg = first ? `${first[0] === "nonFieldErrors" ? "" : `${first[0]}: `}${[first[1]].flat().join(" ")}` : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, fields);
  }
  return data as T;
}

export function useItsmList<T>(path: string, params: Record<string, string | undefined> = {}, opts: { refetchInterval?: number; enabled?: boolean } = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== "") as [string, string][]).toString();
  return useQuery({
    queryKey: ["itsm", path, qs], retry: 0, refetchOnWindowFocus: false, ...opts,
    queryFn: () => itsmFetch<T[]>("GET", `${path}${qs ? `?${qs}` : ""}`),
  });
}

export function useItsmGet<T>(path: string | null, opts: { refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: ["itsm", path], enabled: !!path, retry: 0, refetchOnWindowFocus: false, ...opts,
    queryFn: () => itsmFetch<T>("GET", path!),
  });
}

/** Any write; invalidates all ITSM queries (data is small and cross-linked). */
export function useItsmMutation<TBody = unknown, TRes = unknown>(method: "POST" | "PATCH" | "DELETE", path: (vars: TBody) => string, body?: (vars: TBody) => unknown) {
  const qc = useQueryClient();
  return useMutation<TRes, ApiError, TBody>({
    mutationFn: (vars) => itsmFetch<TRes>(method, path(vars), body ? body(vars) : method === "DELETE" ? undefined : vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["itsm"] });
      qc.invalidateQueries({ queryKey: ["devices"] });
      qc.invalidateQueries({ queryKey: ["vms"] });
    },
  });
}
