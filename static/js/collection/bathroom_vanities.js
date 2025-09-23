/**
 * Bathroom Vanities Collection JavaScript - Specific functionality for bathroom_vanities collection
 */

// Bathroom Vanities-specific field mappings (extends base mappings)
const BATHROOM_VANITIES_FIELD_MAPPINGS = {
'editSku': 'variant_sku',
    'editTitle': 'title',
    'editVendor': 'vendor',
    'editBrandName': 'brand_name',
        'editSku': 'sku',
        'editCabinetMaterial': 'cabinet_material',
        'editBasinMaterial': 'basin_material',
        'editWidthMm': 'width_mm',
        'editDepthMm': 'depth_mm',
        'editHeightMm': 'height_mm',
        'editDoorStyle': 'door_style',
        'editFinish': 'finish',
        'editBasinType': 'basin_type'
};

/**
 * Render bathroom_vanities-specific product specifications
 */
function renderProductSpecs(product) {
    const specs = [];

    if (product.cabinet_material) {
        specs.push(`<div class="spec-item"><strong>Cabinet Material:</strong> ${formatDisplayValue('cabinet_material', product.cabinet_material)}</div>`);
    }
    if (product.basin_material) {
        specs.push(`<div class="spec-item"><strong>Basin Material:</strong> ${formatDisplayValue('basin_material', product.basin_material)}</div>`);
    }
    if (product.width_mm) {
        specs.push(`<div class="spec-item"><strong>Width Mm:</strong> ${formatDisplayValue('width_mm', product.width_mm)}</div>`);
    }
    if (product.depth_mm) {
        specs.push(`<div class="spec-item"><strong>Depth Mm:</strong> ${formatDisplayValue('depth_mm', product.depth_mm)}</div>`);
    }
    if (product.height_mm) {
        specs.push(`<div class="spec-item"><strong>Height Mm:</strong> ${formatDisplayValue('height_mm', product.height_mm)}</div>`);
    }
    if (product.door_style) {
        specs.push(`<div class="spec-item"><strong>Door Style:</strong> ${formatDisplayValue('door_style', product.door_style)}</div>`);
    }
    if (product.finish) {
        specs.push(`<div class="spec-item"><strong>Finish:</strong> ${formatDisplayValue('finish', product.finish)}</div>`);
    }

    return specs.length > 0 ?
        `<div class="bathroom_vanities-specs">${specs.join('')}</div>` :
        '<div class="text-muted">No specifications available</div>';
}

/**
 * Get bathroom_vanities-specific validation rules
 */
function getValidationRules() {
    return {
        // Add bathroom_vanities-specific validation rules here
        'required_fields': ['sku', 'title', 'brand_name'],
        'numeric_fields': ['price', 'weight', 'warranty_years'],
        'boolean_fields': []
    };
}

/**
 * Format bathroom_vanities-specific display values
 */
function formatDisplayValue(fieldName, value) {
    if (!value) return '';

    // Add bathroom_vanities-specific formatting logic here
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
 * Get bathroom_vanities-specific field categories for organization
 */
function getFieldCategories() {
    return {
        'essential': ['sku', 'title', 'brand_name'],
        'specifications': ["cabinet_material", "basin_material", "width_mm", "depth_mm", "height_mm", "door_style", "finish", "basin_type"],
        'commercial': ['shopify_price', 'shopify_compare_price', 'warranty_years'],
        'content': ['body_html', 'features', 'care_instructions']
    };
}

// Export field mappings for use in base.js
window.COLLECTION_FIELD_MAPPINGS = BATHROOM_VANITIES_FIELD_MAPPINGS;
