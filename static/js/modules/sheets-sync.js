/**
 * Sheets Sync Module
 * Handles all Google Sheets synchronization functionality
 */

class SheetsSync {
    constructor(collectionName) {
        this.collectionName = collectionName;
        this.selectedProducts = [];
        this.isSyncing = false;
        this.uiUtils = null; // Will be set when UIUtils is available
    }

    /**
     * Update selected products and sync with backend
     */
    updateSelectedProductsWithBackend() {
        console.log('🔄 Individual checkbox clicked: updateSelectedProductsWithBackend called');

        // Update local array first
        this.selectedProducts = [];
        const checkedBoxes = [];

        $('.product-checkbox:checked').each((index, element) => {
            const rowNum = $(element).data('row');
            this.selectedProducts.push(rowNum);
            checkedBoxes.push({
                row: rowNum,
                checked: true
            });
        });

        // Also track unchecked boxes for complete state sync
        const uncheckedBoxes = [];
        $('.product-checkbox:not(:checked)').each((index, element) => {
            const rowNum = $(element).data('row');
            uncheckedBoxes.push({
                row: rowNum,
                checked: false
            });
        });

        // Combine all checkbox states
        const allCheckboxStates = [...checkedBoxes, ...uncheckedBoxes];

        console.log(`✅ Selected products: ${this.selectedProducts.length}`);
        console.log(`📊 Total checkbox states to sync: ${allCheckboxStates.length}`);

        // Trigger Google Sheets update via backend API
        if (allCheckboxStates.length > 0) {
            this.syncCheckboxStatesToBackend(allCheckboxStates);
        }

        // Update UI elements
        this.updateSelectionUI();
    }

    /**
     * Sync checkbox states to backend
     */
    async syncCheckboxStatesToBackend(checkboxStates) {
        // Don't send if no checkboxes (initial load state)
        if (checkboxStates.length === 0) {
            console.log('⏭️ Skipping backend sync - no checkbox states to sync');
            return;
        }

        if (this.isSyncing) {
            console.log('⏭️ Sync already in progress, skipping');
            return;
        }

        console.log(`📡 Syncing ${checkboxStates.length} checkbox states to Google Sheets...`);

        this.isSyncing = true;

        // Show subtle loading indicator
        this.showSyncIndicator(true);

        try {
            const response = await fetch(`/api/${this.collectionName}/sync-checkboxes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    collection: this.collectionName,
                    checkbox_states: checkboxStates,
                    timestamp: new Date().toISOString()
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.success) {
                console.log('✅ Google Sheets checkbox sync successful:', data);
                this.showSyncSuccess();

                // Optional: Show how many rows were updated
                if (data.updated_rows > 0) {
                    console.log(`📝 Updated ${data.updated_rows} rows in Google Sheets`);
                }
            } else {
                console.error('❌ Google Sheets checkbox sync failed:', data.error);
                this.showSyncError(`Sync failed: ${data.error}`);
            }
        } catch (error) {
            console.error('❌ Error syncing checkbox states to Google Sheets:', error);
            this.showSyncError(`Sync error: ${error.message}`);
        } finally {
            this.isSyncing = false;
            this.showSyncIndicator(false);
        }
    }

    /**
     * Update checkbox after cleaning operation
     */
    async updateCheckboxAfterCleaning(rowNum) {
        console.log(`📋 Updating checkbox for row ${rowNum} after cleaning...`);

        // Create checkbox state for this single product (set to checked/TRUE)
        const checkboxState = [{
            row: rowNum,
            checked: true
        }];

        try {
            const response = await fetch(`/api/${this.collectionName}/sync-checkboxes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    collection: this.collectionName,
                    checkbox_states: checkboxState,
                    timestamp: new Date().toISOString(),
                    source: 'modal_clean_data'  // Add identifier
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.success) {
                console.log('✅ Checkbox updated in Google Sheets after cleaning:', data);

                // Also update the main page checkbox visually
                const mainPageCheckbox = $(`.product-checkbox[data-row="${rowNum}"]`);
                if (mainPageCheckbox.length) {
                    mainPageCheckbox.prop('checked', true);
                    console.log(`✅ Also checked the main page checkbox for row ${rowNum}`);
                }

                // Show brief success indicator
                this.showSyncSuccess();
            } else {
                console.error('❌ Failed to update checkbox after cleaning:', data.error);
            }
        } catch (error) {
            console.error('❌ Error updating checkbox after cleaning:', error);
        }
    }

    /**
     * Setup event listeners for checkboxes
     */
    setupEventListeners() {
        console.log('🔧 Setting up checkbox event listeners...');

        // Select all products
        $('#selectAllProducts').on('change', (event) => {
            console.log('🔄 Select All clicked:', event.target.checked);
            $('.product-checkbox').prop('checked', event.target.checked);
            this.updateSelectedProductsWithBackend();
        });

        // Individual product selection with proper event delegation
        $(document).on('change', '.product-checkbox', (event) => {
            event.stopPropagation(); // Prevent card click
            console.log('🔄 Individual checkbox clicked:', $(event.target).data('row'), event.target.checked);
            this.updateSelectedProductsWithBackend();
        });

        // Prevent checkbox clicks from triggering card click
        $(document).on('click', '.product-checkbox', (event) => {
            event.stopPropagation();
            console.log('🔄 Checkbox click prevented from triggering card click');
        });

        console.log('✅ Checkbox event listeners set up successfully');
    }

    /**
     * Update selection UI elements
     */
    updateSelectionUI() {
        const totalCheckboxes = $('.product-checkbox').length;
        const checkedCheckboxes = $('.product-checkbox:checked').length;

        const selectAllCheckbox = $('#selectAllProducts');

        if (checkedCheckboxes === 0) {
            selectAllCheckbox.prop('indeterminate', false).prop('checked', false);
        } else if (checkedCheckboxes === totalCheckboxes) {
            selectAllCheckbox.prop('indeterminate', false).prop('checked', true);
        } else {
            selectAllCheckbox.prop('indeterminate', true);
        }

        // Update any selection counter displays
        const selectionCounter = $('.selection-counter');
        if (selectionCounter.length) {
            selectionCounter.text(`${checkedCheckboxes} selected`);
        }

        // Enable/disable bulk action buttons
        const bulkActionButtons = $('.bulk-action-btn');
        if (checkedCheckboxes > 0) {
            bulkActionButtons.prop('disabled', false);
        } else {
            bulkActionButtons.prop('disabled', true);
        }
    }

    /**
     * Get currently selected products
     */
    getSelectedProducts() {
        return this.selectedProducts;
    }

    /**
     * Clear all selections
     */
    clearAllSelections() {
        $('.product-checkbox').prop('checked', false);
        this.updateSelectedProductsWithBackend();
    }

    /**
     * Select all products
     */
    selectAllProducts() {
        $('.product-checkbox').prop('checked', true);
        this.updateSelectedProductsWithBackend();
    }

    /**
     * Select products by filter
     */
    selectProductsByFilter(filterFunction) {
        $('.product-checkbox').each((index, element) => {
            const rowNum = $(element).data('row');
            const shouldSelect = filterFunction(rowNum);
            $(element).prop('checked', shouldSelect);
        });
        this.updateSelectedProductsWithBackend();
    }

    /**
     * Visual feedback methods
     */
    showSyncIndicator(show) {
        if (show) {
            if (!$('#syncIndicator').length) {
                $('body').append(`
                    <div id="syncIndicator" style="
                        position: fixed; top: 20px; right: 20px;
                        background: rgba(102, 126, 234, 0.9); color: white;
                        padding: 8px 16px; border-radius: 20px; font-size: 14px;
                        z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    ">
                        <i class="fas fa-sync-alt fa-spin me-2"></i>Syncing to Google Sheets...
                    </div>
                `);
            }
        } else {
            $('#syncIndicator').remove();
        }
    }

    showSyncSuccess() {
        // Remove any existing success notification
        $('#syncSuccess').remove();

        $('body').append(`
            <div id="syncSuccess" style="
                position: fixed; top: 20px; right: 20px;
                background: rgba(40, 167, 69, 0.9); color: white;
                padding: 8px 16px; border-radius: 20px; font-size: 14px;
                z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            ">
                <i class="fas fa-check me-2"></i>Synced to Google Sheets
            </div>
        `);

        setTimeout(() => {
            $('#syncSuccess').fadeOut(300, function() { $(this).remove(); });
        }, 2000);
    }

    showSyncError(message) {
        console.error('📛 Sync Error:', message);

        // Remove any existing error notification
        $('#syncError').remove();

        $('body').append(`
            <div id="syncError" style="
                position: fixed; top: 20px; right: 20px;
                background: rgba(220, 53, 69, 0.9); color: white;
                padding: 8px 16px; border-radius: 20px; font-size: 14px;
                z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                cursor: pointer;
            " onclick="$(this).remove();">
                <i class="fas fa-exclamation-triangle me-2"></i>Sync Error
            </div>
        `);

        setTimeout(() => {
            $('#syncError').fadeOut(300, function() { $(this).remove(); });
        }, 5000);
    }

    /**
     * Test checkbox system
     */
    testCheckboxSystem() {
        console.log('🧪 Testing checkbox system...');

        const totalCheckboxes = $('.product-checkbox').length;
        console.log(`📊 Found ${totalCheckboxes} checkboxes`);

        if (totalCheckboxes === 0) {
            console.warn('⚠️ No checkboxes found! Make sure product cards are loaded.');
            this.uiUtils?.showWarningMessage('⚠️ No checkboxes found! Make sure product cards are loaded.');
            return;
        }

        // Test the first checkbox
        const firstCheckbox = $('.product-checkbox').first();
        if (firstCheckbox.length) {
            const rowNum = firstCheckbox.data('row');
            console.log(`🎯 Testing first checkbox (row ${rowNum})...`);

            this.uiUtils?.showInfoMessage(`🧪 Testing checkbox system!\n\nFound ${totalCheckboxes} checkboxes\nTesting checkbox for row ${rowNum}\n\nWatch the console for sync messages!`);

            // Check it
            firstCheckbox.prop('checked', true).trigger('change');

            setTimeout(() => {
                // Uncheck it
                firstCheckbox.prop('checked', false).trigger('change');
            }, 3000);

            return {
                totalCheckboxes: totalCheckboxes,
                firstCheckboxRow: rowNum,
                testCompleted: true
            };
        } else {
            console.warn('⚠️ No checkboxes available for testing');
            this.uiUtils?.showWarningMessage('⚠️ No checkboxes available for testing');
            return { error: 'No checkboxes available' };
        }
    }

    /**
     * Get sync statistics
     */
    getSyncStats() {
        return {
            selectedCount: this.selectedProducts.length,
            totalCount: $('.product-checkbox').length,
            isSyncing: this.isSyncing,
            lastSyncTime: this.lastSyncTime || null
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
window.SheetsSync = SheetsSync;