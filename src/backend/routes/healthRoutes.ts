import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import serviceContainer from '../services/ServiceContainer';

const router = Router();

interface SystemHealth {
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

// システムヘルスチェック
router.get('/health', asyncHandler(async (req, res) => {
  const healthController = serviceContainer.healthCheck;
  const systemHealth = await healthController.getSystemHealth();
  
  res.json({
    status: 'ok',
    health: systemHealth,
    timestamp: new Date().toISOString()
  });
}));

// 詳細なシステム情報取得
router.get('/system-info', asyncHandler(async (req, res) => {
  const healthController = serviceContainer.healthCheck;
  const systemInfo = await healthController.getDetailedSystemInfo();
  
  res.json({
    systemInfo,
    timestamp: new Date().toISOString()
  });
}));

// パフォーマンスメトリクス取得
router.get('/metrics', asyncHandler(async (req, res) => {
  const performanceMonitor = serviceContainer.performanceMonitor;
  const metrics = performanceMonitor.getMetrics();
  
  res.json({
    metrics,
    timestamp: new Date().toISOString()
  });
}));

// 使用制限状態確認
router.get('/usage-limits', asyncHandler(async (req, res) => {
  const { db } = await import('../database');
  const usageLimits = await db.getUsageLimitState();
  
  res.json({
    usageLimits,
    timestamp: new Date().toISOString()
  });
}));

export default router;