// Analytics plugin disabled - providing stub implementations

export const commands = {
  async event(_payload: any): Promise<null> {
    // Analytics disabled
    return null;
  },
  async setProperties(_payload: any): Promise<null> {
    // Analytics disabled
    return null;
  },
  async setDisabled(_disabled: boolean): Promise<null> {
    // Analytics disabled
    return null;
  },
  async isDisabled(): Promise<boolean> {
    // Analytics disabled
    return true;
  },
};

// Re-export types from bindings for compatibility
export type {
  AnalyticsPayload,
  JsonValue,
  PropertiesPayload,
  Result,
} from "./bindings.gen";
