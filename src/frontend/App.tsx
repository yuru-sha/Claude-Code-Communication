import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSocket } from './hooks/useSocket';
import { Activity, Users, CheckCircle, Clock, AlertCircle, Terminal, Send, BarChart3, TrendingUp, X, RefreshCw, AlertTriangle, History, ChevronDown, ChevronUp, Heart, Shield, ShieldAlert, ShieldOff } from 'lucide-react';
import './styles/dashboard.css';

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'paused' | 'failed';
  assignedTo?: string;
  projectName?: string;
  failureReason?: string;
  errorHistory?: string[];
  retryCount?: number;
  createdAt: Date;
}

interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'working' | 'offline';
  currentTask?: string;
  tasksCompleted?: number;
  efficiency?: number;
}

interface SystemHealth {
  tmuxSessions: {
    president: boolean;
    multiagent: boolean;
  };
  claudeAgents: {
    president: boolean;
    boss1: boolean;
    worker1: boolean;
    worker2: boolean;
    worker3: boolean;
  };
  overallHealth: 'healthy' | 'degraded' | 'critical';
  timestamp: Date;
}

function App() {
  const { socket, isConnected, connectionError } = useSocket();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([
    { id: 'president', name: 'President', role: 'Manager', status: 'idle', tasksCompleted: 0, efficiency: 100 },
    { id: 'boss1', name: 'Boss1', role: 'Team Lead', status: 'idle', tasksCompleted: 0, efficiency: 95 },
    { id: 'worker1', name: 'Worker1', role: 'Developer', status: 'idle', tasksCompleted: 0, efficiency: 88 },
    { id: 'worker2', name: 'Worker2', role: 'Developer', status: 'idle', tasksCompleted: 0, efficiency: 92 },
    { id: 'worker3', name: 'Worker3', role: 'Developer', status: 'idle', tasksCompleted: 0, efficiency: 85 }
  ]);

  // Debug: agents 配列をコンソールに出力
  console.log('Current agents:', agents);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [terminalOutputs, setTerminalOutputs] = useState<Record<string, string>>({});
  const [expandedErrorHistory, setExpandedErrorHistory] = useState<Set<string>>(new Set());
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [autoRecoveryStatus, setAutoRecoveryStatus] = useState<string | null>(null);
  const [taskCompletionNotifications, setTaskCompletionNotifications] = useState<Array<{
    id: string;
    taskTitle: string;
    detectedBy: string;
    timestamp: Date;
  }>>([]);
  const [isTaskCompletionMonitoringEnabled, setIsTaskCompletionMonitoringEnabled] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string | null>('president');

  useEffect(() => {
    if (!socket) return;

    socket.on('task-queued', (task: Task) => {
      setTasks(prev => [...prev, task]);
    });

    socket.on('task-assigned', (task: Task) => {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t));
      // Update agent status
      if (task.assignedTo) {
        setAgents(prev => prev.map(agent => 
          agent.id === task.assignedTo ? { ...agent, status: 'working', currentTask: task.title } : agent
        ));
      }
    });

    socket.on('task-completed', (task: Task) => {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t));
      // Update agent status
      if (task.assignedTo) {
        setAgents(prev => prev.map(agent => 
          agent.id === task.assignedTo ? { ...agent, status: 'idle', currentTask: undefined } : agent
        ));
      }
    });

    socket.on('task-failed', (task: Task) => {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t));
      // Update agent status
      if (task.assignedTo) {
        setAgents(prev => prev.map(agent => 
          agent.id === task.assignedTo ? { ...agent, status: 'idle', currentTask: undefined } : agent
        ));
      }
    });

    // エージェント状態のリアルタイム更新
    socket.on('agent-status-updated', (agentUpdate: any) => {
      console.log('🔄 Agent status update received:', agentUpdate);
      setAgents(prev => prev.map(agent => 
        agent.id === agentUpdate.id 
          ? { 
              ...agent, 
              status: agentUpdate.status,
              currentTask: agentUpdate.currentTask || undefined 
            } 
          : agent
      ));
    });

    socket.on('task-retried', (task: Task) => {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t));
    });

    socket.on('task-queue-updated', (update: any) => {
      if (update.tasks) {
        setTasks(update.tasks);
      }
    });

    socket.on('system-health', (health: SystemHealth) => {
      setSystemHealth(health);
      
      // エージェントの状態を更新
      if (health.claudeAgents) {
        setAgents(prev => prev.map(agent => ({
          ...agent,
          status: health.claudeAgents[agent.id as keyof typeof health.claudeAgents] 
            ? (agent.currentTask ? 'working' : 'idle') 
            : 'offline'
        })));
      }
    });

    socket.on('auto-recovery-performed', (data: any) => {
      setAutoRecoveryStatus(`🔧 自動復旧実行中: ${data.message}`);
      console.log('Auto recovery performed:', data);
    });

    socket.on('auto-recovery-status', (data: any) => {
      setAutoRecoveryStatus(`✅ 自動復旧状況: ${data.message}`);
      console.log('Auto recovery status:', data);
      
      // 5 秒後にステータスをクリア
      setTimeout(() => {
        setAutoRecoveryStatus(null);
      }, 5000);
    });

    socket.on('auto-recovery-failed', (data: any) => {
      setAutoRecoveryStatus(`❌ 自動復旧失敗: ${data.message}`);
      console.error('Auto recovery failed:', data);
      
      // 10 秒後にステータスをクリア
      setTimeout(() => {
        setAutoRecoveryStatus(null);
      }, 10000);
    });

    socket.on('task-completion-detected', (data: any) => {
      console.log('🎯 Task completion detected:', data);
      
      // 完了検知の通知を追加
      const notification = {
        id: data.taskId,
        taskTitle: data.taskTitle,
        detectedBy: data.detectedBy,
        timestamp: new Date(data.timestamp)
      };
      
      setTaskCompletionNotifications(prev => [notification, ...prev.slice(0, 4)]); // 最新 5 件まで保持
      
      // 5 秒後に通知を削除
      setTimeout(() => {
        setTaskCompletionNotifications(prev => prev.filter(n => n.id !== data.taskId));
      }, 5000);
    });

    socket.on('task-completion-monitoring-status', (data: any) => {
      setIsTaskCompletionMonitoringEnabled(data.enabled);
      console.log('Task completion monitoring status:', data);
    });

    return () => {
      socket.off('task-queued');
      socket.off('task-assigned');
      socket.off('task-completed');
      socket.off('task-failed');
      socket.off('task-retried');
      socket.off('task-queue-updated');
      socket.off('system-health');
      socket.off('agent-status-updated');
      socket.off('auto-recovery-performed');
      socket.off('auto-recovery-status');
      socket.off('auto-recovery-failed');
      socket.off('task-completion-detected');
      socket.off('task-completion-monitoring-status');
    };
  }, [socket]);

  // Fetch terminal output for all agents (改善版)
  useEffect(() => {
    let isMounted = true;
    let fetchController: AbortController | null = null;

    const fetchTerminalOutput = async (agentId: string, signal?: AbortSignal) => {
      try {
        const response = await fetch(`http://localhost:3001/api/terminal/${agentId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'text/plain',
          },
          signal,
          // タイムアウトを追加
          ...(window.fetch && { timeout: 8000 })
        });
        
        if (!isMounted || signal?.aborted) return;
        
        if (response.ok) {
          const text = await response.text();
          if (isMounted) {
            setTerminalOutputs(prev => ({ ...prev, [agentId]: text }));
          }
        } else {
          if (isMounted) {
            setTerminalOutputs(prev => ({ 
              ...prev, 
              [agentId]: `Error: Unable to fetch terminal output (${response.status})` 
            }));
          }
        }
      } catch (error) {
        if (!isMounted || signal?.aborted) return;
        
        setTerminalOutputs(prev => ({ 
          ...prev, 
          [agentId]: `Network Error: ${error instanceof Error ? error.message : 'Unknown error'}` 
        }));
      }
    };

    const fetchAllTerminalOutputs = async () => {
      if (!isMounted) return;
      
      // 前回のリクエストをキャンセル
      if (fetchController) {
        fetchController.abort();
      }
      
      fetchController = new AbortController();
      const signal = fetchController.signal;

      try {
        // 選択されたエージェントを優先的に更新
        if (selectedAgent) {
          await fetchTerminalOutput(selectedAgent, signal);
        }
        
        // その他のエージェントを並列で更新（遅延なし）
        const otherAgents = agents.filter(agent => agent.id !== selectedAgent);
        const fetchPromises = otherAgents.map(agent => 
          fetchTerminalOutput(agent.id, signal)
        );
        
        await Promise.allSettled(fetchPromises);
      } catch (error) {
        if (!signal.aborted) {
          console.warn('Terminal fetch error:', error);
        }
      }
    };

    // 初回実行
    fetchAllTerminalOutputs();
    
    // 間隔を8秒に延長（負荷軽減）
    const interval = setInterval(fetchAllTerminalOutputs, 8000);

    return () => {
      isMounted = false;
      if (fetchController) {
        fetchController.abort();
      }
      clearInterval(interval);
    };
  }, [agents, selectedAgent]);

  const handleSubmitTask = useCallback(() => {
    if (socket && newTaskTitle.trim()) {
      socket.emit('request-task', {
        id: Date.now().toString(),
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim() || newTaskTitle.trim(),
        createdAt: new Date(),
        status: 'pending'
      });
      setNewTaskTitle('');
      setNewTaskDescription('');
    }
  }, [socket, newTaskTitle, newTaskDescription]);

  const handleRetryTask = useCallback((taskId: string) => {
    if (socket) {
      socket.emit('retry-task', taskId);
    }
  }, [socket]);

  const handleMarkTaskFailed = useCallback((taskId: string, reason: string) => {
    if (socket) {
      socket.emit('mark-task-failed', { taskId, reason });
    }
  }, [socket]);

  const handleManualRecovery = useCallback(() => {
    if (socket) {
      socket.emit('manual-recovery-request');
      setAutoRecoveryStatus('🔧 手動復旧を実行中...');
    }
  }, [socket]);

  const handleToggleTaskCompletionMonitoring = useCallback((enabled: boolean) => {
    if (socket) {
      socket.emit('toggle-task-completion-monitoring', enabled);
    }
  }, [socket]);

  const toggleErrorHistory = useCallback((taskId: string) => {
    setExpandedErrorHistory(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  }, []);

  const taskStats = useMemo(() => ({
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    paused: tasks.filter(t => t.status === 'paused').length,
    failed: tasks.filter(t => t.status === 'failed').length
  }), [tasks]);

  const completionRate = useMemo(() => 
    taskStats.total > 0 
      ? Math.round((taskStats.completed / taskStats.total) * 100) 
      : 0,
    [taskStats.total, taskStats.completed]
  );

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'pending': return 'status-pending';
      case 'in_progress': return 'status-progress';
      case 'completed': return 'status-completed';
      case 'paused': return 'status-paused';
      case 'failed': return 'status-failed';
      default: return '';
    }
  };

  return (
    <div className="dashboard-container">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-content">
          <div className="header-brand">
            <div className="brand-icon">
              <Terminal size={24} />
            </div>
            <div>
              <h1 className="brand-title">Claude Code Communication</h1>
              <p className="brand-subtitle">Enterprise AI Agent Orchestration Platform</p>
            </div>
          </div>
          <div className="header-actions">
            {taskCompletionNotifications.length > 0 && (
              <div className="task-completion-notifications">
                {taskCompletionNotifications.map((notification) => (
                  <div key={notification.id} className="completion-notification">
                    <div className="completion-icon">
                      <CheckCircle size={16} />
                    </div>
                    <div className="completion-details">
                      <span className="completion-title">🎯 自動完了検知</span>
                      <span className="completion-task">{notification.taskTitle}</span>
                      <span className="completion-agent">by {notification.detectedBy}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {autoRecoveryStatus && (
              <div className="auto-recovery-status">
                <div className="recovery-icon">
                  <RefreshCw size={16} className={autoRecoveryStatus.startsWith('🔧') ? 'spinning' : ''} />
                </div>
                <span className="recovery-message">{autoRecoveryStatus}</span>
              </div>
            )}
            {systemHealth && (
              <div className={`system-health-status ${systemHealth.overallHealth}`}>
                <div className="health-icon">
                  {systemHealth.overallHealth === 'healthy' && <Shield size={20} />}
                  {systemHealth.overallHealth === 'degraded' && <ShieldAlert size={20} />}
                  {systemHealth.overallHealth === 'critical' && <ShieldOff size={20} />}
                </div>
                <div className="health-details">
                  <span className="health-label">System Health</span>
                  <span className="health-value">{systemHealth.overallHealth}</span>
                </div>
                <div className="health-indicators">
                  <div className={`indicator ${systemHealth.tmuxSessions.president && systemHealth.tmuxSessions.multiagent ? 'active' : 'inactive'}`} title="tmux sessions">
                    <div className="indicator-dot"></div>
                    <span>tmux</span>
                  </div>
                  <div className={`indicator ${Object.values(systemHealth.claudeAgents).filter(Boolean).length === 5 ? 'active' : 'inactive'}`} title={`Claude agents: ${Object.values(systemHealth.claudeAgents).filter(Boolean).length}/5`}>
                    <div className="indicator-dot"></div>
                    <span>Claude</span>
                  </div>
                  <div className={`indicator ${isTaskCompletionMonitoringEnabled ? 'active' : 'inactive'}`} title={`Task completion monitoring: ${isTaskCompletionMonitoringEnabled ? 'enabled' : 'disabled'}`}>
                    <div className="indicator-dot"></div>
                    <span>Monitor</span>
                  </div>
                  <button 
                    className={`monitoring-toggle-button ${isTaskCompletionMonitoringEnabled ? 'enabled' : 'disabled'}`}
                    onClick={() => handleToggleTaskCompletionMonitoring(!isTaskCompletionMonitoringEnabled)}
                    title={`タスク完了監視を${isTaskCompletionMonitoringEnabled ? '無効' : '有効'}にする`}
                  >
                    {isTaskCompletionMonitoringEnabled ? <Activity size={14} /> : <AlertCircle size={14} />}
                  </button>
                  {(systemHealth.overallHealth === 'critical' || systemHealth.overallHealth === 'degraded') && !autoRecoveryStatus && (
                    <button 
                      className="manual-recovery-button"
                      onClick={handleManualRecovery}
                      title="手動復旧を実行"
                    >
                      <RefreshCw size={14} />
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="connection-status">
              <div className={`status-dot ${socket?.connected ? 'connected' : 'disconnected'}`}></div>
              <span>{socket?.connected ? 'System Online' : 'System Offline'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Dashboard */}
      <main className="dashboard-main">
        {/* KPI Metrics */}
        <section className="kpi-section">
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-icon blue">
                <Activity size={20} />
              </div>
              <div className="kpi-content">
                <h3 className="kpi-value">{taskStats.total}</h3>
                <p className="kpi-label">Total Tasks</p>
                <div className="kpi-trend positive">
                  <TrendingUp size={14} />
                  <span>
                    {taskStats.failed > 0 
                      ? `${taskStats.failed} failed, ${taskStats.completed} completed`
                      : '+12% from last week'
                    }
                  </span>
                </div>
              </div>
            </div>
            
            <div className="kpi-card">
              <div className="kpi-icon purple">
                <Clock size={20} />
              </div>
              <div className="kpi-content">
                <h3 className="kpi-value">{taskStats.inProgress}</h3>
                <p className="kpi-label">In Progress</p>
                <div className="kpi-progress">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${taskStats.total > 0 ? (taskStats.inProgress / taskStats.total) * 100 : 0}%` }}></div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="kpi-card">
              <div className="kpi-icon green">
                <CheckCircle size={20} />
              </div>
              <div className="kpi-content">
                <h3 className="kpi-value">{completionRate}%</h3>
                <p className="kpi-label">Completion Rate</p>
                <div className="kpi-chart">
                  <div className="mini-chart">
                    <div className="chart-bar" style={{ height: '60%' }}></div>
                    <div className="chart-bar" style={{ height: '80%' }}></div>
                    <div className="chart-bar" style={{ height: '45%' }}></div>
                    <div className="chart-bar" style={{ height: '90%' }}></div>
                    <div className="chart-bar" style={{ height: `${completionRate}%` }}></div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="kpi-card">
              <div className="kpi-icon orange">
                <Users size={20} />
              </div>
              <div className="kpi-content">
                <h3 className="kpi-value">{agents.filter(a => a.status === 'working').length}/{agents.length}</h3>
                <p className="kpi-label">Active Agents</p>
                <div className="kpi-status">
                  <div className="agent-status-dots">
                    {agents.map(agent => (
                      <div 
                        key={agent.id} 
                        className={`agent-dot ${agent.status}`}
                        title={`${agent.name}: ${agent.status}`}
                      ></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Dashboard Content Grid */}
        <div className="dashboard-grid">
          {/* Left Panel */}
          <aside className="dashboard-sidebar">
            {/* Quick Actions */}
            <div className="panel">
              <div className="panel-header">
                <h2 className="panel-title">Quick Actions</h2>
                <button className="panel-action">
                  <Send size={16} />
                </button>
              </div>
              <div className="panel-content">
                <div className="quick-action-form">
                  <div className="form-field">
                    <label className="field-label">Task Title</label>
                    <input
                      type="text"
                      className="field-input"
                      placeholder="What needs to be done?"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSubmitTask()}
                    />
                  </div>
                  <div className="form-field">
                    <label className="field-label">Description</label>
                    <textarea
                      className="field-textarea"
                      placeholder="Add more details..."
                      rows={4}
                      value={newTaskDescription}
                      onChange={(e) => setNewTaskDescription(e.target.value)}
                    />
                  </div>
                  <button
                    className="submit-button"
                    onClick={handleSubmitTask}
                    disabled={!newTaskTitle.trim()}
                  >
                    <Send size={16} />
                    Submit Task
                  </button>
                </div>
              </div>
            </div>

            {/* Agent Status Overview */}
            <div className="panel">
              <div className="panel-header">
                <h2 className="panel-title">Agent Status</h2>
                <button className="panel-action">
                  <Users size={16} />
                </button>
              </div>
              <div className="panel-content">
                <div className="agent-status-grid">
                  {agents.map(agent => (
                    <div key={agent.id} className="agent-status-item">
                      <div className="agent-status-info">
                        <div className={`status-dot ${agent.status}`}></div>
                        <div className="agent-details">
                          <span className="agent-name-compact">{agent.name}</span>
                          <span className="agent-role-compact">{agent.role}</span>
                        </div>
                      </div>
                      {agent.currentTask && (
                        <div className="current-task-compact">
                          <Clock size={10} />
                          <span className="task-text">{agent.currentTask}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          {/* Center - Task Management */}
          <div className="dashboard-center">
            <div className="panel large">
              <div className="panel-header">
                <h2 className="panel-title">Task Pipeline</h2>
                <div className="task-stats">
                  <div className="stat-chip pending">
                    <AlertCircle size={14} />
                    <span>{taskStats.pending} Pending</span>
                  </div>
                  <div className="stat-chip progress">
                    <Clock size={14} />
                    <span>{taskStats.inProgress} Active</span>
                  </div>
                  <div className="stat-chip completed">
                    <CheckCircle size={14} />
                    <span>{taskStats.completed} Done</span>
                  </div>
                  {taskStats.failed > 0 && (
                    <div className="stat-chip failed">
                      <AlertTriangle size={14} />
                      <span>{taskStats.failed} Failed</span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="panel-content">
                <div className="task-pipeline">
                  {tasks.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon">
                        <Activity size={48} strokeWidth={1} />
                      </div>
                      <h3>No tasks in pipeline</h3>
                      <p>Submit a task to get your AI agents working</p>
                    </div>
                  ) : (
                    <div className="task-list">
                      {tasks.map((task, index) => (
                        <div key={task.id} className={`task-card ${task.status}`}>
                          <div className="task-header">
                            <div className="task-number">#{index + 1}</div>
                            <h3 className="task-title">{task.title}</h3>
                            <div className={`task-status ${task.status}`}>
                              {task.status === 'pending' && <AlertCircle size={14} />}
                              {task.status === 'in_progress' && <Clock size={14} />}
                              {task.status === 'completed' && <CheckCircle size={14} />}
                              {task.status === 'paused' && <AlertCircle size={14} />}
                              {task.status === 'failed' && <X size={14} />}
                              <span>{task.status.replace('_', ' ')}</span>
                            </div>
                          </div>
                          {task.description && task.description !== task.title && (
                            <p className="task-description">{task.description}</p>
                          )}
                          <div className="task-meta">
                            <div className="meta-item">
                              <span className="meta-label">ID:</span>
                              <span className="meta-value">{task.id.slice(0, 8)}</span>
                            </div>
                            {task.assignedTo && (
                              <div className="meta-item">
                                <span className="meta-label">Agent:</span>
                                <span className="meta-value">{task.assignedTo}</span>
                              </div>
                            )}
                            {task.projectName && (
                              <div className="meta-item">
                                <span className="meta-label">Project:</span>
                                <span className="meta-value">workspace/{task.projectName}</span>
                              </div>
                            )}
                          </div>
                          
                          {/* プログレスバーを失敗情報の前に統一配置 */}
                          <div className="task-progress">
                            <div className="progress-bar">
                              <div 
                                className="progress-fill"
                                style={{ 
                                  width: task.status === 'completed' ? '100%' : 
                                         task.status === 'in_progress' ? '60%' : 
                                         task.status === 'failed' ? '100%' :
                                         task.status === 'pending' ? '0%' : '30%'
                                }}
                              ></div>
                            </div>
                          </div>

                          {task.status === 'failed' && (
                            <div className="task-failure-info">
                              <div className="failure-header">
                                <div className="failure-icon">
                                  <AlertTriangle size={16} />
                                </div>
                                <div className="failure-summary">
                                  <h4 className="failure-title">失敗</h4>
                                  {task.failureReason && (
                                    <p className="failure-reason">{task.failureReason}</p>
                                  )}
                                </div>
                                <div className="failure-actions-inline">
                                  <button
                                    className="retry-button-small"
                                    onClick={() => handleRetryTask(task.id)}
                                    title="再実行"
                                  >
                                    <RefreshCw size={14} />
                                  </button>
                                </div>
                              </div>
                              
                              {(task.retryCount > 0 || (task.errorHistory && task.errorHistory.length > 0)) && (
                                <div className="failure-details-compact">
                                  <div className="failure-stats-compact">
                                    {task.retryCount > 0 && (
                                      <span className="stat-compact">再試行: {task.retryCount}</span>
                                    )}
                                    {task.errorHistory && task.errorHistory.length > 0 && (
                                      <button 
                                        className="error-history-toggle-compact"
                                        onClick={() => toggleErrorHistory(task.id)}
                                      >
                                        <History size={12} />
                                        履歴 ({task.errorHistory.length})
                                        {expandedErrorHistory.has(task.id) ? 
                                          <ChevronUp size={12} /> : 
                                          <ChevronDown size={12} />
                                        }
                                      </button>
                                    )}
                                  </div>
                                  
                                  {expandedErrorHistory.has(task.id) && task.errorHistory && task.errorHistory.length > 0 && (
                                    <div className="error-history-list-compact">
                                      {task.errorHistory.slice(-3).map((error: any, index: number) => (
                                        <div key={index} className="error-entry-compact">
                                          <div className="error-entry-header-compact">
                                            <span className="error-entry-time-compact">
                                              {new Date(error.timestamp).toLocaleDateString('ja-JP')} {new Date(error.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            <span className="error-entry-attempt-compact">
                                              試行 #{error.retryCount + 1}
                                            </span>
                                          </div>
                                          <div className="error-entry-reason-compact">
                                            {error.reason}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - Terminal */}
          <aside className="dashboard-sidebar right">
            <div className="panel">
              <div className="panel-header">
                <h2 className="panel-title">
                  <Terminal size={16} />
                  Agent Terminals
                </h2>
                <div className="terminal-tabs">
                  <div className="tab-row">
                    {agents.filter(agent => ['president', 'boss1'].includes(agent.id)).map(agent => (
                      <button
                        key={agent.id}
                        className={`terminal-tab ${selectedAgent === agent.id ? 'active' : ''}`}
                        onClick={() => setSelectedAgent(agent.id)}
                        title={agent.name}
                      >
                        <div className={`status-dot ${agent.status}`}></div>
                        {agent.id === 'president' ? 'President' : 'Boss'}
                      </button>
                    ))}
                  </div>
                  <div className="tab-row">
                    {agents.filter(agent => agent.id.startsWith('worker')).map(agent => (
                      <button
                        key={agent.id}
                        className={`terminal-tab ${selectedAgent === agent.id ? 'active' : ''}`}
                        onClick={() => setSelectedAgent(agent.id)}
                        title={agent.name}
                      >
                        <div className={`status-dot ${agent.status}`}></div>
                        {agent.id.replace('worker', 'W')}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="panel-content no-padding">
                <div className="terminal-window">
                  <div className="terminal-header">
                    <div className="terminal-controls">
                      <div className="control-dot red"></div>
                      <div className="control-dot yellow"></div>
                      <div className="control-dot green"></div>
                    </div>
                    <div className="terminal-title">
                      {selectedAgent ? agents.find(a => a.id === selectedAgent)?.name : 'Select Agent'}
                    </div>
                  </div>
                  <div className="terminal-content">
                    <pre className="terminal-output">
{selectedAgent && terminalOutputs[selectedAgent] ? 
  terminalOutputs[selectedAgent] : 
  selectedAgent ? 'Loading terminal output...' : 'Select an agent to view terminal output'}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

export default App;