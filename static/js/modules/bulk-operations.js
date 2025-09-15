/**
 * Bulk Operations System - Enterprise-level batch processing
 * Features: Mass updates, batch AI processing, data transformation
 */

class BulkOperations {
    constructor() {
        this.selectedProducts = new Set();
        this.operationQueue = [];
        this.isProcessing = false;
        this.progress = { current: 0, total: 0 };

        this.init();
    }

    /**
     * Initialize bulk operations
     */
    init() {
        console.log('📦 Initializing Bulk Operations System...');

        this.setupSelectionHandlers();
        this.createBulkActionBar();
        this.setupKeyboardShortcuts();

        console.log('✅ Bulk Operations System ready');
    }

    /**
     * Setup product selection handlers
     */
    setupSelectionHandlers() {
        // Listen for checkbox changes
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('product-checkbox')) {
                this.handleProductSelection(e.target);
            }
        });

        // Listen for select all checkbox
        document.addEventListener('change', (e) => {
            if (e.target.id === 'selectAllProducts') {
                this.handleSelectAll(e.target.checked);
            }
        });

        // Keyboard shortcuts for selection
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'a') {
                e.preventDefault();
                this.selectAll();
            }
        });
    }

    /**
     * Handle individual product selection
     */
    handleProductSelection(checkbox) {
        const rowNum = parseInt(checkbox.dataset.row);

        if (checkbox.checked) {
            this.selectedProducts.add(rowNum);
        } else {
            this.selectedProducts.delete(rowNum);
        }

        this.updateSelectionUI();
        this.updateBulkActionBar();
    }

    /**
     * Handle select all toggle
     */
    handleSelectAll(checked) {
        const checkboxes = document.querySelectorAll('.product-checkbox');

        checkboxes.forEach(checkbox => {
            checkbox.checked = checked;
            const rowNum = parseInt(checkbox.dataset.row);

            if (checked) {
                this.selectedProducts.add(rowNum);
            } else {
                this.selectedProducts.delete(rowNum);
            }
        });

        this.updateSelectionUI();
        this.updateBulkActionBar();
    }

    /**
     * Select all products
     */
    selectAll() {
        const selectAllCheckbox = document.getElementById('selectAllProducts');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = true;
            this.handleSelectAll(true);
        }
    }

    /**
     * Clear all selections
     */
    clearSelection() {
        this.selectedProducts.clear();

        document.querySelectorAll('.product-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });

        const selectAllCheckbox = document.getElementById('selectAllProducts');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
        }

        this.updateSelectionUI();
        this.updateBulkActionBar();
    }

    /**
     * Create bulk action bar
     */
    createBulkActionBar() {
        const actionBar = document.createElement('div');
        actionBar.id = 'bulkActionBar';
        actionBar.className = 'bulk-action-bar';
        actionBar.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #2c3e50;
            color: white;
            padding: 16px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.3);
            z-index: 1000;
            display: none;
            align-items: center;
            gap: 16px;
            min-width: 600px;
        `;

        actionBar.innerHTML = `
            <div class="selection-info">
                <span id="selectionCount">0 selected</span>
            </div>

            <div class="bulk-actions" style="display: flex; gap: 8px;">
                <button class="btn btn-primary btn-sm" onclick="window.bulkOps.showBulkEditModal()">
                    <i class="fas fa-edit me-1"></i>Bulk Edit
                </button>
                <button class="btn btn-success btn-sm" onclick="window.bulkOps.bulkGenerateDescriptions()">
                    <i class="fas fa-magic me-1"></i>Generate Descriptions
                </button>
                <button class="btn btn-info btn-sm" onclick="window.bulkOps.bulkGenerateFeatures()">
                    <i class="fas fa-list me-1"></i>Generate Features
                </button>
                <button class="btn btn-warning btn-sm" onclick="window.bulkOps.bulkExtractImages()">
                    <i class="fas fa-images me-1"></i>Extract Images
                </button>
                <button class="btn btn-danger btn-sm" onclick="window.bulkOps.bulkDelete()">
                    <i class="fas fa-trash me-1"></i>Delete
                </button>
            </div>

            <div class="bulk-progress" id="bulkProgress" style="display: none;">
                <div class="progress" style="width: 200px; height: 20px;">
                    <div class="progress-bar" id="bulkProgressBar" style="width: 0%"></div>
                </div>
                <span id="bulkProgressText">0 / 0</span>
            </div>

            <button class="btn btn-outline-light btn-sm" onclick="window.bulkOps.clearSelection()">
                <i class="fas fa-times"></i>
            </button>
        `;

        document.body.appendChild(actionBar);
        this.actionBar = actionBar;
    }

    /**
     * Update bulk action bar visibility and content
     */
    updateBulkActionBar() {
        const count = this.selectedProducts.size;

        if (count > 0) {
            this.actionBar.style.display = 'flex';
            document.getElementById('selectionCount').textContent =
                `${count} product${count === 1 ? '' : 's'} selected`;
        } else {
            this.actionBar.style.display = 'none';
        }
    }

    /**
     * Update selection UI indicators
     */
    updateSelectionUI() {
        // Add visual indicators to selected products
        document.querySelectorAll('.product-card').forEach(card => {
            const rowNum = parseInt(card.dataset.row);
            if (this.selectedProducts.has(rowNum)) {
                card.classList.add('selected');
                card.style.outline = '2px solid #007bff';
            } else {
                card.classList.remove('selected');
                card.style.outline = '';
            }
        });
    }

    /**
     * Show bulk edit modal
     */
    showBulkEditModal() {
        const modal = this.createBulkEditModal();
        document.body.appendChild(modal);

        const bootstrapModal = new bootstrap.Modal(modal);
        bootstrapModal.show();

        modal.addEventListener('hidden.bs.modal', () => {
            modal.remove();
        });
    }

    /**
     * Create bulk edit modal
     */
    createBulkEditModal() {
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-edit me-2"></i>Bulk Edit ${this.selectedProducts.size} Products
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-info">
                            <i class="fas fa-info-circle me-2"></i>
                            Changes will be applied to all ${this.selectedProducts.size} selected products.
                            Leave fields empty to skip updating them.
                        </div>

                        <div class="row">
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label class="form-label">Vendor/Brand</label>
                                    <input type="text" class="form-control" id="bulkVendor" placeholder="Leave empty to skip">
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label class="form-label">Tags</label>
                                    <input type="text" class="form-control" id="bulkTags" placeholder="Comma-separated tags">
                                </div>
                            </div>
                        </div>

                        <div class="row">
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label class="form-label">RRP Price ($)</label>
                                    <input type="number" step="0.01" class="form-control" id="bulkRrpPrice" placeholder="Leave empty to skip">
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label class="form-label">Sale Price ($)</label>
                                    <input type="number" step="0.01" class="form-control" id="bulkSalePrice" placeholder="Leave empty to skip">
                                </div>
                            </div>
                        </div>

                        <div class="mb-3">
                            <label class="form-label">Care Instructions</label>
                            <textarea class="form-control" id="bulkCareInstructions" rows="3" placeholder="Leave empty to skip"></textarea>
                        </div>

                        <div class="mb-3">
                            <label class="form-label">Update Mode</label>
                            <div class="form-check">
                                <input class="form-check-input" type="radio" name="updateMode" id="updateModeReplace" value="replace" checked>
                                <label class="form-check-label" for="updateModeReplace">
                                    Replace existing values
                                </label>
                            </div>
                            <div class="form-check">
                                <input class="form-check-input" type="radio" name="updateMode" id="updateModeAppend" value="append">
                                <label class="form-check-label" for="updateModeAppend">
                                    Append to existing values (for tags, features, etc.)
                                </label>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="window.bulkOps.executeBulkEdit(this)">
                            <i class="fas fa-save me-1"></i>Apply Changes
                        </button>
                    </div>
                </div>
            </div>
        `;

        return modal;
    }

    /**
     * Execute bulk edit operation
     */
    async executeBulkEdit(button) {
        const updates = this.collectBulkEditData();

        if (Object.keys(updates).length === 0) {
            alert('No changes specified. Please fill in at least one field.');
            return;
        }

        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Applying...';

        try {
            await this.processBulkOperation('edit', updates);

            // Close modal
            const modal = button.closest('.modal');
            bootstrap.Modal.getInstance(modal).hide();

            this.showSuccessMessage(`Successfully updated ${this.selectedProducts.size} products`);

            // Refresh data
            if (window.loadProductsData) {
                window.loadProductsData();
            }

        } catch (error) {
            console.error('Bulk edit error:', error);
            this.showErrorMessage('Bulk edit failed: ' + error.message);
        } finally {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-save me-1"></i>Apply Changes';
        }
    }

    /**
     * Collect bulk edit form data
     */
    collectBulkEditData() {
        const updates = {};
        const updateMode = document.querySelector('input[name="updateMode"]:checked').value;

        const fields = [
            { id: 'bulkVendor', key: 'vendor' },
            { id: 'bulkTags', key: 'tags' },
            { id: 'bulkRrpPrice', key: 'shopify_compare_price' },
            { id: 'bulkSalePrice', key: 'shopify_price' },
            { id: 'bulkCareInstructions', key: 'care_instructions' }
        ];

        fields.forEach(field => {
            const element = document.getElementById(field.id);
            if (element && element.value.trim()) {
                updates[field.key] = element.value.trim();
            }
        });

        if (Object.keys(updates).length > 0) {
            updates._updateMode = updateMode;
        }

        return updates;
    }

    /**
     * Bulk generate descriptions
     */
    async bulkGenerateDescriptions() {
        if (!confirm(`Generate AI descriptions for ${this.selectedProducts.size} products? This may take several minutes.`)) {
            return;
        }

        await this.processBulkOperation('generate-descriptions');
    }

    /**
     * Bulk generate features
     */
    async bulkGenerateFeatures() {
        if (!confirm(`Generate AI features for ${this.selectedProducts.size} products? This will create 5 key features for each product.`)) {
            return;
        }

        await this.processBulkOperation('generate-features');
    }

    /**
     * Bulk extract images
     */
    async bulkExtractImages() {
        if (!confirm(`Extract images for ${this.selectedProducts.size} products? This may take several minutes.`)) {
            return;
        }

        await this.processBulkOperation('extract-images');
    }

    /**
     * Bulk delete products
     */
    async bulkDelete() {
        if (!confirm(`Are you sure you want to delete ${this.selectedProducts.size} products? This action cannot be undone.`)) {
            return;
        }

        await this.processBulkOperation('delete');
    }

    /**
     * Process bulk operation with progress tracking
     */
    async processBulkOperation(operation, data = null) {
        this.isProcessing = true;
        this.progress = { current: 0, total: this.selectedProducts.size };

        // Show progress bar
        this.showProgress();

        try {
            const selectedArray = Array.from(this.selectedProducts);

            for (let i = 0; i < selectedArray.length; i++) {
                const rowNum = selectedArray[i];

                try {
                    await this.processIndividualOperation(operation, rowNum, data);
                    this.progress.current++;
                } catch (error) {
                    console.error(`Error processing row ${rowNum}:`, error);
                    // Continue with other items
                    this.progress.current++;
                }

                this.updateProgress();

                // Small delay to prevent overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            this.showSuccessMessage(`Bulk ${operation} completed successfully!`);

        } catch (error) {
            console.error('Bulk operation error:', error);
            this.showErrorMessage(`Bulk ${operation} failed: ` + error.message);
        } finally {
            this.hideProgress();
            this.isProcessing = false;
        }
    }

    /**
     * Process individual operation
     */
    async processIndividualOperation(operation, rowNum, data) {
        const endpoint = `/api/${window.COLLECTION_NAME}/products/${rowNum}/${operation}`;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data || {})
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || 'Operation failed');
        }

        return result;
    }

    /**
     * Show progress bar
     */
    showProgress() {
        const progressDiv = document.getElementById('bulkProgress');
        const actionsDiv = this.actionBar.querySelector('.bulk-actions');

        if (progressDiv && actionsDiv) {
            progressDiv.style.display = 'flex';
            actionsDiv.style.display = 'none';
        }
    }

    /**
     * Update progress bar
     */
    updateProgress() {
        const progressBar = document.getElementById('bulkProgressBar');
        const progressText = document.getElementById('bulkProgressText');

        if (progressBar && progressText) {
            const percentage = (this.progress.current / this.progress.total) * 100;
            progressBar.style.width = `${percentage}%`;
            progressText.textContent = `${this.progress.current} / ${this.progress.total}`;
        }
    }

    /**
     * Hide progress bar
     */
    hideProgress() {
        const progressDiv = document.getElementById('bulkProgress');
        const actionsDiv = this.actionBar.querySelector('.bulk-actions');

        if (progressDiv && actionsDiv) {
            progressDiv.style.display = 'none';
            actionsDiv.style.display = 'flex';
        }
    }

    /**
     * Setup keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+Shift+E for bulk edit
            if (e.ctrlKey && e.shiftKey && e.key === 'E') {
                e.preventDefault();
                if (this.selectedProducts.size > 0) {
                    this.showBulkEditModal();
                }
            }

            // Escape to clear selection
            if (e.key === 'Escape') {
                this.clearSelection();
            }
        });
    }

    /**
     * Show success message
     */
    showSuccessMessage(message) {
        // Use existing toast system or create simple alert
        if (window.showSuccessMessage) {
            window.showSuccessMessage(message);
        } else {
            alert(message);
        }
    }

    /**
     * Show error message
     */
    showErrorMessage(message) {
        // Use existing toast system or create simple alert
        if (window.showErrorMessage) {
            window.showErrorMessage(message);
        } else {
            alert(message);
        }
    }

    /**
     * Get selected products data
     */
    getSelectedProductsData() {
        const selectedData = {};
        this.selectedProducts.forEach(rowNum => {
            if (window.productsData && window.productsData[rowNum]) {
                selectedData[rowNum] = window.productsData[rowNum];
            }
        });
        return selectedData;
    }

    /**
     * Export selected products
     */
    exportSelected(format = 'csv') {
        const selectedData = this.getSelectedProductsData();

        if (Object.keys(selectedData).length === 0) {
            alert('No products selected for export');
            return;
        }

        // Implementation for CSV/Excel export
        console.log(`Exporting ${Object.keys(selectedData).length} products as ${format}`);
        // This would trigger download of exported data
    }

    /**
     * Get selection stats
     */
    getStats() {
        return {
            selectedCount: this.selectedProducts.size,
            isProcessing: this.isProcessing,
            progress: this.progress,
            selectedProducts: Array.from(this.selectedProducts)
        };
    }
}

// Global instance
window.bulkOps = new BulkOperations();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    if (window.bulkOps) {
        console.log('📦 Bulk Operations ready');
    }
});