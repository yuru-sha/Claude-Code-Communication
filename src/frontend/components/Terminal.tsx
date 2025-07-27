import { useEffect, useRef, useState } from 'react';

export const Terminal = ({ title }: { title: string }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState<string>('');

  // Agent 名から tmux ターゲットにマッピング
  const getTargetFromTitle = (title: string): string | null => {
    if (title.includes('President')) return 'president';
    if (title.includes('Boss1')) return 'multiagent:0.0';
    if (title.includes('Worker 1')) return 'multiagent:0.1';
    if (title.includes('Worker 2')) return 'multiagent:0.2';
    if (title.includes('Worker 3')) return 'multiagent:0.3';
    return null;
  };

  useEffect(() => {
    const target = getTargetFromTitle(title);
    
    if (target) {
      // 定期的に tmux の内容を取得
      const fetchContent = async () => {
        try {
          const response = await fetch(`/api/terminal/${target}`);
          if (response.ok) {
            const data = await response.text();
            setContent(data);
          } else {
            setContent(`[${new Date().toLocaleTimeString()}] Agent is starting...\n[${new Date().toLocaleTimeString()}] Please wait for Claude authentication...`);
          }
        } catch (error) {
          setContent(`[${new Date().toLocaleTimeString()}] Terminal for ${title} - Status: Connecting...\n[${new Date().toLocaleTimeString()}] Checking agent status...`);
        }
      };

      // 初回実行
      fetchContent();
      
      // 5 秒ごとに更新
      const interval = setInterval(fetchContent, 5000);
      
      return () => clearInterval(interval);
    } else {
      setContent(`[${new Date().toLocaleTimeString()}] Terminal for ${title} - Ready\n[${new Date().toLocaleTimeString()}] Waiting for commands...`);
    }
  }, [title]);

  useEffect(() => {
    if (terminalRef.current) {
      // 内容を表示し、自動スクロール
      terminalRef.current.innerHTML = content
        .split('\n')
        .slice(-20) // 最新 20 行のみ表示
        .map(line => `<div style="margin-bottom: 2px; font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.2;">${line || '&nbsp;'}</div>`)
        .join('');
      
      // 最下部にスクロール
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [content]);

  return (
    <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl overflow-hidden shadow-lg">
      <div className="bg-slate-800/50 px-4 py-3 border-b border-slate-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <h3 className="text-sm font-semibold text-slate-300">Terminal Output</h3>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          </div>
        </div>
      </div>
      <div 
        ref={terminalRef}
        className="bg-slate-950/80 text-green-400 p-4 font-mono text-xs leading-relaxed overflow-y-auto terminal-scroll"
        style={{ 
          minHeight: '350px',
          maxHeight: '400px',
          whiteSpace: 'pre-wrap'
        }}
      >
        <div className="text-slate-500 italic">Loading terminal...</div>
      </div>
    </div>
  );
};