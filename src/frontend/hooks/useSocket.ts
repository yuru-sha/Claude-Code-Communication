import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3001';

export const useSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const connectSocket = useCallback(() => {
    const socketInstance = io(SOCKET_URL, {
      forceNew: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      timeout: 20000
    });

    setSocket(socketInstance);

    socketInstance.on('connect', () => {
      console.log('🔌 Socket connected:', socketInstance.id);
      setIsConnected(true);
      setConnectionError(null);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('🔌 Socket disconnected:', reason);
      setIsConnected(false);
      if (reason === 'io server disconnect') {
        // サーバーが接続を切断した場合、再接続を試行
        socketInstance.connect();
      }
    });

    socketInstance.on('connect_error', (error) => {
      console.error('🔌 Socket connection error:', error);
      setConnectionError(error.message);
      setIsConnected(false);
    });

    socketInstance.on('reconnect', (attemptNumber) => {
      console.log('🔌 Socket reconnected after', attemptNumber, 'attempts');
      setIsConnected(true);
      setConnectionError(null);
    });

    socketInstance.on('reconnect_error', (error) => {
      console.error('🔌 Socket reconnection error:', error);
      setConnectionError('再接続に失敗しました');
    });

    socketInstance.on('reconnect_failed', () => {
      console.error('🔌 Socket reconnection failed');
      setConnectionError('サーバーに接続できません');
    });

    // タスクキューの更新を受信
    socketInstance.on('task-queued', (task) => {
      console.log('Task queued:', task);
    });

    return socketInstance;
  }, []);

  useEffect(() => {
    const socketInstance = connectSocket();
    
    return () => {
      if (socketInstance) {
        socketInstance.disconnect();
      }
    };
  }, [connectSocket]);

  return { socket, isConnected, connectionError };
};