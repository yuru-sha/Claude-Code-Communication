import { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'paused';
  assignedTo?: string;
  createdAt: Date;
  pausedReason?: string;
}

export const TaskFlow = () => {
  const socket = useSocket();
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    if (!socket.on || !socket.off) return;

    socket.on('task-queue-updated', (update: any) => {
      if (update.tasks) {
        setTasks(update.tasks);
      }
    });

    socket.on('task-queued', (task: Task) => {
      setTasks(prev => [...prev, task]);
    });

    socket.on('task-assigned', (task: Task) => {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t));
    });

    socket.on('task-completed', (task: Task) => {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t));
    });

    socket.on('task-cancelled', (data: any) => {
      setTasks(prev => prev.filter(t => t.id !== data.task.id));
    });

    return () => {
      socket.off?.('task-queue-updated');
      socket.off?.('task-queued');
      socket.off?.('task-assigned');
      socket.off?.('task-completed');
      socket.off?.('task-cancelled');
    };
  }, [socket]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'in_progress': return '🚀';
      case 'completed': return '✅';
      case 'paused': return '⏸️';
      default: return '❓';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'border-amber-500 bg-amber-500/10 text-amber-300';
      case 'in_progress': return 'border-blue-500 bg-blue-500/10 text-blue-300';
      case 'completed': return 'border-emerald-500 bg-emerald-500/10 text-emerald-300';
      case 'paused': return 'border-orange-500 bg-orange-500/10 text-orange-300';
      default: return 'border-gray-500 bg-gray-500/10 text-gray-300';
    }
  };

  const getProgressPercentage = (status: string) => {
    switch (status) {
      case 'pending': return '0%';
      case 'in_progress': return '50%';
      case 'completed': return '100%';
      default: return '0%';
    }
  };

  // FIFO 順（作成日時順）で表示
  const fifoTasks = [...tasks].sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Task Queue (FIFO)</h3>
            <p className="text-sm text-slate-400">All tasks in order of submission</p>
          </div>
        </div>
        <div className="text-sm text-slate-400">
          {tasks.length} total tasks
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-700/50 flex items-center justify-center">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h4 className="text-lg font-medium text-slate-300 mb-2">No Tasks Yet</h4>
          <p className="text-slate-500">Submit a task to get started with the AI team</p>
        </div>
      ) : (
        <div className="overflow-hidden border border-slate-700 rounded-lg">
          <table className="w-full">
            <thead className="bg-slate-800/80">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">#</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Task</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Assigned To</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Created</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {fifoTasks.map((task, index) => (
                <tr key={task.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 text-sm text-slate-300">
                    {index + 1}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center space-x-2">
                      <span className="text-lg">{getStatusIcon(task.status)}</span>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${getStatusColor(task.status)}`}>
                        {task.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-white">{task.title}</div>
                      {task.description && task.description !== task.title && (
                        <div className="text-xs text-slate-400 mt-1 line-clamp-1">{task.description}</div>
                      )}
                      {(task as any).projectName && (
                        <div className="text-xs text-blue-400 mt-1">
                          📁 workspace/{(task as any).projectName}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {task.assignedTo ? (
                      <span className="text-sm text-blue-400 font-medium">{task.assignedTo}</span>
                    ) : (
                      <span className="text-sm text-slate-500">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {new Date(task.createdAt).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center space-x-2">
                      {task.status === 'pending' && (
                        <button
                          onClick={() => socket.emit?.('cancel-task', task.id)}
                          className="text-red-400 hover:text-red-300 transition-colors text-xs"
                          title="Cancel task"
                        >
                          Cancel
                        </button>
                      )}
                      {task.status === 'in_progress' && (
                        <button
                          onClick={() => socket.emit?.('mark-task-completed', task.id)}
                          className="text-emerald-400 hover:text-emerald-300 transition-colors text-xs"
                          title="Mark as completed"
                        >
                          Complete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Queue Statistics */}
      <div className="mt-6 pt-4 border-t border-slate-700">
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-400">
              {tasks.filter(t => t.status === 'pending').length}
            </div>
            <div className="text-xs text-slate-400">Pending</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-400">
              {tasks.filter(t => t.status === 'in_progress').length}
            </div>
            <div className="text-xs text-slate-400">In Progress</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-400">
              {tasks.filter(t => t.status === 'paused').length}
            </div>
            <div className="text-xs text-slate-400">Paused</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-400">
              {tasks.filter(t => t.status === 'completed').length}
            </div>
            <div className="text-xs text-slate-400">Completed</div>
          </div>
        </div>
      </div>
    </div>
  );
};