import { useState, useEffect } from 'react';
import { TabbedTerminals } from './TabbedTerminals';
import { useSocket } from '../hooks/useSocket';

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  assignedTo?: string;
  createdAt: Date;
}

interface TaskQueueUpdate {
  pending: number;
  inProgress: number;
  completed: number;
  tasks?: Task[];
}

interface Agent {
  id: string;
  name: string;
  role: 'president' | 'manager' | 'worker';
  status: 'idle' | 'working' | 'offline';
  currentTask?: string;
}

interface DashboardProps {
  terminalsOnly?: boolean;
}

export const Dashboard = ({ terminalsOnly = false }: DashboardProps) => {
  const socket = useSocket();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [queueStats, setQueueStats] = useState<TaskQueueUpdate>({
    pending: 0,
    inProgress: 0,
    completed: 0
  });
  const [agents, setAgents] = useState<Agent[]>([
    { id: 'president', name: 'President', role: 'president', status: 'idle' },
    { id: 'boss1', name: 'Boss1', role: 'manager', status: 'idle' },
    { id: 'worker1', name: 'Worker 1', role: 'worker', status: 'idle' },
    { id: 'worker2', name: 'Worker 2', role: 'worker', status: 'idle' },
    { id: 'worker3', name: 'Worker 3', role: 'worker', status: 'idle' }
  ]);
  const [isEmergencyStop, setIsEmergencyStop] = useState(false);

  useEffect(() => {
    if (!socket) return;

    // タスクキューの更新を受信
    socket.on('task-queue-updated', (update: TaskQueueUpdate) => {
      setQueueStats(update);
      if (update.tasks) {
        setTasks(update.tasks);
      }
    });

    // 新しいタスクがキューに追加された時
    socket.on('task-queued', (task: Task) => {
      setTasks(prev => [...prev, task]);
      setQueueStats(prev => ({ ...prev, pending: prev.pending + 1 }));
    });

    // タスクが割り当てられた時
    socket.on('task-assigned', (task: Task) => {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t));
      setAgents(prev => prev.map(agent => 
        agent.id === task.assignedTo 
          ? { ...agent, status: 'working', currentTask: task.title }
          : agent
      ));
    });

    // タスクが完了した時
    socket.on('task-completed', (task: Task) => {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t));
      setAgents(prev => prev.map(agent => 
        agent.id === task.assignedTo 
          ? { ...agent, status: 'idle', currentTask: undefined }
          : agent
      ));
    });

    // システムリセット通知
    socket.on('system-reset', (data) => {
      console.log('System reset:', data.message);
      setAgents(prev => prev.map(agent => ({ ...agent, status: 'idle', currentTask: undefined })));
    });

    // システムエラー通知
    socket.on('system-error', (data) => {
      console.error('System error:', data.message);
    });

    // 緊急停止完了通知
    socket.on('emergency-stop-completed', (data) => {
      console.log('Emergency stop completed:', data.message);
      setAgents(prev => prev.map(agent => ({ ...agent, status: 'idle', currentTask: undefined })));
    });

    // タスクキャンセル通知
    socket.on('task-cancelled', (data) => {
      console.log('Task cancelled:', data.message);
    });

    // タスク削除通知
    socket.on('task-deleted', (data: { taskId: string; projectName?: string }) => {
      setTasks(prev => prev.filter(t => t.id !== data.taskId));
      setQueueStats(prev => ({ 
        ...prev, 
        pending: Math.max(0, prev.pending - 1) 
      }));
      console.log('Task deleted:', data.taskId);
    });

    return () => {
      socket.off('task-queue-updated');
      socket.off('task-queued');
      socket.off('task-assigned');
      socket.off('task-completed');
      socket.off('system-reset');
      socket.off('system-error');
      socket.off('emergency-stop-completed');
      socket.off('task-cancelled');
      socket.off('task-deleted');
    };
  }, [socket]);

  // 緊急停止機能
  const handleEmergencyStop = () => {
    if (socket && !isEmergencyStop) {
      setIsEmergencyStop(true);
      socket.emit('emergency-stop');
      setTimeout(() => setIsEmergencyStop(false), 3000);
    }
  };

  // タスクを手動で完了マーク
  const handleMarkTaskCompleted = (taskId: string) => {
    if (socket) {
      socket.emit('mark-task-completed', taskId);
    }
  };

  // 保留中のタスクをキャンセル
  const handleCancelTask = (taskId: string) => {
    if (socket) {
      socket.emit('cancel-task', taskId);
      // サーバーからの削除確認を待つため、ここでの UI 更新は削除
      // 削除は 'task-deleted' イベントで処理される
    }
  };

  const getStatusColor = (status: Agent['status']) => {
    switch (status) {
      case 'working': return 'bg-green-500';
      case 'idle': return 'bg-yellow-500';
      case 'offline': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  // ターミナルのみ表示の場合
  if (terminalsOnly) {
    return <TabbedTerminals agents={agents} />;
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Control Panel */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-red-500/10 to-orange-500/10 p-6 border-b border-slate-700/50">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-orange-600 rounded-lg flex items-center justify-center">
              <span className="text-lg">🚨</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Control Panel</h2>
              <p className="text-slate-400 text-sm">Emergency controls and task management</p>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          <div className="flex flex-wrap gap-4">
            <button
              onClick={handleEmergencyStop}
              disabled={isEmergencyStop}
              className={`group px-6 py-3 rounded-xl font-semibold transition-all duration-200 transform ${
                isEmergencyStop
                  ? 'bg-red-800 text-red-300 cursor-not-allowed'
                  : 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white shadow-lg shadow-red-500/25 hover:shadow-red-500/40 hover:scale-105 active:scale-95'
              }`}
            >
              {isEmergencyStop ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-red-300/30 border-t-red-300 rounded-full animate-spin"></div>
                  <span>Stopping...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <span>🛑</span>
                  <span>Emergency Stop</span>
                </div>
              )}
            </button>

            {inProgressTasks.length > 0 && (
              <div className="bg-slate-900/30 border border-slate-700/30 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-slate-300 mb-3">Active Tasks</h4>
                <div className="space-y-2">
                  {inProgressTasks.map(task => (
                    <div key={task.id} className="flex items-center justify-between bg-slate-800/50 p-3 rounded-lg">
                      <div className="flex-1">
                        <div className="text-sm text-slate-200">{task.title}</div>
                        {task.assignedTo && (
                          <div className="text-xs text-blue-400">{task.assignedTo}</div>
                        )}
                      </div>
                      <button
                        onClick={() => handleMarkTaskCompleted(task.id)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
                      >
                        ✓ Complete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pendingTasks.length > 0 && (
              <div className="bg-slate-900/30 border border-slate-700/30 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-slate-300 mb-3">Pending Tasks</h4>
                <div className="space-y-2">
                  {pendingTasks.slice(0, 3).map(task => (
                    <div key={task.id} className="flex items-center justify-between bg-slate-800/50 p-3 rounded-lg">
                      <div className="flex-1">
                        <div className="text-sm text-slate-200">{task.title}</div>
                      </div>
                      <button
                        onClick={() => handleCancelTask(task.id)}
                        className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
                      >
                        ✕ Cancel
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Task Queue Status */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 p-6 border-b border-slate-700/50">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center">
              <span className="text-lg">📋</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Task Queue (FIFO)</h2>
              <p className="text-slate-400 text-sm">Monitor task processing pipeline</p>
            </div>
          </div>
        </div>
        
        <div className="p-4 md:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/10 border border-amber-500/20 p-6 rounded-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-amber-400">Pending</h3>
                <div className="bg-amber-500/20 text-amber-300 px-3 py-1 rounded-full text-sm font-bold">
                  {queueStats.pending}
                </div>
              </div>
              <div className="space-y-3">
                {pendingTasks.slice(0, 3).map((task, index) => (
                  <div key={task.id} className="flex items-center space-x-3 p-3 bg-slate-900/30 rounded-lg border border-slate-700/30">
                    <div className="bg-amber-500 text-slate-900 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </div>
                    <div className="flex-1 text-sm text-slate-300 truncate">
                      {task.title}
                    </div>
                  </div>
                ))}
                {pendingTasks.length > 3 && (
                  <div className="text-xs text-slate-400 text-center py-2">
                    +{pendingTasks.length - 3} more tasks
                  </div>
                )}
                {pendingTasks.length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    <div className="text-3xl mb-2">✨</div>
                    <div>No pending tasks</div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/10 border border-blue-500/20 p-6 rounded-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-blue-400">In Progress</h3>
                <div className="bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full text-sm font-bold">
                  {queueStats.inProgress}
                </div>
              </div>
              <div className="space-y-3">
                {inProgressTasks.map(task => (
                  <div key={task.id} className="p-3 bg-slate-900/30 rounded-lg border border-slate-700/30">
                    <div className="text-sm text-slate-300 mb-1">{task.title}</div>
                    {task.assignedTo && (
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                        <span className="text-xs text-blue-400 font-medium">{task.assignedTo}</span>
                      </div>
                    )}
                  </div>
                ))}
                {inProgressTasks.length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    <div className="text-3xl mb-2">💤</div>
                    <div>No active tasks</div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/10 border border-emerald-500/20 p-6 rounded-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-emerald-400">Completed</h3>
                <div className="bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full text-sm font-bold">
                  {queueStats.completed}
                </div>
              </div>
              <div className="space-y-3">
                {completedTasks.slice(-3).map(task => (
                  <div key={task.id} className="flex items-center space-x-3 p-3 bg-slate-900/30 rounded-lg border border-slate-700/30">
                    <div className="w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                      <span className="text-slate-900 text-xs">✓</span>
                    </div>
                    <div className="flex-1 text-sm text-slate-300 truncate">
                      {task.title}
                    </div>
                  </div>
                ))}
                {completedTasks.length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    <div className="text-3xl mb-2">🎯</div>
                    <div>No completed tasks</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Agent Status */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 p-6 border-b border-slate-700/50">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
              <span className="text-lg">👥</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">AI Team Status</h2>
              <p className="text-slate-400 text-sm">Monitor agent activities and assignments</p>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {agents.map(agent => {
              const getRoleIcon = (role: string) => {
                switch (role) {
                  case 'president': return '👑';
                  case 'manager': return '📊';
                  case 'worker': return '⚡';
                  default: return '🤖';
                }
              };
              
              const getRoleColor = (role: string) => {
                switch (role) {
                  case 'president': return 'from-yellow-500 to-amber-600';
                  case 'manager': return 'from-blue-500 to-indigo-600';
                  case 'worker': return 'from-green-500 to-emerald-600';
                  default: return 'from-gray-500 to-gray-600';
                }
              };

              return (
                <div key={agent.id} className="bg-slate-900/30 border border-slate-700/30 p-4 rounded-xl hover:border-slate-600/50 transition-all duration-200">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className={`w-10 h-10 bg-gradient-to-br ${getRoleColor(agent.role)} rounded-lg flex items-center justify-center text-lg`}>
                      {getRoleIcon(agent.role)}
                    </div>
                    <div className="flex-1">
                      <div className="text-white font-semibold">{agent.name}</div>
                      <div className="text-slate-400 text-xs capitalize">{agent.role}</div>
                    </div>
                    <div className={`w-3 h-3 rounded-full ${getStatusColor(agent.status)} ${agent.status === 'working' ? 'animate-pulse' : ''}`}></div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Status</span>
                      <span className={`text-xs font-medium capitalize ${
                        agent.status === 'working' ? 'text-emerald-400' : 
                        agent.status === 'idle' ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {agent.status}
                      </span>
                    </div>
                    
                    {agent.currentTask && (
                      <div className="pt-2 border-t border-slate-700/50">
                        <div className="text-xs text-slate-500 mb-1">Current Task</div>
                        <div className="text-xs text-blue-400 leading-relaxed">
                          {agent.currentTask}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
};