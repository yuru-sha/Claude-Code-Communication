import { useCallback } from 'react';
import { Terminal, CheckCircle, RefreshCw, Activity, AlertCircle, Shield, ShieldAlert, ShieldOff } from 'lucide-react';
import { SystemHealth, TaskCompletionNotification } from '../../types';

interface DashboardHeaderProps {
  isConnected: boolean;
  connectionError: string | null;
  systemHealth: SystemHealth | null;
  autoRecoveryStatus: string | null;
  taskCompletionNotifications: TaskCompletionNotification[];
  isTaskCompletionMonitoringEnabled: boolean;
  onManualRecovery: () => void;
  onToggleTaskCompletionMonitoring: (enabled: boolean) => void;
}

export const DashboardHeader = ({
  isConnected,
  connectionError,
  systemHealth,
  autoRecoveryStatus,
  taskCompletionNotifications,
  isTaskCompletionMonitoringEnabled,
  onManualRecovery,
  onToggleTaskCompletionMonitoring
}: DashboardHeaderProps) => {
  const handleManualRecovery = useCallback(() => {
    onManualRecovery();
  }, [onManualRecovery]);

  const handleToggleMonitoring = useCallback((enabled: boolean) => {
    onToggleTaskCompletionMonitoring(enabled);
  }, [onToggleTaskCompletionMonitoring]);

  return (
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
                  onClick={() => handleToggleMonitoring(!isTaskCompletionMonitoringEnabled)}
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
            <div className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></div>
            <span>{isConnected ? 'System Online' : 'System Offline'}</span>
          </div>
        </div>
      </div>
    </header>
  );
};