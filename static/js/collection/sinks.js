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
    'editBowlsNumber': 'bowls_number',
    'editFaucetHoles': 'tap_holes_number',
    'editHasOverflow': 'has_overflow',
    'editWarrantyYears': 'warranty_years',
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
    'editBodyHtml': 'body_html'
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
    try {
        showInfoMessage('Syncing pricing data from pricing sheet...');

        const response = await fetch(`/api/collections/sinks/sync-pricing`, {
            method: 'POST'
        });

        const result = await response.json();

        if (result.success) {
            showSuccessMessage(`✅ Pricing synced! Updated ${result.updated_count} products.`);
            await loadProductsData(); // Refresh the data
        } else {
            throw new Error(result.error || 'Failed to sync pricing');
        }

    } catch (error) {
        console.error('Error syncing pricing:', error);
        showErrorMessage('Failed to sync pricing: ' + error.message);
    }
}

/**
 * Export sink specifications
 */
async function exportSinkSpecs() {
    try {
        const selectedOnly = selectedProducts.length > 0;
        const params = selectedOnly ? `?selected=${selectedProducts.join(',')}` : '';

        const response = await fetch(`/api/collections/sinks/export-specs${params}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Trigger download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sinks-specifications-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        showSuccessMessage('✅ Sink specifications exported successfully!');

    } catch (error) {
        console.error('Error exporting specs:', error);
        showErrorMessage('Failed to export specifications: ' + error.message);
    }
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

        const response = await fetch(`/api/collections/sinks/generate-description`, {
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

        if (result.success && result.description) {
            descriptionField.value = result.description;
            showSuccessMessage('✅ AI description generated successfully!');
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
    const urlInput = document.getElementById('newProductUrl');
    const skuInput = document.getElementById('newProductSku');
    const titleInput = document.getElementById('newProductTitle');

    if (!urlInput || !urlInput.value.trim()) {
        showErrorMessage('Please enter a product URL');
        return;
    }

    try {
        showInfoMessage('Extracting sink data with AI...');

        const response = await fetch(`/api/collections/sinks/extract-product`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: urlInput.value.trim(),
                sku: skuInput.value.trim(),
                title: titleInput.value.trim()
            })
        });

        const result = await response.json();

        if (result.success) {
            showSuccessMessage('✅ Sink product extracted and added successfully!');

            // Close modal and refresh data
            bootstrap.Modal.getInstance(document.getElementById('addProductModal')).hide();
            await loadProductsData();

            // Clear form
            urlInput.value = '';
            skuInput.value = '';
            titleInput.value = '';

        } else {
            throw new Error(result.error || 'Failed to extract product');
        }

    } catch (error) {
        console.error('Error extracting product:', error);
        showErrorMessage('Failed to extract product: ' + error.message);
    }
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