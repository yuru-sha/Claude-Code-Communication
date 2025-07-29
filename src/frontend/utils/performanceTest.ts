/**
 * Performance Testing Utilities
 * 
 * Compares WebSocket vs Polling performance
 */

interface PerformanceMetrics {
  method: 'websocket' | 'polling';
  startTime: number;
  endTime: number;
  responseTime: number;
  dataSize: number;
  memoryUsage: number;
  connectionCount: number;
  errorCount: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private startTime = 0;

  /**
   * Start performance monitoring
   */
  start(): void {
    this.startTime = performance.now();
    this.metrics = [];
    
    // Monitor memory usage
    if ('memory' in performance) {
      console.log('🔍 Performance monitoring started');
      console.log('Initial memory:', (performance as any).memory);
    }
  }

  /**
   * Record a performance metric
   */
  record(
    method: 'websocket' | 'polling',
    responseTime: number,
    dataSize: number,
    hasError: boolean = false
  ): void {
    const now = performance.now();
    const memoryUsage = ('memory' in performance) 
      ? (performance as any).memory.usedJSHeapSize 
      : 0;

    this.metrics.push({
      method,
      startTime: this.startTime,
      endTime: now,
      responseTime,
      dataSize,
      memoryUsage,
      connectionCount: this.getActiveConnections(),
      errorCount: hasError ? 1 : 0
    });
  }

  /**
   * Get active WebSocket connections (approximation)
   */
  private getActiveConnections(): number {
    // This is an approximation - in real implementation,
    // this would be tracked by the WebSocket manager
    return 1;
  }

  /**
   * Generate performance report
   */
  generateReport(): {
    websocket: PerformanceStats;
    polling: PerformanceStats;
    comparison: ComparisonResult;
  } {
    const websocketMetrics = this.metrics.filter(m => m.method === 'websocket');
    const pollingMetrics = this.metrics.filter(m => m.method === 'polling');

    const websocketStats = this.calculateStats(websocketMetrics);
    const pollingStats = this.calculateStats(pollingMetrics);
    const comparison = this.compareStats(websocketStats, pollingStats);

    return {
      websocket: websocketStats,
      polling: pollingStats,
      comparison
    };
  }

  /**
   * Calculate statistics for a set of metrics
   */
  private calculateStats(metrics: PerformanceMetrics[]): PerformanceStats {
    if (metrics.length === 0) {
      return {
        count: 0,
        averageResponseTime: 0,
        minResponseTime: 0,
        maxResponseTime: 0,
        totalDataTransferred: 0,
        averageMemoryUsage: 0,
        errorRate: 0,
        throughput: 0
      };
    }

    const responseTimes = metrics.map(m => m.responseTime);
    const memoryUsages = metrics.map(m => m.memoryUsage);
    const totalData = metrics.reduce((sum, m) => sum + m.dataSize, 0);
    const errorCount = metrics.reduce((sum, m) => sum + m.errorCount, 0);
    const totalTime = metrics[metrics.length - 1].endTime - metrics[0].startTime;

    return {
      count: metrics.length,
      averageResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      minResponseTime: Math.min(...responseTimes),
      maxResponseTime: Math.max(...responseTimes),
      totalDataTransferred: totalData,
      averageMemoryUsage: memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length,
      errorRate: (errorCount / metrics.length) * 100,
      throughput: totalData / (totalTime / 1000) // bytes per second
    };
  }

  /**
   * Compare WebSocket vs Polling statistics
   */
  private compareStats(websocket: PerformanceStats, polling: PerformanceStats): ComparisonResult {
    const responseTimeImprovement = polling.averageResponseTime > 0 
      ? ((polling.averageResponseTime - websocket.averageResponseTime) / polling.averageResponseTime) * 100
      : 0;

    const memoryEfficiency = polling.averageMemoryUsage > 0
      ? ((polling.averageMemoryUsage - websocket.averageMemoryUsage) / polling.averageMemoryUsage) * 100
      : 0;

    const throughputImprovement = polling.throughput > 0
      ? ((websocket.throughput - polling.throughput) / polling.throughput) * 100
      : 0;

    return {
      responseTimeImprovement: Math.round(responseTimeImprovement * 100) / 100,
      memoryEfficiency: Math.round(memoryEfficiency * 100) / 100,
      throughputImprovement: Math.round(throughputImprovement * 100) / 100,
      errorRateDifference: websocket.errorRate - polling.errorRate,
      recommendation: this.getRecommendation(responseTimeImprovement, memoryEfficiency, throughputImprovement)
    };
  }

  /**
   * Get performance recommendation
   */
  private getRecommendation(
    responseTime: number, 
    memory: number, 
    throughput: number
  ): string {
    const improvements = [responseTime, memory, throughput];
    const positiveImprovements = improvements.filter(i => i > 0).length;

    if (positiveImprovements >= 2) {
      return 'WebSocket is significantly better - recommended for production';
    } else if (positiveImprovements === 1) {
      return 'WebSocket shows some improvements - consider for high-traffic scenarios';
    } else {
      return 'Polling may be sufficient for current load - monitor as usage grows';
    }
  }

  /**
   * Export metrics as CSV
   */
  exportCSV(): string {
    const headers = [
      'method', 'startTime', 'endTime', 'responseTime', 
      'dataSize', 'memoryUsage', 'connectionCount', 'errorCount'
    ];

    const csvRows = [
      headers.join(','),
      ...this.metrics.map(m => [
        m.method,
        m.startTime,
        m.endTime,
        m.responseTime,
        m.dataSize,
        m.memoryUsage,
        m.connectionCount,
        m.errorCount
      ].join(','))
    ];

    return csvRows.join('\n');
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
    this.startTime = 0;
  }
}

interface PerformanceStats {
  count: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  totalDataTransferred: number;
  averageMemoryUsage: number;
  errorRate: number;
  throughput: number;
}

interface ComparisonResult {
  responseTimeImprovement: number; // Percentage improvement
  memoryEfficiency: number; // Percentage improvement
  throughputImprovement: number; // Percentage improvement
  errorRateDifference: number; // Difference in error rates
  recommendation: string;
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * WebSocket Performance Test Hook
 */
export const usePerformanceTest = () => {
  const startTest = () => {
    performanceMonitor.start();
    console.log('🚀 Performance test started');
  };

  const recordWebSocketMetric = (responseTime: number, dataSize: number, hasError?: boolean) => {
    performanceMonitor.record('websocket', responseTime, dataSize, hasError);
  };

  const recordPollingMetric = (responseTime: number, dataSize: number, hasError?: boolean) => {
    performanceMonitor.record('polling', responseTime, dataSize, hasError);
  };

  const generateReport = () => {
    const report = performanceMonitor.generateReport();
    console.log('📊 Performance Report:', report);
    return report;
  };

  const exportData = () => {
    const csv = performanceMonitor.exportCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-test-${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return {
    startTest,
    recordWebSocketMetric,
    recordPollingMetric,
    generateReport,
    exportData,
    clear: () => performanceMonitor.clear()
  };
};

export default performanceMonitor;