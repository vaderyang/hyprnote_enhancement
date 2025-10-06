import { TemplateService } from "@/utils/template-service";
import type { Template } from "@hypr/plugin-db";

/**
 * Classifiable template representation for the LLM classifier
 */
export interface ClassifiableTemplate {
  id: string;
  name: string;
  description: string;
  keywords?: string[];
}

/**
 * Get all templates formatted for classification, excluding Auto template
 * Always includes Running Log as a fallback option
 */
export async function getClassifiableTemplates(): Promise<ClassifiableTemplate[]> {
  const allTemplates = await TemplateService.getAllTemplates();
  
  return allTemplates
    .filter(t => !TemplateService.isAutoTemplate(t.id)) // Exclude Auto template
    .map(t => ({
      id: t.id,
      name: t.title,
      description: t.description,
      keywords: extractKeywords(t.title, t.description, t.tags || []),
    }));
}

/**
 * Extract keywords from template metadata to help guide LLM classification
 */
function extractKeywords(title: string, description: string, tags: string[]): string[] {
  const keywords: Set<string> = new Set();
  
  // Add tags
  tags.forEach(tag => keywords.add(tag.toLowerCase()));
  
  // Extract key terms from title (remove emojis)
  const titleWords = title
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Remove emojis
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2); // Only words longer than 2 chars
  
  titleWords.forEach(word => keywords.add(word));
  
  // Extract important terms from description
  const importantTerms = [
    'meeting', 'interview', 'standup', 'review', 'discovery', 
    'pilot', 'patient', 'legal', 'therapy', 'brainstorm', 
    'coffee', 'one-on-one', '1-on-1', 'customer', 'b2b',
    'job', 'candidate', 'client', 'session', 'weekly', 'daily'
  ];
  
  const descLower = description.toLowerCase();
  importantTerms.forEach(term => {
    if (descLower.includes(term)) {
      keywords.add(term);
    }
  });
  
  return Array.from(keywords).slice(0, 10); // Limit to top 10 keywords
}
