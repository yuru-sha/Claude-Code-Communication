import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { 
  sendToAgent, 
  checkUsageLimitResolution, 
  processTaskQueue,
  assignTaskToPresident as taskManagerAssignTaskToPresident 
} from '../services/taskManager';
import { Task } from '../database';

const router = Router();

// タスク一覧取得
router.get('/', asyncHandler(async (req, res) => {
  const { db } = await import('../database');
  const tasks = await db.getAllTasks();
  
  res.json({
    tasks,
    count: tasks.length,
    timestamp: new Date().toISOString()
  });
}));

// 単一タスク取得
router.get('/:id', asyncHandler(async (req, res) => {
  const { db } = await import('../database');
  const task = await db.getTask(req.params.id);
  
  if (!task) {
    return res.status(404).json({
      error: 'Task not found',
      taskId: req.params.id
    });
  }
  
  res.json({
    task,
    timestamp: new Date().toISOString()
  });
}));

// タスク作成
router.post('/', asyncHandler(async (req, res) => {
  const { title, description, priority = 'medium' } = req.body;
  
  if (!title || !description) {
    return res.status(400).json({
      error: 'Title and description are required'
    });
  }
  
  const { db } = await import('../database');
  const taskId = await db.addTask(title, description, priority);
  const task = await db.getTask(taskId);
  
  // タスクキューの処理を開始
  processTaskQueue();
  
  res.status(201).json({
    message: 'Task created successfully',
    task,
    taskId,
    timestamp: new Date().toISOString()
  });
}));

// タスク更新
router.put('/:id', asyncHandler(async (req, res) => {
  const { db } = await import('../database');
  const taskId = req.params.id;
  const updateData = req.body;
  
  const existingTask = await db.getTask(taskId);
  if (!existingTask) {
    return res.status(404).json({
      error: 'Task not found',
      taskId
    });
  }
  
  await db.updateTask(taskId, updateData);
  const updatedTask = await db.getTask(taskId);
  
  res.json({
    message: 'Task updated successfully',
    task: updatedTask,
    timestamp: new Date().toISOString()
  });
}));

// タスク削除
router.delete('/:id', asyncHandler(async (req, res) => {
  const { db } = await import('../database');
  const taskId = req.params.id;
  
  const existingTask = await db.getTask(taskId);
  if (!existingTask) {
    return res.status(404).json({
      error: 'Task not found',
      taskId
    });
  }
  
  await db.deleteTask(taskId);
  
  res.json({
    message: 'Task deleted successfully',
    taskId,
    timestamp: new Date().toISOString()
  });
}));

// タスク完了
router.post('/:id/complete', asyncHandler(async (req, res) => {
  const { db } = await import('../database');
  const taskId = req.params.id;
  
  const task = await db.getTask(taskId);
  if (!task) {
    return res.status(404).json({
      error: 'Task not found',
      taskId
    });
  }
  
  await db.updateTask(taskId, { 
    status: 'completed',
    completedAt: new Date()
  });
  
  const completedTask = await db.getTask(taskId);
  
  res.json({
    message: 'Task completed successfully',
    task: completedTask,
    timestamp: new Date().toISOString()
  });
}));

// 使用制限解除の確認
router.post('/check-usage-limit', asyncHandler(async (req, res) => {
  const resolved = await checkUsageLimitResolution();
  
  res.json({
    resolved,
    message: resolved ? 'Usage limit resolved' : 'Usage limit still active',
    timestamp: new Date().toISOString()
  });
}));

// タスクキュー処理の手動実行
router.post('/process-queue', asyncHandler(async (req, res) => {
  await processTaskQueue();
  
  res.json({
    message: 'Task queue processing initiated',
    timestamp: new Date().toISOString()
  });
}));

export default router;