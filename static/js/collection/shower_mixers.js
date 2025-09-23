/**
 * Shower Mixers Collection JavaScript - Specific functionality for shower_mixers collection
 */

// Shower Mixers-specific field mappings (extends base mappings)
const SHOWER_MIXERS_FIELD_MAPPINGS = {
'editSku': 'variant_sku',
    'editTitle': 'title',
    'editVendor': 'vendor',
    'editBrandName': 'brand_name',
        'editSku': 'sku',
        'editValveType': 'valve_type',
        'editFlowRate': 'flow_rate',
        'editPressureRating': 'pressure_rating',
        'editMaterial': 'material',
        'editFinish': 'finish'
};

/**
 * Render shower_mixers-specific product specifications
 */
function renderProductSpecs(product) {
    const specs = [];

    if (product.valve_type) {
        specs.push(`<div class="spec-item"><strong>Valve Type:</strong> ${formatDisplayValue('valve_type', product.valve_type)}</div>`);
    }
    if (product.flow_rate) {
        specs.push(`<div class="spec-item"><strong>Flow Rate:</strong> ${formatDisplayValue('flow_rate', product.flow_rate)}</div>`);
    }
    if (product.pressure_rating) {
        specs.push(`<div class="spec-item"><strong>Pressure Rating:</strong> ${formatDisplayValue('pressure_rating', product.pressure_rating)}</div>`);
    }
    if (product.material) {
        specs.push(`<div class="spec-item"><strong>Material:</strong> ${formatDisplayValue('material', product.material)}</div>`);
    }
    if (product.finish) {
        specs.push(`<div class="spec-item"><strong>Finish:</strong> ${formatDisplayValue('finish', product.finish)}</div>`);
    }

    return specs.length > 0 ?
        `<div class="shower_mixers-specs">${specs.join('')}</div>` :
        '<div class="text-muted">No specifications available</div>';
}

/**
 * Get shower_mixers-specific validation rules
 */
function getValidationRules() {
    return {
        // Add shower_mixers-specific validation rules here
        'required_fields': ['sku', 'title', 'brand_name'],
        'numeric_fields': ['price', 'weight', 'warranty_years'],
        'boolean_fields': []
    };
}

/**
 * Format shower_mixers-specific display values
 */
function formatDisplayValue(fieldName, value) {
    if (!value) return '';

    // Add shower_mixers-specific formatting logic here
    switch(fieldName) {
        case 'warranty_years':
            return value + ' year' + (value !== 1 ? 's' : '');
        case 'weight':
            return value + 'kg';
        default:
            return value;
    }
}

/**
 * Get shower_mixers-specific field categories for organization
 */
function getFieldCategories() {
    return {
        'essential': ['sku', 'title', 'brand_name'],
        'specifications': ["valve_type", "flow_rate", "pressure_rating", "material", "finish"],
        'commercial': ['shopify_price', 'shopify_compare_price', 'warranty_years'],
        'content': ['body_html', 'features', 'care_instructions']
    };
}

// Export field mappings for use in base.js
window.COLLECTION_FIELD_MAPPINGS = SHOWER_MIXERS_FIELD_MAPPINGS;
