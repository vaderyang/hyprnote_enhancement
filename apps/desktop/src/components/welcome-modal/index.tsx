import { useNavigate } from "@tanstack/react-router";
import { message } from "@tauri-apps/plugin-dialog";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";

import { commands } from "@/types";
import { commands as authCommands, events } from "@hypr/plugin-auth";
import { commands as localSttCommands } from "@hypr/plugin-local-stt";
import { commands as sfxCommands } from "@hypr/plugin-sfx";
import { Modal, ModalBody } from "@hypr/ui/components/ui/modal";
import { Particles } from "@hypr/ui/components/ui/particles";
import { ConfigureEndpointConfig } from "../settings/components/ai/shared";

import { useHypr } from "@/contexts";
import { zodResolver } from "@hookform/resolvers/zod";
import { commands as analyticsCommands } from "@hypr/plugin-analytics";
import { commands as connectorCommands } from "@hypr/plugin-connector";
import { commands as dbCommands } from "@hypr/plugin-db";
import { Trans } from "@lingui/react/macro";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AudioPermissionsView } from "./audio-permissions-view";
import { CustomEndpointView } from "./custom-endpoint-view";
import { DownloadProgressView } from "./download-progress-view";
import { LanguageSelectionView } from "./language-selection-view";
import { LLMSelectionView } from "./llm-selection-view";
import { WelcomeView } from "./welcome-view";

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Form schemas
const openaiSchema = z.object({
  api_key: z.string().min(1, "API key is required").startsWith("sk-", "OpenAI API key must start with 'sk-'"),
  model: z.string().min(1, "Model selection is required"),
});

const geminiSchema = z.object({
  api_key: z.string().min(1, "API key is required").startsWith("AIza", "Gemini API key must start with 'AIza'"),
  model: z.string().min(1, "Model selection is required"),
});

const openrouterSchema = z.object({
  api_key: z.string().min(1, "API key is required").startsWith("sk-", "OpenRouter API key must start with 'sk-'"),
  model: z.string().min(1, "Model selection is required"),
});

const customSchema = z.object({
  api_base: z.string().url("Must be a valid URL"),
  api_key: z.string().optional(),
  model: z.string().min(1, "Model is required"),
});

export function WelcomeModal({ isOpen, onClose }: WelcomeModalProps) {
  const navigate = useNavigate();
  const { userId } = useHypr();
  const [port, setPort] = useState<number | null>(null);
  const [currentStep, setCurrentStep] = useState<
    | "welcome"
    | "download-progress"
    | "audio-permissions"
    | "llm-selection"
    | "custom-endpoint"
    | "language-selection"
  >("welcome");
  const [wentThroughDownloads, setWentThroughDownloads] = useState(false);

  /*
  const selectSTTModel = useMutation({
    mutationFn: (model: WhisperModel) => localSttCommands.setLocalModel(model),
  });
  */

  const openaiForm = useForm<{ api_key: string; model: string }>({
    resolver: zodResolver(openaiSchema),
    mode: "onChange",
    defaultValues: {
      api_key: "",
      model: "",
    },
  });

  const geminiForm = useForm<{ api_key: string; model: string }>({
    resolver: zodResolver(geminiSchema),
    mode: "onChange",
    defaultValues: {
      api_key: "",
      model: "",
    },
  });

  const openrouterForm = useForm<{ api_key: string; model: string }>({
    resolver: zodResolver(openrouterSchema),
    mode: "onChange",
    defaultValues: {
      api_key: "",
      model: "",
    },
  });

  const customForm = useForm<{ api_base: string; api_key?: string; model: string }>({
    resolver: zodResolver(customSchema),
    mode: "onChange",
    defaultValues: {
      api_base: "",
      api_key: "",
      model: "",
    },
  });

  const configureCustomEndpoint = async (config: ConfigureEndpointConfig) => {
    const finalApiBase = config.provider === "openai"
      ? "https://api.openai.com/v1"
      : config.provider === "gemini"
      ? "https://generativelanguage.googleapis.com/v1beta/openai"
      : config.provider === "openrouter"
      ? "https://openrouter.ai/api/v1"
      : config.api_base;

    try {
      await connectorCommands.setCustomLlmEnabled(true);

      await connectorCommands.setProviderSource(config.provider);

      await connectorCommands.setCustomLlmModel(config.model);

      await connectorCommands.setCustomLlmConnection({
        api_base: finalApiBase,
        api_key: config.api_key || null,
      });

      if (config.provider === "openai" && config.api_key) {
        await connectorCommands.setOpenaiApiKey(config.api_key);
        await connectorCommands.setOpenaiModel(config.model);
      } else if (config.provider === "gemini" && config.api_key) {
        await connectorCommands.setGeminiApiKey(config.api_key);
        await connectorCommands.setGeminiModel(config.model);
      } else if (config.provider === "openrouter" && config.api_key) {
        await connectorCommands.setOpenrouterApiKey(config.api_key);
        await connectorCommands.setOpenrouterModel(config.model);
      } else if (config.provider === "others") {
        await connectorCommands.setOthersApiBase(config.api_base);
        if (config.api_key) {
          await connectorCommands.setOthersApiKey(config.api_key);
        }
        await connectorCommands.setOthersModel(config.model);
      }
    } catch (error) {
      console.error("Failed to configure custom endpoint:", error);
    }
  };

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let unlisten: (() => void) | undefined;

    if (isOpen) {
      authCommands.startOauthServer().then((port) => {
        setPort(port);

        events.authEvent
          .listen(({ payload }) => {
            if (payload === "success") {
              commands.setupDbForCloud().then(() => {
                onClose();
              });
              return;
            }

            if (payload.error) {
              message("Error occurred while authenticating!");
              return;
            }
          })
          .then((fn) => {
            unlisten = fn;
          });

        cleanup = () => {
          unlisten?.();
          authCommands.stopOauthServer(port);
        };
      });
    }

    return () => cleanup?.();
  }, [isOpen, onClose, navigate]);

  useEffect(() => {
    if (isOpen) {
      sfxCommands.play("BGM");
    } else {
      sfxCommands.stop("BGM");
    }
  }, [isOpen]);

  useEffect(() => {
    if (currentStep === "audio-permissions" && userId) {
      analyticsCommands.event({
        event: "onboarding_reached_audio",
        distinct_id: userId,
      });
    }
  }, [currentStep, userId]);

  useEffect(() => {
    if (currentStep === "download-progress" && userId) {
      analyticsCommands.event({
        event: "onboarding_reached_download_progress",
        distinct_id: userId,
      });
    }
  }, [currentStep, userId]);

  useEffect(() => {
    if (currentStep === "llm-selection" && userId) {
      analyticsCommands.event({
        event: "onboarding_reached_llm_selection",
        distinct_id: userId,
      });
    }
  }, [currentStep, userId]);

  useEffect(() => {
    if (currentStep === "language-selection" && userId) {
      analyticsCommands.event({
        event: "onboarding_reached_language_selection",
        distinct_id: userId,
      });
    }
  }, [currentStep, userId]);

  const handleStartLocal = async () => {
    // Retrieve API key from secure build-time configuration
    const apiKey = await commands.getNetisApiKey();

    // Configure Netis STT service (no local downloads needed)
    await localSttCommands.setProvider("Custom");
    await localSttCommands.setCustomBaseUrl("http://v.netis.com.cn:13000");
    await localSttCommands.setCustomModel("nova-2");

    // Configure Netis LLM service with correct API settings
    await connectorCommands.setCustomLlmEnabled(true);
    await connectorCommands.setProviderSource("others");
    await connectorCommands.setOthersApiBase("http://v.netis.com.cn:13000/v1");
    await connectorCommands.setOthersApiKey(apiKey);
    await connectorCommands.setOthersModel("gpt-4o");
    await connectorCommands.setCustomLlmModel("gpt-4o");
    await connectorCommands.setCustomLlmConnection({
      api_base: "http://v.netis.com.cn:13000/v1",
      api_key: apiKey,
    });

    setCurrentStep("audio-permissions");
  };

  /*
  const handleModelSelected = (model: WhisperModel) => {
    selectSTTModel.mutate(model);
    setSelectedSttModel(model);
    sessionStorage.setItem("model-download-toast-dismissed", "true");
    setCurrentStep("download-progress");
  };
  */

  const handleDownloadProgressContinue = () => {
    setWentThroughDownloads(true);
    setCurrentStep("language-selection");
  };

  const handleAudioPermissionsContinue = () => {
    // Skip downloads (using Netis services) - go directly to language selection
    setCurrentStep("language-selection");
  };

  const handleLLMSelectionContinue = async (selection: "hyprllm" | "byom") => {
    if (selection === "hyprllm") {
      sessionStorage.setItem("model-download-toast-dismissed", "true");
      setCurrentStep("download-progress");
    } else {
      setCurrentStep("custom-endpoint");
    }
  };

  const handleCustomEndpointContinue = async () => {
    sessionStorage.setItem("model-download-toast-dismissed", "true");
    setCurrentStep("download-progress");
  };

  const handleLanguageSelectionContinue = async (languages: string[]) => {
    try {
      const config = await dbCommands.getConfig();
      await dbCommands.setConfig({
        ...config,
        general: {
          ...config.general,
          spoken_languages: languages,
        },
      });
    } catch (error) {
      console.error("Failed to save language preferences:", error);
    }

    // Mark as completed (for Netis cloud services, no downloads needed)
    setWentThroughDownloads(true);

    commands.setOnboardingNeeded(false);
    onClose();
  };

  useEffect(() => {
    if (!isOpen && wentThroughDownloads) {
      // For Netis cloud services, we don't start local servers
      // The custom STT and LLM providers are already configured
      console.log("Onboarding completed - using Netis cloud services");
    }
  }, [isOpen, wentThroughDownloads]);

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="full"
      className="bg-background"
      preventClose
    >
      <ModalBody className="relative p-0 flex flex-col items-center justify-center overflow-hidden">
        {/* Back button for custom-endpoint */}
        {currentStep === "custom-endpoint" && (
          <button
            onClick={() => setCurrentStep("llm-selection")}
            className="absolute top-6 left-6 z-20 flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-800 transition-colors bg-white/80 backdrop-blur-sm rounded-lg px-3 py-2 hover:bg-white/90"
          >
            <ArrowLeft className="w-4 h-4" />
            <Trans>Back</Trans>
          </button>
        )}

        <div className="z-10">
          {currentStep === "welcome" && (
            <WelcomeView
              portReady={port !== null}
              onGetStarted={handleStartLocal}
            />
          )}
          {currentStep === "download-progress" && (
            <DownloadProgressView
              selectedSttModel={"QuantizedSmall"}
              llmSelection={"hyprllm"}
              onContinue={handleDownloadProgressContinue}
            />
          )}
          {currentStep === "audio-permissions" && (
            <AudioPermissionsView
              onContinue={handleAudioPermissionsContinue}
            />
          )}
          {currentStep === "llm-selection" && (
            <LLMSelectionView
              onContinue={handleLLMSelectionContinue}
            />
          )}
          {currentStep === "custom-endpoint" && (
            <CustomEndpointView
              onContinue={handleCustomEndpointContinue}
              configureCustomEndpoint={configureCustomEndpoint}
              openaiForm={openaiForm}
              geminiForm={geminiForm}
              openrouterForm={openrouterForm}
              customForm={customForm}
            />
          )}
          {currentStep === "language-selection" && (
            <LanguageSelectionView
              onContinue={handleLanguageSelectionContinue}
            />
          )}
        </div>

        <Particles
          className="absolute inset-0 z-0"
          quantity={150}
          ease={80}
          color={"#000000"}
          refresh
        />
      </ModalBody>
    </Modal>
  );
}
