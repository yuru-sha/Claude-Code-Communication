import { useState, useCallback, useMemo } from 'react';
import { Activity, AlertCircle, Clock, CheckCircle, X, AlertTriangle, RefreshCw, History, ChevronDown, ChevronUp } from 'lucide-react';
import { Task } from '../../types';

interface TaskPipelineProps {
  tasks: Task[];
  onRetryTask: (taskId: string) => void;
  onMarkTaskFailed: (taskId: string, reason: string) => void;
}

export const TaskPipeline = ({ tasks, onRetryTask, onMarkTaskFailed }: TaskPipelineProps) => {
  const [expandedErrorHistory, setExpandedErrorHistory] = useState<Set<string>>(new Set());

  const taskStats = useMemo(() => ({
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    paused: tasks.filter(t => t.status === 'paused').length,
    failed: tasks.filter(t => t.status === 'failed').length
  }), [tasks]);

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
                  
                  {/* プログレスバー */}
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
                            onClick={() => onRetryTask(task.id)}
                            title="再実行"
                          >
                            <RefreshCw size={14} />
                          </button>
                        </div>
                      </div>
                      
                      {(task.retryCount && task.retryCount > 0 || (task.errorHistory && task.errorHistory.length > 0)) && (
                        <div className="failure-details-compact">
                          <div className="failure-stats-compact">
                            {task.retryCount && task.retryCount > 0 && (
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
  );
};