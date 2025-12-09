/**
 * Basins Collection JavaScript - Specific functionality for basins collection
 */

// Basins-specific field mappings - matches basins_modal.html and BasinsCollection config
// Updated to match ACTUAL 46-column Google Sheet structure (A-AT)
// Verified against actual sheet headers on 2024-12-08
const BASINS_FIELD_MAPPINGS = {
    // System fields (A-E)
    'editUrl': 'url',                                  // A - URL
    'editSku': 'variant_sku',                          // B - Variant SKU
    'editKey': 'key',                                  // C - Key
    'editId': 'id',                                    // D - ID
    'editHandle': 'handle',                            // E - Handle

    // Basic product info (F-G)
    'editTitle': 'title',                              // F - Title
    'editVendor': 'vendor',                            // G - Vendor

    // Basin specifications (H-O)
    'editColourFinish': 'colour_finish',               // H - Metafield: product_colours_finishes
    'editInstallationType': 'installation_type',       // I - Metafield: installation_type
    'editProductMaterial': 'product_material',         // J - Metafield: product_material
    'editGradeOfMaterial': 'grade_of_material',        // K - Metafield: grade_of_material
    'editStyle': 'style',                              // L - Metafield: style
    'editWarrantyYears': 'warranty_years',             // M - Metafield: warranty_years
    'editWasteOutletDimensions': 'waste_outlet_dimensions', // N - Metafield: waste_outlet_dimensions
    'editHasOverflow': 'has_overflow',                 // O - Metafield: has_overflow [boolean]

    // Dimensions (P-R)
    'editOverallLengthMm': 'overall_length_mm',        // P - Metafield: overall_length_mm
    'editOverallWidthMm': 'overall_width_mm',          // Q - Metafield: overall_width_mm
    'editOverallDepthMm': 'overall_depth_mm',          // R - Metafield: overall_depth_mm

    // Additional specs (S-U)
    'editBrandName': 'brand_name',                     // S - Metafield: brand_name
    'editApplicationLocation': 'application_location', // T - Metafield: application_location
    'editDrainPosition': 'drain_position',             // U - Metafield: drain_position

    // Content (V-X)
    'editBodyHtml': 'body_html',                       // V - Body HTML
    'editFeatures': 'features',                        // W - Features
    'editCareInstructions': 'care_instructions',       // X - Care Instructions

    // System/Shopify fields (Y-AL)
    'editQualityScore': 'quality_score',               // Y - Quality score
    'editShopifyStatus': 'shopify_status',             // Z - Shopify Status
    'editShopifyPrice': 'shopify_price',               // AA - Variant Price
    'editShopifyComparePrice': 'shopify_compare_price', // AB - Variant Compare At Price
    'editShopifyWeight': 'shopify_weight',             // AC - Shopify Weight
    'editShopifyTags': 'shopify_tags',                 // AD - Tags
    'editSeoTitle': 'seo_title',                       // AE - Search Engine Page Title
    'editSeoDescription': 'seo_description',           // AF - Search Engine Meta Description

    // Media (AH-AI) - Note: AG is empty column
    'editShopifyImages': 'shopify_images',             // AH - Shopify Images
    'editShopifySpecSheet': 'shopify_spec_sheet',      // AI - shopify_spec_sheet

    // System fields (AJ-AL)
    'editShopifyCollections': 'shopify_collections',   // AJ - Shopify Collections
    'editShopifyUrl': 'shopify_url',                   // AK - Shopify URL
    'editLastShopifySync': 'last_shopify_sync',        // AL - Last Shopify Sync

    // Clean Data (AS)
    'editCleanData': 'clean_data',                     // AS - 🧹 Clean Data

    // FAQs (AT)
    'editFaqs': 'faqs'                                 // AT - FAQ's
};

// Additional images array for managing product images
let additionalImagesArray = [];

// Background save queue and status tracking
let backgroundSaveQueue = [];
let backgroundSaveInProgress = false;

/**
 * Update hidden field with current additional images array
 */
function updateHiddenField() {
    const hiddenField = document.getElementById('editShopifyImages');
    if (hiddenField) {
        hiddenField.value = additionalImagesArray.join(',');
    }
}

/**
 * Get current collection name
 */
function getCurrentCollectionName() {
    const collectionField = document.getElementById('editCollectionName');
    if (collectionField && collectionField.value) {
        return collectionField.value;
    }
    return window.COLLECTION_NAME || 'basins';
}

/**
 * Collect all form data for saving
 * @param {string} collectionName - The collection name (basins)
 * @returns {Object} - The collected form data
 */
function collectFormData(collectionName) {
    console.log('🚿 Collecting basin-specific form data...');

    // Ensure additional images hidden field is up to date before collecting
    updateHiddenField();

    const data = {};

    // Collect data based on BASINS_FIELD_MAPPINGS
    Object.entries(BASINS_FIELD_MAPPINGS).forEach(([fieldId, dataKey]) => {
        const element = document.getElementById(fieldId);
        if (element) {
            let value = element.value ? element.value.trim() : '';

            // Special handling for additional images - ensure we use the current array
            if (fieldId === 'editShopifyImages') {
                value = additionalImagesArray.join(',');
                console.log(`🖼️ Additional images array has ${additionalImagesArray.length} images`);
            }

            // Convert Yes/No back to TRUE/FALSE for boolean fields when saving to Google Sheets
            if (fieldId === 'editHasOverflow' && element.tagName === 'SELECT') {
                if (value === 'Yes' || value === 'yes' || value === 'YES') {
                    value = 'TRUE';
                    console.log(`🔄 Boolean conversion for save: ${fieldId} "Yes" → "TRUE"`);
                } else if (value === 'No' || value === 'no' || value === 'NO') {
                    value = 'FALSE';
                    console.log(`🔄 Boolean conversion for save: ${fieldId} "No" → "FALSE"`);
                }
            }

            if (value !== '') {
                data[dataKey] = value;
                console.log(`📄 Collected ${dataKey}: "${value.length > 100 ? value.substring(0, 100) + '...' : value}"`);
            }
        }
    });

    // Force include important fields even if empty to ensure they get updated
    const forceIncludeFields = ['shopify_images', 'shopify_spec_sheet'];
    forceIncludeFields.forEach(field => {
        if (!data[field]) {
            if (field === 'shopify_images') {
                data[field] = additionalImagesArray.join(',');
            } else if (field === 'shopify_spec_sheet') {
                const specSheetElement = document.getElementById('editShopifySpecSheet');
                data[field] = specSheetElement ? specSheetElement.value.trim() : '';
            }
            console.log(`🔧 Force included ${field}: "${data[field]}"`);
        }
    });

    console.log(`✅ Collected ${Object.keys(data).length} fields for ${collectionName}`);
    console.log(`📋 Fields being saved:`, Object.keys(data));
    return data;
}

/**
 * Instant save function - provides immediate feedback, saves in background
 */
async function saveBasinsProduct() {
    console.log('⚡ saveBasinsProduct() - Instant save with background processing...');

    // Get current row number from modal state
    const modal = document.getElementById('editProductModal');
    const currentRow = modal ? modal.dataset.currentRow : null;

    if (!currentRow) {
        console.error('❌ No current row found');
        showErrorMessage('No product selected for editing');
        return;
    }

    // Collect all form data immediately
    const updatedData = collectFormData('basins');

    // If this product was opened from WIP review, automatically set Shopify Status to 'Active'
    const wipId = modal.dataset.wipId;
    if (wipId) {
        console.log('🏷️ Product from WIP - automatically setting Shopify Status to Active');
        updatedData.shopify_status = 'Active';
    }

    if (Object.keys(updatedData).length === 0) {
        showInfoMessage('No changes detected to save');
        return;
    }

    // INSTANT USER FEEDBACK - Show success immediately
    const saveButton = document.querySelector('button[onclick*="saveProduct"]');
    const originalButtonHTML = saveButton ? saveButton.innerHTML : '';

    if (saveButton) {
        saveButton.innerHTML = '<i class="fas fa-check me-1"></i>Saved!';
        saveButton.className = 'btn btn-success btn-sm me-2';
    }

    // Show success message immediately
    showSuccessMessage(`✅ Changes saved! (${Object.keys(updatedData).length} fields)`);

    // Update local data immediately so UI reflects changes
    if (window.productsData && window.productsData[currentRow]) {
        Object.assign(window.productsData[currentRow], updatedData);
    }

    // Reset button after short delay
    if (saveButton) {
        setTimeout(() => {
            saveButton.innerHTML = originalButtonHTML;
            saveButton.className = 'btn btn-success btn-sm me-2';
        }, 2000);
    }

    // Add to background save queue
    const saveTask = {
        id: Date.now(),
        currentRow,
        updatedData,
        timestamp: new Date().toISOString()
    };

    backgroundSaveQueue.push(saveTask);
    console.log(`📝 Added save task to background queue (${backgroundSaveQueue.length} pending)`);

    // Start background processing if not already running
    if (!backgroundSaveInProgress) {
        processBackgroundSaveQueue();
    }
}

/**
 * Process the background save queue
 */
async function processBackgroundSaveQueue() {
    if (backgroundSaveInProgress || backgroundSaveQueue.length === 0) {
        return;
    }

    backgroundSaveInProgress = true;
    console.log('🔄 Starting background save processing...');

    addBackgroundSaveIndicator();

    while (backgroundSaveQueue.length > 0) {
        const task = backgroundSaveQueue.shift();
        console.log(`💾 Background saving row ${task.currentRow} with ${Object.keys(task.updatedData).length} fields...`);

        try {
            const response = await fetch(`/api/basins/products/${task.currentRow}/batch`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(task.updatedData)
            });

            const result = await response.json();

            if (result.success) {
                console.log(`✅ Background save completed for row ${task.currentRow}`);
                updateBackgroundSaveIndicator(backgroundSaveQueue.length);
            } else {
                console.error(`❌ Background save failed for row ${task.currentRow}:`, result.error);
                showSubtleNotification('⚠️ Some changes may not have been saved to Google Sheets', 'warning');
            }

        } catch (error) {
            console.error(`❌ Background save error for row ${task.currentRow}:`, error);
            showSubtleNotification('⚠️ Some changes may not have been saved to Google Sheets', 'warning');
        }

        if (backgroundSaveQueue.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    backgroundSaveInProgress = false;
    removeBackgroundSaveIndicator();
    console.log('✅ All background saves completed');

    // If this product was opened from WIP review, remove it from WIP after successful save
    const modal = document.getElementById('editProductModal');
    const wipId = modal ? modal.dataset.wipId : null;
    if (wipId && window.removeProductFromWIP) {
        console.log('🗑️ Removing product from WIP after successful save, WIP ID:', wipId);
        window.removeProductFromWIP(wipId);
    }
}

/**
 * Add background save indicator to UI
 */
function addBackgroundSaveIndicator() {
    if (document.getElementById('backgroundSaveIndicator')) return;

    const indicator = document.createElement('div');
    indicator.id = 'backgroundSaveIndicator';
    indicator.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#17a2b8;color:white;padding:8px 16px;border-radius:20px;font-size:12px;z-index:9999;opacity:0.9;';
    indicator.innerHTML = '<i class="fas fa-sync fa-spin me-2"></i>Syncing...';
    document.body.appendChild(indicator);
}

/**
 * Update background save indicator with pending count
 */
function updateBackgroundSaveIndicator(pendingCount) {
    const indicator = document.getElementById('backgroundSaveIndicator');
    if (indicator && pendingCount > 0) {
        indicator.innerHTML = `<i class="fas fa-sync fa-spin me-2"></i>Syncing... (${pendingCount} pending)`;
    }
}

/**
 * Remove background save indicator from UI
 */
function removeBackgroundSaveIndicator() {
    const indicator = document.getElementById('backgroundSaveIndicator');
    if (indicator) {
        indicator.innerHTML = '<i class="fas fa-check me-2"></i>Synced!';
        indicator.style.background = '#28a745';
        setTimeout(() => indicator.remove(), 1500);
    }
}

/**
 * Show subtle notification for background operations
 */
function showSubtleNotification(message, type = 'info') {
    const notification = document.createElement('div');
    const bgColor = type === 'warning' ? '#ffc107' : type === 'error' ? '#dc3545' : '#17a2b8';
    const textColor = type === 'warning' ? '#000' : '#fff';
    notification.style.cssText = `position:fixed;bottom:60px;right:20px;background:${bgColor};color:${textColor};padding:10px 16px;border-radius:8px;font-size:13px;z-index:9999;max-width:300px;`;
    notification.innerHTML = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

/**
 * Render basin-specific product specifications for product cards
 * Displays key basin specs on collection page cards
 */
function renderProductSpecs(product) {
    const rowNum = product.row_number;
    const specs = [];

    // Helper function to check if a value matches (case-insensitive, trimmed)
    function isSelected(productValue, optionValue) {
        if (!productValue) return false;
        const pVal = String(productValue).trim().toLowerCase();
        const oVal = String(optionValue).trim().toLowerCase();
        return pVal === oVal;
    }

    // Helper function to check if a value is in the predefined options (case-insensitive)
    function isInOptions(value, options) {
        if (!value) return true;
        const valLower = String(value).trim().toLowerCase();
        return options.some(opt => opt.toLowerCase() === valLower);
    }

    // Get normalized values for dropdowns
    const installationType = product.installation_type ? String(product.installation_type).trim() : '';
    const hasOverflow = product.has_overflow ? String(product.has_overflow).trim() : '';

    console.log(`🔍 renderProductSpecs for row ${rowNum}: installation_type="${installationType}", has_overflow="${hasOverflow}"`);

    // Predefined options for dropdowns
    const installationOptions = ['Countertop', 'Undermount', 'Wall-hung', 'Pedestal', 'Semi-recessed', 'Inset', 'Vessel'];

    // Build Installation Type dropdown - include custom value if not in predefined list
    let installationOptionsHtml = '<option value="">Select...</option>';
    if (installationType && !isInOptions(installationType, installationOptions)) {
        installationOptionsHtml += `<option value="${installationType}" selected>${installationType}</option>`;
    }
    installationOptions.forEach(opt => {
        installationOptionsHtml += `<option value="${opt}" ${isSelected(installationType, opt) ? 'selected' : ''}>${opt}</option>`;
    });

    specs.push({
        label: 'Installation',
        html: `<select class="spec-dropdown" data-row="${rowNum}" data-field="installation_type" onchange="updateFieldFromCard(event)" onclick="event.stopPropagation()">
            ${installationOptionsHtml}
        </select>`
    });

    // Material - display only
    if (product.product_material) {
        specs.push({
            label: 'Material',
            value: product.product_material,
            badge: 'material-badge'
        });
    }

    // Colour/Finish - display only (using correct field name from sheet)
    if (product.colour_finish) {
        specs.push({
            label: 'Colour',
            value: product.colour_finish
        });
    }

    // Dimensions (using correct field names from sheet)
    if (product.overall_length_mm || product.overall_width_mm) {
        const dims = [];
        if (product.overall_length_mm) dims.push(`${product.overall_length_mm}L`);
        if (product.overall_width_mm) dims.push(`${product.overall_width_mm}W`);
        if (product.overall_depth_mm) dims.push(`${product.overall_depth_mm}D`);
        specs.push({
            label: 'Dims',
            value: dims.join(' x ') + 'mm'
        });
    }

    // Has Overflow
    if (hasOverflow) {
        const overflowDisplay = hasOverflow.toUpperCase() === 'TRUE' || hasOverflow.toLowerCase() === 'yes' ? 'Yes' : 'No';
        specs.push({
            label: 'Overflow',
            value: overflowDisplay
        });
    }

    // Warranty
    if (product.warranty_years) {
        specs.push({
            label: 'Warranty',
            value: `${product.warranty_years} years`
        });
    }

    return specs.map(spec => `
        <div class="spec-row">
            <span class="spec-label">${spec.label}:</span>
            ${spec.html ? spec.html : `<span class="spec-value ${spec.badge || ''}">${spec.value}</span>`}
        </div>
    `).join('');
}

/**
 * Populate basin-specific fields in modal
 */
function populateCollectionSpecificFields(data) {
    console.log('🚿 Populating basin-specific fields...');

    // Log key fields to debug data loading
    console.log('📊 Key fields from data:');
    console.log(`   - shopify_images: "${data.shopify_images || '(empty)'}" (length: ${(data.shopify_images || '').length})`);
    console.log(`   - shopify_spec_sheet: "${data.shopify_spec_sheet || '(empty)'}"`);
    console.log(`   - title: "${data.title || '(empty)'}"`);
    console.log(`   - variant_sku: "${data.variant_sku || '(empty)'}"`);
    console.log('📋 Total data keys:', Object.keys(data).length, '| Keys:', Object.keys(data).join(', '));

    // Boolean fields that need TRUE/FALSE → Yes/No conversion for display
    const booleanFields = ['editHasOverflow'];

    // CRITICAL: Populate additionalImagesArray from data FIRST
    const imagesValue = data.shopify_images || '';
    if (imagesValue && imagesValue.trim()) {
        additionalImagesArray = imagesValue.split(',').map(url => url.trim()).filter(url => url);
        console.log(`🖼️ SUCCESS: Populated additionalImagesArray with ${additionalImagesArray.length} images`);
        if (additionalImagesArray.length > 0) {
            console.log(`🖼️ First image: ${additionalImagesArray[0].substring(0, 80)}...`);
        }
    } else {
        additionalImagesArray = [];
        console.warn(`⚠️ WARNING: No images in data.shopify_images - images will be lost on save!`);
    }

    // Count how many fields we're about to populate
    let populatedCount = 0;
    let missingElementCount = 0;

    // Map all basin-specific fields
    Object.entries(BASINS_FIELD_MAPPINGS).forEach(([fieldId, dataKey]) => {
        const element = document.getElementById(fieldId);

        if (!element) {
            missingElementCount++;
            console.warn(`⚠️ Element not found: ${fieldId} (for data key: ${dataKey})`);
            return;
        }

        if (data[dataKey] === undefined) {
            console.log(`ℹ️ No data for ${dataKey} (element: ${fieldId})`);
            return;
        }

        let value = data[dataKey] || '';

        // Convert TRUE/FALSE to Yes/No for boolean select fields
        if (booleanFields.includes(fieldId) && element.tagName === 'SELECT') {
            const upperValue = String(value).toUpperCase().trim();
            if (upperValue === 'TRUE' || upperValue === 'YES') {
                value = 'Yes';
                console.log(`🔄 Boolean conversion for display: ${fieldId} "${data[dataKey]}" → "Yes"`);
            } else if (upperValue === 'FALSE' || upperValue === 'NO') {
                value = 'No';
                console.log(`🔄 Boolean conversion for display: ${fieldId} "${data[dataKey]}" → "No"`);
            }
        }

        element.value = value;
        populatedCount++;

        if (value) {
            const displayValue = value.length > 50 ? value.substring(0, 50) + '...' : value;
            console.log(`✅ Set ${fieldId} = "${displayValue}"`);
        }
    });

    console.log(`📋 Summary: Populated ${populatedCount} fields, ${missingElementCount} elements not found`);

    // Update the hidden field with the images array
    updateHiddenField();

    // Initialize and display additional images
    if (typeof initializeAdditionalImages === 'function') {
        initializeAdditionalImages();
    } else {
        console.warn('⚠️ initializeAdditionalImages function not found');
    }

    // Handle compare button visibility - show if there's a supplier URL
    const compareBtn = document.getElementById('compareButton');
    const supplierUrl = data.url || data.supplier_url || data.external_url;
    if (compareBtn) {
        if (supplierUrl && supplierUrl.trim() !== '') {
            compareBtn.style.display = 'inline-block';
            console.log('🔗 Compare button shown - supplier URL available');
        } else {
            compareBtn.style.display = 'none';
            console.log('🔗 Compare button hidden - no supplier URL');
        }
    }
}

/**
 * Get updated basin-specific fields from modal
 */
function getCollectionSpecificFields() {
    const fields = {};

    Object.entries(BASINS_FIELD_MAPPINGS).forEach(([fieldId, dataKey]) => {
        const element = document.getElementById(fieldId);
        if (element) {
            fields[dataKey] = element.value || '';
        }
    });

    console.log('🚿 Collected basin-specific fields:', fields);
    return fields;
}

/**
 * Update a field directly from the product card dropdown
 */
async function updateFieldFromCard(event) {
    event.stopPropagation();

    const select = event.target;
    const rowNum = parseInt(select.getAttribute('data-row'));
    const field = select.getAttribute('data-field');
    const newValue = select.value;

    console.log(`📝 Updating ${field} for row ${rowNum} to: ${newValue}`);

    select.disabled = true;
    select.style.opacity = '0.6';

    try {
        const response = await fetch(`/api/basins/products/${rowNum}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                field: field,
                value: newValue
            })
        });

        const data = await response.json();

        if (data.success) {
            console.log(`✅ Successfully updated ${field} for row ${rowNum}`);

            if (window.productsData && window.productsData[rowNum]) {
                window.productsData[rowNum][field] = newValue;
            }
            if (window.allProductsCache && window.allProductsCache[rowNum]) {
                window.allProductsCache[rowNum][field] = newValue;
            }

            select.style.borderColor = '#28a745';
            setTimeout(() => {
                select.style.borderColor = '';
            }, 1000);
        } else {
            throw new Error(data.error || 'Update failed');
        }
    } catch (error) {
        console.error(`❌ Error updating ${field}:`, error);

        select.style.borderColor = '#dc3545';
        setTimeout(() => {
            select.style.borderColor = '';
        }, 2000);

        if (window.showErrorMessage) {
            window.showErrorMessage(`Failed to update ${field}: ${error.message}`);
        }
    } finally {
        select.disabled = false;
        select.style.opacity = '';
    }
}

/**
 * Sync Google Sheet - reload data from Google Sheets
 */
async function syncGoogleSheet() {
    const collectionName = getCurrentCollectionName();

    const btn = event.target.closest('button');
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Syncing...';

    try {
        const response = await fetch(`/api/${collectionName}/sync-sheet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
            showSuccessMessage(`✅ Google Sheet synced! Loaded ${data.products_loaded} products in ${data.duration}s`);

            setTimeout(() => {
                if (window.backgroundCache) {
                    window.backgroundCache = {};
                }
                window.location.href = window.location.pathname + '?force_refresh=true&t=' + Date.now();
            }, 1500);
        } else {
            showErrorMessage('Failed to sync: ' + (data.error || 'Unknown error'));
            btn.disabled = false;
            btn.innerHTML = originalHTML;
        }
    } catch (error) {
        showErrorMessage('Error syncing Google Sheet: ' + error.message);
        btn.disabled = false;
        btn.innerHTML = originalHTML;
    }
}

/**
 * Validate spec sheet URL
 */
function validateSpecSheetUrl() {
    const urlInput = document.getElementById('editShopifySpecSheet');
    const url = urlInput.value.trim();

    if (!url) {
        showValidationResult('Please enter a spec sheet URL', 'warning');
        return;
    }

    if (!isValidUrl(url)) {
        showValidationResult('Please enter a valid URL', 'danger');
        return;
    }

    const button = document.querySelector('button[onclick="validateSpecSheetUrl()"]');
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Validating...';
    button.disabled = true;

    const resultDiv = document.getElementById('specSheetValidationResult');
    if (resultDiv) {
        resultDiv.style.display = 'none';
    }

    validateSpecSheetInBackground(url).finally(() => {
        button.innerHTML = originalText;
        button.disabled = false;
    });
}

/**
 * Show validation result message
 */
function showValidationResult(message, type) {
    const resultDiv = document.getElementById('specSheetValidationResult');
    if (!resultDiv) return;

    resultDiv.className = `alert alert-${type}`;
    resultDiv.innerHTML = message;
    resultDiv.style.display = 'block';
}

/**
 * Validate spec sheet URL in background with API call
 */
async function validateSpecSheetInBackground(url) {
    try {
        const modal = document.getElementById('editProductModal');
        const currentRow = modal.dataset.currentRow;

        if (!currentRow) {
            showValidationResult('⚠️ No product selected for validation', 'warning');
            return;
        }

        const requestData = {
            spec_sheet_url: url,
            row_num: parseInt(currentRow)
        };

        const collectionName = getCurrentCollectionName();
        const response = await fetch(`/api/${collectionName}/validate-spec-sheet`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });

        const data = await response.json();

        if (!response.ok) {
            showValidationResult(`❌ ${data.error || 'Validation failed'}`, 'danger');
            return;
        }

        if (data.success) {
            let message = '<strong>✅ Spec sheet validated successfully!</strong><br>';
            if (data.accessible) {
                message += '<span class="text-success">• PDF is accessible</span><br>';
            }
            if (data.sku_match) {
                message += '<span class="text-success">• SKU matches product</span><br>';
            }
            showValidationResult(message, 'success');
        } else {
            showValidationResult('⚠️ Validation completed with warnings', 'warning');
        }

    } catch (error) {
        console.error('Error validating spec sheet:', error);
        showValidationResult(`❌ Error: ${error.message}`, 'danger');
    }
}

/**
 * Check if URL is valid
 */
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * Extract images for current product in modal
 */
async function extractCurrentProductImages(event) {
    const modal = document.getElementById('editProductModal');
    const currentRow = modal.dataset.currentRow;

    if (!currentRow || !window.productsData || !window.productsData[currentRow]) {
        showErrorMessage('No product data available for image extraction');
        return;
    }

    const product = window.productsData[currentRow];
    const productUrl = product.url || product.product_url || product.link;

    if (!productUrl) {
        showErrorMessage('No product URL found for image extraction. Please add a URL to this product first.');
        return;
    }

    console.log(`🖼️ Extracting images for product row ${currentRow} from ${productUrl}`);

    const loadingId = window.aiLoadingManager ?
        window.aiLoadingManager.startAIExtraction(event ? event.target : null) : null;

    const statusBadge = document.getElementById('modalStatusBadge');
    if (statusBadge) {
        statusBadge.textContent = 'Extracting Images...';
        statusBadge.className = 'badge bg-warning ms-3';
        statusBadge.style.display = 'inline';
    }

    try {
        const response = await fetch(`/api/basins/products/${currentRow}/extract-images`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                product_url: productUrl
            })
        });

        const result = await response.json();

        if (result.success) {
            if (loadingId && window.aiLoadingManager) {
                window.aiLoadingManager.stopLoading(loadingId);
            }

            if (statusBadge) {
                statusBadge.textContent = 'Images Extracted';
                statusBadge.className = 'badge bg-success ms-3';
            }

            showSuccessMessage(`✅ Extracted ${result.image_count || 0} images successfully!`);

            if (!window.liveUpdatesManager || !window.liveUpdatesManager.isLiveUpdatesActive()) {
                console.log('🔄 Live updates not active, manually refreshing modal...');
                if (window.liveUpdatesManager) {
                    window.liveUpdatesManager.refreshModalData();
                }
            }
        } else {
            throw new Error(result.error || 'Failed to extract images');
        }

    } catch (error) {
        console.error('Error extracting images:', error);

        if (loadingId && window.aiLoadingManager) {
            window.aiLoadingManager.stopLoading(loadingId);
        }

        if (statusBadge) {
            statusBadge.textContent = 'Image Extraction Failed';
            statusBadge.className = 'badge bg-danger ms-3';
        }
        showErrorMessage(`Failed to extract images: ${error.message}`);
    }
}

/**
 * Extract single product with status animation
 */
async function extractSingleProductWithStatus(event) {
    event.preventDefault();
    const rowNum = document.getElementById('editRowNum').value;
    if (!rowNum) {
        showErrorMessage('No product row selected');
        return;
    }

    console.log(`🤖 Starting AI extraction for product ${rowNum}`);

    const loadingId = window.aiLoadingManager ?
        window.aiLoadingManager.startAIExtraction(event ? event.target : null) : null;

    const statusBadge = document.getElementById('modalStatusBadge');
    if (statusBadge) {
        statusBadge.textContent = 'Extracting...';
        statusBadge.className = 'badge bg-warning ms-3';
        statusBadge.style.display = 'inline';
    }

    try {
        const response = await fetch(`/api/basins/products/${rowNum}/extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                overwrite_mode: true
            })
        });

        const result = await response.json();

        if (result.success) {
            console.log('✅ AI extraction successful');

            if (loadingId && window.aiLoadingManager) {
                window.aiLoadingManager.stopLoading(loadingId);
            }

            if (statusBadge) {
                statusBadge.textContent = 'Extraction Complete';
                statusBadge.className = 'badge bg-success ms-3';
            }

            showSuccessMessage('✅ AI extraction completed successfully!');

            const modal = document.getElementById('editProductModal');
            const currentRow = modal?.dataset?.currentRow;

            if (currentRow) {
                setTimeout(async () => {
                    console.log('🔄 Refreshing modal after extraction...');
                    if (window.refreshModalAfterExtraction) {
                        await window.refreshModalAfterExtraction(currentRow);
                    }
                }, 5000);
            }
        } else {
            const errorMsg = result.message || 'AI extraction failed';
            console.error('❌ AI extraction failed:', errorMsg);

            if (loadingId && window.aiLoadingManager) {
                window.aiLoadingManager.stopLoading(loadingId);
            }

            if (statusBadge) {
                statusBadge.textContent = 'Extraction Failed';
                statusBadge.className = 'badge bg-danger ms-3';
            }

            showErrorMessage('Failed to extract: ' + errorMsg);
        }

    } catch (error) {
        console.error('❌ AI extraction error:', error);

        if (loadingId && window.aiLoadingManager) {
            window.aiLoadingManager.stopLoading(loadingId);
        }

        if (statusBadge) {
            statusBadge.textContent = 'Extraction Failed';
            statusBadge.className = 'badge bg-danger ms-3';
        }

        showErrorMessage('Failed to extract: ' + error.message);
    }
}

/**
 * Generate tab content with asterisk info
 */
async function generateTabContentWithAsterisk(tabType) {
    console.log(`🤖 Generating ${tabType} with asterisk info...`);

    const modal = document.getElementById('editProductModal');
    const currentRow = modal?.dataset?.currentRow;

    if (!currentRow) {
        showErrorMessage('No product selected');
        return;
    }

    const product = window.productsData ? window.productsData[currentRow] : null;
    if (!product) {
        showErrorMessage('Product data not available');
        return;
    }

    const button = event.target;
    const originalHTML = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Generating...';

    try {
        const response = await fetch(`/api/basins/products/${currentRow}/generate-content`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content_type: tabType,
                product_data: product,
                include_asterisk: true
            })
        });

        const result = await response.json();

        if (result.success) {
            const textareaId = tabType === 'description' ? 'editBodyHtml' : 'editFeatures';
            const textarea = document.getElementById(textareaId);
            if (textarea && result.content) {
                textarea.value = result.content;
            }

            showSuccessMessage(`✅ ${tabType.charAt(0).toUpperCase() + tabType.slice(1)} generated successfully!`);
        } else {
            throw new Error(result.error || 'Generation failed');
        }
    } catch (error) {
        console.error(`Error generating ${tabType}:`, error);
        showErrorMessage(`Failed to generate ${tabType}: ${error.message}`);
    } finally {
        button.disabled = false;
        button.innerHTML = originalHTML;
    }
}

/**
 * Generate tab content
 */
async function generateTabContent(tabType) {
    console.log(`🤖 Generating ${tabType}...`);

    const modal = document.getElementById('editProductModal');
    const currentRow = modal?.dataset?.currentRow;

    if (!currentRow) {
        showErrorMessage('No product selected');
        return;
    }

    const product = window.productsData ? window.productsData[currentRow] : null;
    if (!product) {
        showErrorMessage('Product data not available');
        return;
    }

    const button = event.target;
    const originalHTML = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Generating...';

    try {
        const response = await fetch(`/api/basins/products/${currentRow}/generate-content`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content_type: tabType,
                product_data: product,
                include_asterisk: false
            })
        });

        const result = await response.json();

        if (result.success) {
            const fieldMap = {
                'care': 'editCareInstructions',
                'faqs': 'editFaqs'
            };
            const textareaId = fieldMap[tabType];
            const textarea = document.getElementById(textareaId);
            if (textarea && result.content) {
                textarea.value = result.content;
            }

            showSuccessMessage(`✅ ${tabType.charAt(0).toUpperCase() + tabType.slice(1)} generated successfully!`);
        } else {
            throw new Error(result.error || 'Generation failed');
        }
    } catch (error) {
        console.error(`Error generating ${tabType}:`, error);
        showErrorMessage(`Failed to generate ${tabType}: ${error.message}`);
    } finally {
        button.disabled = false;
        button.innerHTML = originalHTML;
    }
}

// ============================================================
// ADDITIONAL IMAGES MANAGEMENT (same as sinks.js/taps.js)
// ============================================================

/**
 * Initialize additional images from the hidden field
 */
function initializeAdditionalImages() {
    const hiddenField = document.getElementById('editShopifyImages');
    if (hiddenField && hiddenField.value) {
        additionalImagesArray = hiddenField.value.split(',').map(url => url.trim()).filter(url => url);
        console.log('🖼️ Loaded additional images from Google Sheets:', additionalImagesArray.length, 'images');
    } else {
        additionalImagesArray = [];
        console.log('🖼️ No additional images found in Google Sheets');
    }
    updateAdditionalImagesDisplay();
}

/**
 * Add a new image URL
 */
function addNewImage() {
    const newImageInput = document.getElementById('newImageUrl');
    const url = newImageInput.value.trim();

    if (!url) {
        showErrorMessage('Please enter an image URL');
        return;
    }

    if (!isValidUrl(url)) {
        showErrorMessage('Please enter a valid URL');
        return;
    }

    if (additionalImagesArray.includes(url)) {
        showErrorMessage('This image URL is already added');
        return;
    }

    additionalImagesArray.push(url);
    newImageInput.value = '';

    updateAdditionalImagesDisplay();
    updateHiddenField();

    showSuccessMessage('Image URL added successfully');
}

/**
 * Remove an image URL
 */
function removeImage(index) {
    if (index >= 0 && index < additionalImagesArray.length) {
        additionalImagesArray.splice(index, 1);
        updateAdditionalImagesDisplay();
        updateHiddenField();
        showSuccessMessage('Image removed successfully');
    }
}

/**
 * Update the visual display of additional images
 */
function updateAdditionalImagesDisplay() {
    const container = document.getElementById('imagePreviewContainer');
    const currentImagesList = document.getElementById('currentImagesList');
    const countBadge = document.getElementById('additionalImagesCount');

    if (countBadge) {
        countBadge.textContent = `${additionalImagesArray.length} image${additionalImagesArray.length !== 1 ? 's' : ''}`;
    }

    if (additionalImagesArray.length === 0) {
        if (currentImagesList) {
            currentImagesList.style.display = 'none';
        }
        if (container) {
            container.innerHTML = '';
        }
        return;
    }

    if (currentImagesList) {
        currentImagesList.style.display = 'block';
    }

    if (container) {
        container.innerHTML = additionalImagesArray.map((url, index) => `
        <div class="image-preview-card card"
             style="width: 120px;"
             draggable="true"
             data-index="${index}"
             ondragstart="handleDragStart(event)"
             ondragover="handleDragOver(event)"
             ondrop="handleDrop(event)"
             ondragend="handleDragEnd(event)">
            <div class="position-relative">
                <div class="drag-handle position-absolute top-0 start-0 m-1 p-1 bg-dark bg-opacity-50 rounded"
                     style="cursor: move; font-size: 0.7rem; z-index: 10;"
                     title="Drag to reorder">
                    <i class="fas fa-grip-vertical text-white"></i>
                </div>

                ${index === 0 ? '<div class="main-image-badge position-absolute top-0 start-50 translate-middle-x mt-1"><span class="badge bg-primary" style="font-size: 0.6rem;">Main</span></div>' : ''}

                <img src="${url}" class="card-img-top" style="height: 80px; object-fit: cover; cursor: pointer;"
                     onclick="window.open('${url}', '_blank')"
                     onerror="this.style.display='none';"
                     alt="Additional image ${index + 1}"
                     title="Click to view full size image">
                <button type="button" class="btn btn-sm btn-danger position-absolute top-0 end-0 m-1"
                        onclick="removeImage(${index})" style="--bs-btn-padding-y: .1rem; --bs-btn-padding-x: .3rem; z-index: 10;"
                        title="Remove this image">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="card-body p-1">
                <small class="text-muted text-truncate d-block" style="font-size: 0.7rem;">
                    ${index === 0 ? '🏆 ' : ''}${url.length > 20 ? url.substring(0, 20) + '...' : url}
                </small>
            </div>
        </div>
    `).join('');
    }
}

/**
 * Drag and Drop Functionality for Image Reordering
 */
let draggedIndex = null;

function handleDragStart(event) {
    draggedIndex = parseInt(event.currentTarget.dataset.index);
    event.currentTarget.style.opacity = '0.5';
    event.dataTransfer.effectAllowed = 'move';
    console.log('🎯 Started dragging image at index:', draggedIndex);
}

function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    const card = event.currentTarget;
    card.style.transform = 'scale(1.05)';
    card.style.boxShadow = '0 8px 16px rgba(0,0,0,0.2)';
}

function handleDrop(event) {
    event.preventDefault();

    const dropIndex = parseInt(event.currentTarget.dataset.index);

    if (draggedIndex !== null && draggedIndex !== dropIndex) {
        const draggedItem = additionalImagesArray[draggedIndex];
        additionalImagesArray.splice(draggedIndex, 1);
        additionalImagesArray.splice(dropIndex, 0, draggedItem);

        console.log('🔄 Reordered images:', `${draggedIndex} → ${dropIndex}`);

        updateAdditionalImagesDisplay();
        updateHiddenField();

        showSuccessMessage(`Image moved to position ${dropIndex + 1}`);
    }

    event.currentTarget.style.transform = '';
    event.currentTarget.style.boxShadow = '';
}

function handleDragEnd(event) {
    event.currentTarget.style.opacity = '';
    event.currentTarget.style.transform = '';
    event.currentTarget.style.boxShadow = '';

    const cards = document.querySelectorAll('.image-preview-card');
    cards.forEach(card => {
        card.style.transform = '';
        card.style.boxShadow = '';
    });

    draggedIndex = null;
}

// Add keyboard support for adding images
document.addEventListener('DOMContentLoaded', function() {
    const newImageInput = document.getElementById('newImageUrl');
    if (newImageInput) {
        newImageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                addNewImage();
            }
        });
    }
});

// ============================================================
// CONTENT COMPLETION TRACKING
// ============================================================

/**
 * Check content completion status and update indicators
 * Matches the implementation in sinks.js for consistency
 */
function updateContentCompletionIndicators() {
    console.log('🔍 updateContentCompletionIndicators() called');

    const contentFields = [
        { id: 'editBodyHtml', checkId: 'description-check', incompleteId: 'description-incomplete', name: 'description' },
        { id: 'editFeatures', checkId: 'features-check', incompleteId: 'features-incomplete', name: 'features' },
        { id: 'editCareInstructions', checkId: 'care-check', incompleteId: 'care-incomplete', name: 'care' },
        { id: 'editFaqs', checkId: 'faqs-check', incompleteId: 'faqs-incomplete', name: 'faqs' },
        { id: 'editAsteriskInfo', checkId: 'asterisk-check', incompleteId: 'asterisk-incomplete', name: 'asterisk' }
    ];

    let completedCount = 0;

    contentFields.forEach(field => {
        const textarea = document.getElementById(field.id);
        const checkElement = document.getElementById(field.checkId);
        const incompleteElement = document.getElementById(field.incompleteId);

        console.log(`🔍 Field ${field.name}: textarea=${!!textarea}, check=${!!checkElement}, incomplete=${!!incompleteElement}`);

        if (textarea && checkElement && incompleteElement) {
            const contentLength = textarea.value.trim().length;
            const hasContent = contentLength > 10; // Minimum 10 characters

            console.log(`📝 ${field.name}: length=${contentLength}, hasContent=${hasContent}`);

            if (hasContent) {
                // Show green checkmark, hide red dot
                checkElement.style.display = 'inline';
                incompleteElement.style.display = 'none';
                completedCount++;
            } else {
                // Show red dot, hide green checkmark
                checkElement.style.display = 'none';
                incompleteElement.style.display = 'inline';
            }
        } else {
            console.warn(`⚠️ Missing elements for field ${field.name}`);
        }
    });

    // Update overall completion badge
    const completionStatus = document.getElementById('completionStatus');
    if (completionStatus) {
        const isAllComplete = completedCount === contentFields.length;
        const badge = completionStatus.parentElement;

        if (isAllComplete) {
            badge.className = 'badge bg-success';
            completionStatus.innerHTML = '<i class="fas fa-check-circle me-1"></i>All Content Complete';
        } else if (completedCount > 0) {
            badge.className = 'badge bg-warning';
            completionStatus.innerHTML = `<i class="fas fa-clock me-1"></i>${completedCount}/${contentFields.length} Complete`;
        } else {
            badge.className = 'badge bg-secondary';
            completionStatus.innerHTML = `<i class="fas fa-clock me-1"></i>0/${contentFields.length} Complete`;
        }
    }

    console.log(`📊 Content completion: ${completedCount}/${contentFields.length} fields completed`);
}

/**
 * Set up content completion monitoring
 */
function setupContentCompletionMonitoring() {
    const contentFields = ['editBodyHtml', 'editFeatures', 'editCareInstructions', 'editFaqs', 'editAsteriskInfo'];

    contentFields.forEach(fieldId => {
        const textarea = document.getElementById(fieldId);
        if (textarea) {
            // Check on input change
            textarea.addEventListener('input', updateContentCompletionIndicators);
            textarea.addEventListener('blur', updateContentCompletionIndicators);

            // Also monitor for programmatic content changes (like from Generate buttons)
            const observer = new MutationObserver(() => {
                updateContentCompletionIndicators();
            });
            observer.observe(textarea, {
                attributes: true,
                attributeFilter: ['value'],
                childList: true,
                characterData: true
            });
        }
    });

    // Initial check
    updateContentCompletionIndicators();

    console.log('🔍 Content completion monitoring set up with red incomplete indicators');
}

/**
 * Get asterisk information lines that start with '*'
 */
function getAsteriskInfo() {
    const asteriskField = document.getElementById('editAsteriskInfo');
    if (!asteriskField || !asteriskField.value.trim()) {
        return [];
    }

    const lines = asteriskField.value.split('\n');
    const asteriskLines = lines
        .map(line => line.trim())
        .filter(line => line.startsWith('*') && line.length > 1);

    console.log(`📋 Found ${asteriskLines.length} asterisk info lines:`, asteriskLines);
    return asteriskLines;
}

/**
 * Remove existing asterisk lines from content
 */
function removeExistingAsteriskLines(content) {
    if (!content) return content;

    const lines = content.split('\n');
    const filteredLines = lines.filter(line => {
        const trimmed = line.trim();
        return !(trimmed.startsWith('*') && trimmed.length > 1);
    });

    return filteredLines.join('\n').replace(/\n\n+$/, ''); // Remove trailing empty lines
}

/**
 * Append asterisk info to description (with cleanup)
 */
function appendAsteriskToDescription(description) {
    // First remove any existing asterisk lines
    let cleanDescription = removeExistingAsteriskLines(description);

    // Get current asterisk info
    const asteriskLines = getAsteriskInfo();

    if (asteriskLines.length === 0) {
        return cleanDescription;
    }

    // Append asterisk info as a separate section
    const asteriskSection = asteriskLines.join('\n');
    return cleanDescription + '\n\n' + asteriskSection;
}

/**
 * Append asterisk info to features (with cleanup)
 */
function appendAsteriskToFeatures(features) {
    // First remove any existing asterisk lines
    let cleanFeatures = removeExistingAsteriskLines(features);

    // Get current asterisk info
    const asteriskLines = getAsteriskInfo();

    if (asteriskLines.length === 0) {
        return cleanFeatures;
    }

    // Append asterisk info as bullet points
    const asteriskSection = asteriskLines.join('\n');
    return cleanFeatures + '\n\n' + asteriskSection;
}

// ============================================================
// MODAL INITIALIZATION
// ============================================================

/**
 * Initialize content tabs and set up monitoring
 * Called when the modal is shown
 */
function initializeContentTabs() {
    console.log('🎯 Initializing content tabs for basins');

    // Set up content completion monitoring
    setupContentCompletionMonitoring();

    console.log('✅ Content tabs initialization completed');
}

// Flag to track modal initialization
let modalInitialized = false;

// Event listeners for basins-specific functionality
document.addEventListener('DOMContentLoaded', function() {
    // Listen for modal show events to initialize content tabs
    const editModal = document.getElementById('editProductModal');
    if (editModal) {
        editModal.addEventListener('shown.bs.modal', function() {
            console.log('🔄 Basins modal shown event triggered');

            // Always run content completion check on every modal show
            setTimeout(() => {
                // Initialize content tabs and monitoring
                initializeContentTabs();

                console.log('✅ Basins modal initialization completed');
            }, 200);
        });
    }
});

// ============================================================
// WINDOW EXPORTS
// ============================================================

// Core functions
window.getCurrentCollectionName = getCurrentCollectionName;
window.syncGoogleSheet = syncGoogleSheet;
window.updateFieldFromCard = updateFieldFromCard;
window.renderProductSpecs = renderProductSpecs;
window.populateCollectionSpecificFields = populateCollectionSpecificFields;
window.getCollectionSpecificFields = getCollectionSpecificFields;

// Save functions
window.collectFormData = collectFormData;
window.saveBasinsProduct = saveBasinsProduct;
window.saveProduct = saveBasinsProduct;  // Override base.js saveProduct for basins collection

// Extraction functions
window.extractCurrentProductImages = extractCurrentProductImages;
window.extractSingleProductWithStatus = extractSingleProductWithStatus;

// Validation functions
window.validateSpecSheetUrl = validateSpecSheetUrl;
window.validateSpecSheetInBackground = validateSpecSheetInBackground;
window.showValidationResult = showValidationResult;
window.isValidUrl = isValidUrl;

// Content generation
window.generateTabContentWithAsterisk = generateTabContentWithAsterisk;
window.generateTabContent = generateTabContent;

// Content completion tracking
window.updateContentCompletionIndicators = updateContentCompletionIndicators;
window.setupContentCompletionMonitoring = setupContentCompletionMonitoring;
window.initializeContentTabs = initializeContentTabs;
window.getAsteriskInfo = getAsteriskInfo;
window.appendAsteriskToDescription = appendAsteriskToDescription;
window.appendAsteriskToFeatures = appendAsteriskToFeatures;

// Image management functions
window.initializeAdditionalImages = initializeAdditionalImages;
window.addNewImage = addNewImage;
window.removeImage = removeImage;
window.updateAdditionalImagesDisplay = updateAdditionalImagesDisplay;
window.updateHiddenField = updateHiddenField;

// Drag and drop functions
window.handleDragStart = handleDragStart;
window.handleDragOver = handleDragOver;
window.handleDrop = handleDrop;
window.handleDragEnd = handleDragEnd;
