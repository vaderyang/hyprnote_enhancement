/**
 * Configuration for the template classifier
 * Reads from environment variables with sensible defaults
 */

export interface ClassifierConfig {
  /**
   * Model to use for classification
   * @default "defaultModel"
   */
  model: string;
  
  /**
   * Timeout for classification requests in milliseconds
   * @default 4500
   */
  timeoutMs: number;
  
  /**
   * Whether auto template selection feature is enabled
   * @default true
   */
  featureEnabled: boolean;
  
  /**
   * Minimum confidence threshold for accepting classifications
   * @default 0.5
   */
  confidenceThreshold: number;
}

/**
 * Get classifier configuration from environment variables
 * Falls back to sensible defaults if variables are not set
 */
export function getClassifierConfig(): ClassifierConfig {
  const model = import.meta.env.VITE_AI_TEMPLATE_CLASSIFIER_MODEL || "defaultModel";
  
  const timeoutMs = import.meta.env.VITE_AI_TEMPLATE_CLASSIFIER_TIMEOUT_MS
    ? parseInt(import.meta.env.VITE_AI_TEMPLATE_CLASSIFIER_TIMEOUT_MS, 10)
    : 4500;
  
  const featureEnabled = import.meta.env.VITE_FEATURE_AUTO_TEMPLATE_SELECT !== "false";
  
  // Confidence threshold is not configurable via env to maintain consistency
  // but can be adjusted here if needed
  const confidenceThreshold = 0.5;
  
  return {
    model,
    timeoutMs,
    featureEnabled,
    confidenceThreshold,
  };
}

/**
 * Check if auto template selection is enabled
 */
export function isAutoTemplateSelectionEnabled(): boolean {
  return getClassifierConfig().featureEnabled;
}

/**
 * Get diagnostic info about classifier configuration
 * Useful for debugging and support
 */
export function getClassifierDiagnostics(): Record<string, unknown> {
  const config = getClassifierConfig();
  
  return {
    "Template Classifier Model": config.model,
    "Classification Timeout (ms)": config.timeoutMs,
    "Auto Selection Enabled": config.featureEnabled,
    "Confidence Threshold": config.confidenceThreshold,
    "Environment": import.meta.env.MODE,
  };
}
