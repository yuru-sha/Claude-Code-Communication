import { PrismaClient } from '../../generated/prisma';
import type { Task as PrismaTask } from '../../generated/prisma';
import { Task, KPIMetrics, AgentPerformance } from '../database';

/**
 * Optimized database service with connection pooling and query optimization
 */
class DatabaseService {
  private static instance: DatabaseService;
  private prisma: PrismaClient;
  private readonly queryCache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private readonly CACHE_TTL = {
    short: 30 * 1000,    // 30 seconds
    medium: 300 * 1000,  // 5 minutes
    long: 3600 * 1000    // 1 hour
  };

  private constructor() {
    this.prisma = new PrismaClient({
      log: ['warn', 'error'],
      datasources: {
        db: {
          url: process.env.DATABASE_URL || 'file:./data/database.db'
        }
      }
    });
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Cache management utilities
   */
  private getCacheKey(operation: string, params: any): string {
    return `${operation}:${JSON.stringify(params)}`;
  }

  private getFromCache<T>(key: string): T | null {
    const cached = this.queryCache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data as T;
    }
    this.queryCache.delete(key);
    return null;
  }

  private setCache<T>(key: string, data: T, ttl: number): void {
    this.queryCache.set(key, { data, timestamp: Date.now(), ttl });
  }

  private clearCacheByPattern(pattern: string): void {
    for (const key of this.queryCache.keys()) {
      if (key.includes(pattern)) {
        this.queryCache.delete(key);
      }
    }
  }

  /**
   * Optimized task queries
   */
  async getAllTasks(options: {
    limit?: number;
    offset?: number;
    status?: string;
    projectName?: string;
    includeErrorHistory?: boolean;
  } = {}): Promise<Task[]> {
    const { limit = 50, offset = 0, status, projectName, includeErrorHistory = false } = options;
    const cacheKey = this.getCacheKey('getAllTasks', options);
    
    // Check cache first
    const cached = this.getFromCache<Task[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const where: any = {};
    if (status) where.status = status;
    if (projectName) where.projectName = projectName;

    const tasks = await this.prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        assignedTo: true,
        pausedReason: true,
        failureReason: true,
        errorHistory: includeErrorHistory,
        retryCount: true,
        lastAttemptAt: true,
        projectName: true,
        deliverables: true,
        createdAt: true,
        updatedAt: true,
        cancelledAt: true
      }
    });

    const result = tasks.map(this.mapPrismaTaskToTask);
    
    // Cache for short duration since tasks change frequently
    this.setCache(cacheKey, result, this.CACHE_TTL.short);
    
    return result;
  }

  async getTaskById(id: string, includeErrorHistory = false): Promise<Task | null> {
    const cacheKey = this.getCacheKey('getTaskById', { id, includeErrorHistory });
    
    const cached = this.getFromCache<Task>(cacheKey);
    if (cached) {
      return cached;
    }

    const task = await this.prisma.task.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        assignedTo: true,
        pausedReason: true,
        failureReason: true,
        errorHistory: includeErrorHistory,
        retryCount: true,
        lastAttemptAt: true,
        projectName: true,
        deliverables: true,
        createdAt: true,
        updatedAt: true,
        cancelledAt: true
      }
    });

    if (!task) return null;

    const result = this.mapPrismaTaskToTask(task);
    this.setCache(cacheKey, result, this.CACHE_TTL.medium);
    
    return result;
  }

  async createTask(taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const task = await this.prisma.task.create({
      data: {
        title: taskData.title,
        description: taskData.description,
        status: taskData.status,
        assignedTo: taskData.assignedTo,
        pausedReason: taskData.pausedReason,
        failureReason: taskData.failureReason,
        errorHistory: taskData.errorHistory,
        retryCount: taskData.retryCount || 0,
        lastAttemptAt: taskData.lastAttemptAt,
        projectName: taskData.projectName,
        deliverables: taskData.deliverables,
        cancelledAt: taskData.cancelledAt
      }
    });

    // Clear related caches
    this.clearCacheByPattern('getAllTasks');
    this.clearCacheByPattern('getKPIMetrics');

    return task.id;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<void> {
    await this.prisma.task.update({
      where: { id },
      data: {
        ...updates,
        updatedAt: new Date()
      }
    });

    // Clear related caches
    this.clearCacheByPattern('getAllTasks');
    this.clearCacheByPattern('getTaskById');
    this.clearCacheByPattern('getKPIMetrics');
  }

  async deleteTask(id: string): Promise<void> {
    await this.prisma.task.delete({
      where: { id }
    });

    // Clear related caches
    this.clearCacheByPattern('getAllTasks');
    this.clearCacheByPattern('getTaskById');
    this.clearCacheByPattern('getKPIMetrics');
  }

  /**
   * Optimized KPI metrics query
   */
  async getKPIMetrics(): Promise<KPIMetrics> {
    const cacheKey = 'getKPIMetrics';
    
    const cached = this.getFromCache<KPIMetrics>(cacheKey);
    if (cached) {
      return cached;
    }

    // Use aggregation for better performance
    const [
      totalTasks,
      inProgressTasks,
      completedTasks,
      activeAgentsCount
    ] = await Promise.all([
      this.prisma.task.count(),
      this.prisma.task.count({ where: { status: 'in_progress' } }),
      this.prisma.task.count({ where: { status: 'completed' } }),
      this.prisma.task.count({
        where: { 
          assignedTo: { not: null },
          status: 'in_progress'
        },
        distinct: ['assignedTo']
      })
    ]);

    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    const result: KPIMetrics = {
      totalTasks,
      inProgressTasks,
      completedTasks,
      completionRate,
      activeAgents: activeAgentsCount
    };

    // Cache for medium duration
    this.setCache(cacheKey, result, this.CACHE_TTL.medium);

    return result;
  }

  /**
   * Optimized agent performance query
   */
  async getAgentPerformance(agentId?: string): Promise<AgentPerformance[]> {
    const cacheKey = this.getCacheKey('getAgentPerformance', { agentId });
    
    const cached = this.getFromCache<AgentPerformance[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const where = agentId ? { assignedTo: agentId } : { assignedTo: { not: null } };

    // Use raw query for complex aggregations
    const agentStats = await this.prisma.$queryRaw`
      SELECT 
        "assignedTo" as "agentId",
        COUNT(*) as "tasksCompleted",
        AVG(
          CASE 
            WHEN "status" = 'completed' AND "createdAt" IS NOT NULL AND "updatedAt" IS NOT NULL
            THEN (julianday("updatedAt") - julianday("createdAt")) * 24 * 60
            ELSE NULL
          END
        ) as "averageCompletionTime"
      FROM "Task"
      WHERE "assignedTo" IS NOT NULL
        AND "status" = 'completed'
        ${agentId ? `AND "assignedTo" = '${agentId}'` : ''}
      GROUP BY "assignedTo"
    ` as any[];

    const result: AgentPerformance[] = agentStats.map(stat => ({
      agentId: stat.agentId,
      tasksCompleted: Number(stat.tasksCompleted),
      averageCompletionTime: Number(stat.averageCompletionTime) || 0,
      efficiency: Math.min(100, Math.max(0, 100 - (Number(stat.averageCompletionTime) || 0) / 10))
    }));

    // Cache for longer duration as performance data changes less frequently
    this.setCache(cacheKey, result, this.CACHE_TTL.long);

    return result;
  }

  /**
   * Batch operations for better performance
   */
  async batchUpdateTasks(updates: Array<{ id: string; data: Partial<Task> }>): Promise<void> {
    const transaction = updates.map(({ id, data }) =>
      this.prisma.task.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date()
        }
      })
    );

    await this.prisma.$transaction(transaction);

    // Clear related caches
    this.clearCacheByPattern('getAllTasks');
    this.clearCacheByPattern('getTaskById');
    this.clearCacheByPattern('getKPIMetrics');
  }

  /**
   * Connection and cleanup utilities
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async clearCache(): Promise<void> {
    this.queryCache.clear();
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }

  /**
   * Helper methods
   */
  private mapPrismaTaskToTask(prismaTask: any): Task {
    return {
      id: prismaTask.id,
      title: prismaTask.title,
      description: prismaTask.description,
      status: prismaTask.status,
      assignedTo: prismaTask.assignedTo,
      pausedReason: prismaTask.pausedReason,
      failureReason: prismaTask.failureReason,
      errorHistory: prismaTask.errorHistory ? JSON.parse(prismaTask.errorHistory) : undefined,
      retryCount: prismaTask.retryCount,
      lastAttemptAt: prismaTask.lastAttemptAt,
      projectName: prismaTask.projectName,
      deliverables: prismaTask.deliverables ? JSON.parse(prismaTask.deliverables) : undefined,
      createdAt: prismaTask.createdAt,
      updatedAt: prismaTask.updatedAt,
      cancelledAt: prismaTask.cancelledAt
    };
  }
}

export default DatabaseService;