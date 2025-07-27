import { Task } from '../../types';

// JSON 形式でのエクスポート
export const exportToJSON = (tasks: Task[], filename: string = 'tasks') => {
  const dataStr = JSON.stringify(tasks, null, 2);
  downloadFile(dataStr, `${filename}.json`, 'application/json');
};

// CSV 形式でのエクスポート
export const exportToCSV = (tasks: Task[], filename: string = 'tasks') => {
  const headers = [
    'ID',
    'タイトル',
    '説明',
    'ステータス',
    '担当者',
    'プロジェクト名',
    '失敗理由',
    '再試行回数',
    '作成日',
    '更新日'
  ];

  const csvContent = [
    headers.join(','),
    ...tasks.map(task => [
      `"${task.id}"`,
      `"${task.title.replace(/"/g, '""')}"`,
      `"${task.description.replace(/"/g, '""')}"`,
      `"${task.status}"`,
      `"${task.assignedTo || ''}"`,
      `"${task.projectName || ''}"`,
      `"${task.failureReason || ''}"`,
      `"${task.retryCount || 0}"`,
      `"${task.createdAt.toLocaleString('ja-JP')}"`,
      `"${task.updatedAt?.toLocaleString('ja-JP') || ''}"`
    ].join(','))
  ].join('\n');

  // BOM 付き UTF-8 でエクスポート（Excel 対応）
  const bom = '\uFEFF';
  downloadFile(bom + csvContent, `${filename}.csv`, 'text/csv;charset=utf-8');
};

// HTML 形式でのエクスポート（印刷・ PDF 化に適したレポート形式）
export const exportToHTML = (tasks: Task[], filename: string = 'tasks-report') => {
  const statusLabels: Record<string, string> = {
    pending: '待機中',
    in_progress: '実行中',
    completed: '完了',
    failed: '失敗',
    paused: '停止中'
  };

  const statusCounts = tasks.reduce((acc, task) => {
    acc[task.status] = (acc[task.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const htmlContent = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>タスクレポート - ${new Date().toLocaleDateString('ja-JP')}</title>
    <style>
        body {
            font-family: 'Hiragino Sans', 'Yu Gothic', sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            text-align: center;
            border-bottom: 2px solid #3B82F6;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .summary-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 15px;
            text-align: center;
        }
        .summary-card h3 {
            margin: 0 0 10px 0;
            font-size: 14px;
            color: #64748b;
        }
        .summary-card .count {
            font-size: 24px;
            font-weight: bold;
            color: #1e293b;
        }
        .tasks-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        .tasks-table th,
        .tasks-table td {
            border: 1px solid #e2e8f0;
            padding: 12px;
            text-align: left;
        }
        .tasks-table th {
            background: #f1f5f9;
            font-weight: 600;
        }
        .status-badge {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }
        .status-pending { background: #fef3c7; color: #92400e; }
        .status-in_progress { background: #dbeafe; color: #1e40af; }
        .status-completed { background: #d1fae5; color: #065f46; }
        .status-failed { background: #fee2e2; color: #991b1b; }
        .status-paused { background: #f3f4f6; color: #374151; }
        .footer {
            margin-top: 30px;
            text-align: center;
            color: #64748b;
            font-size: 14px;
            border-top: 1px solid #e2e8f0;
            padding-top: 20px;
        }
        @media print {
            body { margin: 0; padding: 10px; }
            .header { page-break-after: avoid; }
            .tasks-table { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>タスクレポート</h1>
        <p>作成日: ${new Date().toLocaleString('ja-JP')}</p>
        <p>総タスク数: ${tasks.length}件</p>
    </div>

    <div class="summary">
        <div class="summary-card">
            <h3>待機中</h3>
            <div class="count">${statusCounts.pending || 0}</div>
        </div>
        <div class="summary-card">
            <h3>実行中</h3>
            <div class="count">${statusCounts.in_progress || 0}</div>
        </div>
        <div class="summary-card">
            <h3>完了</h3>
            <div class="count">${statusCounts.completed || 0}</div>
        </div>
        <div class="summary-card">
            <h3>失敗</h3>
            <div class="count">${statusCounts.failed || 0}</div>
        </div>
        <div class="summary-card">
            <h3>停止中</h3>
            <div class="count">${statusCounts.paused || 0}</div>
        </div>
    </div>

    <table class="tasks-table">
        <thead>
            <tr>
                <th>ID</th>
                <th>タイトル</th>
                <th>説明</th>
                <th>ステータス</th>
                <th>担当者</th>
                <th>プロジェクト</th>
                <th>作成日</th>
            </tr>
        </thead>
        <tbody>
            ${tasks.map(task => `
                <tr>
                    <td>${task.id.slice(0, 8)}</td>
                    <td>${task.title}</td>
                    <td>${task.description}</td>
                    <td>
                        <span class="status-badge status-${task.status}">
                            ${statusLabels[task.status] || task.status}
                        </span>
                    </td>
                    <td>${task.assignedTo || '-'}</td>
                    <td>${task.projectName || '-'}</td>
                    <td>${task.createdAt.toLocaleDateString('ja-JP')}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    <div class="footer">
        <p>このレポートは Claude Code Communication システムで生成されました</p>
    </div>
</body>
</html>`;

  downloadFile(htmlContent, `${filename}.html`, 'text/html');
};

// ファイルダウンロード共通関数
const downloadFile = (content: string, filename: string, contentType: string) => {
  const blob = new Blob([content], { type: contentType });
  const url = window.URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // メモリ解放
  window.URL.revokeObjectURL(url);
};

// プロジェクト成果物のエクスポート
export const exportProjectDeliverables = (
  tasks: Task[], 
  projectName?: string,
  format: 'json' | 'csv' | 'html' = 'json'
) => {
  const filteredTasks = projectName 
    ? tasks.filter(task => task.projectName === projectName)
    : tasks;

  const completedTasks = filteredTasks.filter(task => task.status === 'completed');
  const baseFilename = projectName 
    ? `${projectName}-deliverables-${new Date().toISOString().split('T')[0]}`
    : `all-deliverables-${new Date().toISOString().split('T')[0]}`;

  switch (format) {
    case 'csv':
      exportToCSV(completedTasks, baseFilename);
      break;
    case 'html':
      exportToHTML(completedTasks, baseFilename);
      break;
    default:
      exportToJSON(completedTasks, baseFilename);
  }

  return completedTasks.length;
};