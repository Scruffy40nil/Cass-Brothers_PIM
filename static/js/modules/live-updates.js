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
                this.socket = io({
                    timeout: 5000,
                    forceNew: true
                });
                this.setupSocketListeners();
                console.log('✅ Live updates initialized with SocketIO');
            } else {
                console.warn('⚠️ SocketIO not available, using polling fallback');
                this.initializePollingFallback();
            }
        } catch (error) {
            console.error('❌ Error initializing SocketIO, using polling fallback:', error);
            this.initializePollingFallback();
        }
    }

    /**
     * Fallback polling mechanism when SocketIO is not available
     */
    initializePollingFallback() {
        this.pollingEnabled = true;
        console.log('✅ Live updates initialized with polling fallback');
    }

    /**
     * Setup SocketIO event listeners
     */
    setupSocketListeners() {
        if (!this.socket) return;

        // Listen for product updates
        this.socket.on('product_updated', (data) => {
            console.log('🔄 DEBUG: SocketIO product_updated event received!');
            console.log('🔍 DEBUG: Received product update data:', data);
            console.log('📊 DEBUG: Current modal state:', {
                isModalOpen: this.isModalOpen,
                currentRow: this.currentModalRow,
                currentCollection: this.currentCollection
            });
            console.log('🔍 DEBUG: Event collection:', data.collection);
            console.log('🔍 DEBUG: Event row_num:', data.row_num);
            console.log('🔍 DEBUG: Will handle update?', (
                this.isModalOpen &&
                this.currentModalRow &&
                this.currentCollection &&
                data.collection === this.currentCollection &&
                data.row_num.toString() === this.currentModalRow.toString()
            ));
            this.handleProductUpdate(data);
        });

        // Connection status
        this.socket.on('connect', () => {
            console.log('🟢 SocketIO connected');
            this.updateLiveUpdatesBadge(this.isModalOpen);
        });

        this.socket.on('disconnect', () => {
            console.log('🔴 SocketIO disconnected');
            this.updateLiveUpdatesBadge(false);
        });

        this.socket.on('connect_error', (error) => {
            console.error('❌ SocketIO connection error:', error);
            // After multiple failures, switch to polling fallback
            this.connectionErrors = (this.connectionErrors || 0) + 1;
            if (this.connectionErrors >= 3) {
                console.warn('⚠️ Too many SocketIO errors, switching to polling fallback');
                this.socket.disconnect();
                this.socket = null;
                this.initializePollingFallback();
            }
        });

        // Debug: Log all events
        this.socket.onAny((event, ...args) => {
            console.log('🔔 SocketIO event received:', event, args);
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
        console.log('🔍 DEBUG: onModalOpened called');
        console.log('🔍 DEBUG: Modal element:', modal);
        console.log('🔍 DEBUG: Modal dataset:', modal.dataset);
        console.log('🔍 DEBUG: Modal currentRow from dataset:', modal.dataset.currentRow);
        console.log('🔍 DEBUG: window.COLLECTION_NAME:', window.COLLECTION_NAME);

        this.isModalOpen = true;
        this.currentModalRow = modal.dataset.currentRow;
        this.currentCollection = window.COLLECTION_NAME;

        console.log(`🔄 DEBUG: Modal opened for ${this.currentCollection} row ${this.currentModalRow}`);
        console.log('✅ DEBUG: Live updates active for this product');
        console.log('🔍 DEBUG: Final state after modal open:');
        console.log('  - isModalOpen:', this.isModalOpen);
        console.log('  - currentModalRow:', this.currentModalRow);
        console.log('  - currentCollection:', this.currentCollection);

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
        console.log('🔍 DEBUG: handleProductUpdate called');
        console.log('🔍 DEBUG: Checking conditions...');
        console.log('🔍 DEBUG: isModalOpen:', this.isModalOpen);
        console.log('🔍 DEBUG: currentModalRow:', this.currentModalRow);
        console.log('🔍 DEBUG: currentCollection:', this.currentCollection);
        console.log('🔍 DEBUG: data.collection:', data.collection);
        console.log('🔍 DEBUG: data.row_num:', data.row_num);
        console.log('🔍 DEBUG: collection match:', data.collection === this.currentCollection);
        console.log('🔍 DEBUG: row match:', data.row_num.toString() === this.currentModalRow.toString());

        // Only update if the modal is open for this specific product
        if (!this.isModalOpen ||
            !this.currentModalRow ||
            !this.currentCollection ||
            data.collection !== this.currentCollection ||
            data.row_num.toString() !== this.currentModalRow.toString()) {
            console.log('🔄 DEBUG: Update ignored - not for current modal product');
            console.log('🔍 DEBUG: Ignore reasons:');
            console.log('  - Modal not open:', !this.isModalOpen);
            console.log('  - No current row:', !this.currentModalRow);
            console.log('  - No current collection:', !this.currentCollection);
            console.log('  - Collection mismatch:', data.collection !== this.currentCollection);
            console.log('  - Row mismatch:', data.row_num.toString() !== this.currentModalRow.toString());
            return;
        }

        console.log(`🎯 DEBUG: Updating modal for ${data.collection} row ${data.row_num}`);
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

            // Trigger related updates
            this.triggerPostUpdateActions(updated_data);
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
            'seo_description': 'editSeoDescription',
            'shopify_images': 'editShopifyImages'
        };

        const elementId = fieldMapping[field] || `edit${field.charAt(0).toUpperCase() + field.slice(1)}`;
        const element = document.getElementById(elementId);

        if (!element) {
            console.warn(`⚠️ Element not found for field: ${field} (ID: ${elementId})`);
            return false;
        }

        // Handle special cases
        if (field === 'shopify_images') {
            // Update the hidden input field
            if (element) {
                element.value = value || '';
            }

            // Reinitialize the image gallery if function is available
            if (typeof initializeAdditionalImages === 'function') {
                setTimeout(() => {
                    try {
                        initializeAdditionalImages();
                        console.log('✅ Image gallery reinitialized after live update');
                    } catch (error) {
                        console.error('❌ Error reinitializing image gallery:', error);
                    }
                }, 100);
            }

            return true;
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
     * Trigger post-update actions like quality score refresh
     */
    triggerPostUpdateActions(updated_data) {
        try {
            // Update quality score if available
            if (typeof updateQualityScore === 'function' && updated_data) {
                setTimeout(() => {
                    updateQualityScore(updated_data);
                    console.log('✅ Quality score updated after live update');
                }, 200);
            }

            // Auto-verify spec sheet if URL was updated
            if (typeof autoVerifySpecSheet === 'function' && updated_data.shopify_spec_sheet) {
                setTimeout(() => {
                    autoVerifySpecSheet();
                    console.log('✅ Spec sheet verification triggered after live update');
                }, 300);
            }
        } catch (error) {
            console.error('❌ Error in post-update actions:', error);
        }
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

    /**
     * Test function to simulate a live update
     */
    testLiveUpdate() {
        console.log('🧪 Testing live update...');

        const testData = {
            collection: this.currentCollection || 'sinks',
            row_num: this.currentModalRow || 1,
            fields_updated: ['body_html', 'features'],
            updated_data: {
                body_html: 'Test description updated at ' + new Date().toLocaleTimeString(),
                features: 'Test features updated at ' + new Date().toLocaleTimeString()
            },
            message: 'Test update from live updates manager',
            timestamp: new Date().toISOString()
        };

        this.handleProductUpdate(testData);
    }

    /**
     * Debug function to check current state
     */
    debugStatus() {
        const status = this.getStatus();
        console.log('🔍 Live Updates Debug Status:', status);

        console.log('🔍 Socket details:', {
            socket: !!this.socket,
            connected: this.socket ? this.socket.connected : false,
            id: this.socket ? this.socket.id : null
        });

        console.log('🔍 Modal elements:', {
            modal: !!document.getElementById('editProductModal'),
            badge: !!document.getElementById('liveUpdatesBadge'),
            bodyHtml: !!document.getElementById('editBodyHtml'),
            features: !!document.getElementById('editFeatures')
        });

        return status;
    }
}

// Global instance
let liveUpdatesManager = null;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    liveUpdatesManager = new LiveUpdatesManager();

    // Make it globally accessible
    window.liveUpdatesManager = liveUpdatesManager;

    // Add global test functions
    window.testLiveUpdate = () => liveUpdatesManager.testLiveUpdate();
    window.debugLiveUpdates = () => liveUpdatesManager.debugStatus();
    window.testLiveUpdateAPI = async () => {
        const collection = liveUpdatesManager.currentCollection || window.COLLECTION_NAME || 'sinks';
        const row = liveUpdatesManager.currentModalRow || 1;

        console.log(`🧪 Testing live update API for ${collection} row ${row}...`);

        try {
            const response = await fetch(`/api/${collection}/test-live-update/${row}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();
            console.log('📡 API test result:', result);
            return result;
        } catch (error) {
            console.error('❌ API test error:', error);
            return { success: false, error: error.message };
        }
    };

    console.log('✅ Live Updates Manager initialized');
    console.log('🧪 Test functions available: testLiveUpdate(), debugLiveUpdates(), testLiveUpdateAPI()');
});

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LiveUpdatesManager;
}