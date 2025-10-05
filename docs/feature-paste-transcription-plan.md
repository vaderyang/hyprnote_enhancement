# Feature Implementation Plan: Paste Transcription & Auto-Enhancement

## Overview

This document outlines the implementation plan for two related features:
1. **Paste Transcription**: Allow users to paste raw text that gets converted into a transcript
2. **Auto-Enhancement on Upload**: Automatically trigger AI enhancement and collapse the panel after audio upload

## Background

Currently, users can:
- Start a live recording to generate a transcript
- Upload audio files for transcription

After this feature, users will also be able to:
- Paste raw text that gets converted to a transcript
- Have the system automatically enhance notes after uploading audio
- Experience consistent "transcripted state" behavior (auto-collapse panel + auto-enhance)

## Requirements

### 1. Paste Transcription Feature
- Enable the currently disabled "Paste transcript" button
- Allow users to paste raw text (without speaker/timestamp information)
- Convert pasted text into Word2 format (array of word objects with metadata)
- Save words to the session
- Auto-collapse the right panel (similar to recording stop behavior)
- Trigger AI enhancement automatically

### 2. Audio Upload Auto-Enhancement
- After audio upload completes transcription, trigger AI enhancement automatically
- Auto-collapse the right panel after transcription completes

## Technical Architecture

### Data Structures

**Word2 Format:**
```typescript
type Word2 = {
  text: string;
  speaker: { 
    type: "unassigned" | "assigned"; 
    value: { index: number; id?: string } 
  };
  confidence: number;
  start_ms: number;
  end_ms: number;
};
```

**Conversion Logic:**
- Split text by whitespace
- Assign sequential timestamps (0ms, 100ms, 200ms, ...)
- Estimate end_ms based on word length (bounded: 80-800ms)
- Set speaker as unassigned index 0
- Set confidence to 1.0

### Auto-Enhancement Trigger

The `useAutoEnhance` hook watches for status transitions from "running_active" to "inactive". We need to trigger this transition after paste/upload to automatically enhance the note.

**Approach Options:**
1. **Preferred**: Simulate status transition via the ongoing session store
   - Set status to "running_active"
   - Immediately set to "inactive"
   - Hook detects the transition and triggers enhancement
   
2. **Fallback**: Dispatch custom event
   - Dispatch `window.dispatchEvent(new CustomEvent("hypr/auto_enhance", { detail: { sessionId } }))`
   - Add listener in EditorArea to call `enhance.mutate({})`

### UI Flow

**Paste Flow:**
1. User clicks "Paste transcript" button
2. Modal opens with textarea
3. User pastes/types text and clicks "Import"
4. Text is validated and converted to Word2[]
5. Words are saved to session
6. Right panel collapses
7. AI enhancement is triggered automatically
8. Enhanced note appears within seconds

**Upload Flow (Enhanced):**
1. User uploads audio file
2. Progress bar shows transcription status
3. After transcription completes:
   - Auto-trigger enhancement
   - Auto-collapse panel
4. Enhanced note appears

## Implementation Steps

### Phase 1: Setup and Scaffolding

1. **Create implementation plan** (this document)
2. **Wire up imports and state** in `transcript-view.tsx`:
   - Import `useRightPanel` context
   - Import Dialog and Textarea components
   - Add state: `showPasteModal`, `pastedText`, `pasteError`
   - Get `hidePanel` from context

### Phase 2: Core Logic

3. **Implement `plainTextToWords` converter**:
   - Pure helper function outside component
   - Handle tokenization, timestamp generation, Word2 format

4. **Implement `handlePasteTranscription` flow**:
   - Modal handlers: `handleOpenPaste`, `handleCancelPaste`, `handleConfirmPaste`
   - Validation (empty, length limits)
   - Conversion to Word2[]
   - Save to session
   - Query invalidation
   - Trigger auto-enhance
   - Auto-collapse panel
   - Error handling

### Phase 3: UI Components

5. **Render Paste Transcript modal**:
   - Conditional rendering based on `showPasteModal`
   - Title, description, textarea
   - Error display
   - Cancel/Import buttons

6. **Enable buttons** in both compact and normal layouts:
   - Remove `disabled` attribute
   - Add `onClick={handleOpenPaste}`
   - Remove "coming soon" badge

### Phase 4: Audio Upload Enhancement

7. **Update `handleUploadAudio`**:
   - After successful transcription, trigger auto-enhance
   - Auto-collapse panel
   - Ensure proper state cleanup

8. **Implement auto-enhance trigger mechanism**:
   - Check ongoing session store capabilities
   - Implement status transition simulation OR
   - Implement fallback event dispatcher

9. **Add fallback listener in EditorArea** (if needed):
   - Listen for `hypr/auto_enhance` event
   - Call `enhance.mutate({})` when event received
   - Prevent double-triggering

### Phase 5: Polish and Testing

10. **Query invalidation and UI refresh**:
    - Confirm proper invalidation of session queries
    - Verify transcript view reacts to words
    - Verify editor shows enhanced output

11. **Edge cases and validation**:
    - Empty input handling
    - Very long input warnings
    - Newline/whitespace normalization
    - Locale script considerations
    - Toast notifications

12. **Git commits** (atomic):
    - After scaffold: "feat(transcript): scaffold Paste Transcript modal and state, add Word2 converter"
    - After paste flow: "feat(transcript): implement Paste Transcript flow, save words, invalidate queries, auto-collapse"
    - After upload enhancement: "feat(transcript): auto-trigger enhancement and collapse panel after audio upload"
    - If event-based: "feat(editor): listen for auto enhance event and trigger enhancement"

13. **Manual validation**:
    - Test paste flow in compact and normal layouts
    - Test upload flow with auto-enhancement
    - Regression test: ensure recording still works
    - Verify no accidental microphone activation

## File Changes

### Files to Modify
1. `apps/desktop/src/components/right-panel/views/transcript-view.tsx`
   - Add paste modal UI
   - Add `plainTextToWords` converter
   - Add paste handlers
   - Enable paste buttons
   - Update upload handler

2. `apps/desktop/src/components/editor-area/index.tsx` (if fallback needed)
   - Add event listener for auto-enhance trigger

### Files to Create
- `docs/feature-paste-transcription-plan.md` (this file)

## Testing Checklist

- [ ] Paste transcript in compact layout works
- [ ] Paste transcript in normal layout works
- [ ] Modal opens and closes correctly
- [ ] Empty text validation works
- [ ] Very long text shows warning
- [ ] Text is converted to Word2[] correctly
- [ ] Words are saved to session
- [ ] Right panel collapses after paste
- [ ] AI enhancement triggers automatically after paste
- [ ] Enhanced note appears correctly
- [ ] Audio upload triggers enhancement
- [ ] Panel collapses after upload
- [ ] No regression in recording functionality
- [ ] No accidental microphone activation during paste/upload

## Success Criteria

1. Users can paste raw text and have it converted to a transcript
2. After pasting, the system behaves like recording stopped:
   - Panel collapses
   - AI enhancement triggers automatically
   - Enhanced note appears
3. After uploading audio, the same behavior occurs
4. All existing functionality remains intact
5. No console errors or warnings
6. Clean git history with atomic commits

## Notes

- The Word2 format conversion is simple and can be enhanced later if needed
- Duration estimation is heuristic-based; can be tuned based on user feedback
- The auto-enhance trigger mechanism should be determined based on the capabilities of the ongoing session store
- Consider adding analytics events for paste/upload actions in future iterations
