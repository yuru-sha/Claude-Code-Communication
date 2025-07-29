/**
 * Tasks API Routes
 * 
 * Handles task management, creation, retrieval, and completion
 */

import { Express, Request, Response } from 'express';
import { db } from '../database';

/**
 * GET /api/tasks
 * Get all tasks from database
 */
const getAllTasks = async (req: Request, res: Response): Promise<void> => {
  try {
    const tasks = await db.getAllTasks();
    res.json(tasks);
  } catch (error) {
    console.error('Failed to get tasks:', error);
    res.status(500).json({ error: 'Failed to get tasks' });
  }
};

/**
 * POST /api/tasks
 * Create a new task
 */
const createTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const taskData = req.body;
    const task = await db.createTask(taskData);
    res.status(201).json(task);
  } catch (error) {
    console.error('Failed to create task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
};

/**
 * PUT /api/tasks/:id/complete
 * Mark a task as completed
 */
const completeTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const task = await db.updateTaskStatus(id, 'completed');
    res.json(task);
  } catch (error) {
    console.error('Failed to complete task:', error);
    res.status(500).json({ error: 'Failed to complete task' });
  }
};

/**
 * GET /api/tasks/:id
 * Get a specific task by ID
 */
const getTaskById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const task = await db.getTaskById(id);
    
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    
    res.json(task);
  } catch (error) {
    console.error('Failed to get task:', error);
    res.status(500).json({ error: 'Failed to get task' });
  }
};

/**
 * DELETE /api/tasks/:id
 * Delete a task
 */
const deleteTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await db.deleteTask(id);
    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
};

/**
 * Setup task routes
 */
export const setupTaskRoutes = (app: Express): void => {
  app.get('/api/tasks', getAllTasks);
  app.post('/api/tasks', createTask);
  app.get('/api/tasks/:id', getTaskById);
  app.put('/api/tasks/:id/complete', completeTask);
  app.delete('/api/tasks/:id', deleteTask);
  
  console.log('📋 Task routes configured');
};

export default setupTaskRoutes;