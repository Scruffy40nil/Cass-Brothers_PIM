const state = {
    page: 1,
    limit: 200,
    search: '',
    vendor: '',
    collection: '',
    minConfidence: 0,
    totalPages: 1,
    loading: false,
    availableCollections: [],
    // Column visibility settings (persisted to localStorage)
    visibleColumns: {
        specSheet: true,
        collections: true,
        description: false,
        comparePrice: false,
        weight: false
    }
};

// Persistent selection that survives filter/page changes
const selectedSkus = new Map(); // Map<sku, productData> for persistent selection
let vendorsCache = [];
let productsCache = new Map(); // Cache product data for selected items

// Load persisted settings
function loadPersistedSettings() {
    try {
        const savedColumns = localStorage.getItem('unassigned_visible_columns');
        if (savedColumns) {
            state.visibleColumns = { ...state.visibleColumns, ...JSON.parse(savedColumns) };
        }
        const savedSelection = localStorage.getItem('unassigned_selected_skus');
        if (savedSelection) {
            const parsed = JSON.parse(savedSelection);
            parsed.forEach(item => selectedSkus.set(item.sku, item.data));
        }
    } catch (e) {
        console.warn('Failed to load persisted settings:', e);
    }
}

function persistColumnSettings() {
    try {
        localStorage.setItem('unassigned_visible_columns', JSON.stringify(state.visibleColumns));
    } catch (e) {
        console.warn('Failed to persist column settings:', e);
    }
}

function persistSelection() {
    try {
        const toSave = Array.from(selectedSkus.entries()).map(([sku, data]) => ({ sku, data }));
        localStorage.setItem('unassigned_selected_skus', JSON.stringify(toSave));
    } catch (e) {
        console.warn('Failed to persist selection:', e);
    }
}

function updateSummary(total, page, totalPages) {
    const summary = document.getElementById('resultsSummary');
    if (summary) {
        const selectionInfo = selectedSkus.size > 0 ? ` • ${selectedSkus.size} selected` : '';
        summary.textContent = `Showing page ${page} of ${totalPages} – ${total} matching products${selectionInfo}`;
    }
}

function debounce(fn, delay = 400) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}

function buildQuery() {
    const params = new URLSearchParams();
    params.set('page', state.page);
    params.set('limit', state.limit);
    if (state.search) params.set('search', state.search);
    if (state.vendor) params.set('vendor', state.vendor);
    if (state.collection) params.set('collection', state.collection);
    if (state.minConfidence) params.set('min_confidence', state.minConfidence / 100);
    return params.toString();
}

// Toast notification system
function showToast(message, type = 'success', action = null) {
    // Remove existing toasts
    document.querySelectorAll('.pim-toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = `pim-toast pim-toast-${type}`;
    toast.innerHTML = `
        <div class="pim-toast-content">
            <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
            <span class="pim-toast-message">${message}</span>
            ${action ? `<a href="${action.url}" class="pim-toast-action">${action.text}</a>` : ''}
        </div>
        <button class="pim-toast-close"><i class="fas fa-times"></i></button>
    `;

    document.body.appendChild(toast);

    // Close button
    toast.querySelector('.pim-toast-close').addEventListener('click', () => toast.remove());

    // Auto-dismiss after 8 seconds (longer if there's an action link)
    setTimeout(() => toast.remove(), action ? 10000 : 5000);

    // Animate in
    requestAnimationFrame(() => toast.classList.add('show'));
}

async function loadProducts() {
    if (state.loading) return;
    state.loading = true;
    document.getElementById('productsTableBody').innerHTML = `
        <tr>
            <td colspan="15" class="text-center py-5 text-muted">
                <div class="spinner-border text-primary" role="status"></div>
                <div class="mt-2">Loading...</div>
            </td>
        </tr>`;
    try {
        const response = await fetch(`/api/unassigned-products?${buildQuery()}`);
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Failed to load products');
        }
        // Store available collections for dropdowns
        if (data.available_collections && data.available_collections.length > 0) {
            state.availableCollections = data.available_collections;
        }

        // Cache product data for potential selection
        (data.items || []).forEach(item => {
            productsCache.set(item.variant_sku, item);
        });

        renderProducts(data.items || []);
        state.totalPages = data.total_pages || 1;
        updateSummary(data.total || 0, data.page || 1, state.totalPages);
        updateVendorOptions(data.vendors || []);
        togglePaginationButtons();
        updateSelectionUI();
    } catch (error) {
        console.error(error);
        document.getElementById('productsTableBody').innerHTML = `
            <tr>
                <td colspan="15" class="text-center text-danger py-4">
                    ${error.message}
                </td>
            </tr>`;
    } finally {
        state.loading = false;
    }
}

function updateVendorOptions(vendors) {
    if (!vendors.length || vendors.join(',') === vendorsCache.join(',')) {
        return;
    }
    vendorsCache = vendors;
    const select = document.getElementById('vendorFilter');
    const current = select.value;
    select.innerHTML = '<option value="">All vendors</option>';
    vendors.forEach(v => {
        const option = document.createElement('option');
        option.value = v;
        option.textContent = v;
        select.appendChild(option);
    });
    select.value = current;
}

function getFirstImage(imagesStr) {
    if (!imagesStr) return '';
    const first = imagesStr.split(',')[0].trim();
    return first || '';
}

function renderCollectionDropdown(sku, currentCollection, isOverride) {
    const collections = state.availableCollections || [];

    let options = `<option value="auto"${!currentCollection ? ' selected' : ''}>Auto-detect</option>`;
    collections.forEach(col => {
        const selected = col === currentCollection ? ' selected' : '';
        options += `<option value="${col}"${selected}>${col}</option>`;
    });

    return `
        <select class="form-select form-select-sm collection-override-select"
                data-sku="${sku}"
                data-original="${currentCollection || ''}"
                style="min-width: 110px; font-size: 0.8rem;">
            ${options}
        </select>
        ${isOverride ? '<i class="fas fa-user-edit text-success ms-1" title="Manual override"></i>' : ''}
    `;
}

async function handleCollectionOverride(sku, newCollection) {
    try {
        const response = await fetch('/api/unassigned-products/override', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sku, collection: newCollection })
        });
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Failed to update collection');
        }
        showToast(`Collection updated for ${sku}`, 'success');
    } catch (error) {
        console.error('Error updating collection:', error);
        showToast('Failed to update collection: ' + error.message, 'error');
        loadProducts();
    }
}

function truncateText(text, maxLength = 100) {
    if (!text || text.length <= maxLength) return text || '';
    return text.substring(0, maxLength) + '...';
}

function stripHtml(html) {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

function renderProducts(items) {
    const tbody = document.getElementById('productsTableBody');
    tbody.innerHTML = '';

    if (!items.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="15" class="text-center text-muted py-4">
                    No products match your filters.
                </td>
            </tr>`;
        return;
    }

    items.forEach(item => {
        const selected = selectedSkus.has(item.variant_sku);
        const firstImage = getFirstImage(item.shopify_images);
        const descriptionPreview = truncateText(stripHtml(item.body_html), 120);

        const tr = document.createElement('tr');
        tr.className = selected ? 'table-primary' : '';
        tr.dataset.sku = item.variant_sku;

        // Build optional column cells based on visibility
        const specSheetCell = state.visibleColumns.specSheet
            ? `<td class="col-spec-sheet">${item.shopify_spec_sheet ? `<a href="${item.shopify_spec_sheet}" target="_blank" class="btn btn-sm btn-outline-secondary"><i class="fas fa-file-pdf"></i></a>` : '<span class="text-muted">-</span>'}</td>`
            : '';
        const collectionsCell = state.visibleColumns.collections
            ? `<td class="col-collections"><small class="text-muted">${truncateText(item.shopify_collections, 50) || '-'}</small></td>`
            : '';
        const descriptionCell = state.visibleColumns.description
            ? `<td class="col-description"><small class="text-muted">${descriptionPreview || '-'}</small></td>`
            : '';
        const comparePriceCell = state.visibleColumns.comparePrice
            ? `<td class="col-compare-price">${item.shopify_compare_price || '-'}</td>`
            : '';
        const weightCell = state.visibleColumns.weight
            ? `<td class="col-weight">${item.shopify_weight || '-'}</td>`
            : '';

        tr.innerHTML = `
            <td>
                <input type="checkbox" class="form-check-input row-checkbox" data-sku="${item.variant_sku}" ${selected ? 'checked' : ''}>
            </td>
            <td>
                ${renderCollectionDropdown(item.variant_sku, item.predicted_collection, item.is_override)}
            </td>
            <td>
                ${renderConfidencePill(item.confidence_percent || 0)}
            </td>
            <td class="fw-bold">${item.variant_sku || '-'}</td>
            <td>
                ${firstImage ? `<img src="${firstImage}" alt="" style="width: 50px; height: 50px; object-fit: contain; border-radius: 4px;">` : '<span class="text-muted">-</span>'}
            </td>
            <td>
                <div class="product-title-cell">
                    <span>${item.title || ''}</span>
                    <button class="btn btn-link btn-sm p-0 ms-1 expand-row-btn" data-sku="${item.variant_sku}" title="Show details">
                        <i class="fas fa-chevron-down"></i>
                    </button>
                </div>
                <small class="text-muted">${item.handle || ''}</small>
            </td>
            <td>${item.vendor || '-'}</td>
            <td>${item.shopify_status || '-'}</td>
            <td>${item.shopify_price || '-'}</td>
            ${specSheetCell}
            ${collectionsCell}
            ${descriptionCell}
            ${comparePriceCell}
            ${weightCell}
            <td>
                ${item.shopify_product_url ? `<a href="${item.shopify_product_url}" target="_blank"><i class="fas fa-external-link-alt"></i></a>` : '-'}
            </td>`;
        tbody.appendChild(tr);

        // Add expandable detail row (hidden by default)
        const detailRow = document.createElement('tr');
        detailRow.className = 'detail-row';
        detailRow.dataset.parentSku = item.variant_sku;
        detailRow.style.display = 'none';
        detailRow.innerHTML = `
            <td colspan="15" class="bg-light">
                <div class="p-3">
                    <div class="row g-3">
                        <div class="col-md-6">
                            <h6 class="mb-2"><i class="fas fa-info-circle me-1"></i>Product Details</h6>
                            <table class="table table-sm table-borderless mb-0">
                                <tr><td class="fw-bold" style="width: 140px;">Spec Sheet:</td><td>${item.shopify_spec_sheet ? `<a href="${item.shopify_spec_sheet}" target="_blank">${truncateText(item.shopify_spec_sheet, 60)}</a>` : '<span class="text-muted">Not available</span>'}</td></tr>
                                <tr><td class="fw-bold">Shopify Collections:</td><td>${item.shopify_collections || '<span class="text-muted">None</span>'}</td></tr>
                                <tr><td class="fw-bold">Status:</td><td>${item.shopify_status || '-'}</td></tr>
                                <tr><td class="fw-bold">Price:</td><td>${item.shopify_price || '-'}${item.shopify_compare_price ? ` <small class="text-muted">(was ${item.shopify_compare_price})</small>` : ''}</td></tr>
                                <tr><td class="fw-bold">Weight:</td><td>${item.shopify_weight || '-'}</td></tr>
                            </table>
                        </div>
                        <div class="col-md-6">
                            <h6 class="mb-2"><i class="fas fa-align-left me-1"></i>Description Preview</h6>
                            <div class="description-preview p-2 bg-white border rounded" style="max-height: 150px; overflow-y: auto; font-size: 0.85rem;">
                                ${item.body_html ? stripHtml(item.body_html).substring(0, 500) + (stripHtml(item.body_html).length > 500 ? '...' : '') : '<span class="text-muted">No description</span>'}
                            </div>
                        </div>
                    </div>
                </div>
            </td>`;
        tbody.appendChild(detailRow);
    });

    // Setup checkbox handlers
    document.querySelectorAll('.row-checkbox').forEach(input => {
        input.addEventListener('change', event => {
            const sku = event.target.dataset.sku;
            if (!sku) return;

            const productData = productsCache.get(sku);
            if (event.target.checked) {
                selectedSkus.set(sku, productData || {});
                event.target.closest('tr').classList.add('table-primary');
            } else {
                selectedSkus.delete(sku);
                event.target.closest('tr').classList.remove('table-primary');
            }
            persistSelection();
            updateSelectionUI();
        });
    });

    // Setup collection override dropdown handlers
    document.querySelectorAll('.collection-override-select').forEach(select => {
        select.addEventListener('change', event => {
            const sku = event.target.dataset.sku;
            const newCollection = event.target.value;
            if (!sku) return;
            handleCollectionOverride(sku, newCollection);
        });
    });

    // Setup expand row handlers
    document.querySelectorAll('.expand-row-btn').forEach(btn => {
        btn.addEventListener('click', event => {
            event.preventDefault();
            const sku = btn.dataset.sku;
            const detailRow = document.querySelector(`.detail-row[data-parent-sku="${sku}"]`);
            const icon = btn.querySelector('i');

            if (detailRow.style.display === 'none') {
                detailRow.style.display = 'table-row';
                icon.className = 'fas fa-chevron-up';
            } else {
                detailRow.style.display = 'none';
                icon.className = 'fas fa-chevron-down';
            }
        });
    });

    updateTableHeaders();
}

function updateTableHeaders() {
    const thead = document.querySelector('.unassigned-table thead tr');
    if (!thead) return;

    // Update header visibility based on column settings
    const headers = thead.querySelectorAll('th');
    // Headers: checkbox, predicted, confidence, sku, image, title, vendor, status, price, [specSheet], [collections], [description], [comparePrice], [weight], shopify

    // The optional columns are inserted dynamically, so we need to rebuild
    const baseHeaders = `
        <th style="width: 40px;"><input type="checkbox" id="selectAllRows"></th>
        <th>Predicted</th>
        <th>Confidence</th>
        <th>Variant SKU</th>
        <th style="width: 60px;">Image</th>
        <th>Title</th>
        <th>Vendor</th>
        <th>Status</th>
        <th>Price</th>
        ${state.visibleColumns.specSheet ? '<th class="col-spec-sheet">Spec Sheet</th>' : ''}
        ${state.visibleColumns.collections ? '<th class="col-collections">Shopify Collections</th>' : ''}
        ${state.visibleColumns.description ? '<th class="col-description">Description</th>' : ''}
        ${state.visibleColumns.comparePrice ? '<th class="col-compare-price">Compare Price</th>' : ''}
        ${state.visibleColumns.weight ? '<th class="col-weight">Weight</th>' : ''}
        <th>Shopify</th>
    `;

    thead.innerHTML = baseHeaders;

    // Re-attach select all handler
    document.getElementById('selectAllRows')?.addEventListener('change', handleSelectAll);
}

function handleSelectAll(event) {
    const checkboxes = document.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = event.target.checked;
        const sku = cb.dataset.sku;
        if (!sku) return;

        const productData = productsCache.get(sku);
        if (event.target.checked) {
            selectedSkus.set(sku, productData || {});
            cb.closest('tr').classList.add('table-primary');
        } else {
            selectedSkus.delete(sku);
            cb.closest('tr').classList.remove('table-primary');
        }
    });
    persistSelection();
    updateSelectionUI();
}

function renderConfidencePill(value) {
    let level = 'low';
    if (value >= 75) level = 'high';
    else if (value >= 40) level = 'medium';
    return `<span class="confidence-pill ${level}">${value}%</span>`;
}

function togglePaginationButtons() {
    document.getElementById('prevPageBtn').disabled = state.page <= 1;
    document.getElementById('nextPageBtn').disabled = state.page >= state.totalPages;
}

function updateSelectionUI() {
    const count = selectedSkus.size;
    const moveBtn = document.getElementById('moveSelectedButton');
    const bulkAssignBtn = document.getElementById('bulkAssignButton');
    const clearSelectionBtn = document.getElementById('clearSelectionButton');
    const selectionBadge = document.getElementById('selectionBadge');

    moveBtn.disabled = count === 0;
    if (bulkAssignBtn) bulkAssignBtn.disabled = count === 0;
    if (clearSelectionBtn) clearSelectionBtn.style.display = count > 0 ? 'inline-block' : 'none';
    if (selectionBadge) {
        selectionBadge.textContent = count;
        selectionBadge.style.display = count > 0 ? 'inline-block' : 'none';
    }

    // Update summary
    const summary = document.getElementById('resultsSummary');
    if (summary && summary.textContent) {
        const base = summary.textContent.split('•')[0].trim();
        summary.textContent = count > 0 ? `${base} • ${count} selected` : base;
    }
}

function clearSelection() {
    selectedSkus.clear();
    persistSelection();
    document.querySelectorAll('.row-checkbox').forEach(cb => {
        cb.checked = false;
        cb.closest('tr')?.classList.remove('table-primary');
    });
    document.getElementById('selectAllRows').checked = false;
    updateSelectionUI();
    showToast('Selection cleared', 'info');
}

function setupFilters() {
    document.getElementById('searchInput').addEventListener('input', debounce(e => {
        state.search = e.target.value.trim();
        state.page = 1;
        // Don't reset selection on filter change!
        loadProducts();
    }));

    document.getElementById('vendorFilter').addEventListener('change', e => {
        state.vendor = e.target.value;
        state.page = 1;
        loadProducts();
    });

    document.getElementById('collectionFilter').addEventListener('change', e => {
        state.collection = e.target.value;
        state.page = 1;
        loadProducts();
    });

    document.getElementById('confidenceFilter').addEventListener('change', e => {
        state.minConfidence = parseInt(e.target.value || '0', 10);
        state.page = 1;
        loadProducts();
    });
}

function setupPagination() {
    document.getElementById('prevPageBtn').addEventListener('click', () => {
        if (state.page > 1) {
            state.page -= 1;
            // Don't reset selection on page change!
            loadProducts();
        }
    });
    document.getElementById('nextPageBtn').addEventListener('click', () => {
        if (state.page < state.totalPages) {
            state.page += 1;
            loadProducts();
        }
    });
}

function setupSelectionControls() {
    document.getElementById('selectAllRows')?.addEventListener('change', handleSelectAll);

    // Clear selection button
    document.getElementById('clearSelectionButton')?.addEventListener('click', clearSelection);
}

function setupColumnToggles() {
    const toggles = document.querySelectorAll('.column-toggle');
    toggles.forEach(toggle => {
        const column = toggle.dataset.column;
        if (column && state.visibleColumns.hasOwnProperty(column)) {
            toggle.checked = state.visibleColumns[column];
        }

        toggle.addEventListener('change', e => {
            const col = e.target.dataset.column;
            if (col && state.visibleColumns.hasOwnProperty(col)) {
                state.visibleColumns[col] = e.target.checked;
                persistColumnSettings();
                loadProducts(); // Reload to update table
            }
        });
    });
}

function getSkuCollectionMap() {
    // Build a map of SKU -> collection from the current dropdown values
    const skuCollections = {};
    document.querySelectorAll('.collection-override-select').forEach(select => {
        const sku = select.dataset.sku;
        const collection = select.value;
        if (sku && collection && collection !== 'auto') {
            skuCollections[sku] = collection;
        }
    });

    // Also include selected SKUs that might not be on the current page
    selectedSkus.forEach((data, sku) => {
        if (!skuCollections[sku] && data.predicted_collection) {
            skuCollections[sku] = data.predicted_collection;
        }
    });

    return skuCollections;
}

function setupBulkAssign() {
    const bulkAssignBtn = document.getElementById('bulkAssignButton');
    const bulkAssignSelect = document.getElementById('bulkAssignCollection');
    const applyBulkBtn = document.getElementById('applyBulkAssign');

    if (!bulkAssignBtn) return;

    bulkAssignBtn.addEventListener('click', () => {
        // Populate the bulk assign dropdown
        if (bulkAssignSelect) {
            bulkAssignSelect.innerHTML = '<option value="">Choose collection...</option>';
            state.availableCollections.forEach(col => {
                const opt = document.createElement('option');
                opt.value = col;
                opt.textContent = col;
                bulkAssignSelect.appendChild(opt);
            });
        }

        // Show the bulk assign panel
        const panel = document.getElementById('bulkAssignPanel');
        if (panel) {
            panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
        }
    });

    applyBulkBtn?.addEventListener('click', async () => {
        const collection = bulkAssignSelect?.value;
        if (!collection) {
            showToast('Please select a collection', 'error');
            return;
        }

        const skusToUpdate = Array.from(selectedSkus.keys());
        if (skusToUpdate.length === 0) {
            showToast('No products selected', 'error');
            return;
        }

        applyBulkBtn.disabled = true;
        applyBulkBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Applying...';

        try {
            // Apply collection to all selected SKUs
            let successCount = 0;
            let errorCount = 0;

            for (const sku of skusToUpdate) {
                try {
                    const response = await fetch('/api/unassigned-products/override', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sku, collection })
                    });
                    const data = await response.json();
                    if (data.success) {
                        successCount++;
                        // Update the cached product data
                        const cached = selectedSkus.get(sku);
                        if (cached) {
                            cached.predicted_collection = collection;
                            cached.is_override = true;
                        }
                    } else {
                        errorCount++;
                    }
                } catch (e) {
                    errorCount++;
                }
            }

            // Hide panel and reload
            document.getElementById('bulkAssignPanel').style.display = 'none';
            loadProducts();

            if (errorCount === 0) {
                showToast(`Assigned ${successCount} products to "${collection}"`, 'success');
            } else {
                showToast(`Assigned ${successCount} products, ${errorCount} failed`, 'warning');
            }
        } catch (error) {
            showToast('Bulk assignment failed: ' + error.message, 'error');
        } finally {
            applyBulkBtn.disabled = false;
            applyBulkBtn.innerHTML = '<i class="fas fa-check me-1"></i>Apply';
        }
    });
}

function setupMoveModal() {
    const config = window.UNASSIGNED_PAGE_CONFIG || {};
    const select = document.getElementById('collectionFilter');
    const collections = config.collections || [];
    collections.forEach(entry => {
        const opt = document.createElement('option');
        opt.value = entry.key;
        opt.textContent = entry.label;
        select.appendChild(opt);
    });

    document.getElementById('moveSelectedButton').addEventListener('click', () => {
        // Get collection assignments for selected SKUs
        const skuCollections = getSkuCollectionMap();
        const selectedList = Array.from(selectedSkus.keys());

        // Check which selected SKUs are missing a collection assignment
        const skusWithoutCollection = selectedList.filter(sku => !skuCollections[sku]);

        // Update modal content to show what will happen
        const countLabel = document.getElementById('selectedCountLabel');
        countLabel.textContent = selectedSkus.size;

        // Show/hide warning about SKUs without collections
        const warningDiv = document.getElementById('skusWithoutCollectionWarning');
        if (warningDiv) {
            if (skusWithoutCollection.length > 0) {
                warningDiv.style.display = 'block';
                warningDiv.innerHTML = `<i class="fas fa-exclamation-triangle me-1"></i>${skusWithoutCollection.length} SKU(s) have "Auto-detect" selected and will be skipped. Please assign a collection first.`;
            } else {
                warningDiv.style.display = 'none';
            }
        }

        const modal = new bootstrap.Modal(document.getElementById('moveModal'));
        modal.show();
    });

    document.getElementById('confirmMoveButton').addEventListener('click', performMove);
}

async function performMove() {
    // Build per-SKU collection assignments from dropdown values and cached data
    const skuCollections = getSkuCollectionMap();
    const selectedList = Array.from(selectedSkus.keys());

    // Filter to only SKUs that have a collection assigned
    const skusToMove = selectedList.filter(sku => skuCollections[sku]);

    if (skusToMove.length === 0) {
        showToast('No SKUs to move. Please ensure each selected product has a collection assigned.', 'error');
        return;
    }

    // Build the payload with per-SKU collections
    const payload = {
        sku_collections: skusToMove.map(sku => ({
            sku: sku,
            collection: skuCollections[sku]
        }))
    };

    const btn = document.getElementById('confirmMoveButton');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Moving...';

    try {
        const response = await fetch('/api/unassigned-products/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Move failed');
        }

        bootstrap.Modal.getInstance(document.getElementById('moveModal')).hide();

        // Build summary of collections
        const collectionCounts = {};
        skusToMove.forEach(sku => {
            const col = skuCollections[sku];
            collectionCounts[col] = (collectionCounts[col] || 0) + 1;
        });
        const summary = Object.entries(collectionCounts)
            .map(([col, count]) => `${count} to ${col}`)
            .join(', ');

        // Clear selection for moved items
        skusToMove.forEach(sku => selectedSkus.delete(sku));
        persistSelection();

        // Reload products
        loadProducts();

        // Show toast with link to Processing Queue
        showToast(
            `Added ${data.moved_count} SKU(s) to Processing Queue (${summary})`,
            'success',
            { url: '/processing-queue', text: 'View in Processing Queue →' }
        );
    } catch (error) {
        console.error(error);
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-share me-1"></i>Add to Queue';
    }
}

function setupRefreshButton() {
    document.getElementById('refreshButton').addEventListener('click', () => {
        loadProducts();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadPersistedSettings();
    setupFilters();
    setupPagination();
    setupSelectionControls();
    setupColumnToggles();
    setupBulkAssign();
    setupMoveModal();
    setupRefreshButton();
    loadProducts();
});
