/**
 * Shopify Sync Module
 * Handles all Shopify integration functionality
 */

class ShopifySync {
    constructor(collectionName) {
        this.collectionName = collectionName;
        this.uiUtils = null; // Will be set when UIUtils is available
        this.isSyncing = false;
    }

    /**
     * Test Shopify connection
     */
    async testConnection() {
        console.log('🧪 Testing Shopify connection...');

        try {
            const response = await fetch('/api/shopify/test-connection');
            const result = await response.json();

            if (result.success && result.connected) {
                this.uiUtils?.showSuccessMessage('✅ Shopify connection successful!\n\n' + result.message);
                return true;
            } else {
                this.uiUtils?.showErrorMessage('❌ Shopify connection failed:\n\n' + result.message);
                return false;
            }
        } catch (error) {
            console.error('❌ Error testing Shopify connection:', error);
            this.uiUtils?.showErrorMessage('❌ Error testing Shopify connection:\n\n' + error.message);
            return false;
        }
    }

    /**
     * Sync products to Shopify
     */
    async syncProductsToShopify(selectedProducts, options = {}) {
        if (!selectedProducts || selectedProducts.length === 0) {
            this.uiUtils?.showErrorMessage('Please select products first by checking the boxes on product cards');
            return;
        }

        const {
            createNew = true,
            setActive = false,
            confirmationMessage = null
        } = options;

        // Default confirmation message
        const defaultMessage = createNew ? 
            `Create/update ${selectedProducts.length} products in Shopify?` :
            `Update ${selectedProducts.length} existing products in Shopify?`;

        const confirmed = confirm(confirmationMessage || defaultMessage);
        if (!confirmed) return;

        console.log(`🛍️ Starting Shopify sync for ${selectedProducts.length} products`);

        if (this.isSyncing) {
            this.uiUtils?.showWarningMessage('Shopify sync already in progress. Please wait...');
            return;
        }

        this.isSyncing = true;
        this.showSyncProgress(selectedProducts.length, 0);

        try {
            const response = await fetch(`/api/${this.collectionName}/shopify/sync-products`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    selected_rows: selectedProducts,
                    create_new: createNew,
                    set_active: setActive
                })
            });

            const result = await response.json();

            this.hideSyncProgress();

            if (result.success) {
                console.log('✅ Shopify sync successful:', result);
                this.showSyncResults(result);
                
                // Refresh product data to show updated Shopify IDs
                if (window.dataManager) {
                    window.dataManager.loadProductData();
                }
            } else {
                console.error('❌ Shopify sync failed:', result.message);
                this.uiUtils?.showErrorMessage(`Shopify sync failed:\n\n${result.message}`);
            }
        } catch (error) {
            console.error('❌ Error during Shopify sync:', error);
            this.uiUtils?.showErrorMessage(`Error during Shopify sync:\n\n${error.message}`);
            this.hideSyncProgress();
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Pull images from Shopify
     */
    async pullImagesFromShopify(selectedProducts) {
        if (!selectedProducts || selectedProducts.length === 0) {
            this.uiUtils?.showErrorMessage('Please select products first');
            return;
        }

        const confirmed = confirm(`Pull product images from Shopify for ${selectedProducts.length} selected products?\n\nThis will update the Image URL fields in your spreadsheet.`);
        if (!confirmed) return;

        console.log(`📥 Pulling images from Shopify for ${selectedProducts.length} products`);

        this.showSyncProgress(selectedProducts.length, 0, 'Pulling images from Shopify...');

        try {
            const response = await fetch(`/api/${this.collectionName}/shopify/pull-images`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    selected_rows: selectedProducts
                })
            });

            const result = await response.json();

            this.hideSyncProgress();

            if (result.success) {
                console.log('✅ Image pull successful:', result);
                this.showSyncResults(result, 'Image Pull Results');
                
                // Refresh product data
                if (window.dataManager) {
                    window.dataManager.loadProductData();
                }
            } else {
                console.error('❌ Image pull failed:', result.message);
                this.uiUtils?.showErrorMessage(`Image pull failed:\n\n${result.message}`);
            }
        } catch (error) {
            console.error('❌ Error during image pull:', error);
            this.uiUtils?.showErrorMessage(`Error during image pull:\n\n${error.message}`);
            this.hideSyncProgress();
        }
    }

    /**
     * Push images to Shopify
     */
    async pushImagesToShopify(selectedProducts) {
        if (!selectedProducts || selectedProducts.length === 0) {
            this.uiUtils?.showErrorMessage('Please select products first');
            return;
        }

        const confirmed = confirm(`Push product images to Shopify for ${selectedProducts.length} selected products?\n\nThis will sync images from your spreadsheet to Shopify.`);
        if (!confirmed) return;

        console.log(`📤 Pushing images to Shopify for ${selectedProducts.length} products`);

        this.showSyncProgress(selectedProducts.length, 0, 'Pushing images to Shopify...');

        try {
            const response = await fetch(`/api/${this.collectionName}/shopify/sync-images`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    selected_rows: selectedProducts
                })
            });

            const result = await response.json();

            this.hideSyncProgress();

            if (result.success) {
                console.log('✅ Image sync successful:', result);
                this.showSyncResults(result, 'Image Sync Results');
            } else {
                console.error('❌ Image sync failed:', result.message);
                this.uiUtils?.showErrorMessage(`Image sync failed:\n\n${result.message}`);
            }
        } catch (error) {
            console.error('❌ Error during image sync:', error);
            this.uiUtils?.showErrorMessage(`Error during image sync:\n\n${error.message}`);
            this.hideSyncProgress();
        }
    }

    /**
     * Show Shopify operations modal
     */
    showShopifyModal(selectedProducts) {
        if (!selectedProducts || selectedProducts.length === 0) {
            this.uiUtils?.showErrorMessage('Please select products first');
            return;
        }

        // Create modal if it doesn't exist
        if (!document.getElementById('shopifyModal')) {
            this.createShopifyModal();
        }

        // Update modal with selected products count
        document.getElementById('shopifySelectedCount').textContent = selectedProducts.length;

        // Store selected products for modal actions
        this.modalSelectedProducts = selectedProducts;

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('shopifyModal'));
        modal.show();
    }

    /**
     * Create Shopify operations modal
     */
    createShopifyModal() {
        const modalHTML = `
            <div class="modal fade" id="shopifyModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="fas fa-store me-2"></i>Shopify Operations
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-info">
                                <i class="fas fa-info-circle me-2"></i>
                                <span id="shopifySelectedCount">0</span> products selected for Shopify operations.
                            </div>

                            <div class="row">
                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-header">
                                            <h6>Product Sync</h6>
                                        </div>
                                        <div class="card-body">
                                            <button class="btn btn-primary btn-block mb-2" onclick="window.shopifySync.syncFromModal('create')">
                                                <i class="fas fa-plus me-1"></i> Create New Products
                                            </button>
                                            <button class="btn btn-outline-primary btn-block mb-2" onclick="window.shopifySync.syncFromModal('update')">
                                                <i class="fas fa-sync me-1"></i> Update Existing Products
                                            </button>
                                            <button class="btn btn-success btn-block" onclick="window.shopifySync.syncFromModal('create-active')">
                                                <i class="fas fa-check-circle me-1"></i> Create & Set Active
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-header">
                                            <h6>Image Operations</h6>
                                        </div>
                                        <div class="card-body">
                                            <button class="btn btn-info btn-block mb-2" onclick="window.shopifySync.pullImagesFromModal()">
                                                <i class="fas fa-download me-1"></i> Pull Images from Shopify
                                            </button>
                                            <button class="btn btn-outline-info btn-block mb-2" onclick="window.shopifySync.pushImagesToModal()">
                                                <i class="fas fa-upload me-1"></i> Push Images to Shopify
                                            </button>
                                            <button class="btn btn-warning btn-block" onclick="window.shopifySync.testConnection()">
                                                <i class="fas fa-plug me-1"></i> Test Connection
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    /**
     * Modal action handlers
     */
    syncFromModal(action) {
        const selectedProducts = this.modalSelectedProducts;
        
        switch(action) {
            case 'create':
                this.syncProductsToShopify(selectedProducts, { 
                    createNew: true, 
                    setActive: false 
                });
                break;
            case 'update':
                this.syncProductsToShopify(selectedProducts, { 
                    createNew: false, 
                    setActive: false 
                });
                break;
            case 'create-active':
                this.syncProductsToShopify(selectedProducts, { 
                    createNew: true, 
                    setActive: true 
                });
                break;
        }

        // Close modal
        bootstrap.Modal.getInstance(document.getElementById('shopifyModal')).hide();
    }

    pullImagesFromModal() {
        this.pullImagesFromShopify(this.modalSelectedProducts);
        bootstrap.Modal.getInstance(document.getElementById('shopifyModal')).hide();
    }

    pushImagesToModal() {
        this.pushImagesToShopify(this.modalSelectedProducts);
        bootstrap.Modal.getInstance(document.getElementById('shopifyModal')).hide();
    }

    /**
     * Progress indicator methods
     */
    showSyncProgress(total, current, message = 'Syncing to Shopify...') {
        // Remove existing progress indicator
        this.hideSyncProgress();

        const progressHTML = `
            <div id="shopifyProgress" style="
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background: white; padding: 30px; border-radius: 12px;
                box-shadow: 0 8px 25px rgba(0,0,0,0.3); z-index: 10000;
                min-width: 300px; text-align: center;
            ">
                <div class="mb-3">
                    <i class="fas fa-store fa-2x text-primary"></i>
                </div>
                <h6>${message}</h6>
                <div class="progress mb-3">
                    <div class="progress-bar progress-bar-striped progress-bar-animated" 
                         style="width: ${(current/total)*100}%"></div>
                </div>
                <div class="text-muted">
                    ${current} of ${total} products processed
                </div>
            </div>
            <div id="shopifyProgressBackdrop" style="
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.5); z-index: 9999;
            "></div>
        `;

        document.body.insertAdjacentHTML('beforeend', progressHTML);
    }

    updateSyncProgress(current, total) {
        const progressBar = document.querySelector('#shopifyProgress .progress-bar');
        const progressText = document.querySelector('#shopifyProgress .text-muted');
        
        if (progressBar) {
            progressBar.style.width = `${(current/total)*100}%`;
        }
        
        if (progressText) {
            progressText.textContent = `${current} of ${total} products processed`;
        }
    }

    hideSyncProgress() {
        const progress = document.getElementById('shopifyProgress');
        const backdrop = document.getElementById('shopifyProgressBackdrop');
        
        if (progress) progress.remove();
        if (backdrop) backdrop.remove();
    }

    /**
     * Show sync results
     */
    showSyncResults(result, title = 'Shopify Sync Results') {
        const results = result.results || {};
        const successful = results.successful || 0;
        const failed = results.failed || 0;
        const skipped = results.skipped || 0;

        let message = `${title}\n\n`;
        message += `✅ Successful: ${successful}\n`;
        message += `❌ Failed: ${failed}\n`;
        message += `⏭️ Skipped: ${skipped}\n\n`;

        if (result.message) {
            message += result.message;
        }

        // Show detailed results if available
        if (results.details && results.details.length > 0) {
            const failedDetails = results.details.filter(d => d.status === 'failed');
            if (failedDetails.length > 0) {
                message += '\n\nErrors:\n';
                failedDetails.slice(0, 5).forEach(detail => {
                    message += `Row ${detail.row}: ${detail.message}\n`;
                });
                if (failedDetails.length > 5) {
                    message += `... and ${failedDetails.length - 5} more errors`;
                }
            }
        }

        if (failed === 0) {
            this.uiUtils?.showSuccessMessage(message);
        } else if (successful > failed) {
            this.uiUtils?.showWarningMessage(message);
        } else {
            this.uiUtils?.showErrorMessage(message);
        }
    }

    /**
     * Get sync status
     */
    getSyncStatus() {
        return {
            isSyncing: this.isSyncing,
            collection: this.collectionName
        };
    }

    /**
     * Set dependencies
     */
    setUIUtils(uiUtils) {
        this.uiUtils = uiUtils;
    }
}

// Export for global use
window.ShopifySync = ShopifySync;