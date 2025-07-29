import { Redis } from '@upstash/redis';

/**
 * Redis cache service for performance optimization
 * Falls back to in-memory cache if Redis is not available
 */
class CacheService {
  private static instance: CacheService;
  private redis: Redis | null = null;
  private memoryCache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private isRedisAvailable = false;

  private constructor() {
    this.initializeRedis();
  }

  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  private async initializeRedis(): Promise<void> {
    try {
      if (process.env.REDIS_URL && process.env.REDIS_TOKEN) {
        this.redis = new Redis({
          url: process.env.REDIS_URL,
          token: process.env.REDIS_TOKEN,
        });

        // Test Redis connection
        await this.redis.ping();
        this.isRedisAvailable = true;
        console.log('✅ Redis cache service initialized successfully');
      } else {
        console.log('⚠️  Redis credentials not found, using in-memory cache fallback');
      }
    } catch (error) {
      console.error('❌ Redis initialization failed, falling back to memory cache:', error);
      this.redis = null;
      this.isRedisAvailable = false;
    }
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      if (this.isRedisAvailable && this.redis) {
        const value = await this.redis.get(key);
        if (value !== null) {
          return typeof value === 'string' ? JSON.parse(value) : value;
        }
      }
    } catch (error) {
      console.warn('Redis get failed, falling back to memory cache:', error);
    }

    // Fallback to memory cache
    const cached = this.memoryCache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data as T;
    }

    // Clean up expired memory cache entry
    if (cached) {
      this.memoryCache.delete(key);
    }

    return null;
  }

  /**
   * Set value in cache with TTL
   */
  async set<T>(key: string, value: T, ttlSeconds: number = 300): Promise<void> {
    try {
      if (this.isRedisAvailable && this.redis) {
        const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
        await this.redis.setex(key, ttlSeconds, serializedValue);
        return;
      }
    } catch (error) {
      console.warn('Redis set failed, falling back to memory cache:', error);
    }

    // Fallback to memory cache
    this.memoryCache.set(key, {
      data: value,
      timestamp: Date.now(),
      ttl: ttlSeconds * 1000
    });

    // Clean up memory cache periodically
    this.cleanupMemoryCache();
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<void> {
    try {
      if (this.isRedisAvailable && this.redis) {
        await this.redis.del(key);
      }
    } catch (error) {
      console.warn('Redis delete failed:', error);
    }

    // Also remove from memory cache
    this.memoryCache.delete(key);
  }

  /**
   * Delete multiple keys matching pattern
   */
  async deletePattern(pattern: string): Promise<void> {
    try {
      if (this.isRedisAvailable && this.redis) {
        const keys = await this.redis.keys(`*${pattern}*`);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      }
    } catch (error) {
      console.warn('Redis deletePattern failed:', error);
    }

    // Also clean from memory cache
    for (const key of this.memoryCache.keys()) {
      if (key.includes(pattern)) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key: string): Promise<boolean> {
    try {
      if (this.isRedisAvailable && this.redis) {
        const result = await this.redis.exists(key);
        return result === 1;
      }
    } catch (error) {
      console.warn('Redis exists failed:', error);
    }

    // Check memory cache
    const cached = this.memoryCache.get(key);
    return cached !== undefined && Date.now() - cached.timestamp < cached.ttl;
  }

  /**
   * Get multiple values at once
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];

    try {
      if (this.isRedisAvailable && this.redis) {
        const values = await this.redis.mget(...keys);
        return values.map(value => {
          if (value === null) return null;
          try {
            return typeof value === 'string' ? JSON.parse(value) : value;
          } catch {
            return value as T;
          }
        });
      }
    } catch (error) {
      console.warn('Redis mget failed, falling back to individual gets:', error);
    }

    // Fallback to individual memory cache gets
    return Promise.all(keys.map(key => this.get<T>(key)));
  }

  /**
   * Set multiple values at once
   */
  async mset<T>(keyValues: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    if (keyValues.length === 0) return;

    try {
      if (this.isRedisAvailable && this.redis) {
        // Redis mset doesn't support TTL, so we need to set individually
        await Promise.all(
          keyValues.map(({ key, value, ttl = 300 }) => this.set(key, value, ttl))
        );
        return;
      }
    } catch (error) {
      console.warn('Redis mset failed, falling back to individual sets:', error);
    }

    // Fallback to individual memory cache sets
    keyValues.forEach(({ key, value, ttl = 300 }) => {
      this.memoryCache.set(key, {
        data: value,
        timestamp: Date.now(),
        ttl: ttl * 1000
      });
    });
  }

  /**
   * Increment a numeric value
   */
  async increment(key: string, amount: number = 1): Promise<number> {
    try {
      if (this.isRedisAvailable && this.redis) {
        return await this.redis.incrby(key, amount);
      }
    } catch (error) {
      console.warn('Redis increment failed:', error);
    }

    // Fallback to memory cache
    const cached = this.memoryCache.get(key);
    const currentValue = cached && Date.now() - cached.timestamp < cached.ttl 
      ? (typeof cached.data === 'number' ? cached.data : 0)
      : 0;
    
    const newValue = currentValue + amount;
    this.memoryCache.set(key, {
      data: newValue,
      timestamp: Date.now(),
      ttl: 3600 * 1000 // 1 hour default for counters
    });

    return newValue;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ redis: boolean; memoryKeys: number; redisInfo?: any }> {
    const stats: any = {
      redis: this.isRedisAvailable,
      memoryKeys: this.memoryCache.size
    };

    try {
      if (this.isRedisAvailable && this.redis) {
        stats.redisInfo = await this.redis.info();
      }
    } catch (error) {
      console.warn('Failed to get Redis info:', error);
    }

    return stats;
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    try {
      if (this.isRedisAvailable && this.redis) {
        await this.redis.flushall();
      }
    } catch (error) {
      console.warn('Redis clear failed:', error);
    }

    // Clear memory cache
    this.memoryCache.clear();
  }

  /**
   * Clean up expired entries from memory cache
   */
  private cleanupMemoryCache(): void {
    if (this.memoryCache.size > 1000) { // Start cleanup when we have many entries
      const now = Date.now();
      const keysToDelete: string[] = [];

      for (const [key, value] of this.memoryCache.entries()) {
        if (now - value.timestamp >= value.ttl) {
          keysToDelete.push(key);
        }
      }

      keysToDelete.forEach(key => this.memoryCache.delete(key));
    }
  }

  /**
   * Health check for cache service
   */
  async healthCheck(): Promise<{ redis: boolean; memory: boolean; error?: string }> {
    const result = { redis: false, memory: true, error: undefined as string | undefined };

    try {
      if (this.redis) {
        await this.redis.ping();
        result.redis = true;
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown Redis error';
    }

    return result;
  }
}

// Specialized cache methods for common use cases
export class TaskCacheService {
  private cache = CacheService.getInstance();
  private readonly TTL = {
    TASKS: 30,      // 30 seconds for task lists
    TASK: 300,      // 5 minutes for individual tasks
    METRICS: 60,    // 1 minute for metrics
    AGENTS: 120     // 2 minutes for agent data
  };

  async getTaskList(filters: any): Promise<any[] | null> {
    const key = `tasks:list:${JSON.stringify(filters)}`;
    return this.cache.get(key);
  }

  async setTaskList(filters: any, tasks: any[]): Promise<void> {
    const key = `tasks:list:${JSON.stringify(filters)}`;
    await this.cache.set(key, tasks, this.TTL.TASKS);
  }

  async getTask(taskId: string): Promise<any | null> {
    return this.cache.get(`task:${taskId}`);
  }

  async setTask(taskId: string, task: any): Promise<void> {
    await this.cache.set(`task:${taskId}`, task, this.TTL.TASK);
  }

  async invalidateTask(taskId: string): Promise<void> {
    await Promise.all([
      this.cache.delete(`task:${taskId}`),
      this.cache.deletePattern('tasks:list'), // Invalidate all task lists
      this.cache.deletePattern('metrics')     // Invalidate metrics
    ]);
  }

  async getMetrics(agentId?: string): Promise<any | null> {
    const key = agentId ? `metrics:agent:${agentId}` : 'metrics:global';
    return this.cache.get(key);
  }

  async setMetrics(metrics: any, agentId?: string): Promise<void> {
    const key = agentId ? `metrics:agent:${agentId}` : 'metrics:global';
    await this.cache.set(key, metrics, this.TTL.METRICS);
  }
}

export default CacheService;