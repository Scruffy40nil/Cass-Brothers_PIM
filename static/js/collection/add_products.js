/**
 * Add New Products - Supplier Product Management
 * Handles importing new products from supplier catalog
 */

// Global state
let supplierProductsCache = {};
let selectedSupplierProducts = new Set();
let allMissingProducts = [];  // Store all missing products for filtering

/**
 * Show the Add New Products modal
 */
async function showAddProductsModal() {
    const modal = new bootstrap.Modal(document.getElementById('addNewProductsModal'));
    modal.show();

    // Load WIP products count
    await loadWIPCount();

    // Set up listener for when edit modal closes to refresh WIP products
    const editModal = document.getElementById('editProductModal');
    if (editModal) {
        // Remove any existing listeners to avoid duplicates
        editModal.removeEventListener('hidden.bs.modal', refreshWIPAfterEdit);
        // Add new listener
        editModal.addEventListener('hidden.bs.modal', refreshWIPAfterEdit);
    }
}

/**
 * Refresh WIP products after editing (called when edit modal closes)
 */
async function refreshWIPAfterEdit() {
    // Only refresh if we're reviewing from WIP
    const addProductsModal = document.getElementById('addNewProductsModal');
    if (addProductsModal && addProductsModal.classList.contains('show')) {
        // Reload WIP products to show any updates
        await loadWIPProducts();
    }
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
            body: JSON.stringify({
                skus,
                collection_name: COLLECTION_NAME  // Pass collection for confidence checking
            })
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

        // Store all missing products for filtering
        allMissingProducts = data.products;

        // Cache the products
        data.products.forEach(product => {
            supplierProductsCache[product.id] = product;
        });

        // Populate supplier filter dropdown
        populateSupplierFilter(data.products);

        // Display results in the missing products grid (not the search grid)
        displaySupplierProducts(data.products, 'missingProductsGrid');

        // Show selection actions (both top and bottom) if products found
        const selectionActions = document.getElementById('missingSelectionActions');
        const selectionActionsTop = document.getElementById('missingSelectionActionsTop');
        if (selectionActions && data.count > 0) {
            selectionActions.style.display = 'block';
        }
        if (selectionActionsTop && data.count > 0) {
            selectionActionsTop.style.display = 'block';
        }

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
function displaySupplierProducts(products, gridId = 'supplierProductsGrid') {
    const container = document.getElementById(gridId);

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

    // Extract image - try direct URL first, fallback to proxy if needed
    let imageUrl = '/static/images/placeholder-product.svg';
    if (product.image_url) {
        // Try direct URL first (works if supplier allows hotlinking)
        imageUrl = product.image_url;
    }

    // Warning badge for collection mismatch or low confidence
    let warningBadge = '';
    if (product.collection_mismatch) {
        warningBadge = `<span class="badge bg-danger" style="font-size: 0.7rem;" title="${product.warning}">
            <i class="fas fa-exclamation-triangle"></i> Wrong Collection
        </span>`;
    } else if (product.low_confidence) {
        warningBadge = `<span class="badge bg-warning text-dark" style="font-size: 0.7rem;" title="${product.warning}">
            <i class="fas fa-exclamation-circle"></i> Low Match
        </span>`;
    } else if (product.no_detection) {
        warningBadge = `<span class="badge bg-secondary" style="font-size: 0.7rem;" title="${product.warning}">
            <i class="fas fa-question-circle"></i> Uncertain
        </span>`;
    }

    wrapper.innerHTML = `
        <div class="card supplier-product-card ${isSelected ? 'selected' : ''}" data-product-id="${product.id}">
            <div class="card-header bg-light p-2">
                <div class="d-flex justify-content-between align-items-center">
                    <div class="form-check m-0">
                        <input class="form-check-input" type="checkbox"
                               id="supplier-${product.id}"
                               ${isSelected ? 'checked' : ''}
                               onchange="toggleSupplierProduct(${product.id})">
                        <label class="form-check-label small" for="supplier-${product.id}">
                            Select
                        </label>
                    </div>
                    ${warningBadge}
                </div>
            </div>

            <div class="card-body p-2">
                <div class="product-image mb-2" style="height: 150px; background: #f8f9fa; border-radius: 4px; overflow: hidden;">
                    <img src="${imageUrl}"
                         alt="${product.product_name || product.sku}"
                         class="w-100 h-100"
                         style="object-fit: contain;"
                         onerror="if(this.src.indexOf('weserv.nl') === -1 && this.src.indexOf('placeholder') === -1) { const encoded = encodeURIComponent(this.src); this.src = 'https://images.weserv.nl/?url=' + encoded + '&w=300&h=300&fit=contain'; } else { this.src='/static/images/placeholder-product.svg'; }"
                         crossorigin="anonymous">
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
    const countElementTop = document.getElementById('selectedMissingCountTop');
    if (countElement) {
        countElement.textContent = selectedSupplierProducts.size;
    }
    if (countElementTop) {
        countElementTop.textContent = selectedSupplierProducts.size;
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
            cardFooter = `
                <div class="btn-group w-100" role="group">
                    <button class="btn btn-sm btn-warning" onclick="resetWIPProduct(${product.id})" title="Reset to pending">
                        <i class="fas fa-redo"></i> Retry
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="removeFromWIP(${product.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            break;
        case 'generating':
            statusBadge = '<span class="badge bg-warning"><i class="fas fa-magic"></i> Generating</span>';
            cardFooter = `
                <div class="btn-group w-100" role="group">
                    <button class="btn btn-sm btn-warning" onclick="resetWIPProduct(${product.id})" title="Reset to pending">
                        <i class="fas fa-redo"></i> Retry
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="removeFromWIP(${product.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
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
 * Reset a stuck WIP product back to pending status
 */
async function resetWIPProduct(wipId) {
    if (!confirm('Reset this product to pending status? You can then try processing it again.')) {
        return;
    }

    try {
        showLoading('Resetting product...');

        const response = await fetch(`/api/${COLLECTION_NAME}/wip/${wipId}/reset`, {
            method: 'POST'
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to reset product');
        }

        showNotification('Product reset to pending - you can try processing it again', 'success');

        // Reload all WIP tabs
        await refreshAllWIPTabs();

    } catch (error) {
        console.error('Error resetting WIP product:', error);
        showNotification(`Error: ${error.message}`, 'danger');
    } finally {
        hideLoading();
    }
}

/**
 * Open product modal for manual review/editing
 */
async function openWIPProductModal(wipId) {
    try {
        // Get WIP products to find the one we want
        const response = await fetch(`/api/${COLLECTION_NAME}/wip/list?status=ready`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load WIP product');
        }

        // Find the specific WIP product
        const wipProduct = data.products.find(p => p.id === wipId);

        if (!wipProduct) {
            throw new Error('WIP product not found');
        }

        if (!wipProduct.sheet_row_number) {
            throw new Error('Product not yet added to Google Sheets');
        }

        console.log('📋 Opening WIP product for review:', {
            wipId: wipId,
            sheet_row_number: wipProduct.sheet_row_number,
            sku: wipProduct.sku,
            product_name: wipProduct.product_name
        });

        // Fetch the specific product from Google Sheets API
        // This ensures we have the latest data without loading all products
        try {
            console.log(`🔄 Fetching product data from Google Sheets for row ${wipProduct.sheet_row_number}...`);
            const response = await fetch(`/api/${COLLECTION_NAME}/products/${wipProduct.sheet_row_number}`);
            const result = await response.json();

            if (result.success && result.product) {
                console.log('✅ Product data loaded from Google Sheets:', result.product);

                // Store in productsData cache so editProduct can find it
                if (!window.productsData) {
                    window.productsData = {};
                }
                window.productsData[wipProduct.sheet_row_number] = result.product;
                console.log(`💾 Stored product in cache at row ${wipProduct.sheet_row_number}`);
            } else {
                throw new Error(result.error || 'Failed to load product data');
            }
        } catch (error) {
            console.error('❌ Error loading product from Sheets:', error);
            showNotification(`Error loading product: ${error.message}`, 'danger');
            return;
        }

        // Keep the add products modal open - just open edit modal on top
        // The edit modal will appear over the catalog modal
        if (window.editProduct) {
            window.editProduct(wipProduct.sheet_row_number, {
                lookupType: 'row',
                fallbackSku: wipProduct.sku,
                fromWIP: true,  // Flag to indicate this is from WIP review
                wipId: wipId    // Pass WIP ID so we can remove it after saving
            });
        } else {
            showNotification('Product editor not available', 'danger');
        }

    } catch (error) {
        console.error('Error opening WIP product modal:', error);
        showNotification(`Error: ${error.message}`, 'danger');
    }
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
/**
 * Populate supplier filter dropdown with unique suppliers from products
 */
function populateSupplierFilter(products) {
    const supplierFilter = document.getElementById('supplierFilter');
    if (!supplierFilter) return;

    // Get unique suppliers
    const suppliers = [...new Set(products.map(p => p.supplier_name))].sort();

    // Clear existing options except "All Suppliers"
    supplierFilter.innerHTML = '<option value="">All Suppliers</option>';

    // Add supplier options
    suppliers.forEach(supplier => {
        const option = document.createElement('option');
        option.value = supplier;
        option.textContent = `${supplier} (${products.filter(p => p.supplier_name === supplier).length})`;
        supplierFilter.appendChild(option);
    });

    // Show the filter if we have products
    if (products.length > 0) {
        supplierFilter.style.display = 'block';
    }
}

/**
 * Filter missing products by selected supplier
 */
function filterMissingProductsBySupplier() {
    const supplierFilter = document.getElementById('supplierFilter');
    const selectedSupplier = supplierFilter.value;

    let filteredProducts = allMissingProducts;

    if (selectedSupplier) {
        filteredProducts = allMissingProducts.filter(p => p.supplier_name === selectedSupplier);
    }

    // Display filtered products
    displaySupplierProducts(filteredProducts, 'missingProductsGrid');

    // Show count notification
    const message = selectedSupplier
        ? `Showing ${filteredProducts.length} products from ${selectedSupplier}`
        : `Showing all ${filteredProducts.length} products`;

    showNotification(message, 'info');
}

/**
 * Select all missing products (currently displayed)
 */
function selectAllMissingProducts() {
    // Get all products currently displayed in missing products grid
    const grid = document.getElementById('missingProductsGrid');
    const productCards = grid.querySelectorAll('[data-product-id]');

    productCards.forEach(card => {
        const productId = parseInt(card.dataset.productId);
        selectedSupplierProducts.add(productId);
        const checkbox = card.querySelector('input[type="checkbox"]');
        if (checkbox) checkbox.checked = true;
        card.classList.add('selected');
    });

    updateSelectionCount();
}

/**
 * Clear selection for missing products
 */
function clearMissingSelection() {
    selectedSupplierProducts.clear();

    const grid = document.getElementById('missingProductsGrid');
    const productCards = grid.querySelectorAll('[data-product-id]');

    productCards.forEach(card => {
        const checkbox = card.querySelector('input[type="checkbox"]');
        if (checkbox) checkbox.checked = false;
        card.classList.remove('selected');
    });

    updateSelectionCount();
}

/**
 * Add manual products to WIP
 */
async function addManualProductsToWIP() {
    const urlsText = document.getElementById('manualProductUrls').value.trim();
    const skusText = document.getElementById('manualProductSkus').value.trim();

    if (!urlsText) {
        showNotification('Please enter at least one product URL', 'warning');
        return;
    }

    // Parse URLs (newline separated)
    const urls = urlsText
        .split('\n')
        .map(url => url.trim())
        .filter(url => url.length > 0);

    // Parse SKUs (newline separated, optional)
    const skus = skusText
        .split('\n')
        .map(sku => sku.trim())
        .filter(sku => sku.length > 0);

    if (urls.length === 0) {
        showNotification('No valid URLs found', 'warning');
        return;
    }

    // Create product objects
    const products = urls.map((url, index) => ({
        product_url: url,
        sku: skus[index] || `MANUAL-${Date.now()}-${index}`, // Generate SKU if not provided
        product_name: null,
        supplier_name: 'Manual Entry'
    }));

    try {
        showLoading(`Adding ${products.length} product(s) to Work in Progress...`);

        const response = await fetch(`/api/${COLLECTION_NAME}/wip/add-manual`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ products })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to add products to WIP');
        }

        showNotification(`Added ${data.count} product(s) to Work in Progress`, 'success');

        // Clear the form
        document.getElementById('manualProductUrls').value = '';
        document.getElementById('manualProductSkus').value = '';

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
        console.error('Error adding manual products to WIP:', error);
        showNotification(`Error: ${error.message}`, 'danger');
    } finally {
        hideLoading();
    }
}

/**
 * Remove product from WIP after successful review/save
 * This is called from the edit modal's save function when fromWIP is true
 */
async function removeProductFromWIP(wipId) {
    if (!wipId) return;

    try {
        const response = await fetch(`/api/${COLLECTION_NAME}/wip/${wipId}/remove`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            console.log('✅ Product removed from WIP after review');
            // Refresh all WIP tabs to update the UI
            await refreshAllWIPTabs();
        } else {
            console.error('Failed to remove from WIP:', data.error);
        }
    } catch (error) {
        console.error('Error removing product from WIP:', error);
        // Don't show error to user - this is a background cleanup
    }
}

window.showAddProductsModal = showAddProductsModal;
window.searchSupplierBySKU = searchSupplierBySKU;
window.loadMissingProducts = loadMissingProducts;
window.toggleSupplierProduct = toggleSupplierProduct;
window.selectAllSupplierProducts = selectAllSupplierProducts;
window.clearSupplierSelection = clearSupplierSelection;
window.addSelectedToWIP = addSelectedToWIP;
window.loadWIPProducts = loadWIPProducts;
window.filterMissingProductsBySupplier = filterMissingProductsBySupplier;
window.selectAllMissingProducts = selectAllMissingProducts;
window.clearMissingSelection = clearMissingSelection;
window.addManualProductsToWIP = addManualProductsToWIP;
window.removeProductFromWIP = removeProductFromWIP;
