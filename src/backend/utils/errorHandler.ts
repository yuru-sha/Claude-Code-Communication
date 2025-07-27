// エラーハンドリングユーティリティ
export class SystemError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean = true
  ) {
    super(message);
    this.name = 'SystemError';
  }
}

export class TmuxError extends SystemError {
  constructor(message: string, public target: string) {
    super(message, 'TMUX_ERROR', true);
  }
}

export class ClaudeError extends SystemError {
  constructor(message: string, public agent: string) {
    super(message, 'CLAUDE_ERROR', true);
  }
}

export class TaskError extends SystemError {
  constructor(message: string, public taskId: string) {
    super(message, 'TASK_ERROR', false);
  }
}

// エラーログ記録
export const logError = (error: Error, context: string) => {
  const timestamp = new Date().toISOString();
  const errorInfo = {
    timestamp,
    context,
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...(error instanceof SystemError && {
      code: error.code,
      recoverable: error.recoverable
    })
  };
  
  console.error(`❌ [${context}] ${error.message}`, errorInfo);
  
  // 必要に応じてファイルに記録
  // fs.appendFileSync('logs/error.log', JSON.stringify(errorInfo) + '\n');
};

// 非同期エラーハンドラー
export const withErrorHandling = <T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  context: string
) => {
  return async (...args: T): Promise<R | null> => {
    try {
      return await fn(...args);
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), context);
      return null;
    }
  };
};

// リトライ機能付きエラーハンドラー
export const withRetry = <T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  maxRetries: number = 3,
  delay: number = 1000
) => {
  return async (...args: T): Promise<R> => {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        console.warn(`⚠️ Attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 1.5; // 指数バックオフ
      }
    }
    
    throw lastError!;
  };
};