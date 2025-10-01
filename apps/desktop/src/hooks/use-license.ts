import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

const LICENSE_QUERY_KEY = ["license"] as const;

// License system disabled - returning stub implementations
export function useLicense() {
  const queryClient = useQueryClient();

  const getLicense = useQuery({
    queryKey: LICENSE_QUERY_KEY,
    queryFn: async () => {
      // License checking disabled
      return { valid: true };
    },
    gcTime: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
    refetchIntervalInBackground: false,
  });

  const refreshLicense = useMutation({
    mutationFn: async () => {
      // License checking disabled
      return { valid: true };
    },
    onError: (e) => {
      console.error(e);
    },
    onSuccess: (license) => {
      queryClient.setQueryData(LICENSE_QUERY_KEY, license);
    },
  });

  const getLicenseStatus = useCallback(() => {
    // License checking disabled - always valid
    return { needsRefresh: false, isValid: true };
  }, []);

  const activateLicense = useMutation({
    mutationFn: async (_key: string) => {
      // License checking disabled
      return { valid: true };
    },
    onError: console.error,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LICENSE_QUERY_KEY });
    },
  });

  const deactivateLicense = useMutation({
    mutationFn: async () => {
      // License checking disabled
      return null;
    },
    onError: console.error,
    onSuccess: () => {
      queryClient.setQueryData(LICENSE_QUERY_KEY, null);
    },
  });

  return {
    getLicense,
    activateLicense,
    deactivateLicense,
    getLicenseStatus,
    refreshLicense,
  };
}
