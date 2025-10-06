# Feature Implementation Plan: Intelligent Auto Template Selection

**Branch:** feature/auto-template-selection  
**Base:** release-0.5  
**Target:** release-0.5 (PR)  
**Created:** 2025-10-06  
**Status:** 🚧 In Development

---

## 📋 Overview

This feature introduces **intelligent automatic template selection** for summarizing meeting transcriptions. Instead of requiring users to manually select a template before each meeting, the system will automatically analyze the transcription content and meeting metadata (calendar info) to select the most appropriate template.

### Key Capabilities

1. **Auto Template Selection**: Uses LLM to classify meeting type and select best-fit template
2. **Running Log Template**: New first-class template for unstructured chronological notes (replaces "No Template" concept)
3. **Three Trigger Points**: Works on recording stop, audio upload completion, and text paste
4. **User Override**: Users can always manually change template selection before or after enhancement
5. **Graceful Fallback**: Falls back to Running Log on classification failure or timeout

---

## 🎯 Requirements Summary

### User Experience

- **Default Mode**: New users get "Auto" template selection by default
- **Transparent Process**: Shows "Auto analyzing the transcription..." indicator during classification
- **Silent Selection**: Does not tell user which template was picked (just applies it)
- **Manual Override**: User can change template at any time through Settings

### Technical Requirements

- **Intelligence**: LLM-based classification using transcription content + calendar metadata
- **Performance**: Classification completes under 5 seconds (p95)
- **Privacy**: Minimize PII exposure, prefer calendar metadata over full transcript
- **Compatibility**: Preserve existing user template selections
- **Robustness**: Timeout and fallback handling

---

## 🏗️ Architecture Overview

### New Components

1. **Running Log Template** (`running-log`)
   - Built-in template for chronological notes without structure
   - Replaces "No Template" concept with first-class status

2. **Auto Template Option** (`auto-select`)
   - Virtual template selection (not a content template)
   - Triggers intelligent classification workflow

3. **Template Classifier** (`src/ai/templateClassifier.ts`)
   - LLM-based classification service
   - Input: transcript snippet + calendar metadata + available templates
   - Output: `{ templateId, confidence, reason }`

4. **Template Options Materializer** (`src/ai/templateOptions.ts`)
   - Prepares template options for classifier
   - Formats as structured list with descriptions

### Integration Points

- **Ongoing Session Store**: `autoEnhanceTemplate` state (already exists)
- **Settings UI**: Template selector dropdown
- **Enhancement Pipeline**: `useAutoEnhance` hook
- **Three Triggers**:
  1. Recording stop (status: `running_active` → `inactive`)
  2. Audio upload transcription complete
  3. Text paste and transcribe complete

---

## 📂 Current System Audit

### Existing Template System

**File Paths:**
```
apps/desktop/src/utils/
  ├── default-templates.ts      # Built-in templates catalog
  └── template-service.ts       # Template CRUD operations

apps/desktop/src/components/
  ├── settings/views/templates.tsx           # Template selection UI
  ├── editor-area/index.tsx                  # Enhancement pipeline
  └── editor-area/utils/summary-prepare.ts   # Context preparation

packages/utils/src/stores/
  └── ongoing-session.ts        # Session state + autoEnhanceTemplate

crates/template/
  └── assets/enhance.*.jinja    # LLM prompt templates
```

**Template Data Structure:**
```typescript
interface Template {
  id: string;
  user_id: string;
  title: string;
  description: string;
  sections: TemplateSection[];
  tags: string[];
  context_option: string | null;
}
```

**Current Template Selection Flow:**
1. User selects template in Settings → Templates
2. Selection saved to `config.general.selected_template_id`
3. During enhancement, if `templateId` not explicitly passed, uses `selected_template_id`
4. Empty/null `selected_template_id` means "No Template" (unstructured)

**Auto-Enhance Mechanism:**
- `autoEnhanceTemplate` in ongoing session store
- Set before recording stops/upload completes
- Consumed once by `useAutoEnhance` hook
- Cleared after use (one-time mechanism)

### Transcription Lifecycle Handlers

**Recording Stop:**
```typescript
// packages/utils/src/stores/ongoing-session.ts
// Status transition: running_active → inactive
// Triggers: useAutoEnhance hook in editor-area/index.tsx
```

**Audio Upload Complete:**
```typescript
// apps/desktop/src/components/right-panel/views/transcript-view.tsx
// handleUploadAudio function
// After transcription: manually triggers status transition
```

**Text Paste:**
```typescript
// apps/desktop/src/components/right-panel/views/transcript-view.tsx
// handlePasteTranscription function
// After converting to words: manually triggers status transition
```

---

## 🛠️ Implementation Steps

### Phase 1: Foundation (Templates & Compatibility)

#### Step 1: Add Running Log Template
**File:** `apps/desktop/src/utils/default-templates.ts`

```typescript
{
  id: "default-running-log",
  user_id: "system",
  title: "📝 Running Log",
  description: "Plain chronological notes without structured sections. Perfect for free-form meetings.",
  sections: [],  // No sections = chronological format
  tags: ["general", "chronological", "unstructured", "builtin"],
  context_option: null,
}
```

**Add at the beginning of DEFAULT_TEMPLATES array** (first position)

#### Step 2: Legacy ID Mapping
**File:** `apps/desktop/src/utils/template-service.ts`

```typescript
export class TemplateService {
  static getCanonicalTemplateId(templateId: string | null | undefined): string {
    // Map legacy/null selections to running-log
    if (!templateId || 
        templateId === "" || 
        templateId === "no-template" || 
        templateId === "default") {
      return "default-running-log";
    }
    return templateId;
  }
  
  // Update getTemplate to use canonical ID
  static async getTemplate(templateId: string): Promise<Template | null> {
    const canonicalId = this.getCanonicalTemplateId(templateId);
    // ... rest of logic
  }
}
```

#### Step 3: Auto Template Virtual Option
**File:** `apps/desktop/src/utils/template-service.ts`

```typescript
export const AUTO_TEMPLATE_ID = "auto-select";
export const RUNNING_LOG_ID = "default-running-log";

export class TemplateService {
  static isAutoTemplate(templateId: string | null | undefined): boolean {
    return templateId === AUTO_TEMPLATE_ID;
  }
  
  static isRunningLog(templateId: string | null | undefined): boolean {
    const canonical = this.getCanonicalTemplateId(templateId);
    return canonical === RUNNING_LOG_ID;
  }
  
  static async getAllTemplatesForSelection(): Promise<Template[]> {
    const templates = await this.getAllTemplates();
    
    // Add virtual Auto option at the beginning
    const autoOption: Template = {
      id: AUTO_TEMPLATE_ID,
      user_id: "system",
      title: "🤖 Auto",
      description: "Automatically select the best template based on your meeting content",
      sections: [],
      tags: ["virtual", "auto", "builtin"],
      context_option: null,
    };
    
    return [autoOption, ...templates];
  }
}
```

**Commit:** `feat(templates): add Running Log template and Auto selection option`

---

### Phase 2: Settings UI Integration

#### Step 4: Update Template Selection UI
**File:** `apps/desktop/src/components/settings/views/templates.tsx`

**Changes:**
1. Use `getAllTemplatesForSelection()` instead of `getAllTemplates()`
2. Add visual distinction for Auto option (different icon, hint text)
3. Update default selection logic to prefer `auto-select` for new users

```typescript
// In loadTemplates function
const allTemplates = await TemplateService.getAllTemplatesForSelection();

// Separate virtual from real templates
const autoTemplate = allTemplates.find(t => t.id === AUTO_TEMPLATE_ID);
const runningLog = allTemplates.find(t => t.id === RUNNING_LOG_ID);
const regularTemplates = allTemplates.filter(t => 
  t.id !== AUTO_TEMPLATE_ID && 
  t.id !== RUNNING_LOG_ID
);
```

#### Step 5: Default Selection for New Users
**File:** `apps/desktop/src/components/settings/views/templates.tsx`

```typescript
useEffect(() => {
  if (config.data && !config.data.general.selected_template_id) {
    // New user - default to Auto
    selectTemplateMutation.mutate(AUTO_TEMPLATE_ID);
  }
}, [config.data]);
```

**Commit:** `feat(ui): update template selector with Auto and Running Log options`

---

### Phase 3: Classification Engine

#### Step 6: Template Options Materializer
**File:** `apps/desktop/src/ai/templateOptions.ts`

```typescript
import { TemplateService } from "@/utils/template-service";
import type { Template } from "@hypr/plugin-db";

export interface ClassifiableTemplate {
  id: string;
  name: string;
  description: string;
  keywords?: string[];
}

export async function getClassifiableTemplates(): Promise<ClassifiableTemplate[]> {
  const allTemplates = await TemplateService.getAllTemplates();
  
  return allTemplates
    .filter(t => !TemplateService.isAutoTemplate(t.id))
    .map(t => ({
      id: t.id,
      name: t.title,
      description: t.description,
      keywords: extractKeywords(t.title, t.description, t.tags),
    }));
}

function extractKeywords(title: string, description: string, tags: string[]): string[] {
  // Extract relevant keywords from title, description, tags
  const allText = `${title} ${description} ${tags.join(" ")}`.toLowerCase();
  
  const keywords = [
    ...tags,
    // Add more heuristics as needed
  ];
  
  return [...new Set(keywords)];
}
```

#### Step 7: LLM Template Classifier
**File:** `apps/desktop/src/ai/templateClassifier.ts`

```typescript
import { streamText } from "ai";
import { getClassifiableTemplates, type ClassifiableTemplate } from "./templateOptions";
import { RUNNING_LOG_ID } from "@/utils/template-service";
import { commands as connectorCommands } from "@hypr/plugin-connector";
import { modelProvider } from "@/utils";

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

export interface ClassificationResult {
  templateId: string;
  confidence: number;
  reason: string;
}

const DEFAULT_TIMEOUT_MS = 4500;
const TRANSCRIPT_PREVIEW_LENGTH = 2000; // characters
const TRANSCRIPT_TAIL_LENGTH = 500;

export async function classifyTemplate(
  input: ClassificationInput
): Promise<ClassificationResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  
  try {
    // Prepare context with high priority on calendar data
    const context = buildClassificationContext(input);
    
    // Build prompt
    const systemPrompt = buildSystemPrompt(input.availableTemplates);
    const userPrompt = buildUserPrompt(context);
    
    // Call LLM with timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
    
    const combinedSignal = input.signal 
      ? AbortSignal.any([input.signal, abortController.signal])
      : abortController.signal;
    
    const { type, connection } = await connectorCommands.getLlmConnection();
    const provider = await modelProvider();
    const model = provider.languageModel("defaultModel");
    
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
  
  // Transcript preview
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

function buildSystemPrompt(templates: ClassifiableTemplate[]): string {
  const templateList = templates
    .map((t, i) => `${i + 1}. **${t.name}** (ID: ${t.id})\n   ${t.description}`)
    .join("\n\n");
  
  return `You are an expert meeting classifier. Your task is to analyze meeting content and metadata to select the most appropriate note-taking template.

Available Templates:
${templateList}

IMPORTANT INSTRUCTIONS:
1. Prioritize meeting title and description over transcript content
2. Consider participant count and roles
3. Look for key indicators in the first and last parts of the transcript
4. Return your response as valid JSON with this exact structure:
   {
     "templateId": "the-template-id",
     "confidence": 0.85,
     "reason": "Brief explanation of why this template fits"
   }
5. Confidence should be between 0.0 and 1.0
6. If unsure, select "${RUNNING_LOG_ID}" with lower confidence

Return ONLY the JSON object, no other text.`;
}

function buildUserPrompt(context: string): string {
  return `Analyze this meeting and select the best template:

${context}

Return your classification as JSON.`;
}

function parseClassificationResponse(responseText: string): ClassificationResult {
  try {
    // Extract JSON from response (handle code blocks)
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
```

**Commit:** `feat(ai): add LLM-based template classifier with calendar metadata prioritization`

---

### Phase 4: Integration with Enhancement Flow

#### Step 8: Add Classification UI Indicator
**File:** `apps/desktop/src/components/editor-area/index.tsx`

```typescript
// Add state
const [isClassifyingTemplate, setIsClassifyingTemplate] = useState(false);

// Add indicator in UI (near enhance button or floating button)
{isClassifyingTemplate && (
  <div className="flex items-center gap-2 text-sm text-muted-foreground">
    <Loader2Icon className="h-4 w-4 animate-spin" />
    <span>Auto analyzing the transcription...</span>
  </div>
)}
```

#### Step 9: Wire Classification into Enhancement Triggers
**File:** `apps/desktop/src/components/editor-area/index.tsx`

Update the `useAutoEnhance` hook:

```typescript
function useAutoEnhance({
  sessionId,
  enhanceStatus,
  enhanceMutate,
  setIsClassifyingTemplate,
}: {
  sessionId: string;
  enhanceStatus: string;
  enhanceMutate: (params: { triggerType: "auto"; templateId?: string | null }) => void;
  setIsClassifyingTemplate: (value: boolean) => void;
}) {
  const ongoingSessionStatus = useOngoingSession((s) => s.status);
  const autoEnhanceTemplate = useOngoingSession((s) => s.autoEnhanceTemplate);
  const setAutoEnhanceTemplate = useOngoingSession((s) => s.setAutoEnhanceTemplate);
  const prevOngoingSessionStatus = usePreviousValue(ongoingSessionStatus);
  const setShowRaw = useSession(sessionId, (s) => s.setShowRaw);

  // Get current template selection
  const config = useQuery({
    queryKey: ["config", "general"],
    queryFn: async () => await dbCommands.getConfig(),
  });

  useEffect(() => {
    if (
      prevOngoingSessionStatus === "running_active"
      && ongoingSessionStatus === "inactive"
      && enhanceStatus !== "pending"
    ) {
      setShowRaw(false);

      const selectedTemplateId = config.data?.general.selected_template_id;
      
      // Check if Auto template is selected
      if (TemplateService.isAutoTemplate(selectedTemplateId)) {
        // Trigger classification
        setIsClassifyingTemplate(true);
        
        performAutoClassification(sessionId)
          .then((result) => {
            setAutoEnhanceTemplate(result.templateId);
            
            // Trigger enhancement
            enhanceMutate({
              triggerType: "auto",
              templateId: result.templateId,
            });
          })
          .catch((error) => {
            console.error("Auto classification failed:", error);
            
            // Fallback to Running Log
            setAutoEnhanceTemplate(RUNNING_LOG_ID);
            enhanceMutate({
              triggerType: "auto",
              templateId: RUNNING_LOG_ID,
            });
          })
          .finally(() => {
            setIsClassifyingTemplate(false);
            setAutoEnhanceTemplate(null);
          });
      } else {
        // Use manually selected template
        enhanceMutate({
          triggerType: "auto",
          templateId: autoEnhanceTemplate,
        });
        
        setAutoEnhanceTemplate(null);
      }
    }
  }, [
    ongoingSessionStatus,
    enhanceStatus,
    sessionId,
    enhanceMutate,
    setShowRaw,
    autoEnhanceTemplate,
    setAutoEnhanceTemplate,
    prevOngoingSessionStatus,
    config.data,
    setIsClassifyingTemplate,
  ]);
}

async function performAutoClassification(sessionId: string): Promise<ClassificationResult> {
  // Get transcript text
  const words = await dbCommands.getWords(sessionId);
  const transcriptText = words.map(w => w.text).join(" ");
  
  // Get calendar event info (if available)
  const session = await dbCommands.getSession(sessionId);
  const calendarEvent = session.event_id 
    ? await dbCommands.getEvent(session.event_id)
    : null;
  
  // Get available templates
  const availableTemplates = await getClassifiableTemplates();
  
  // Classify
  const result = await classifyTemplate({
    transcriptText,
    calendarEvent: calendarEvent ? {
      title: calendarEvent.title,
      description: calendarEvent.description,
      participants: [], // Extract from event if available
    } : undefined,
    availableTemplates,
  });
  
  return result;
}
```

#### Step 10: Apply Same Logic to Upload and Paste Triggers
**File:** `apps/desktop/src/components/right-panel/views/transcript-view.tsx`

For both `handleUploadAudio` and `handlePasteTranscription`, add similar classification logic after transcription completes.

**Commit:** `feat(flow): integrate auto template classification into all transcription triggers`

---

### Phase 5: Enhancement Pipeline Updates

#### Step 11: Running Log Handling in Summarizer
**File:** `apps/desktop/src/components/editor-area/index.tsx`

Update enhance mutation to handle Running Log specially:

```typescript
const enhance = useMutation({
  mutationFn: async ({ templateId }: { templateId?: string | null }) => {
    // ... existing setup ...
    
    const effectiveTemplateId = TemplateService.getCanonicalTemplateId(
      templateId !== undefined ? templateId : config.general?.selected_template_id
    );
    
    const selectedTemplate = await TemplateService.getTemplate(effectiveTemplateId);
    
    // For Running Log, use minimal formatting
    const shouldUseRunningLogFormat = TemplateService.isRunningLog(effectiveTemplateId);
    
    // ... rest of enhancement logic, pass flag to prompt renderer
  }
});
```

**File:** `crates/template/assets/enhance.system.jinja`

Add conditional logic for Running Log format (if needed).

**Commit:** `refactor(enhance): add Running Log formatting support`

---

### Phase 6: Testing, Docs & Polish

#### Step 12: Unit Tests
**Files:** Create test files

```
apps/desktop/src/ai/__tests__/
  ├── templateClassifier.test.ts
  └── templateOptions.test.ts

apps/desktop/src/utils/__tests__/
  └── template-service.test.ts
```

**Test Cases:**
- Legacy ID mapping to running-log
- Auto template detection
- Classifier timeout and fallback
- JSON parsing edge cases
- Confidence threshold handling

**Commit:** `test: add unit tests for auto template selection`

#### Step 13: Integration Tests
**Commit:** `test(e2e): add integration tests for classification flow`

#### Step 14: i18n Strings
**File:** `apps/desktop/src/locales/en/messages.po`

Add:
- "Auto" template name
- "Running Log" template name
- "Auto analyzing the transcription..."
- Descriptions for both templates

**Commit:** `chore(i18n): add localization strings for auto template selection`

#### Step 15: Documentation
**Files:**
- Update `docs/templates.md` (if exists)
- Add classifier design to this plan document
- Update CHANGELOG

**Commit:** `docs: document auto template selection feature`

---

## ✅ Success Criteria

### Functional Requirements
- ✅ Auto template option appears in Settings
- ✅ Running Log template appears in Settings
- ✅ New users default to Auto template
- ✅ Classification completes for all three triggers (record/upload/paste)
- ✅ Indicator shows during classification
- ✅ Falls back to Running Log on timeout or error
- ✅ Users can override template selection

### Performance Requirements
- ✅ P95 classification latency < 5 seconds
- ✅ P99 classification latency < 8 seconds
- ✅ Classification success rate > 95%

### Quality Requirements
- ✅ No regressions in existing template selection
- ✅ Backward compatibility with legacy selections
- ✅ All unit tests pass
- ✅ Integration tests cover all triggers
- ✅ i18n strings complete

---

## 🚀 Rollout Plan

### Phase 1: Feature Flag (Week 1)
- Deploy with `FEATURE_AUTO_TEMPLATE_SELECT=false`
- Enable for internal testing only

### Phase 2: Staging Validation (Week 2)
- Enable in staging environment
- QA testing across multiple meeting types
- Monitor classification latency and accuracy

### Phase 3: Gradual Rollout (Week 3-4)
- 10% of users
- Monitor telemetry:
  - Classification latency (p50, p95, p99)
  - Fallback rate
  - User override rate
  - Template distribution
- 50% → 100% if metrics are healthy

### Rollback Plan
- Feature flag can disable instantly
- Existing template selections preserved
- Auto-classified results only affect that specific session

---

## 📊 Telemetry & Monitoring

### Metrics to Track
```typescript
analyticsCommands.event({
  event: "template_classification_completed",
  distinct_id: userId,
  session_id: sessionId,
  template_id_selected: result.templateId,
  confidence: result.confidence,
  latency_ms: latency,
  had_calendar_data: !!calendarEvent,
  trigger_type: "recording_stop" | "upload" | "paste",
});

analyticsCommands.event({
  event: "template_classification_failed",
  distinct_id: userId,
  session_id: sessionId,
  error_type: "timeout" | "parse_error" | "llm_error",
  fallback_template: RUNNING_LOG_ID,
});
```

### Dashboards
- Classification success rate over time
- Latency percentiles (p50, p95, p99)
- Template distribution
- Fallback rate
- User override rate

---

## 🔒 Privacy & Security Considerations

### Data Minimization
- Truncate transcripts to first 2000 + last 500 characters
- Prefer calendar metadata over transcript content
- Do not log full transcript in telemetry

### PII Handling
- Basic PII redaction (emails, phone numbers) in transcript snippets
- Calendar data already considered semi-public by user
- No persistent storage of classification prompts

### Security
- Classification uses same LLM endpoint as enhancement
- No third-party API calls
- Timeout prevents hanging requests
- AbortController for proper cleanup

---

## 🎓 Developer Guide: Adding New Templates

When adding a new template to the codebase, the auto-classifier will automatically include it. To optimize classification accuracy:

1. **Use clear, descriptive template titles** (e.g., "Customer Discovery Call" not "Meeting Template 5")
2. **Write informative descriptions** that highlight use cases
3. **Add relevant tags** that the classifier can use as keywords
4. **Test classification** with sample transcripts of that meeting type

Example:
```typescript
{
  id: "customer-discovery",
  title: "🔍 Customer Discovery Call",
  description: "For early-stage customer interviews. Captures pain points, use cases, and feature feedback.",
  tags: ["startup", "customer", "discovery", "interview", "feedback", "b2b"],
  // ...
}
```

---

## 📝 Notes & Future Enhancements

### Known Limitations
- Classification latency adds 3-5s to enhancement start time
- Requires functioning LLM endpoint (same as enhancement)
- May misclassify edge cases (mitigated by Running Log fallback)

### Future Improvements
1. **Local Caching**: Cache classifications for similar calendar events
2. **User Feedback**: Allow users to correct misclassifications and improve model
3. **Template Recommendations**: Show confidence scores and allow user to review before applying
4. **Hybrid Approach**: Combine rule-based heuristics with LLM for faster decisions
5. **Custom Templates**: Train classifier on user's custom templates over time

---

## 🔗 Related Documentation

- [Feature: Paste Transcription](./feature-paste-transcription-plan.md)
- [Release 0.5 Summary](../release-0.5-summary.md)
- Templates User Guide (external docs)

---

**Status:** Ready for implementation  
**Next Step:** Begin with Phase 1 - Foundation
