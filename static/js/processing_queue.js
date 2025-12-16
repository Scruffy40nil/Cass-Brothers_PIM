const state = {
    page: 1,
    limit: 50,
    collection: '',
    status: '',
    search: '',
    totalPages: 1,
    loading: false
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

document.addEventListener('DOMContentLoaded', () => {
    setupFilters();
    setupPagination();
    setupSelectionControls();
    setupApproveModal();
    setupDeleteModal();
    setupRefreshButton();
    loadQueue();
});
