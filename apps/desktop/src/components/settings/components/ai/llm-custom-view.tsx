import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { useCallback, useEffect, useRef } from "react";

import { Input } from "@hypr/ui/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@hypr/ui/components/ui/select";
import { toast } from "@hypr/ui/components/ui/toast";
import { Button } from "@hypr/ui/components/ui/button";
import { cn } from "@hypr/ui/lib/utils";
import React, { useState } from "react";
import { SharedCustomEndpointProps } from "./shared";

// Model lists hidden for Netis deployment
// const openaiModels = [...];
// const geminiModels = [...];
// const openrouterModels = [...];

// Simple error boundary to prevent the whole Settings page from crashing
class SimpleErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error?: any; copied?: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, copied: false };
  }
  static getDerivedStateFromError(_error: unknown) {
    return { hasError: true };
  }
  componentDidCatch(error: any) {
    console.error("Error in Netis Global panel:", error);
    this.setState({ error });
  }
  
  copyErrorInfo = () => {
    try {
      const errMsg = (this.state.error && (this.state.error.message || String(this.state.error))) || "Unknown error";
      const debugInfo = `=== Netis Global Panel Error ===\n\nError: ${errMsg}\n\nStack: ${this.state.error?.stack || 'N/A'}`;
      
      navigator.clipboard.writeText(debugInfo).then(() => {
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2000);
      });
    } catch (err) {
      console.error("Failed to copy error info:", err);
    }
  };
  
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md space-y-2">
          <div className="flex justify-between items-start">
            <p className="text-xs text-red-700">Failed to render Netis Global settings. Please try again or use Netis provider.</p>
            <Button
              size="sm"
              variant="outline"
              onClick={this.copyErrorInfo}
              className="h-6 text-xs px-2 ml-2 flex-shrink-0"
            >
              {this.state.copied ? "✓" : "Copy"}
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children as any;
  }
}

// Error boundary wrapper for the component
function LLMCustomViewInner({
  customLLMEnabled,
  selectedLLMModel,
  setSelectedLLMModel,
  setCustomLLMEnabledMutation,
  configureCustomEndpoint,
  openAccordion,
  setOpenAccordion,
  customForm,
  isLocalEndpoint,
  hyprCloudEnabled,
  setHyprCloudEnabledMutation,
}: SharedCustomEndpointProps) {
  // Track user intent for accordion opening
  const [userOpenedAccordion, setUserOpenedAccordion] = useState<string | null>(null);

  // Clear accordion when HyprCloud is enabled
  useEffect(() => {
    if (hyprCloudEnabled?.data) {
      setOpenAccordion(null);
    }
  }, [hyprCloudEnabled?.data, setOpenAccordion]);


  const handleAccordionClick = (provider: "others" | "netis-global") => {
    try {
      // Track that user explicitly opened this accordion
      setUserOpenedAccordion(provider);
      
      // Reset last configured when switching providers to allow reconfiguration
      if (openAccordion !== provider) {
        lastConfiguredRef.current = null;
      }

      // If HyprCloud is active, clicking an accordion should disable it
      if (hyprCloudEnabled?.data) {
        // setHyprCloudEnabledMutation.mutate(false);
        setOpenAccordion(provider as any);
        if (selectedLLMModel === "hyprcloud") {
          setSelectedLLMModel("");
        }
        return;
      }

      // Always allow accordion opening/switching, don't auto-enable custom
      setOpenAccordion(provider === openAccordion ? null : provider as any);

      if (selectedLLMModel === "hyprcloud") {
        setSelectedLLMModel("");
      }
    } catch (error) {
      console.error("Error in handleAccordionClick:", error);
      // Don't re-throw - just log it
    }
  };

  // Reset user intent when switching away from custom tab or when HyprCloud is enabled
  useEffect(() => {
    if (hyprCloudEnabled?.data || !openAccordion) {
      setUserOpenedAccordion(null);
    }
  }, [hyprCloudEnabled?.data, openAccordion]);

  // Netis Global - Pre-configured provider with hidden credentials
  const netisGlobalApiBase = "https://llm.netis.io/v1";
  const netisGlobalApiKey = String(import.meta.env.VITE_NETIS_GLOBAL_API_KEY ?? "").trim();
  const hasNetisGlobal = netisGlobalApiKey.length > 0;
  const [netisGlobalSelectedModel, setNetisGlobalSelectedModel] = useState("qwen-3-coder-480b");
  
  // Track last configured values to prevent redundant configurations
  const lastConfiguredRef = useRef<{provider: string; api_base: string; model: string} | null>(null);

  // Session-level guard to prevent repeated failures
  const ngSessionDisabledRef = useRef<boolean>(
    typeof sessionStorage !== "undefined" && sessionStorage.getItem("netisGlobalDisabled") === "1"
  );

  // Default Netis configuration for fallback - use ref for stable reference
  const DEFAULT_NETIS_CONFIG = useRef({
    api_base: "http://v.netis.com.cn:13000/v1",
    api_key: "sk-418Nlx53Dvu87o-TWOgyJg",
    model: "gpt-4o",
  });

  const disableNetisGlobalForSession = useCallback(() => {
    if (ngSessionDisabledRef.current) return;
    ngSessionDisabledRef.current = true;
    try {
      sessionStorage.setItem("netisGlobalDisabled", "1");
    } catch {
      // sessionStorage might not be available
    }
  }, []);

  // Centralized fallback handler
  const handleNetisGlobalFailure = useCallback(
    (reason: string, err?: unknown) => {
      if (ngSessionDisabledRef.current) return;

      console.warn(`Netis Global failed (${reason}):`, err);
      disableNetisGlobalForSession();

      // User-friendly notification (wrapped in try-catch)
      try {
        toast({
          id: "netis-global-fallback",
          title: "Netis Global Unavailable",
          content: "Switching to Netis provider instead.",
          duration: 3000,
        });
      } catch (toastErr) {
        console.warn("Failed to show toast:", toastErr);
      }

      // Switch UI to Netis ("others") - wrapped in try-catch
      try {
        setOpenAccordion("others");
      } catch (accordionErr) {
        console.warn("Failed to set accordion:", accordionErr);
      }

      // Configure "others" with default Netis settings
      try {
        configureCustomEndpoint({
          provider: "others",
          ...DEFAULT_NETIS_CONFIG.current,
        });
      } catch (e) {
        console.warn("Failed to configure Netis defaults on others", e);
      }
    },
    [configureCustomEndpoint, disableNetisGlobalForSession, setOpenAccordion]
  );

  // Restore provider-specific config when accordion opens
  useEffect(() => {
    if (openAccordion === "netis-global" && customLLMEnabled.data) {
      // Restore Netis Global model from saved settings
      const values = customForm.getValues();
      if (values.api_base === netisGlobalApiBase && values.model) {
        setNetisGlobalSelectedModel(values.model);
      }
    } else if (openAccordion === "others" && customLLMEnabled.data) {
      // Restore Netis defaults when switching to Netis accordion
      const currentValues = customForm.getValues();
      
      // Only restore if current values are not Netis (i.e., coming from Netis Global)
      if (currentValues.api_base !== DEFAULT_NETIS_CONFIG.current.api_base) {
        customForm.setValue("api_base", DEFAULT_NETIS_CONFIG.current.api_base);
        customForm.setValue("api_key", DEFAULT_NETIS_CONFIG.current.api_key);
        // Don't restore model automatically - let user select from the correct list
      }
    }
  }, [openAccordion, customLLMEnabled.data, customForm, netisGlobalApiBase]);

  // Fetch Netis Global models with comprehensive error handling
  const netisGlobalModels = useQuery<string[], Error>({
    queryKey: ["netis-global-models"],
    queryFn: async (): Promise<string[]> => {
      try {
        const url = new URL(netisGlobalApiBase);
        url.pathname += url.pathname.endsWith("/") ? "models" : "/models";

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (netisGlobalApiKey && netisGlobalApiKey.trim().length > 0) {
          headers["Authorization"] = `Bearer ${netisGlobalApiKey}`;
        }

        const response = await tauriFetch(url.toString(), {
          method: "GET",
          headers,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.data || !Array.isArray(data.data)) {
          throw new Error("Invalid response format from Netis Global API");
        }

        const models = data.data
          .map((model: any) => model.id)
          .filter((id: string) => {
            const excludeKeywords = ["dall-e", "codex", "whisper"];
            return !excludeKeywords.some(keyword => id.includes(keyword));
          });

        return models;
      } catch (error) {
        // Gracefully handle and return empty list to avoid UI crashes
        handleNetisGlobalFailure("models-query", error);
        return [];
      }
    },
    enabled: hasNetisGlobal && !ngSessionDisabledRef.current && openAccordion === "netis-global",
    retry: false,
    refetchInterval: false,
    throwOnError: false,
  });

  // Auto-configure Netis Global when model is selected with error handling
  useEffect(() => {
    if (!hasNetisGlobal || ngSessionDisabledRef.current) return;
    if (
      openAccordion !== "netis-global"
      || !netisGlobalSelectedModel
      || !netisGlobalApiKey
      || userOpenedAccordion !== "netis-global"
    ) {
      return;
    }
    
    // Check if this configuration is already applied
    const configKey = `netis-global:${netisGlobalApiBase}:${netisGlobalSelectedModel}`;
    const lastKey = lastConfiguredRef.current ? `${lastConfiguredRef.current.provider}:${lastConfiguredRef.current.api_base}:${lastConfiguredRef.current.model}` : null;
    
    if (configKey === lastKey) {
      // Already configured, skip to prevent infinite loop
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        setHyprCloudEnabledMutation.mutate(false);
        configureCustomEndpoint({
          provider: "netis-global",
          api_base: netisGlobalApiBase,
          api_key: netisGlobalApiKey,
          model: netisGlobalSelectedModel,
        });
        // Track this configuration
        if (!cancelled) {
          lastConfiguredRef.current = {
            provider: "netis-global",
            api_base: netisGlobalApiBase,
            model: netisGlobalSelectedModel,
          };
        }
      } catch (err) {
        console.error("Error in Netis Global auto-config:", err);
        if (!cancelled) {
          // Don't call handleNetisGlobalFailure here - it causes UI conflicts
          // Just log the error and continue
        }
      }
    };
    
    // Wrap the run call to prevent any errors from bubbling up
    try {
      run();
    } catch (err) {
      console.error("Error starting Netis Global auto-config:", err);
    }

    return () => {
      cancelled = true;
    };
  }, [
    hasNetisGlobal,
    netisGlobalSelectedModel,
    openAccordion,
    userOpenedAccordion,
    configureCustomEndpoint,
    setHyprCloudEnabledMutation,
    netisGlobalApiBase,
    netisGlobalApiKey,
  ]);

  // Netis models - separate query with hardcoded Netis config
  const netisModels = useQuery<string[], Error>({
    queryKey: ["netis-models", DEFAULT_NETIS_CONFIG.current.api_base],
    queryFn: async (): Promise<string[]> => {
      try {
        const url = new URL(DEFAULT_NETIS_CONFIG.current.api_base);
        url.pathname += url.pathname.endsWith("/") ? "models" : "/models";

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (DEFAULT_NETIS_CONFIG.current.api_key && DEFAULT_NETIS_CONFIG.current.api_key.trim().length > 0) {
          headers["Authorization"] = `Bearer ${DEFAULT_NETIS_CONFIG.current.api_key}`;
        }

        const response = await tauriFetch(url.toString(), {
          method: "GET",
          headers,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.data || !Array.isArray(data.data)) {
          throw new Error("Invalid response format from Netis API");
        }

        const models = data.data
          .map((model: any) => model.id)
          .filter((id: string) => {
            const excludeKeywords = ["dall-e", "codex", "whisper"];
            return !excludeKeywords.some(keyword => id.includes(keyword));
          });

        return models;
      } catch (error) {
        console.error("Failed to fetch Netis models:", error);
        return [];
      }
    },
    enabled: openAccordion === "others",
    retry: 1,
    refetchInterval: false,
    throwOnError: false,
  });

  // Netis selected model state (separate from Netis Global)
  const [netisSelectedModel, setNetisSelectedModel] = useState(DEFAULT_NETIS_CONFIG.current.model);

  // Auto-configure Netis when model is selected
  useEffect(() => {
    if (
      openAccordion !== "others"
      || !netisSelectedModel
      || userOpenedAccordion !== "others"
    ) {
      return;
    }

    // Check if this configuration is already applied
    const configKey = `others:${DEFAULT_NETIS_CONFIG.current.api_base}:${netisSelectedModel}`;
    const lastKey = lastConfiguredRef.current ? `${lastConfiguredRef.current.provider}:${lastConfiguredRef.current.api_base}:${lastConfiguredRef.current.model}` : null;
    
    if (configKey === lastKey) {
      return;
    }

    try {
      setHyprCloudEnabledMutation.mutate(false);
      configureCustomEndpoint({
        provider: "others",
        api_base: DEFAULT_NETIS_CONFIG.current.api_base,
        api_key: DEFAULT_NETIS_CONFIG.current.api_key,
        model: netisSelectedModel,
      });
      lastConfiguredRef.current = {
        provider: "others",
        api_base: DEFAULT_NETIS_CONFIG.current.api_base,
        model: netisSelectedModel,
      };
    } catch (err) {
      console.error("Error in Netis auto-config:", err);
    }
  }, [
    netisSelectedModel,
    openAccordion,
    userOpenedAccordion,
    configureCustomEndpoint,
    setHyprCloudEnabledMutation,
  ]);


  return (
    <div className="space-y-6">
      <div className="max-w-2xl space-y-4">
        {/* OpenAI, Gemini, OpenRouter, Others Accordions - HIDDEN FOR NETIS DEPLOYMENT */}

        {/* Netis Accordion */}
        <div
          className={cn(
            "border rounded-lg transition-all duration-150 ease-in-out cursor-pointer",
            openAccordion === "others"
              ? "border-blue-500 ring-2 ring-blue-500 bg-blue-50"
              : "border-neutral-200 bg-white hover:border-neutral-300",
          )}
        >
          <div
            className="p-4"
            onClick={() => handleAccordionClick("others")}
          >
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M23.9996 12.0235C17.5625 12.4117 12.4114 17.563 12.0232 24H11.9762C11.588 17.563 6.4369 12.4117 0 12.0235V11.9765C6.4369 11.5883 11.588 6.43719 11.9762 0H12.0232C12.4114 6.43719 17.5625 11.5883 23.9996 11.9765V12.0235Z">
                    </path>
                  </svg>
                  <span className="font-medium">
                    <Trans>Netis</Trans>
                  </span>
                </div>
                <p className="text-xs font-normal text-neutral-500 mt-1">
                  <Trans>Access Netis AI Model Service</Trans>
                </p>
              </div>
              <div className="text-neutral-400">
                {openAccordion === "others" ? "−" : "+"}
              </div>
            </div>
          </div>

          {openAccordion === "others" && (
            <div className="px-4 pb-4 border-t">
              <div className="mt-4">
                <div className="space-y-4">
                  {/* Model selector */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      <Trans>Model</Trans>
                    </label>
                    {netisModels.isLoading
                      ? (
                        <div className="py-2 text-sm text-neutral-500">
                          <Trans>Loading available models...</Trans>
                        </div>
                      )
                      : netisModels.data && netisModels.data.length > 0
                      ? (
                        <Select
                          value={netisSelectedModel}
                          onValueChange={setNetisSelectedModel}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select model" />
                          </SelectTrigger>
                          <SelectContent>
                            {netisModels.data.map((model: string) => (
                              <SelectItem key={model} value={model}>
                                {model}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )
                      : (
                        <div className="space-y-2">
                          {netisModels.error && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                              <p className="text-xs text-red-700">
                                <Trans>Failed to load models. Please enter model name manually.</Trans>
                              </p>
                            </div>
                          )}
                          <Input
                            value={netisSelectedModel}
                            onChange={(e) => setNetisSelectedModel(e.target.value)}
                            placeholder="gpt-4o"
                          />
                        </div>
                      )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Netis Global Accordion - Pre-configured with hidden credentials */}
        {hasNetisGlobal && (
        <SimpleErrorBoundary>
        <div
          className={cn(
            "border rounded-lg transition-all duration-150 ease-in-out cursor-pointer",
            openAccordion === "netis-global"
              ? "border-indigo-500 ring-2 ring-indigo-500 bg-indigo-50"
              : "border-neutral-200 bg-white hover:border-neutral-300",
          )}
        >
          <div
            className="p-4"
            onClick={() => handleAccordionClick("netis-global")}
          >
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-indigo-600">
                    <path d="M12 2L2 7L12 12L22 7L12 2Z" />
                    <path d="M2 17L12 22L22 17" opacity="0.5" />
                    <path d="M2 12L12 17L22 12" opacity="0.7" />
                  </svg>
                  <span className="font-medium">
                    <Trans>Netis Global</Trans>
                  </span>
                </div>
                <p className="text-xs font-normal text-neutral-500 mt-1">
                  <Trans>Pre-configured Netis Global AI Service</Trans>
                </p>
              </div>
              <div className="text-neutral-400">
                {openAccordion === "netis-global" ? "−" : "+"}
              </div>
            </div>
          </div>

          {openAccordion === "netis-global" && (
            <div className="px-4 pb-4 border-t">
              <div className="mt-4">
                <div className="space-y-4">
                  {/* Information banner */}
                  <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-md">
                    <p className="text-xs text-indigo-700">
                      <Trans>This provider is pre-configured with Netis Global credentials. Simply select a model to get started.</Trans>
                    </p>
                  </div>

                  {/* Model selector */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      <Trans>Model</Trans>
                    </label>
                    {!netisGlobalApiKey
                      ? (
                        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                          <p className="text-xs text-yellow-700">
                            <Trans>API key not configured. Please set VITE_NETIS_GLOBAL_API_KEY environment variable.</Trans>
                          </p>
                        </div>
                      )
                      : netisGlobalModels.isLoading
                      ? (
                        <div className="py-2 text-sm text-neutral-500">
                          <Trans>Loading available models...</Trans>
                        </div>
                      )
                      : netisGlobalModels.data && netisGlobalModels.data.length > 0
                      ? (
                        <Select
                          value={netisGlobalSelectedModel}
                          onValueChange={setNetisGlobalSelectedModel}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select model" />
                          </SelectTrigger>
                          <SelectContent>
                            {netisGlobalModels.data.map((model: string) => (
                              <SelectItem key={model} value={model}>
                                {model}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )
                      : (
                        <div className="space-y-2">
                          {netisGlobalModels.error && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                              <p className="text-xs text-red-700">
                                <Trans>Failed to load models. Please enter model name manually.</Trans>
                              </p>
                            </div>
                          )}
                          <Input
                            value={netisGlobalSelectedModel}
                            onChange={(e) => setNetisGlobalSelectedModel(e.target.value)}
                            placeholder="qwen-3-coder-480b"
                          />
                        </div>
                      )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        </SimpleErrorBoundary>
        )}
      </div>
    </div>
  );
}

// Export wrapped version with error boundary
export function LLMCustomView(props: SharedCustomEndpointProps) {
  try {
    return <LLMCustomViewInner {...props} />;
  } catch (error) {
    console.error("Error in LLMCustomView:", error);
    return (
      <div className="p-4 border border-red-200 rounded-lg bg-red-50">
        <p className="text-sm text-red-700">
          Unable to load AI provider settings. Please refresh the page.
        </p>
      </div>
    );
  }
}
