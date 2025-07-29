import { useState, useCallback, useRef, useEffect } from 'react';

interface NotificationItem {
  id: string;
  data: any;
  createdAt: Date;
}

interface NotificationManagerOptions {
  maxItems?: number;
  defaultTimeout?: number;
}

/**
 * Custom hook for managing notifications with automatic cleanup
 * Handles multiple notifications with individual timeouts
 */
export function useNotificationManager<T = any>(options: NotificationManagerOptions = {}) {
  const { maxItems = 5, defaultTimeout = 5000 } = options;
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  // Add notification with optional custom timeout
  const addNotification = useCallback((id: string, data: T, timeout?: number) => {
    const notification: NotificationItem = {
      id,
      data,
      createdAt: new Date()
    };

    setNotifications(prev => {
      const filtered = prev.filter(n => n.id !== id); // Remove existing with same ID
      const newList = [notification, ...filtered];
      return newList.length > maxItems ? newList.slice(0, maxItems) : newList;
    });

    // Clear existing timer for this ID
    const existingTimer = timersRef.current.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timeoutMs = timeout ?? defaultTimeout;
    const timer = window.setTimeout(() => {
      removeNotification(id);
      timersRef.current.delete(id);
    }, timeoutMs);

    timersRef.current.set(id, timer);
  }, [maxItems, defaultTimeout]);

  // Remove specific notification
  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  // Clear all notifications
  const clearAll = useCallback(() => {
    setNotifications([]);
    
    // Clear all timers
    timersRef.current.forEach(timer => clearTimeout(timer));
    timersRef.current.clear();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(timer => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  return {
    notifications,
    addNotification,
    removeNotification,
    clearAll
  };
}