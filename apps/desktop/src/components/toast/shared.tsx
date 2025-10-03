import { QueryClient } from "@tanstack/react-query";
import { Channel } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

import { commands as localLlmCommands, SupportedModel as SupportedModelLLM } from "@hypr/plugin-local-llm";
import { commands as localSttCommands, type SupportedSttModel } from "@hypr/plugin-local-stt";
import { commands as windowsCommands } from "@hypr/plugin-windows";
import { Button } from "@hypr/ui/components/ui/button";
import { Progress } from "@hypr/ui/components/ui/progress";
import { sonnerToast, toast } from "@hypr/ui/components/ui/toast";

export const DownloadProgress = ({
  channel,
  onComplete,
  onRetry,
  onCancel,
}: {
  channel: Channel<number>;
  onComplete?: () => void;
  onRetry?: () => void;
  onCancel?: () => void;
}) => {
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    channel.onmessage = (v) => {
      if (v < 0) {
        setError(true);
        return;
      }

      if (v > progress) {
        setProgress(v);
      }

      if (v >= 100 && onComplete) {
        onComplete();
      }
    };
  }, [channel, onComplete, progress]);

  if (error) {
    return (
      <div className="w-full space-y-3">
        <div className="text-destructive font-medium">Download failed. Please try again.</div>
        <div className="flex gap-2">
          {onRetry && (
            <Button variant="default" size="sm" onClick={onRetry}>
              Retry
            </Button>
          )}
          {onCancel && (
            <Button variant="outline" size="sm" onClick={onCancel}>
              Close
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      <Progress value={progress} className="h-2" />
      <div className="text-xs text-right">{Math.round(progress)}%</div>
    </div>
  );
};

export function showSttModelDownloadToast(
  model: SupportedSttModel,
  onComplete?: () => void,
  queryClient?: QueryClient,
) {
  const sttChannel = new Channel();

  localSttCommands.downloadModel(model, sttChannel);

  // Invalidate React Query caches to prevent duplicate download toasts
  if (queryClient) {
    queryClient.invalidateQueries({ queryKey: ["stt-model-downloading"] });
    queryClient.invalidateQueries({ queryKey: ["check-model-downloaded"] });
  }

  const id = `stt-model-download-${model}`;

  const handleRetry = () => {
    sonnerToast.dismiss(id);
    showSttModelDownloadToast(model, onComplete, queryClient);
  };

  const handleCancel = () => {
    sonnerToast.dismiss(id);
  };

  toast(
    {
      id,
      title: "Speech-to-Text Model",
      content: (
        <div className="space-y-1">
          <div>Downloading the speech-to-text model...</div>
          <DownloadProgress
            channel={sttChannel}
            onComplete={() => {
              sonnerToast.dismiss(id);
              localSttCommands.setLocalModel(model).then(() => localSttCommands.startServer(null));
              if (onComplete) {
                onComplete();
              }
            }}
            onRetry={handleRetry}
            onCancel={handleCancel}
          />
        </div>
      ),
      dismissible: false,
    },
  );
}

export function showLlmModelDownloadToast(
  model?: SupportedModelLLM,
  onComplete?: () => void,
  queryClient?: QueryClient,
) {
  const llmChannel = new Channel();
  const modelToDownload = model || "HyprLLM";

  localLlmCommands.downloadModel(modelToDownload, llmChannel);

  // Invalidate React Query caches to prevent duplicate download toasts
  if (queryClient) {
    queryClient.invalidateQueries({ queryKey: ["llm-model-downloading"] });
    queryClient.invalidateQueries({ queryKey: ["check-model-downloaded"] });
  }

  const id = `llm-model-download-${modelToDownload}`;

  const handleRetry = () => {
    sonnerToast.dismiss(id);
    showLlmModelDownloadToast(model, onComplete, queryClient);
  };

  const handleCancel = () => {
    sonnerToast.dismiss(id);
  };

  toast(
    {
      id,
      title: "Large Language Model",
      content: (
        <div className="space-y-1">
          <div>Downloading the large language model...</div>
          <DownloadProgress
            channel={llmChannel}
            onComplete={() => {
              sonnerToast.dismiss(id);
              localLlmCommands.setCurrentModel(modelToDownload).then(() => localLlmCommands.startServer());
              if (onComplete) {
                onComplete();
              }
            }}
            onRetry={handleRetry}
            onCancel={handleCancel}
          />
        </div>
      ),
      dismissible: false,
    },
  );
}

export function enhanceFailedToast() {
  const id = "no-llm-connection";

  const handleClick = () => {
    windowsCommands.windowShow({ type: "settings" });
    sonnerToast.dismiss(id);
  };

  toast({
    id,
    title: "Failed to enhance meeting notes",
    content: (
      <div className="space-y-1">
        <div>Go to AI settings to check the status.</div>
        <Button variant="default" onClick={handleClick}>
          Open Settings
        </Button>
      </div>
    ),
    dismissible: true,
    duration: 3000,
  });
}

export function recordingStartFailedToast(errorMessage?: string) {
  const id = "recording-start-failed";

  const handleOpenSettings = () => {
    windowsCommands.windowShow({ type: "settings" });
    sonnerToast.dismiss(id);
  };

  const handleOpenSystemPrefs = () => {
    // Open macOS System Preferences > Privacy & Security > Microphone
    import("@tauri-apps/plugin-shell").then(({ open }) => {
      open("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone");
    }).catch(console.error);
    sonnerToast.dismiss(id);
  };

  const isPermissionError = errorMessage?.toLowerCase().includes("permission") ||
                           errorMessage?.toLowerCase().includes("access denied") ||
                           errorMessage?.toLowerCase().includes("not authorized");

  toast({
    id,
    title: "Failed to start recording",
    content: (
      <div className="space-y-2">
        <div className="text-sm">
          {errorMessage || "Recording could not be started. This may be due to microphone permissions."}
        </div>
        {isPermissionError && (
          <div className="text-xs text-muted-foreground">
            Please grant microphone access in System Preferences → Privacy & Security → Microphone
          </div>
        )}
        <div className="flex gap-2">
          {isPermissionError && (
            <Button variant="default" size="sm" onClick={handleOpenSystemPrefs}>
              Open System Preferences
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleOpenSettings}>
            App Settings
          </Button>
        </div>
      </div>
    ),
    dismissible: true,
    duration: 10000,
  });
}
