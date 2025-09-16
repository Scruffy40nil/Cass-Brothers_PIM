/**
 * Sinks Collection JavaScript - Specific functionality for sinks collection
 */

// Sinks-specific field mappings (extends base mappings)
const SINKS_FIELD_MAPPINGS = {
    'editSku': 'variant_sku',
    'editTitle': 'title',
    'editVendor': 'vendor',
    'editInstallationType': 'installation_type',
    'editProductMaterial': 'product_material',
    'editGradeOfMaterial': 'grade_of_material',
    'editBrandName': 'brand_name',
    'editStyle': 'style',
    'editBowlsNumber': 'bowls_number',
    'editFaucetHoles': 'tap_holes_number',
    'editHasOverflow': 'has_overflow',
    'editWarrantyYears': 'warranty_years',
    'editWasteOutletDimensions': 'waste_outlet_dimensions',
    'editDrainPosition': 'drain_position',
    'editCutoutSizeMm': 'cutout_size_mm',
    'editLengthMm': 'length_mm',
    'editOverallWidthMm': 'overall_width_mm',
    'editOverallDepthMm': 'overall_depth_mm',
    'editMinCabinetSizeMm': 'min_cabinet_size_mm',
    'editBowlWidthMm': 'bowl_width_mm',
    'editBowlDepthMm': 'bowl_depth_mm',
    'editBowlHeightMm': 'bowl_height_mm',
    'editSecondBowlWidthMm': 'second_bowl_width_mm',
    'editSecondBowlDepthMm': 'second_bowl_depth_mm',
    'editSecondBowlHeightMm': 'second_bowl_height_mm',
    'editShopifySpecSheet': 'shopify_spec_sheet',
    'editAdditionalImages': 'shopify_images',
    'editApplicationLocation': 'application_location',
    'editRrpPrice': 'shopify_compare_price',
    'editSalePrice': 'shopify_price',
    'editWeight': 'shopify_weight',
    'editSeoTitle': 'seo_title',
    'editSeoDescription': 'seo_description',
    'editBodyHtml': 'body_html',
    'editCareInstructions': 'care_instructions',
    'editFeatures': 'features'
};

/**
 * Render sink-specific product specifications
 */
function renderProductSpecs(product) {
    const specs = [];

    if (product.installation_type) {
        specs.push({
            label: 'Installation',
            value: product.installation_type,
            badge: 'installation-badge'
        });
    }

    if (product.product_material) {
        specs.push({
            label: 'Material',
            value: product.product_material,
            badge: 'material-badge'
        });
    }

    if (product.bowls_number) {
        specs.push({
            label: 'Bowls',
            value: `${product.bowls_number} Bowl${product.bowls_number > 1 ? 's' : ''}`
        });
    }

    if (product.length_mm && product.overall_width_mm) {
        specs.push({
            label: 'Dimensions',
            value: `${product.length_mm}×${product.overall_width_mm}mm`
        });
    }

    if (product.tap_holes_number) {
        specs.push({
            label: 'Tap Holes',
            value: product.tap_holes_number
        });
    }

    return specs.map(spec => `
        <div class="spec-row">
            <span class="spec-label">${spec.label}:</span>
            <span class="spec-value ${spec.badge || ''}">${spec.value}</span>
        </div>
    `).join('');
}

/**
 * Collect form data for sinks collection
 */
function collectFormData(collectionName) {
    console.log('🚿 Collecting sink-specific form data...');
    const data = {};

    // Collect data based on SINKS_FIELD_MAPPINGS
    Object.entries(SINKS_FIELD_MAPPINGS).forEach(([fieldId, dataKey]) => {
        const element = document.getElementById(fieldId);
        if (element) {
            let value = element.value ? element.value.trim() : '';

            // Special handling for additional images - ensure we use the current array
            if (fieldId === 'editAdditionalImages') {
                value = additionalImagesArray.join(',');
            }

            if (value !== '') {
                data[dataKey] = value;
                console.log(`📄 Collected ${dataKey}: "${value}"`);
            }
        }
    });

    console.log(`✅ Collected ${Object.keys(data).length} fields for ${collectionName}`);
    return data;
}

/**
 * Populate sink-specific fields in modal
 */
function populateCollectionSpecificFields(data) {
    console.log('🚿 Populating sink-specific fields:', data);

    // Map all sink-specific fields with type validation
    Object.entries(SINKS_FIELD_MAPPINGS).forEach(([fieldId, dataKey]) => {
        const element = document.getElementById(fieldId);
        if (element && data[dataKey] !== undefined) {
            let value = data[dataKey] || '';

            // Price field validation (remove currency symbols before type check)
            if ((fieldId.includes('Price') || fieldId.includes('price')) && typeof value === 'string') {
                value = value.replace(/[^\d.-]/g, '');
            }

            // Type validation for numeric fields (after price cleaning)
            if (element.type === 'number' && value && isNaN(value)) {
                console.warn(`⚠️ Invalid numeric value "${value}" for field ${fieldId}, skipping`);
                return;
            }

            element.value = value;

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

    // Handle bowl dimensions visibility
    handleBowlsNumberChange();

    // Handle application location (multi-select)
    const applicationLocationEl = document.getElementById('editApplicationLocation');
    if (applicationLocationEl && data.application_location) {
        const locations = data.application_location.split(',').map(loc => loc.trim());
        Array.from(applicationLocationEl.options).forEach(option => {
            option.selected = locations.includes(option.value);
        });
    }

    // Handle compare button visibility
    const compareBtn = document.getElementById('compareButton');
    const supplierUrl = data.url || data.supplier_url || data.external_url;
    if (compareBtn) {
        if (supplierUrl) {
            compareBtn.style.display = 'inline-block';
        } else {
            compareBtn.style.display = 'none';
        }
    }

    // Calculate and display initial quality score
    updateQualityScore(data);

    // Show modal status badge
    const statusBadge = document.getElementById('modalStatusBadge');
    if (statusBadge) {
        statusBadge.style.display = 'inline-block';
        statusBadge.textContent = 'Ready';
        statusBadge.className = 'badge bg-secondary ms-3';
    }

    // Initialize additional images after fields are populated
    initializeAdditionalImages();

    // Debug: Show what's in the hidden field
    const hiddenField = document.getElementById('editAdditionalImages');
    if (hiddenField) {
        console.log('🔍 Raw data from Column AT (shopify_images):', `"${hiddenField.value}"`);
    }
}

/**
 * Handle bowls number change - show/hide second bowl dimensions
 */
function handleBowlsNumberChange() {
    const bowlsNumber = document.getElementById('editBowlsNumber')?.value;
    const secondaryBowlDiv = document.getElementById('secondaryBowlDimensions');

    if (secondaryBowlDiv) {
        secondaryBowlDiv.style.display = bowlsNumber === '2' ? 'block' : 'none';
    }
}

/**
 * Sync pricing data for sinks
 */
async function syncPricingData() {
    // TODO: Implement sync-pricing endpoint in Flask
    showInfoMessage('ℹ️ Pricing sync feature will be available once connected to Google Sheets');
}

/**
 * Export sink specifications
 */
async function exportSinkSpecs() {
    // TODO: Implement export-specs endpoint in Flask
    showInfoMessage('ℹ️ Export feature will be available once connected to Google Sheets');
}

/**
 * Generate AI description for sink products
 */
async function generateAIDescription(event) {
    const modal = document.getElementById('editProductModal');
    const currentRow = modal.dataset.currentRow;
    let loadingId = null; // Declare at function scope

    if (!currentRow || !productsData[currentRow]) {
        showErrorMessage('No product data available for AI description generation');
        return;
    }

    try {
        const data = productsData[currentRow];
        const descriptionField = document.getElementById('editBodyHtml');

        if (!descriptionField) return;

        // Start AI loading animation
        loadingId = window.aiLoadingManager ?
            window.aiLoadingManager.startDescriptionGeneration(event.target) : null;

        const response = await fetch(`/api/sinks/products/${currentRow}/generate-description`, {
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

        console.log('🔍 AI Description API Response:', result);

        if (result.success) {
            // Stop loading animation
            if (loadingId && window.aiLoadingManager) {
                window.aiLoadingManager.stopLoading(loadingId);
            }

            // The existing endpoint generates both description and care instructions
            if (result.fields_generated && result.fields_generated.includes('body_html')) {
                showSuccessMessage('✅ AI description generated successfully!');

                // Live updates will handle field updates via SocketIO
                // Remove the page reload to keep modal open
                console.log('🔄 AI generation complete, waiting for live updates...');

                // If live updates are not available, manually refresh modal data
                if (!window.liveUpdatesManager || !window.liveUpdatesManager.isLiveUpdatesActive()) {
                    console.log('🔄 Live updates not active, manually refreshing modal...');
                    if (window.liveUpdatesManager) {
                        window.liveUpdatesManager.refreshModalData();
                    }
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
 * Add product with AI extraction (sink-specific)
 */
async function addProductWithAI() {
    // TODO: Implement extract-product endpoint in Flask
    showInfoMessage('ℹ️ AI extraction feature will be available once OpenAI API is configured');
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
 * Animate care instructions generation with AI
 */
async function animateCareInstructionsGeneration(event) {
    const careField = document.getElementById('editCareInstructions');
    const modal = document.getElementById('editProductModal');
    const currentRow = modal.dataset.currentRow;

    if (!currentRow || !productsData[currentRow]) {
        showErrorMessage('No product data available for care instructions generation');
        return;
    }

    try {
        const data = productsData[currentRow];

        // Start AI loading animation for care instructions
        const loadingId = window.aiLoadingManager ?
            window.aiLoadingManager.startCareInstructionsGeneration(event ? event.target : null) : null;

        const response = await fetch(`/api/sinks/products/${currentRow}/generate-care-instructions`, {
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

            showSuccessMessage('✅ Care instructions generated successfully!');

            // Live updates will handle field updates via SocketIO
            console.log('🔄 Care instructions generation complete, waiting for live updates...');

            // If live updates are not available, manually refresh modal data
            if (!window.liveUpdatesManager || !window.liveUpdatesManager.isLiveUpdatesActive()) {
                console.log('🔄 Live updates not active, manually refreshing modal...');
                if (window.liveUpdatesManager) {
                    window.liveUpdatesManager.refreshModalData();
                }
            }
        } else {
            throw new Error(result.error || 'Failed to generate care instructions');
        }

    } catch (error) {
        console.error('Error generating care instructions:', error);

        // Stop loading animation on error
        if (loadingId && window.aiLoadingManager) {
            window.aiLoadingManager.stopLoading(loadingId);
        }

        showErrorMessage('Failed to generate care instructions: ' + error.message);
    }
}

/**
 * Generate AI features
 */
async function generateAIFeatures(event) {
    const featuresField = document.getElementById('editFeatures');
    const modal = document.getElementById('editProductModal');
    const currentRow = modal.dataset.currentRow;

    if (!currentRow || !productsData[currentRow]) {
        showErrorMessage('No product data available for features generation');
        return;
    }

    try {
        // Start AI loading animation for features
        const loadingId = window.aiLoadingManager ?
            window.aiLoadingManager.startFeaturesGeneration(event.target) : null;

        const data = productsData[currentRow];

        const response = await fetch(`/api/sinks/products/${currentRow}/generate-features`, {
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

        if (result.success && result.features) {
            // Stop loading animation
            if (loadingId && window.aiLoadingManager) {
                window.aiLoadingManager.stopLoading(loadingId);
            }

            featuresField.value = result.features;
            showSuccessMessage('✅ 5 key features generated successfully!');

            // Update the global product data
            if (productsData[currentRow]) {
                productsData[currentRow].features = result.features;
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
 * Clean current product data with status animation
 */
async function cleanCurrentProductDataWithStatus() {
    const modal = document.getElementById('editProductModal');
    const currentRow = modal.dataset.currentRow;
    const cleanBtn = document.getElementById('cleanDataBtn');
    const statusBadge = document.getElementById('modalStatusBadge');

    if (!currentRow || !productsData[currentRow]) {
        showErrorMessage('No product data available for cleaning');
        return;
    }

    try {
        // Update status and disable button
        cleanBtn.disabled = true;
        cleanBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Cleaning...';
        statusBadge.textContent = 'Cleaning Data';
        statusBadge.className = 'badge bg-warning ms-3';
        statusBadge.style.display = 'inline-block';

        // Add cleaning animation to all text fields
        const textFields = modal.querySelectorAll('input[type="text"], textarea');
        textFields.forEach(field => field.classList.add('field-cleaning'));

        const response = await fetch(`/api/sinks/products/${currentRow}/clean-data`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();

        if (result.success) {
            // Update the form with cleaned data
            Object.entries(SINKS_FIELD_MAPPINGS).forEach(([fieldId, dataKey]) => {
                const element = document.getElementById(fieldId);
                if (element && result.cleaned_data[dataKey] !== undefined) {
                    element.value = result.cleaned_data[dataKey] || '';
                }
            });

            statusBadge.textContent = 'Data Cleaned';
            statusBadge.className = 'badge bg-success ms-3';
            showSuccessMessage('✅ Product data cleaned successfully!');

            // Update quality score
            updateQualityScore(result.cleaned_data);
        } else {
            throw new Error(result.error || 'Failed to clean data');
        }

    } catch (error) {
        console.error('Error cleaning data:', error);
        statusBadge.textContent = 'Error';
        statusBadge.className = 'badge bg-danger ms-3';
        showErrorMessage('Failed to clean data: ' + error.message);
    } finally {
        // Remove animations and reset button
        const textFields = modal.querySelectorAll('input[type="text"], textarea');
        textFields.forEach(field => field.classList.remove('field-cleaning'));

        cleanBtn.disabled = false;
        cleanBtn.innerHTML = '<i class="fas fa-broom me-1"></i>Clean Data';

        setTimeout(() => {
            statusBadge.textContent = 'Ready';
            statusBadge.className = 'badge bg-secondary ms-3';
        }, 3000);
    }
}

/**
 * Calculate and update quality score
 */
function updateQualityScore(productData) {
    const requiredFields = [
        'variant_sku', 'title', 'brand_name', 'product_material', 'installation_type',
        'length_mm', 'overall_width_mm', 'overall_depth_mm', 'body_html', 'care_instructions'
    ];

    const optionalFields = [
        'features', 'warranty_years', 'weight', 'seo_title', 'seo_description',
        'grade_of_material', 'style', 'waste_outlet_dimensions'
    ];

    let filledRequired = 0;
    let filledOptional = 0;

    requiredFields.forEach(field => {
        if (productData[field] && productData[field].toString().trim()) {
            filledRequired++;
        }
    });

    optionalFields.forEach(field => {
        if (productData[field] && productData[field].toString().trim()) {
            filledOptional++;
        }
    });

    // Calculate quality score (required fields worth 80%, optional 20%)
    const requiredScore = (filledRequired / requiredFields.length) * 0.8;
    const optionalScore = (filledOptional / optionalFields.length) * 0.2;
    const totalScore = Math.round((requiredScore + optionalScore) * 100);

    // Update quality display
    const progressBar = document.getElementById('modalQualityProgressBar');
    const percentage = document.getElementById('modalQualityPercentage');

    if (progressBar && percentage) {
        progressBar.style.width = totalScore + '%';
        percentage.textContent = totalScore + '%';

        // Color coding
        if (totalScore >= 80) {
            progressBar.className = 'progress-bar bg-success';
        } else if (totalScore >= 60) {
            progressBar.className = 'progress-bar bg-warning';
        } else {
            progressBar.className = 'progress-bar bg-danger';
        }
    }

    return totalScore;
}

// Event listeners for sink-specific functionality
document.addEventListener('DOMContentLoaded', function() {
    // Bowl number change handler
    const bowlsSelect = document.getElementById('editBowlsNumber');
    if (bowlsSelect) {
        bowlsSelect.addEventListener('change', handleBowlsNumberChange);
    }

    // Listen for modal show events to update compare button visibility and initialize validation
    const editModal = document.getElementById('editProductModal');
    if (editModal) {
        editModal.addEventListener('shown.bs.modal', function() {
            const rowNum = document.getElementById('editRowNum').value;
            if (rowNum && productsData[rowNum]) {
                updateCompareButtonVisibility(productsData[rowNum]);
            }

            // Initialize field validation
            initializeFieldValidation();

            // Set up spec sheet upload
            const specSheetInput = document.getElementById('specSheetInput');
            if (specSheetInput) {
                specSheetInput.addEventListener('change', handleSpecSheetUpload);
            }

            // Set up drag and drop for spec sheet
            const uploadZone = document.getElementById('specUploadZone');
            if (uploadZone) {
                setupSpecSheetDragDrop(uploadZone);
            }
        });
    }
});

// Set up drag and drop functionality for spec sheet upload
function setupSpecSheetDragDrop(uploadZone) {
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const specSheetInput = document.getElementById('specSheetInput');
            if (specSheetInput) {
                // Create a new FileList and assign it to the input
                specSheetInput.files = files;
                handleSpecSheetUpload({ target: { files: files } });
            }
        }
    });
}

// Utility function for info messages
function showInfoMessage(message) {
    // Simple alert for now - can be replaced with toast notification
    console.log('ℹ️ ' + message);
    // You could implement a proper toast notification here
}

/**
 * Show/hide compare button based on URL availability
 */
function updateCompareButtonVisibility(productData) {
    const compareButton = document.getElementById('compareButton');
    const urlToOpen = productData.url || productData.supplier_url || productData.product_url || productData['Column A'];

    if (compareButton) {
        if (urlToOpen && urlToOpen.trim() !== '' && urlToOpen !== '-') {
            compareButton.style.display = 'inline-block';
        } else {
            compareButton.style.display = 'none';
        }
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
        // Call the AI extraction endpoint
        const response = await fetch(`/api/sinks/process/extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                selected_rows: [parseInt(rowNum)],
                overwrite_mode: true
            })
        });

        const result = await response.json();

        if (result.success) {
            console.log('✅ AI extraction successful');

            // Stop loading animation
            if (loadingId && window.aiLoadingManager) {
                window.aiLoadingManager.stopLoading(loadingId);
            }

            if (statusBadge) {
                statusBadge.textContent = 'Extraction Complete';
                statusBadge.className = 'badge bg-success ms-3';
            }

            showSuccessMessage('✅ AI extraction completed successfully!');

            // Live updates will handle the data refresh
            console.log('🔄 AI extraction complete, waiting for live updates...');

            // If live updates are not available, manually refresh modal data
            if (!window.liveUpdatesManager || !window.liveUpdatesManager.isLiveUpdatesActive()) {
                console.log('🔄 Live updates not active, manually refreshing modal...');
                if (window.liveUpdatesManager) {
                    window.liveUpdatesManager.refreshModalData();
                }
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
        const response = await fetch(`/api/sinks/products/${currentRow}/extract-images`, {
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
 * Spec Sheet Verification Functions
 */

// Auto-load pricing data when modal opens
document.addEventListener('DOMContentLoaded', function() {
    // Listen for modal shown event
    const modal = document.getElementById('editProductModal');
    if (modal) {
        modal.addEventListener('shown.bs.modal', function() {
            // Auto-load pricing data when modal opens
            setTimeout(() => {
                if (typeof refreshPricingData === 'function') {
                    refreshPricingData();
                }
            }, 500); // Small delay to ensure modal is fully loaded
        });
    }
});

// Handle spec sheet upload
function handleSpecSheetUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const specSheetStatus = document.getElementById('specSheetStatus');
    const specVerificationResults = document.getElementById('specVerificationResults');

    specSheetStatus.textContent = 'Processing...';
    specSheetStatus.className = 'badge bg-warning ms-2';

    // Create FormData for file upload
    const formData = new FormData();
    formData.append('spec_sheet', file);

    const rowNum = document.getElementById('editRowNum').value;
    if (rowNum) {
        formData.append('row_number', rowNum);
    }

    // Upload and process spec sheet
    fetch('/api/sinks/process-spec-sheet', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            displaySpecSheetResults(data.extracted_data, data.verification_results);
            specSheetStatus.textContent = 'Processed';
            specSheetStatus.className = 'badge bg-success ms-2';
        } else {
            throw new Error(data.error || 'Failed to process spec sheet');
        }
    })
    .catch(error => {
        console.error('Error processing spec sheet:', error);
        specSheetStatus.textContent = 'Error';
        specSheetStatus.className = 'badge bg-danger ms-2';
        showErrorMessage('Failed to process spec sheet: ' + error.message);
    });
}

// Display spec sheet extraction results
function displaySpecSheetResults(extractedData, verificationResults) {
    const extractedDataPreview = document.getElementById('extractedDataPreview');
    const verificationStatus = document.getElementById('verificationStatus');
    const specVerificationResults = document.getElementById('specVerificationResults');

    // Show extracted data
    let extractedHtml = '<h8>Extracted Fields:</h8><ul>';
    Object.entries(extractedData).forEach(([field, value]) => {
        if (value && value.trim()) {
            extractedHtml += `<li><strong>${field}:</strong> ${value}</li>`;
        }
    });
    extractedHtml += '</ul>';
    extractedDataPreview.innerHTML = extractedHtml;

    // Show verification results
    let verificationHtml = '<h8>Field Verification:</h8><ul>';
    Object.entries(verificationResults).forEach(([field, result]) => {
        const statusClass = result.status === 'match' ? 'verification-match' :
                           result.status === 'mismatch' ? 'verification-mismatch' :
                           'verification-missing';
        verificationHtml += `<li class="${statusClass}"><strong>${field}:</strong> ${result.message}</li>`;
    });
    verificationHtml += '</ul>';
    verificationStatus.innerHTML = verificationHtml;

    // Store extracted data for later use
    window.currentSpecSheetData = extractedData;

    // Show results section
    specVerificationResults.style.display = 'block';
}

// Apply spec sheet data to form fields
function applySpecSheetData() {
    if (!window.currentSpecSheetData) {
        showErrorMessage('No spec sheet data available');
        return;
    }

    // Map extracted data to form fields
    Object.entries(window.currentSpecSheetData).forEach(([field, value]) => {
        if (SINKS_FIELD_MAPPINGS[field]) {
            const element = document.getElementById(field);
            if (element && value && value.trim()) {
                element.value = value;
                // Add success styling
                element.classList.add('field-success');
                setTimeout(() => element.classList.remove('field-success'), 3000);
            }
        }
    });

    showSuccessMessage('✅ Spec sheet data applied to form fields');
}

// Clear spec sheet
function clearSpecSheet() {
    document.getElementById('specSheetInput').value = '';
    document.getElementById('specVerificationResults').style.display = 'none';
    document.getElementById('specSheetStatus').textContent = 'No spec sheet';
    document.getElementById('specSheetStatus').className = 'badge bg-info ms-2';
    window.currentSpecSheetData = null;
}

/**
 * Smart Error Detection and Validation
 */

// Validate field on blur/change
function validateField(element) {
    const fieldName = element.id;
    const value = element.value.trim();

    // Clear previous validation
    element.classList.remove('field-error', 'field-warning', 'field-success');

    // Remove existing validation message
    const existingMessage = element.parentNode.querySelector('.validation-message');
    if (existingMessage) {
        existingMessage.remove();
    }

    let validationResult = performFieldValidation(fieldName, value);

    if (validationResult.status === 'error') {
        element.classList.add('field-error');
        showValidationMessage(element, validationResult.message, 'error');
    } else if (validationResult.status === 'warning') {
        element.classList.add('field-warning');
        showValidationMessage(element, validationResult.message, 'warning');
    } else if (validationResult.status === 'success') {
        element.classList.add('field-success');
        showValidationMessage(element, validationResult.message, 'success');
    }

    return validationResult;
}

// Perform field-specific validation
function performFieldValidation(fieldName, value) {
    // Required field validation
    const requiredFields = ['editSku', 'editTitle', 'editVendor', 'editProductMaterial'];
    if (requiredFields.includes(fieldName) && !value) {
        return { status: 'error', message: 'This field is required' };
    }

    // Field-specific validation rules
    switch (fieldName) {
        case 'editSku':
            if (value && value.length < 3) {
                return { status: 'warning', message: 'SKU should be at least 3 characters' };
            }
            break;

        case 'editRrpPrice':
        case 'editSalePrice':
            if (value && !isValidPrice(value)) {
                return { status: 'error', message: 'Please enter a valid price (e.g., 25.99)' };
            }
            break;

        case 'editLengthMm':
        case 'editOverallWidthMm':
        case 'editOverallDepthMm':
            if (value && (!isNumeric(value) || parseFloat(value) <= 0)) {
                return { status: 'error', message: 'Please enter a valid dimension in mm' };
            }
            break;

        case 'editWeight':
            if (value && (!isNumeric(value) || parseFloat(value) <= 0)) {
                return { status: 'error', message: 'Please enter a valid weight in kg' };
            }
            break;
    }

    if (value) {
        return { status: 'success', message: '✓ Valid' };
    }

    return { status: 'neutral', message: '' };
}

// Show validation message
function showValidationMessage(element, message, type) {
    if (!message) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `validation-message validation-${type}`;
    messageDiv.textContent = message;

    element.parentNode.appendChild(messageDiv);
}

// Utility validation functions
function isValidPrice(value) {
    const priceRegex = /^\d+(\.\d{1,2})?$/;
    return priceRegex.test(value);
}

function isNumeric(value) {
    return !isNaN(value) && !isNaN(parseFloat(value));
}

// Initialize validation on form fields
function initializeFieldValidation() {
    const formFields = document.querySelectorAll('#editProductForm input, #editProductForm select, #editProductForm textarea');
    formFields.forEach(field => {
        field.addEventListener('blur', () => validateField(field));
        field.addEventListener('change', () => validateField(field));
    });
}

// Export functions to window for onclick handlers
window.handleBowlsNumberChange = handleBowlsNumberChange;
window.syncPricingData = syncPricingData;
/**
 * Validate spec sheet URL for accessibility and SKU matching
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

    // Get current row number
    const modal = document.getElementById('editProductModal');
    const currentRow = modal.dataset.currentRow;

    if (!currentRow || !productsData[currentRow]) {
        showValidationResult('No product data available for validation', 'danger');
        button.innerHTML = originalText;
        button.disabled = false;
        return;
    }

    console.log(`🔍 Validating spec sheet URL for row ${currentRow}: ${url}`);

    fetch(`/api/sinks/validate-spec-sheet`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            spec_sheet_url: url,
            row_num: parseInt(currentRow)
        })
    })
    .then(response => response.json())
    .then(data => {
        button.innerHTML = originalText;
        button.disabled = false;

        if (data.success) {
            const message = `✅ ${data.message || 'Spec sheet validated successfully'}`;
            showValidationResult(message, 'success');

            // Update the status badge
            const statusBadge = document.getElementById('specSheetStatus');
            if (statusBadge) {
                statusBadge.textContent = 'Valid spec sheet';
                statusBadge.className = 'badge bg-success ms-2';
            }
        } else {
            const message = `❌ ${data.error || 'Validation failed'}`;
            showValidationResult(message, 'danger');

            // Update the status badge
            const statusBadge = document.getElementById('specSheetStatus');
            if (statusBadge) {
                statusBadge.textContent = 'Invalid spec sheet';
                statusBadge.className = 'badge bg-danger ms-2';
            }
        }
    })
    .catch(error => {
        console.error('Error validating spec sheet URL:', error);
        showValidationResult('Error validating spec sheet URL. Please check the URL and try again.', 'danger');

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
 * Refresh pricing data for the current product
 */
function refreshPricingData() {
    const modal = document.getElementById('editProductModal');
    const currentRow = modal.dataset.currentRow;

    if (!currentRow || !productsData[currentRow]) {
        showErrorMessage('No product data available for pricing lookup');
        return;
    }

    const product = productsData[currentRow];
    const variantSku = product.variant_sku;

    if (!variantSku) {
        showErrorMessage('No SKU found for this product');
        return;
    }

    console.log(`💰 Fetching pricing data for SKU: ${variantSku}`);

    // Show loading state
    setPricingLoadingState(true);

    fetch(`/api/sinks/pricing/${encodeURIComponent(variantSku)}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        setPricingLoadingState(false);

        if (data.success) {
            displayPricingData(data.pricing);
        } else {
            displayPricingError(data.error || 'Failed to fetch pricing data');
        }
    })
    .catch(error => {
        console.error('Error fetching pricing data:', error);
        setPricingLoadingState(false);
        displayPricingError('Error fetching pricing data. Please try again.');
    });
}

/**
 * Set loading state for pricing section
 */
function setPricingLoadingState(loading) {
    const elements = ['ourCurrentPrice', 'competitorPrice', 'priceDifference'];

    elements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            if (loading) {
                element.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
            } else {
                // Clear loading state - will be overwritten by displayPricingData
                element.innerHTML = '<span class="text-muted">Loading...</span>';
            }
        }
    });
}

/**
 * Display pricing data in the modal
 */
function displayPricingData(pricing) {
    // Our price
    const ourPriceElement = document.getElementById('ourCurrentPrice');
    if (ourPriceElement) {
        ourPriceElement.innerHTML = `$${pricing.our_price.toFixed(2)}`;
    }

    // Competitor info
    const competitorPriceElement = document.getElementById('competitorPrice');
    if (competitorPriceElement) {
        competitorPriceElement.innerHTML = `$${pricing.lowest_competitor_price.toFixed(2)}`;
    }

    // Update competitor label with name
    const competitorLabelElement = document.getElementById('competitorLabel');
    if (competitorLabelElement) {
        competitorLabelElement.textContent = pricing.lowest_competitor_name;
    }

    // Price difference
    const priceDifferenceElement = document.getElementById('priceDifference');
    if (priceDifferenceElement) {
        const difference = pricing.price_difference;
        console.log(`💰 Price difference calculation: ${difference} (Our: $${pricing.our_price}, Competitor: $${pricing.lowest_competitor_price})`);

        const isMore = difference > 0;
        const isLess = difference < 0;
        const isSame = Math.abs(difference) < 0.01; // Handle floating point precision

        let content = '';
        let className = '';

        if (isSame) {
            content = '<strong>Same Price</strong><br><small class="text-muted">⚖️ Equal pricing</small>';
            className = 'text-info';
        } else if (isMore) {
            content = `<strong>+$${Math.abs(difference).toFixed(2)}</strong><br><small class="text-muted">📈 More expensive</small>`;
            className = 'text-danger';
        } else {
            content = `<strong>-$${Math.abs(difference).toFixed(2)}</strong><br><small class="text-muted">📉 Less expensive</small>`;
            className = 'text-success';
        }

        console.log(`💰 Setting difference content: ${content.replace(/<[^>]*>/g, '')}`);
        priceDifferenceElement.innerHTML = content;
        priceDifferenceElement.className = `pricing-value ${className}`;
    }

    // Show all competitor prices
    displayAllCompetitorPrices(pricing.competitor_prices);
}

/**
 * Display all competitor prices in collapsible section
 */
function displayAllCompetitorPrices(competitorPrices) {
    const allPricesElement = document.getElementById('allCompetitorPrices');
    const detailsElement = document.getElementById('competitorPricesDetails');

    if (!allPricesElement || !detailsElement) return;

    if (Object.keys(competitorPrices).length === 0) {
        detailsElement.style.display = 'none';
        return;
    }

    // Sort competitors by price
    const sortedCompetitors = Object.entries(competitorPrices)
        .filter(([name, price]) => price > 0)
        .sort(([, a], [, b]) => a - b);

    let html = '<div class="row">';
    sortedCompetitors.forEach(([name, price], index) => {
        const isLowest = index === 0;
        const badgeClass = isLowest ? 'badge bg-success' : 'badge bg-secondary';
        const badgeText = isLowest ? 'Lowest' : '';

        html += `
            <div class="col-md-6 mb-2">
                <div class="d-flex justify-content-between align-items-center">
                    <span>${name}</span>
                    <span>
                        <strong>$${price.toFixed(2)}</strong>
                        ${badgeText ? `<span class="${badgeClass} ms-2">${badgeText}</span>` : ''}
                    </span>
                </div>
            </div>
        `;
    });
    html += '</div>';

    allPricesElement.innerHTML = html;
    detailsElement.style.display = 'block';
}

/**
 * Display pricing error
 */
function displayPricingError(error) {
    // Our price - show "Todays price"
    const ourPriceElement = document.getElementById('ourCurrentPrice');
    if (ourPriceElement) {
        ourPriceElement.innerHTML = `<span class="text-muted">Todays price</span>`;
    }

    // Competitor price and difference - show "No data"
    const competitorElements = ['competitorPrice', 'priceDifference'];
    competitorElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.innerHTML = `<span class="text-muted">No data</span>`;
        }
    });

    // Hide competitor prices section
    const detailsElement = document.getElementById('competitorPricesDetails');
    if (detailsElement) {
        detailsElement.style.display = 'none';
    }

    console.error('Pricing error:', error);
}

/**
 * Validate URL format
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
 * Get current product data from form fields
 */
function getCurrentProductData() {
    const product = {};

    // Get all form fields in the modal
    const modal = document.getElementById('editProductModal');
    if (modal) {
        const inputs = modal.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            if (input.id && input.value) {
                product[input.id] = input.value;
            }
        });
    }

    return product;
}

/**
 * Display spec sheet results with SKU-focused matching
 */
function displaySpecSheetResults(extractedData, verificationResults, matchAnalysis) {
    const resultsDiv = document.getElementById('specVerificationResults');
    const statusBadge = document.getElementById('specSheetStatus');

    // Show results section
    resultsDiv.style.display = 'block';
    statusBadge.textContent = 'Processing complete';
    statusBadge.className = 'badge bg-success ms-2';

    // Display match analysis
    displayMatchAnalysis(matchAnalysis);

    // Display SKU comparison
    displaySkuComparison(extractedData, matchAnalysis);

    // Display additional extracted data in collapsible section
    displayExtractedData(extractedData);

    // Show appropriate action buttons
    updateActionButtons(matchAnalysis);
}

/**
 * Display match analysis in the status section
 */
function displayMatchAnalysis(matchAnalysis) {
    const statusDiv = document.getElementById('productMatchStatus');
    const analysisText = document.getElementById('matchAnalysisText');

    let alertClass = 'alert-info';
    let icon = 'fas fa-search';
    let message = '';

    switch (matchAnalysis.overall_match) {
        case 'excellent':
            alertClass = 'alert-success';
            icon = 'fas fa-check-circle';
            message = `✅ SKU Match Confirmed (100% confidence) - This spec sheet is for the correct product`;
            break;
        case 'poor':
            alertClass = 'alert-danger';
            icon = 'fas fa-times-circle';
            message = `❌ SKU Mismatch (0% confidence) - This spec sheet is for a different product`;
            break;
        case 'unknown':
            alertClass = 'alert-warning';
            icon = 'fas fa-question-circle';
            message = `⚠️ Cannot Verify - SKU information missing from spec sheet or current product`;
            break;
        default:
            message = matchAnalysis.message || 'Analysis complete - review the comparison below';
    }

    statusDiv.className = `product-match-status mb-3`;
    statusDiv.innerHTML = `
        <div class="alert ${alertClass}">
            <i class="${icon} me-2"></i>
            <strong>Product Match Analysis:</strong>
            <div>${message}</div>
        </div>
    `;
}

/**
 * Display SKU comparison in focused view
 */
function displaySkuComparison(extractedData, matchAnalysis) {
    const extractedSkuDiv = document.getElementById('extractedSkuDisplay');
    const currentSkuDiv = document.getElementById('currentSkuDisplay');

    // Get SKU from extracted data
    const extractedSku = extractedData.editSku || extractedData.editVariantSku || extractedData.variant_sku || '';

    // Get SKU from current product
    const currentProduct = getCurrentProductData();
    const currentSku = currentProduct.editSku || currentProduct.editVariantSku || currentProduct.variant_sku || '';

    // Display extracted SKU
    if (extractedSku) {
        extractedSkuDiv.innerHTML = `
            <div class="text-center">
                <i class="fas fa-barcode fa-2x mb-2 text-primary"></i>
                <div class="fw-bold fs-5">${extractedSku}</div>
                <small class="text-muted">Extracted from spec sheet</small>
            </div>
        `;
    } else {
        extractedSkuDiv.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-barcode fa-2x mb-2"></i>
                <div>No SKU found in spec sheet</div>
            </div>
        `;
    }

    // Display current SKU
    if (currentSku) {
        currentSkuDiv.innerHTML = `
            <div class="text-center">
                <i class="fas fa-tag fa-2x mb-2 text-primary"></i>
                <div class="fw-bold fs-5">${currentSku}</div>
                <small class="text-muted">Current product SKU</small>
            </div>
        `;
    } else {
        currentSkuDiv.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-tag fa-2x mb-2"></i>
                <div>No current SKU available</div>
            </div>
        `;
    }

    // Add visual comparison if both SKUs exist
    if (extractedSku && currentSku && matchAnalysis.field_matches && matchAnalysis.field_matches.SKU) {
        const matchStatus = matchAnalysis.field_matches.SKU.status;

        if (matchStatus === 'match') {
            extractedSkuDiv.className = 'extracted-sku-display p-3 bg-success bg-opacity-10 border border-success rounded';
            currentSkuDiv.className = 'current-sku-display p-3 bg-success bg-opacity-10 border border-success rounded';
        } else if (matchStatus === 'different') {
            extractedSkuDiv.className = 'extracted-sku-display p-3 bg-danger bg-opacity-10 border border-danger rounded';
            currentSkuDiv.className = 'current-sku-display p-3 bg-danger bg-opacity-10 border border-danger rounded';
        }
    }
}

/**
 * Display extracted data from spec sheet (in collapsible section)
 */
function displayExtractedData(extractedData) {
    const previewDiv = document.getElementById('extractedDataPreview');
    let html = '<div class="extracted-data-list">';

    Object.keys(extractedData).forEach(key => {
        if (extractedData[key] && key !== 'editSku' && key !== 'editVariantSku') { // Skip SKU as it's shown above
            const label = key.replace(/^edit/, '').replace(/([A-Z])/g, ' $1').trim();
            html += `
                <div class="data-item mb-2">
                    <strong>${label}:</strong> <span class="text-muted">${extractedData[key]}</span>
                </div>
            `;
        }
    });

    html += '</div>';
    previewDiv.innerHTML = html;
}

/**
 * Display current product data
 */
function displayCurrentProductData() {
    const currentDataDiv = document.getElementById('currentProductData');
    const currentProduct = getCurrentProductData();
    let html = '<div class="current-data-list">';

    Object.keys(currentProduct).forEach(key => {
        if (currentProduct[key]) {
            const label = key.replace(/^edit/, '').replace(/([A-Z])/g, ' $1').trim();
            html += `
                <div class="data-item">
                    <strong>${label}:</strong> ${currentProduct[key]}
                </div>
            `;
        }
    });

    html += '</div>';
    currentDataDiv.innerHTML = html;
}

/**
 * Display detailed match results
 */
function displayMatchResults(matchAnalysis) {
    const resultsDiv = document.getElementById('matchResults');
    let html = '<div class="match-details">';

    if (matchAnalysis.field_matches) {
        Object.keys(matchAnalysis.field_matches).forEach(field => {
            const match = matchAnalysis.field_matches[field];
            let icon = '';
            let className = '';

            switch (match.status) {
                case 'match':
                    icon = '<i class="fas fa-check text-success"></i>';
                    className = 'text-success';
                    break;
                case 'different':
                    icon = '<i class="fas fa-times text-danger"></i>';
                    className = 'text-danger';
                    break;
                case 'missing':
                    icon = '<i class="fas fa-minus text-muted"></i>';
                    className = 'text-muted';
                    break;
            }

            html += `
                <div class="match-item ${className}">
                    ${icon} <strong>${field}</strong>
                    <small class="d-block">${match.message}</small>
                </div>
            `;
        });
    }

    html += '</div>';
    resultsDiv.innerHTML = html;
}

/**
 * Update action buttons based on SKU match analysis
 */
function updateActionButtons(matchAnalysis) {
    const applyBtn = document.getElementById('applyDataBtn');
    const overrideBtn = document.getElementById('overrideBtn');
    const detailsBtn = document.getElementById('detailsBtn');

    // Hide all buttons initially
    applyBtn.style.display = 'none';
    overrideBtn.style.display = 'none';
    detailsBtn.style.display = 'none';

    if (matchAnalysis.overall_match === 'excellent') {
        // SKU matches perfectly - safe to apply
        applyBtn.style.display = 'inline-block';
        applyBtn.innerHTML = '<i class="fas fa-check me-1"></i>Apply Spec Sheet Data';
        applyBtn.className = 'btn btn-success btn-sm';
    } else if (matchAnalysis.overall_match === 'poor') {
        // SKU mismatch - show warning option
        overrideBtn.style.display = 'inline-block';
        overrideBtn.innerHTML = '<i class="fas fa-exclamation-triangle me-1"></i>Different Product - Apply Anyway?';
        overrideBtn.className = 'btn btn-danger btn-sm';
    } else if (matchAnalysis.overall_match === 'unknown') {
        // Cannot determine match - show cautious option
        overrideBtn.style.display = 'inline-block';
        overrideBtn.innerHTML = '<i class="fas fa-question-circle me-1"></i>Cannot Verify SKU - Apply Anyway?';
        overrideBtn.className = 'btn btn-warning btn-sm';
    }
}

/**
 * Apply spec sheet data with SKU-based override warning
 */
function applyWithOverride() {
    const overrideBtn = document.getElementById('overrideBtn');
    let warningMessage = '';

    if (overrideBtn.className.includes('btn-danger')) {
        // SKU mismatch case
        warningMessage =
            '⚠️ SKU MISMATCH WARNING ⚠️\n\n' +
            'The SKU in the spec sheet does NOT match the current product SKU.\n' +
            'This means you are about to apply data from a different product.\n\n' +
            'This could:\n' +
            '• Overwrite correct product information with wrong data\n' +
            '• Cause confusion for customers and staff\n' +
            '• Lead to incorrect pricing or specifications\n\n' +
            'Are you absolutely sure this is the correct spec sheet for this product?';
    } else {
        // SKU missing case
        warningMessage =
            '⚠️ CANNOT VERIFY PRODUCT MATCH ⚠️\n\n' +
            'Unable to find SKU information to verify this is the correct spec sheet.\n' +
            'Applying this data without verification could overwrite correct information.\n\n' +
            'Please ensure this spec sheet is for the correct product before proceeding.\n\n' +
            'Are you sure you want to apply this data?';
    }

    const confirmed = confirm(warningMessage);

    if (confirmed) {
        applySpecSheetData();
    }
}

/**
 * Show detailed match analysis
 */
function showMatchDetails() {
    // This could open a modal with detailed comparison
    alert('Match details functionality - this would show a detailed breakdown of all field comparisons');
}

/**
 * Analyze product match (this would be called from backend, but included for completeness)
 */
function analyzeProductMatch(extractedData, currentProduct) {
    // This is a client-side version for demonstration
    // The actual analysis should be done on the backend

    let matches = 0;
    let total = 0;
    const fieldMatches = {};

    // Define key fields for matching
    const keyFields = ['title', 'length_mm', 'width_mm', 'depth_mm', 'material', 'brand'];

    keyFields.forEach(field => {
        const extractedKey = 'edit' + field.charAt(0).toUpperCase() + field.slice(1).replace('_', '');

        if (extractedData[extractedKey] && currentProduct[extractedKey]) {
            total++;
            const extracted = extractedData[extractedKey].toString().toLowerCase();
            const current = currentProduct[extractedKey].toString().toLowerCase();

            if (extracted === current) {
                matches++;
                fieldMatches[field] = {
                    status: 'match',
                    message: 'Values match exactly'
                };
            } else if (Math.abs(parseFloat(extracted) - parseFloat(current)) < 5) {
                matches += 0.8; // Partial match for close dimensions
                fieldMatches[field] = {
                    status: 'close',
                    message: 'Values are very close'
                };
            } else {
                fieldMatches[field] = {
                    status: 'different',
                    message: `Spec: ${extractedData[extractedKey]}, Current: ${currentProduct[extractedKey]}`
                };
            }
        } else {
            fieldMatches[field] = {
                status: 'missing',
                message: 'Data not available for comparison'
            };
        }
    });

    const confidence = total > 0 ? Math.round((matches / total) * 100) : 0;
    let overallMatch = 'poor';

    if (confidence >= 90) overallMatch = 'excellent';
    else if (confidence >= 70) overallMatch = 'good';
    else if (confidence >= 50) overallMatch = 'partial';

    return {
        overall_match: overallMatch,
        confidence_score: confidence,
        field_matches: fieldMatches
    };
}

window.exportSinkSpecs = exportSinkSpecs;
window.generateAIDescription = generateAIDescription;
window.addProductWithAI = addProductWithAI;
window.openCompareWindow = openCompareWindow;
window.animateCareInstructionsGeneration = animateCareInstructionsGeneration;
window.generateAIFeatures = generateAIFeatures;
window.cleanCurrentProductDataWithStatus = cleanCurrentProductDataWithStatus;
window.updateQualityScore = updateQualityScore;
window.extractSingleProductWithStatus = extractSingleProductWithStatus;
window.extractCurrentProductImages = extractCurrentProductImages;
window.updateCompareButtonVisibility = updateCompareButtonVisibility;
window.validateSpecSheetUrl = validateSpecSheetUrl;

/**
 * Additional Images Management Functions
 */

// Global array to store current additional images
let additionalImagesArray = [];

/**
 * Initialize additional images from the hidden field
 */
function initializeAdditionalImages() {
    const hiddenField = document.getElementById('editAdditionalImages');
    if (hiddenField && hiddenField.value) {
        additionalImagesArray = hiddenField.value.split(',').map(url => url.trim()).filter(url => url);
        console.log('🖼️ Loaded additional images from Google Sheets:', additionalImagesArray);
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

    // Check if URL is already in the list
    if (additionalImagesArray.includes(url)) {
        showErrorMessage('This image URL is already added');
        return;
    }

    // Add to array
    additionalImagesArray.push(url);

    // Clear input
    newImageInput.value = '';

    // Update display and hidden field
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

    // Update count badge
    countBadge.textContent = `${additionalImagesArray.length} image${additionalImagesArray.length !== 1 ? 's' : ''}`;

    if (additionalImagesArray.length === 0) {
        currentImagesList.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    // Show the current images section
    currentImagesList.style.display = 'block';

    // Generate image preview cards with drag-and-drop
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
                <!-- Drag handle -->
                <div class="drag-handle position-absolute top-0 start-0 m-1 p-1 bg-dark bg-opacity-50 rounded"
                     style="cursor: move; font-size: 0.7rem; z-index: 10;"
                     title="Drag to reorder">
                    <i class="fas fa-grip-vertical text-white"></i>
                </div>

                <!-- Main image position indicator -->
                ${index === 0 ? '<div class="main-image-badge position-absolute top-0 start-50 translate-middle-x mt-1"><span class="badge bg-primary" style="font-size: 0.6rem;">Main</span></div>' : ''}

                <img src="${url}" class="card-img-top" style="height: 80px; object-fit: cover; cursor: pointer;"
                     onclick="window.open('${url}', '_blank')"
                     onerror="this.style.display='none';"
                     onload="console.log('✅ Successfully loaded image:', '${url}');"
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

/**
 * Update the hidden field with comma-separated URLs
 */
function updateHiddenField() {
    const hiddenField = document.getElementById('editAdditionalImages');
    if (hiddenField) {
        hiddenField.value = additionalImagesArray.join(',');
    }
}

/**
 * Validate if a string is a valid URL
 */
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
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

    // Add visual feedback
    const card = event.currentTarget;
    card.style.transform = 'scale(1.05)';
    card.style.boxShadow = '0 8px 16px rgba(0,0,0,0.2)';
}

function handleDrop(event) {
    event.preventDefault();

    const dropIndex = parseInt(event.currentTarget.dataset.index);

    if (draggedIndex !== null && draggedIndex !== dropIndex) {
        // Reorder the array
        const draggedItem = additionalImagesArray[draggedIndex];
        additionalImagesArray.splice(draggedIndex, 1);
        additionalImagesArray.splice(dropIndex, 0, draggedItem);

        console.log('🔄 Reordered images:', `${draggedIndex} → ${dropIndex}`);

        // Update display and hidden field
        updateAdditionalImagesDisplay();
        updateHiddenField();

        showSuccessMessage(`Image moved to position ${dropIndex + 1}`);
    }

    // Reset visual feedback
    event.currentTarget.style.transform = '';
    event.currentTarget.style.boxShadow = '';
}

function handleDragEnd(event) {
    // Reset opacity and visual feedback
    event.currentTarget.style.opacity = '';
    event.currentTarget.style.transform = '';
    event.currentTarget.style.boxShadow = '';

    // Clear all cards' visual feedback
    const cards = document.querySelectorAll('.image-preview-card');
    cards.forEach(card => {
        card.style.transform = '';
        card.style.boxShadow = '';
    });

    draggedIndex = null;
}

// Make functions available globally
window.addNewImage = addNewImage;
window.removeImage = removeImage;
window.handleDragStart = handleDragStart;
window.handleDragOver = handleDragOver;
window.handleDrop = handleDrop;
window.handleDragEnd = handleDragEnd;
window.refreshPricingData = refreshPricingData;
window.validateField = validateField;
window.initializeFieldValidation = initializeFieldValidation;
window.applyWithOverride = applyWithOverride;
window.showMatchDetails = showMatchDetails;
window.analyzeProductMatch = analyzeProductMatch;