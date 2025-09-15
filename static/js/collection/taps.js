/**
 * Taps Collection JavaScript - Specific functionality for taps collection
 */

// Taps-specific field mappings
const TAPS_FIELD_MAPPINGS = {
    'editSku': 'sku',
    'editTitle': 'title',
    'editVendor': 'vendor',
    'editTapType': 'tap_type',
    'editTapMaterial': 'material',
    'editFinish': 'finish',
    'editMountingType': 'mounting_type',
    'editSpoutType': 'spout_type',
    'editHandleType': 'handle_type',
    'editHeightMm': 'height_mm',
    'editSpoutReachMm': 'spout_reach_mm',
    'editWaterFlowRate': 'water_flow_rate',
    'editPressureRating': 'pressure_rating',
    'editValveType': 'valve_type',
    'editWarrantyYears': 'warranty_years',
    'editWeightKg': 'weight_kg',
    'editRrpPrice': 'shopify_compare_price',
    'editSalePrice': 'shopify_price',
    'editSeoTitle': 'seo_title',
    'editSeoDescription': 'seo_description',
    'editBodyHtml': 'body_html',
    'editFeatures': 'features',
    'editCareInstructions': 'care_instructions'
};

/**
 * Render tap-specific product specifications
 */
function renderProductSpecs(product) {
    const specs = [];

    if (product.tap_type) {
        specs.push({
            label: 'Type',
            value: product.tap_type,
            badge: 'tap-type-badge'
        });
    }

    if (product.finish) {
        specs.push({
            label: 'Finish',
            value: product.finish,
            badge: 'finish-badge'
        });
    }

    if (product.mounting_type) {
        specs.push({
            label: 'Mounting',
            value: product.mounting_type
        });
    }

    if (product.water_flow_rate) {
        specs.push({
            label: 'Flow Rate',
            value: `${product.water_flow_rate} L/min`
        });
    }

    if (product.height_mm) {
        specs.push({
            label: 'Height',
            value: `${product.height_mm}mm`
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
 * Populate tap-specific fields in modal
 */
function populateCollectionSpecificFields(data) {
    console.log('🚿 Populating tap-specific fields:', data);

    // Map all tap-specific fields
    Object.entries(TAPS_FIELD_MAPPINGS).forEach(([fieldId, dataKey]) => {
        const element = document.getElementById(fieldId);
        if (element && data[dataKey] !== undefined) {
            element.value = data[dataKey] || '';
        }
    });

    // Handle any specific tap field logic here if needed
    validateFlowRate();
}

/**
 * Validate flow rate input
 */
function validateFlowRate() {
    const flowRateEl = document.getElementById('editWaterFlowRate');
    if (!flowRateEl) return;

    const flowRate = parseFloat(flowRateEl.value);
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
 * Sync pricing data for taps
 */
async function syncPricingData() {
    // TODO: Implement sync-pricing endpoint in Flask
    showInfoMessage('ℹ️ Pricing sync feature will be available once connected to Google Sheets');
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
 * Add product with AI extraction (tap-specific)
 */
async function addProductWithAI() {
    // TODO: Implement extract-product endpoint in Flask
    showInfoMessage('ℹ️ AI extraction feature will be available once OpenAI API is configured');
}

/**
 * Check tap compatibility
 */
function checkTapCompatibility() {
    const tapType = document.getElementById('editTapType')?.value;
    const mounting = document.getElementById('editMountingType')?.value;
    const spoutType = document.getElementById('editSpoutType')?.value;

    // Example compatibility logic
    if (tapType === 'Kitchen Mixer' && mounting === 'Wall Mounted') {
        showInfoMessage('⚠️ Kitchen mixers are typically deck mounted. Please verify installation requirements.');
    }

    if (spoutType === 'Pull-out' && !tapType.includes('Kitchen')) {
        showInfoMessage('ℹ️ Pull-out spouts are typically used for kitchen applications.');
    }
}

// Event listeners for tap-specific functionality
document.addEventListener('DOMContentLoaded', function() {
    // Flow rate validation
    const flowRateEl = document.getElementById('editWaterFlowRate');
    if (flowRateEl) {
        flowRateEl.addEventListener('input', validateFlowRate);
    }

    // Compatibility checking
    const tapTypeEl = document.getElementById('editTapType');
    const mountingEl = document.getElementById('editMountingType');
    const spoutEl = document.getElementById('editSpoutType');

    [tapTypeEl, mountingEl, spoutEl].forEach(el => {
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

// Export functions to window for onclick handlers
window.syncPricingData = syncPricingData;
window.exportTapSpecs = exportTapSpecs;
window.generateAIDescription = generateAIDescription;
window.addProductWithAI = addProductWithAI;
window.validateFlowRate = validateFlowRate;
window.checkTapCompatibility = checkTapCompatibility;