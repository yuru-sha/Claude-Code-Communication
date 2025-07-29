/**
 * Download API Routes
 * 
 * Handles project file downloads and ZIP archive creation
 */

import { Express, Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import archiver from 'archiver';

/**
 * Get project file list recursively
 */
const getProjectFileList = async (dirPath: string, relativePath: string): Promise<any[]> => {
  const files: any[] = [];
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativeFilePath = path.join(relativePath, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively get files from subdirectories
        const subFiles = await getProjectFileList(fullPath, relativeFilePath);
        files.push({
          name: entry.name,
          type: 'directory',
          path: relativeFilePath,
          children: subFiles
        });
      } else {
        // Add file information
        const stats = await fs.stat(fullPath);
        files.push({
          name: entry.name,
          type: 'file',
          path: relativeFilePath,
          size: stats.size,
          modified: stats.mtime
        });
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
  }
  
  return files;
};

/**
 * GET /api/projects/:projectName/download/zip
 * Download project as ZIP archive
 */
const downloadProjectZip = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectName } = req.params;
    const projectPath = path.join(__dirname, '../../../workspace', projectName);

    // プロジェクトディレクトリの存在確認
    try {
      await fs.access(projectPath);
    } catch {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // ZIP ファイル名とヘッダー設定
    const zipFilename = `${projectName}-${new Date().toISOString().split('T')[0]}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

    // アーカイバーを作成
    const archive = archiver('zip', { zlib: { level: 9 } });

    // エラーハンドリング
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to create zip archive' });
      }
    });

    // Progress tracking
    archive.on('progress', (progress) => {
      console.log(`📦 Archive progress: ${progress.entries.processed}/${progress.entries.total} files`);
    });

    // アーカイブをレスポンスにパイプ
    archive.pipe(res);

    // プロジェクトディレクトリを再帰的にアーカイブに追加
    archive.directory(projectPath, projectName);

    // アーカイブを完了
    await archive.finalize();
    
    console.log(`✅ Project ${projectName} downloaded as ZIP`);

  } catch (error) {
    console.error('Error creating project zip:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create project zip' });
    }
  }
};

/**
 * GET /api/projects/:projectName/files
 * Get project file structure
 */
const getProjectFiles = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectName } = req.params;
    const projectPath = path.join(__dirname, '../../../workspace', projectName);

    // プロジェクトディレクトリの存在確認
    try {
      await fs.access(projectPath);
    } catch {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const files = await getProjectFileList(projectPath, '');
    
    res.json({
      success: true,
      project: projectName,
      files,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('Error getting project files:', error);
    res.status(500).json({ error: 'Failed to get project files' });
  }
};

/**
 * GET /api/projects
 * Get list of available projects
 */
const getProjects = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspacePath = path.join(__dirname, '../../../workspace');
    
    try {
      await fs.access(workspacePath);
    } catch {
      res.json({
        success: true,
        projects: [],
        message: 'Workspace directory not found',
        timestamp: new Date()
      });
      return;
    }

    const entries = await fs.readdir(workspacePath, { withFileTypes: true });
    const projects = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);

    res.json({
      success: true,
      projects,
      count: projects.length,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('Error getting projects:', error);
    res.status(500).json({ error: 'Failed to get projects' });
  }
};

/**
 * Setup download routes
 */
export const setupDownloadRoutes = (app: Express): void => {
  app.get('/api/projects/:projectName/download/zip', downloadProjectZip);
  app.get('/api/projects/:projectName/files', getProjectFiles);
  app.get('/api/projects', getProjects);
  
  console.log('📦 Download routes configured');
};

export default setupDownloadRoutes;