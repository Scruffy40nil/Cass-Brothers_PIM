/**
 * Unassigned Products Manager
 * Handles product triage workflow with persistent selection, bulk assignment,
 * and proper collection naming from config.
 */

const state = {
    page: 1,
    limit: 200,
    search: '',
    vendor: '',
    collection: '',
    status: '',
    minConfidence: 0,
    totalPages: 1,
    loading: false,
    availableCollections: [], // Raw keys from API
    visibleColumns: {
        specSheet: true,
        collections: true,
        description: false,
        comparePrice: false,
        weight: false
    }
};

// Persistent selection - survives filter/page changes
const selectedSkus = new Map(); // Map<sku, {productData, tempCollection}>
let vendorsCache = [];
let productsCache = new Map();

// Collection config from server (key -> {label, icon})
let collectionConfig = {};

// Track temporary (unsaved) collection assignments per SKU
// These are NOT persisted as overrides until explicitly saved
const tempCollectionAssignments = new Map(); // Map<sku, collectionKey>

// ============ Initialization ============

function initializeCollectionConfig() {
    const config = window.UNASSIGNED_PAGE_CONFIG || {};
    const collections = config.collections || [];

    // Build lookup map: key -> {label, icon}
    collections.forEach(entry => {
        collectionConfig[entry.key] = {
            label: entry.label || entry.key,
            icon: entry.icon || 'fa-folder'
        };
    });
}

function getCollectionLabel(key) {
    if (!key || key === 'auto') return 'Auto-detect';
    return collectionConfig[key]?.label || key;
}

function getCollectionIcon(key) {
    return collectionConfig[key]?.icon || 'fa-folder';
}

// ============ Persistence ============

function loadPersistedSettings() {
    try {
        const savedColumns = localStorage.getItem('unassigned_visible_columns');
        if (savedColumns) {
            state.visibleColumns = { ...state.visibleColumns, ...JSON.parse(savedColumns) };
        }

        // Load persisted selection
        const savedSelection = localStorage.getItem('unassigned_selected_skus');
        if (savedSelection) {
            const parsed = JSON.parse(savedSelection);
            parsed.forEach(item => {
                selectedSkus.set(item.sku, item.data || {});
            });
        }

        // Load temp collection assignments
        const savedTemp = localStorage.getItem('unassigned_temp_collections');
        if (savedTemp) {
            const parsed = JSON.parse(savedTemp);
            Object.entries(parsed).forEach(([sku, col]) => {
                tempCollectionAssignments.set(sku, col);
            });
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

function persistTempAssignments() {
    try {
        const obj = {};
        tempCollectionAssignments.forEach((col, sku) => {
            obj[sku] = col;
        });
        localStorage.setItem('unassigned_temp_collections', JSON.stringify(obj));
    } catch (e) {
        console.warn('Failed to persist temp assignments:', e);
    }
}

// ============ Toast Notifications ============

function showToast(message, type = 'success', action = null) {
    document.querySelectorAll('.pim-toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = `pim-toast pim-toast-${type}`;
    toast.innerHTML = `
        <div class="pim-toast-content">
            <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i>
            <span class="pim-toast-message">${message}</span>
            ${action ? `<a href="${action.url}" class="pim-toast-action">${action.text}</a>` : ''}
        </div>
        <button class="pim-toast-close"><i class="fas fa-times"></i></button>
    `;

    document.body.appendChild(toast);
    toast.querySelector('.pim-toast-close').addEventListener('click', () => toast.remove());
    setTimeout(() => toast.remove(), action ? 10000 : 5000);
    requestAnimationFrame(() => toast.classList.add('show'));
}

// ============ Utility Functions ============

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
    if (state.status) params.set('status', state.status);
    if (state.minConfidence) params.set('min_confidence', state.minConfidence / 100);
    return params.toString();
}

function getFirstImage(imagesStr) {
    if (!imagesStr) return '';
    return imagesStr.split(',')[0].trim() || '';
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

/**
 * Parse spec sheet field which may contain multiple URLs separated by <br> tags
 * Returns array of valid URLs (PDFs and images)
 */
function parseSpecSheetUrls(specSheetField) {
    if (!specSheetField) return [];

    // Handle URL-encoded <br> tags (%3Cbr%3E) and regular <br> variants
    const cleaned = specSheetField
        .replace(/%3Cbr%3E/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n');

    // Split by newlines and filter valid URLs
    const urls = cleaned.split('\n')
        .map(url => url.trim())
        .filter(url => {
            if (!url) return false;
            // Basic URL validation - must start with http/https
            try {
                const parsed = new URL(url);
                return parsed.protocol === 'http:' || parsed.protocol === 'https:';
            } catch {
                return false;
            }
        });

    return urls;
}

/**
 * Get the first valid spec sheet URL (prefer PDFs over images)
 */
function getFirstSpecSheetUrl(specSheetField) {
    const urls = parseSpecSheetUrls(specSheetField);
    if (urls.length === 0) return null;

    // Prefer PDF files
    const pdfUrl = urls.find(url => url.toLowerCase().includes('.pdf'));
    if (pdfUrl) return pdfUrl;

    // Fall back to first URL
    return urls[0];
}

/**
 * Render spec sheet links - shows all available URLs
 */
function renderSpecSheetLinks(specSheetField) {
    const urls = parseSpecSheetUrls(specSheetField);
    if (urls.length === 0) return '<span class="text-muted">-</span>';

    if (urls.length === 1) {
        const url = urls[0];
        const isPdf = url.toLowerCase().includes('.pdf');
        return `<a href="${url}" target="_blank" class="btn btn-sm btn-outline-secondary" title="${url}">
            <i class="fas ${isPdf ? 'fa-file-pdf' : 'fa-image'}"></i>
        </a>`;
    }

    // Multiple URLs - show dropdown

    let dropdown = `
        <div class="dropdown d-inline-block">
            <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown">
                <i class="fas fa-file-alt"></i>
                <span class="badge bg-secondary ms-1">${urls.length}</span>
            </button>
            <ul class="dropdown-menu">`;

    urls.forEach((url, idx) => {
        const isPdf = url.toLowerCase().includes('.pdf');
        const filename = url.split('/').pop().split('?')[0] || `File ${idx + 1}`;
        const truncatedName = filename.length > 30 ? filename.substring(0, 27) + '...' : filename;
        dropdown += `
            <li>
                <a class="dropdown-item" href="${url}" target="_blank">
                    <i class="fas ${isPdf ? 'fa-file-pdf text-danger' : 'fa-image text-primary'} me-2"></i>
                    ${truncatedName}
                </a>
            </li>`;
    });

    dropdown += `</ul></div>`;
    return dropdown;
}

/**
 * Render spec sheet links for detail view - shows full URLs as list
 */
function renderSpecSheetDetailLinks(specSheetField) {
    const urls = parseSpecSheetUrls(specSheetField);
    if (urls.length === 0) return '<span class="text-muted">Not available</span>';

    if (urls.length === 1) {
        const url = urls[0];
        const isPdf = url.toLowerCase().includes('.pdf');
        return `<a href="${url}" target="_blank">
            <i class="fas ${isPdf ? 'fa-file-pdf text-danger' : 'fa-image text-primary'} me-1"></i>
            ${truncateText(url, 50)}
        </a>`;
    }

    // Multiple URLs - show as list
    let html = '<div class="spec-sheet-list">';
    urls.forEach(url => {
        const isPdf = url.toLowerCase().includes('.pdf');
        html += `<div class="mb-1">
            <a href="${url}" target="_blank">
                <i class="fas ${isPdf ? 'fa-file-pdf text-danger' : 'fa-image text-primary'} me-1"></i>
                ${truncateText(url, 50)}
            </a>
        </div>`;
    });
    html += '</div>';
    return html;
}

function updateSummary(total, page, totalPages) {
    const summary = document.getElementById('resultsSummary');
    if (summary) {
        const selectionInfo = selectedSkus.size > 0 ? ` • ${selectedSkus.size} selected` : '';
        summary.textContent = `Showing page ${page} of ${totalPages} – ${total} matching products${selectionInfo}`;
    }
}

// ============ Collection Assignment (Local Only) ============

function getEffectiveCollection(sku, item) {
    // Priority: temp assignment > is_override (persisted) > predicted
    if (tempCollectionAssignments.has(sku)) {
        return tempCollectionAssignments.get(sku);
    }
    return item?.predicted_collection || null;
}

function setTempCollection(sku, collection) {
    if (collection === 'auto' || !collection) {
        tempCollectionAssignments.delete(sku);
    } else {
        tempCollectionAssignments.set(sku, collection);
    }

    // Update cached data if selected
    if (selectedSkus.has(sku)) {
        const data = selectedSkus.get(sku);
        data.tempCollection = collection === 'auto' ? null : collection;
    }

    persistTempAssignments();
    updateMissingCollectionIndicators();
}

// ============ Data Loading ============

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

        if (data.available_collections?.length > 0) {
            state.availableCollections = data.available_collections;
        }

        // Cache product data
        (data.items || []).forEach(item => {
            productsCache.set(item.variant_sku, item);

            // If this SKU is selected, update its cached data
            if (selectedSkus.has(item.variant_sku)) {
                selectedSkus.set(item.variant_sku, item);
            }
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

// ============ Rendering ============

function renderCollectionDropdown(sku, item) {
    const effectiveCollection = getEffectiveCollection(sku, item);
    const isOverride = item?.is_override || false;
    const hasTempAssignment = tempCollectionAssignments.has(sku);
    const isMissing = !effectiveCollection;

    // Use config keys for options but show friendly labels
    const configCollections = Object.keys(collectionConfig);
    const allCollections = configCollections.length > 0
        ? configCollections
        : state.availableCollections;

    let options = `<option value="auto"${!effectiveCollection ? ' selected' : ''}>Auto-detect</option>`;
    allCollections.forEach(col => {
        const selected = col === effectiveCollection ? ' selected' : '';
        const label = getCollectionLabel(col);
        options += `<option value="${col}"${selected}>${label}</option>`;
    });

    const missingClass = isMissing ? 'border-warning' : '';
    const tempClass = hasTempAssignment ? 'border-info' : '';

    return `
        <div class="collection-dropdown-wrapper" data-sku="${sku}">
            <select class="form-select form-select-sm collection-select ${missingClass} ${tempClass}"
                    data-sku="${sku}"
                    style="min-width: 130px; font-size: 0.8rem;">
                ${options}
            </select>
            ${isOverride ? '<i class="fas fa-lock text-success ms-1" title="Saved override"></i>' : ''}
            ${hasTempAssignment && !isOverride ? '<i class="fas fa-pencil-alt text-info ms-1" title="Unsaved assignment"></i>' : ''}
            ${isMissing ? '<i class="fas fa-exclamation-circle text-warning ms-1 missing-collection-icon" title="No collection assigned"></i>' : ''}
        </div>
    `;
}

function renderConfidencePill(value) {
    let level = 'low';
    if (value >= 75) level = 'high';
    else if (value >= 40) level = 'medium';
    return `<span class="confidence-pill ${level}">${value}%</span>`;
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
        const sku = item.variant_sku;
        const isSelected = selectedSkus.has(sku);
        const firstImage = getFirstImage(item.shopify_images);
        const descriptionPreview = truncateText(stripHtml(item.body_html), 120);
        const effectiveCollection = getEffectiveCollection(sku, item);
        const isMissing = !effectiveCollection;

        const tr = document.createElement('tr');
        tr.className = isSelected ? 'table-primary' : '';
        tr.dataset.sku = sku;
        if (isMissing && isSelected) {
            tr.classList.add('missing-collection-row');
        }

        // Build optional columns
        const specSheetCell = state.visibleColumns.specSheet
            ? `<td class="col-spec-sheet">${renderSpecSheetLinks(item.shopify_spec_sheet)}</td>`
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
                <input type="checkbox" class="form-check-input row-checkbox" data-sku="${sku}" ${isSelected ? 'checked' : ''}>
            </td>
            <td>
                ${renderCollectionDropdown(sku, item)}
            </td>
            <td>
                ${renderConfidencePill(item.confidence_percent || 0)}
            </td>
            <td class="fw-bold">${sku || '-'}</td>
            <td>
                ${firstImage ? `<img src="${firstImage}" alt="" style="width: 50px; height: 50px; object-fit: contain; border-radius: 4px;">` : '<span class="text-muted">-</span>'}
            </td>
            <td>
                <div class="product-title-cell">
                    <span>${item.title || ''}</span>
                    <button class="btn btn-link btn-sm p-0 ms-1 expand-row-btn" data-sku="${sku}" title="Show details">
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

        // Detail row
        const detailRow = document.createElement('tr');
        detailRow.className = 'detail-row';
        detailRow.dataset.parentSku = sku;
        detailRow.style.display = 'none';
        detailRow.innerHTML = `
            <td colspan="15" class="bg-light">
                <div class="p-3">
                    <div class="row g-3">
                        <div class="col-md-6">
                            <h6 class="mb-2"><i class="fas fa-info-circle me-1"></i>Product Details</h6>
                            <table class="table table-sm table-borderless mb-0">
                                <tr><td class="fw-bold" style="width: 140px;">Spec Sheet:</td><td>${renderSpecSheetDetailLinks(item.shopify_spec_sheet)}</td></tr>
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

    setupRowEventHandlers();
    updateTableHeaders();
}

function setupRowEventHandlers() {
    // Checkbox handlers
    document.querySelectorAll('.row-checkbox').forEach(input => {
        input.addEventListener('change', event => {
            const sku = event.target.dataset.sku;
            if (!sku) return;

            const productData = productsCache.get(sku) || {};
            if (event.target.checked) {
                selectedSkus.set(sku, productData);
                event.target.closest('tr').classList.add('table-primary');
            } else {
                selectedSkus.delete(sku);
                event.target.closest('tr').classList.remove('table-primary');
            }
            persistSelection();
            updateSelectionUI();
            updateMissingCollectionIndicators();
        });
    });

    // Collection dropdown handlers - LOCAL ONLY, no API call
    document.querySelectorAll('.collection-select').forEach(select => {
        select.addEventListener('change', event => {
            const sku = event.target.dataset.sku;
            const newCollection = event.target.value;
            if (!sku) return;

            // Update local state only - no API call
            setTempCollection(sku, newCollection);

            // Update visual indicator
            const wrapper = event.target.closest('.collection-dropdown-wrapper');
            if (wrapper) {
                const existingPencil = wrapper.querySelector('.fa-pencil-alt');
                const existingWarning = wrapper.querySelector('.missing-collection-icon');

                if (newCollection && newCollection !== 'auto') {
                    event.target.classList.remove('border-warning');
                    event.target.classList.add('border-info');
                    if (existingWarning) existingWarning.remove();
                    if (!existingPencil && !wrapper.querySelector('.fa-lock')) {
                        const pencil = document.createElement('i');
                        pencil.className = 'fas fa-pencil-alt text-info ms-1';
                        pencil.title = 'Unsaved assignment';
                        wrapper.appendChild(pencil);
                    }
                } else {
                    event.target.classList.add('border-warning');
                    event.target.classList.remove('border-info');
                    if (existingPencil) existingPencil.remove();
                }
            }

            showToast(`Collection set to "${getCollectionLabel(newCollection)}" (not saved as override)`, 'info');
        });
    });

    // Expand row handlers
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
}

function updateTableHeaders() {
    const thead = document.querySelector('.unassigned-table thead tr');
    if (!thead) return;

    const baseHeaders = `
        <th style="width: 40px;"><input type="checkbox" id="selectAllRows"></th>
        <th>Collection</th>
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
    document.getElementById('selectAllRows')?.addEventListener('change', handleSelectAll);
}

// ============ Selection Management ============

function handleSelectAll(event) {
    const checkboxes = document.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = event.target.checked;
        const sku = cb.dataset.sku;
        if (!sku) return;

        const productData = productsCache.get(sku) || {};
        if (event.target.checked) {
            selectedSkus.set(sku, productData);
            cb.closest('tr').classList.add('table-primary');
        } else {
            selectedSkus.delete(sku);
            cb.closest('tr').classList.remove('table-primary');
        }
    });
    persistSelection();
    updateSelectionUI();
    updateMissingCollectionIndicators();
}

function updateSelectionUI() {
    const count = selectedSkus.size;
    const moveBtn = document.getElementById('moveSelectedButton');
    const bulkAssignBtn = document.getElementById('bulkAssignButton');
    const clearSelectionBtn = document.getElementById('clearSelectionButton');
    const selectionBadge = document.getElementById('selectionBadge');

    if (moveBtn) moveBtn.disabled = count === 0;
    if (bulkAssignBtn) bulkAssignBtn.disabled = count === 0;
    if (clearSelectionBtn) clearSelectionBtn.style.display = count > 0 ? 'inline-block' : 'none';
    if (selectionBadge) {
        selectionBadge.textContent = count;
        selectionBadge.style.display = count > 0 ? 'inline-block' : 'none';
    }

    const summary = document.getElementById('resultsSummary');
    if (summary && summary.textContent) {
        const base = summary.textContent.split('•')[0].trim();
        summary.textContent = count > 0 ? `${base} • ${count} selected` : base;
    }
}

function updateMissingCollectionIndicators() {
    // Update row highlighting for selected items missing collection
    document.querySelectorAll('tr[data-sku]').forEach(row => {
        const sku = row.dataset.sku;
        if (!sku || row.classList.contains('detail-row')) return;

        const isSelected = selectedSkus.has(sku);
        const item = productsCache.get(sku) || selectedSkus.get(sku);
        const effectiveCollection = getEffectiveCollection(sku, item);

        row.classList.toggle('missing-collection-row', isSelected && !effectiveCollection);
    });
}

function clearSelection() {
    selectedSkus.clear();
    tempCollectionAssignments.clear();
    persistSelection();
    persistTempAssignments();

    document.querySelectorAll('.row-checkbox').forEach(cb => {
        cb.checked = false;
        cb.closest('tr')?.classList.remove('table-primary');
        cb.closest('tr')?.classList.remove('missing-collection-row');
    });

    const selectAll = document.getElementById('selectAllRows');
    if (selectAll) selectAll.checked = false;

    updateSelectionUI();
    showToast('Selection cleared', 'info');
}

function togglePaginationButtons() {
    document.getElementById('prevPageBtn').disabled = state.page <= 1;
    document.getElementById('nextPageBtn').disabled = state.page >= state.totalPages;
}

// ============ SKU Collection Map ============

function getSkuCollectionMap() {
    const skuCollections = {};

    // For selected SKUs, get their effective collection
    selectedSkus.forEach((data, sku) => {
        const effectiveCollection = getEffectiveCollection(sku, data);
        if (effectiveCollection) {
            skuCollections[sku] = effectiveCollection;
        }
    });

    // Also check current page dropdowns for non-selected items that might be in selection
    document.querySelectorAll('.collection-select').forEach(select => {
        const sku = select.dataset.sku;
        const collection = select.value;
        if (sku && collection && collection !== 'auto' && selectedSkus.has(sku)) {
            skuCollections[sku] = collection;
        }
    });

    return skuCollections;
}

// ============ Setup Functions ============

function setupFilters() {
    document.getElementById('searchInput').addEventListener('input', debounce(e => {
        state.search = e.target.value.trim();
        state.page = 1;
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

    document.getElementById('statusFilter').addEventListener('change', e => {
        state.status = e.target.value;
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
                loadProducts();
            }
        });
    });
}

function setupBulkAssign() {
    const bulkAssignBtn = document.getElementById('bulkAssignButton');
    const bulkAssignSelect = document.getElementById('bulkAssignCollection');
    const applyBulkBtn = document.getElementById('applyBulkAssign');
    const saveOverridesCheckbox = document.getElementById('saveAsOverrides');

    if (!bulkAssignBtn) return;

    bulkAssignBtn.addEventListener('click', () => {
        if (bulkAssignSelect) {
            bulkAssignSelect.innerHTML = '<option value="">Choose collection...</option>';

            // Use config collections with friendly names
            const configCollections = Object.keys(collectionConfig);
            const collectionsToUse = configCollections.length > 0
                ? configCollections
                : state.availableCollections;

            collectionsToUse.forEach(col => {
                const opt = document.createElement('option');
                opt.value = col;
                opt.textContent = getCollectionLabel(col);
                bulkAssignSelect.appendChild(opt);
            });
        }

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

        const saveAsOverrides = saveOverridesCheckbox?.checked || false;

        applyBulkBtn.disabled = true;
        applyBulkBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Applying...';

        try {
            if (saveAsOverrides) {
                // Save as permanent overrides via API
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
                            tempCollectionAssignments.delete(sku);
                        } else {
                            errorCount++;
                        }
                    } catch (e) {
                        errorCount++;
                    }
                }

                persistTempAssignments();
                document.getElementById('bulkAssignPanel').style.display = 'none';
                loadProducts();

                const label = getCollectionLabel(collection);
                if (errorCount === 0) {
                    showToast(`Saved ${successCount} overrides to "${label}"`, 'success');
                } else {
                    showToast(`Saved ${successCount} overrides, ${errorCount} failed`, 'warning');
                }
            } else {
                // Local assignment only (for quick moves)
                skusToUpdate.forEach(sku => {
                    setTempCollection(sku, collection);
                });

                document.getElementById('bulkAssignPanel').style.display = 'none';
                loadProducts();

                const label = getCollectionLabel(collection);
                showToast(`Assigned ${skusToUpdate.length} products to "${label}" (not saved as overrides)`, 'success');
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
    // Populate collection filter dropdown
    const select = document.getElementById('collectionFilter');
    const configCollections = Object.keys(collectionConfig);
    configCollections.forEach(key => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = getCollectionLabel(key);
        select.appendChild(opt);
    });

    document.getElementById('moveSelectedButton').addEventListener('click', showMoveModal);
    document.getElementById('confirmMoveButton').addEventListener('click', performMove);
}

function showMoveModal() {
    const skuCollections = getSkuCollectionMap();
    const selectedList = Array.from(selectedSkus.keys());
    const skusWithoutCollection = selectedList.filter(sku => !skuCollections[sku]);
    const skusWithCollection = selectedList.filter(sku => skuCollections[sku]);

    // Update modal content
    document.getElementById('selectedCountLabel').textContent = selectedSkus.size;
    document.getElementById('readyToMoveCount').textContent = skusWithCollection.length;

    // Build warning content with inline fixes
    const warningDiv = document.getElementById('skusWithoutCollectionWarning');
    const skuListDiv = document.getElementById('missingCollectionSkuList');

    if (skusWithoutCollection.length > 0) {
        warningDiv.style.display = 'block';
        warningDiv.querySelector('.missing-count').textContent = skusWithoutCollection.length;

        // Build list with inline collection selectors
        let listHtml = '<div class="missing-sku-list mt-2" style="max-height: 200px; overflow-y: auto;">';
        skusWithoutCollection.forEach(sku => {
            const item = productsCache.get(sku) || selectedSkus.get(sku) || {};
            const title = truncateText(item.title || sku, 40);

            const configCollections = Object.keys(collectionConfig);
            const collectionsToUse = configCollections.length > 0
                ? configCollections
                : state.availableCollections;

            let options = '<option value="">Select...</option>';
            collectionsToUse.forEach(col => {
                options += `<option value="${col}">${getCollectionLabel(col)}</option>`;
            });

            listHtml += `
                <div class="d-flex align-items-center gap-2 mb-2 p-2 bg-light rounded">
                    <i class="fas fa-exclamation-circle text-warning"></i>
                    <span class="flex-grow-1 small">${title}</span>
                    <select class="form-select form-select-sm modal-collection-fix" data-sku="${sku}" style="width: 140px;">
                        ${options}
                    </select>
                </div>`;
        });
        listHtml += '</div>';

        skuListDiv.innerHTML = listHtml;

        // Setup inline fix handlers
        document.querySelectorAll('.modal-collection-fix').forEach(select => {
            select.addEventListener('change', e => {
                const sku = e.target.dataset.sku;
                const col = e.target.value;
                if (sku && col) {
                    setTempCollection(sku, col);
                    e.target.closest('.d-flex').classList.add('bg-success-subtle');
                    e.target.closest('.d-flex').querySelector('.fa-exclamation-circle')
                        ?.classList.replace('text-warning', 'text-success');

                    // Update counts
                    updateModalCounts();
                }
            });
        });
    } else {
        warningDiv.style.display = 'none';
        skuListDiv.innerHTML = '';
    }

    // Update confirm button state
    updateMoveButtonState();

    const modal = new bootstrap.Modal(document.getElementById('moveModal'));
    modal.show();
}

function updateModalCounts() {
    const skuCollections = getSkuCollectionMap();
    const selectedList = Array.from(selectedSkus.keys());
    const skusWithCollection = selectedList.filter(sku => skuCollections[sku]);
    const skusWithoutCollection = selectedList.filter(sku => !skuCollections[sku]);

    document.getElementById('readyToMoveCount').textContent = skusWithCollection.length;

    const warningDiv = document.getElementById('skusWithoutCollectionWarning');
    if (skusWithoutCollection.length === 0) {
        warningDiv.style.display = 'none';
    } else {
        warningDiv.querySelector('.missing-count').textContent = skusWithoutCollection.length;
    }

    updateMoveButtonState();
}

function updateMoveButtonState() {
    const skuCollections = getSkuCollectionMap();
    const selectedList = Array.from(selectedSkus.keys());
    const skusWithCollection = selectedList.filter(sku => skuCollections[sku]);

    const btn = document.getElementById('confirmMoveButton');
    btn.disabled = skusWithCollection.length === 0;
}

async function performMove() {
    const skuCollections = getSkuCollectionMap();
    const selectedList = Array.from(selectedSkus.keys());
    const skusToMove = selectedList.filter(sku => skuCollections[sku]);

    if (skusToMove.length === 0) {
        showToast('No SKUs ready to move. Please assign collections first.', 'error');
        return;
    }

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

        // Build summary with friendly names
        const collectionCounts = {};
        skusToMove.forEach(sku => {
            const col = skuCollections[sku];
            const label = getCollectionLabel(col);
            collectionCounts[label] = (collectionCounts[label] || 0) + 1;
        });
        const summary = Object.entries(collectionCounts)
            .map(([label, count]) => `${count} to ${label}`)
            .join(', ');

        // Clear moved items from selection
        skusToMove.forEach(sku => {
            selectedSkus.delete(sku);
            tempCollectionAssignments.delete(sku);
        });
        persistSelection();
        persistTempAssignments();

        loadProducts();

        showToast(
            `Moved ${data.moved_count} SKU(s) to Processing Queue (${summary})`,
            'success',
            { url: '/processing-queue', text: 'View in Processing Queue →' }
        );
    } catch (error) {
        console.error(error);
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-share me-1"></i>Move to Queue';
    }
}

function setupRefreshButton() {
    document.getElementById('refreshButton').addEventListener('click', () => {
        loadProducts();
    });
}

// ============ Main ============

document.addEventListener('DOMContentLoaded', () => {
    initializeCollectionConfig();
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
