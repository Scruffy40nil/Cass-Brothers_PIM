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
 * Populate sink-specific fields in modal
 */
function populateCollectionSpecificFields(data) {
    console.log('🚿 Populating sink-specific fields:', data);

    // Map all sink-specific fields
    Object.entries(SINKS_FIELD_MAPPINGS).forEach(([fieldId, dataKey]) => {
        const element = document.getElementById(fieldId);
        if (element && data[dataKey] !== undefined) {
            element.value = data[dataKey] || '';
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
async function generateAIDescription() {
    const modal = document.getElementById('editProductModal');
    const currentRow = modal.dataset.currentRow;

    if (!currentRow || !productsData[currentRow]) {
        showErrorMessage('No product data available for AI description generation');
        return;
    }

    try {
        const data = productsData[currentRow];
        const descriptionField = document.getElementById('editBodyHtml');

        if (!descriptionField) return;

        // Show loading state
        const originalValue = descriptionField.value;
        descriptionField.value = 'Generating AI description...';
        descriptionField.disabled = true;

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

        if (result.success) {
            // The existing endpoint generates both description and care instructions
            if (result.fields_generated && result.fields_generated.includes('body_html')) {
                showSuccessMessage('✅ AI description generated successfully!');
                // Reload the product data to get the updated content
                window.location.reload();
            }
        } else {
            throw new Error(result.error || 'Failed to generate description');
        }

    } catch (error) {
        console.error('Error generating AI description:', error);
        descriptionField.value = originalValue;
        showErrorMessage('Failed to generate AI description: ' + error.message);
    } finally {
        const descriptionField = document.getElementById('editBodyHtml');
        if (descriptionField) {
            descriptionField.disabled = false;
        }
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
    const modal = document.getElementById('editProductModal');
    const currentRow = modal.dataset.currentRow;

    if (!currentRow || !productsData[currentRow]) {
        showErrorMessage('No product data available for comparison');
        return;
    }

    const product = productsData[currentRow];
    const supplierUrl = product.url || product.supplier_url || product.external_url;

    if (supplierUrl) {
        window.open(supplierUrl, '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
    } else {
        showErrorMessage('No supplier URL available for this product');
    }
}

/**
 * Animate care instructions generation with AI
 */
async function animateCareInstructionsGeneration() {
    const careField = document.getElementById('editCareInstructions');
    const modal = document.getElementById('editProductModal');
    const currentRow = modal.dataset.currentRow;

    if (!currentRow || !productsData[currentRow]) {
        showErrorMessage('No product data available for care instructions generation');
        return;
    }

    try {
        // Add generating animation
        careField.classList.add('field-generating');
        careField.disabled = true;
        const originalValue = careField.value;
        careField.value = 'Generating care instructions...';

        // Add progress indicator
        const progressDiv = document.createElement('div');
        progressDiv.className = 'ai-progress-indicator';
        careField.parentNode.appendChild(progressDiv);

        const data = productsData[currentRow];

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

        if (result.success && result.care_instructions) {
            careField.value = result.care_instructions;
            showSuccessMessage('✅ Care instructions generated successfully!');

            // Update the global product data
            if (productsData[currentRow]) {
                productsData[currentRow].care_instructions = result.care_instructions;
            }
        } else {
            throw new Error(result.error || 'Failed to generate care instructions');
        }

    } catch (error) {
        console.error('Error generating care instructions:', error);
        careField.value = originalValue;
        showErrorMessage('Failed to generate care instructions: ' + error.message);
    } finally {
        careField.classList.remove('field-generating');
        careField.disabled = false;
        const progressDiv = careField.parentNode.querySelector('.ai-progress-indicator');
        if (progressDiv) {
            progressDiv.remove();
        }
    }
}

/**
 * Generate AI features
 */
async function generateAIFeatures() {
    const featuresField = document.getElementById('editFeatures');
    const modal = document.getElementById('editProductModal');
    const currentRow = modal.dataset.currentRow;

    if (!currentRow || !productsData[currentRow]) {
        showErrorMessage('No product data available for features generation');
        return;
    }

    try {
        featuresField.classList.add('field-generating');
        featuresField.disabled = true;
        const originalValue = featuresField.value;
        featuresField.value = 'Generating key features...';

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
            featuresField.value = result.features;
            showSuccessMessage('✅ Key features generated successfully!');

            // Update the global product data
            if (productsData[currentRow]) {
                productsData[currentRow].features = result.features;
            }
        } else {
            throw new Error(result.error || 'Failed to generate features');
        }

    } catch (error) {
        console.error('Error generating features:', error);
        featuresField.value = originalValue;
        showErrorMessage('Failed to generate features: ' + error.message);
    } finally {
        featuresField.classList.remove('field-generating');
        featuresField.disabled = false;
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
});

// Utility function for info messages
function showInfoMessage(message) {
    // Simple alert for now - can be replaced with toast notification
    console.log('ℹ️ ' + message);
    // You could implement a proper toast notification here
}

// Export functions to window for onclick handlers
window.handleBowlsNumberChange = handleBowlsNumberChange;
window.syncPricingData = syncPricingData;
window.exportSinkSpecs = exportSinkSpecs;
window.generateAIDescription = generateAIDescription;
window.addProductWithAI = addProductWithAI;
window.openCompareWindow = openCompareWindow;
window.animateCareInstructionsGeneration = animateCareInstructionsGeneration;
window.generateAIFeatures = generateAIFeatures;
window.cleanCurrentProductDataWithStatus = cleanCurrentProductDataWithStatus;
window.updateQualityScore = updateQualityScore;