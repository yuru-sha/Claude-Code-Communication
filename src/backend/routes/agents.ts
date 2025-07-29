/**
 * Agents API Routes
 * 
 * Handles agent management, startup, messaging, and status
 */

import { Express, Request, Response } from 'express';
import serviceContainer from '../services/ServiceContainer';

const tmuxManager = serviceContainer.tmuxManager;

/**
 * POST /api/agents/:agentName/start
 * Start a specific Claude Code agent
 */
const startAgent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { agentName } = req.params;
    console.log(`🚀 API request to start Claude Code for: ${agentName}`);
    
    const success = await tmuxManager.startClaudeAgent(agentName);
    
    if (success) {
      res.json({ 
        success: true, 
        message: `Claude Code started successfully for ${agentName}`,
        timestamp: new Date()
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: `Failed to start Claude Code for ${agentName}`,
        timestamp: new Date()
      });
    }
  } catch (error) {
    console.error('Error starting Claude Code:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date()
    });
  }
};

/**
 * POST /api/agents/start-all
 * Start all Claude Code agents
 */
const startAllAgents = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🚀 API request to start all Claude Code agents');
    
    await tmuxManager.startAllClaudeAgents();
    
    res.json({ 
      success: true, 
      message: 'All Claude Code agents started successfully',
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error starting all Claude Code agents:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to start all Claude Code agents',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date()
    });
  }
};

/**
 * POST /api/agents/:agentName/message
 * Send a message to a specific agent
 */
const sendMessageToAgent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { agentName } = req.params;
    const { message } = req.body;
    
    if (!message) {
      res.status(400).json({ 
        success: false, 
        message: 'Message is required',
        timestamp: new Date()
      });
      return;
    }
    
    console.log(`📤 API request to send message to ${agentName}: ${message}`);
    
    const success = await tmuxManager.sendMessage(agentName, message);
    
    if (success) {
      res.json({ 
        success: true, 
        message: `Message sent successfully to ${agentName}`,
        timestamp: new Date()
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: `Failed to send message to ${agentName}`,
        timestamp: new Date()
      });
    }
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date()
    });
  }
};

/**
 * GET /api/agents
 * Get list of available agents
 */
const getAvailableAgents = async (req: Request, res: Response): Promise<void> => {
  try {
    const agents = tmuxManager.getAvailableAgents();
    res.json({ 
      success: true, 
      agents,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error getting available agents:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date()
    });
  }
};

/**
 * Setup agent routes
 */
export const setupAgentRoutes = (app: Express): void => {
  app.post('/api/agents/:agentName/start', startAgent);
  app.post('/api/agents/start-all', startAllAgents);
  app.post('/api/agents/:agentName/message', sendMessageToAgent);
  app.get('/api/agents', getAvailableAgents);
  
  console.log('🤖 Agent routes configured');
};

export default setupAgentRoutes;