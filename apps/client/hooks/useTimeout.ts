import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Custom hook for managing timeouts with automatic cleanup
 * Prevents memory leaks by properly clearing timeouts on unmount
 */
export function useTimeout(callback: () => void, delay: number | null) {
  const callbackRef = useRef(callback);
  const timeoutRef = useRef<number>();

  // Keep callback reference current
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Set timeout function
  const set = useCallback(() => {
    if (delay !== null) {
      timeoutRef.current = window.setTimeout(() => callbackRef.current(), delay);
    }
  }, [delay]);

  // Clear timeout function
  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  // Reset timeout function
  const reset = useCallback(() => {
    clear();
    set();
  }, [clear, set]);

  // Set timeout on delay change
  useEffect(() => {
    set();
    return clear; // Cleanup on unmount or delay change
  }, [delay, set, clear]);

  return { reset, clear };
}

/**
 * Custom hook for managing intervals with automatic cleanup
 * Similar to useTimeout but for recurring operations
 */
export function useInterval(callback: () => void, delay: number | null) {
  const callbackRef = useRef(callback);
  const intervalRef = useRef<number>();

  // Keep callback reference current
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Start interval function
  const start = useCallback(() => {
    if (delay !== null) {
      intervalRef.current = window.setInterval(() => callbackRef.current(), delay);
    }
  }, [delay]);

  // Stop interval function
  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
  }, []);

  // Restart interval function
  const restart = useCallback(() => {
    stop();
    start();
  }, [stop, start]);

  // Start interval on delay change
  useEffect(() => {
    start();
    return stop; // Cleanup on unmount or delay change
  }, [delay, start, stop]);

  return { restart, stop };
}

/**
 * Custom hook for debouncing values
 * Useful for search inputs and expensive operations
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useTimeout(() => {
    setDebouncedValue(value);
  }, delay);

  return debouncedValue;
}

/**
 * Custom hook for throttling function calls
 * Limits how often a function can be called
 */
export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const callbackRef = useRef(callback);
  const lastRunRef = useRef(0);
  const timeoutRef = useRef<number>();

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const throttledCallback = useCallback(
    (...args: any[]) => {
      const now = Date.now();
      const timeSinceLastRun = now - lastRunRef.current;

      if (timeSinceLastRun >= delay) {
        callbackRef.current(...args);
        lastRunRef.current = now;
      } else {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = window.setTimeout(() => {
          callbackRef.current(...args);
          lastRunRef.current = Date.now();
        }, delay - timeSinceLastRun);
      }
    },
    [delay]
  ) as T;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return throttledCallback;
}