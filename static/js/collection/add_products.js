/**
 * Add New Products - Supplier Product Management
 * Handles importing new products from supplier catalog
 */

// Global state
let supplierProductsCache = {};
let selectedSupplierProducts = new Set();

/**
 * Show the Add New Products modal
 */
async function showAddProductsModal() {
    const modal = new bootstrap.Modal(document.getElementById('addNewProductsModal'));
    modal.show();

    // Load WIP products count
    await loadWIPCount();
}

/**
 * Search supplier products by SKUs
 */
async function searchSupplierBySKU() {
    console.log('🔍 searchSupplierBySKU() called');

    const skuInput = document.getElementById('supplierSKUInput');
    console.log('Input element:', skuInput);

    if (!skuInput) {
        console.error('❌ SKU input element not found!');
        alert('Error: Could not find SKU input field');
        return;
    }

    const skuText = skuInput.value.trim();
    console.log('SKU text:', skuText);

    if (!skuText) {
        console.warn('⚠️ No SKU text entered');
        showNotification('Please enter at least one SKU', 'warning');
        return;
    }

    // Parse SKUs (comma or newline separated)
    // Also remove quotes and other special characters
    const skus = skuText
        .split(/[,\n]/)
        .map(sku => sku.trim().replace(/["']/g, '')) // Remove quotes
        .filter(sku => sku.length > 0);

    console.log('Parsed SKUs:', skus);

    if (skus.length === 0) {
        console.warn('⚠️ No valid SKUs after parsing');
        showNotification('No valid SKUs found', 'warning');
        return;
    }

    try {
        console.log('📡 Sending search request...');
        showLoading('Searching supplier catalog...');

        const response = await fetch('/api/supplier-products/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ skus })
        });

        console.log('Response status:', response.status);
        const data = await response.json();
        console.log('Response data:', data);

        if (!data.success) {
            throw new Error(data.error || 'Search failed');
        }

        // Cache the products
        data.products.forEach(product => {
            supplierProductsCache[product.id] = product;
        });

        console.log('✅ Found products:', data.count);

        // Display results
        displaySupplierProducts(data.products);

        // Show selection actions if products found
        const selectionActions = document.getElementById('selectionActions');
        if (selectionActions && data.count > 0) {
            selectionActions.style.display = 'block';
        }

        showNotification(`Found ${data.count} products`, 'success');

    } catch (error) {
        console.error('❌ Search error:', error);
        showNotification(`Search failed: ${error.message}`, 'danger');
    } finally{
        hideLoading();
    }
}

/**
 * Load missing products for current collection
 */
async function loadMissingProducts() {
    try {
        showLoading('Finding missing products...');

        const response = await fetch(`/api/${COLLECTION_NAME}/supplier-products/missing`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load missing products');
        }

        // Cache the products
        data.products.forEach(product => {
            supplierProductsCache[product.id] = product;
        });

        // Display results
        displaySupplierProducts(data.products);

        const message = data.count > 0
            ? `Found ${data.count} products you don't have yet!`
            : 'No missing products found - you have everything!';

        showNotification(message, data.count > 0 ? 'info' : 'success');

    } catch (error) {
        console.error('Error loading missing products:', error);
        showNotification(`Error: ${error.message}`, 'danger');
    } finally {
        hideLoading();
    }
}

/**
 * Display supplier products in a grid
 */
function displaySupplierProducts(products) {
    const container = document.getElementById('supplierProductsGrid');

    if (!products || products.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="fas fa-inbox fa-3x text-muted mb-3"></i>
                <h5>No Products Found</h5>
                <p class="text-muted">Try searching by SKU or loading missing products</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';

    products.forEach(product => {
        const card = createSupplierProductCard(product);
        container.appendChild(card);
    });

    // Update selection count
    updateSelectionCount();
}

/**
 * Create a product card for a supplier product
 */
function createSupplierProductCard(product) {
    const wrapper = document.createElement('div');
    wrapper.className = 'col-md-6 col-lg-4 col-xl-3 mb-3';

    const isSelected = selectedSupplierProducts.has(product.id);

    // Extract image - use image proxy service for CORS handling and caching
    let imageUrl = '/static/images/placeholder-product.png';
    if (product.image_url) {
        // Use images.weserv.nl proxy (free, handles CORS, resizes, caches)
        // Format: https://images.weserv.nl/?url=<image_url>&w=300&h=300&fit=contain
        const encodedUrl = encodeURIComponent(product.image_url);
        imageUrl = `https://images.weserv.nl/?url=${encodedUrl}&w=300&h=300&fit=contain`;
    }

    // Collection badge
    let collectionBadge = '';
    if (product.detected_collection && product.confidence_score) {
        const confidence = Math.round(product.confidence_score * 100);
        collectionBadge = `
            <span class="badge bg-success" style="font-size: 0.7rem;">
                <i class="fas fa-check-circle me-1"></i>${product.detected_collection} (${confidence}%)
            </span>
        `;
    }

    wrapper.innerHTML = `
        <div class="card supplier-product-card ${isSelected ? 'selected' : ''}" data-product-id="${product.id}">
            <div class="card-header bg-light d-flex justify-content-between align-items-center p-2">
                <div class="form-check m-0">
                    <input class="form-check-input" type="checkbox"
                           id="supplier-${product.id}"
                           ${isSelected ? 'checked' : ''}
                           onchange="toggleSupplierProduct(${product.id})">
                    <label class="form-check-label small" for="supplier-${product.id}">
                        Select
                    </label>
                </div>
                ${collectionBadge}
            </div>

            <div class="card-body p-2">
                <div class="product-image mb-2" style="height: 150px; background: #f8f9fa; border-radius: 4px; overflow: hidden;">
                    <img src="${imageUrl}"
                         alt="${product.product_name || product.sku}"
                         class="w-100 h-100"
                         style="object-fit: contain;"
                         onerror="this.src='/static/images/placeholder-product.png'">
                </div>

                <h6 class="card-title mb-1" style="font-size: 0.85rem; line-height: 1.3;">
                    ${product.product_name || 'Unnamed Product'}
                </h6>

                <div class="product-meta small text-muted">
                    <div><strong>SKU:</strong> ${product.sku}</div>
                    <div><strong>Supplier:</strong> ${product.supplier_name}</div>
                </div>
            </div>

            <div class="card-footer bg-white p-2 border-top">
                <a href="${product.product_url}" target="_blank" class="btn btn-sm btn-outline-primary w-100">
                    <i class="fas fa-external-link-alt me-1"></i>View on Supplier Site
                </a>
            </div>
        </div>
    `;

    return wrapper;
}

/**
 * Toggle supplier product selection
 */
function toggleSupplierProduct(productId) {
    if (selectedSupplierProducts.has(productId)) {
        selectedSupplierProducts.delete(productId);
    } else {
        selectedSupplierProducts.add(productId);
    }

    // Update card visual
    const card = document.querySelector(`[data-product-id="${productId}"]`);
    if (card) {
        card.classList.toggle('selected', selectedSupplierProducts.has(productId));
    }

    updateSelectionCount();
}

/**
 * Select all supplier products
 */
function selectAllSupplierProducts() {
    Object.values(supplierProductsCache).forEach(product => {
        selectedSupplierProducts.add(product.id);
    });

    // Update all checkboxes and cards
    document.querySelectorAll('.supplier-product-card').forEach(card => {
        const productId = parseInt(card.dataset.productId);
        card.classList.add('selected');
        const checkbox = card.querySelector('input[type="checkbox"]');
        if (checkbox) checkbox.checked = true;
    });

    updateSelectionCount();
}

/**
 * Clear all selections
 */
function clearSupplierSelection() {
    selectedSupplierProducts.clear();

    // Update all checkboxes and cards
    document.querySelectorAll('.supplier-product-card').forEach(card => {
        card.classList.remove('selected');
        const checkbox = card.querySelector('input[type="checkbox"]');
        if (checkbox) checkbox.checked = false;
    });

    updateSelectionCount();
}

/**
 * Update selection count display
 */
function updateSelectionCount() {
    const countElement = document.getElementById('selectedSupplierCount');
    if (countElement) {
        countElement.textContent = selectedSupplierProducts.size;
    }

    // Enable/disable action buttons
    const addToWIPBtn = document.getElementById('addToWIPBtn');
    if (addToWIPBtn) {
        addToWIPBtn.disabled = selectedSupplierProducts.size === 0;
    }
}

/**
 * Add selected products to Work in Progress
 */
async function addSelectedToWIP() {
    if (selectedSupplierProducts.size === 0) {
        showNotification('Please select at least one product', 'warning');
        return;
    }

    try {
        showLoading('Adding to Work in Progress...');

        const productIds = Array.from(selectedSupplierProducts);

        const response = await fetch(`/api/${COLLECTION_NAME}/wip/add`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ product_ids: productIds })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to add to WIP');
        }

        showNotification(`Added ${data.count} products to Work in Progress`, 'success');

        // Clear selection
        clearSupplierSelection();

        // Refresh WIP count
        await loadWIPCount();

        // Switch to WIP tab
        const wipTab = document.querySelector('[data-bs-target="#wipTab"]');
        if (wipTab) {
            new bootstrap.Tab(wipTab).show();
        }

        // Load WIP products
        await loadWIPProducts();

    } catch (error) {
        console.error('Error adding to WIP:', error);
        showNotification(`Error: ${error.message}`, 'danger');
    } finally {
        hideLoading();
    }
}

/**
 * Load WIP products count
 */
async function loadWIPCount() {
    try {
        const response = await fetch(`/api/${COLLECTION_NAME}/wip/list`);
        const data = await response.json();

        if (data.success) {
            const countBadge = document.getElementById('wipCountBadge');
            if (countBadge) {
                countBadge.textContent = data.count;
                countBadge.style.display = data.count > 0 ? 'inline' : 'none';
            }
        }
    } catch (error) {
        console.error('Error loading WIP count:', error);
    }
}

/**
 * Load and display WIP products
 */
async function loadWIPProducts() {
    try {
        showLoading('Loading work in progress...');

        const response = await fetch(`/api/${COLLECTION_NAME}/wip/list`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load WIP products');
        }

        displayWIPProducts(data.products);

    } catch (error) {
        console.error('Error loading WIP products:', error);
        showNotification(`Error: ${error.message}`, 'danger');
    } finally {
        hideLoading();
    }
}

/**
 * Display WIP products
 */
function displayWIPProducts(products) {
    const container = document.getElementById('wipProductsGrid');

    if (!products || products.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="fas fa-clipboard-check fa-3x text-muted mb-3"></i>
                <h5>No Work in Progress</h5>
                <p class="text-muted">Add products from the supplier catalog to get started</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';

    products.forEach(wipProduct => {
        const card = createWIPProductCard(wipProduct);
        container.appendChild(card);
    });
}

/**
 * Create a WIP product card
 */
function createWIPProductCard(wipProduct) {
    const wrapper = document.createElement('div');
    wrapper.className = 'col-md-6 col-lg-4 col-xl-3 mb-3';

    const imageUrl = wipProduct.image_url || '/static/images/placeholder-product.png';

    // Status badge
    const statusColors = {
        'pending': 'secondary',
        'extracting': 'primary',
        'reviewing': 'warning',
        'completed': 'success'
    };
    const statusColor = statusColors[wipProduct.status] || 'secondary';

    wrapper.innerHTML = `
        <div class="card wip-product-card">
            <div class="card-header bg-${statusColor} text-white p-2">
                <div class="d-flex justify-content-between align-items-center">
                    <small><i class="fas fa-circle"></i> ${wipProduct.status.toUpperCase()}</small>
                    <small>${new Date(wipProduct.created_at).toLocaleDateString()}</small>
                </div>
            </div>

            <div class="card-body p-2">
                <div class="product-image mb-2" style="height: 150px; background: #f8f9fa; border-radius: 4px; overflow: hidden;">
                    <img src="${imageUrl}"
                         alt="${wipProduct.product_name || wipProduct.sku}"
                         class="w-100 h-100"
                         style="object-fit: contain;"
                         onerror="this.src='/static/images/placeholder-product.png'">
                </div>

                <h6 class="card-title mb-1" style="font-size: 0.85rem;">
                    ${wipProduct.product_name || 'Unnamed Product'}
                </h6>

                <div class="product-meta small text-muted">
                    <div><strong>SKU:</strong> ${wipProduct.sku}</div>
                </div>
            </div>

            <div class="card-footer bg-white p-2 border-top">
                <div class="btn-group w-100" role="group">
                    <button class="btn btn-sm btn-primary" onclick="startAIExtraction(${wipProduct.id})">
                        <i class="fas fa-magic"></i> Extract
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="editWIPProduct(${wipProduct.id})">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                </div>
            </div>
        </div>
    `;

    return wrapper;
}

/**
 * Load WIP products for a specific status and display them
 */
async function loadWIPByStatus(status) {
    try {
        const response = await fetch(`/api/${COLLECTION_NAME}/wip/list?status=${status}`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load WIP products');
        }

        // Update count badge
        const badgeId = `${status}CountBadge`;
        const badge = document.getElementById(badgeId);
        if (badge) {
            badge.textContent = data.count;
        }

        // Display products in the appropriate grid
        const gridId = `${status}ProductsGrid`;
        displayWIPProducts(data.products, gridId, status);

    } catch (error) {
        console.error(`Error loading ${status} WIP products:`, error);
        showNotification(`Error: ${error.message}`, 'danger');
    }
}

/**
 * Display WIP products in the specified grid
 */
function displayWIPProducts(products, gridId, status) {
    const container = document.getElementById(gridId);
    if (!container) return;

    if (!products || products.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-5 text-muted">
                <i class="fas fa-inbox fa-3x mb-3"></i>
                <p>No ${status} products</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';

    products.forEach(product => {
        const card = createWIPProductCard(product, status);
        container.appendChild(card);
    });
}

/**
 * Create a WIP product card
 */
function createWIPProductCard(product, status) {
    const wrapper = document.createElement('div');
    wrapper.className = 'col-md-6 col-lg-4 col-xl-3 mb-3';

    const imageUrl = product.image_url
        ? `https://images.weserv.nl/?url=${encodeURIComponent(product.image_url)}&w=300&h=300&fit=contain`
        : '/static/images/placeholder-product.png';

    let statusBadge = '';
    let cardFooter = '';

    switch(status) {
        case 'pending':
            statusBadge = '<span class="badge bg-secondary">Pending</span>';
            cardFooter = `
                <div class="form-check m-0">
                    <input class="form-check-input wip-select" type="checkbox"
                           value="${product.id}" onchange="toggleWIPSelection()">
                    <label class="form-check-label small">Select for processing</label>
                </div>
            `;
            break;
        case 'extracting':
            statusBadge = '<span class="badge bg-info"><i class="fas fa-spinner fa-spin"></i> Extracting</span>';
            cardFooter = '<small class="text-muted">AI is extracting data...</small>';
            break;
        case 'generating':
            statusBadge = '<span class="badge bg-warning"><i class="fas fa-magic"></i> Generating</span>';
            cardFooter = '<small class="text-muted">Generating descriptions...</small>';
            break;
        case 'ready':
            statusBadge = '<span class="badge bg-success"><i class="fas fa-check"></i> Ready</span>';
            cardFooter = `
                <div class="btn-group w-100" role="group">
                    <button class="btn btn-sm btn-primary" onclick="openWIPProductModal(${product.id})">
                        <i class="fas fa-edit"></i> Review
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="removeFromWIP(${product.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            break;
    }

    wrapper.innerHTML = `
        <div class="card h-100">
            <div class="card-header bg-light p-2 d-flex justify-content-between align-items-center">
                ${statusBadge}
                ${product.error_message ? '<i class="fas fa-exclamation-triangle text-danger" title="' + product.error_message + '"></i>' : ''}
            </div>
            <div class="card-body p-2">
                <div class="product-image mb-2" style="height: 150px; background: #f8f9fa; border-radius: 4px; overflow: hidden;">
                    <img src="${imageUrl}" alt="${product.product_name || product.sku}"
                         class="w-100 h-100" style="object-fit: contain;"
                         onerror="this.src='/static/images/placeholder-product.png'">
                </div>
                <h6 class="card-title mb-1" style="font-size: 0.85rem;">${product.product_name || 'Unnamed Product'}</h6>
                <div class="small text-muted">
                    <div><strong>SKU:</strong> ${product.sku}</div>
                    <div><strong>Supplier:</strong> ${product.supplier_name}</div>
                    ${product.sheet_row_number ? `<div><strong>Row:</strong> ${product.sheet_row_number}</div>` : ''}
                </div>
            </div>
            <div class="card-footer bg-white p-2 border-top">
                ${cardFooter}
            </div>
        </div>
    `;

    return wrapper;
}

/**
 * Toggle WIP product selection (for pending processing)
 */
function toggleWIPSelection() {
    const checkboxes = document.querySelectorAll('.wip-select:checked');
    const selectedCount = checkboxes.length;

    const processBtn = document.getElementById('processPendingBtn');
    if (processBtn) {
        processBtn.disabled = selectedCount === 0;

        if (selectedCount > 30) {
            processBtn.innerHTML = '<i class="fas fa-exclamation-triangle me-1"></i>Too many selected (Max 30)';
            processBtn.classList.add('btn-danger');
            processBtn.classList.remove('btn-primary');
            processBtn.disabled = true;
        } else if (selectedCount > 0) {
            processBtn.innerHTML = `<i class="fas fa-play me-1"></i>Start Processing ${selectedCount} Product${selectedCount > 1 ? 's' : ''}`;
            processBtn.classList.add('btn-primary');
            processBtn.classList.remove('btn-danger');
            processBtn.disabled = false;
        } else {
            processBtn.innerHTML = '<i class="fas fa-play me-1"></i>Start Processing Selected (Max 30)';
            processBtn.classList.add('btn-primary');
            processBtn.classList.remove('btn-danger');
        }
    }
}

/**
 * Process selected WIP products (add to sheets + extract + generate)
 */
async function processSelectedWIP() {
    const checkboxes = document.querySelectorAll('.wip-select:checked');
    const wipIds = Array.from(checkboxes).map(cb => parseInt(cb.value));

    if (wipIds.length === 0) {
        showNotification('Please select at least one product', 'warning');
        return;
    }

    if (wipIds.length > 30) {
        showNotification('Maximum 30 products can be processed at once', 'danger');
        return;
    }

    if (!confirm(`Process ${wipIds.length} product(s)? This will:\n1. Add to Google Sheets\n2. Run AI extraction\n3. Generate descriptions\n4. Clean data with Apps Script`)) {
        return;
    }

    try {
        showLoading(`Processing ${wipIds.length} products...`);

        const response = await fetch(`/api/${COLLECTION_NAME}/wip/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wip_ids: wipIds })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Processing failed');
        }

        showNotification(
            `Successfully processed ${data.successful} of ${data.total} products`,
            data.successful === data.total ? 'success' : 'warning'
        );

        // Reload all WIP tabs
        await refreshAllWIPTabs();

    } catch (error) {
        console.error('Error processing WIP products:', error);
        showNotification(`Error: ${error.message}`, 'danger');
    } finally {
        hideLoading();
    }
}

/**
 * Remove product from WIP (and delete from Google Sheets)
 */
async function removeFromWIP(wipId) {
    if (!confirm('Remove this product from WIP? It will be deleted from Google Sheets if it was added.')) {
        return;
    }

    try {
        showLoading('Removing from WIP...');

        const response = await fetch(`/api/${COLLECTION_NAME}/wip/${wipId}/remove`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to remove from WIP');
        }

        showNotification('Product removed from WIP', 'success');

        // Reload all WIP tabs
        await refreshAllWIPTabs();

    } catch (error) {
        console.error('Error removing from WIP:', error);
        showNotification(`Error: ${error.message}`, 'danger');
    } finally {
        hideLoading();
    }
}

/**
 * Open product modal for manual review/editing
 */
function openWIPProductModal(wipId) {
    // TODO: Open the existing product modal with the WIP product data
    console.log('Opening product modal for WIP ID:', wipId);
    showNotification('Product modal opening... (TODO: integrate with existing modal)', 'info');
}

/**
 * Refresh all WIP tabs
 */
async function refreshAllWIPTabs() {
    await Promise.all([
        loadWIPByStatus('pending'),
        loadWIPByStatus('extracting'),
        loadWIPByStatus('generating'),
        loadWIPByStatus('ready')
    ]);
}

/**
 * Initialize WIP tab when it's shown
 */
document.addEventListener('DOMContentLoaded', () => {
    const wipTab = document.getElementById('wip-tab');
    if (wipTab) {
        wipTab.addEventListener('shown.bs.tab', () => {
            refreshAllWIPTabs();
        });
    }
});

// Helper functions
function showLoading(message = 'Loading...') {
    // Use existing loading state function
    if (window.showLoadingState) {
        showLoadingState();
    }
}

function hideLoading() {
    // Use existing hide loading function
    if (window.hideLoadingState) {
        hideLoadingState();
    }
}

// Expose functions to global scope
window.showAddProductsModal = showAddProductsModal;
window.searchSupplierBySKU = searchSupplierBySKU;
window.loadMissingProducts = loadMissingProducts;
window.toggleSupplierProduct = toggleSupplierProduct;
window.selectAllSupplierProducts = selectAllSupplierProducts;
window.clearSupplierSelection = clearSupplierSelection;
window.addSelectedToWIP = addSelectedToWIP;
window.loadWIPProducts = loadWIPProducts;
