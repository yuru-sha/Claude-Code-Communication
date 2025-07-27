// プロジェクトファイルのダウンロード機能

export interface ProjectFile {
  path: string;
  name: string;
  size: number;
  type: 'file' | 'directory';
  modified: Date;
  content?: string;
}

export interface ProjectStructure {
  name: string;
  path: string;
  files: ProjectFile[];
  totalSize: number;
  lastModified: Date;
}

// プロジェクトファイルリストの取得
export const getProjectFiles = async (projectName: string): Promise<ProjectStructure | null> => {
  try {
    const response = await fetch(`/api/projects/${projectName}/files`);
    if (!response.ok) {
      throw new Error(`Failed to fetch project files: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching project files:', error);
    return null;
  }
};

// プロジェクト全体の Zip ダウンロード
export const downloadProjectAsZip = async (projectName: string): Promise<boolean> => {
  try {
    const response = await fetch(`/api/projects/${projectName}/download/zip`);
    if (!response.ok) {
      throw new Error(`Failed to download project: ${response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${projectName}.zip`;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    window.URL.revokeObjectURL(url);
    return true;
  } catch (error) {
    console.error('Error downloading project:', error);
    return false;
  }
};

// 個別ファイルのダウンロード
export const downloadProjectFile = async (projectName: string, filePath: string): Promise<boolean> => {
  try {
    const response = await fetch(`/api/projects/${projectName}/files/${encodeURIComponent(filePath)}/download`);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    
    const fileName = filePath.split('/').pop() || 'download';
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    window.URL.revokeObjectURL(url);
    return true;
  } catch (error) {
    console.error('Error downloading file:', error);
    return false;
  }
};

// 複数ファイルの選択ダウンロード（Zip として）
export const downloadSelectedFiles = async (
  projectName: string, 
  filePaths: string[]
): Promise<boolean> => {
  try {
    const response = await fetch(`/api/projects/${projectName}/download/selected`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ files: filePaths }),
    });

    if (!response.ok) {
      throw new Error(`Failed to download selected files: ${response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${projectName}-selected-files.zip`;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    window.URL.revokeObjectURL(url);
    return true;
  } catch (error) {
    console.error('Error downloading selected files:', error);
    return false;
  }
};

// ファイルサイズを人間が読みやすい形式に変換
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// ファイル拡張子から MIME タイプを取得
export const getFileType = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase();
  
  const mimeTypes: Record<string, string> = {
    'txt': 'text/plain',
    'js': 'application/javascript',
    'ts': 'application/typescript',
    'json': 'application/json',
    'html': 'text/html',
    'css': 'text/css',
    'md': 'text/markdown',
    'py': 'text/x-python',
    'java': 'text/x-java-source',
    'cpp': 'text/x-c++src',
    'c': 'text/x-csrc',
    'php': 'text/x-php',
    'rb': 'text/x-ruby',
    'go': 'text/x-go',
    'rs': 'text/x-rust',
    'xml': 'application/xml',
    'yml': 'text/yaml',
    'yaml': 'text/yaml',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'pdf': 'application/pdf',
    'zip': 'application/zip',
    'tar': 'application/x-tar',
    'gz': 'application/gzip'
  };
  
  return mimeTypes[ext || ''] || 'application/octet-stream';
};