const state = {
    page: 1,
    limit: 200,
    search: '',
    vendor: '',
    collection: '',
    minConfidence: 0,
    totalPages: 1,
    loading: false,
    availableCollections: []
};

const selectedSkus = new Set();
let vendorsCache = [];

function updateSummary(total, page, totalPages) {
    const summary = document.getElementById('resultsSummary');
    if (summary) {
        summary.textContent = `Showing page ${page} of ${totalPages} – ${total} matching products`;
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

async function loadProducts() {
    if (state.loading) return;
    state.loading = true;
    document.getElementById('productsTableBody').innerHTML = `
        <tr>
            <td colspan="10" class="text-center py-5 text-muted">
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
        renderProducts(data.items || []);
        state.totalPages = data.total_pages || 1;
        updateSummary(data.total || 0, data.page || 1, state.totalPages);
        updateVendorOptions(data.vendors || []);
        togglePaginationButtons();
    } catch (error) {
        console.error(error);
        document.getElementById('productsTableBody').innerHTML = `
            <tr>
                <td colspan="10" class="text-center text-danger py-4">
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
                style="min-width: 100px; font-size: 0.8rem;">
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
        // Show brief success feedback
        console.log(`Collection updated for ${sku}: ${newCollection || 'auto-detect'}`);
    } catch (error) {
        console.error('Error updating collection:', error);
        alert('Failed to update collection: ' + error.message);
        // Reload to revert changes
        loadProducts();
    }
}

function renderProducts(items) {
    const tbody = document.getElementById('productsTableBody');
    tbody.innerHTML = '';
    if (!items.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center text-muted py-4">
                    No products match your filters.
                </td>
            </tr>`;
        return;
    }

    items.forEach(item => {
        const selected = selectedSkus.has(item.variant_sku);
        const firstImage = getFirstImage(item.shopify_images);
        const tr = document.createElement('tr');
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
                <div>${item.title || ''}</div>
                <small class="text-muted">${item.handle || ''}</small>
            </td>
            <td>${item.vendor || '-'}</td>
            <td>${item.shopify_status || '-'}</td>
            <td>${item.shopify_price || '-'}</td>
            <td>
                ${item.shopify_product_url ? `<a href="${item.shopify_product_url}" target="_blank"><i class="fas fa-external-link-alt"></i></a>` : '-'}
            </td>`;
        tbody.appendChild(tr);
    });

    // Setup checkbox handlers
    document.querySelectorAll('.row-checkbox').forEach(input => {
        input.addEventListener('change', event => {
            const sku = event.target.dataset.sku;
            if (!sku) return;
            if (event.target.checked) {
                selectedSkus.add(sku);
            } else {
                selectedSkus.delete(sku);
            }
            updateMoveButtonState();
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

function updateMoveButtonState() {
    const button = document.getElementById('moveSelectedButton');
    button.disabled = selectedSkus.size === 0;
}

function resetSelection() {
    selectedSkus.clear();
    document.getElementById('selectAllRows').checked = false;
    updateMoveButtonState();
}

function setupFilters() {
    document.getElementById('searchInput').addEventListener('input', debounce(e => {
        state.search = e.target.value.trim();
        state.page = 1;
        resetSelection();
        loadProducts();
    }));

    document.getElementById('vendorFilter').addEventListener('change', e => {
        state.vendor = e.target.value;
        state.page = 1;
        resetSelection();
        loadProducts();
    });

    document.getElementById('collectionFilter').addEventListener('change', e => {
        state.collection = e.target.value;
        state.page = 1;
        resetSelection();
        loadProducts();
    });

    document.getElementById('confidenceFilter').addEventListener('change', e => {
        state.minConfidence = parseInt(e.target.value || '0', 10);
        state.page = 1;
        resetSelection();
        loadProducts();
    });
}

function setupPagination() {
    document.getElementById('prevPageBtn').addEventListener('click', () => {
        if (state.page > 1) {
            state.page -= 1;
            resetSelection();
            loadProducts();
        }
    });
    document.getElementById('nextPageBtn').addEventListener('click', () => {
        if (state.page < state.totalPages) {
            state.page += 1;
            resetSelection();
            loadProducts();
        }
    });
}

function setupSelectionControls() {
    document.getElementById('selectAllRows').addEventListener('change', event => {
        const checkboxes = document.querySelectorAll('.row-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = event.target.checked;
            const sku = cb.dataset.sku;
            if (!sku) return;
            if (event.target.checked) {
                selectedSkus.add(sku);
            } else {
                selectedSkus.delete(sku);
            }
        });
        updateMoveButtonState();
    });
}

function setupMoveModal() {
    const config = window.UNASSIGNED_PAGE_CONFIG || {};
    const select = document.getElementById('collectionFilter');
    const targetSelect = document.getElementById('targetCollectionSelect');
    const collections = config.collections || [];
    collections.forEach(entry => {
        const opt = document.createElement('option');
        opt.value = entry.key;
        opt.textContent = entry.label;
        targetSelect.appendChild(opt.cloneNode(true));
        select.appendChild(opt);
    });

    document.getElementById('moveSelectedButton').addEventListener('click', () => {
        const countLabel = document.getElementById('selectedCountLabel');
        countLabel.textContent = selectedSkus.size;
        const modal = new bootstrap.Modal(document.getElementById('moveModal'));
        modal.show();
    });

    document.getElementById('confirmMoveButton').addEventListener('click', performMove);
}

async function performMove() {
    const collectionSelect = document.getElementById('targetCollectionSelect');
    const targetCollection = collectionSelect.value;
    if (!targetCollection) {
        collectionSelect.classList.add('is-invalid');
        return;
    }
    collectionSelect.classList.remove('is-invalid');
    const payload = {
        target_collection: targetCollection,
        skus: Array.from(selectedSkus)
    };
    const btn = document.getElementById('confirmMoveButton');
    btn.disabled = true;
    btn.textContent = 'Moving...';
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
        resetSelection();
        loadProducts();
        alert(`Moved ${data.moved_count} SKU(s) to ${targetCollection}.`);
    } catch (error) {
        console.error(error);
        alert(error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Move Products';
    }
}

function setupRefreshButton() {
    document.getElementById('refreshButton').addEventListener('click', () => {
        loadProducts();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setupFilters();
    setupPagination();
    setupSelectionControls();
    setupMoveModal();
    setupRefreshButton();
    loadProducts();
});
