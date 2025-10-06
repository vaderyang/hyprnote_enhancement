import type { Template } from "@hypr/plugin-db";
import { commands as dbCommands } from "@hypr/plugin-db";
import { DEFAULT_TEMPLATES, isDefaultTemplate } from "./default-templates";

export class TemplateService {
  /**
   * Map legacy template IDs to canonical IDs for backward compatibility
   */
  static getCanonicalTemplateId(templateId: string | null | undefined): string {
    // Map legacy/null selections to running-log
    if (!templateId || 
        templateId === "" || 
        templateId === "no-template" || 
        templateId === "default") {
      return RUNNING_LOG_ID;
    }
    return templateId;
  }

  /**
   * Check if a template ID is the Auto template
   */
  static isAutoTemplate(templateId: string | null | undefined): boolean {
    return templateId === AUTO_TEMPLATE_ID;
  }

  /**
   * Check if a template ID is the Running Log template
   */
  static isRunningLog(templateId: string | null | undefined): boolean {
    const canonical = this.getCanonicalTemplateId(templateId);
    return canonical === RUNNING_LOG_ID;
  }

  static async getAllTemplates(): Promise<Template[]> {
    try {
      const dbTemplates = await dbCommands.listTemplates();

      const filteredDbTemplates = dbTemplates.filter(t => !isDefaultTemplate(t.id));

      return [...DEFAULT_TEMPLATES, ...filteredDbTemplates];
    } catch (error) {
      console.error("Failed to load database templates:", error);

      return DEFAULT_TEMPLATES;
    }
  }

  /**
   * Get all templates including the virtual Auto option for selection UI
   */
  static async getAllTemplatesForSelection(): Promise<Template[]> {
    const templates = await this.getAllTemplates();
    
    // Add virtual Auto option at the beginning
    const autoOption: Template = {
      id: AUTO_TEMPLATE_ID,
      user_id: "system",
      title: "🤖 Auto",
      description: "Automatically select the best template based on your meeting content and calendar information",
      sections: [],
      tags: ["virtual", "auto", "builtin"],
      context_option: null,
    };
    
    return [autoOption, ...templates];
  }

  static async getTemplate(templateId: string): Promise<Template | null> {
    // Use canonical ID for lookup
    const canonicalId = this.getCanonicalTemplateId(templateId);
    
    const hardcodedTemplate = DEFAULT_TEMPLATES.find(t => t.id === canonicalId);
    if (hardcodedTemplate) {
      return hardcodedTemplate;
    }

    try {
      const dbTemplates = await dbCommands.listTemplates();
      return dbTemplates.find(t => t.id === templateId) || null;
    } catch (error) {
      console.error("Failed to load database template:", error);
      return null;
    }
  }

  static async getTemplatesByCategory(): Promise<{
    custom: Template[];
    builtin: Template[];
  }> {
    const allTemplates = await this.getAllTemplates();

    return {
      custom: allTemplates.filter(t => !t.tags?.includes("builtin")),
      builtin: allTemplates.filter(t => t.tags?.includes("builtin")),
    };
  }

  static canEditTemplate(templateId: string): boolean {
    return !isDefaultTemplate(templateId);
  }

  static async saveTemplate(template: Template): Promise<Template> {
    if (isDefaultTemplate(template.id)) {
      throw new Error("Cannot save built-in template");
    }

    return await dbCommands.upsertTemplate(template);
  }

  static async deleteTemplate(templateId: string): Promise<void> {
    if (isDefaultTemplate(templateId)) {
      throw new Error("Cannot delete built-in template");
    }

    await dbCommands.deleteTemplate(templateId);
  }
}
