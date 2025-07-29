// エージェントの役割定義
export type AgentRole = 'president' | 'manager' | 'worker' | 'specialist';

// エージェント状態
export type AgentStatusType = 'idle' | 'working' | 'offline' | 'error';

// エージェント活動タイプ
export type ActivityType = 'coding' | 'file_operation' | 'command_execution' | 'thinking' | 'idle';

// 拡張されたエージェント状態インターフェース
export interface AgentStatus {
  id: string;
  name: string;
  status: AgentStatusType;
  currentActivity?: string;
  lastActivity: Date;
  terminalOutput?: string;
  workingOnFile?: string;
  executingCommand?: string;
}

// エージェント活動パターン
export interface AgentActivityPattern {
  pattern: RegExp;
  activityType: ActivityType;
  priority: number;
}

// 活動情報
export interface ActivityInfo {
  activityType: ActivityType;
  description: string;
  timestamp: Date;
  fileName?: string;
  command?: string;
}

// エージェント情報（後方互換性のため保持）
export interface Agent {
  id: string;
  name: string;
  role: string;
  status: AgentStatusType;
  currentTask?: string;
  tasksCompleted?: number;
  efficiency?: number;
}

// タスクの優先度
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

// タスクの状態
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'paused' | 'failed' | 'cancelled';

// タスク情報
export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignedTo?: string;
  projectName?: string;
  failureReason?: string;
  errorHistory?: string[];
  retryCount?: number;
  createdAt: Date;
  updatedAt?: Date;
  cancelledAt?: Date;
}

// システムヘルス
export interface SystemHealth {
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

// 使用制限状態
export interface UsageLimitState {
  isLimited: boolean;
  pausedAt?: Date;
  nextRetryAt?: Date;
  retryCount: number;
  lastErrorMessage?: string;
}

// タスク完了通知
export interface TaskCompletionNotification {
  id: string;
  taskTitle: string;
  detectedBy: string;
  timestamp: Date;
}

// プロジェクト情報
export interface Project {
  id: string;
  name: string;
  description: string;
  status: 'planning' | 'active' | 'paused' | 'completed' | 'cancelled';
  tasks: Task[];
  agents: Agent[];
  createdAt: Date;
  deadline?: Date;
  client?: string;
}

// Socket.IO イベント定義
export interface ServerToClientEvents {
  'task-queued': (task: Task) => void;
  'task-assigned': (task: Task, agent: Agent) => void;
  'task-completed': (task: Task) => void;
  'agent-status-updated': (agentStatus: AgentStatus) => void;
  'agent-activity-detected': (activityInfo: ActivityInfo & { agentId: string }) => void;
  'agent-detailed-status': (detailedStatus: AgentStatus & { activityHistory?: ActivityInfo[] }) => void;
  'terminal-output': (agentId: string, output: string) => void;
  'project-updated': (project: Project) => void;
}

export interface ClientToServerEvents {
  'request-task': (taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'status'>) => void;
  'update-agent-status': (agentId: string, status: AgentStatusType) => void;
  'send-terminal-input': (agentId: string, input: string) => void;
  'request-project-status': () => void;
}

// ターミナル関連
export interface TerminalMessage {
  agentId: string;
  timestamp: Date;
  content: string;
  type: 'input' | 'output' | 'error' | 'info';
}

// ダッシュボード状態
export interface DashboardState {
  activeProject?: Project;
  agents: Agent[];
  recentTasks: Task[];
  systemHealth: 'healthy' | 'warning' | 'error';
  performance: {
    averageTaskTime: number;
    successRate: number;
    activeAgents: number;
  };
}

// エージェント専門分野定義
export const AGENT_SPECIALTIES = {
  frontend: ['React', 'Vue', 'Angular', 'CSS', 'JavaScript', 'TypeScript'],
  backend: ['Node.js', 'Python', 'Java', 'API', 'Database', 'Express'],
  devops: ['Docker', 'AWS', 'CI/CD', 'Kubernetes', 'Infrastructure'],
  mobile: ['React Native', 'Flutter', 'iOS', 'Android'],
  data: ['Python', 'SQL', 'Analytics', 'Machine Learning'],
  design: ['UI/UX', 'Figma', 'Prototyping'],
  qa: ['Testing', 'Automation', 'Quality Assurance']
} as const;

// 活動検知設定定数
export const ACTIVITY_DETECTION_CONFIG = {
  ACTIVE_CHECK_INTERVAL: 10000,    // 10 秒（アクティブ時）
  IDLE_CHECK_INTERVAL: 30000,      // 30 秒（アイドル時）
  IDLE_TIMEOUT: 300000,            // 5 分（アイドル判定）
  OUTPUT_BUFFER_SIZE: 200,         // 最新 200 行を監視
  ACTIVITY_DEBOUNCE: 2000          // 2 秒のデバウンス
} as const;

// Note: Activity patterns are now managed by ActivityPatternService
// See src/backend/services/activityPatterns.ts for comprehensive pattern definitions

// フォーム関連
export interface TaskRequest {
  title: string;
  description: string;
  priority: TaskPriority;
  requiredSkills: string[];
  deadline?: Date;
}