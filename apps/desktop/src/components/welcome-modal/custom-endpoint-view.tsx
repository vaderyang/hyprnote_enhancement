import { Trans } from "@lingui/react/macro";
import { useEffect, useState } from "react";

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@hypr/ui/components/ui/form";
import { Input } from "@hypr/ui/components/ui/input";
import PushableButton from "@hypr/ui/components/ui/pushable-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@hypr/ui/components/ui/select";
import { cn } from "@hypr/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import useDebouncedCallback from "beautiful-react-hooks/useDebouncedCallback";
import { UseFormReturn } from "react-hook-form";
import { ConfigureEndpointConfig } from "../settings/components/ai/shared";

// OpenAI, Gemini, OpenRouter model lists removed - only Netis provider supported

interface CustomEndpointViewProps {
  onContinue: () => void;
  configureCustomEndpoint: (config: ConfigureEndpointConfig) => void;
  customForm: UseFormReturn<{ api_base: string; api_key?: string; model: string }>;
}

export function CustomEndpointView({
  onContinue,
  configureCustomEndpoint,
  customForm,
}: CustomEndpointViewProps) {
  const [isConfigured, setIsConfigured] = useState(false);

  // Auto-configure when form is complete
  useEffect(() => {
    const values = customForm.watch();
    if (values.api_base && values.model) {
      setIsConfigured(true);
      configureCustomEndpoint({
        provider: "others",
        api_base: values.api_base,
        api_key: values.api_key,
        model: values.model,
      });
    } else {
      setIsConfigured(false);
    }
  }, [customForm.watch("api_base"), customForm.watch("api_key"), customForm.watch("model")]);

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
    const apiBase = customForm.watch("api_base");
    const apiKey = customForm.watch("api_key");

    updateDebouncedValues(apiBase || "", apiKey || "");
  }, [customForm.watch("api_base"), customForm.watch("api_key"), updateDebouncedValues]);

  const othersModels = useQuery({
    queryKey: ["others-direct-models", debouncedApiBase, debouncedApiKey?.slice(0, 8)],
    queryFn: async (): Promise<string[]> => {
      const apiBase = debouncedApiBase;
      const apiKey = debouncedApiKey;

      const url = new URL(apiBase);
      url.pathname += url.pathname.endsWith("/") ? "models" : "/models";

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
  });

  return (
    <div className="flex flex-col items-center">
      <h2 className="text-xl font-semibold mb-3">
        <Trans>Configure Netis AI Service</Trans>
      </h2>

      <div className="w-full max-w-lg mb-6">
        {/* Info banner */}
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-xs text-blue-700">
            <Trans>Netis AI service is pre-configured. Simply select a model to continue.</Trans>
          </p>
        </div>

        {/* Form Container */}
        <div className="bg-neutral-50 rounded-lg border border-neutral-200 p-4">
          <div className="flex items-center gap-2 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M23.9996 12.0235C17.5625 12.4117 12.4114 17.563 12.0232 24H11.9762C11.588 17.563 6.4369 12.4117 0 12.0235V11.9765C6.4369 11.5883 11.588 6.43719 11.9762 0H12.0232C12.4114 6.43719 17.5625 11.5883 23.9996 11.9765V12.0235Z">
              </path>
            </svg>
            <span className="font-medium text-sm">Netis</span>
          </div>
          
          <Form {...customForm}>
            <form className="space-y-4">
              <FormField
                control={customForm.control}
                name="model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      <Trans>Model</Trans>
                    </FormLabel>
                    <FormControl>
                      {othersModels.isLoading && !field.value ? (
                        <div className="py-1 text-sm text-neutral-500">
                          <Trans>Loading available models...</Trans>
                        </div>
                      ) : othersModels.data && othersModels.data.length > 0 ? (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Select model" />
                          </SelectTrigger>
                          <SelectContent>
                            {othersModels.data.map((model: string) => (
                              <SelectItem key={model} value={model}>
                                {model}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          {...field}
                          placeholder="gpt-4o"
                          className="h-8 text-sm"
                        />
                      )}
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </div>
      </div>

      <PushableButton
        type="button"
        onClick={onContinue}
        disabled={!isConfigured}
        className={cn("h-12", !isConfigured && "opacity-50 cursor-not-allowed")}
      >
        <Trans>Continue</Trans>
      </PushableButton>
    </div>
  );
}
