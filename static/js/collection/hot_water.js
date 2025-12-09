/**
 * Hot Water Collection JavaScript - Specific functionality for hot water collection
 */

// Hot Water-specific field mappings - matches hot_water_modal.html and HotWaterCollection config
const HOT_WATER_FIELD_MAPPINGS = {
    // System fields
    'editUrl': 'url',
    'editSku': 'variant_sku',
    'editKey': 'key',
    'editId': 'id',
    'editHandle': 'handle',

    // Basic product info
    'editTitle': 'title',
    'editVendor': 'vendor',
    'editBrandName': 'brand_name',

    // Hot Water specifications
    'editFuelType': 'fuel_type',
    'editFlowRate': 'flow_rate',
    'editNoOfPeople': 'no_of_people',
    'editNoOfBathrooms': 'no_of_bathrooms',
    'editCapacity': 'capacity',
    'editLocation': 'location',

    // Content
    'editBodyHtml': 'body_html',
    'editFeatures': 'features',
    'editCareInstructions': 'care_instructions',
    'editFaqs': 'faqs',

    // System/Shopify fields
    'editQualityScore': 'quality_score',
    'editShopifyStatus': 'shopify_status',
    'editShopifyPrice': 'shopify_price',
    'editShopifyComparePrice': 'shopify_compare_price',
    'editShopifyWeight': 'shopify_weight',
    'editShopifyTags': 'shopify_tags',
    'editSeoTitle': 'seo_title',
    'editSeoDescription': 'seo_description',

    // Media
    'editShopifyImages': 'shopify_images',
    'editShopifySpecSheet': 'shopify_spec_sheet',

    // System fields
    'editShopifyCollections': 'shopify_collections',
    'editShopifyUrl': 'shopify_url',
    'editLastShopifySync': 'last_shopify_sync',
    'editCleanData': 'clean_data'
};

// Additional images array for managing product images
let additionalImagesArray = [];

// Background save queue and status tracking
let backgroundSaveQueue = [];
let backgroundSaveInProgress = false;

/**
 * Update hidden field with current additional images array
 */
function updateHiddenField() {
    const hiddenField = document.getElementById('editShopifyImages');
    if (hiddenField) {
        hiddenField.value = additionalImagesArray.join(',');
    }
}

/**
 * Get current collection name
 */
function getCurrentCollectionName() {
    const collectionField = document.getElementById('editCollectionName');
    if (collectionField && collectionField.value) {
        return collectionField.value;
    }
    return window.COLLECTION_NAME || 'hot_water';
}

/**
 * Collect all form data for saving
 */
function collectFormData(collectionName) {
    console.log('Collecting hot water form data...');
    updateHiddenField();

    const data = {};

    Object.entries(HOT_WATER_FIELD_MAPPINGS).forEach(([fieldId, dataKey]) => {
        const element = document.getElementById(fieldId);
        if (element) {
            let value = element.value ? element.value.trim() : '';

            if (fieldId === 'editShopifyImages') {
                value = additionalImagesArray.join(',');
            }

            if (value !== '') {
                data[dataKey] = value;
            }
        }
    });

    // Force include important fields even if empty
    const forceIncludeFields = ['shopify_images', 'shopify_spec_sheet'];
    forceIncludeFields.forEach(field => {
        if (!data[field]) {
            if (field === 'shopify_images') {
                data[field] = additionalImagesArray.join(',');
            } else if (field === 'shopify_spec_sheet') {
                const specSheetElement = document.getElementById('editShopifySpecSheet');
                data[field] = specSheetElement ? specSheetElement.value.trim() : '';
            }
        }
    });

    console.log('Collected data fields:', Object.keys(data).length);
    return data;
}

/**
 * Save hot water product with instant UI update and background sync
 */
async function saveHotWaterProduct() {
    const collectionName = getCurrentCollectionName();
    const rowNum = document.getElementById('editRowNum')?.value;

    if (!rowNum) {
        if (typeof showErrorMessage === 'function') {
            showErrorMessage('No product selected');
        }
        return;
    }

    // Collect form data
    const formData = collectFormData(collectionName);

    // Show saving indicator
    if (typeof showSuccessMessage === 'function') {
        showSuccessMessage('Saving changes...');
    }

    try {
        const response = await fetch(`/api/${collectionName}/products/${rowNum}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (data.success) {
            if (typeof showSuccessMessage === 'function') {
                showSuccessMessage('Product saved successfully!');
            }

            // Update local cache if available
            if (window.productsData && window.productsData[rowNum]) {
                Object.assign(window.productsData[rowNum], formData);
            }
        } else {
            if (typeof showErrorMessage === 'function') {
                showErrorMessage('Save failed: ' + (data.error || 'Unknown error'));
            }
        }
    } catch (error) {
        if (typeof showErrorMessage === 'function') {
            showErrorMessage('Error saving: ' + error.message);
        }
    }
}

/**
 * Render product specifications on the card
 */
function renderProductSpecs(product) {
    const rowNum = product.row_number;
    const specs = [];

    // Helper function for case-insensitive comparison
    function isSelected(value, option) {
        if (!value || !option) return false;
        return value.toString().trim().toLowerCase() === option.toString().trim().toLowerCase();
    }

    // Fuel Type - editable dropdown
    const fuelType = product.fuel_type || '';
    const fuelOptions = ['Gas', 'Electric', 'Solar', 'Heat Pump', 'LPG'];
    let fuelOptionsHtml = '<option value="">Select...</option>';
    fuelOptions.forEach(opt => {
        fuelOptionsHtml += `<option value="${opt}" ${isSelected(fuelType, opt) ? 'selected' : ''}>${opt}</option>`;
    });

    specs.push({
        label: 'Fuel Type',
        html: `<select class="spec-dropdown" data-row="${rowNum}" data-field="fuel_type" onchange="updateFieldFromCard(event)" onclick="event.stopPropagation()">
            ${fuelOptionsHtml}
        </select>`
    });

    // Flow Rate
    if (product.flow_rate) {
        specs.push({
            label: 'Flow Rate',
            value: product.flow_rate
        });
    }

    // Capacity
    if (product.capacity) {
        specs.push({
            label: 'Capacity',
            value: product.capacity
        });
    }

    // No of People
    if (product.no_of_people) {
        specs.push({
            label: 'People',
            value: product.no_of_people
        });
    }

    // No of Bathrooms
    if (product.no_of_bathrooms) {
        specs.push({
            label: 'Bathrooms',
            value: product.no_of_bathrooms
        });
    }

    // Location - editable dropdown
    const location = product.location || '';
    const locationOptions = ['Indoor', 'Outdoor', 'Indoor/Outdoor'];
    let locationOptionsHtml = '<option value="">Select...</option>';
    locationOptions.forEach(opt => {
        locationOptionsHtml += `<option value="${opt}" ${isSelected(location, opt) ? 'selected' : ''}>${opt}</option>`;
    });

    specs.push({
        label: 'Location',
        html: `<select class="spec-dropdown" data-row="${rowNum}" data-field="location" onchange="updateFieldFromCard(event)" onclick="event.stopPropagation()">
            ${locationOptionsHtml}
        </select>`
    });

    // Brand
    if (product.brand_name) {
        specs.push({
            label: 'Brand',
            value: product.brand_name
        });
    }

    return specs;
}

/**
 * Populate collection-specific fields in the modal
 */
function populateCollectionSpecificFields(data) {
    console.log('Populating hot water fields...');

    // Reset additional images array
    additionalImagesArray = [];

    // Populate fields using mappings
    Object.entries(HOT_WATER_FIELD_MAPPINGS).forEach(([elementId, fieldName]) => {
        const element = document.getElementById(elementId);
        if (element) {
            let value = data[fieldName] || '';

            // Handle images specially
            if (fieldName === 'shopify_images' && value) {
                additionalImagesArray = value.split(',').map(url => url.trim()).filter(url => url);
                console.log(`Loaded ${additionalImagesArray.length} images`);
            }

            element.value = value;
        }
    });

    // Initialize additional images display if function exists
    if (typeof initializeAdditionalImages === 'function') {
        initializeAdditionalImages();
    }

    // Show compare button if URL exists
    const compareBtn = document.getElementById('compareButton');
    if (compareBtn && data.url) {
        compareBtn.style.display = 'inline-block';
    } else if (compareBtn) {
        compareBtn.style.display = 'none';
    }
}

/**
 * Content completion tracking
 */
function updateContentCompletionIndicators() {
    const contentFields = [
        { id: 'editBodyHtml', name: 'Description' },
        { id: 'editFeatures', name: 'Features' },
        { id: 'editCareInstructions', name: 'Care Instructions' },
        { id: 'editFaqs', name: 'FAQs' }
    ];

    let completedCount = 0;

    contentFields.forEach(field => {
        const element = document.getElementById(field.id);
        const tabButton = document.querySelector(`[data-bs-target="#${field.id.replace('edit', '').toLowerCase()}Tab"]`);

        if (element && element.value && element.value.trim().length > 10) {
            completedCount++;
            if (tabButton) {
                tabButton.classList.add('content-complete');
                tabButton.classList.remove('content-incomplete');
            }
        } else {
            if (tabButton) {
                tabButton.classList.add('content-incomplete');
                tabButton.classList.remove('content-complete');
            }
        }
    });

    // Update completion status display
    const completionStatus = document.getElementById('contentCompletionStatus');
    if (completionStatus) {
        if (completedCount === contentFields.length) {
            completionStatus.innerHTML = `<i class="fas fa-check-circle text-success me-1"></i>${completedCount}/${contentFields.length} Complete`;
        } else {
            completionStatus.innerHTML = `<i class="fas fa-clock me-1"></i>${completedCount}/${contentFields.length} Complete`;
        }
    }
}

/**
 * Initialize additional images from hidden field
 */
function initializeAdditionalImages() {
    const hiddenField = document.getElementById('editShopifyImages');
    if (hiddenField && hiddenField.value) {
        additionalImagesArray = hiddenField.value.split(',').map(url => url.trim()).filter(url => url);
    }
    updateAdditionalImagesDisplay();
}

/**
 * Add new image to array
 */
function addNewImage() {
    const input = document.getElementById('newImageUrl');
    if (input && input.value.trim()) {
        additionalImagesArray.push(input.value.trim());
        input.value = '';
        updateAdditionalImagesDisplay();
        updateHiddenField();
    }
}

/**
 * Remove image from array
 */
function removeImage(index) {
    additionalImagesArray.splice(index, 1);
    updateAdditionalImagesDisplay();
    updateHiddenField();
}

/**
 * Update additional images display
 */
function updateAdditionalImagesDisplay() {
    const container = document.getElementById('currentImagesList');
    const countBadge = document.getElementById('additionalImagesCount');

    if (countBadge) {
        countBadge.textContent = additionalImagesArray.length;
    }

    if (!container) return;

    if (additionalImagesArray.length === 0) {
        container.innerHTML = '<p class="text-muted">No images added yet</p>';
        return;
    }

    container.innerHTML = additionalImagesArray.map((url, index) => `
        <div class="image-card" draggable="true" data-index="${index}">
            <img src="${url}" alt="Product image ${index + 1}" onerror="this.src='/static/img/no-image.png'">
            <button type="button" class="btn btn-sm btn-danger remove-image-btn" onclick="removeImage(${index})">
                <i class="fas fa-times"></i>
            </button>
            <span class="image-order-badge">${index + 1}</span>
        </div>
    `).join('');
}

// Drag and drop handlers
let draggedIndex = null;

function handleDragStart(event) {
    draggedIndex = parseInt(event.target.dataset.index);
    event.target.classList.add('dragging');
}

function handleDragOver(event) {
    event.preventDefault();
}

function handleDrop(event) {
    event.preventDefault();
    const targetIndex = parseInt(event.target.closest('.image-card')?.dataset.index);
    if (targetIndex !== undefined && draggedIndex !== null && targetIndex !== draggedIndex) {
        const item = additionalImagesArray.splice(draggedIndex, 1)[0];
        additionalImagesArray.splice(targetIndex, 0, item);
        updateAdditionalImagesDisplay();
        updateHiddenField();
    }
}

function handleDragEnd(event) {
    event.target.classList.remove('dragging');
    draggedIndex = null;
}

/**
 * Generate content for a specific tab using AI
 */
async function generateTabContent(tabType) {
    const collectionName = getCurrentCollectionName();
    const rowNum = document.getElementById('editRowNum')?.value;

    if (!rowNum) {
        if (typeof showErrorMessage === 'function') {
            showErrorMessage('No product selected');
        }
        return;
    }

    if (typeof showSuccessMessage === 'function') {
        showSuccessMessage(`Generating ${tabType}...`);
    }

    try {
        const response = await fetch(`/api/${collectionName}/products/${rowNum}/generate-content`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content_type: tabType })
        });

        const data = await response.json();

        if (data.status === 'success') {
            let fieldId;
            if (tabType === 'description') fieldId = 'editBodyHtml';
            else if (tabType === 'features') fieldId = 'editFeatures';
            else if (tabType === 'care') fieldId = 'editCareInstructions';
            else if (tabType === 'faqs') fieldId = 'editFaqs';

            if (fieldId) {
                const field = document.getElementById(fieldId);
                if (field) {
                    field.value = data.content;
                    updateContentCompletionIndicators();
                    if (typeof showSuccessMessage === 'function') {
                        showSuccessMessage(`${tabType} generated successfully!`);
                    }
                }
            }
        } else {
            if (typeof showErrorMessage === 'function') {
                showErrorMessage('Generation failed: ' + (data.error || 'Unknown error'));
            }
        }
    } catch (error) {
        if (typeof showErrorMessage === 'function') {
            showErrorMessage('Error generating content: ' + error.message);
        }
    }
}

/**
 * Sync Google Sheet
 */
async function syncGoogleSheet() {
    const collectionName = getCurrentCollectionName();

    const btn = event?.target?.closest('button');
    let originalHTML;
    if (btn) {
        originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Syncing...';
    }

    try {
        const response = await fetch(`/api/${collectionName}/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.status === 'success') {
            if (typeof showSuccessMessage === 'function') {
                showSuccessMessage('Google Sheet synced successfully! Reloading page...');
            }
            setTimeout(() => {
                window.location.href = window.location.pathname + '?force_refresh=true&t=' + Date.now();
            }, 1500);
        } else {
            if (typeof showErrorMessage === 'function') {
                showErrorMessage('Failed to sync: ' + (data.error || 'Unknown error'));
            }
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalHTML;
            }
        }
    } catch (error) {
        if (typeof showErrorMessage === 'function') {
            showErrorMessage('Error syncing Google Sheet: ' + error.message);
        }
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
        }
    }
}

/**
 * Export hot water specifications to CSV
 */
function exportHotWaterSpecs() {
    const collectionName = getCurrentCollectionName();

    if (typeof showSuccessMessage === 'function') {
        showSuccessMessage('Preparing export...');
    }

    const headers = [
        'SKU', 'Title', 'Brand', 'Fuel Type', 'Flow Rate',
        'No of People', 'No of Bathrooms', 'Capacity', 'Location',
        'Shopify Status'
    ];

    const products = window.allProducts || Object.values(window.productsData || {});

    const rows = products.map(product => [
        product.variant_sku || '',
        product.title || '',
        product.brand_name || '',
        product.fuel_type || '',
        product.flow_rate || '',
        product.no_of_people || '',
        product.no_of_bathrooms || '',
        product.capacity || '',
        product.location || '',
        product.shopify_status || ''
    ]);

    const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `hot_water_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (typeof showSuccessMessage === 'function') {
        showSuccessMessage(`Exported ${products.length} hot water products to CSV`);
    }
}

// Modal initialization - update content completion when modal opens
document.addEventListener('DOMContentLoaded', function() {
    const editModal = document.getElementById('editProductModal');
    if (editModal) {
        editModal.addEventListener('shown.bs.modal', function() {
            setTimeout(() => {
                updateContentCompletionIndicators();
                if (typeof initializeContentTabs === 'function') {
                    initializeContentTabs();
                }
            }, 200);
        });
    }

    // Enter key in new image URL input
    const newImageInput = document.getElementById('newImageUrl');
    if (newImageInput) {
        newImageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                addNewImage();
            }
        });
    }
});

// Export functions for use in other modules
window.getCurrentCollectionName = getCurrentCollectionName;
window.collectFormData = collectFormData;
window.saveHotWaterProduct = saveHotWaterProduct;
window.saveProduct = saveHotWaterProduct;
window.renderProductSpecs = renderProductSpecs;
window.populateCollectionSpecificFields = populateCollectionSpecificFields;
window.updateContentCompletionIndicators = updateContentCompletionIndicators;
window.initializeAdditionalImages = initializeAdditionalImages;
window.addNewImage = addNewImage;
window.removeImage = removeImage;
window.updateAdditionalImagesDisplay = updateAdditionalImagesDisplay;
window.updateHiddenField = updateHiddenField;
window.handleDragStart = handleDragStart;
window.handleDragOver = handleDragOver;
window.handleDrop = handleDrop;
window.handleDragEnd = handleDragEnd;
window.generateTabContent = generateTabContent;
window.syncGoogleSheet = syncGoogleSheet;
window.exportHotWaterSpecs = exportHotWaterSpecs;
