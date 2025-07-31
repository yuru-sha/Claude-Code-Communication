import { PrismaClient } from '@prisma/client';
import type { Task as PrismaTask } from '@prisma/client';
// Prisma generated types - using local generated client

// Prisma クライアントのシングルトンインスタンス
const prisma = new PrismaClient();

// アプリケーション用のタスクインターフェース
export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'paused' | 'failed' | 'cancelled';
  assignedTo?: string;
  pausedReason?: string;
  failureReason?: string;
  errorHistory?: string[];
  retryCount?: number;
  lastAttemptAt?: Date;
  projectName?: string;
  deliverables?: string[];
  createdAt: Date;
  updatedAt: Date;
  cancelledAt?: Date;
}

// Usage Limit 状態のインターフェース
export interface UsageLimitState {
  isLimited: boolean;
  pausedAt?: Date;
  nextRetryAt?: Date;
  retryCount: number;
  lastErrorMessage?: string;
}

// エージェントパフォーマンスのインターフェース
export interface AgentPerformance {
  agentId: string;
  tasksCompleted: number;
  averageCompletionTime: number; // in minutes
  efficiency: number; // percentage
  currentTaskStartTime?: Date;
}

// KPI メトリクスのインターフェース
export interface KPIMetrics {
  totalTasks: number;
  inProgressTasks: number;
  completedTasks: number;
  completionRate: number;
  activeAgents: number;
  averageTaskTime: number;
  weeklyGrowth: number;
}

// Prisma タスクをアプリケーションタスクに変換
const mapPrismaTaskToApp = (task: PrismaTask): Task => ({
  id: task.id,
  title: task.title,
  description: task.description,
  status: task.status as Task['status'],
  assignedTo: task.assignedTo || undefined,
  pausedReason: task.pausedReason || undefined,
  failureReason: task.failureReason || undefined,
  errorHistory: task.errorHistory ? JSON.parse(task.errorHistory) : undefined,
  retryCount: task.retryCount || 0,
  lastAttemptAt: task.lastAttemptAt || undefined,
  projectName: task.projectName || undefined,
  deliverables: task.deliverables ? JSON.parse(task.deliverables) : undefined,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
});

// アプリケーションタスクを Prisma タスクに変換
const mapAppTaskToPrisma = (task: Partial<Task>) => ({
  title: task.title!,
  description: task.description!,
  status: task.status!,
  assignedTo: task.assignedTo || null,
  pausedReason: task.pausedReason || null,
  failureReason: task.failureReason || null,
  errorHistory: task.errorHistory ? JSON.stringify(task.errorHistory) : null,
  retryCount: task.retryCount || 0,
  lastAttemptAt: task.lastAttemptAt || null,
  projectName: task.projectName || null,
  deliverables: task.deliverables ? JSON.stringify(task.deliverables) : null,
});

// データベース操作クラス
export class Database {
  private static instance: Database;
  private prisma: PrismaClient;

  private constructor() {
    this.prisma = prisma;
  }

  static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  // データベース接続を初期化
  async initialize(): Promise<void> {
    try {
      await this.prisma.$connect();
      
      // データベース健全性チェック
      const isHealthy = await this.healthCheck();
      if (!isHealthy) {
        throw new Error('Database health check failed');
      }
      
      // テーブルの存在確認とリカバリ処理
      await this.ensureDatabaseIntegrity();
      
      // 空の Agent/Workspace フィールドを修復
      await this.repairEmptyFields();
      
      console.log('🗄️ Database connected and verified successfully');
    } catch (error) {
      console.error('❌ Failed to connect to database:', error);
      
      // データベースリカバリを試行
      const recovered = await this.attemptDatabaseRecovery();
      if (!recovered) {
        throw error;
      }
      
      console.log('🔧 Database recovery completed, retrying connection...');
      await this.prisma.$connect();
      console.log('🗄️ Database connected successfully after recovery');
    }
  }

  // データベース接続を閉じる
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
    console.log('🗄️ Database disconnected');
  }

  // === Task 操作 ===
  
  // すべてのタスクを取得
  async getAllTasks(): Promise<Task[]> {
    const tasks = await this.prisma.task.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return tasks.map(mapPrismaTaskToApp);
  }

  // タスクを ID で取得
  async getTaskById(id: string): Promise<Task | null> {
    const task = await this.prisma.task.findUnique({
      where: { id }
    });
    return task ? mapPrismaTaskToApp(task) : null;
  }

  // ステータス別タスク取得
  async getTasksByStatus(status: Task['status']): Promise<Task[]> {
    const tasks = await this.prisma.task.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' }
    });
    return tasks.map(mapPrismaTaskToApp);
  }

  // 新しいタスクを作成
  async createTask(taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const task = await this.prisma.task.create({
      data: mapAppTaskToPrisma(taskData)
    });
    return mapPrismaTaskToApp(task);
  }

  // タスクを更新
  async updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
    try {
      const task = await this.prisma.task.update({
        where: { id },
        data: {
          ...mapAppTaskToPrisma(updates),
          updatedAt: new Date(),
        }
      });
      return mapPrismaTaskToApp(task);
    } catch (error) {
      console.error(`Failed to update task ${id}:`, error);
      return null;
    }
  }

  // タスクを削除
  async deleteTask(id: string): Promise<boolean> {
    try {
      await this.prisma.task.delete({
        where: { id }
      });
      return true;
    } catch (error) {
      console.error(`Failed to delete task ${id}:`, error);
      return false;
    }
  }

  // タスクを失敗状態にマーク
  async markTaskAsFailed(id: string, failureReason: string): Promise<Task | null> {
    try {
      const existingTask = await this.prisma.task.findUnique({ where: { id } });
      if (!existingTask) return null;

      const errorHistory = existingTask.errorHistory 
        ? JSON.parse(existingTask.errorHistory) 
        : [];
      
      errorHistory.push({
        timestamp: new Date().toISOString(),
        reason: failureReason,
        retryCount: existingTask.retryCount
      });

      const task = await this.prisma.task.update({
        where: { id },
        data: {
          status: 'failed',
          failureReason,
          errorHistory: JSON.stringify(errorHistory),
          updatedAt: new Date(),
        }
      });
      return mapPrismaTaskToApp(task);
    } catch (error) {
      console.error(`Failed to mark task ${id} as failed:`, error);
      return null;
    }
  }

  // タスクを再実行（pending に戻す）
  async retryTask(id: string): Promise<Task | null> {
    try {
      const task = await this.prisma.task.update({
        where: { id },
        data: {
          status: 'pending',
          assignedTo: null,
          failureReason: null,
          retryCount: { increment: 1 },
          lastAttemptAt: null,
          updatedAt: new Date(),
        }
      });
      return mapPrismaTaskToApp(task);
    } catch (error) {
      console.error(`Failed to retry task ${id}:`, error);
      return null;
    }
  }

  // タスクを複製して新しいタスクとして作成
  async cloneTaskAsNew(id: string): Promise<Task | null> {
    try {
      const originalTask = await this.prisma.task.findUnique({ where: { id } });
      if (!originalTask) return null;

      // 元のタスクを完了済みにする
      await this.prisma.task.update({
        where: { id },
        data: {
          status: 'completed',
          updatedAt: new Date(),
        }
      });

      // 新しいタスクとして作成
      const newTask = await this.prisma.task.create({
        data: {
          title: originalTask.title,
          description: originalTask.description,
          status: 'pending',
          retryCount: 0,
        }
      });

      return mapPrismaTaskToApp(newTask);
    } catch (error) {
      console.error(`Failed to clone task ${id}:`, error);
      return null;
    }
  }

  // ステータス別タスク数を取得
  async getTaskCounts() {
    const counts = await this.prisma.task.groupBy({
      by: ['status'],
      _count: {
        status: true
      }
    });

    const result = {
      pending: 0,
      in_progress: 0,
      completed: 0,
      paused: 0,
      failed: 0,
      cancelled: 0
    };

    counts.forEach((count: any) => {
      if (count.status in result) {
        result[count.status as keyof typeof result] = count._count.status;
      }
    });

    return result;
  }

  // === Usage Limit State 操作 ===

  // 現在の Usage Limit 状態を取得（最新のレコード）
  async getUsageLimitState(): Promise<UsageLimitState | null> {
    const state = await this.prisma.usageLimitState.findFirst({
      orderBy: { updatedAt: 'desc' }
    });

    if (!state) return null;

    return {
      isLimited: state.isLimited,
      pausedAt: state.pausedAt || undefined,
      nextRetryAt: state.nextRetryAt || undefined,
      retryCount: state.retryCount,
      lastErrorMessage: state.lastErrorMessage || undefined,
    };
  }

  // Usage Limit 状態を保存
  async saveUsageLimitState(state: UsageLimitState): Promise<void> {
    await this.prisma.usageLimitState.create({
      data: {
        isLimited: state.isLimited,
        pausedAt: state.pausedAt || null,
        nextRetryAt: state.nextRetryAt || null,
        retryCount: state.retryCount,
        lastErrorMessage: state.lastErrorMessage || null,
      }
    });
  }

  // Usage Limit 状態をクリア
  async clearUsageLimitState(): Promise<void> {
    await this.prisma.usageLimitState.deleteMany({});
    console.log('✅ Usage limit state cleared');
  }

  // === App Settings 操作 ===

  // 設定値を取得
  async getSetting(key: string): Promise<string | null> {
    const setting = await this.prisma.appSettings.findUnique({
      where: { key }
    });
    return setting?.value || null;
  }

  // 設定値を保存
  async setSetting(key: string, value: string): Promise<void> {
    await this.prisma.appSettings.upsert({
      where: { key },
      update: { value, updatedAt: new Date() },
      create: { key, value }
    });
  }

  // タスク ID カウンターを取得
  async getTaskIdCounter(): Promise<number> {
    const value = await this.getSetting('task_id_counter');
    return value ? parseInt(value, 10) : 1;
  }

  // タスク ID カウンターを更新
  async setTaskIdCounter(counter: number): Promise<void> {
    await this.setSetting('task_id_counter', counter.toString());
  }

  // タスク ID カウンターをインクリメント
  async incrementTaskIdCounter(): Promise<number> {
    const current = await this.getTaskIdCounter();
    const next = current + 1;
    await this.setTaskIdCounter(next);
    return next;
  }

  // === KPI & Analytics ===

  // KPI メトリクスを計算
  async getKPIMetrics(): Promise<KPIMetrics> {
    const tasks = await this.getAllTasks();
    const totalTasks = tasks.length;
    const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    
    // Count unique active agents
    const activeAgents = new Set(
      tasks
        .filter(t => t.status === 'in_progress' && t.assignedTo)
        .map(t => t.assignedTo)
    ).size;
    
    // Calculate average task completion time
    const completedTasksWithTime = tasks.filter(t => 
      t.status === 'completed' && t.createdAt && t.updatedAt
    );
    
    const averageTaskTime = completedTasksWithTime.length > 0 
      ? completedTasksWithTime.reduce((acc, task) => {
          const timeDiff = new Date(task.updatedAt).getTime() - new Date(task.createdAt).getTime();
          return acc + (timeDiff / (1000 * 60)); // convert to minutes
        }, 0) / completedTasksWithTime.length
      : 0;
    
    // Calculate weekly growth (mock for now, would need historical data)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const recentTasks = tasks.filter(t => new Date(t.createdAt) >= oneWeekAgo);
    const weeklyGrowth = totalTasks > 0 ? Math.round((recentTasks.length / totalTasks) * 100) : 0;
    
    return {
      totalTasks,
      inProgressTasks,
      completedTasks,
      completionRate,
      activeAgents,
      averageTaskTime: Math.round(averageTaskTime),
      weeklyGrowth
    };
  }

  // エージェントパフォーマンスを計算
  async getAgentPerformance(): Promise<AgentPerformance[]> {
    const tasks = await this.getAllTasks();
    const agents = ['president', 'boss1', 'worker1', 'worker2', 'worker3'];
    
    return agents.map(agentId => {
      const agentTasks = tasks.filter(t => t.assignedTo === agentId);
      const completedTasks = agentTasks.filter(t => t.status === 'completed');
      const inProgressTask = agentTasks.find(t => t.status === 'in_progress');
      
      // Calculate average completion time
      const completedTasksWithTime = completedTasks.filter(t => t.createdAt && t.updatedAt);
      const averageCompletionTime = completedTasksWithTime.length > 0
        ? completedTasksWithTime.reduce((acc, task) => {
            const timeDiff = new Date(task.updatedAt).getTime() - new Date(task.createdAt).getTime();
            return acc + (timeDiff / (1000 * 60)); // convert to minutes
          }, 0) / completedTasksWithTime.length
        : 0;
      
      // Calculate efficiency (completed vs total assigned)
      const efficiency = agentTasks.length > 0 
        ? Math.round((completedTasks.length / agentTasks.length) * 100)
        : 100; // Default 100% for agents with no tasks
      
      return {
        agentId,
        tasksCompleted: completedTasks.length,
        averageCompletionTime: Math.round(averageCompletionTime),
        efficiency,
        currentTaskStartTime: inProgressTask ? new Date(inProgressTask.updatedAt) : undefined
      };
    });
  }

  // タスク完了トレンドを取得
  async getTaskCompletionTrend(days: number = 7): Promise<{ date: string; completed: number }[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);
    
    const tasks = await this.prisma.task.findMany({
      where: {
        status: 'completed',
        updatedAt: {
          gte: startDate,
          lte: endDate
        }
      },
      select: {
        updatedAt: true
      }
    });
    
    // Group tasks by date
    const trendData: { [key: string]: number } = {};
    
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(endDate.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      trendData[dateStr] = 0;
    }
    
    tasks.forEach((task: any) => {
      const dateStr = new Date(task.updatedAt).toISOString().split('T')[0];
      if (trendData[dateStr] !== undefined) {
        trendData[dateStr]++;
      }
    });
    
    return Object.entries(trendData)
      .map(([date, completed]) => ({ date, completed }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // === ヘルスチェック ===
  
  // データベースの健全性をチェック
  async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }

  // データベース整合性確認とリカバリ
  async ensureDatabaseIntegrity(): Promise<void> {
    try {
      // テーブルの存在確認
      await this.prisma.task.findFirst();
      await this.prisma.usageLimitState.findFirst();
      await this.prisma.appSettings.findFirst();
      
      console.log('✅ Database integrity verified - all tables accessible');
    } catch (error) {
      console.error('❌ Database integrity check failed:', error);
      throw new Error('Database tables are not accessible');
    }
  }

  // データベースリカバリ処理
  async attemptDatabaseRecovery(): Promise<boolean> {
    try {
      console.log('🔧 Attempting database recovery...');
      
      // 1. Prisma スキーマに基づくマイグレーション実行
      console.log('📝 Running Prisma migrations...');
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      try {
        await execAsync('cd src && npx prisma db push --force-reset');
        console.log('✅ Database schema reset and pushed successfully');
      } catch (migrationError) {
        console.error('❌ Migration failed:', migrationError);
        return false;
      }

      // 2. 基本設定の初期化
      await this.initializeDefaultSettings();
      
      // 3. 接続テスト
      const isHealthy = await this.healthCheck();
      if (!isHealthy) {
        console.error('❌ Database still not healthy after recovery');
        return false;
      }

      console.log('🎉 Database recovery completed successfully');
      return true;
    } catch (error) {
      console.error('❌ Database recovery failed:', error);
      return false;
    }
  }

  // デフォルト設定の初期化
  async initializeDefaultSettings(): Promise<void> {
    try {
      // タスク ID カウンターの初期化
      await this.setSetting('task_id_counter', '1');
      
      // その他の基本設定があれば追加
      console.log('✅ Default settings initialized');
    } catch (error) {
      console.error('❌ Failed to initialize default settings:', error);
    }
  }

  // データベース修復処理（空のフィールドを修復）
  async repairEmptyFields(): Promise<void> {
    try {
      console.log('🔧 Checking for tasks with empty Agent/Workspace fields...');
      
      const tasks = await this.getAllTasks();
      let repairedCount = 0;
      
      for (const task of tasks) {
        let needsUpdate = false;
        const updates: Partial<Task> = {};
        
        // assignedTo が空で、status が in_progress または completed の場合
        if (!task.assignedTo && (task.status === 'in_progress' || task.status === 'completed')) {
          updates.assignedTo = 'president'; // デフォルトで president に割り当て
          needsUpdate = true;
          console.log(`🔧 Repairing assignedTo for task: ${task.title}`);
        }
        
        // projectName が空で、status が in_progress または completed の場合
        if (!task.projectName && (task.status === 'in_progress' || task.status === 'completed')) {
          // タイトルからプロジェクト名を生成
          const projectName = task.title.toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '')
            .substring(0, 30);
          updates.projectName = projectName;
          needsUpdate = true;
          console.log(`🔧 Repairing projectName for task: ${task.title} -> ${projectName}`);
        }
        
        if (needsUpdate) {
          await this.updateTask(task.id, updates);
          repairedCount++;
        }
      }
      
      if (repairedCount > 0) {
        console.log(`✅ Database repair completed: ${repairedCount} tasks repaired`);
      } else {
        console.log('✅ No repairs needed - all tasks have proper Agent/Workspace assignments');
      }
    } catch (error) {
      console.error('❌ Database repair failed:', error);
    }
  }
}

// エクスポート用のインスタンス
export const db = Database.getInstance();