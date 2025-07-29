/**
 * Terminal WebSocket Hook
 * 
 * Provides real-time terminal output via WebSocket instead of polling
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface TerminalData {
  target: string;
  content: string;
  timestamp: Date;
}

interface UseTerminalSocketReturn {
  content: string;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  reconnect: () => void;
}

/**
 * Custom hook for real-time terminal content via WebSocket
 */
export const useTerminalSocket = (target: string | null): UseTerminalSocketReturn => {
  const [content, setContent] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  const socketRef = useRef<Socket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      return;
    }

    console.log(`🔌 Connecting to terminal WebSocket for target: ${target}`);
    
    const socket = io({
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true
    });

    socket.on('connect', () => {
      setIsConnected(true);
      setError(null);
      setIsLoading(false);
      console.log(`✅ Connected to WebSocket for ${target}`);

      // Subscribe to terminal updates for this target
      if (target) {
        socket.emit('subscribe-terminal', { target });
      }
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log(`🔌 Disconnected from WebSocket for ${target}`);
    });

    socket.on('connect_error', (err) => {
      console.error(`❌ WebSocket connection error for ${target}:`, err);
      setError(`Connection failed: ${err.message}`);
      setIsLoading(false);
      
      // Auto-reconnect with exponential backoff
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log(`🔄 Attempting to reconnect WebSocket for ${target}...`);
        connect();
      }, 5000);
    });

    // Handle terminal content updates
    socket.on('terminal-update', (data: TerminalData) => {
      if (data.target === target) {
        setContent(data.content);
        setError(null);
        console.log(`📺 Terminal content updated for ${target} (${data.content.length} chars)`);
      }
    });

    // Handle terminal errors
    socket.on('terminal-error', (data: { target: string; error: string }) => {
      if (data.target === target) {
        setError(data.error);
        setContent(`[${new Date().toLocaleTimeString()}] Error: ${data.error}`);
      }
    });

    // Handle terminal status updates
    socket.on('terminal-status', (data: { target: string; status: string; message?: string }) => {
      if (data.target === target) {
        const timestamp = new Date().toLocaleTimeString();
        const statusMessage = data.message || `Status: ${data.status}`;
        setContent(`[${timestamp}] ${statusMessage}`);
      }
    });

    socketRef.current = socket;
  }, [target]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      console.log(`🔌 Disconnecting WebSocket for ${target}`);
      
      if (target) {
        socketRef.current.emit('unsubscribe-terminal', { target });
      }
      
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setIsConnected(false);
  }, [target]);

  const reconnect = useCallback(() => {
    disconnect();
    setTimeout(() => {
      setIsLoading(true);
      setError(null);
      connect();
    }, 1000);
  }, [disconnect, connect]);

  // Effect for initial connection and target changes
  useEffect(() => {
    if (!target) {
      setContent('[Terminal] Waiting for target assignment...');
      setIsLoading(false);
      return;
    }

    connect();

    return () => {
      disconnect();
    };
  }, [target, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    content,
    isConnected,
    isLoading,
    error,
    reconnect
  };
};

export default useTerminalSocket;