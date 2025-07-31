/**
 * Metrics API Routes
 * 
 * Handles KPI metrics, performance data, and analytics endpoints
 */

import { Express, Request, Response } from 'express';
import { db } from '../database';

/**
 * GET /api/kpi-metrics
 * Get KPI metrics from database
 */
const getKPIMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const metrics = await db.getKPIMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Failed to get KPI metrics:', error);
    res.status(500).json({ error: 'Failed to get KPI metrics' });
  }
};

/**
 * GET /api/agent-performance
 * Get agent performance metrics
 */
const getAgentPerformance = async (req: Request, res: Response): Promise<void> => {
  try {
    const performance = await db.getAgentPerformance();
    res.json(performance);
  } catch (error) {
    console.error('Failed to get agent performance:', error);
    res.status(500).json({ error: 'Failed to get agent performance' });
  }
};

/**
 * GET /api/task-trend
 * Get task completion trend data
 */
const getTaskTrend = async (req: Request, res: Response): Promise<void> => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const trend = await db.getTaskCompletionTrend(days);
    res.json(trend);
  } catch (error) {
    console.error('Failed to get task trend:', error);
    res.status(500).json({ error: 'Failed to get task trend' });
  }
};

/**
 * Setup metrics routes
 */
export const setupMetricsRoutes = (app: Express): void => {
  app.get('/api/kpi-metrics', getKPIMetrics);
  app.get('/api/agent-performance', getAgentPerformance);
  app.get('/api/task-trend', getTaskTrend);
  
  console.log('📊 Metrics routes configured');
};

export default setupMetricsRoutes;