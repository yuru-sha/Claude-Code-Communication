import React, { useCallback } from 'react';
import { 
  Activity, 
  AlertCircle, 
  Clock, 
  CheckCircle, 
  X, 
  AlertTriangle, 
  RefreshCw, 
  History, 
  ChevronDown, 
  ChevronUp, 
  Download, 
  FileText, 
  Database, 
  Globe, 
  Trash2, 
  StopCircle 
} from 'lucide-react';
import { Task } from '../../types';

interface TaskCardProps {
  task: Task;
  isExpandedError: boolean;
  onToggleErrorHistory: (taskId: string) => void;
  onRetryTask: (taskId: string) => void;
  onMarkTaskFailed: (taskId: string, reason: string) => void;
  onDeleteTask: (taskId: string) => void;
  onCancelTask: (taskId: string, taskTitle: string) => void;
  onProjectDownload: (projectName: string) => void;
}

const TaskCard = React.memo<TaskCardProps>(({ 
  task, 
  isExpandedError, 
  onToggleErrorHistory, 
  onRetryTask, 
  onMarkTaskFailed, 
  onDeleteTask, 
  onCancelTask, 
  onProjectDownload 
}) => {
  // Memoized status icon and color
  const statusInfo = React.useMemo(() => {
    switch (task.status) {
      case 'pending':
        return { icon: Clock, color: 'text-yellow-600', bgColor: 'bg-yellow-50', label: '待機中' };
      case 'in_progress':
        return { icon: Activity, color: 'text-blue-600', bgColor: 'bg-blue-50', label: '実行中' };
      case 'completed':
        return { icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-50', label: '完了' };
      case 'failed':
        return { icon: AlertCircle, color: 'text-red-600', bgColor: 'bg-red-50', label: '失敗' };
      case 'paused':
        return { icon: AlertTriangle, color: 'text-orange-600', bgColor: 'bg-orange-50', label: '一時停止' };
      case 'cancelled':
        return { icon: X, color: 'text-gray-600', bgColor: 'bg-gray-50', label: 'キャンセル' };
      default:
        return { icon: Clock, color: 'text-gray-600', bgColor: 'bg-gray-50', label: '不明' };
    }
  }, [task.status]);

  // Memoized callbacks
  const handleToggleErrorHistory = useCallback(() => {
    onToggleErrorHistory(task.id);
  }, [task.id, onToggleErrorHistory]);

  const handleRetryTask = useCallback(() => {
    onRetryTask(task.id);
  }, [task.id, onRetryTask]);

  const handleMarkTaskFailed = useCallback(() => {
    const reason = prompt('失敗理由を入力してください:');
    if (reason) {
      onMarkTaskFailed(task.id, reason);
    }
  }, [task.id, onMarkTaskFailed]);

  const handleDeleteTask = useCallback(() => {
    if (confirm(`タスク「${task.title}」を削除しますか？`)) {
      onDeleteTask(task.id);
    }
  }, [task.id, task.title, onDeleteTask]);

  const handleCancelTask = useCallback(() => {
    onCancelTask(task.id, task.title);
  }, [task.id, task.title, onCancelTask]);

  const handleProjectDownload = useCallback(() => {
    if (task.projectName) {
      onProjectDownload(task.projectName);
    }
  }, [task.projectName, onProjectDownload]);

  const { icon: StatusIcon, color, bgColor, label } = statusInfo;

  return (
    <div className={`p-4 rounded-lg border transition-all duration-200 hover:shadow-md ${bgColor} border-gray-200`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <StatusIcon className={`w-5 h-5 ${color}`} />
            <span className={`text-sm font-medium ${color}`}>{label}</span>
            {task.projectName && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                {task.projectName}
              </span>
            )}
          </div>
          
          <h3 className="font-semibold text-gray-900 mb-1">{task.title}</h3>
          <p className="text-gray-600 text-sm mb-2">{task.description}</p>
          
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>作成: {task.createdAt ? new Date(task.createdAt).toLocaleString() : 'N/A'}</span>
            {task.assignedTo && <span>担当: {task.assignedTo}</span>}
          </div>

          {task.errorHistory && task.errorHistory.length > 0 && (
            <div className="mt-3">
              <button
                onClick={handleToggleErrorHistory}
                className="flex items-center gap-1 text-red-600 hover:text-red-800 text-sm font-medium"
              >
                <History className="w-4 h-4" />
                エラー履歴 ({task.errorHistory.length}件)
                {isExpandedError ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              
              {isExpandedError && (
                <div className="mt-2 space-y-2">
                  {task.errorHistory.map((error, index) => (
                    <div key={index} className="bg-red-50 border border-red-200 rounded p-2">
                      <div className="text-xs text-red-700 font-medium">
                        {new Date(error.timestamp).toLocaleString()}
                      </div>
                      <div className="text-sm text-red-800 mt-1">{error.message}</div>
                      {error.details && (
                        <div className="text-xs text-red-600 mt-1 font-mono bg-red-100 p-1 rounded">
                          {error.details}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1 ml-4">
          {task.status === 'failed' && (
            <button
              onClick={handleRetryTask}
              className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
              title="再実行"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
          
          {(task.status === 'pending' || task.status === 'in_progress') && (
            <>
              <button
                onClick={handleMarkTaskFailed}
                className="p-2 text-orange-600 hover:bg-orange-100 rounded-lg transition-colors"
                title="失敗としてマーク"
              >
                <AlertTriangle className="w-4 h-4" />
              </button>
              <button
                onClick={handleCancelTask}
                className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                title="タスクキャンセル"
              >
                <StopCircle className="w-4 h-4" />
              </button>
            </>
          )}

          {task.projectName && (
            <button
              onClick={handleProjectDownload}
              className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
              title="プロジェクトダウンロード"
            >
              <Download className="w-4 h-4" />
            </button>
          )}

          {(task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') && (
            <button
              onClick={handleDeleteTask}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="タスク削除"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

TaskCard.displayName = 'TaskCard';

export default TaskCard;