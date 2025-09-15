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
    // TODO: Implement sync-pricing endpoint in Flask
    showInfoMessage('ℹ️ Pricing sync feature will be available once connected to Google Sheets');
}

/**
 * Export lighting specifications
 */
async function exportLightingSpecs() {
    // TODO: Implement export-specs endpoint in Flask
    showInfoMessage('ℹ️ Export feature will be available once connected to Google Sheets');
}

/**
 * Generate AI description for lighting products
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

        const response = await fetch(`/api/lighting/products/${currentRow}/generate-description`, {
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
 * Add product with AI extraction (lighting-specific)
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
        const response = await fetch(`/api/lighting/products/${currentRow}/extract-images`, {
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
 * Generate AI features for lighting products
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

        const response = await fetch(`/api/lighting/products/${currentRow}/generate-features`, {
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
window.extractCurrentProductImages = extractCurrentProductImages;
window.generateAIFeatures = generateAIFeatures;
window.validateEnergyEfficiency = validateEnergyEfficiency;
window.checkCompatibility = checkCompatibility;
window.calculateRoomSize = calculateRoomSize;