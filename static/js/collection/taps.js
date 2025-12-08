/**
 * Taps Collection JavaScript - Specific functionality for taps collection
 */

// Taps-specific field mappings - matches taps_modal.html and TapsCollection config
// Updated to match 48-column Google Sheet structure
const TAPS_FIELD_MAPPINGS = {
    // Basic fields (A-G)
    'editSku': 'variant_sku',
    'editTitle': 'title',
    'editVendor': 'vendor',
    'editBrandName': 'brand_name',
    'editRange': 'range',
    'editStyle': 'style',

    // Tap specifications (H-Y)
    'editMountingType': 'mounting_type',
    'editColourFinish': 'colour_finish',
    'editMaterial': 'material',
    'editWarrantyYears': 'warranty_years',
    'editApplicationLocation': 'application_location',

    // Dimensions (O-P)
    'editSpoutHeightMm': 'spout_height_mm',
    'editSpoutReachMm': 'spout_reach_mm',

    // Handle & Operation (Q-T)
    'editHandleType': 'handle_type',
    'editHandleCount': 'handle_count',
    'editSwivelSpout': 'swivel_spout',
    'editCartridgeType': 'cartridge_type',

    // Water Performance (U)
    'editFlowRate': 'flow_rate',

    // Certifications (V-X) - Note: watermark_certification removed (not in sheet)
    'editWelsRating': 'wels_rating',
    'editWelsRegistrationNumber': 'wels_registration_number',
    'editLeadFreeCompliance': 'lead_free_compliance',

    // Content (Z-AB)
    'editBodyHtml': 'body_html',
    'editFeatures': 'features',
    'editCareInstructions': 'care_instructions',

    // System/Shopify fields (AC-AO)
    'editProductStatus': 'shopify_status',
    'editRrpPrice': 'shopify_compare_price',
    'editSalePrice': 'shopify_price',
    'editWeight': 'shopify_weight',
    'editShopifyTags': 'shopify_tags',
    'editSeoTitle': 'seo_title',
    'editSeoDescription': 'seo_description',

    // Media (AK-AL)
    'editAdditionalImages': 'shopify_images',
    'editShopifySpecSheet': 'shopify_spec_sheet',

    // FAQs (AV)
    'editFaqs': 'faqs'
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
    const hiddenField = document.getElementById('editAdditionalImages');
    if (hiddenField) {
        hiddenField.value = additionalImagesArray.join(',');
    }
}

/**
 * Collect all form data for saving
 * @param {string} collectionName - The collection name (taps)
 * @returns {Object} - The collected form data
 */
function collectFormData(collectionName) {
    console.log('🚿 Collecting tap-specific form data...');

    // Ensure additional images hidden field is up to date before collecting
    updateHiddenField();

    const data = {};

    // Collect data based on TAPS_FIELD_MAPPINGS
    Object.entries(TAPS_FIELD_MAPPINGS).forEach(([fieldId, dataKey]) => {
        const element = document.getElementById(fieldId);
        if (element) {
            let value = element.value ? element.value.trim() : '';

            // Special handling for additional images - ensure we use the current array
            if (fieldId === 'editAdditionalImages') {
                value = additionalImagesArray.join(',');
                console.log(`🖼️ Additional images array has ${additionalImagesArray.length} images`);
            }

            // Convert Yes/No back to TRUE/FALSE for boolean fields when saving to Google Sheets
            if ((fieldId === 'editSwivelSpout' || fieldId === 'editLeadFreeCompliance') && element.tagName === 'SELECT') {
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
async function saveTapsProduct() {
    console.log('⚡ saveTapsProduct() - Instant save with background processing...');

    // Get current row number from modal state
    const modal = document.getElementById('editProductModal');
    const currentRow = modal ? modal.dataset.currentRow : null;

    if (!currentRow) {
        console.error('❌ No current row found');
        showErrorMessage('No product selected for editing');
        return;
    }

    // Collect all form data immediately
    const updatedData = collectFormData('taps');

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
        // Flash success on button
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

    // Add subtle background indicator
    addBackgroundSaveIndicator();

    while (backgroundSaveQueue.length > 0) {
        const task = backgroundSaveQueue.shift();
        console.log(`💾 Background saving row ${task.currentRow} with ${Object.keys(task.updatedData).length} fields...`);

        try {
            const response = await fetch(`/api/taps/products/${task.currentRow}/batch`, {
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

        // Small delay between saves to prevent overwhelming the server
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
 * Render tap-specific product specifications for product cards
 * Displays key tap specs on collection page cards
 */
function renderProductSpecs(product) {
    const rowNum = product.row_number;
    const specs = [];

    // Mounting Type - editable dropdown
    specs.push({
        label: 'Mounting',
        html: `<select class="spec-dropdown" data-row="${rowNum}" data-field="mounting_type" onchange="updateFieldFromCard(event)" onclick="event.stopPropagation()">
            <option value="">Select...</option>
            <option value="Hob Mounting" ${product.mounting_type === 'Hob Mounting' ? 'selected' : ''}>Hob Mounting</option>
            <option value="Wall Mounted" ${product.mounting_type === 'Wall Mounted' ? 'selected' : ''}>Wall Mounted</option>
        </select>`
    });

    // Handle Type - editable dropdown
    specs.push({
        label: 'Handle',
        html: `<select class="spec-dropdown" data-row="${rowNum}" data-field="handle_type" onchange="updateFieldFromCard(event)" onclick="event.stopPropagation()">
            <option value="">Select...</option>
            <option value="Pin lever" ${product.handle_type === 'Pin lever' ? 'selected' : ''}>Pin lever</option>
            <option value="Disc Handle" ${product.handle_type === 'Disc Handle' ? 'selected' : ''}>Disc Handle</option>
            <option value="Twin Lever" ${product.handle_type === 'Twin Lever' ? 'selected' : ''}>Twin Lever</option>
            <option value="Single Lever" ${product.handle_type === 'Single Lever' ? 'selected' : ''}>Single Lever</option>
        </select>`
    });

    // Colour/Finish - visual identifier
    if (product.colour_finish) {
        specs.push({
            label: 'Finish',
            value: product.colour_finish,
            badge: 'finish-badge'
        });
    }

    // Flow Rate - water performance
    if (product.flow_rate) {
        specs.push({
            label: 'Flow Rate',
            value: product.flow_rate
        });
    }

    // WELS Rating - water efficiency
    if (product.wels_rating) {
        specs.push({
            label: 'WELS',
            value: product.wels_rating
        });
    }

    // Spout Height - dimensions
    if (product.spout_height_mm) {
        specs.push({
            label: 'Height',
            value: `${product.spout_height_mm}mm`
        });
    }

    // Warranty - quality indicator
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
 * Populate tap-specific fields in modal
 */
function populateCollectionSpecificFields(data) {
    console.log('🚿 Populating tap-specific fields:', data);

    // Map all tap-specific fields
    Object.entries(TAPS_FIELD_MAPPINGS).forEach(([fieldId, dataKey]) => {
        const element = document.getElementById(fieldId);
        if (element && data[dataKey] !== undefined) {
            element.value = data[dataKey] || '';
            // Special logging for features field
            if (fieldId === 'editFeatures') {
                console.log(`🔍 Features field debug:
                  - Field ID: ${fieldId}
                  - Data key: ${dataKey}
                  - Data value: "${data[dataKey]}"
                  - Element found: ${!!element}
                  - Value set to: "${element ? element.value : 'N/A'}"`);
            }
        }
    });

    // Handle any specific tap field logic here if needed
    validateFlowRate();
}

/**
 * Validate flow rate input
 */
function validateFlowRate() {
    const flowRateEl = document.getElementById('editFlowRate');
    if (!flowRateEl) return;

    const flowRateValue = flowRateEl.value.trim();
    if (!flowRateValue) return;

    // Extract numeric value (e.g., "6 L/min" → 6)
    const flowRate = parseFloat(flowRateValue);
    const flowRateInfo = document.querySelector('.flow-rate-info');

    if (flowRate && flowRateInfo) {
        let message = '';
        let className = 'flow-rate-info';

        if (flowRate < 2) {
            message = 'Low flow rate - suitable for water conservation';
            className += ' text-success';
        } else if (flowRate > 10) {
            message = 'High flow rate - check local water restrictions';
            className += ' text-warning';
        } else {
            message = 'Standard flow rate';
            className += ' text-info';
        }

        flowRateInfo.textContent = message;
        flowRateInfo.className = className;
    }
}

/**
 * Get current collection name from URL or context
 */
function getCurrentCollectionName() {
    // Try to get from hidden field first
    const collectionField = document.getElementById('editCollectionName');
    if (collectionField && collectionField.value) {
        return collectionField.value;
    }

    // Fallback to detecting from URL or page context
    const path = window.location.pathname;
    if (path.includes('/sinks')) return 'sinks';
    if (path.includes('/taps')) return 'taps';
    if (path.includes('/lighting')) return 'lighting';

    // Default fallback
    return 'taps';
}

/**
 * Sync Google Sheet - Refresh cache from Google Sheets
 */
async function syncGoogleSheet() {
  const collectionName = getCurrentCollectionName();

  // Show loading indicator
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

      // Clear all caches and force fresh reload
      setTimeout(() => {
        // Clear background cache
        if (window.backgroundCache) {
          window.backgroundCache = {};
        }

        // Force refresh with cache busting
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
 * Export tap specifications
 */
async function exportTapSpecs() {
    // TODO: Implement export-specs endpoint in Flask
    showInfoMessage('ℹ️ Export feature will be available once connected to Google Sheets');
}

/**
 * Generate AI description for tap products
 */
async function generateAIDescription(event) {
    const modal = document.getElementById('editProductModal');
    const currentRow = modal.dataset.currentRow;

    if (!currentRow || !productsData[currentRow]) {
        showErrorMessage('No product data available for AI description generation');
        return;
    }

    try {
        const data = productsData[currentRow];

        // Start AI loading animation
        const loadingId = window.aiLoadingManager ?
            window.aiLoadingManager.startDescriptionGeneration(event ? event.target : null) : null;

        const response = await fetch(`/api/taps/products/${currentRow}/generate-description`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                product_data: data,
                row_number: currentRow
            })
        });

        const result = await response.json();

        if (result.success) {
            // Stop loading animation
            if (loadingId && window.aiLoadingManager) {
                window.aiLoadingManager.stopLoading(loadingId);
            }

            showSuccessMessage('✅ AI description generated successfully!');

            // Live updates will handle field updates via SocketIO
            console.log('🔄 AI generation complete, waiting for live updates...');

            // If live updates are not available, manually refresh modal data
            if (!window.liveUpdatesManager || !window.liveUpdatesManager.isLiveUpdatesActive()) {
                console.log('🔄 Live updates not active, manually refreshing modal...');
                if (window.liveUpdatesManager) {
                    window.liveUpdatesManager.refreshModalData();
                }
            }
        } else {
            throw new Error(result.error || 'Failed to generate description');
        }

    } catch (error) {
        console.error('Error generating AI description:', error);

        // Stop loading animation on error
        if (loadingId && window.aiLoadingManager) {
            window.aiLoadingManager.stopLoading(loadingId);
        }

        showErrorMessage('Failed to generate AI description: ' + error.message);
    }
}

/**
 * Add product with AI extraction (tap-specific)
 */
async function addProductWithAI() {
    // TODO: Implement extract-product endpoint in Flask
    showInfoMessage('ℹ️ AI extraction feature will be available once OpenAI API is configured');
}

/**
 * Extract images for current product in modal
 */
async function extractCurrentProductImages(event) {
    const modal = document.getElementById('editProductModal');
    const currentRow = modal.dataset.currentRow;

    if (!currentRow || !productsData[currentRow]) {
        showErrorMessage('No product data available for image extraction');
        return;
    }

    const product = productsData[currentRow];
    const productUrl = product.url || product.product_url || product.link;

    if (!productUrl) {
        showErrorMessage('No product URL found for image extraction. Please add a URL to this product first.');
        return;
    }

    console.log(`🖼️ Extracting images for product row ${currentRow} from ${productUrl}`);

    // Start AI loading animation for image extraction
    const loadingId = window.aiLoadingManager ?
        window.aiLoadingManager.startAIExtraction(event ? event.target : null) : null;

    // Show status in modal
    const statusBadge = document.getElementById('modalStatusBadge');
    if (statusBadge) {
        statusBadge.textContent = 'Extracting Images...';
        statusBadge.className = 'badge bg-warning ms-3';
        statusBadge.style.display = 'inline';
    }

    try {
        const response = await fetch(`/api/taps/products/${currentRow}/extract-images`, {
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
            // Stop loading animation
            if (loadingId && window.aiLoadingManager) {
                window.aiLoadingManager.stopLoading(loadingId);
            }

            if (statusBadge) {
                statusBadge.textContent = 'Images Extracted';
                statusBadge.className = 'badge bg-success ms-3';
            }

            showSuccessMessage(`✅ Extracted ${result.image_count || 0} images successfully!`);

            // Live updates will handle the data refresh
            console.log('🔄 Image extraction complete, waiting for live updates...');

            // If live updates are not available, manually refresh modal data
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

        // Stop loading animation on error
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
 * Generate AI features for tap products
 */
async function generateAIFeatures(event) {
    const modal = document.getElementById('editProductModal');
    const currentRow = modal.dataset.currentRow;

    if (!currentRow || !productsData[currentRow]) {
        showErrorMessage('No product data available for features generation');
        return;
    }

    try {
        const data = productsData[currentRow];

        // Start AI loading animation for features
        const loadingId = window.aiLoadingManager ?
            window.aiLoadingManager.startFeaturesGeneration(event ? event.target : null) : null;

        const response = await fetch(`/api/taps/products/${currentRow}/generate-features`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                product_data: data,
                row_number: currentRow
            })
        });

        const result = await response.json();

        if (result.success) {
            // Stop loading animation
            if (loadingId && window.aiLoadingManager) {
                window.aiLoadingManager.stopLoading(loadingId);
            }

            showSuccessMessage('✅ 5 key features generated successfully!');

            // Live updates will handle field updates via SocketIO
            console.log('🔄 Features generation complete, waiting for live updates...');

            // If live updates are not available, manually refresh modal data
            if (!window.liveUpdatesManager || !window.liveUpdatesManager.isLiveUpdatesActive()) {
                console.log('🔄 Live updates not active, manually refreshing modal...');
                if (window.liveUpdatesManager) {
                    window.liveUpdatesManager.refreshModalData();
                }
            }
        } else {
            throw new Error(result.error || 'Failed to generate features');
        }

    } catch (error) {
        console.error('Error generating features:', error);

        // Stop loading animation on error
        if (loadingId && window.aiLoadingManager) {
            window.aiLoadingManager.stopLoading(loadingId);
        }

        showErrorMessage('Failed to generate features: ' + error.message);
    }
}

/**
 * Check tap compatibility - validates mounting type and style combinations
 */
function checkTapCompatibility() {
    const style = document.getElementById('editStyle')?.value;
    const mounting = document.getElementById('editMountingType')?.value;
    const handleType = document.getElementById('editHandleType')?.value;
    const applicationLocation = document.getElementById('editApplicationLocation')?.value;

    // Example compatibility logic
    if (style === 'Kitchen Mixer' && mounting === 'Wall Mounted') {
        showInfoMessage('⚠️ Kitchen mixers are typically deck mounted. Please verify installation requirements.');
    }

    if (handleType === 'Pull-out' && applicationLocation === 'Bathroom') {
        showInfoMessage('ℹ️ Pull-out handles are typically used for kitchen applications.');
    }

    if (mounting === 'Wall Mounted' && !style) {
        showInfoMessage('ℹ️ Please specify the tap style for proper installation guidance.');
    }
}

/**
 * Open compare window - opens supplier URL in new window
 */
function openCompareWindow() {
    const rowNum = document.getElementById('editRowNum').value;
    if (!rowNum || !productsData[rowNum]) {
        showErrorMessage('No product data available for comparison');
        return;
    }
    const productData = productsData[rowNum];
    const urlToOpen = productData.url || productData.supplier_url || productData.product_url || productData['Column A'];
    if (!urlToOpen || urlToOpen.trim() === '' || urlToOpen === '-') {
        showErrorMessage('No supplier URL available for this product');
        return;
    }
    console.log('🔗 Opening compare window:', urlToOpen);
    window.open(urlToOpen, '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
}

/**
 * Show/hide compare button based on pricing_enabled flag and URL availability
 */
function updateCompareButtonVisibility(productData) {
    const compareButton = document.getElementById('compareButton');

    if (!compareButton) return;

    // Check if pricing is enabled for this collection
    if (!window.COLLECTION_CONFIG || !window.COLLECTION_CONFIG.pricing_enabled) {
        compareButton.style.display = 'none';
        return;
    }

    // Pricing is enabled, now check for URL
    const urlToOpen = productData.url || productData.supplier_url || productData.product_url || productData['Column A'];

    if (urlToOpen && urlToOpen.trim() !== '' && urlToOpen !== '-') {
        compareButton.style.display = 'inline-block';
        compareButton.disabled = false;
        compareButton.title = 'Compare prices with supplier';
    } else {
        // Show button but disable it if no URL available
        compareButton.style.display = 'inline-block';
        compareButton.disabled = true;
        compareButton.title = 'No supplier URL available for comparison';
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

    // Start AI loading animation for extraction
    const loadingId = window.aiLoadingManager ?
        window.aiLoadingManager.startAIExtraction(event ? event.target : null) : null;

    // Show status in modal
    const statusBadge = document.getElementById('modalStatusBadge');
    if (statusBadge) {
        statusBadge.textContent = 'Extracting...';
        statusBadge.className = 'badge bg-warning ms-3';
        statusBadge.style.display = 'inline';
    }

    try {
        // Call the single product AI extraction endpoint
        const response = await fetch(`/api/taps/products/${rowNum}/extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                overwrite_mode: true
            })
        });

        const result = await response.json();

        if (result.success) {
            console.log('✅ AI extraction successful');
            console.log('🔍 DEBUG: AI extraction result:', result);

            // Stop loading animation
            if (loadingId && window.aiLoadingManager) {
                window.aiLoadingManager.stopLoading(loadingId);
            }

            if (statusBadge) {
                statusBadge.textContent = 'Extraction Complete';
                statusBadge.className = 'badge bg-success ms-3';
            }

            showSuccessMessage('✅ AI extraction completed successfully!');

            // Log the API response to understand its structure
            console.log('🔍 DEBUG: Full AI extraction API response:', result);

            // Manual refresh after Google Apps Script processing time
            console.log('🔄 AI extraction complete, waiting for Google Apps Script processing...');

            const modal = document.getElementById('editProductModal');
            const currentRow = modal?.dataset?.currentRow;

            if (currentRow) {
                // Wait longer for Google Apps Script to process the data
                setTimeout(async () => {
                    console.log('🔄 Refreshing modal after Google Apps Script processing...');
                    await refreshModalAfterExtraction(currentRow);
                }, 5000);
            } else {
                console.warn('⚠️ Could not determine current row for refresh');
            }
        } else {
            throw new Error(result.message || 'AI extraction failed');
        }

    } catch (error) {
        console.error('❌ Error in AI extraction:', error);

        // Stop loading animation on error
        if (loadingId && window.aiLoadingManager) {
            window.aiLoadingManager.stopLoading(loadingId);
        }

        if (statusBadge) {
            statusBadge.textContent = 'Extraction Failed';
            statusBadge.className = 'badge bg-danger ms-3';
        }
        showErrorMessage(`AI extraction failed: ${error.message}`);
    }
}

/**
 * Manually refresh modal data after extraction (SocketIO fallback)
 */
async function refreshModalAfterExtraction(rowNum) {
    try {
        console.log(`🔄 Refreshing modal data for row ${rowNum}...`);

        // Fetch fresh product data from server
        const response = await fetch(`/api/taps/products/${rowNum}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        if (result.success && result.product) {
            const productData = result.product;
            console.log('📦 Fresh data received:', productData);

            // Debug: Check for image-related fields
            console.log('🔍 DEBUG: Checking for image fields in fresh data...');
            Object.keys(productData).forEach(key => {
                if (key.toLowerCase().includes('image') || key.toLowerCase().includes('shopify')) {
                    console.log(`🖼️ DEBUG: Found image-related field: ${key} = "${productData[key]}"`);
                }
            });

            let updatedFields = 0;

            // Update fields using the proper TAPS_FIELD_MAPPINGS (inverted)
            Object.entries(TAPS_FIELD_MAPPINGS).forEach(([fieldId, dataKey]) => {
                const element = document.getElementById(fieldId);
                if (element && productData[dataKey] !== undefined) {
                    element.value = productData[dataKey] || '';
                    updatedFields++;
                }
            });

            console.log(`✅ Updated ${updatedFields} fields in modal`);

            // Update compare button visibility
            updateCompareButtonVisibility(productData);

            // Refresh image gallery if available
            if (window.imageGalleryManager && window.imageGalleryManager.refreshGallery) {
                console.log('🖼️ Refreshing image gallery...');
                window.imageGalleryManager.refreshGallery(productData);
            }

            showSuccessMessage('Modal data refreshed successfully');
        } else {
            throw new Error('Failed to fetch product data');
        }
    } catch (error) {
        console.error('❌ Error refreshing modal:', error);
        showErrorMessage(`Failed to refresh modal: ${error.message}`);
    }
}

// Event listeners for tap-specific functionality
document.addEventListener('DOMContentLoaded', function() {
    // Flow rate validation
    const flowRateEl = document.getElementById('editFlowRate');
    if (flowRateEl) {
        flowRateEl.addEventListener('input', validateFlowRate);
    }

    // Compatibility checking
    const styleEl = document.getElementById('editStyle');
    const mountingEl = document.getElementById('editMountingType');
    const handleTypeEl = document.getElementById('editHandleType');
    const applicationEl = document.getElementById('editApplicationLocation');

    [styleEl, mountingEl, handleTypeEl, applicationEl].forEach(el => {
        if (el) {
            el.addEventListener('change', checkTapCompatibility);
        }
    });
});

// Utility function for info messages
function showInfoMessage(message) {
    // Simple console log for now - can be replaced with toast notification
    console.log('ℹ️ ' + message);
    // You could implement a proper toast notification here
}

/**
 * Validate spec sheet URL
 */
function validateSpecSheetUrl() {
    const urlInput = document.getElementById('editShopifySpecSheet');
    const url = urlInput.value.trim();
    const resultDiv = document.getElementById('specSheetValidationResult');

    if (!url) {
        showValidationResult('Please enter a spec sheet URL', 'warning');
        return;
    }

    if (!isValidUrl(url)) {
        showValidationResult('Please enter a valid URL', 'danger');
        return;
    }

    // Show loading state
    const button = document.querySelector('button[onclick="validateSpecSheetUrl()"]');
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Validating...';
    button.disabled = true;

    // Clear previous results
    if (resultDiv) {
        resultDiv.style.display = 'none';
    }

    // Run validation and reset button afterwards
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
    const resultDiv = document.getElementById('specSheetValidationResult');

    try {
        // Get current row number
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
            // Show the actual error from the server
            showValidationResult(`❌ ${data.error || 'Validation failed'}`, 'danger');
            return;
        }

        if (data.success) {
            // Show success message with details
            let message = '<strong>✅ Spec sheet validated successfully!</strong><br>';
            if (data.accessible) {
                message += '<span class="text-success">• PDF is accessible</span><br>';
            }
            if (data.sku_match) {
                message += '<span class="text-success">• SKU matches product</span><br>';
            }
            if (data.file_size) {
                message += `<span class="text-muted">• File size: ${(data.file_size / 1024).toFixed(1)} KB</span>`;
            }
            showValidationResult(message, 'success');
        } else {
            showValidationResult(`❌ ${data.error || 'Validation failed'}`, 'danger');
        }
    } catch (error) {
        console.error('Validation error:', error);
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
 * Extract dimensions from PDF spec sheet
 */
async function extractDimensionsFromPDF(rowNum) {
    const specSheetField = document.getElementById('editShopifySpecSheet');
    const specSheetUrl = specSheetField?.value;

    if (!specSheetUrl) {
        showErrorMessage('Please enter a spec sheet URL first');
        return;
    }

    if (!specSheetUrl.toLowerCase().endsWith('.pdf')) {
        showErrorMessage('Spec sheet must be a PDF file');
        return;
    }

    // Show loading state
    const specSheetStatus = document.getElementById('specSheetStatus');
    if (specSheetStatus) {
        specSheetStatus.textContent = 'Extracting...';
        specSheetStatus.className = 'badge bg-warning ms-2';
    }

    try {
        const collectionName = getCurrentCollectionName();
        const response = await fetch(`/api/${collectionName}/process-spec-sheet-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: specSheetUrl,
                row_number: rowNum,
                current_product: window.productsData?.[rowNum] || {}
            })
        });

        const result = await response.json();

        if (result.success && result.extracted_data) {
            const extracted = result.extracted_data;
            let fieldsPopulated = 0;

            // Auto-fill form fields with extracted dimensions
            for (const [key, value] of Object.entries(extracted)) {
                // The server already sends field IDs with 'edit' prefix (e.g., 'editSpoutReachMm')
                const fieldElement = document.getElementById(key);
                if (fieldElement && value) {
                    fieldElement.value = value;
                    fieldElement.classList.add('bg-success', 'bg-opacity-10');
                    fieldsPopulated++;
                }
            }

            // Update status
            if (specSheetStatus) {
                specSheetStatus.textContent = 'Extracted!';
                specSheetStatus.className = 'badge bg-success ms-2';
            }

            showSuccessMessage(`AI extracted ${fieldsPopulated} fields from the PDF!`);
        } else {
            throw new Error(result.error || 'Failed to extract data from PDF');
        }
    } catch (error) {
        console.error('PDF extraction error:', error);
        if (specSheetStatus) {
            specSheetStatus.textContent = 'Extraction failed';
            specSheetStatus.className = 'badge bg-danger ms-2';
        }
        showErrorMessage('Failed to extract data from PDF: ' + error.message);
    }
}

/**
 * Lookup WELS data for current product
 */
async function lookupWELSData() {
    const skuField = document.getElementById('editSku');
    const brandField = document.getElementById('editBrandName');
    const rowNumField = document.getElementById('editRowNum');

    const sku = skuField?.value;
    const brand = brandField?.value;
    const rowNum = rowNumField?.value;

    if (!sku) {
        showErrorMessage('Please enter a SKU first');
        return;
    }

    if (!brand) {
        showErrorMessage('Please enter a Brand Name first');
        return;
    }

    try {
        // Show loading state
        const welsRatingField = document.getElementById('editWelsRating');
        const welsRegField = document.getElementById('editWelsRegistrationNumber');
        const flowRateField = document.getElementById('editFlowRate');

        if (welsRatingField) welsRatingField.value = 'Looking up...';
        if (welsRegField) welsRegField.value = 'Looking up...';
        if (flowRateField) flowRateField.value = 'Looking up...';

        // Call API
        const response = await fetch(`/api/${getCurrentCollectionName()}/lookup-wels`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sku, brand, row_number: rowNum })
        });

        const result = await response.json();

        if (result.success && result.wels_data) {
            const wels = result.wels_data;

            // Populate fields (excluding pressure - not reliable in WELS sheet)
            if (welsRatingField) welsRatingField.value = wels.wels_rating || '';
            if (welsRegField) welsRegField.value = wels.wels_registration_number || '';
            if (flowRateField) flowRateField.value = wels.flow_rate || '';

            // Highlight filled fields
            [welsRatingField, welsRegField, flowRateField].forEach(field => {
                if (field && field.value) {
                    field.classList.add('bg-success', 'bg-opacity-10');
                    setTimeout(() => field.classList.remove('bg-success', 'bg-opacity-10'), 3000);
                }
            });

            showSuccessMessage(`✅ WELS data found! Rating: ${wels.wels_rating}, Flow: ${wels.flow_rate}`);
        } else {
            // Clear loading state
            if (welsRatingField) welsRatingField.value = '';
            if (welsRegField) welsRegField.value = '';
            if (flowRateField) flowRateField.value = '';

            showErrorMessage(result.error || 'WELS data not found for this SKU/Brand combination');
        }
    } catch (error) {
        console.error('WELS lookup error:', error);
        showErrorMessage('Failed to lookup WELS data: ' + error.message);
    }
}

/**
 * Bulk lookup WELS data for all products missing WELS information
 */
async function bulkLookupWELS() {
    if (!confirm('This will lookup WELS data for all products that have a SKU and Brand but are missing WELS information. Continue?')) {
        return;
    }

    try {
        showSuccessMessage('Starting bulk WELS lookup...');

        const response = await fetch(`/api/${getCurrentCollectionName()}/bulk-lookup-wels`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();

        if (result.success) {
            const { found, not_found, already_had_data, total_processed } = result;

            showSuccessMessage(
                `✅ Bulk WELS lookup complete!\n` +
                `Found: ${found} products\n` +
                `Not found: ${not_found} products\n` +
                `Already had data: ${already_had_data} products\n` +
                `Total processed: ${total_processed} products`
            );

            // Refresh the page to show updated data
            setTimeout(() => {
                window.location.reload();
            }, 3000);
        } else {
            showErrorMessage(result.error || 'Bulk WELS lookup failed');
        }
    } catch (error) {
        console.error('Bulk WELS lookup error:', error);
        showErrorMessage('Failed to perform bulk WELS lookup: ' + error.message);
    }
}

// Export functions to window for onclick handlers
window.syncGoogleSheet = syncGoogleSheet;
window.getCurrentCollectionName = getCurrentCollectionName;
window.exportTapSpecs = exportTapSpecs;
window.generateAIDescription = generateAIDescription;
window.addProductWithAI = addProductWithAI;
window.extractCurrentProductImages = extractCurrentProductImages;
window.generateAIFeatures = generateAIFeatures;
window.validateFlowRate = validateFlowRate;
window.checkTapCompatibility = checkTapCompatibility;
/**
 * Show bulk PDF extraction modal and load statistics
 */
async function showBulkPdfExtractionModal() {
  const modal = new bootstrap.Modal(document.getElementById('bulkPdfExtractionModal'));
  modal.show();

  // Reset UI
  document.getElementById('bulkPdfProgressContainer').style.display = 'none';
  document.getElementById('bulkPdfResults').style.display = 'none';
  document.getElementById('btnStartBulkExtraction').disabled = false;

  // Load statistics
  try {
    const collectionName = window.COLLECTION_NAME || 'taps';
    const response = await fetch(`/api/${collectionName}/count-pdfs`);
    const data = await response.json();

    if (data.success) {
      document.getElementById('statTotalProducts').textContent = data.total_products;
      document.getElementById('statWithPdf').textContent = data.with_pdf;
      document.getElementById('statWithData').textContent = data.with_data;
      document.getElementById('statReadyToExtract').textContent = data.ready_to_extract;
    }
  } catch (error) {
    console.error('Error loading PDF stats:', error);
  }
}

/**
 * Start bulk PDF extraction (no SocketIO - PythonAnywhere compatible)
 */
async function startBulkPdfExtraction() {
  const batchSize = parseInt(document.getElementById('bulkPdfBatchSize').value);
  const delaySeconds = parseInt(document.getElementById('bulkPdfDelay').value);
  const overwrite = document.getElementById('bulkPdfOverwrite').checked;

  // Show progress UI
  document.getElementById('bulkPdfProgressContainer').style.display = 'block';
  document.getElementById('bulkPdfResults').style.display = 'none';
  document.getElementById('btnStartBulkExtraction').disabled = true;
  document.getElementById('bulkPdfLog').innerHTML = '';

  // Show simple progress message
  const progressBar = document.getElementById('bulkPdfProgressBar');
  progressBar.style.width = '100%';
  progressBar.classList.add('progress-bar-animated');
  progressBar.textContent = 'Processing...';

  document.getElementById('bulkPdfProgressText').textContent =
    'Extraction running in background. This may take several minutes...';

  // Add initial log entry
  const logDiv = document.getElementById('bulkPdfLog');
  const logEntry = document.createElement('div');
  logEntry.className = 'text-info';
  logEntry.textContent = '🚀 Starting bulk PDF extraction in background...';
  logDiv.appendChild(logEntry);

  // Start the bulk extraction
  try {
    const collectionName = window.COLLECTION_NAME || 'taps';
    const response = await fetch(`/api/${collectionName}/bulk-extract-pdfs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batch_size: batchSize,
        delay_seconds: delaySeconds,
        overwrite: overwrite
      })
    });

    const data = await response.json();

    if (data.success) {
      // Show success message
      const successEntry = document.createElement('div');
      successEntry.className = 'text-success';
      successEntry.textContent = '✅ Extraction started successfully!';
      logDiv.appendChild(successEntry);

      const infoEntry = document.createElement('div');
      infoEntry.className = 'text-warning mt-2';
      infoEntry.innerHTML = `
        <strong>Note:</strong> The extraction is running in the background.<br>
        Please wait approximately ${Math.ceil(batchSize * delaySeconds / 60)} minutes, then refresh this page to see the results.
      `;
      logDiv.appendChild(infoEntry);

      // Show results section with message
      document.getElementById('bulkPdfResults').style.display = 'block';
      document.getElementById('resultTotal').textContent = '?';
      document.getElementById('resultSucceeded').textContent = '?';
      document.getElementById('resultFailed').textContent = '?';
      document.getElementById('resultSkipped').textContent = '?';

      // Stop animated progress
      progressBar.classList.remove('progress-bar-animated');
      progressBar.textContent = 'Running in background...';

      document.getElementById('btnStartBulkExtraction').disabled = false;
    } else {
      showErrorMessage('Failed to start bulk extraction: ' + (data.error || 'Unknown error'));
      document.getElementById('btnStartBulkExtraction').disabled = false;
    }
  } catch (error) {
    showErrorMessage('Error starting bulk extraction: ' + error.message);
    document.getElementById('btnStartBulkExtraction').disabled = false;
  }
}

/**
 * Update a field directly from the product card dropdown
 * Saves to backend immediately without opening modal
 */
async function updateFieldFromCard(event) {
  event.stopPropagation(); // Prevent card click from opening modal

  const select = event.target;
  const rowNum = parseInt(select.getAttribute('data-row'));
  const field = select.getAttribute('data-field');
  const newValue = select.value;

  console.log(`📝 Updating ${field} for row ${rowNum} to: ${newValue}`);

  // Show loading state
  select.disabled = true;
  select.style.opacity = '0.6';

  try {
    // Save to backend
    const response = await fetch(`/api/${window.COLLECTION_NAME || 'taps'}/products/${rowNum}`, {
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

      // Update local cache
      if (window.productsData && window.productsData[rowNum]) {
        window.productsData[rowNum][field] = newValue;
      }

      // Show brief success feedback
      select.style.borderColor = '#28a745';
      setTimeout(() => {
        select.style.borderColor = '';
      }, 1000);
    } else {
      throw new Error(data.error || 'Update failed');
    }
  } catch (error) {
    console.error(`❌ Error updating ${field}:`, error);

    // Show error feedback
    select.style.borderColor = '#dc3545';
    setTimeout(() => {
      select.style.borderColor = '';
    }, 2000);

    // Optionally show error message
    if (window.showErrorMessage) {
      window.showErrorMessage(`Failed to update ${field}: ${error.message}`);
    }
  } finally {
    // Re-enable dropdown
    select.disabled = false;
    select.style.opacity = '';
  }
}

window.updateFieldFromCard = updateFieldFromCard;
window.openCompareWindow = openCompareWindow;
window.updateCompareButtonVisibility = updateCompareButtonVisibility;
window.extractSingleProductWithStatus = extractSingleProductWithStatus;
window.refreshModalAfterExtraction = refreshModalAfterExtraction;
window.lookupWELSData = lookupWELSData;
window.bulkLookupWELS = bulkLookupWELS;
window.validateSpecSheetUrl = validateSpecSheetUrl;
window.validateSpecSheetInBackground = validateSpecSheetInBackground;
window.showValidationResult = showValidationResult;
window.isValidUrl = isValidUrl;
window.extractDimensionsFromPDF = extractDimensionsFromPDF;
window.showBulkPdfExtractionModal = showBulkPdfExtractionModal;
window.startBulkPdfExtraction = startBulkPdfExtraction;

// Export save functions
window.collectFormData = collectFormData;
window.saveTapsProduct = saveTapsProduct;
window.saveProduct = saveTapsProduct;  // Override base.js saveProduct for taps collection
window.updateHiddenField = updateHiddenField;
window.additionalImagesArray = additionalImagesArray;