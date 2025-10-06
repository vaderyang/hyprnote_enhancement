import { describe, it, expect } from 'vitest';
import { RUNNING_LOG_ID, AUTO_TEMPLATE_ID, TemplateService } from '../../utils/template-service';

describe('Template Service', () => {
  describe('getCanonicalTemplateId', () => {
    it('should map null to running-log', () => {
      expect(TemplateService.getCanonicalTemplateId(null)).toBe(RUNNING_LOG_ID);
    });

    it('should map undefined to running-log', () => {
      expect(TemplateService.getCanonicalTemplateId(undefined)).toBe(RUNNING_LOG_ID);
    });

    it('should map empty string to running-log', () => {
      expect(TemplateService.getCanonicalTemplateId('')).toBe(RUNNING_LOG_ID);
    });

    it('should map "no-template" to running-log', () => {
      expect(TemplateService.getCanonicalTemplateId('no-template')).toBe(RUNNING_LOG_ID);
    });

    it('should map "default" to running-log', () => {
      expect(TemplateService.getCanonicalTemplateId('default')).toBe(RUNNING_LOG_ID);
    });

    it('should preserve custom template IDs', () => {
      expect(TemplateService.getCanonicalTemplateId('custom-123')).toBe('custom-123');
    });

    it('should preserve running-log ID', () => {
      expect(TemplateService.getCanonicalTemplateId(RUNNING_LOG_ID)).toBe(RUNNING_LOG_ID);
    });

    it('should preserve auto-select ID', () => {
      expect(TemplateService.getCanonicalTemplateId(AUTO_TEMPLATE_ID)).toBe(AUTO_TEMPLATE_ID);
    });
  });

  describe('isAutoTemplate', () => {
    it('should return true for auto-select', () => {
      expect(TemplateService.isAutoTemplate(AUTO_TEMPLATE_ID)).toBe(true);
    });

    it('should return false for null', () => {
      expect(TemplateService.isAutoTemplate(null)).toBe(false);
    });

    it('should return false for other IDs', () => {
      expect(TemplateService.isAutoTemplate('custom-123')).toBe(false);
      expect(TemplateService.isAutoTemplate(RUNNING_LOG_ID)).toBe(false);
    });
  });

  describe('isRunningLog', () => {
    it('should return true for running-log', () => {
      expect(TemplateService.isRunningLog(RUNNING_LOG_ID)).toBe(true);
    });

    it('should return true for legacy no-template', () => {
      expect(TemplateService.isRunningLog('no-template')).toBe(true);
    });

    it('should return true for null (maps to running-log)', () => {
      expect(TemplateService.isRunningLog(null)).toBe(true);
    });

    it('should return false for auto-select', () => {
      expect(TemplateService.isRunningLog(AUTO_TEMPLATE_ID)).toBe(false);
    });

    it('should return false for custom templates', () => {
      expect(TemplateService.isRunningLog('custom-123')).toBe(false);
    });
  });
});

describe('Template Constants', () => {
  it('should have distinct IDs', () => {
    expect(AUTO_TEMPLATE_ID).not.toBe(RUNNING_LOG_ID);
    expect(AUTO_TEMPLATE_ID).toBe('auto-select');
    expect(RUNNING_LOG_ID).toBe('running-log');
  });
});
