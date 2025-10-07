import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import useDebouncedCallback from "beautiful-react-hooks/useDebouncedCallback";
import { useCallback, useEffect, useRef } from "react";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@hypr/ui/components/ui/form";
import { Input } from "@hypr/ui/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@hypr/ui/components/ui/select";
import { toast } from "@hypr/ui/components/ui/toast";
import { cn } from "@hypr/ui/lib/utils";
import { useState } from "react";
import { SharedCustomEndpointProps } from "./shared";

// Model lists hidden for Netis deployment
// const openaiModels = [...];
// const geminiModels = [...];
// const openrouterModels = [...];

export function LLMCustomView({
  customLLMEnabled,
  selectedLLMModel,
  setSelectedLLMModel,
  setCustomLLMEnabledMutation,
  configureCustomEndpoint,
  openAccordion,
  setOpenAccordion,
  openaiForm,
  geminiForm,
  openrouterForm,
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
  // Watch forms and submit when complete and valid
  useEffect(() => {
    const subscription = openaiForm.watch((values) => {
      // Only auto-configure if user opened this accordion OR custom is already enabled
      if (
        (userOpenedAccordion === "openai" || customLLMEnabled.data)
        && values.api_key && values.api_key.startsWith("sk-") && values.model
      ) {
        setHyprCloudEnabledMutation.mutate(false);
        configureCustomEndpoint({
          provider: "openai",
          api_base: "", // Will be auto-set
          api_key: values.api_key,
          model: values.model,
        });
      }
    });
    return () => subscription.unsubscribe();
  }, [openaiForm, configureCustomEndpoint, userOpenedAccordion, customLLMEnabled.data, setHyprCloudEnabledMutation]);

  useEffect(() => {
    const subscription = geminiForm.watch((values) => {
      // Only auto-configure if user opened this accordion OR custom is already enabled
      if (
        (userOpenedAccordion === "gemini" || customLLMEnabled.data)
        && values.api_key && values.api_key.startsWith("AIza") && values.model
      ) {
        setHyprCloudEnabledMutation.mutate(false);
        configureCustomEndpoint({
          provider: "gemini",
          api_base: "", // Will be auto-set
          api_key: values.api_key,
          model: values.model,
        });
      }
    });
    return () => subscription.unsubscribe();
  }, [geminiForm, configureCustomEndpoint, userOpenedAccordion, customLLMEnabled.data, setHyprCloudEnabledMutation]);

  useEffect(() => {
    const subscription = openrouterForm.watch((values) => {
      // Only auto-configure if user opened this accordion OR custom is already enabled
      if (
        (userOpenedAccordion === "openrouter" || customLLMEnabled.data)
        && values.api_key && values.api_key.startsWith("sk-") && values.model
      ) {
        setHyprCloudEnabledMutation.mutate(false);
        configureCustomEndpoint({
          provider: "openrouter",
          api_base: "", // Will be auto-set
          api_key: values.api_key,
          model: values.model,
        });
      }
    });
    return () => subscription.unsubscribe();
  }, [openrouterForm, configureCustomEndpoint, userOpenedAccordion, customLLMEnabled.data, setHyprCloudEnabledMutation]);

  useEffect(() => {
    const subscription = customForm.watch((values) => {
      // Only auto-configure if user opened this accordion OR custom is already enabled
      // Also exclude HyprCloud URL from being stored as 'others'
      if (
        (userOpenedAccordion === "others" || customLLMEnabled.data)
        && values.api_base && values.api_base !== "https://pro.hyprnote.com" && values.model
      ) {
        try {
          setHyprCloudEnabledMutation.mutate(false);
          console.log("we are now setting the 'others' endpoint");
          // Basic URL validation
          new URL(values.api_base);
          configureCustomEndpoint({
            provider: "others",
            api_base: values.api_base,
            api_key: values.api_key,
            model: values.model,
          });
        } catch {
          // invalid URL
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [customForm, configureCustomEndpoint, userOpenedAccordion, customLLMEnabled.data, setHyprCloudEnabledMutation]);

  const handleAccordionClick = (provider: "openai" | "gemini" | "openrouter" | "others" | "netis-global") => {
    // Track that user explicitly opened this accordion
    setUserOpenedAccordion(provider);

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

  // Session-level guard to prevent repeated failures
  const ngSessionDisabledRef = useRef<boolean>(
    typeof sessionStorage !== "undefined" && sessionStorage.getItem("netisGlobalDisabled") === "1"
  );

  // Default Netis configuration for fallback
  const DEFAULT_NETIS_CONFIG = {
    api_base: "http://v.netis.com.cn:13000/v1",
    api_key: "sk-418Nlx53Dvu87o-TWOgyJg",
    model: "gpt-4o",
  };

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

      // User-friendly notification
      toast({
        title: "Netis Global Unavailable",
        content: "Switching to Netis provider instead.",
        duration: 3000,
      });

      // Switch UI to Netis ("others")
      setOpenAccordion("others");

      // Configure "others" with default Netis settings
      try {
        configureCustomEndpoint({
          provider: "others",
          ...DEFAULT_NETIS_CONFIG,
        });
      } catch (e) {
        console.warn("Failed to configure Netis defaults on others", e);
      }
    },
    [configureCustomEndpoint, disableNetisGlobalForSession, setOpenAccordion]
  );

  // Restore Netis Global model from saved settings when accordion opens
  useEffect(() => {
    if (openAccordion === "netis-global" && customLLMEnabled.data) {
      // Check if we have saved "others" settings that match Netis Global endpoint
      const values = customForm.getValues();
      if (values.api_base === netisGlobalApiBase && values.model) {
        setNetisGlobalSelectedModel(values.model);
      }
    }
  }, [openAccordion, customLLMEnabled.data, customForm, netisGlobalApiBase]);

  // Fetch Netis Global models with comprehensive error handling
  const netisGlobalModels = useQuery({
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
        // Let onError handle it without throwing to ErrorBoundary
        throw error;
      }
    },
    enabled: hasNetisGlobal && !ngSessionDisabledRef.current && openAccordion === "netis-global",
    retry: false,
    refetchInterval: false,
    throwOnError: false,
    onError: (err: unknown) => {
      handleNetisGlobalFailure("models-query", err);
    },
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
      } catch (err) {
        if (!cancelled) {
          handleNetisGlobalFailure("auto-config", err);
        }
      }
    };
    run();

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
    handleNetisGlobalFailure,
  ]);

  // temporary fix for fetching models smoothly
  const [debouncedApiBase, setDebouncedApiBase] = useState("");
  const [debouncedApiKey, setDebouncedApiKey] = useState("");

  const updateDebouncedValues = useDebouncedCallback(
    (apiBase: string, apiKey: string) => {
      setDebouncedApiBase(apiBase);
      setDebouncedApiKey(apiKey);
    },
    [],
    2000,
  );

  // Watch for form changes
  useEffect(() => {
    const subscription = customForm.watch((values) => {
      updateDebouncedValues(values.api_base || "", values.api_key || "");
    });
    return () => subscription.unsubscribe();
  }, [customForm, updateDebouncedValues]);

  const othersModels = useQuery({
    queryKey: ["others-direct-models", debouncedApiBase, debouncedApiKey?.slice(0, 8)],
    queryFn: async (): Promise<string[]> => {
      const apiBase = debouncedApiBase;
      const apiKey = debouncedApiKey;

      const url = new URL(apiBase);
      url.pathname += url.pathname.endsWith("/") ? "models" : "/models";

      console.log("onquery");
      console.log(url.toString());

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (apiKey && apiKey.trim().length > 0) {
        headers["Authorization"] = `Bearer ${apiKey}`;
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
        throw new Error("Invalid response format");
      }

      const models = data.data
        .map((model: any) => model.id)
        .filter((id: string) => {
          const excludeKeywords = ["dall-e", "codex", "whisper"];
          return !excludeKeywords.some(keyword => id.includes(keyword));
        });

      return models;
    },
    enabled: (() => {
      const isLocal = debouncedApiBase?.includes("localhost") || debouncedApiBase?.includes("127.0.0.1");

      try {
        return Boolean(debouncedApiBase && new URL(debouncedApiBase) && (isLocal || debouncedApiKey));
      } catch {
        return false;
      }
    })(),
    retry: 1,
    refetchInterval: false,
    throwOnError: false,
  });

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
                <Form {...customForm}>
                  <form className="space-y-4">
                    {/* Base URL and API Key fields (HIDDEN)
                    <FormField
                      control={customForm.control}
                      name="api_base"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">
                            <Trans>API Base URL</Trans>
                          </FormLabel>
                          <FormDescription className="text-xs">
                            <Trans>Enter the base URL for your custom LLM endpoint</Trans>
                          </FormDescription>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="http://localhost:11434/v1"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={customForm.control}
                      name="api_key"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">
                            <Trans>API Key</Trans>
                            {customForm.watch("api_base") && isLocalEndpoint() && (
                              <span className="text-xs font-normal text-neutral-500 ml-2">
                                <Trans>(Optional for localhost)</Trans>
                              </span>
                            )}
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="password"
                              placeholder="sk-..."
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    */}

                    <FormField
                      control={customForm.control}
                      name="model"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">
                            <Trans>Model</Trans>
                          </FormLabel>
                          <FormControl>
                            {othersModels.isLoading && !field.value
                              ? (
                                <div className="py-1 text-sm text-neutral-500">
                                  <Trans>Loading available models...</Trans>
                                </div>
                              )
                              : othersModels.data && othersModels.data.length > 0
                              ? (
                                <Select
                                  value={field.value}
                                  onValueChange={field.onChange}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select model" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {othersModels.data.map((model) => (
                                      <SelectItem key={model} value={model}>
                                        {model}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )
                              : (
                                <Input
                                  {...field}
                                  placeholder="gpt-4o"
                                />
                              )}
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </form>
                </Form>
              </div>
            </div>
          )}
        </div>

        {/* Netis Global Accordion - Pre-configured with hidden credentials */}
        {hasNetisGlobal && (
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
                            {netisGlobalModels.data.map((model) => (
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
        )}
      </div>
    </div>
  );
}
