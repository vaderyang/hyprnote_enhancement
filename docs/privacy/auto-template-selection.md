# Privacy & Security - Auto Template Selection

## Overview

The Auto Template Selection feature uses AI to intelligently classify meeting transcripts and select the most appropriate template for note-taking. This document outlines the privacy and security measures implemented to protect user data.

## Data Minimization

### Transcript Truncation
- **Preview Length**: Only the first 2,000 characters of the transcript are sent to the classifier
- **Tail Length**: Only the last 500 characters are included if the transcript is longer
- **Rationale**: This provides enough context for classification while minimizing data exposure
- The full transcript is never sent to external services for classification

### Metadata Prioritization
- Calendar event metadata (title, description, participant count) is prioritized over transcript content
- When calendar data is available, it provides strong classification signals without requiring full transcript analysis
- This reduces both data exposure and classification latency

## PII Redaction

### Automatic Redaction
Before any data is sent to the LLM for classification, the following PII patterns are automatically redacted:

1. **Email Addresses**: Replaced with `[EMAIL]`
2. **Phone Numbers**: Replaced with `[PHONE]` (supports various formats)
3. **Credit Card Numbers**: Replaced with `[CARD]`
4. **Social Security Numbers**: Replaced with `[SSN]` (US format)
5. **IP Addresses**: Replaced with `[IP]`

### Calendar Event Handling
- **Title**: Preserved as-is (needed for classification signals)
- **Description**: PII redacted before sending
- **Participants**: Email addresses are obfuscated to `[PARTICIPANT_X]` where X is the first letter

### Implementation
All redaction is performed locally on the user's device before any network requests are made. See `apps/desktop/src/ai/piiRedaction.ts` for implementation details.

## Logging & Analytics

### What We Log
The following metadata is logged for debugging and monitoring:
- Template ID selected by the classifier
- Classification confidence score (0.0 - 1.0)
- Latency (milliseconds)
- Whether calendar data was available
- Whether confidence was below threshold
- Whether fallback to Running Log occurred

### What We Never Log
- Raw transcript text
- Meeting content or conversation details
- PII (emails, phone numbers, etc.)
- Calendar event descriptions
- Participant names

### Log Retention
Classification logs are stored locally and follow the application's standard log retention policy. No classification data is sent to external analytics services beyond the aggregate metrics listed above.

## Network Requests

### Classification Request
- Sent to the configured LLM provider (OpenAI, Anthropic, or self-hosted)
- Contains: Redacted transcript preview, redacted calendar metadata, template options
- Uses TLS encryption in transit
- Subject to the LLM provider's privacy policy and data retention policies

### Timeout & Fallback
- Classification requests timeout after 4.5 seconds (configurable)
- On timeout or failure, the system falls back to the "Running Log" template
- No retry logic to prevent repeated data transmission

## User Control

### Feature Flag
- The entire feature can be disabled via environment variable: `VITE_FEATURE_AUTO_TEMPLATE_SELECT=false`
- When disabled, manual template selection is used

### Manual Override
- Users can manually change the template selection at any time
- If a user changes the template while classification is in progress, the classification is cancelled
- User selection always takes precedence over auto-classification

### Opt-Out
Users can opt-out of auto-classification by:
1. Changing their default template from "Auto" to any specific template
2. Disabling the feature via environment variable (requires admin access)

## Compliance Considerations

### GDPR
- Data minimization and purpose limitation are core design principles
- PII redaction occurs before any data leaves the device
- Users have control over the feature and can opt-out
- No persistent storage of classification inputs

### CCPA
- No sale of personal information
- Data used solely for classification purposes
- Users can disable the feature

### HIPAA (for healthcare users)
- Transcript redaction reduces PHI exposure
- Calendar event titles and descriptions should not contain PHI
- Healthcare organizations should review LLM provider BAAs
- Consider disabling the feature for highly sensitive meetings

## Security Measures

### Input Validation
- All classifier inputs are validated and sanitized
- Maximum input lengths enforced
- Malformed calendar events handled gracefully

### Timeout & Resource Limits
- Hard timeout at 4.5 seconds
- Prevents long-running or stuck classification requests
- AbortController used for clean cancellation

### Error Handling
- Classification errors never expose raw transcript in error messages
- Failures fall back to safe default (Running Log)
- Error analytics track only error type, not content

## Recommendations

### For End Users
1. Review your LLM provider's privacy policy
2. Avoid including sensitive PII in calendar event titles
3. Use manual template selection for highly confidential meetings
4. Enable local-only LLM providers for maximum privacy

### For Administrators
1. Review and configure `VITE_AI_TEMPLATE_CLASSIFIER_TIMEOUT_MS`
2. Set `VITE_FEATURE_AUTO_TEMPLATE_SELECT=false` for high-security environments
3. Educate users on the feature and privacy controls
4. Consider network policies to restrict external LLM access if needed

## Contact

For privacy questions or concerns about this feature:
- Open a GitHub issue in the repository
- Contact the development team
- Review the main application privacy policy

## Changelog

- **2024-XX-XX**: Initial privacy documentation for Auto Template Selection feature
