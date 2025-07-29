/**
 * Optimized Terminal Component
 * 
 * Uses WebSocket for real-time updates instead of polling
 * Provides better performance and lower server load
 */

import { useEffect, useRef, useState } from 'react';
import { useTerminalSocket } from '../hooks/useTerminalSocket';

interface TerminalOptimizedProps {
  title: string;
  className?: string;
  maxLines?: number;
  autoScroll?: boolean;
}

export const TerminalOptimized = ({ 
  title, 
  className = '',
  maxLines = 1000,
  autoScroll = true 
}: TerminalOptimizedProps) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Agent 名から tmux ターゲットにマッピング
  const getTargetFromTitle = (title: string): string | null => {
    const mapping: Record<string, string> = {
      'President': 'president',
      'Boss1': 'boss1', 
      'Worker 1': 'worker1',
      'Worker 2': 'worker2',
      'Worker 3': 'worker3'
    };

    for (const [key, value] of Object.entries(mapping)) {
      if (title.includes(key)) {
        return value;
      }
    }
    return null;
  };

  const target = getTargetFromTitle(title);
  const { content, isConnected, isLoading, error, reconnect } = useTerminalSocket(target);

  // Handle user scrolling detection
  const handleScroll = () => {
    if (!terminalRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = terminalRef.current;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10; // 10px tolerance

    setIsUserScrolling(!isAtBottom);

    // Reset user scrolling flag after 3 seconds of no scrolling
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = setTimeout(() => {
      setIsUserScrolling(false);
    }, 3000);
  };

  // Auto-scroll to bottom when content updates (if user isn't scrolling)
  useEffect(() => {
    if (terminalRef.current && autoScroll && !isUserScrolling) {
      const element = terminalRef.current;
      element.scrollTop = element.scrollHeight;
    }
  }, [content, autoScroll, isUserScrolling]);

  // Process content to limit lines and add formatting
  const processContent = (rawContent: string): string => {
    if (!rawContent) return '';

    const lines = rawContent.split('\n');
    
    // Limit number of lines to prevent memory issues
    const limitedLines = lines.length > maxLines 
      ? lines.slice(-maxLines) 
      : lines;

    return limitedLines.join('\n');
  };

  // Convert content to HTML with basic formatting
  const formatContent = (content: string): string => {
    return content
      .replace(/\n/g, '<br/>')
      .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;')
      .replace(/  /g, '&nbsp;&nbsp;'); // Preserve double spaces
  };

  // Connection status indicator
  const getStatusIndicator = () => {
    if (isLoading) {
      return <div className="status-indicator loading">🔄 Connecting...</div>;
    }
    
    if (error) {
      return (
        <div className="status-indicator error">
          ❌ Error: {error}
          <button onClick={reconnect} className="reconnect-btn">
            🔄 Reconnect
          </button>
        </div>
      );
    }
    
    if (!isConnected) {
      return (
        <div className="status-indicator disconnected">
          🔌 Disconnected
          <button onClick={reconnect} className="reconnect-btn">
            🔄 Reconnect
          </button>
        </div>
      );
    }
    
    return (
      <div className="status-indicator connected">
        ✅ Real-time ({target})
      </div>
    );
  };

  const processedContent = processContent(content);
  const formattedContent = formatContent(processedContent);

  return (
    <div className={`terminal-optimized ${className}`}>
      {/* Header with status */}
      <div className="terminal-header">
        <h3 className="terminal-title">{title}</h3>
        {getStatusIndicator()}
      </div>

      {/* Terminal content */}
      <div
        ref={terminalRef}
        className="terminal-content"
        onScroll={handleScroll}
        dangerouslySetInnerHTML={{ __html: formattedContent }}
      />

      {/* User scrolling indicator */}
      {isUserScrolling && (
        <div className="scroll-indicator">
          📜 Scrolling paused - scroll to bottom to resume auto-scroll
        </div>
      )}

      {/* Performance info (development only) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="terminal-debug">
          Lines: {content.split('\n').length} | 
          Chars: {content.length} |
          Connected: {isConnected ? 'Yes' : 'No'}
        </div>
      )}

      <style jsx>{`
        .terminal-optimized {
          display: flex;
          flex-direction: column;
          height: 100%;
          border: 1px solid #333;
          border-radius: 8px;
          overflow: hidden;
          background: #1e1e1e;
          color: #d4d4d4;
          font-family: 'Monaco', 'Consolas', monospace;
        }

        .terminal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: #2d2d2d;
          border-bottom: 1px solid #333;
          font-size: 12px;
        }

        .terminal-title {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
        }

        .status-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 4px;
        }

        .status-indicator.connected {
          background: rgba(0, 255, 0, 0.1);
          color: #4ade80;
        }

        .status-indicator.loading {
          background: rgba(255, 255, 0, 0.1);
          color: #fbbf24;
        }

        .status-indicator.error,
        .status-indicator.disconnected {
          background: rgba(255, 0, 0, 0.1);
          color: #f87171;
        }

        .reconnect-btn {
          background: rgba(59, 130, 246, 0.8);
          border: none;
          border-radius: 3px;
          color: white;
          cursor: pointer;
          font-size: 10px;
          padding: 2px 6px;
          transition: background 0.2s;
        }

        .reconnect-btn:hover {
          background: rgba(59, 130, 246, 1);
        }

        .terminal-content {
          flex: 1;
          padding: 12px;
          overflow-y: auto;
          overflow-x: hidden;
          line-height: 1.4;
          font-size: 13px;
          white-space: pre-wrap;
          word-break: break-all;
        }

        .scroll-indicator {
          position: absolute;
          bottom: 20px;
          right: 20px;
          background: rgba(59, 130, 246, 0.9);
          color: white;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 12px;
          max-width: 200px;
          text-align: center;
          animation: fadeIn 0.3s ease;
        }

        .terminal-debug {
          padding: 4px 8px;
          background: rgba(0, 0, 0, 0.3);
          font-size: 10px;
          color: #888;
          border-top: 1px solid #333;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Scrollbar styling */
        .terminal-content::-webkit-scrollbar {
          width: 8px;
        }

        .terminal-content::-webkit-scrollbar-track {
          background: #2d2d2d;
        }

        .terminal-content::-webkit-scrollbar-thumb {
          background: #555;
          border-radius: 4px;
        }

        .terminal-content::-webkit-scrollbar-thumb:hover {
          background: #777;
        }
      `}</style>
    </div>
  );
};

export default TerminalOptimized;