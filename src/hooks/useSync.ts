import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type SyncStatus } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";

export function useSyncStatus(poll: boolean) {
  const auth = useAuth();
  const active = poll && Boolean(auth?.connected);
  return useQuery({
    queryKey: ["sync-status"],
    queryFn: () => api<SyncStatus>("/sync/status"),
    refetchInterval: active ? 1500 : false,
    enabled: auth?.authenticated === true,
  });
}

export function useInvalidateSync() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["sync-status"] });
    void qc.invalidateQueries({ queryKey: ["stats"] });
    void qc.invalidateQueries({ queryKey: ["videos"] });
    void qc.invalidateQueries({ queryKey: ["playlists"] });
    void qc.invalidateQueries({ queryKey: ["subscriptions"] });
  };
}
