/**
 * Real-time Performance Dashboard
 * Shows system performance, cache stats, and processing metrics
 */

class PerformanceDashboard {
    constructor() {
        this.isVisible = false;
        this.updateInterval = null;
        this.metrics = {
            loadTimes: [],
            cacheHitRate: 0,
            activeOperations: 0,
            queueSize: 0,
            totalProducts: 0,
            memoryUsage: 0
        };

        this.createDashboard();
        this.setupKeyboardShortcut();
    }

    /**
     * Create the floating dashboard
     */
    createDashboard() {
        const dashboard = document.createElement('div');
        dashboard.id = 'performanceDashboard';
        dashboard.className = 'performance-dashboard';
        dashboard.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 350px;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            border-radius: 8px;
            padding: 16px;
            font-family: 'Monaco', 'Consolas', monospace;
            font-size: 12px;
            z-index: 10000;
            display: none;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        `;

        dashboard.innerHTML = `
            <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 12px;">
                <h4 style="margin: 0; color: #00ff88; font-size: 14px;">⚡ Performance Dashboard</h4>
                <button onclick="window.perfDashboard.toggle()" style="background: none; border: none; color: white; cursor: pointer; font-size: 16px;">×</button>
            </div>

            <div class="metric-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
                <div class="metric-item">
                    <div style="color: #888;">Load Time</div>
                    <div id="loadTimeMetric" style="color: #00ff88; font-weight: bold;">-- ms</div>
                </div>
                <div class="metric-item">
                    <div style="color: #888;">Cache Hit Rate</div>
                    <div id="cacheHitRateMetric" style="color: #00ff88; font-weight: bold;">--%</div>
                </div>
                <div class="metric-item">
                    <div style="color: #888;">Active Ops</div>
                    <div id="activeOpsMetric" style="color: #ffa500; font-weight: bold;">0</div>
                </div>
                <div class="metric-item">
                    <div style="color: #888;">Queue Size</div>
                    <div id="queueSizeMetric" style="color: #ff6b6b; font-weight: bold;">0</div>
                </div>
            </div>

            <div style="margin-bottom: 12px;">
                <div style="color: #888; margin-bottom: 4px;">System Health</div>
                <div id="healthStatus" style="color: #00ff88; font-weight: bold;">🟢 All Systems Operational</div>
            </div>

            <div style="margin-bottom: 12px;">
                <div style="color: #888; margin-bottom: 4px;">Recent Operations</div>
                <div id="recentOps" style="max-height: 80px; overflow-y: auto; font-size: 10px; line-height: 1.3;">
                    <div style="color: #666;">No recent operations</div>
                </div>
            </div>

            <div style="margin-bottom: 8px;">
                <div style="color: #888; margin-bottom: 4px;">Performance Graph</div>
                <canvas id="perfGraph" width="318" height="60" style="background: rgba(255,255,255,0.1); border-radius: 4px;"></canvas>
            </div>

            <div style="display: flex; justify-content: space-between; font-size: 10px; color: #666;">
                <span>Press Ctrl+P to toggle</span>
                <span id="lastUpdate">Last update: --</span>
            </div>
        `;

        document.body.appendChild(dashboard);
        this.dashboard = dashboard;
        this.setupGraph();
    }

    /**
     * Setup performance graph
     */
    setupGraph() {
        this.canvas = document.getElementById('perfGraph');
        this.ctx = this.canvas.getContext('2d');
        this.performanceData = Array(60).fill(0); // 60 data points
    }

    /**
     * Setup keyboard shortcut (Ctrl+P)
     */
    setupKeyboardShortcut() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'p') {
                e.preventDefault();
                this.toggle();
            }
        });
    }

    /**
     * Toggle dashboard visibility
     */
    toggle() {
        this.isVisible = !this.isVisible;
        this.dashboard.style.display = this.isVisible ? 'block' : 'none';

        if (this.isVisible) {
            this.startUpdating();
        } else {
            this.stopUpdating();
        }
    }

    /**
     * Start real-time updates
     */
    startUpdating() {
        this.updateInterval = setInterval(() => {
            this.updateMetrics();
        }, 1000);
    }

    /**
     * Stop real-time updates
     */
    stopUpdating() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    /**
     * Update all metrics
     */
    async updateMetrics() {
        try {
            // Get cache stats
            await this.updateCacheStats();

            // Get queue stats
            await this.updateQueueStats();

            // Update system health
            this.updateSystemHealth();

            // Update graph
            this.updateGraph();

            // Update timestamp
            document.getElementById('lastUpdate').textContent =
                `Last update: ${new Date().toLocaleTimeString()}`;

        } catch (error) {
            console.error('Performance dashboard update error:', error);
        }
    }

    /**
     * Update cache statistics
     */
    async updateCacheStats() {
        try {
            const response = await fetch('/api/system/cache-stats');
            if (response.ok) {
                const stats = await response.json();
                const hitRate = parseFloat(stats.hit_rate) || 0;
                this.metrics.cacheHitRate = hitRate;

                document.getElementById('cacheHitRateMetric').textContent = `${hitRate.toFixed(1)}%`;

                // Color code based on performance
                const element = document.getElementById('cacheHitRateMetric');
                if (hitRate > 80) {
                    element.style.color = '#00ff88';
                } else if (hitRate > 50) {
                    element.style.color = '#ffa500';
                } else {
                    element.style.color = '#ff6b6b';
                }
            }
        } catch (error) {
            // Cache stats not available
        }
    }

    /**
     * Update queue statistics
     */
    async updateQueueStats() {
        try {
            const response = await fetch('/api/system/queue-stats');
            if (response.ok) {
                const stats = await response.json();
                this.metrics.activeOperations = stats.active_tasks || 0;
                this.metrics.queueSize = stats.queue_size || 0;

                document.getElementById('activeOpsMetric').textContent = this.metrics.activeOperations;
                document.getElementById('queueSizeMetric').textContent = this.metrics.queueSize;

                // Color code queue size
                const queueElement = document.getElementById('queueSizeMetric');
                if (this.metrics.queueSize > 10) {
                    queueElement.style.color = '#ff6b6b';
                } else if (this.metrics.queueSize > 5) {
                    queueElement.style.color = '#ffa500';
                } else {
                    queueElement.style.color = '#00ff88';
                }
            }
        } catch (error) {
            // Queue stats not available
        }
    }

    /**
     * Update system health indicator
     */
    updateSystemHealth() {
        const healthElement = document.getElementById('healthStatus');
        let status = '🟢 All Systems Operational';
        let color = '#00ff88';

        // Check various health indicators
        if (this.metrics.queueSize > 20) {
            status = '🟡 High Queue Load';
            color = '#ffa500';
        }

        if (this.metrics.cacheHitRate < 30) {
            status = '🟡 Low Cache Performance';
            color = '#ffa500';
        }

        if (this.metrics.activeOperations > 50) {
            status = '🔴 System Under Load';
            color = '#ff6b6b';
        }

        healthElement.textContent = status;
        healthElement.style.color = color;
    }

    /**
     * Update performance graph
     */
    updateGraph() {
        // Shift data points
        this.performanceData.shift();

        // Add new data point (composite performance score)
        const score = Math.min(100, Math.max(0,
            this.metrics.cacheHitRate - (this.metrics.queueSize * 2) +
            (this.metrics.activeOperations > 0 ? -10 : 10)
        ));

        this.performanceData.push(score);

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw grid
        this.ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        this.ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = (i / 4) * this.canvas.height;
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }

        // Draw performance line
        this.ctx.strokeStyle = '#00ff88';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();

        for (let i = 0; i < this.performanceData.length; i++) {
            const x = (i / (this.performanceData.length - 1)) * this.canvas.width;
            const y = this.canvas.height - ((this.performanceData[i] / 100) * this.canvas.height);

            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }

        this.ctx.stroke();

        // Add performance gradient
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        gradient.addColorStop(0, 'rgba(0,255,136,0.2)');
        gradient.addColorStop(1, 'rgba(0,255,136,0.0)');

        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.canvas.height);

        for (let i = 0; i < this.performanceData.length; i++) {
            const x = (i / (this.performanceData.length - 1)) * this.canvas.width;
            const y = this.canvas.height - ((this.performanceData[i] / 100) * this.canvas.height);
            this.ctx.lineTo(x, y);
        }

        this.ctx.lineTo(this.canvas.width, this.canvas.height);
        this.ctx.closePath();
        this.ctx.fill();
    }

    /**
     * Record a load time
     */
    recordLoadTime(time) {
        this.metrics.loadTimes.push(time);
        if (this.metrics.loadTimes.length > 10) {
            this.metrics.loadTimes.shift();
        }

        const avgTime = this.metrics.loadTimes.reduce((a, b) => a + b, 0) / this.metrics.loadTimes.length;
        document.getElementById('loadTimeMetric').textContent = `${avgTime.toFixed(0)} ms`;

        // Color code based on performance
        const element = document.getElementById('loadTimeMetric');
        if (avgTime < 100) {
            element.style.color = '#00ff88';
        } else if (avgTime < 500) {
            element.style.color = '#ffa500';
        } else {
            element.style.color = '#ff6b6b';
        }
    }

    /**
     * Add operation to recent ops log
     */
    addOperation(operation, status, time) {
        const recentOps = document.getElementById('recentOps');
        const timestamp = new Date().toLocaleTimeString();
        const statusColor = status === 'success' ? '#00ff88' :
                           status === 'error' ? '#ff6b6b' : '#ffa500';

        const opElement = document.createElement('div');
        opElement.innerHTML = `
            <span style="color: #666;">${timestamp}</span>
            <span style="color: ${statusColor};">●</span>
            ${operation} <span style="color: #888;">(${time}ms)</span>
        `;

        recentOps.insertBefore(opElement, recentOps.firstChild);

        // Keep only last 10 operations
        while (recentOps.children.length > 10) {
            recentOps.removeChild(recentOps.lastChild);
        }
    }

    /**
     * Show notification badge
     */
    showNotification(message, type = 'info') {
        const badge = document.createElement('div');
        badge.style.cssText = `
            position: fixed;
            top: 20px;
            right: 380px;
            background: ${type === 'error' ? '#ff6b6b' : type === 'success' ? '#00ff88' : '#ffa500'};
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 10001;
            animation: slideIn 0.3s ease;
        `;

        badge.textContent = message;
        document.body.appendChild(badge);

        setTimeout(() => {
            badge.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => badge.remove(), 300);
        }, 3000);
    }
}

// Global instance
window.perfDashboard = new PerformanceDashboard();

// Auto-show for development
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    setTimeout(() => {
        window.perfDashboard.toggle();
    }, 2000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }

    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);