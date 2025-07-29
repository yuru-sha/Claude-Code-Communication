import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSocket } from './hooks/useSocket';
import { Activity, Users, CheckCircle, Clock, AlertCircle, Send, BarChart3, TrendingUp, X, RefreshCw, AlertTriangle, History, ChevronDown, ChevronUp } from 'lucide-react';
import { TaskPipeline } from './components/TaskPipeline';
import { DashboardHeader } from './components/DashboardHeader';
import { Task, Agent, SystemHealth } from '../types';
import './styles/dashboard.css';

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

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
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

    // エージェント状態のリアルタイム更新（拡張版）
    socket.on('agent-status-updated', (agentUpdate: any) => {
      setAgents(prev => prev.map(agent => 
        agent.id === agentUpdate.id 
          ? { 
              ...agent, 
              status: agentUpdate.status,
              currentTask: agentUpdate.currentActivity || agentUpdate.currentTask || undefined,
              // 拡張フィールドを追加
              workingOnFile: agentUpdate.workingOnFile,
              executingCommand: agentUpdate.executingCommand,
              lastActivity: agentUpdate.lastActivity
            } 
          : agent
      ));
    });

    // 詳細な活動検知イベント
    socket.on('agent-activity-detected', (activityInfo: any) => {
      // 活動検知の詳細情報を状態に反映（オプション）
      setAgents(prev => prev.map(agent => 
        agent.id === activityInfo.agentId 
          ? { 
              ...agent,
              lastActivityType: activityInfo.activityType,
              lastActivityDescription: activityInfo.description
            } 
          : agent
      ));
    });

    // 詳細なエージェント状態イベント
    socket.on('agent-detailed-status', (detailedStatus: any) => {
      // 詳細状態情報を必要に応じて処理
      // 現在は基本的な状態更新のみ実装
    });

    socket.on('task-retried', (task: Task) => {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t));
    });

    socket.on('task-deleted', (data: any) => {
      const taskId = typeof data === 'string' ? data : data.taskId;
      setTasks(prevTasks => {
        const newTasks = prevTasks.filter(t => t.id !== taskId);
        return newTasks;
      });
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
    });

    socket.on('auto-recovery-status', (data: any) => {
      setAutoRecoveryStatus(`✅ 自動復旧状況: ${data.message}`);
      setAutoRecoveryStatusClear(5000);
    });

    socket.on('auto-recovery-failed', (data: any) => {
      setAutoRecoveryStatus(`❌ 自動復旧失敗: ${data.message}`);
      setAutoRecoveryStatusClear(10000);
    });

    socket.on('task-completion-detected', (data: any) => {
      
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
    });

    socket.on('session-reset-completed', (data: any) => {
      setAutoRecoveryStatus(`✅ セッションリセット完了: ${data.message}`);
      
      // 5 秒後にステータスをクリア
      setTimeout(() => {
        setAutoRecoveryStatus(null);
      }, 5000);
    });

    socket.on('session-reset-failed', (data: any) => {
      setAutoRecoveryStatus(`❌ セッションリセット失敗: ${data.message}`);
      
      // 10 秒後にステータスをクリア
      setTimeout(() => {
        setAutoRecoveryStatus(null);
      }, 10000);
    });



    socket.on('task-delete-rejected', (data: any) => {
      alert(`タスクの削除が拒否されました：\n\n${data.message}\n\n タスク: ${data.taskTitle}\n 現在のステータス: ${data.currentStatus}`);
    });

    socket.on('resume-paused-result', (data: any) => {
      if (data.success) {
        setAutoRecoveryStatus(`✅ ${data.resumedCount}個の Paused タスクを再開しました`);
      } else {
        setAutoRecoveryStatus(`❌ Paused タスク再開に失敗: ${data.message}`);
      }
    });

    socket.on('paused-tasks-resumed', (data: any) => {
      setAutoRecoveryStatus(`▶️ ${data.message}`);
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
      socket.off('agent-activity-detected');
      socket.off('agent-detailed-status');
      socket.off('auto-recovery-performed');
      socket.off('auto-recovery-status');
      socket.off('auto-recovery-failed');
      socket.off('task-completion-detected');
      socket.off('task-completion-monitoring-status');
      socket.off('session-reset-completed');
      socket.off('session-reset-failed');
      socket.off('task-delete-rejected');
      socket.off('resume-paused-result');
      socket.off('paused-tasks-resumed');
    };
  }, [socket]);


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

  const handleCancelTask = useCallback((taskId: string) => {
    if (socket) {
      socket.emit('cancel-task', taskId);
    }
  }, [socket]);

  const handleDeleteTask = useCallback((taskId: string) => {
    if (socket) {
      socket.emit('delete-task', taskId);
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

  const handleSessionReset = useCallback(() => {
    if (socket) {
      socket.emit('session-reset');
      setAutoRecoveryStatus('🔄 開発環境リセット中...');
    }
  }, [socket]);

  const handleResumePausedTasks = useCallback(() => {
    if (socket) {
      socket.emit('resume-paused-tasks');
      setAutoRecoveryStatus('▶️ Paused タスクを再開中...');
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
      <DashboardHeader
        isConnected={socket?.connected || false}
        connectionError={connectionError}
        systemHealth={systemHealth}
        autoRecoveryStatus={autoRecoveryStatus}
        taskCompletionNotifications={taskCompletionNotifications}
        isTaskCompletionMonitoringEnabled={isTaskCompletionMonitoringEnabled}
        onManualRecovery={handleManualRecovery}
        onToggleTaskCompletionMonitoring={handleToggleTaskCompletionMonitoring}
        onSessionReset={handleSessionReset}
      />

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
            <TaskPipeline 
              tasks={tasks}
              onRetryTask={handleRetryTask}
              onMarkTaskFailed={handleMarkTaskFailed}
              onDeleteTask={handleDeleteTask}
              onCancelTask={handleCancelTask}
              onResumePausedTasks={handleResumePausedTasks}
            />
          </div>

        </div>
      </main>
    </div>
  );
}

export default App;