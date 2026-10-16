import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";

export interface User {
  id: string;
  email: string;
}

interface Credentials {
  email: string;
  password: string;
}

export const meQueryKey = ["auth", "me"] as const;

export function useCurrentUser() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: () => apiFetch<{ user: User }>("/auth/me"),
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: Credentials) =>
      apiFetch<{ user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(credentials),
      }),
    onSuccess: (data) => queryClient.setQueryData(meQueryKey, data),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: Credentials) =>
      apiFetch<{ user: User }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(credentials),
      }),
    onSuccess: (data) => queryClient.setQueryData(meQueryKey, data),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>("/auth/logout", { method: "POST" }),
    onSuccess: () => queryClient.setQueryData(meQueryKey, null),
  });
}
