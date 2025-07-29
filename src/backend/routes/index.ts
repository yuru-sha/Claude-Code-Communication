/**
 * Main API Routes - Centralized route definitions
 * 
 * This file exports all route handlers for the server.
 * Each route module is responsible for a specific domain.
 */

import { Express } from 'express';
import { setupTerminalRoutes } from './terminal';
import { setupMetricsRoutes } from './metrics';
import { setupTaskRoutes } from './tasks';
import { setupAgentRoutes } from './agents';
import { setupSystemRoutes } from './system';
import { setupDownloadRoutes } from './download';

/**
 * Setup all API routes
 */
export const setupRoutes = (app: Express) => {
  console.log('🔗 Setting up API routes...');
  
  // Setup domain-specific routes
  setupTerminalRoutes(app);
  setupMetricsRoutes(app);
  setupTaskRoutes(app);
  setupAgentRoutes(app);
  setupSystemRoutes(app);
  setupDownloadRoutes(app);
  
  console.log('✅ All API routes configured');
};

export default setupRoutes;