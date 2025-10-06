import { describe, it, expect } from 'vitest';
import { redactPII, redactCalendarEventPII } from '../piiRedaction';

describe('PII Redaction', () => {
  describe('redactPII', () => {
    it('should redact email addresses', () => {
      const input = 'Contact me at john.doe@example.com or jane@test.org';
      const { text, stats } = redactPII(input);
      
      expect(text).toBe('Contact me at [EMAIL] or [EMAIL]');
      expect(stats.totalRedactions).toBe(2);
      expect(stats.redactionsByType.email).toBe(2);
    });

    it('should redact phone numbers', () => {
      const input = 'Call me at 555-123-4567 or (555) 987-6543';
      const { text, stats } = redactPII(input);
      
      expect(text).toContain('[PHONE]');
      expect(stats.totalRedactions).toBeGreaterThan(0);
    });

    it('should redact credit card numbers', () => {
      const input = 'Card: 1234 5678 9012 3456 or 1234-5678-9012-3456';
      const { text, stats } = redactPII(input);
      
      expect(text).toContain('[CARD]');
      expect(stats.totalRedactions).toBeGreaterThan(0);
    });

    it('should redact SSNs', () => {
      const input = 'SSN: 123-45-6789';
      const { text, stats } = redactPII(input);
      
      expect(text).toBe('SSN: [SSN]');
      expect(stats.totalRedactions).toBe(1);
      expect(stats.redactionsByType.ssn).toBe(1);
    });

    it('should redact IP addresses', () => {
      const input = 'Server at 192.168.1.1 and 10.0.0.1';
      const { text, stats } = redactPII(input);
      
      expect(text).toBe('Server at [IP] and [IP]');
      expect(stats.totalRedactions).toBe(2);
      expect(stats.redactionsByType.ip_address).toBe(2);
    });

    it('should not redact regular text', () => {
      const input = 'This is a normal meeting about project planning';
      const { text, stats } = redactPII(input);
      
      expect(text).toBe(input);
      expect(stats.totalRedactions).toBe(0);
    });

    it('should handle mixed PII', () => {
      const input = 'Contact john@example.com at 555-123-4567 or visit 192.168.1.1';
      const { text, stats } = redactPII(input);
      
      expect(text).toContain('[EMAIL]');
      expect(text).toContain('[PHONE]');
      expect(text).toContain('[IP]');
      expect(stats.totalRedactions).toBe(3);
    });
  });

  describe('redactCalendarEventPII', () => {
    it('should preserve title', () => {
      const event = {
        title: 'Team Standup with john@example.com',
        description: 'Contact john@example.com for details',
        participants: ['john@example.com', 'jane@test.org'],
      };
      
      const redacted = redactCalendarEventPII(event);
      
      expect(redacted.title).toBe('Team Standup with john@example.com'); // Title preserved
      expect(redacted.description).toContain('[EMAIL]'); // Description redacted
    });

    it('should redact description', () => {
      const event = {
        title: 'Project Meeting',
        description: 'Call me at 555-123-4567 or email john@example.com',
      };
      
      const redacted = redactCalendarEventPII(event);
      
      expect(redacted.description).toContain('[PHONE]');
      expect(redacted.description).toContain('[EMAIL]');
    });

    it('should obfuscate participant emails', () => {
      const event = {
        title: 'Meeting',
        participants: ['alice@example.com', 'bob@test.org', 'Charlie'],
      };
      
      const redacted = redactCalendarEventPII(event);
      
      expect(redacted.participants).toHaveLength(3);
      expect(redacted.participants![0]).toBe('[PARTICIPANT_A]');
      expect(redacted.participants![1]).toBe('[PARTICIPANT_B]');
      expect(redacted.participants![2]).toBe('Charlie'); // Non-email preserved
    });

    it('should handle undefined fields', () => {
      const event = {
        title: undefined,
        description: undefined,
        participants: undefined,
      };
      
      const redacted = redactCalendarEventPII(event);
      
      expect(redacted.title).toBeUndefined();
      expect(redacted.description).toBeUndefined();
      expect(redacted.participants).toBeUndefined();
    });
  });
});
