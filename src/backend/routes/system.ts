/**
 * System API Routes
 * 
 * Handles system health checks, monitoring, and administrative functions
 */

import { Express, Request, Response } from 'express';
import { performHealthCheck } from '../controllers/HealthController';

/**
 * GET /api/system-health
 * Get current system health status
 */
const getSystemHealth = async (req: Request, res: Response): Promise<void> => {
  try {
    const health = await performHealthCheck();
    res.json(health);
  } catch (error) {
    console.error('Failed to get system health:', error);
    res.status(500).json({ error: 'Failed to get system health' });
  }
};

/**
 * GET /api/system/status
 * Get detailed system status information
 */
const getSystemStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    // Basic system status without complex health checks
    const status = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version,
      platform: process.platform,
      timestamp: new Date()
    };
    
    res.json({
      success: true,
      status,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Failed to get system status:', error);
    res.status(500).json({ error: 'Failed to get system status' });
  }
};

/**
 * POST /api/system/shutdown
 * Graceful system shutdown (admin only)
 */
const initiateShutdown = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🛑 Shutdown requested via API');
    
    res.json({
      success: true,
      message: 'Shutdown initiated',
      timestamp: new Date()
    });
    
    // Give time for response to be sent
    setTimeout(() => {
      process.kill(process.pid, 'SIGTERM');
    }, 1000);
    
  } catch (error) {
    console.error('Failed to initiate shutdown:', error);
    res.status(500).json({ error: 'Failed to initiate shutdown' });
  }
};

/**
 * Setup system routes
 */
export const setupSystemRoutes = (app: Express): void => {
  app.get('/api/system-health', getSystemHealth);
  app.get('/api/system/status', getSystemStatus);
  app.post('/api/system/shutdown', initiateShutdown);
  
  console.log('🔧 System routes configured');
};

export default setupSystemRoutes;