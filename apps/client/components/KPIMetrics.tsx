import { useMemo } from 'react';
import { Activity, Clock, CheckCircle, Users, TrendingUp } from 'lucide-react';
import { Task, Agent } from '../../types';

interface KPIMetricsProps {
  tasks: Task[];
  agents: Agent[];
}

export const KPIMetrics = ({ tasks, agents }: KPIMetricsProps) => {
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

  return (
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
                <div 
                  className="progress-fill" 
                  style={{ width: `${taskStats.total > 0 ? (taskStats.inProgress / taskStats.total) * 100 : 0}%` }}
                ></div>
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
  );
};