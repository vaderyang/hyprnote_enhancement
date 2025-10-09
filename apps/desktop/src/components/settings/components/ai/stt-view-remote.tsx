import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { commands as localSttCommands } from "@hypr/plugin-local-stt";
import { Form, FormControl, FormDescription, FormField, FormItem, FormMessage } from "@hypr/ui/components/ui/form";
import { Input } from "@hypr/ui/components/ui/input";
import { cn } from "@hypr/ui/lib/utils";

export function STTViewRemote({
  provider,
  setProviderToCustom,
}: {
  provider: "Local" | "Custom";
  setProviderToCustom: () => Promise<void>;
}) {
  const apiBaseQuery = useQuery({
    queryKey: ["custom-stt-base-url"],
    queryFn: () => localSttCommands.getCustomBaseUrl(),
  });

  const streamingUrlQuery = useQuery({
    queryKey: ["custom-stt-streaming-url"],
    queryFn: () => localSttCommands.getCustomStreamingUrl(),
  });

  const setApiBaseMutation = useMutation({
    mutationFn: (apiBase: string) => localSttCommands.setCustomBaseUrl(apiBase),
    onSuccess: () => apiBaseQuery.refetch(),
  });

  const setStreamingUrlMutation = useMutation({
    mutationFn: (streamingUrl: string) => localSttCommands.setCustomStreamingUrl(streamingUrl),
    onSuccess: () => streamingUrlQuery.refetch(),
  });

  const form = useForm({
    defaultValues: {
      http_url: "http://172.16.103.100:10001/recognition",
      ws_url: "ws://172.16.103.100:10095",
    },
  });

  useEffect(() => {
    form.reset({
      http_url: apiBaseQuery.data || "http://172.16.103.100:10001/recognition",
      ws_url: streamingUrlQuery.data || "ws://172.16.103.100:10095",
    });
  }, [apiBaseQuery.data, streamingUrlQuery.data, form]);

  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      if (name === "http_url") {
        setApiBaseMutation.mutate(values.http_url || "");
      }
      if (name === "ws_url") {
        setStreamingUrlMutation.mutate(values.ws_url || "");
      }
    });
    return () => subscription.unsubscribe();
  }, [form.watch, setApiBaseMutation, setStreamingUrlMutation]);

  const isSelected = provider === "Custom";

  return (
    <div className="space-y-6">
      <div className="max-w-2xl">
        {/* Custom STT Endpoint Box */}
        <div
          className={cn(
            "border rounded-lg transition-all duration-150 ease-in-out cursor-pointer",
            isSelected
              ? "border-blue-500 ring-2 ring-blue-500 bg-blue-50"
              : "border-neutral-200 bg-white hover:border-neutral-300",
          )}
          onClick={() => {
            setProviderToCustom();
          }}
        >
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    <Trans>FunASR Speech-to-Text endpoint</Trans>
                  </span>
                  {/* Preview badge (HIDDEN)
                  <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                    Preview
                  </span>
                  */}
                </div>
                <p className="text-xs font-normal text-neutral-500 mt-1">
                  <Trans>Connect to FunASR streaming and offline transcription services</Trans>
                </p>
              </div>
            </div>
          </div>

          <div className="px-4 pb-4 border-t">
            <div className="mt-4">
              <Form {...form}>
                <form className="space-y-6">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold">
                      <Trans>Streaming WebSocket URL</Trans>
                    </h3>
                    <FormField
                      control={form.control}
                      name="ws_url"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="ws://172.16.103.100:10095"
                              onClick={(e) => e.stopPropagation()}
                              onFocus={() => setProviderToCustom()}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold">
                      <Trans>Offline HTTP URL</Trans>
                    </h3>
                    <FormField
                      control={form.control}
                      name="http_url"
                      render={({ field }) => (
                        <FormItem>
                          <FormDescription className="text-xs">
                            <Trans>Endpoint used for offline transcription of uploaded recordings</Trans>
                          </FormDescription>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="http://172.16.103.100:10001/recognition"
                              className="placeholder:text-gray-400"
                              onClick={(e) => e.stopPropagation()}
                              onFocus={() => setProviderToCustom()}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                </form>
              </Form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
