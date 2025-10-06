import { streamText } from "@hypr/utils/ai";
import { getClassifiableTemplates, type ClassifiableTemplate } from "./templateOptions";
import { RUNNING_LOG_ID } from "@/utils/template-service";
import { commands as connectorCommands } from "@hypr/plugin-connector";
import { modelProvider } from "@hypr/utils/ai";

/**
 * Input for template classification
 */
export interface ClassificationInput {
  transcriptText: string;
  calendarEvent?: {
    title?: string;
    description?: string;
    participants?: string[];
  };
  availableTemplates: ClassifiableTemplate[];
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Result from template classification
 */
export interface ClassificationResult {
  templateId: string;
  confidence: number;
  reason: string;
}

const DEFAULT_TIMEOUT_MS = 4500;
const TRANSCRIPT_PREVIEW_LENGTH = 2000; // characters
const TRANSCRIPT_TAIL_LENGTH = 500;

/**
 * Classify which template best fits the meeting content
 * Uses LLM with calendar metadata prioritization and strict JSON output
 */
export async function classifyTemplate(
  input: ClassificationInput
): Promise<ClassificationResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  
  try {
    // Prepare context with high priority on calendar data
    const context = buildClassificationContext(input);
    
    // Build prompts
    const systemPrompt = buildSystemPrompt(input.availableTemplates);
    const userPrompt = buildUserPrompt(context);
    
    // Set up timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
    
    const combinedSignal = input.signal 
      ? AbortSignal.any([input.signal, abortController.signal])
      : abortController.signal;
    
    // Get LLM connection
    const { type } = await connectorCommands.getLlmConnection();
    const provider = await modelProvider();
    const model = provider.languageModel("defaultModel");
    
    // Call LLM
    const { text } = await streamText({
      abortSignal: combinedSignal,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    
    clearTimeout(timeoutId);
    
    const responseText = await text;
    const result = parseClassificationResponse(responseText);
    
    console.log("📋 Template classification result:", result);
    
    return result;
  } catch (error) {
    console.error("Template classification failed:", error);
    
    // Fallback to Running Log
    return {
      templateId: RUNNING_LOG_ID,
      confidence: 0,
      reason: "Classification failed or timed out",
    };
  }
}

/**
 * Build classification context from input, prioritizing calendar metadata
 */
function buildClassificationContext(input: ClassificationInput): string {
  const parts: string[] = [];
  
  // Calendar event has highest priority
  if (input.calendarEvent) {
    if (input.calendarEvent.title) {
      parts.push(`Meeting Title: ${input.calendarEvent.title}`);
    }
    if (input.calendarEvent.description) {
      parts.push(`Meeting Description: ${input.calendarEvent.description}`);
    }
    if (input.calendarEvent.participants?.length) {
      parts.push(`Participants: ${input.calendarEvent.participants.join(", ")}`);
    }
  }
  
  // Transcript preview (truncated for privacy and performance)
  const transcript = input.transcriptText;
  const preview = transcript.substring(0, TRANSCRIPT_PREVIEW_LENGTH);
  const tail = transcript.length > TRANSCRIPT_PREVIEW_LENGTH + TRANSCRIPT_TAIL_LENGTH
    ? transcript.substring(transcript.length - TRANSCRIPT_TAIL_LENGTH)
    : "";
  
  parts.push(`\nTranscript Preview:\n${preview}`);
  if (tail) {
    parts.push(`\n[...]\n\nTranscript Ending:\n${tail}`);
  }
  
  return parts.join("\n\n");
}

/**
 * Build system prompt with available templates
 */
function buildSystemPrompt(templates: ClassifiableTemplate[]): string {
  const templateList = templates
    .map((t, i) => `${i + 1}. **${t.name}** (ID: ${t.id})\n   Description: ${t.description}\n   Keywords: ${t.keywords?.join(", ") || "general"}`)
    .join("\n\n");
  
  return `You are an expert meeting classifier. Your task is to analyze meeting content and metadata to select the most appropriate note-taking template.

Available Templates:
${templateList}

IMPORTANT INSTRUCTIONS:
1. Prioritize meeting title and description over transcript content when available
2. Consider participant count and roles if provided
3. Look for key indicators in the beginning and end of the transcript
4. Return your response as valid JSON with this exact structure:
   {
     "templateId": "the-template-id",
     "confidence": 0.85,
     "reason": "Brief explanation of why this template fits"
   }
5. Confidence should be between 0.0 and 1.0
6. If unsure or if the meeting is informal/unstructured, select "${RUNNING_LOG_ID}" with appropriate confidence

Return ONLY the JSON object, no other text or formatting.`;
}

/**
 * Build user prompt with meeting context
 */
function buildUserPrompt(context: string): string {
  return `Analyze this meeting and select the best template:

${context}

Return your classification as JSON.`;
}

/**
 * Parse LLM response into structured result
 */
function parseClassificationResponse(responseText: string): ClassificationResult {
  try {
    // Extract JSON from response (handle code blocks and markdown)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate structure
    if (!parsed.templateId || typeof parsed.confidence !== "number") {
      throw new Error("Invalid response structure");
    }
    
    return {
      templateId: parsed.templateId,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      reason: parsed.reason || "No reason provided",
    };
  } catch (error) {
    console.error("Failed to parse classification response:", error);
    
    // Fallback
    return {
      templateId: RUNNING_LOG_ID,
      confidence: 0,
      reason: "Failed to parse classification response",
    };
  }
}
