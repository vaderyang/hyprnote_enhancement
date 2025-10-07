# Netis Global Error Handling Fix

## Problem Description
When selecting "Netis Global" in Settings → Intelligence, the application would trigger a "Sorry, something went wrong" error and show the ErrorBoundary fallback UI. This occurred even with a valid API key configured, and especially when the Netis Global service was unavailable or during network issues.

## Root Cause
The Netis Global feature had several critical issues:

1. **No Error Boundary Protection**: React Query errors from the models fetch would propagate to the ErrorBoundary
2. **Missing API Key Handling**: The accordion was visible even when `VITE_NETIS_GLOBAL_API_KEY` was not set
3. **No Fallback Mechanism**: When Netis Global failed, there was no automatic fallback to the standard Netis provider
4. **Retry Spam**: Failed requests would retry indefinitely, creating a poor user experience

## Solution Implemented

### 1. Conditional Visibility
**File**: `apps/desktop/src/components/settings/components/ai/llm-custom-view.tsx`

- Normalized API key: `const netisGlobalApiKey = String(import.meta.env.VITE_NETIS_GLOBAL_API_KEY ?? "").trim();`
- Added visibility flag: `const hasNetisGlobal = netisGlobalApiKey.length > 0;`
- Conditionally render accordion: `{hasNetisGlobal && ( ... Netis Global accordion ... )}`

**Result**: Netis Global option is completely hidden when the API key is not configured.

### 2. Comprehensive Error Handling
Added multiple layers of error protection:

#### React Query Configuration
```typescript
const netisGlobalModels = useQuery({
  queryKey: ["netis-global-models"],
  enabled: hasNetisGlobal && !ngSessionDisabledRef.current && openAccordion === "netis-global",
  retry: false,              // No retries
  throwOnError: false,       // Don't throw to ErrorBoundary
  onError: (err: unknown) => {
    handleNetisGlobalFailure("models-query", err);
  },
  queryFn: async () => {
    // Comprehensive error handling inside query function
    try {
      // ... fetch logic ...
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      // ... validation ...
    } catch (error) {
      // Let onError handle it without triggering ErrorBoundary
      throw error;
    }
  },
});
```

#### useEffect Error Handling
```typescript
useEffect(() => {
  if (!hasNetisGlobal || ngSessionDisabledRef.current) return;
  
  let cancelled = false;
  const run = async () => {
    try {
      // ... configuration logic ...
    } catch (err) {
      if (!cancelled) {
        handleNetisGlobalFailure("auto-config", err);
      }
    }
  };
  run();
  
  return () => { cancelled = true; };
}, [/* dependencies */]);
```

### 3. Automatic Fallback to Netis
When Netis Global fails, the system automatically:

1. Disables Netis Global for the session (stored in `sessionStorage`)
2. Shows a user-friendly toast notification
3. Switches UI to the "Netis" (others) provider
4. Configures the Netis provider with default settings

```typescript
const handleNetisGlobalFailure = useCallback(
  (reason: string, err?: unknown) => {
    if (ngSessionDisabledRef.current) return;
    
    console.warn(`Netis Global failed (${reason}):`, err);
    disableNetisGlobalForSession();
    
    // User-friendly notification
    toast({
      title: "Netis Global Unavailable",
      content: "Switching to Netis provider instead.",
      duration: 3000,
    });
    
    // Switch UI to Netis ("others")
    setOpenAccordion("others");
    
    // Configure "others" with default Netis settings
    try {
      configureCustomEndpoint({
        provider: "others",
        ...DEFAULT_NETIS_CONFIG,
      });
    } catch (e) {
      console.warn("Failed to configure Netis defaults on others", e);
    }
  },
  [configureCustomEndpoint, disableNetisGlobalForSession, setOpenAccordion]
);
```

### 4. Session-Level Guard
Prevents repeated failure attempts within the same session:

```typescript
const ngSessionDisabledRef = useRef<boolean>(
  typeof sessionStorage !== "undefined" && sessionStorage.getItem("netisGlobalDisabled") === "1"
);
```

Once Netis Global fails in a session, it won't retry until the user refreshes the browser or starts a new session.

## Testing Scenarios

### Scenario 1: No API Key
**Steps**:
1. Remove or comment out `VITE_NETIS_GLOBAL_API_KEY` from environment
2. Build and run the application
3. Navigate to Settings → Intelligence

**Expected**:
- Netis Global accordion is not visible
- Only "Netis" (others) accordion is shown
- No errors or crashes

### Scenario 2: Valid API Key + Service Available
**Steps**:
1. Set valid `VITE_NETIS_GLOBAL_API_KEY` in build environment
2. Build and run the application
3. Navigate to Settings → Intelligence
4. Click on "Netis Global" accordion

**Expected**:
- Netis Global accordion expands
- Models load successfully
- Can select a model
- No toast notifications
- No errors

### Scenario 3: Valid API Key + Service Unavailable
**Steps**:
1. Set valid `VITE_NETIS_GLOBAL_API_KEY` but simulate network failure (disable network or use invalid endpoint)
2. Build and run the application
3. Navigate to Settings → Intelligence
4. Click on "Netis Global" accordion

**Expected**:
- Toast notification appears: "Netis Global Unavailable - Switching to Netis provider instead."
- UI automatically switches to "Netis" (others) accordion
- Netis is configured with default settings
- No "Sorry, something went wrong" error
- No ErrorBoundary fallback UI
- Netis Global is disabled for the rest of the session

### Scenario 4: Fallback Persistence
**Steps**:
1. Follow Scenario 3 to trigger fallback
2. Navigate away from Settings
3. Return to Settings → Intelligence

**Expected**:
- Netis (others) accordion remains selected
- Netis Global is not attempted again
- No repeated error toasts
- To retry Netis Global, user must refresh browser or start new session

## Files Modified

- `apps/desktop/src/components/settings/components/ai/llm-custom-view.tsx`
  - Added imports: `useCallback`, `useRef`, `toast`
  - Added visibility flag: `hasNetisGlobal`
  - Added session guard: `ngSessionDisabledRef`
  - Added fallback handler: `handleNetisGlobalFailure`
  - Updated React Query configuration with error handling
  - Added try-catch blocks around useEffect logic
  - Conditionally rendered Netis Global accordion

## Technical Details

### Default Netis Configuration
```typescript
const DEFAULT_NETIS_CONFIG = {
  api_base: "http://v.netis.com.cn:13000/v1",
  api_key: "sk-418Nlx53Dvu87o-TWOgyJg",
  model: "gpt-4o",
};
```

### Provider Mapping
Both "netis-global" and "others" map to the same backend storage keys (OthersApiBase, OthersApiKey, OthersModel), which is why the fallback seamlessly transitions from Netis Global to regular Netis configuration.

## Benefits

1. **Zero ErrorBoundary Crashes**: All Netis Global errors are caught and handled gracefully
2. **Better UX**: Users see informative toast messages instead of error screens
3. **Automatic Recovery**: System automatically falls back to working provider
4. **Session Stability**: Prevents retry spam and repeated failures
5. **Clean Code**: Centralized error handling logic
6. **Environment Flexibility**: Works correctly with or without API key configured

## Deployment Notes

- Ensure `VITE_NETIS_GLOBAL_API_KEY` is set in production build scripts if Netis Global should be available
- If the key is not set, Netis Global will be hidden automatically (no code changes needed)
- SessionStorage is used for fallback state (cleared on browser restart)
- No database or persistent storage changes required

## Future Improvements (Optional)

1. Add retry button in toast notification to manually retry Netis Global
2. Add network status indicator for Netis Global health
3. Implement automatic retry with exponential backoff
4. Add telemetry/analytics for fallback events
5. Create admin panel to monitor Netis Global usage vs fallback rate
