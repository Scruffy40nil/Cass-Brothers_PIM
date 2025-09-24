// Collection Base - Clean Find Missing Info Implementation
console.log('🔍 Loading Find Missing Info feature...');

// Global state
let productsData = {};
let missingInfoData = null;

// Critical fields (70% of completeness score)
const CRITICAL_FIELDS = [
    'installation_type', 'product_material', 'warranty_years',
    'bowls_number', 'length_mm', 'overall_width_mm', 'overall_depth_mm',
    'min_cabinet_size_mm', 'cutout_size_mm', 'brand_name', 'location',
    'drain_position', 'spec_sheet_url'
];

// Recommended fields (30% of completeness score)
const RECOMMENDED_FIELDS = [
    'grade_of_material', 'style', 'waste_outlet_dimensions',
    'is_undermount', 'is_topmount', 'is_flushmount', 'has_overflow',
    'tap_holes_number', 'bowl_width', 'bowl_depth', 'bowl_height',
    'bowl2_width', 'bowl2_depth', 'bowl2_height',
    'body_html', 'features', 'care_instructions'
];

/**
 * Get missing fields for a product
 */
function getMissingFields(product) {
    const missing = [];

    [...CRITICAL_FIELDS, ...RECOMMENDED_FIELDS].forEach(field => {
        if (isEmpty(product[field]) || isInvalid(field, product[field])) {
            missing.push(field);
        }
    });

    return missing;
}

/**
 * Calculate completeness score (0-100)
 */
function getCompleteness(product) {
    const criticalWeight = 70;
    const recommendedWeight = 30;

    const criticalPresent = CRITICAL_FIELDS.filter(f =>
        !isEmpty(product[f]) && !isInvalid(f, product[f])
    ).length;

    const recommendedPresent = RECOMMENDED_FIELDS.filter(f =>
        !isEmpty(product[f]) && !isInvalid(f, product[f])
    ).length;

    const criticalScore = (criticalPresent / CRITICAL_FIELDS.length) * criticalWeight;
    const recommendedScore = (recommendedPresent / RECOMMENDED_FIELDS.length) * recommendedWeight;

    return Math.round(criticalScore + recommendedScore);
}

/**
 * Check if field value is empty
 */
function isEmpty(value) {
    return value === null || value === undefined || value === '' || value === 'NULL';
}

/**
 * Check if field value is invalid
 */
function isInvalid(field, value) {
    if (isEmpty(value)) return false; // Empty is handled separately

    switch (field) {
        case 'bowls_number':
            return value < 1;
        case 'cutout_size_mm':
        case 'length_mm':
        case 'overall_width_mm':
        case 'overall_depth_mm':
        case 'min_cabinet_size_mm':
            return value <= 0;
        case 'spec_sheet_url':
            return !isValidUrl(value);
        default:
            return false;
    }
}

/**
 * Simple URL validation
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
 * Format field name for display
 */
function formatFieldName(field) {
    return field.replace(/_/g, ' ')
                .replace(/\b\w/g, l => l.toUpperCase())
                .replace(/Mm$/, ' (mm)')
                .replace(/Html/, 'HTML');
}

/**
 * Get completeness CSS class
 */
function getCompletenessClass(score) {
    if (score >= 90) return 'completeness-excellent';
    if (score >= 70) return 'completeness-good';
    if (score >= 50) return 'completeness-fair';
    return 'completeness-poor';
}

/**
 * Show Find Missing Info modal
 */
async function showFindMissingInfo() {
    try {
        console.log(`🔍 Loading Find Missing Info for ${COLLECTION_NAME}...`);

        // Create modal if it doesn't exist
        let modal = document.getElementById('findMissingInfoModal');
        if (!modal) {
            modal = createFindMissingInfoModal();
            document.body.appendChild(modal);
        }

        const modalBody = modal.querySelector('.modal-body');

        // Show loading state
        modalBody.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Analyzing...</span>
                </div>
                <p class="mt-3">🔍 Analyzing missing information...</p>
            </div>
        `;

        // Show modal
        const bootstrapModal = new bootstrap.Modal(modal);
        bootstrapModal.show();

        // Fetch missing info analysis
        const response = await fetch(`/api/${COLLECTION_NAME}/products/missing-info`);
        const data = await response.json();

        if (data.success) {
            missingInfoData = data.missing_info_analysis;
            displayFindMissingInfoResults(modalBody, data);
        } else {
            modalBody.innerHTML = `
                <div class="alert alert-danger">
                    <h5>Error Loading Missing Info</h5>
                    <p>${data.error || 'Unknown error occurred'}</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('❌ Error loading Find Missing Info:', error);
        const modalBody = document.getElementById('findMissingInfoModal')?.querySelector('.modal-body');
        if (modalBody) {
            modalBody.innerHTML = `
                <div class="alert alert-warning">
                    <h5>Find Missing Info Unavailable</h5>
                    <p>The missing data analysis API is not available.</p>
                </div>
            `;
        }
    }
}

/**
 * Create the Find Missing Info modal
 */
function createFindMissingInfoModal() {
    const modal = document.createElement('div');
    modal.id = 'findMissingInfoModal';
    modal.className = 'modal fade';
    modal.innerHTML = `
        <div class="modal-dialog modal-xl">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">
                        <i class="fas fa-search me-2"></i>Find Missing Information
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body"></div>
            </div>
        </div>
    `;
    return modal;
}

/**
 * Display Find Missing Info results
 */
function displayFindMissingInfoResults(container, data) {
    const products = data.missing_info_analysis.products || [];
    const stats = data.missing_info_analysis.summary || {};

    // Summary section
    const summaryHtml = `
        <div class="missing-info-summary mb-4">
            <div class="row">
                <div class="col-md-3">
                    <div class="stat-card">
                        <h3>${products.length}</h3>
                        <p>Products Analyzed</p>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="stat-card">
                        <h3>${products.filter(p => getMissingFields(p).length > 0).length}</h3>
                        <p>Need Attention</p>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="stat-card">
                        <h3>${Math.round(products.reduce((sum, p) => sum + getCompleteness(p), 0) / products.length)}%</h3>
                        <p>Average Completeness</p>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="stat-card">
                        <h3>${products.filter(p => getCompleteness(p) === 100).length}</h3>
                        <p>Complete Products</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Product list
    const productsHtml = products.map(product => {
        const missing = getMissingFields(product);
        const completeness = getCompleteness(product);
        const displayFields = missing.slice(0, 3);
        const remaining = missing.length - 3;

        if (missing.length === 0) return ''; // Skip complete products

        return `
            <div class="product-missing-card mb-3">
                <div class="row align-items-center">
                    <div class="col-md-6">
                        <div class="product-info">
                            <h6>${product.title || `Product ${product.row_num}`}</h6>
                            <small class="text-muted">SKU: ${product.variant_sku || product.sku || 'N/A'}</small>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="missing-fields-display">
                            ${displayFields.map(field =>
                                `<span class="badge bg-danger me-1 mb-1">⚠ ${formatFieldName(field)}</span>`
                            ).join('')}
                            ${remaining > 0 ? `<span class="badge bg-secondary">+${remaining} more</span>` : ''}
                        </div>
                    </div>
                    <div class="col-md-2 text-end">
                        <div class="completeness-pill ${getCompletenessClass(completeness)} mb-2">
                            ${completeness}%
                        </div>
                        <button class="btn btn-warning btn-sm w-100" onclick="fixInModal(${product.row_num})">
                            <i class="fas fa-wrench me-1"></i>Fix in Modal
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).filter(html => html !== '').join('');

    container.innerHTML = summaryHtml + `
        <div class="products-section">
            <h5 class="mb-3">Products Needing Attention</h5>
            ${productsHtml || '<p class="text-muted">All products are complete!</p>'}
        </div>
    `;
}

/**
 * Fix product in modal with missing fields mode
 */
function fixInModal(rowNum) {
    console.log(`🔧 Opening fix modal for product ${rowNum}`);

    // Find the product data
    const product = missingInfoData?.products?.find(p => p.row_num == rowNum);
    if (!product) {
        console.error('Product not found for row:', rowNum);
        return;
    }

    // Ensure productsData has this product
    if (!productsData) productsData = {};
    productsData[rowNum] = product;

    // Open the existing product modal in fix mode
    openProductModalInFixMode(rowNum);
}

/**
 * Open product modal in fix missing fields mode
 */
function openProductModalInFixMode(rowNum) {
    // Set global state for fix mode
    window.modalFixMode = {
        active: true,
        productId: rowNum,
        missingFields: getMissingFields(productsData[rowNum])
    };

    // Open the existing modal
    editProduct(rowNum);
}

/**
 * Original editProduct function (simplified)
 */
function editProduct(rowNum) {
    console.log(`✏️ Opening product editor for row: ${rowNum}`);

    const modalElement = document.getElementById('editProductModal');
    if (!modalElement) {
        console.error('❌ Modal element not found!');
        return;
    }

    try {
        let data = productsData[rowNum];
        if (!data) {
            console.warn(`⚠️ No data found for row ${rowNum}`);
            return;
        }

        // Store current row
        modalElement.dataset.currentRow = rowNum;

        // Update modal title
        const titleElement = document.getElementById('editProductTitle');
        if (titleElement) {
            titleElement.textContent = data.title || `Product ${rowNum}`;
        }

        // If in fix mode, enhance the modal
        if (window.modalFixMode?.active && window.modalFixMode.productId == rowNum) {
            enhanceModalForFixMode(modalElement, data);
        }

        // Show modal
        const modal = new bootstrap.Modal(modalElement, {
            backdrop: 'static',
            keyboard: true
        });
        modal.show();

    } catch (error) {
        console.error('❌ Error in editProduct function:', error);
    }
}

/**
 * Enhance modal for fix missing fields mode
 */
function enhanceModalForFixMode(modalElement, product) {
    const missing = getMissingFields(product);
    const completeness = getCompleteness(product);

    // Add fix mode indicator to modal header
    const modalHeader = modalElement.querySelector('.modal-header');
    if (modalHeader && !modalHeader.querySelector('.fix-mode-indicator')) {
        const indicator = document.createElement('div');
        indicator.className = 'fix-mode-indicator';
        indicator.innerHTML = `
            <div class="progress mb-2" style="height: 6px;">
                <div class="progress-bar bg-success" style="width: ${completeness}%"></div>
            </div>
            <small class="text-muted">Completeness: ${completeness}% • ${missing.length} fields missing</small>
        `;
        modalHeader.appendChild(indicator);
    }

    // Add missing fields checklist to modal body
    const modalBody = modalElement.querySelector('.modal-body');
    if (modalBody && !modalBody.querySelector('.missing-fields-sidebar')) {
        const sidebar = document.createElement('div');
        sidebar.className = 'missing-fields-sidebar';
        sidebar.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h6 class="mb-0">Missing Fields (${missing.length})</h6>
                </div>
                <div class="card-body">
                    ${missing.map(field => `
                        <div class="missing-field-item" data-field="${field}">
                            <i class="fas fa-square-o text-danger me-2"></i>
                            <span>${formatFieldName(field)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        modalBody.appendChild(sidebar);
    }

    console.log(`🎯 Enhanced modal for fix mode - ${missing.length} missing fields`);
}

// Export functions to global scope
window.showFindMissingInfo = showFindMissingInfo;
window.fixInModal = fixInModal;
window.editProduct = editProduct;
window.getMissingFields = getMissingFields;
window.getCompleteness = getCompleteness;
window.formatFieldName = formatFieldName;

console.log('✅ Find Missing Info feature loaded');