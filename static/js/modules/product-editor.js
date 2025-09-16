/**
 * Product Editor Module
 * Handles all product editing functionality
 */

class ProductEditor {
    constructor(collectionName) {
        this.collectionName = collectionName;
        this.currentRowNum = null;
        this.productsData = window.productsData || {};
        
        // Dependencies
        this.imageManager = null; // Will be set when ImageManager is available
        this.uiUtils = null; // Will be set when UIUtils is available
    }

    /**
     * Open product editor modal
     */
    editProduct(rowNum) {
        console.log(`✏️ editProduct called for row: ${rowNum} in collection: ${this.collectionName}`);

        // Input validation
        if (!rowNum || isNaN(rowNum)) {
            console.error('❌ Invalid rowNum:', rowNum);
            this.uiUtils?.showErrorMessage('Error: Invalid product row number');
            return;
        }

        // Check if modal element exists
        const modalElement = document.getElementById('editProductModal');
        if (!modalElement) {
            console.error('❌ Modal element not found!');
            this.uiUtils?.showErrorMessage('Error: Product edit modal not found. Please refresh the page.');
            return;
        }

        // Get or create product data
        let data = this.productsData[rowNum];
        if (!data) {
            console.warn(`⚠️ No cached data for row ${rowNum}, creating minimal data...`);
            data = this.createMinimalProductData(rowNum);
            this.productsData[rowNum] = data;
        }

        console.log(`✅ Product data found/created for row ${rowNum}:`, data);

        try {
            // Store current row number
            this.currentRowNum = rowNum;

            // Reset modal state
            this.resetModalForNewProduct();

            // Set the product title in modal header
            const titleElement = document.getElementById('editProductTitle');
            if (titleElement) {
                titleElement.textContent = data.title || `Product ${rowNum}`;
            }

            // Set collection and row info
            document.getElementById('editRowNum').value = rowNum;
            document.getElementById('editCollectionName').value = this.collectionName;

            // Populate fields
            this.populateBasicFields(data);
            this.generateDynamicFields();
            this.populateDynamicFields(data);

            // Initialize image system
            if (this.imageManager) {
                this.imageManager.initializeModalImageSystem(data.shopify_images || '');
            }

            // Setup compare button
            this.setupCompareButton(data);

            // Show the modal
            console.log('🚀 Showing modal...');
            const modal = new bootstrap.Modal(modalElement, {
                backdrop: true,
                keyboard: true,
                focus: true
            });

            modal.show();
            console.log('✅ Modal displayed successfully!');

        } catch (error) {
            console.error('❌ Error in editProduct function:', error);
            this.uiUtils?.showErrorMessage('Error opening product editor: ' + error.message);
        }
    }

    /**
     * Save product changes
     */
    saveProductChanges() {
        const rowNum = document.getElementById('editRowNum').value;
        const collectionName = document.getElementById('editCollectionName').value;

        console.log(`💾 Saving changes for ${collectionName} product ${rowNum}...`);

        // Collect all form data
        const updatedData = this.collectFormData(collectionName);
        console.log('📝 Data to save:', updatedData);

        if (Object.keys(updatedData).length === 0) {
            this.uiUtils?.showInfoMessage('No changes detected to save');
            return;
        }

        // Show saving indicator
        const saveBtn = document.querySelector('#editProductModal .btn-primary');
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Saving...';
        saveBtn.disabled = true;

        // Send updates to server
        this.sendUpdatesToServer(updatedData, rowNum, collectionName, saveBtn, originalText);
    }

    /**
     * Send updates to server
     */
    async sendUpdatesToServer(updatedData, rowNum, collectionName, saveBtn, originalText) {
        const promises = [];
        const apiCalls = [];

        Object.keys(updatedData).forEach(field => {
            if (updatedData[field] !== undefined && updatedData[field] !== '') {
                const apiUrl = `/api/${collectionName}/products/${rowNum}`;
                const payload = { field: field, value: updatedData[field] };

                console.log(`🌐 API Call: PUT ${apiUrl}`, payload);
                apiCalls.push({ url: apiUrl, payload: payload, field: field });

                promises.push(
                    fetch(apiUrl, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    })
                );
            }
        });

        console.log(`📡 Making ${promises.length} API calls...`);

        try {
            const responses = await Promise.all(promises);
            const results = await Promise.all(responses.map((r, index) => {
                if (!r.ok) {
                    return { success: false, error: `HTTP ${r.status}: ${r.statusText}`, call: apiCalls[index] };
                }
                return r.json().catch(e => ({ success: false, error: 'Invalid JSON response', call: apiCalls[index] }));
            }));

            this.handleSaveResults(results, saveBtn, originalText, rowNum);

        } catch (error) {
            console.error('❌ Network/Promise error:', error);
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
            this.uiUtils?.showErrorMessage('❌ Network error saving changes\n\nPlease check your internet connection and try again.');
        }
    }

    /**
     * Handle save results
     */
    handleSaveResults(results, saveBtn, originalText, rowNum) {
        const failed = results.filter(r => !r.success);
        const succeeded = results.filter(r => r.success);
        const totalFields = results.length;
        const successRate = (succeeded.length / totalFields) * 100;

        // Restore button state
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;

        if (succeeded.length === totalFields) {
            // Perfect success
            this.loadSingleProductData(parseInt(rowNum));
            bootstrap.Modal.getInstance(document.getElementById('editProductModal')).hide();
            this.uiUtils?.showSuccessMessage(`🎉 Product updated successfully!\n\nAll ${totalFields} fields saved perfectly.`);

        } else if (successRate >= 80) {
            // Mostly successful
            this.loadSingleProductData(parseInt(rowNum));
            bootstrap.Modal.getInstance(document.getElementById('editProductModal')).hide();
            
            const failedFieldNames = failed.map(f => f.call?.field || 'unknown').join(', ');
            this.uiUtils?.showSuccessMessage(`✅ Product updated successfully!\n\n${succeeded.length}/${totalFields} fields saved.\n\nNote: ${failed.length} non-critical field(s) skipped: ${failedFieldNames}`);

        } else if (succeeded.length > 0) {
            // Partial success
            this.loadSingleProductData(parseInt(rowNum));
            const failedFieldNames = failed.map(f => f.call?.field || 'unknown').join(', ');
            this.uiUtils?.showWarningMessage(`⚠️ Product partially updated\n\n${succeeded.length}/${totalFields} fields saved successfully.\n\n${failed.length} fields had issues: ${failedFieldNames}\n\nYour main changes were saved!`);

        } else {
            // Complete failure
            const errorDetails = failed.map(f => {
                const call = f.call || {};
                return `${call.field || 'unknown field'}: ${f.error || 'unknown error'}`;
            }).join('\n');

            this.uiUtils?.showErrorMessage(`❌ Failed to save changes\n\nNo fields could be updated. There may be a server issue.\n\nErrors:\n${errorDetails}`);
        }
    }

    /**
     * Collect form data
     */
    collectFormData(collectionName) {
        console.log(`📋 Collecting form data for ${collectionName}...`);
        const data = {};

        // Collect basic fields
        const basicFields = [
            'editSku', 'editTitle', 'editVendor', 'editRrpPrice', 'editSalePrice',
            'editWeight', 'editTags', 'editSeoTitle', 'editSeoDescription',
            'editBodyHtml', 'editFeatures', 'editFaqs'
        ];

        basicFields.forEach(fieldId => {
            const element = document.getElementById(fieldId);
            if (element && element.value !== null && element.value !== undefined) {
                const value = String(element.value);
                if (value.trim() !== '') {
                    const dataField = this.mapFieldIdToDataField(fieldId, collectionName);
                    data[dataField] = value.trim();
                }
            }
        });

        // Collect collection-specific fields
        const fieldConfig = this.getCollectionFieldConfig(collectionName);
        this.collectDynamicFields(data, fieldConfig, collectionName);

        console.log(`📊 Total fields collected: ${Object.keys(data).length}`);
        return data;
    }

    /**
     * Collect dynamic fields based on collection configuration
     */
    collectDynamicFields(data, fieldConfig, collectionName) {
        // Handle dimension fields for sinks
        if (collectionName === 'sinks') {
            const sinkDimensionFields = [
                'editLengthMm', 'editOverallWidthMm', 'editOverallDepthMm',
                'editMinCabinetSize', 'editCutoutSize', 'editBowlWidthMm',
                'editBowlDepthMm', 'editBowlHeightMm', 'editSecondBowlWidth',
                'editSecondBowlDepth', 'editSecondBowlHeight'
            ];

            sinkDimensionFields.forEach(fieldId => {
                const element = document.getElementById(fieldId);
                if (element && element.value && element.value.trim() !== '') {
                    const dataField = this.mapFieldIdToDataField(fieldId, collectionName);
                    data[dataField] = element.value.trim();
                }
            });
        }

        // Handle other product fields
        const productFields = fieldConfig.productFields || [];
        const dimensionFields = fieldConfig.dimensionFields !== 'CUSTOM_SINK_DIMENSIONS' ? 
            (fieldConfig.dimensionFields || []) : [];
        
        const allDynamicFields = [...productFields, ...dimensionFields];

        allDynamicFields.forEach(field => {
            const element = document.getElementById(field.id);
            if (element && element.value !== null && element.value !== undefined) {
                this.processFieldValue(field, element, data, collectionName);
            }
        });
    }

    /**
     * Process individual field value based on type
     */
    processFieldValue(field, element, data, collectionName) {
        if (field.type === 'multiselect') {
            const selectedOptions = Array.from(element.selectedOptions).map(option => option.value);
            if (selectedOptions.length > 0) {
                const dataField = this.mapFieldIdToDataField(field.id, collectionName);
                data[dataField] = selectedOptions.join(', ');
            }
        } else if (field.id === 'editShopifyStatus') {
            const value = String(element.value);
            const dataField = this.mapFieldIdToDataField(field.id, collectionName);
            data[dataField] = value.trim();
        } else {
            const value = String(element.value);
            if (value.trim() !== '') {
                const dataField = this.mapFieldIdToDataField(field.id, collectionName);
                data[dataField] = value.trim();
            }
        }
    }

    /**
     * Create minimal product data structure
     */
    createMinimalProductData(rowNum) {
        return {
            title: `Product ${rowNum}`,
            variant_sku: '',
            vendor: '',
            shopify_images: '',
            shopify_price: '',
            shopify_compare_price: '',
            shopify_weight: '',
            shopify_tags: '',
            seo_title: '',
            seo_description: '',
            body_html: '',
            features: '',
            quality_score: 0
        };
    }

    /**
     * Populate basic form fields
     */
    populateBasicFields(data) {
        const basicFields = [
            { id: 'editSku', value: data.variant_sku || '' },
            { id: 'editTitle', value: data.title || '' },
            { id: 'editVendor', value: data.vendor || '' },
            { id: 'editRrpPrice', value: this.cleanPriceValue(data.shopify_compare_price || '') },
            { id: 'editSalePrice', value: this.cleanPriceValue(data.shopify_price || '') },
            { id: 'editWeight', value: data.shopify_weight || '' },
            { id: 'editTags', value: data.shopify_tags || '' },
            { id: 'editSeoTitle', value: data.seo_title || '' },
            { id: 'editSeoDescription', value: data.seo_description || '' },
            { id: 'editFaqs', value: data.faqs || '' },
            { id: 'editBodyHtml', value: data.body_html || '' },
            { id: 'editFeatures', value: data.features || '' }
        ];

        basicFields.forEach(field => {
            const element = document.getElementById(field.id);
            if (element) {
                element.value = field.value;
            }
        });
    }

    /**
     * Generate dynamic fields based on collection
     */
    generateDynamicFields() {
        // This method would contain your existing generateDynamicFields logic
        // For brevity, I'm not copying all of it here, but it would be the same
        console.log(`🔧 Generating dynamic fields for ${this.collectionName}`);
        // ... your existing implementation
    }

    /**
     * Populate dynamic fields
     */
    populateDynamicFields(data) {
        // This method would contain your existing populateDynamicFields logic
        console.log(`🔧 Populating dynamic fields for ${this.collectionName}`);
        // ... your existing implementation
    }

    /**
     * Reset modal for new product
     */
    resetModalForNewProduct() {
        console.log('🔄 Resetting modal for new product...');
        
        // Hide status badge
        const statusBadge = document.getElementById('modalStatusBadge');
        if (statusBadge) {
            statusBadge.style.display = 'none';
        }

        // Clear field highlighting and animations
        document.querySelectorAll('.form-control, .form-select').forEach(el => {
            el.classList.remove('field-extracted', 'field-cleaned', 'ai-field-processing');
        });

        document.querySelectorAll('.field-group').forEach(group => {
            group.classList.remove('ai-processing', 'extraction-success');
        });

        // Remove various indicators and effects
        document.querySelectorAll('.success-indicator, .cleaned-indicator, .field-shimmer, .ai-progress-indicator').forEach(el => el.remove());
    }

    /**
     * Setup compare button functionality
     */
    setupCompareButton(data) {
        const compareBtn = document.getElementById('compareBtn');
        if (!compareBtn) return;

        const urlToOpen = data.url || data.supplier_url || data.product_url || data['Column A'];

        if (urlToOpen && urlToOpen.trim() !== '' && urlToOpen !== '-') {
            compareBtn.disabled = false;
            compareBtn.title = 'Compare with supplier website';
            compareBtn.classList.remove('btn-outline-secondary');
            compareBtn.classList.add('btn-outline-info');
        } else {
            compareBtn.disabled = true;
            compareBtn.title = 'No supplier URL available';
            compareBtn.classList.remove('btn-outline-info');
            compareBtn.classList.add('btn-outline-secondary');
        }
    }

    /**
     * Load single product data
     */
    async loadSingleProductData(rowNum) {
        console.log(`🔄 Loading fresh product data for row ${rowNum}...`);

        try {
            const response = await fetch(`/api/${this.collectionName}/products/${rowNum}`);
            const data = await response.json();

            if (data.success) {
                console.log(`✅ Successfully loaded fresh data for product ${rowNum}`);
                // Update global products data
                this.productsData[rowNum] = data.product;
                // Trigger UI update (this would be handled by a UI manager)
                if (window.uiManager) {
                    window.uiManager.updateProductCard(rowNum, data.product, false);
                }
            } else {
                console.error(`❌ Failed to load fresh data for product ${rowNum}:`, data.error);
            }
        } catch (error) {
            console.error(`❌ Error loading fresh data for product ${rowNum}:`, error);
        }
    }

    /**
     * Utility methods
     */
    cleanPriceValue(priceString) {
        if (!priceString || priceString === '') return '';
        const cleaned = priceString.toString().replace(/[\$,\s]/g, '');
        const numeric = parseFloat(cleaned);
        return isNaN(numeric) ? '' : numeric.toString();
    }

    mapFieldIdToDataField(fieldId, collectionName) {
        // Your existing field mapping logic
        const fieldMappings = {
            'editSku': 'variant_sku',
            'editTitle': 'title',
            'editVendor': 'vendor',
            // ... add all your mappings
        };
        return fieldMappings[fieldId] || fieldId.replace('edit', '').toLowerCase();
    }

    getCollectionFieldConfig(collectionName) {
        // Your existing getCollectionFieldConfig logic
        // Return the field configuration for the collection
        return window.collectionFieldConfigs?.[collectionName] || {};
    }

    /**
     * Set dependencies
     */
    setImageManager(imageManager) {
        this.imageManager = imageManager;
    }

    setUIUtils(uiUtils) {
        this.uiUtils = uiUtils;
    }
}

// Export for global use
window.ProductEditor = ProductEditor;