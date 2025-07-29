/**
 * Terminal API Routes
 * 
 * Handles terminal output capture and management
 */

import { Express, Request, Response } from 'express';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

/**
 * Map agent names to tmux targets
 */
const mapAgentToTmuxTarget = (target: string): string => {
  const targetMap: Record<string, string> = {
    'boss1': 'multiagent:0.0',
    'worker1': 'multiagent:0.1',
    'worker2': 'multiagent:0.2',
    'worker3': 'multiagent:0.3',
    'president': 'president'
  };
  
  return targetMap[target] || target;
};

/**
 * Set CORS headers for terminal endpoints
 */
const setCorsHeaders = (res: Response): void => {
  res.header('Access-Control-Allow-Origin', FRONTEND_URL);
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
};

/**
 * GET /api/terminal/:target
 * Capture and return terminal output for a specific agent
 */
const getTerminalOutput = async (req: Request, res: Response): Promise<void> => {
  try {
    setCorsHeaders(res);

    const target = req.params.target;
    console.log(`📺 Fetching terminal output for: ${target}`);

    const tmuxTarget = mapAgentToTmuxTarget(target);
    console.log(`🎯 Mapped ${target} to tmux target: ${tmuxTarget}`);

    const { stdout } = await execAsync(`tmux capture-pane -t "${tmuxTarget}" -p`);
    console.log(`✅ Terminal output length: ${stdout.length} chars for ${target}`);

    res.type('text/plain').send(stdout);
  } catch (error) {
    console.error(`❌ Failed to capture terminal ${req.params.target}:`, error);
    res.status(500).send(
      `Terminal ${req.params.target} not available\nError: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
};

/**
 * Setup terminal routes
 */
export const setupTerminalRoutes = (app: Express): void => {
  app.get('/api/terminal/:target', getTerminalOutput);
  console.log('🖥️  Terminal routes configured');
};

export default setupTerminalRoutes;