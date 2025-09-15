/**
 * Live Updates Module
 * Handles real-time updates via SocketIO for product modals
 */

class LiveUpdatesManager {
    constructor() {
        this.socket = null;
        this.currentModalRow = null;
        this.currentCollection = null;
        this.isModalOpen = false;

        this.initializeSocketIO();
        this.setupModalEventListeners();
    }

    /**
     * Initialize SocketIO connection
     */
    initializeSocketIO() {
        try {
            // Initialize SocketIO if available
            if (typeof io !== 'undefined') {
                this.socket = io();
                this.setupSocketListeners();
                console.log('✅ Live updates initialized with SocketIO');
            } else {
                console.warn('⚠️ SocketIO not available, live updates disabled');
            }
        } catch (error) {
            console.error('❌ Error initializing SocketIO:', error);
        }
    }

    /**
     * Setup SocketIO event listeners
     */
    setupSocketListeners() {
        if (!this.socket) return;

        // Listen for product updates
        this.socket.on('product_updated', (data) => {
            console.log('🔄 Received product update:', data);
            this.handleProductUpdate(data);
        });

        // Connection status
        this.socket.on('connect', () => {
            console.log('🟢 SocketIO connected');
        });

        this.socket.on('disconnect', () => {
            console.log('🔴 SocketIO disconnected');
        });

        this.socket.on('connect_error', (error) => {
            console.error('❌ SocketIO connection error:', error);
        });
    }

    /**
     * Setup modal event listeners
     */
    setupModalEventListeners() {
        // Listen for modal show events
        document.addEventListener('shown.bs.modal', (event) => {
            const modal = event.target;
            if (modal.id === 'editProductModal') {
                this.onModalOpened(modal);
            }
        });

        // Listen for modal hide events
        document.addEventListener('hidden.bs.modal', (event) => {
            const modal = event.target;
            if (modal.id === 'editProductModal') {
                this.onModalClosed();
            }
        });
    }

    /**
     * Handle modal opened
     */
    onModalOpened(modal) {
        this.isModalOpen = true;
        this.currentModalRow = modal.dataset.currentRow;
        this.currentCollection = window.COLLECTION_NAME;

        console.log(`🔄 Modal opened for ${this.currentCollection} row ${this.currentModalRow}`);
        console.log('✅ Live updates active for this product');

        // Show live updates badge
        this.updateLiveUpdatesBadge(true);
    }

    /**
     * Handle modal closed
     */
    onModalClosed() {
        this.isModalOpen = false;
        this.currentModalRow = null;
        this.currentCollection = null;

        console.log('🔄 Modal closed, live updates paused');

        // Hide live updates badge
        this.updateLiveUpdatesBadge(false);
    }

    /**
     * Handle product update from SocketIO
     */
    handleProductUpdate(data) {
        // Only update if the modal is open for this specific product
        if (!this.isModalOpen ||
            !this.currentModalRow ||
            !this.currentCollection ||
            data.collection !== this.currentCollection ||
            data.row_num.toString() !== this.currentModalRow.toString()) {
            console.log('🔄 Update ignored - not for current modal product');
            return;
        }

        console.log(`🎯 Updating modal for ${data.collection} row ${data.row_num}`);
        this.updateModalFields(data);
        this.showUpdateNotification(data);
    }

    /**
     * Update modal fields with new data
     */
    updateModalFields(data) {
        const { updated_data, fields_updated } = data;

        if (!updated_data) {
            console.warn('⚠️ No updated data provided');
            return;
        }

        let updatedCount = 0;

        // Update each field that was changed
        Object.entries(updated_data).forEach(([field, value]) => {
            const updated = this.updateField(field, value);
            if (updated) {
                updatedCount++;
                console.log(`✅ Updated field: ${field}`);
            }
        });

        if (updatedCount > 0) {
            console.log(`✨ Successfully updated ${updatedCount} fields in modal`);
            this.highlightUpdatedFields(fields_updated);
        }
    }

    /**
     * Update a specific field in the modal
     */
    updateField(field, value) {
        // Map field names to element IDs
        const fieldMapping = {
            'body_html': 'editBodyHtml',
            'care_instructions': 'editCareInstructions',
            'features': 'editFeatures',
            'title': 'editTitle',
            'vendor': 'editVendor',
            'variant_sku': 'editSku',
            'seo_title': 'editSeoTitle',
            'seo_description': 'editSeoDescription'
        };

        const elementId = fieldMapping[field] || `edit${field.charAt(0).toUpperCase() + field.slice(1)}`;
        const element = document.getElementById(elementId);

        if (!element) {
            console.warn(`⚠️ Element not found for field: ${field} (ID: ${elementId})`);
            return false;
        }

        // Update the element value
        if (element.tagName.toLowerCase() === 'textarea' || element.tagName.toLowerCase() === 'input') {
            element.value = value || '';
        } else if (element.tagName.toLowerCase() === 'select') {
            element.value = value || '';
        } else {
            element.textContent = value || '';
        }

        return true;
    }

    /**
     * Highlight updated fields with animation
     */
    highlightUpdatedFields(fields) {
        if (!fields || !Array.isArray(fields)) return;

        fields.forEach(field => {
            const fieldMapping = {
                'body_html': 'editBodyHtml',
                'care_instructions': 'editCareInstructions',
                'features': 'editFeatures'
            };

            const elementId = fieldMapping[field] || `edit${field.charAt(0).toUpperCase() + field.slice(1)}`;
            const element = document.getElementById(elementId);

            if (element) {
                // Add highlight class
                element.classList.add('live-updated');

                // Remove highlight after animation
                setTimeout(() => {
                    element.classList.remove('live-updated');
                }, 3000);
            }
        });
    }

    /**
     * Show update notification
     */
    showUpdateNotification(data) {
        const { message, fields_updated } = data;

        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'live-update-notification';
        notification.innerHTML = `
            <div class="alert alert-success alert-dismissible fade show" role="alert">
                <i class="fas fa-sync-alt me-2"></i>
                <strong>Live Update:</strong> ${message}
                <small class="d-block mt-1">Fields updated: ${fields_updated.join(', ')}</small>
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;

        // Add to modal
        const modal = document.getElementById('editProductModal');
        const modalBody = modal ? modal.querySelector('.modal-body') : null;

        if (modalBody) {
            // Remove any existing notifications
            const existingNotifications = modalBody.querySelectorAll('.live-update-notification');
            existingNotifications.forEach(n => n.remove());

            // Add new notification at the top
            modalBody.insertBefore(notification, modalBody.firstChild);

            // Auto-remove after 5 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 5000);
        }
    }

    /**
     * Manually refresh modal data (fallback)
     */
    async refreshModalData() {
        if (!this.isModalOpen || !this.currentModalRow || !this.currentCollection) {
            console.warn('⚠️ Cannot refresh - no modal open');
            return;
        }

        try {
            console.log('🔄 Manually refreshing modal data...');

            const response = await fetch(`/api/${this.currentCollection}/products/${this.currentModalRow}`);
            const data = await response.json();

            if (data.success && data.product) {
                // Update modal with fresh data
                this.updateModalWithProductData(data.product);
                console.log('✅ Modal data refreshed');
            }
        } catch (error) {
            console.error('❌ Error refreshing modal data:', error);
        }
    }

    /**
     * Update modal with complete product data
     */
    updateModalWithProductData(productData) {
        Object.entries(productData).forEach(([field, value]) => {
            this.updateField(field, value);
        });
    }

    /**
     * Check if live updates are active
     */
    isLiveUpdatesActive() {
        return this.socket && this.socket.connected && this.isModalOpen;
    }

    /**
     * Update live updates badge visibility
     */
    updateLiveUpdatesBadge(show) {
        const badge = document.getElementById('liveUpdatesBadge');
        if (badge) {
            if (show && this.socket && this.socket.connected) {
                badge.style.display = 'inline-block';
                badge.className = 'badge bg-success ms-2';
                badge.innerHTML = '<i class="fas fa-wifi me-1"></i>Live Updates';
            } else if (show) {
                badge.style.display = 'inline-block';
                badge.className = 'badge bg-warning ms-2';
                badge.innerHTML = '<i class="fas fa-wifi me-1"></i>Connecting...';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    /**
     * Get status information
     */
    getStatus() {
        return {
            socketConnected: this.socket ? this.socket.connected : false,
            modalOpen: this.isModalOpen,
            currentProduct: this.currentModalRow ? {
                collection: this.currentCollection,
                row: this.currentModalRow
            } : null,
            liveUpdatesActive: this.isLiveUpdatesActive()
        };
    }
}

// Global instance
let liveUpdatesManager = null;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    liveUpdatesManager = new LiveUpdatesManager();

    // Make it globally accessible
    window.liveUpdatesManager = liveUpdatesManager;

    console.log('✅ Live Updates Manager initialized');
});

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LiveUpdatesManager;
}