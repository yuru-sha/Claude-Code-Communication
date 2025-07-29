import { useState, useCallback, useMemo } from 'react';
import { Activity, AlertCircle, Clock, CheckCircle, X, AlertTriangle, RefreshCw, History, ChevronDown, ChevronUp, Search, Filter, RotateCcw, Download, FileText, Database, Globe, Trash2, StopCircle, Pause } from 'lucide-react';
import { Task } from '../../types';
import { downloadProjectAsZip } from '../utils/projectDownloadUtils';

interface TaskPipelineProps {
  tasks: Task[];
  onRetryTask: (taskId: string) => void;
  onMarkTaskFailed: (taskId: string, reason: string) => void;
  onDeleteTask: (taskId: string) => void;
  onCancelTask: (taskId: string) => void;
}

export const TaskPipeline = ({ tasks, onRetryTask, onMarkTaskFailed, onDeleteTask, onCancelTask }: TaskPipelineProps) => {
  const [expandedErrorHistory, setExpandedErrorHistory] = useState<Set<string>>(new Set());
  
  // フィルター状態管理
  const [filters, setFilters] = useState({
    status: 'all' as 'all' | 'pending' | 'in_progress' | 'completed' | 'failed' | 'paused' | 'cancelled',
    project: 'all' as string,
    search: ''
  });
  const [showFilters, setShowFilters] = useState(false);

  // フィルター処理されたタスク
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      // ステータスフィルター
      if (filters.status !== 'all' && task.status !== filters.status) return false;
      
      // プロジェクトフィルター
      if (filters.project !== 'all' && task.projectName !== filters.project) return false;
      
      // 検索フィルター
      if (filters.search && !task.title.toLowerCase().includes(filters.search.toLowerCase()) &&
          !task.description.toLowerCase().includes(filters.search.toLowerCase())) return false;
      
      return true;
    });
  }, [tasks, filters]);

  // フィルター用オプション取得
  const filterOptions = useMemo(() => ({
    projects: [...new Set(tasks.filter(t => t.projectName).map(t => t.projectName))]
  }), [tasks]);

  const taskStats = useMemo(() => ({
    total: filteredTasks.length,
    pending: filteredTasks.filter(t => t.status === 'pending').length,
    inProgress: filteredTasks.filter(t => t.status === 'in_progress').length,
    completed: filteredTasks.filter(t => t.status === 'completed').length,
    paused: filteredTasks.filter(t => t.status === 'paused').length,
    failed: filteredTasks.filter(t => t.status === 'failed').length,
    cancelled: filteredTasks.filter(t => t.status === 'cancelled').length
  }), [filteredTasks]);

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

  // フィルター操作関数
  const updateFilter = useCallback((key: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({
      status: 'all',
      project: 'all',
      search: ''
    });
  }, []);

  const hasActiveFilters = useMemo(() => {
    return filters.status !== 'all' || 
           filters.project !== 'all' || 
           filters.search !== '';
  }, [filters]);

  // プロジェクトダウンロード機能
  const handleProjectDownload = useCallback(async (projectName: string) => {
    try {
      const success = await downloadProjectAsZip(projectName);
      if (!success) {
        alert('プロジェクトのダウンロードに失敗しました');
      }
    } catch (error) {
      console.error('Download error:', error);
      alert('プロジェクトのダウンロードに失敗しました');
    }
  }, []);

  // タスクキャンセル機能
  const handleCancelTaskClick = useCallback((taskId: string, taskTitle: string) => {
    if (confirm(`タスク「${taskTitle}」をキャンセルしますか？\n\n※実行中の作業は中断され、タスクは削除されます。`)) {
      onCancelTask(taskId);
    }
  }, [onCancelTask]);

  // タスク削除機能
  const handleDeleteTaskClick = useCallback((taskId: string, taskTitle: string, projectName?: string) => {
    console.log('🗑️ Delete task clicked:', { taskId, taskTitle, projectName });
    const projectWarning = projectName ? `\n※ workspace/${projectName} ディレクトリも削除されます。` : '';
    const confirmDelete = window.confirm(`タスク「${taskTitle}」を削除しますか？${projectWarning}\n\n この操作は取り消せません。本当に削除してもよろしいですか？`);
    console.log('🗑️ Delete confirmed:', confirmDelete);
    if (confirmDelete) {
      console.log('🗑️ Calling onDeleteTask:', taskId);
      onDeleteTask(taskId);
    }
  }, [onDeleteTask]);

  // 統計チップクリックでフィルタリング
  const handleStatChipClick = useCallback((status: typeof filters.status) => {
    setFilters(prev => ({
      ...prev,
      status: prev.status === status ? 'all' : status
    }));
  }, []);

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'pending': return 'status-pending';
      case 'in_progress': return 'status-progress';
      case 'completed': return 'status-completed';
      case 'paused': return 'status-paused';
      case 'failed': return 'status-failed';
      case 'cancelled': return 'status-cancelled';
      default: return '';
    }
  };

  return (
    <div className="panel large">
      <div className="panel-header">
        <div className="panel-header-top">
          <div className="title-section">
            <h2 className="panel-title">Task Pipeline</h2>
            <div className="task-count">
              <Activity size={14} />
              <span>{taskStats.total}件表示 / {tasks.length}件中</span>
            </div>
          </div>
          <div className="header-actions">
            <button 
              className={`filter-toggle ${showFilters ? 'active' : ''} ${hasActiveFilters ? 'has-filters' : ''}`}
              onClick={() => setShowFilters(!showFilters)}
              title="フィルター"
            >
              <Filter size={16} />
              {hasActiveFilters && <span className="filter-indicator" />}
            </button>
            {hasActiveFilters && (
              <button
                className="reset-filters"
                onClick={resetFilters}
                title="フィルターをリセット"
              >
                <RotateCcw size={16} />
              </button>
            )}
          </div>
        </div>
        
        {showFilters && (
          <div className="filter-panel">
            <div className="filter-row">
              <div className="filter-group">
                <label className="filter-label">検索</label>
                <div className="search-input-container">
                  <Search size={14} className="search-icon" />
                  <input
                    type="text"
                    className="search-input"
                    placeholder="タスクを検索..."
                    value={filters.search}
                    onChange={(e) => updateFilter('search', e.target.value)}
                  />
                </div>
              </div>
              
              <div className="filter-group">
                <label className="filter-label">プロジェクト</label>
                <select
                  className="filter-select"
                  value={filters.project}
                  onChange={(e) => updateFilter('project', e.target.value)}
                >
                  <option value="all">すべて</option>
                  {filterOptions.projects.map(project => (
                    <option key={project} value={project}>{project}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
        
        <div className="task-stats">
          <button 
            className={`stat-chip pending clickable ${filters.status === 'pending' ? 'active' : ''}`}
            onClick={() => handleStatChipClick('pending')}
            title="待機中のタスクでフィルター"
          >
            <AlertCircle size={14} />
            <span>{taskStats.pending} Pending</span>
          </button>
          <button 
            className={`stat-chip progress clickable ${filters.status === 'in_progress' ? 'active' : ''}`}
            onClick={() => handleStatChipClick('in_progress')}
            title="実行中のタスクでフィルター"
          >
            <Clock size={14} />
            <span>{taskStats.inProgress} In Progress</span>
          </button>
          <button 
            className={`stat-chip completed clickable ${filters.status === 'completed' ? 'active' : ''}`}
            onClick={() => handleStatChipClick('completed')}
            title="完了タスクでフィルター"
          >
            <CheckCircle size={14} />
            <span>{taskStats.completed} Completed</span>
          </button>
          <button 
            className={`stat-chip failed clickable ${filters.status === 'failed' ? 'active' : ''}`}
            onClick={() => handleStatChipClick('failed')}
            title="失敗タスクでフィルター"
            style={{ opacity: taskStats.failed === 0 ? 0.5 : 1 }}
          >
            <AlertTriangle size={14} />
            <span>{taskStats.failed} Failed</span>
          </button>
          <button 
            className={`stat-chip paused clickable ${filters.status === 'paused' ? 'active' : ''}`}
            onClick={() => handleStatChipClick('paused')}
            title="一時停止中のタスクでフィルター (Usage Limit)"
            style={{ opacity: taskStats.paused === 0 ? 0.5 : 1 }}
          >
            <Pause size={14} />
            <span>{taskStats.paused} Paused</span>
          </button>
          <button 
            className={`stat-chip cancelled clickable ${filters.status === 'cancelled' ? 'active' : ''}`}
            onClick={() => handleStatChipClick('cancelled')}
            title="キャンセル済みタスクでフィルター"
            style={{ opacity: taskStats.cancelled === 0 ? 0.5 : 1 }}
          >
            <StopCircle size={14} />
            <span>{taskStats.cancelled} Cancelled</span>
          </button>
        </div>
      </div>
      
      <div className="panel-content">
        <div className="task-pipeline">
          {filteredTasks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <Activity size={48} strokeWidth={1} />
              </div>
              {tasks.length === 0 ? (
                <>
                  <h3>No tasks in pipeline</h3>
                  <p>Submit a task to get your AI agents working</p>
                </>
              ) : (
                <>
                  <h3>No tasks match the current filters</h3>
                  <p>Try adjusting your filters or search terms</p>
                </>
              )}
            </div>
          ) : (
            <div className="task-list">
              {filteredTasks.map((task, index) => (
                <div key={task.id} className={`task-card ${task.status}`}>
                  <div className="task-header">
                    <div className="task-number">#{index + 1}</div>
                    <h3 className="task-title">{task.title}</h3>
                    <div className="task-header-actions">
                      <div className={`task-status ${task.status}`}>
                        {task.status === 'pending' && <AlertCircle size={14} />}
                        {task.status === 'in_progress' && <Clock size={14} />}
                        {task.status === 'completed' && <CheckCircle size={14} />}
                        {task.status === 'paused' && <Pause size={14} />}
                        {task.status === 'failed' && <AlertTriangle size={14} />}
                        {task.status === 'cancelled' && <StopCircle size={14} />}
                        <span style={{ textTransform: 'capitalize' }}>{task.status.replace('_', ' ')}</span>
                      </div>
                      {(task.status === 'pending' || task.status === 'in_progress') && (
                        <button
                          className="task-cancel-btn"
                          onClick={() => handleCancelTaskClick(task.id, task.title)}
                          title="タスクをキャンセル"
                        >
                          <StopCircle size={14} />
                        </button>
                      )}
                      <button
                        className={`task-delete-btn ${task.status === 'in_progress' || task.status === 'paused' ? 'disabled' : ''}`}
                        onClick={() => handleDeleteTaskClick(task.id, task.title, task.projectName)}
                        disabled={task.status === 'in_progress' || task.status === 'paused'}
                        title={
                          task.status === 'in_progress' || task.status === 'paused'
                            ? `実行中または一時停止中のタスクは削除できません (現在: ${task.status})`
                            : 'タスクを削除'
                        }
                      >
                        <Trash2 size={14} />
                      </button>
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
                        {(task.status === 'completed' || task.status === 'cancelled') && (
                          <button
                            className="download-project-btn"
                            onClick={() => handleProjectDownload(task.projectName!)}
                            title="プロジェクトをダウンロード（途中まで作成された成果物）"
                          >
                            <Download size={14} />
                          </button>
                        )}
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
                                 task.status === 'paused' ? '50%' :
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