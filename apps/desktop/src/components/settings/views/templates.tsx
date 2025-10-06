// showProGateModal import removed - no longer needed
import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-shell";
import { ArrowLeftIcon, CheckIcon, InfoIcon, Loader2Icon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { useHypr } from "@/contexts";
// useLicense import removed - no longer needed
import { TemplateService, AUTO_TEMPLATE_ID, RUNNING_LOG_ID } from "@/utils/template-service";
import { type Template } from "@hypr/plugin-db";
import { commands as dbCommands } from "@hypr/plugin-db";
import { Button } from "@hypr/ui/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@hypr/ui/components/ui/tooltip";
import { cn } from "@hypr/ui/lib/utils";
import TemplateEditor from "./template";

type ViewState = "list" | "editor" | "new";

export default function TemplatesView() {
  const { userId } = useHypr();
  // getLicense removed - no longer needed for license checks

  const [viewState, setViewState] = useState<ViewState>("list");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [autoTemplate, setAutoTemplate] = useState<Template | null>(null);
  const [runningLogTemplate, setRunningLogTemplate] = useState<Template | null>(null);
  const [customTemplates, setCustomTemplates] = useState<Template[]>([]);
  const [builtinTemplates, setBuiltinTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  // Load config to get selected template
  const config = useQuery({
    queryKey: ["config", "general"],
    queryFn: async () => {
      const result = await dbCommands.getConfig();
      return result;
    },
  });

  // Mutation to save selected template
  const selectTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      if (!config.data) {
        console.error("Cannot save selected template because config is not loaded");
        return;
      }

      await dbCommands.setConfig({
        ...config.data,
        general: {
          ...config.data.general,
          selected_template_id: templateId,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config", "general"] });
    },
    onError: (error) => {
      console.error("Failed to save selected template:", error);
    },
  });

  // Load templates on mount
  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);

      // Use getAllTemplatesForSelection to get Auto option included
      const allTemplates = await TemplateService.getAllTemplatesForSelection();
      
      // Separate Auto, Running Log, and other templates
      const auto = allTemplates.find(t => t.id === AUTO_TEMPLATE_ID);
      const runningLog = allTemplates.find(t => t.id === RUNNING_LOG_ID);
      const others = allTemplates.filter(t => 
        t.id !== AUTO_TEMPLATE_ID && t.id !== RUNNING_LOG_ID
      );

      setAutoTemplate(auto || null);
      setRunningLogTemplate(runningLog || null);
      setCustomTemplates(others.filter(t => !t.tags?.includes("builtin")));
      setBuiltinTemplates(others.filter(t => t.tags?.includes("builtin")));

      console.log("loaded templates - auto:", auto, "runningLog:", runningLog, "custom:", others.filter(t => !t.tags?.includes("builtin")), "builtin:", others.filter(t => t.tags?.includes("builtin")));
    } catch (error) {
      console.error("Failed to load templates:", error);
    } finally {
      setLoading(false);
    }
  };

  // Separate template selection from editing
  const handleTemplateSelect = (template: Template) => {
    // Check if this template is already selected
    if (template.id === selectedTemplateId) {
      // Deselect by setting to null
      selectTemplateMutation.mutate("");
    } else {
      selectTemplateMutation.mutate(template.id);
    }
  };

  // Handle template editing/viewing - now supports both custom and built-in templates
  const handleTemplateEdit = (template: Template) => {
    setSelectedTemplate(template);
    setViewState("editor");
  };

  const handleNewTemplate = async () => {
    // License limit removed - all users can create unlimited custom templates

    const newTemplate: Template = {
      id: crypto.randomUUID(),
      user_id: userId,
      title: "",
      description: "",
      sections: [],
      tags: [],
      context_option: null,
    };
    setSelectedTemplate(newTemplate);
    setViewState("new");
  };

  const handleTemplateUpdate = async (updatedTemplate: Template) => {
    try {
      await TemplateService.saveTemplate(updatedTemplate);
      setSelectedTemplate(updatedTemplate);

      // Refresh the list
      await loadTemplates();
    } catch (error) {
      console.error("Failed to save template:", error);
    }
  };

  const handleBackToList = () => {
    setViewState("list");
    setSelectedTemplate(null);
  };

  const handleCloneTemplate = async (template: Template) => {
    try {
      const clonedTemplate: Template = {
        ...template,
        id: crypto.randomUUID(),
        title: `${template.title} Copy`,
        user_id: userId,
      };
      await dbCommands.upsertTemplate(clonedTemplate);
      await loadTemplates();
    } catch (error) {
      console.error("Failed to clone template:", error);
    }
  };

  const handleDeleteTemplate = async (template: Template) => {
    try {
      await TemplateService.deleteTemplate(template.id);
      await loadTemplates();
    } catch (error) {
      console.error("Failed to delete template:", error);
    }
  };

  // Get currently selected template ID from config
  const selectedTemplateId = config.data?.general.selected_template_id;

  // Default new users to Auto template
  useEffect(() => {
    if (config.data && !config.data.general.selected_template_id) {
      // New user - default to Auto
      selectTemplateMutation.mutate(AUTO_TEMPLATE_ID);
    }
  }, [config.data]);

  // Add handler for template deletion from editor
  const handleTemplateDeleteFromEditor = async () => {
    if (selectedTemplate) {
      try {
        await dbCommands.deleteTemplate(selectedTemplate.id);
        await loadTemplates();
        handleBackToList(); // Go back to list after deletion
      } catch (error) {
        console.error("Failed to delete template:", error);
      }
    }
  };

  const handleDuplicateTemplate = async (template: Template) => {
    try {
      // License limit removed - all users can duplicate templates

      const emojiMatch = template.title?.match(/^(\p{Emoji})\s*/u);
      const originalEmoji = emojiMatch ? emojiMatch[1] : "📄";
      const titleWithoutEmoji = template.title?.replace(/^(\p{Emoji})\s*/u, "") || "Untitled";
      const duplicatedTemplate: Template = {
        ...template,
        id: crypto.randomUUID(),
        user_id: userId,
        title: `${originalEmoji} ${titleWithoutEmoji} (Copy)`,
        tags: template.tags?.filter(tag => tag !== "builtin") || [],
      };

      await TemplateService.saveTemplate(duplicatedTemplate);

      await loadTemplates();

      setSelectedTemplate(duplicatedTemplate);
      setViewState("editor");
    } catch (error) {
      console.error("Failed to duplicate template:", error);
    }
  };

  // Check if current template is being viewed (read-only)
  const isViewingTemplate = selectedTemplate && !TemplateService.canEditTemplate(selectedTemplate.id);

  // Show template editor
  if (viewState === "editor" || viewState === "new") {
    return (
      <div>
        <div className="mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackToList}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            <Trans>{isViewingTemplate ? "Back" : "Save and close"}</Trans>
          </Button>
        </div>

        {selectedTemplate && (
          <TemplateEditor
            disabled={false}
            template={selectedTemplate}
            onTemplateUpdate={handleTemplateUpdate}
            onDelete={handleTemplateDeleteFromEditor}
            onDuplicate={handleDuplicateTemplate}
            isCreator={true}
          />
        )}
      </div>
    );
  }

  // Show loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-32 space-y-2">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          <Trans>Loading templates...</Trans>
        </p>
      </div>
    );
  }

  // Show template list
  return (
    <div>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                <Trans>Your Templates</Trans>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => open("https://docs.hyprnote.com/features/templates.mdx")}
                    className="h-8 w-8"
                  >
                    <InfoIcon className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <Trans>Learn more about templates</Trans>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="text-sm text-muted-foreground">
              <Trans>Select a template to enhance your meeting notes</Trans>
            </div>
          </div>

          <Button
            onClick={handleNewTemplate}
            variant="outline"
            size="sm"
          >
            <PlusIcon className="h-4 w-4" />
          </Button>
        </div>

        {/* Special Templates: Auto and Running Log */}
        <div className="space-y-2">
          {/* Auto Template */}
          {autoTemplate && (
            <TemplateCard
              key={autoTemplate.id}
              template={autoTemplate}
              onSelect={() => handleTemplateSelect(autoTemplate)}
              onEdit={() => {}} // Auto template is not editable
              isSelected={selectedTemplateId === AUTO_TEMPLATE_ID}
              isSpecial={true}
            />
          )}

          {/* Running Log Template */}
          {runningLogTemplate && (
            <TemplateCard
              key={runningLogTemplate.id}
              template={runningLogTemplate}
              onSelect={() => handleTemplateSelect(runningLogTemplate)}
              onEdit={() => handleTemplateEdit(runningLogTemplate)}
              isSelected={selectedTemplateId === RUNNING_LOG_ID}
              isSpecial={true}
            />
          )}
        </div>

        {/* Custom Templates */}
        {customTemplates.length > 0 && (
          <div className="mt-6">
            <div className="text-sm font-medium mb-2">
              <Trans>Your Custom Templates</Trans>
            </div>
            <div className="space-y-2">
              {customTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onSelect={() => handleTemplateSelect(template)}
                  onEdit={() => handleTemplateEdit(template)}
                  onClone={() => handleCloneTemplate(template)}
                  onDelete={() => handleDeleteTemplate(template)}
                  isSelected={template.id === selectedTemplateId}
                />
              ))}
            </div>
          </div>
        )}

        {/* Divider before built-in templates */}
        {builtinTemplates.length > 0 && customTemplates.length > 0 && (
          <div className="my-6 border-t border-neutral-200" />
        )}

        {/* Built-in Templates */}
        {builtinTemplates.length > 0 && (
          <div>
            <div className="text-sm font-medium mb-2">
              <Trans>Built-in Templates</Trans>
            </div>
            <div className="space-y-2">
              {builtinTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onSelect={() => handleTemplateSelect(template)}
                  onEdit={() => handleTemplateEdit(template)}
                  onClone={() => handleCloneTemplate(template)}
                  onDelete={() => handleDeleteTemplate(template)}
                  isSelected={template.id === selectedTemplateId}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Template Card Component with separate select/edit actions
interface TemplateCardProps {
  template: Template;
  onSelect: () => void;
  onEdit?: () => void;
  onClone?: () => void;
  onDelete?: () => void;
  emoji?: string;
  isSelected?: boolean;
  isSpecial?: boolean; // For Auto and Running Log templates
}

function TemplateCard({ template, onSelect, onEdit, onClone, onDelete, emoji, isSelected, isSpecial }: TemplateCardProps) {
  // Function to get emoji based on template title
  const getTemplateEmoji = (title: string) => {
    if (emoji) {
      return emoji;
    }

    const emojiMatch = title.match(/^(\p{Emoji})/u);
    if (emojiMatch) {
      return emojiMatch[1];
    }

    // Fall back to keyword matching if no emoji in title
    const lowercaseTitle = title.toLowerCase();
    if (lowercaseTitle.includes("meeting") || lowercaseTitle.includes("vc")) {
      return "💼";
    }
    if (lowercaseTitle.includes("interview") || lowercaseTitle.includes("job")) {
      return "👔";
    }
    if (lowercaseTitle.includes("all hands") || lowercaseTitle.includes("team")) {
      return "🤝";
    }
    if (lowercaseTitle.includes("standup") || lowercaseTitle.includes("daily")) {
      return "☀️";
    }
    if (lowercaseTitle.includes("project") || lowercaseTitle.includes("planning")) {
      return "📋";
    }
    if (lowercaseTitle.includes("review") || lowercaseTitle.includes("feedback")) {
      return "📝";
    }
    if (lowercaseTitle.includes("brainstorm") || lowercaseTitle.includes("ideas")) {
      return "💡";
    }
    return "📄"; // Default emoji
  };

  // Also update the title display to remove emoji since it's shown separately
  const getTitleWithoutEmoji = (title: string) => {
    return title.replace(/^(\p{Emoji})\s*/u, "");
  };

  const handleCardClick = () => {
    // Don't allow editing Auto template
    if (template.id === AUTO_TEMPLATE_ID) {
      return;
    }
    onEdit?.();
  };

  const handleSetDefaultClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
  };

  // Function to truncate text
  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength).trim() + "...";
  };

  return (
    <div
      className={cn(
        "p-4 rounded-lg shadow-sm transition-all duration-150 ease-in-out flex flex-col gap-2",
        template.id === AUTO_TEMPLATE_ID ? "cursor-default" : "cursor-pointer",
        isSelected
          ? "border border-blue-500 ring-2 ring-blue-500 bg-blue-50"
          : "border border-neutral-200 bg-white hover:border-neutral-300",
        isSpecial && "border-2",
      )}
      onClick={handleCardClick}
    >
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-3">
          <div className="text-base group-hover:scale-110 transition-transform duration-200">
            {getTemplateEmoji(template.title || "")}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="font-medium text-sm truncate">
                {truncateText(getTitleWithoutEmoji(template.title || "") || "Untitled Template", 30)}
              </div>
            </div>
            <p className="text-xs font-normal text-neutral-500 mt-1 truncate">
              {template.description
                ? truncateText(template.description, 50)
                : "Create and customize your meeting notes"}
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleSetDefaultClick}
          className="text-xs text-neutral-600 hover:text-neutral-900 px-2 py-1 h-auto flex items-center gap-1 min-w-[96px]"
        >
          {isSelected && <CheckIcon className="h-3 w-3" />}
          {isSelected ? "Default" : "Set as default"}
        </Button>
      </div>
      
      {/* Hint text for Auto template when selected */}
      {isSelected && template.id === AUTO_TEMPLATE_ID && (
        <div className="text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-md border border-blue-200 mt-2">
          <Trans>✨ Summaries will automatically use the best-fit template based on meeting content</Trans>
        </div>
      )}
    </div>
  );
}
