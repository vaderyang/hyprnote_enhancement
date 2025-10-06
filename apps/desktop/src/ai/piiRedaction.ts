/**
 * PII (Personally Identifiable Information) redaction utilities
 * Helps protect user privacy by redacting sensitive information before sending to LLM
 */

/**
 * Common PII patterns to redact
 */
const PII_PATTERNS = [
  // Email addresses
  {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: "[EMAIL]",
    name: "email",
  },
  // Phone numbers (various formats)
  {
    pattern: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: "[PHONE]",
    name: "phone",
  },
  // Credit card numbers (basic pattern)
  {
    pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    replacement: "[CARD]",
    name: "credit_card",
  },
  // Social Security Numbers (US format)
  {
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: "[SSN]",
    name: "ssn",
  },
  // IP addresses
  {
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replacement: "[IP]",
    name: "ip_address",
  },
];

export interface RedactionStats {
  totalRedactions: number;
  redactionsByType: Record<string, number>;
}

/**
 * Redact common PII patterns from text
 * @param text - Text to redact
 * @param options - Redaction options
 * @returns Redacted text and statistics
 */
export function redactPII(
  text: string,
  options: {
    /**
     * Whether to log redaction stats for debugging
     * @default false
     */
    logStats?: boolean;
  } = {}
): { text: string; stats: RedactionStats } {
  let redactedText = text;
  const stats: RedactionStats = {
    totalRedactions: 0,
    redactionsByType: {},
  };
  
  for (const { pattern, replacement, name } of PII_PATTERNS) {
    const matches = redactedText.match(pattern);
    if (matches && matches.length > 0) {
      stats.redactionsByType[name] = matches.length;
      stats.totalRedactions += matches.length;
      redactedText = redactedText.replace(pattern, replacement);
    }
  }
  
  if (options.logStats && stats.totalRedactions > 0) {
    console.log(`🔒 Redacted ${stats.totalRedactions} PII instances:`, stats.redactionsByType);
  }
  
  return { text: redactedText, stats };
}

/**
 * Redact PII from calendar event data
 * More conservative - only redacts from description, preserves title and basic info
 */
export function redactCalendarEventPII(event: {
  title?: string;
  description?: string;
  participants?: string[];
}): {
  title?: string;
  description?: string;
  participants?: string[];
} {
  return {
    title: event.title, // Keep title as-is for classification signals
    description: event.description
      ? redactPII(event.description).text
      : undefined,
    // Keep participant count but redact email domains
    participants: event.participants?.map(p => {
      // Keep first name initial if it looks like a name, otherwise redact
      return p.includes("@")
        ? `[PARTICIPANT_${p.charAt(0).toUpperCase()}]`
        : p;
    }),
  };
}
