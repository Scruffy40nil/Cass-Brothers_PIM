const state = {
    page: 1,
    limit: 50,
    collection: '',
    status: '',
    search: '',
    totalPages: 1,
    loading: false,
    currentItem: null,
    extractedData: null
};

const selectedIds = new Set();

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

        // Filter by search if needed (client-side for now)
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
    const first = imagesStr.split(',')[0].trim();
    return first || '';
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
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <input type="checkbox" class="form-check-input row-checkbox" data-id="${item.id}" ${selected ? 'checked' : ''}>
            </td>
            <td>
                <span class="status-badge ${item.status}">${item.status}</span>
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

    // Setup checkbox handlers
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

    // Setup single approve handlers
    document.querySelectorAll('.approve-single').forEach(btn => {
        btn.addEventListener('click', event => {
            const id = parseInt(event.currentTarget.dataset.id);
            approveItems([id]);
        });
    });

    // Setup single delete handlers
    document.querySelectorAll('.delete-single').forEach(btn => {
        btn.addEventListener('click', event => {
            const id = parseInt(event.currentTarget.dataset.id);
            deleteItems([id]);
        });
    });

    // Setup view details handlers
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
        alert(`Approved ${data.approved_count} item(s). They have been moved to their collection WIP.`);
        resetSelection();
        loadQueue();
    } catch (error) {
        console.error('Error approving items:', error);
        alert('Failed to approve: ' + error.message);
    }
}

async function deleteItems(ids) {
    try {
        // Delete each item
        let deleted = 0;
        for (const id of ids) {
            const response = await fetch(`/api/processing-queue/${id}`, {
                method: 'DELETE'
            });
            const data = await response.json();
            if (data.success) {
                deleted++;
            }
        }
        alert(`Deleted ${deleted} item(s) from the queue.`);
        resetSelection();
        loadQueue();
    } catch (error) {
        console.error('Error deleting items:', error);
        alert('Failed to delete: ' + error.message);
    }
}

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

// ============ Product Detail Modal Functions ============

async function openProductDetailModal(queueId) {
    try {
        // Fetch item details
        const response = await fetch(`/api/processing-queue/${queueId}`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load item details');
        }

        const item = data.item;
        state.currentItem = item;
        state.extractedData = null;

        // Populate modal with item details
        document.getElementById('detailSku').textContent = item.sku || '-';
        document.getElementById('detailTitle').textContent = item.title || '-';
        document.getElementById('detailVendor').textContent = item.vendor || '-';
        document.getElementById('detailCollection').textContent = (item.target_collection || '').replace(/_/g, ' ');
        document.getElementById('detailPrice').textContent = item.shopify_price || '-';

        // Handle spec sheet
        const specSheetUrl = item.shopify_spec_sheet;
        const specSheetLink = document.getElementById('specSheetLink');
        const specSheetPreview = document.getElementById('specSheetPreview');
        const extractBtn = document.getElementById('extractDataButton');

        if (specSheetUrl) {
            specSheetLink.href = specSheetUrl;
            specSheetLink.style.display = 'inline-block';

            // Check if it's a PDF
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
            specSheetPreview.innerHTML = '<p class="text-muted">No spec sheet available for this product.</p>';
            extractBtn.disabled = true;
        }

        // Reset extracted data container
        document.getElementById('extractedDataContainer').innerHTML = `
            <p class="text-muted text-center py-4">
                Click "Extract from Spec Sheet" to analyze the PDF and extract product specifications.
            </p>`;
        document.getElementById('extractionLoading').style.display = 'none';
        document.getElementById('extractionError').style.display = 'none';
        document.getElementById('saveExtractedDataButton').disabled = true;

        // Show the modal
        const modal = new bootstrap.Modal(document.getElementById('productDetailModal'));
        modal.show();

    } catch (error) {
        console.error('Error opening product detail modal:', error);
        alert('Failed to load product details: ' + error.message);
    }
}

async function extractSpecSheetData() {
    if (!state.currentItem) return;

    const specSheetUrl = state.currentItem.shopify_spec_sheet;
    const collection = state.currentItem.target_collection;

    if (!specSheetUrl) {
        alert('No spec sheet URL available for extraction.');
        return;
    }

    // Show loading
    document.getElementById('extractionLoading').style.display = 'block';
    document.getElementById('extractionError').style.display = 'none';
    document.getElementById('extractedDataContainer').innerHTML = '';
    document.getElementById('extractDataButton').disabled = true;

    try {
        const response = await fetch('/api/processing-queue/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                queue_id: state.currentItem.id,
                spec_sheet_url: specSheetUrl,
                collection: collection
            })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Extraction failed');
        }

        state.extractedData = data.extracted_data || {};
        renderExtractedData(state.extractedData, collection);
        document.getElementById('saveExtractedDataButton').disabled = false;

    } catch (error) {
        console.error('Error extracting spec sheet data:', error);
        document.getElementById('extractionError').style.display = 'block';
        document.getElementById('extractionErrorMessage').textContent = error.message;
    } finally {
        document.getElementById('extractionLoading').style.display = 'none';
        document.getElementById('extractDataButton').disabled = false;
    }
}

function renderExtractedData(data, collection) {
    const container = document.getElementById('extractedDataContainer');

    if (!data || Object.keys(data).length === 0) {
        container.innerHTML = '<p class="text-muted text-center py-4">No data extracted from the spec sheet.</p>';
        return;
    }

    // Group fields by category
    const categories = {
        'Basic Info': ['title', 'brand_name', 'vendor', 'sku', 'range', 'style'],
        'Dimensions': ['length_mm', 'overall_width_mm', 'overall_depth_mm', 'bowl_width_mm', 'bowl_depth_mm', 'bowl_height_mm', 'min_cabinet_size_mm', 'cutout_size_mm'],
        'Specifications': ['installation_type', 'product_material', 'grade_of_material', 'colour', 'has_overflow', 'bowls_number', 'tap_holes_number', 'drain_position', 'waste_outlet_dimensions'],
        'Features': ['is_undermount', 'is_topmount', 'is_flushmount', 'application_location', 'warranty_years'],
        'Other': []
    };

    // Collect uncategorized fields
    const categorizedFields = new Set();
    Object.values(categories).forEach(fields => fields.forEach(f => categorizedFields.add(f)));

    Object.keys(data).forEach(key => {
        if (!categorizedFields.has(key)) {
            categories['Other'].push(key);
        }
    });

    let html = '<div class="extracted-fields" style="max-height: 400px; overflow-y: auto;">';

    Object.entries(categories).forEach(([category, fields]) => {
        const relevantFields = fields.filter(f => data[f] !== undefined && data[f] !== null && data[f] !== '');
        if (relevantFields.length === 0) return;

        html += `<div class="mb-3">
            <h6 class="text-muted border-bottom pb-1 mb-2">${category}</h6>
            <div class="row g-2">`;

        relevantFields.forEach(field => {
            const value = data[field];
            const displayValue = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value;
            const fieldLabel = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

            html += `
                <div class="col-md-6">
                    <div class="input-group input-group-sm">
                        <span class="input-group-text" style="min-width: 120px; font-size: 0.75rem;">${fieldLabel}</span>
                        <input type="text" class="form-control extracted-field" data-field="${field}" value="${displayValue}">
                    </div>
                </div>`;
        });

        html += '</div></div>';
    });

    html += '</div>';
    container.innerHTML = html;
}

async function saveExtractedData() {
    if (!state.currentItem || !state.extractedData) return;

    // Collect edited values from form
    const editedData = {};
    document.querySelectorAll('.extracted-field').forEach(input => {
        const field = input.dataset.field;
        let value = input.value.trim();

        // Convert 'Yes'/'No' back to boolean for boolean fields
        if (value.toLowerCase() === 'yes') value = true;
        else if (value.toLowerCase() === 'no') value = false;

        editedData[field] = value;
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

        // Close modal and refresh queue
        bootstrap.Modal.getInstance(document.getElementById('productDetailModal')).hide();
        loadQueue();
        alert('Data saved successfully. Product marked as ready for approval.');

    } catch (error) {
        console.error('Error saving extracted data:', error);
        alert('Failed to save: ' + error.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save me-1"></i>Save & Mark Ready';
    }
}

function setupProductDetailModal() {
    document.getElementById('extractDataButton').addEventListener('click', extractSpecSheetData);
    document.getElementById('saveExtractedDataButton').addEventListener('click', saveExtractedData);
}

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
