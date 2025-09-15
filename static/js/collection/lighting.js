/**
 * Lighting Collection JavaScript - Specific functionality for lighting collection
 */

// Lighting-specific field mappings
const LIGHTING_FIELD_MAPPINGS = {
    'editSku': 'sku',
    'editTitle': 'title',
    'editVendor': 'vendor',
    'editLightType': 'light_type',
    'editBulbType': 'bulb_type',
    'editWattage': 'wattage',
    'editVoltage': 'voltage',
    'editColorTemperature': 'color_temperature',
    'editLumens': 'lumens',
    'editDimmingCompatible': 'dimming_compatible',
    'editIpRating': 'ip_rating',
    'editMaterial': 'material',
    'editFinish': 'finish',
    'editMountingType': 'mounting_type',
    'editDimensionsMm': 'dimensions_mm',
    'editWeightKg': 'weight_kg',
    'editWarrantyYears': 'warranty_years',
    'editRrpPrice': 'shopify_compare_price',
    'editSalePrice': 'shopify_price',
    'editSeoTitle': 'seo_title',
    'editSeoDescription': 'seo_description',
    'editBodyHtml': 'body_html',
    'editFeatures': 'features',
    'editCareInstructions': 'care_instructions'
};

/**
 * Render lighting-specific product specifications
 */
function renderProductSpecs(product) {
    const specs = [];

    if (product.light_type) {
        specs.push({
            label: 'Type',
            value: product.light_type,
            badge: 'light-type-badge'
        });
    }

    if (product.bulb_type) {
        specs.push({
            label: 'Bulb',
            value: product.bulb_type,
            badge: 'bulb-type-badge'
        });
    }

    if (product.wattage) {
        specs.push({
            label: 'Wattage',
            value: `${product.wattage}W`
        });
    }

    if (product.color_temperature) {
        specs.push({
            label: 'Color Temp',
            value: product.color_temperature
        });
    }

    if (product.ip_rating) {
        specs.push({
            label: 'IP Rating',
            value: product.ip_rating,
            badge: 'ip-rating'
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
 * Populate lighting-specific fields in modal
 */
function populateCollectionSpecificFields(data) {
    console.log('💡 Populating lighting-specific fields:', data);

    // Map all lighting-specific fields
    Object.entries(LIGHTING_FIELD_MAPPINGS).forEach(([fieldId, dataKey]) => {
        const element = document.getElementById(fieldId);
        if (element && data[dataKey] !== undefined) {
            element.value = data[dataKey] || '';
        }
    });

    // Validate energy efficiency after population
    validateEnergyEfficiency();
    checkCompatibility();
}

/**
 * Validate energy efficiency
 */
function validateEnergyEfficiency() {
    const wattageEl = document.getElementById('editWattage');
    const lumensEl = document.getElementById('editLumens');

    if (!wattageEl || !lumensEl) return;

    const wattage = parseFloat(wattageEl.value);
    const lumens = parseFloat(lumensEl.value);

    if (wattage && lumens) {
        const efficiency = lumens / wattage; // Lumens per watt
        const wattageInfo = document.querySelector('.wattage-info');

        if (wattageInfo) {
            let message = '';
            let className = 'wattage-info';

            if (efficiency > 100) {
                message = `Excellent efficiency: ${efficiency.toFixed(1)} lm/W`;
                className += ' text-success';
            } else if (efficiency > 80) {
                message = `Good efficiency: ${efficiency.toFixed(1)} lm/W`;
                className += ' text-info';
            } else if (efficiency > 60) {
                message = `Average efficiency: ${efficiency.toFixed(1)} lm/W`;
                className += ' text-warning';
            } else {
                message = `Low efficiency: ${efficiency.toFixed(1)} lm/W`;
                className += ' text-danger';
            }

            const efficiencyDiv = wattageInfo.querySelector('.efficiency-info') ||
                document.createElement('div');
            efficiencyDiv.className = 'efficiency-info mt-2';
            efficiencyDiv.innerHTML = `<small><strong>Energy Efficiency:</strong> ${message}</small>`;

            if (!wattageInfo.querySelector('.efficiency-info')) {
                wattageInfo.appendChild(efficiencyDiv);
            }
        }
    }
}

/**
 * Check lighting compatibility
 */
function checkCompatibility() {
    const lightType = document.getElementById('editLightType')?.value;
    const ipRating = document.getElementById('editIpRating')?.value;
    const dimmingCompatible = document.getElementById('editDimmingCompatible')?.value;

    const warnings = [];

    // IP rating warnings
    if (lightType && ipRating) {
        if (lightType.includes('Outdoor') && ipRating === 'IP20') {
            warnings.push('⚠️ IP20 is not suitable for outdoor use. Consider IP54 or higher.');
        }

        if (lightType.includes('Bathroom') && !['IP44', 'IP54', 'IP65'].includes(ipRating)) {
            warnings.push('⚠️ Bathroom lighting requires IP44 minimum rating.');
        }
    }

    // Dimming compatibility
    if (dimmingCompatible === 'No' && lightType === 'Pendant Light') {
        warnings.push('ℹ️ Consider dimming compatibility for pendant lights in dining areas.');
    }

    // Display warnings
    if (warnings.length > 0) {
        warnings.forEach(warning => showInfoMessage(warning));
    }
}

/**
 * Calculate recommended room size
 */
function calculateRoomSize() {
    const lumensEl = document.getElementById('editLumens');
    const lightTypeEl = document.getElementById('editLightType');

    if (!lumensEl || !lightTypeEl) return;

    const lumens = parseFloat(lumensEl.value);
    const lightType = lightTypeEl.value;

    if (lumens && lightType) {
        let lumensPerSqM = 300; // Default for general lighting

        // Adjust based on light type
        switch (lightType) {
            case 'Ceiling Light':
            case 'Recessed Light':
                lumensPerSqM = 300;
                break;
            case 'Pendant Light':
                lumensPerSqM = 200;
                break;
            case 'Table Lamp':
            case 'Floor Lamp':
                lumensPerSqM = 100;
                break;
            case 'Wall Light':
                lumensPerSqM = 150;
                break;
        }

        const recommendedArea = (lumens / lumensPerSqM).toFixed(1);
        showInfoMessage(`💡 This light is suitable for approximately ${recommendedArea}m² of space`);
    }
}

/**
 * Sync pricing data for lighting
 */
async function syncPricingData() {
    try {
        showInfoMessage('Syncing pricing data from pricing sheet...');

        const response = await fetch(`/api/collections/lighting/sync-pricing`, {
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
 * Export lighting specifications
 */
async function exportLightingSpecs() {
    try {
        const selectedOnly = selectedProducts.length > 0;
        const params = selectedOnly ? `?selected=${selectedProducts.join(',')}` : '';

        const response = await fetch(`/api/collections/lighting/export-specs${params}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Trigger download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lighting-specifications-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        showSuccessMessage('✅ Lighting specifications exported successfully!');

    } catch (error) {
        console.error('Error exporting specs:', error);
        showErrorMessage('Failed to export specifications: ' + error.message);
    }
}

/**
 * Generate AI description for lighting products
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

        const response = await fetch(`/api/collections/lighting/generate-description`, {
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
 * Add product with AI extraction (lighting-specific)
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
        showInfoMessage('Extracting lighting data with AI...');

        const response = await fetch(`/api/collections/lighting/extract-product`, {
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
            showSuccessMessage('✅ Lighting product extracted and added successfully!');

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

// Event listeners for lighting-specific functionality
document.addEventListener('DOMContentLoaded', function() {
    // Energy efficiency validation
    const wattageEl = document.getElementById('editWattage');
    const lumensEl = document.getElementById('editLumens');

    [wattageEl, lumensEl].forEach(el => {
        if (el) {
            el.addEventListener('input', validateEnergyEfficiency);
        }
    });

    // Room size calculation
    if (lumensEl) {
        lumensEl.addEventListener('input', calculateRoomSize);
    }

    // Compatibility checking
    const lightTypeEl = document.getElementById('editLightType');
    const ipRatingEl = document.getElementById('editIpRating');
    const dimmingEl = document.getElementById('editDimmingCompatible');

    [lightTypeEl, ipRatingEl, dimmingEl].forEach(el => {
        if (el) {
            el.addEventListener('change', checkCompatibility);
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
window.exportLightingSpecs = exportLightingSpecs;
window.generateAIDescription = generateAIDescription;
window.addProductWithAI = addProductWithAI;
window.validateEnergyEfficiency = validateEnergyEfficiency;
window.checkCompatibility = checkCompatibility;
window.calculateRoomSize = calculateRoomSize;