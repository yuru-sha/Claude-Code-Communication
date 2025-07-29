import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { sendToAgent } from '../services/taskManager';
import serviceContainer from '../services/ServiceContainer';
import { AgentStatus, AgentStatusType } from '../../types';

const router = Router();

// エージェント一覧取得
router.get('/', asyncHandler(async (req, res) => {
  const agentActivityService = serviceContainer.agentActivityMonitoringService;
  const agentStatuses = await agentActivityService.getAllAgentStatuses();
  
  res.json({
    agents: agentStatuses,
    count: agentStatuses.length,
    timestamp: new Date().toISOString()
  });
}));

// 特定エージェント情報取得
router.get('/:agentId', asyncHandler(async (req, res) => {
  const { agentId } = req.params;
  const agentActivityService = serviceContainer.agentActivityMonitoringService;
  
  const agentStatus = await agentActivityService.getAgentStatus(agentId);
  if (!agentStatus) {
    return res.status(404).json({
      error: 'Agent not found',
      agentId
    });
  }
  
  res.json({
    agent: agentStatus,
    timestamp: new Date().toISOString()
  });
}));

// エージェントにメッセージ送信
router.post('/:agentId/message', asyncHandler(async (req, res) => {
  const { agentId } = req.params;
  const { message } = req.body;
  
  if (!message) {
    return res.status(400).json({
      error: 'Message is required'
    });
  }
  
  try {
    await sendToAgent(agentId, message);
    
    res.json({
      message: 'Message sent successfully',
      agentId,
      sentMessage: message,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({
      error: 'Failed to send message to agent',
      agentId,
      details: errorMessage
    });
  }
}));

// エージェントステータス更新
router.put('/:agentId/status', asyncHandler(async (req, res) => {
  const { agentId } = req.params;
  const { status } = req.body;
  
  const validStatuses: AgentStatusType[] = ['idle', 'working', 'error', 'offline'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      error: 'Invalid status',
      validStatuses
    });
  }
  
  const agentActivityService = serviceContainer.agentActivityMonitoringService;
  await agentActivityService.updateAgentStatus(agentId, status);
  
  const updatedStatus = await agentActivityService.getAgentStatus(agentId);
  
  res.json({
    message: 'Agent status updated successfully',
    agent: updatedStatus,
    timestamp: new Date().toISOString()
  });
}));

// エージェントアクティビティ履歴取得
router.get('/:agentId/activity', asyncHandler(async (req, res) => {
  const { agentId } = req.params;
  const { limit = 50, offset = 0 } = req.query;
  
  const activityAnalyzer = serviceContainer.activityAnalyzer;
  const activities = await activityAnalyzer.getAgentActivityHistory(
    agentId, 
    Number(limit), 
    Number(offset)
  );
  
  res.json({
    agentId,
    activities,
    limit: Number(limit),
    offset: Number(offset),
    timestamp: new Date().toISOString()
  });
}));

// エージェントパフォーマンス統計取得
router.get('/:agentId/performance', asyncHandler(async (req, res) => {
  const { agentId } = req.params;
  const { timeRange = '24h' } = req.query;
  
  const performanceMonitor = serviceContainer.performanceMonitor;
  const performance = await performanceMonitor.getAgentPerformanceStats(
    agentId, 
    timeRange as string
  );
  
  res.json({
    agentId,
    performance,
    timeRange,
    timestamp: new Date().toISOString()
  });
}));

// 全エージェントの緊急停止
router.post('/emergency-stop', asyncHandler(async (req, res) => {
  const { reason = 'Manual emergency stop' } = req.body;
  
  const agentProcessManager = serviceContainer.agentProcessManager;
  await agentProcessManager.emergencyStopAllAgents(reason);
  
  res.json({
    message: 'Emergency stop initiated for all agents',
    reason,
    timestamp: new Date().toISOString()
  });
}));

// 全エージェントの復旧
router.post('/recovery', asyncHandler(async (req, res) => {
  const agentProcessManager = serviceContainer.agentProcessManager;
  await agentProcessManager.recoverAllAgents();
  
  res.json({
    message: 'Recovery initiated for all agents',
    timestamp: new Date().toISOString()
  });
}));

export default router;