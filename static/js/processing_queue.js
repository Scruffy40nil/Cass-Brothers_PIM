/**
 * Processing Queue Manager
 * Schema-aware UI that uses the collection schema for proper field rendering,
 * type controls, and validation before approval.
 */

const state = {
    page: 1,
    limit: 50,
    collection: '',
    status: '',
    search: '',
    totalPages: 1,
    loading: false,
    currentItem: null,
    extractedData: null,
    collectionSchema: null  // Cached schema for current item's collection
};

const selectedIds = new Set();
const schemaCache = {}; // Cache schemas by collection name

function debounce(fn, delay = 400) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}

function updateSummary(total, page, totalPages) {
    const summary = document.getElementById('resultsSummary');
    if (summary) {
        summary.textContent = `Showing page ${page} of ${totalPages} - ${total} items in queue`;
    }
}

function updateStats(stats) {
    document.getElementById('statTotal').textContent = stats.total || 0;
    document.getElementById('statPending').textContent = stats.by_status?.pending || 0;
    document.getElementById('statReady').textContent = stats.by_status?.ready || 0;
    document.getElementById('statError').textContent = stats.by_status?.error || 0;
}

function buildQuery() {
    const params = new URLSearchParams();
    params.set('page', state.page);
    params.set('limit', state.limit);
    if (state.collection) params.set('collection', state.collection);
    if (state.status) params.set('status', state.status);
    return params.toString();
}

async function loadQueue() {
    if (state.loading) return;
    state.loading = true;
    document.getElementById('queueTableBody').innerHTML = `
        <tr>
            <td colspan="10" class="text-center py-5 text-muted">
                <div class="spinner-border text-primary" role="status"></div>
                <div class="mt-2">Loading...</div>
            </td>
        </tr>`;
    try {
        const response = await fetch(`/api/processing-queue?${buildQuery()}`);
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Failed to load queue');
        }

        let items = data.items || [];
        if (state.search) {
            const searchLower = state.search.toLowerCase();
            items = items.filter(item =>
                (item.sku || '').toLowerCase().includes(searchLower) ||
                (item.title || '').toLowerCase().includes(searchLower)
            );
        }

        renderQueue(items);
        state.totalPages = data.total_pages || 1;
        updateSummary(data.total || 0, data.page || 1, state.totalPages);
        updateStats(data.stats || {});
        togglePaginationButtons();
    } catch (error) {
        console.error(error);
        document.getElementById('queueTableBody').innerHTML = `
            <tr>
                <td colspan="10" class="text-center text-danger py-4">
                    ${error.message}
                </td>
            </tr>`;
    } finally {
        state.loading = false;
    }
}

function getFirstImage(imagesStr) {
    if (!imagesStr) return '';
    return imagesStr.split(',')[0].trim() || '';
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function renderQueue(items) {
    const tbody = document.getElementById('queueTableBody');
    tbody.innerHTML = '';
    if (!items.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center text-muted py-4">
                    No items in the processing queue.
                </td>
            </tr>`;
        return;
    }

    items.forEach(item => {
        const selected = selectedIds.has(item.id);
        const firstImage = getFirstImage(item.shopify_images);
        const hasExtractedData = item.extracted_data && Object.keys(item.extracted_data || {}).length > 0;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <input type="checkbox" class="form-check-input row-checkbox" data-id="${item.id}" ${selected ? 'checked' : ''}>
            </td>
            <td>
                <span class="status-badge ${item.status}">${item.status}</span>
                ${hasExtractedData ? '<i class="fas fa-database text-success ms-1" title="Has extracted data"></i>' : ''}
            </td>
            <td>
                <span class="collection-badge">${(item.target_collection || '').replace(/_/g, ' ')}</span>
            </td>
            <td class="fw-bold">${item.sku || '-'}</td>
            <td>
                ${firstImage ? `<img src="${firstImage}" alt="" class="product-image">` : '<span class="text-muted">-</span>'}
            </td>
            <td>
                <div>${item.title || ''}</div>
                <small class="text-muted">${item.shopify_handle || ''}</small>
            </td>
            <td>${item.vendor || '-'}</td>
            <td>${item.shopify_price || '-'}</td>
            <td><small>${formatDate(item.created_at)}</small></td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-outline-info btn-sm view-details" data-id="${item.id}" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-outline-success btn-sm approve-single" data-id="${item.id}" title="Approve">
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="btn btn-outline-danger btn-sm delete-single" data-id="${item.id}" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });

    // Setup event handlers
    document.querySelectorAll('.row-checkbox').forEach(input => {
        input.addEventListener('change', event => {
            const id = parseInt(event.target.dataset.id);
            if (event.target.checked) {
                selectedIds.add(id);
            } else {
                selectedIds.delete(id);
            }
            updateActionButtonsState();
        });
    });

    document.querySelectorAll('.approve-single').forEach(btn => {
        btn.addEventListener('click', event => {
            const id = parseInt(event.currentTarget.dataset.id);
            approveItems([id]);
        });
    });

    document.querySelectorAll('.delete-single').forEach(btn => {
        btn.addEventListener('click', event => {
            const id = parseInt(event.currentTarget.dataset.id);
            deleteItems([id]);
        });
    });

    document.querySelectorAll('.view-details').forEach(btn => {
        btn.addEventListener('click', event => {
            const id = parseInt(event.currentTarget.dataset.id);
            openProductDetailModal(id);
        });
    });
}

function togglePaginationButtons() {
    document.getElementById('prevPageBtn').disabled = state.page <= 1;
    document.getElementById('nextPageBtn').disabled = state.page >= state.totalPages;
}

function updateActionButtonsState() {
    const approveBtn = document.getElementById('approveSelectedButton');
    const deleteBtn = document.getElementById('deleteSelectedButton');
    approveBtn.disabled = selectedIds.size === 0;
    deleteBtn.disabled = selectedIds.size === 0;
}

function resetSelection() {
    selectedIds.clear();
    document.getElementById('selectAllRows').checked = false;
    updateActionButtonsState();
}

// Toast notification
function showToast(message, type = 'success', action = null) {
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
    toast.querySelector('.pim-toast-close').addEventListener('click', () => toast.remove());
    setTimeout(() => toast.remove(), action ? 8000 : 5000);
    requestAnimationFrame(() => toast.classList.add('show'));
}

async function approveItems(ids) {
    try {
        const response = await fetch('/api/processing-queue/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ queue_ids: ids })
        });
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Failed to approve items');
        }

        // Build summary of collections
        const collections = {};
        (data.approved || []).forEach(item => {
            const col = item.collection?.replace(/_/g, ' ') || 'unknown';
            collections[col] = (collections[col] || 0) + 1;
        });
        const summary = Object.entries(collections).map(([c, n]) => `${n} to ${c}`).join(', ');

        showToast(
            `Approved ${data.approved_count} item(s) to Google Sheet (${summary})`,
            'success',
            data.errors?.length > 0 ? null : { url: '/', text: 'View Dashboard →' }
        );

        if (data.errors?.length > 0) {
            console.warn('Approval errors:', data.errors);
        }

        resetSelection();
        loadQueue();
    } catch (error) {
        console.error('Error approving items:', error);
        showToast('Failed to approve: ' + error.message, 'error');
    }
}

async function deleteItems(ids) {
    try {
        let deleted = 0;
        for (const id of ids) {
            const response = await fetch(`/api/processing-queue/${id}`, {
                method: 'DELETE'
            });
            const data = await response.json();
            if (data.success) deleted++;
        }
        showToast(`Deleted ${deleted} item(s) from the queue.`, 'info');
        resetSelection();
        loadQueue();
    } catch (error) {
        console.error('Error deleting items:', error);
        showToast('Failed to delete: ' + error.message, 'error');
    }
}

// ============ Schema Functions ============

async function loadCollectionSchema(collectionName) {
    // Check cache first
    if (schemaCache[collectionName]) {
        return schemaCache[collectionName];
    }

    try {
        const response = await fetch(`/api/processing-queue/schema/${collectionName}`);
        const data = await response.json();

        if (data.success && data.schema) {
            schemaCache[collectionName] = data.schema;
            return data.schema;
        }
    } catch (error) {
        console.error('Error loading schema:', error);
    }

    return null;
}

async function validateExtractedData(collectionName, extractedData) {
    try {
        const response = await fetch('/api/processing-queue/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                collection: collectionName,
                extracted_data: extractedData
            })
        });
        return await response.json();
    } catch (error) {
        console.error('Error validating data:', error);
        return { success: false, error: error.message };
    }
}

// ============ Filter and Pagination Setup ============

function setupFilters() {
    document.getElementById('collectionFilter').addEventListener('change', e => {
        state.collection = e.target.value;
        state.page = 1;
        resetSelection();
        loadQueue();
    });

    document.getElementById('statusFilter').addEventListener('change', e => {
        state.status = e.target.value;
        state.page = 1;
        resetSelection();
        loadQueue();
    });

    document.getElementById('searchInput').addEventListener('input', debounce(e => {
        state.search = e.target.value.trim();
        state.page = 1;
        resetSelection();
        loadQueue();
    }));
}

function setupPagination() {
    document.getElementById('prevPageBtn').addEventListener('click', () => {
        if (state.page > 1) {
            state.page -= 1;
            resetSelection();
            loadQueue();
        }
    });
    document.getElementById('nextPageBtn').addEventListener('click', () => {
        if (state.page < state.totalPages) {
            state.page += 1;
            resetSelection();
            loadQueue();
        }
    });
}

function setupSelectionControls() {
    document.getElementById('selectAllRows').addEventListener('change', event => {
        const checkboxes = document.querySelectorAll('.row-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = event.target.checked;
            const id = parseInt(cb.dataset.id);
            if (event.target.checked) {
                selectedIds.add(id);
            } else {
                selectedIds.delete(id);
            }
        });
        updateActionButtonsState();
    });
}

function setupApproveModal() {
    document.getElementById('approveSelectedButton').addEventListener('click', () => {
        document.getElementById('approveCountLabel').textContent = selectedIds.size;
        const modal = new bootstrap.Modal(document.getElementById('approveModal'));
        modal.show();
    });

    document.getElementById('confirmApproveButton').addEventListener('click', () => {
        bootstrap.Modal.getInstance(document.getElementById('approveModal')).hide();
        approveItems(Array.from(selectedIds));
    });
}

function setupDeleteModal() {
    document.getElementById('deleteSelectedButton').addEventListener('click', () => {
        document.getElementById('deleteCountLabel').textContent = selectedIds.size;
        const modal = new bootstrap.Modal(document.getElementById('deleteModal'));
        modal.show();
    });

    document.getElementById('confirmDeleteButton').addEventListener('click', () => {
        bootstrap.Modal.getInstance(document.getElementById('deleteModal')).hide();
        deleteItems(Array.from(selectedIds));
    });
}

function setupRefreshButton() {
    document.getElementById('refreshButton').addEventListener('click', () => {
        loadQueue();
    });
}

// ============ Product Detail Modal ============

async function openProductDetailModal(queueId) {
    try {
        const response = await fetch(`/api/processing-queue/${queueId}`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load item details');
        }

        const item = data.item;
        state.currentItem = item;
        state.extractedData = null;
        state.collectionSchema = null;

        // Load schema for this collection
        const schema = await loadCollectionSchema(item.target_collection);
        state.collectionSchema = schema;

        // Populate modal
        document.getElementById('detailSku').textContent = item.sku || '-';
        document.getElementById('detailTitle').textContent = item.title || '-';
        document.getElementById('detailVendor').textContent = item.vendor || '-';
        document.getElementById('detailCollection').textContent = (item.target_collection || '').replace(/_/g, ' ');
        document.getElementById('detailPrice').textContent = item.shopify_price || '-';

        // Schema info
        const schemaInfo = document.getElementById('schemaInfo');
        if (schema && schemaInfo) {
            schemaInfo.innerHTML = `
                <small class="text-muted">
                    Schema: ${schema.extraction_fields?.length || 0} fields,
                    ${schema.required_fields?.length || 0} required
                </small>`;
        }

        // Handle spec sheet
        const specSheetUrl = item.shopify_spec_sheet;
        const specSheetLink = document.getElementById('specSheetLink');
        const specSheetPreview = document.getElementById('specSheetPreview');
        const extractBtn = document.getElementById('extractDataButton');

        if (specSheetUrl) {
            specSheetLink.href = specSheetUrl;
            specSheetLink.style.display = 'inline-block';

            if (specSheetUrl.toLowerCase().includes('.pdf')) {
                specSheetPreview.innerHTML = `
                    <iframe src="${specSheetUrl}"
                            style="width: 100%; height: 280px; border: 1px solid #e5e7eb; border-radius: 4px;"
                            title="Spec Sheet Preview"></iframe>`;
            } else {
                specSheetPreview.innerHTML = `
                    <a href="${specSheetUrl}" target="_blank" class="btn btn-outline-primary">
                        <i class="fas fa-external-link-alt me-1"></i>View Spec Sheet
                    </a>`;
            }
            extractBtn.disabled = false;
        } else {
            specSheetLink.style.display = 'none';
            specSheetPreview.innerHTML = '<p class="text-muted">No spec sheet available.</p>';
            extractBtn.disabled = true;
        }

        // Check if item already has extracted data
        let existingData = item.extracted_data;
        if (typeof existingData === 'string') {
            try { existingData = JSON.parse(existingData); } catch (e) { existingData = null; }
        }

        if (existingData && Object.keys(existingData).length > 0) {
            state.extractedData = existingData;
            renderExtractedData(existingData, item.target_collection, schema);
            document.getElementById('saveExtractedDataButton').disabled = false;
        } else {
            document.getElementById('extractedDataContainer').innerHTML = `
                <p class="text-muted text-center py-4">
                    Click "Extract from Spec Sheet" to analyze the PDF and extract product specifications.
                </p>`;
            document.getElementById('saveExtractedDataButton').disabled = true;
        }

        document.getElementById('extractionLoading').style.display = 'none';
        document.getElementById('extractionError').style.display = 'none';
        document.getElementById('validationStatus').innerHTML = '';

        const modal = new bootstrap.Modal(document.getElementById('productDetailModal'));
        modal.show();

    } catch (error) {
        console.error('Error opening product detail modal:', error);
        showToast('Failed to load product details: ' + error.message, 'error');
    }
}

async function extractSpecSheetData() {
    if (!state.currentItem) return;

    const specSheetUrl = state.currentItem.shopify_spec_sheet;
    const collection = state.currentItem.target_collection;
    const title = state.currentItem.title || '';
    const vendor = state.currentItem.vendor || '';

    if (!specSheetUrl) {
        showToast('No spec sheet URL available.', 'error');
        return;
    }

    document.getElementById('extractionLoading').style.display = 'block';
    document.getElementById('extractionError').style.display = 'none';
    document.getElementById('extractedDataContainer').innerHTML = '';
    document.getElementById('extractDataButton').disabled = true;
    document.getElementById('validationStatus').innerHTML = '';

    try {
        const response = await fetch('/api/processing-queue/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                queue_id: state.currentItem.id,
                spec_sheet_url: specSheetUrl,
                collection: collection,
                title: title,
                vendor: vendor
            })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Extraction failed');
        }

        state.extractedData = data.extracted_data || {};

        // Log extraction details
        console.log('Extraction result:', {
            fieldCount: data.field_count,
            extracted: Object.keys(data.extracted_data || {}).length,
            normalized: Object.keys(data.normalized_data || {}).length
        });

        renderExtractedData(state.extractedData, collection, state.collectionSchema);
        document.getElementById('saveExtractedDataButton').disabled = false;

        // Run validation
        await runValidation();

    } catch (error) {
        console.error('Error extracting spec sheet data:', error);
        document.getElementById('extractionError').style.display = 'block';
        document.getElementById('extractionErrorMessage').textContent = error.message;
    } finally {
        document.getElementById('extractionLoading').style.display = 'none';
        document.getElementById('extractDataButton').disabled = false;
    }
}

function renderExtractedData(data, collection, schema) {
    const container = document.getElementById('extractedDataContainer');

    if (!data || Object.keys(data).length === 0) {
        container.innerHTML = '<p class="text-muted text-center py-4">No data extracted.</p>';
        return;
    }

    // Get field types from schema
    const fieldTypes = schema?.field_types || {};
    const requiredFields = new Set(schema?.required_fields || []);
    const schemaFields = new Set(schema?.extraction_fields || []);

    // Categorize fields
    const categorizeField = (fieldName) => {
        const f = fieldName.toLowerCase();

        if (['title', 'brand_name', 'vendor', 'sku', 'range', 'style', 'model_name', 'model'].includes(f)) {
            return 'Basic Info';
        }
        if (f.includes('_mm') || f.includes('width') || f.includes('depth') || f.includes('height') ||
            f.includes('length') || f.includes('size') || f.includes('diameter')) {
            return 'Dimensions';
        }
        if (f.startsWith('is_') || f.startsWith('has_')) {
            return 'Features';
        }
        if (f.includes('material') || f.includes('finish') || f.includes('colour') || f.includes('color')) {
            return 'Materials';
        }
        if (f.includes('wels') || f.includes('rating') || f.includes('certification')) {
            return 'Certifications';
        }
        if (f.includes('flow') || f.includes('pressure') || f.includes('lpm')) {
            return 'Flow & Pressure';
        }
        if (f.includes('warranty')) {
            return 'Warranty';
        }
        if (f.includes('_type') || f.includes('installation') || f.includes('mounting')) {
            return 'Installation';
        }
        if (f.includes('power') || f.includes('watt') || f.includes('volt')) {
            return 'Electrical';
        }
        return 'Other';
    };

    // Build categories
    const categories = {};
    Object.keys(data).forEach(key => {
        const category = categorizeField(key);
        if (!categories[category]) categories[category] = [];
        categories[category].push(key);
    });

    const categoryOrder = ['Basic Info', 'Dimensions', 'Installation', 'Materials', 'Features',
                          'Flow & Pressure', 'Certifications', 'Electrical', 'Warranty', 'Other'];

    const sortedCategories = Object.keys(categories).sort((a, b) => {
        const aIndex = categoryOrder.indexOf(a);
        const bIndex = categoryOrder.indexOf(b);
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    });

    let html = '<div class="extracted-fields" style="max-height: 400px; overflow-y: auto;">';

    sortedCategories.forEach(category => {
        const fields = categories[category];
        const relevantFields = fields.filter(f => data[f] !== undefined && data[f] !== null && data[f] !== '');
        if (relevantFields.length === 0) return;

        html += `<div class="mb-3">
            <h6 class="text-muted border-bottom pb-1 mb-2">${category}</h6>
            <div class="row g-2">`;

        relevantFields.forEach(field => {
            const value = data[field];
            const fieldType = fieldTypes[field] || 'text';
            const isRequired = requiredFields.has(field);
            const inSchema = schemaFields.has(field);

            const fieldLabel = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const requiredBadge = isRequired ? '<span class="text-danger">*</span>' : '';
            const schemaClass = inSchema ? '' : 'border-warning';
            const schemaTitle = inSchema ? '' : 'title="Field not in collection schema"';

            // Render different input types based on field type
            let inputHtml;
            if (fieldType === 'boolean') {
                const checked = value === true || value === 'true' || value === 'Yes';
                inputHtml = `
                    <select class="form-select form-select-sm extracted-field ${schemaClass}" data-field="${field}" data-type="boolean" ${schemaTitle}>
                        <option value="true" ${checked ? 'selected' : ''}>Yes</option>
                        <option value="false" ${!checked ? 'selected' : ''}>No</option>
                    </select>`;
            } else if (fieldType === 'number') {
                const numValue = typeof value === 'number' ? value : (parseFloat(value) || '');
                inputHtml = `
                    <input type="number" class="form-control form-control-sm extracted-field ${schemaClass}"
                           data-field="${field}" data-type="number" value="${numValue}" ${schemaTitle}>`;
            } else {
                const escapedValue = String(value).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                inputHtml = `
                    <input type="text" class="form-control form-control-sm extracted-field ${schemaClass}"
                           data-field="${field}" data-type="text" value="${escapedValue}" ${schemaTitle}>`;
            }

            html += `
                <div class="col-md-6">
                    <div class="input-group input-group-sm">
                        <span class="input-group-text" style="min-width: 120px; font-size: 0.75rem;">
                            ${fieldLabel}${requiredBadge}
                        </span>
                        ${inputHtml}
                    </div>
                </div>`;
        });

        html += '</div></div>';
    });

    html += '</div>';
    container.innerHTML = html;
}

async function runValidation() {
    if (!state.currentItem || !state.extractedData) return;

    const collection = state.currentItem.target_collection;
    const result = await validateExtractedData(collection, state.extractedData);

    const statusEl = document.getElementById('validationStatus');
    if (!result.success) {
        statusEl.innerHTML = `<div class="alert alert-danger py-2 mt-2"><small>${result.error}</small></div>`;
        return;
    }

    const validation = result.validation;
    if (validation.valid) {
        statusEl.innerHTML = `
            <div class="alert alert-success py-2 mt-2">
                <small><i class="fas fa-check-circle me-1"></i>
                ${validation.mapped_fields} of ${validation.field_count} fields validated</small>
            </div>`;
    } else {
        const errorList = validation.errors.map(e => `<li>${e}</li>`).join('');
        const warnList = validation.warnings.map(w => `<li>${w}</li>`).join('');
        statusEl.innerHTML = `
            <div class="alert alert-warning py-2 mt-2">
                <small>
                    ${validation.errors.length > 0 ? `<strong>Errors:</strong><ul class="mb-1">${errorList}</ul>` : ''}
                    ${validation.warnings.length > 0 ? `<strong>Warnings:</strong><ul class="mb-0">${warnList}</ul>` : ''}
                </small>
            </div>`;
    }
}

async function saveExtractedData() {
    if (!state.currentItem) return;

    // Collect edited values
    const editedData = {};
    document.querySelectorAll('.extracted-field').forEach(input => {
        const field = input.dataset.field;
        const type = input.dataset.type;
        let value = input.value;

        if (type === 'boolean') {
            value = value === 'true';
        } else if (type === 'number') {
            value = parseFloat(value) || null;
        } else {
            value = value.trim();
        }

        if (value !== null && value !== '') {
            editedData[field] = value;
        }
    });

    const saveBtn = document.getElementById('saveExtractedDataButton');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Saving...';

    try {
        const response = await fetch(`/api/processing-queue/${state.currentItem.id}/extracted-data`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                extracted_data: editedData,
                mark_ready: true
            })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to save data');
        }

        bootstrap.Modal.getInstance(document.getElementById('productDetailModal')).hide();
        loadQueue();
        showToast('Data saved. Product marked as ready for approval.', 'success');

    } catch (error) {
        console.error('Error saving extracted data:', error);
        showToast('Failed to save: ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save me-1"></i>Save & Mark Ready';
    }
}

function setupProductDetailModal() {
    document.getElementById('extractDataButton').addEventListener('click', extractSpecSheetData);
    document.getElementById('saveExtractedDataButton').addEventListener('click', saveExtractedData);
}

// ============ Initialize ============

document.addEventListener('DOMContentLoaded', () => {
    setupFilters();
    setupPagination();
    setupSelectionControls();
    setupApproveModal();
    setupDeleteModal();
    setupRefreshButton();
    setupProductDetailModal();
    loadQueue();
});
