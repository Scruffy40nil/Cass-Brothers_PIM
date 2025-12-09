/**
 * Smart Toilets Collection JavaScript
 * Collection-specific functions for smart toilets products
 */

// Global variable for additional images array
let additionalImagesArray = [];

// Collection-specific field mappings for form elements
const SMART_TOILETS_FIELD_MAPPINGS = {
    // System fields (hidden)
    'editUrl': 'url',
    'editKey': 'key',
    'editId': 'id',
    'editHandle': 'handle',

    // Basic Info
    'editTitle': 'title',
    'editSku': 'variant_sku',
    'editVendor': 'vendor',
    'editBrandName': 'brand_name',

    // Toilet Specifications
    'editToiletType': 'toilet_type',
    'editPanShape': 'pan_shape',
    'editFlushType': 'flush_type',
    'editMaterial': 'material',

    // Smart Features
    'editBidetFunction': 'bidet_function',
    'editHeatedSeat': 'heated_seat',
    'editAirDryer': 'air_dryer',
    'editAutoOpenCloseLid': 'auto_open_close_lid',
    'editNightLight': 'night_light',
    'editDeodorizer': 'deodorizer',
    'editRemoteControl': 'remote_control',
    'editAutoFlush': 'auto_flush',

    // Dimensions
    'editHeight': 'height_mm',
    'editWidth': 'width_mm',
    'editDepth': 'depth_mm',

    // Water Performance & WELS
    'editWelsRating': 'wels_rating',
    'editWelsRegistration': 'wels_registration_number',
    'editFullFlush': 'water_usage_full_flush',
    'editHalfFlush': 'water_usage_half_flush',

    // Electrical
    'editPowerSupply': 'power_supply',
    'editPowerConsumption': 'power_consumption_watts',
    'editWarrantyYears': 'warranty_years',

    // Content (in tabs)
    'editBodyHtml': 'body_html',
    'editFeatures': 'features',
    'editCareInstructions': 'care_instructions',
    'editFaqs': 'faqs',
    'editAsteriskInfo': 'asterisk_info',

    // System fields (hidden)
    'editQualityScore': 'quality_score',

    // Shopify Fields
    'editShopifyStatus': 'shopify_status',
    'editShopifyPrice': 'shopify_price',
    'editShopifyImages': 'shopify_images',
    'editShopifySpecSheet': 'shopify_spec_sheet',
    'editShopifyComparePrice': 'shopify_compare_price',
    'editShopifyWeight': 'shopify_weight',
    'editShopifyTags': 'shopify_tags',

    // SEO
    'editSeoTitle': 'seo_title',
    'editSeoDescription': 'seo_description',

    // System fields (hidden)
    'editShopifyCollections': 'shopify_collections',
    'editShopifyUrl': 'shopify_url',
    'editLastShopifySync': 'last_shopify_sync',
};

/**
 * Get current collection name
 */
function getCurrentCollectionName() {
    const collectionField = document.getElementById('editCollectionName');
    if (collectionField && collectionField.value) {
        return collectionField.value;
    }
    return window.COLLECTION_NAME || 'smart_toilets';
}

/**
 * Collect all form data for saving
 */
function collectFormData() {
    const formData = {};

    Object.entries(SMART_TOILETS_FIELD_MAPPINGS).forEach(([fieldId, dataKey]) => {
        const element = document.getElementById(fieldId);
        if (element) {
            formData[dataKey] = element.value || '';
        }
    });

    if (additionalImagesArray && additionalImagesArray.length > 0) {
        formData.shopify_images = additionalImagesArray.join(',');
    }

    console.log('🚽✨ Collected smart toilets form data:', formData);
    return formData;
}

/**
 * Save smart toilets product
 */
async function saveSmartToiletsProduct() {
    const modal = document.getElementById('editProductModal');
    const rowNum = modal?.dataset?.currentRow;

    if (!rowNum) {
        showErrorMessage('No product selected');
        return;
    }

    const formData = collectFormData();
    const collectionName = getCurrentCollectionName();

    try {
        const response = await fetch(`/api/${collectionName}/products/${rowNum}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (result.success) {
            showSuccessMessage('✅ Product saved successfully!');

            if (window.productsData && window.productsData[rowNum]) {
                Object.assign(window.productsData[rowNum], formData);
            }

            if (window.refreshProductCard) {
                window.refreshProductCard(rowNum);
            }
        } else {
            throw new Error(result.error || 'Save failed');
        }
    } catch (error) {
        console.error('Error saving product:', error);
        showErrorMessage(`Failed to save: ${error.message}`);
    }
}

/**
 * Sync Google Sheet - reload data from Google Sheets
 */
async function syncGoogleSheet() {
  const collectionName = getCurrentCollectionName();

  const btn = event.target.closest('button');
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Syncing...';

  try {
    const response = await fetch(`/api/${collectionName}/sync-sheet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json();

    if (data.success) {
      showSuccessMessage(`Google Sheet synced! Loaded ${data.products_loaded} products in ${data.duration}s`);
      setTimeout(() => {
        if (window.backgroundCache) {
          window.backgroundCache = {};
        }
        window.location.href = window.location.pathname + '?force_refresh=true&t=' + Date.now();
      }, 1500);
    } else {
      showErrorMessage('Failed to sync: ' + (data.error || 'Unknown error'));
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  } catch (error) {
    showErrorMessage('Error syncing Google Sheet: ' + error.message);
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}

/**
 * Export smart toilet specifications to CSV
 */
function exportSmartToiletSpecs() {
    console.log('Exporting smart toilet specifications...');
    showInfoMessage('Export feature will be available soon');
}

/**
 * Render smart toilet-specific product specifications for product cards
 */
function renderProductSpecs(product) {
    const rowNum = product.row_number;
    const specs = [];

    // Toilet Type - editable dropdown
    specs.push({
        label: 'Type',
        html: `<select class="spec-dropdown" data-row="${rowNum}" data-field="toilet_type" onchange="updateFieldFromCard(event)" onclick="event.stopPropagation()">
            <option value="">Select...</option>
            <option value="Smart Toilet" ${product.toilet_type === 'Smart Toilet' ? 'selected' : ''}>Smart Toilet</option>
            <option value="Bidet Toilet" ${product.toilet_type === 'Bidet Toilet' ? 'selected' : ''}>Bidet Toilet</option>
            <option value="Wall Hung Smart" ${product.toilet_type === 'Wall Hung Smart' ? 'selected' : ''}>Wall Hung Smart</option>
            <option value="Floor Mounted Smart" ${product.toilet_type === 'Floor Mounted Smart' ? 'selected' : ''}>Floor Mounted Smart</option>
        </select>`
    });

    // Smart Features badges
    const smartFeatures = [];
    if (product.bidet_function === 'Yes') smartFeatures.push('Bidet');
    if (product.heated_seat === 'Yes') smartFeatures.push('Heated Seat');
    if (product.air_dryer === 'Yes') smartFeatures.push('Air Dryer');
    if (product.auto_flush === 'Yes') smartFeatures.push('Auto Flush');
    if (product.night_light === 'Yes') smartFeatures.push('Night Light');

    if (smartFeatures.length > 0) {
        specs.push({
            label: 'Features',
            value: smartFeatures.slice(0, 3).join(', ') + (smartFeatures.length > 3 ? '...' : ''),
            badge: 'smart-feature-badge'
        });
    }

    // WELS Rating
    if (product.wels_rating) {
        specs.push({
            label: 'WELS',
            value: product.wels_rating,
            badge: 'wels-badge'
        });
    }

    // Warranty
    if (product.warranty_years) {
        specs.push({
            label: 'Warranty',
            value: `${product.warranty_years} years`
        });
    }

    return specs.map(spec => `
        <div class="spec-row">
            <span class="spec-label">${spec.label}:</span>
            ${spec.html ? spec.html : `<span class="spec-value ${spec.badge || ''}">${spec.value}</span>`}
        </div>
    `).join('');
}

/**
 * Populate smart toilet-specific fields in modal
 */
function populateCollectionSpecificFields(data) {
    console.log('🚽✨ Populating smart toilet-specific fields:', data);

    // Initialize images array from data
    if (data.shopify_images) {
        additionalImagesArray = data.shopify_images.split(',').map(url => url.trim()).filter(url => url);
    } else {
        additionalImagesArray = [];
    }

    Object.entries(SMART_TOILETS_FIELD_MAPPINGS).forEach(([fieldId, dataKey]) => {
        const element = document.getElementById(fieldId);
        if (element && data[dataKey] !== undefined) {
            if (element.tagName === 'SELECT') {
                const options = element.options;
                let found = false;
                for (let i = 0; i < options.length; i++) {
                    if (options[i].value.toLowerCase() === (data[dataKey] || '').toString().toLowerCase()) {
                        element.selectedIndex = i;
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    element.value = data[dataKey] || '';
                }
            } else {
                element.value = data[dataKey] || '';
            }
        }
    });

    // Update content completion indicators
    updateContentCompletionIndicators();
}

/**
 * Get updated smart toilet-specific fields from modal
 */
function getCollectionSpecificFields() {
    const fields = {};

    Object.entries(SMART_TOILETS_FIELD_MAPPINGS).forEach(([fieldId, dataKey]) => {
        const element = document.getElementById(fieldId);
        if (element) {
            fields[dataKey] = element.value || '';
        }
    });

    console.log('Collected smart toilet-specific fields:', fields);
    return fields;
}

/**
 * Update a field directly from the product card dropdown
 */
async function updateFieldFromCard(event) {
  event.stopPropagation();

  const select = event.target;
  const rowNum = parseInt(select.getAttribute('data-row'));
  const field = select.getAttribute('data-field');
  const newValue = select.value;

  console.log(`Updating ${field} for row ${rowNum} to: ${newValue}`);

  select.disabled = true;
  select.style.opacity = '0.6';

  try {
    const response = await fetch(`/api/${window.COLLECTION_NAME || 'smart_toilets'}/products/${rowNum}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field: field,
        value: newValue
      })
    });

    const data = await response.json();

    if (data.success) {
      console.log(`Successfully updated ${field} for row ${rowNum}`);

      if (window.productsData && window.productsData[rowNum]) {
        window.productsData[rowNum][field] = newValue;
      }

      select.style.borderColor = '#28a745';
      setTimeout(() => {
        select.style.borderColor = '';
      }, 1000);
    } else {
      throw new Error(data.error || 'Update failed');
    }
  } catch (error) {
    console.error(`Error updating ${field}:`, error);

    select.style.borderColor = '#dc3545';
    setTimeout(() => {
      select.style.borderColor = '';
    }, 2000);

    if (window.showErrorMessage) {
      window.showErrorMessage(`Failed to update ${field}: ${error.message}`);
    }
  } finally {
    select.disabled = false;
    select.style.opacity = '';
  }
}

/**
 * Extract images for current product in modal
 */
async function extractCurrentProductImages(event) {
    const modal = document.getElementById('editProductModal');
    const currentRow = modal.dataset.currentRow;

    if (!currentRow || !productsData[currentRow]) {
        showErrorMessage('No product data available for image extraction');
        return;
    }

    const product = productsData[currentRow];
    const productUrl = product.url || product.product_url || product.link;

    if (!productUrl) {
        showErrorMessage('No product URL found for image extraction.');
        return;
    }

    console.log(`Extracting images for product row ${currentRow} from ${productUrl}`);

    const loadingId = window.aiLoadingManager ?
        window.aiLoadingManager.startAIExtraction(event ? event.target : null) : null;

    const statusBadge = document.getElementById('modalStatusBadge');
    if (statusBadge) {
        statusBadge.textContent = 'Extracting Images...';
        statusBadge.className = 'badge bg-warning ms-3';
        statusBadge.style.display = 'inline';
    }

    try {
        const response = await fetch(`/api/smart_toilets/products/${currentRow}/extract-images`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_url: productUrl })
        });

        const result = await response.json();

        if (result.success) {
            if (loadingId && window.aiLoadingManager) {
                window.aiLoadingManager.stopLoading(loadingId);
            }

            if (statusBadge) {
                statusBadge.textContent = 'Images Extracted';
                statusBadge.className = 'badge bg-success ms-3';
            }

            showSuccessMessage(`Extracted ${result.image_count || 0} images successfully!`);

            if (!window.liveUpdatesManager || !window.liveUpdatesManager.isLiveUpdatesActive()) {
                if (window.liveUpdatesManager) {
                    window.liveUpdatesManager.refreshModalData();
                }
            }
        } else {
            throw new Error(result.error || 'Failed to extract images');
        }

    } catch (error) {
        console.error('Error extracting images:', error);

        if (loadingId && window.aiLoadingManager) {
            window.aiLoadingManager.stopLoading(loadingId);
        }

        if (statusBadge) {
            statusBadge.textContent = 'Image Extraction Failed';
            statusBadge.className = 'badge bg-danger ms-3';
        }
        showErrorMessage(`Failed to extract images: ${error.message}`);
    }
}

/**
 * Extract single product with status animation
 */
async function extractSingleProductWithStatus(event) {
    event.preventDefault();
    const rowNum = document.getElementById('editRowNum').value;
    if (!rowNum) {
        showErrorMessage('No product row selected');
        return;
    }

    console.log(`Starting AI extraction for product ${rowNum}`);

    const loadingId = window.aiLoadingManager ?
        window.aiLoadingManager.startAIExtraction(event ? event.target : null) : null;

    const statusBadge = document.getElementById('modalStatusBadge');
    if (statusBadge) {
        statusBadge.textContent = 'Extracting...';
        statusBadge.className = 'badge bg-warning ms-3';
        statusBadge.style.display = 'inline';
    }

    try {
        const response = await fetch(`/api/smart_toilets/products/${rowNum}/extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ overwrite_mode: true })
        });

        const result = await response.json();

        if (result.success) {
            console.log('AI extraction successful');

            if (loadingId && window.aiLoadingManager) {
                window.aiLoadingManager.stopLoading(loadingId);
            }

            if (statusBadge) {
                statusBadge.textContent = 'Extraction Complete';
                statusBadge.className = 'badge bg-success ms-3';
            }

            showSuccessMessage('AI extraction completed successfully!');

            const modal = document.getElementById('editProductModal');
            const currentRow = modal?.dataset?.currentRow;

            if (currentRow) {
                setTimeout(async () => {
                    console.log('Refreshing modal after extraction...');
                    if (window.refreshModalAfterExtraction) {
                        await window.refreshModalAfterExtraction(currentRow);
                    }
                }, 5000);
            }
        } else {
            const errorMsg = result.message || 'AI extraction failed';
            console.error('AI extraction failed:', errorMsg);

            if (loadingId && window.aiLoadingManager) {
                window.aiLoadingManager.stopLoading(loadingId);
            }

            if (statusBadge) {
                statusBadge.textContent = 'Extraction Failed';
                statusBadge.className = 'badge bg-danger ms-3';
            }

            showErrorMessage('Failed to extract: ' + errorMsg);
        }

    } catch (error) {
        console.error('AI extraction error:', error);

        if (loadingId && window.aiLoadingManager) {
            window.aiLoadingManager.stopLoading(loadingId);
        }

        if (statusBadge) {
            statusBadge.textContent = 'Extraction Failed';
            statusBadge.className = 'badge bg-danger ms-3';
        }

        showErrorMessage('Failed to extract: ' + error.message);
    }
}

/**
 * Validate spec sheet URL
 */
function validateSpecSheetUrl() {
    const urlInput = document.getElementById('editShopifySpecSheet');
    const url = urlInput.value.trim();

    if (!url) {
        showValidationResult('Please enter a spec sheet URL', 'warning');
        return;
    }

    if (!isValidUrl(url)) {
        showValidationResult('Please enter a valid URL', 'danger');
        return;
    }

    const button = document.querySelector('button[onclick="validateSpecSheetUrl()"]');
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Validating...';
    button.disabled = true;

    const resultDiv = document.getElementById('specSheetValidationResult');
    if (resultDiv) {
        resultDiv.style.display = 'none';
    }

    validateSpecSheetInBackground(url).finally(() => {
        button.innerHTML = originalText;
        button.disabled = false;
    });
}

function showValidationResult(message, type) {
    const resultDiv = document.getElementById('specSheetValidationResult');
    if (!resultDiv) return;

    resultDiv.className = `alert alert-${type}`;
    resultDiv.innerHTML = message;
    resultDiv.style.display = 'block';
}

async function validateSpecSheetInBackground(url) {
    try {
        const modal = document.getElementById('editProductModal');
        const currentRow = modal.dataset.currentRow;

        if (!currentRow) {
            showValidationResult('No product selected for validation', 'warning');
            return;
        }

        const requestData = {
            spec_sheet_url: url,
            row_num: parseInt(currentRow)
        };

        const collectionName = getCurrentCollectionName();
        const response = await fetch(`/api/${collectionName}/validate-spec-sheet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        const data = await response.json();

        if (!response.ok) {
            showValidationResult(`${data.error || 'Validation failed'}`, 'danger');
            return;
        }

        if (data.success) {
            let message = '<strong>Spec sheet validated successfully!</strong><br>';
            if (data.accessible) {
                message += '<span class="text-success">PDF is accessible</span><br>';
            }
            if (data.sku_match) {
                message += '<span class="text-success">SKU matches product</span><br>';
            }
            showValidationResult(message, 'success');
        } else {
            showValidationResult('Validation completed with warnings', 'warning');
        }

    } catch (error) {
        console.error('Error validating spec sheet:', error);
        showValidationResult(`Error: ${error.message}`, 'danger');
    }
}

function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

async function generateTabContentWithAsterisk(tabType) {
    console.log(`Generating ${tabType} with asterisk info...`);

    const modal = document.getElementById('editProductModal');
    const currentRow = modal?.dataset?.currentRow;

    if (!currentRow) {
        showErrorMessage('No product selected');
        return;
    }

    const product = window.productsData ? window.productsData[currentRow] : null;
    if (!product) {
        showErrorMessage('Product data not available');
        return;
    }

    const button = event.target;
    const originalHTML = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Generating...';

    try {
        const response = await fetch(`/api/smart_toilets/products/${currentRow}/generate-content`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content_type: tabType,
                product_data: product,
                include_asterisk: true
            })
        });

        const result = await response.json();

        if (result.success) {
            const textareaId = tabType === 'description' ? 'editBodyHtml' : 'editFeatures';
            const textarea = document.getElementById(textareaId);
            if (textarea && result.content) {
                textarea.value = result.content;
            }

            // Update content completion indicators
            updateContentCompletionIndicators();

            showSuccessMessage(`${tabType.charAt(0).toUpperCase() + tabType.slice(1)} generated successfully!`);
        } else {
            throw new Error(result.error || 'Generation failed');
        }
    } catch (error) {
        console.error(`Error generating ${tabType}:`, error);
        showErrorMessage(`Failed to generate ${tabType}: ${error.message}`);
    } finally {
        button.disabled = false;
        button.innerHTML = originalHTML;
    }
}

async function generateTabContent(tabType) {
    console.log(`Generating ${tabType}...`);

    const modal = document.getElementById('editProductModal');
    const currentRow = modal?.dataset?.currentRow;

    if (!currentRow) {
        showErrorMessage('No product selected');
        return;
    }

    const product = window.productsData ? window.productsData[currentRow] : null;
    if (!product) {
        showErrorMessage('Product data not available');
        return;
    }

    const button = event.target;
    const originalHTML = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Generating...';

    try {
        const response = await fetch(`/api/smart_toilets/products/${currentRow}/generate-content`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content_type: tabType,
                product_data: product,
                include_asterisk: false
            })
        });

        const result = await response.json();

        if (result.success) {
            const fieldMap = {
                'care': 'editCareInstructions',
                'faqs': 'editFaqs'
            };
            const textareaId = fieldMap[tabType];
            const textarea = document.getElementById(textareaId);
            if (textarea && result.content) {
                textarea.value = result.content;
            }

            showSuccessMessage(`${tabType.charAt(0).toUpperCase() + tabType.slice(1)} generated successfully!`);

            // Update content completion indicators
            updateContentCompletionIndicators();
        } else {
            throw new Error(result.error || 'Generation failed');
        }
    } catch (error) {
        console.error(`Error generating ${tabType}:`, error);
        showErrorMessage(`Failed to generate ${tabType}: ${error.message}`);
    } finally {
        button.disabled = false;
        button.innerHTML = originalHTML;
    }
}

/**
 * Update content completion indicators for tabs
 */
function updateContentCompletionIndicators() {
    const contentFields = {
        'description': 'editBodyHtml',
        'features': 'editFeatures',
        'care': 'editCareInstructions',
        'faqs': 'editFaqs',
        'asterisk': 'editAsteriskInfo'
    };

    let completedCount = 0;
    const totalFields = 5;

    Object.entries(contentFields).forEach(([tabName, fieldId]) => {
        const field = document.getElementById(fieldId);
        const checkIcon = document.getElementById(`${tabName}-check`);
        const incompleteIcon = document.getElementById(`${tabName}-incomplete`);

        if (field && field.value && field.value.trim().length > 0) {
            completedCount++;
            if (checkIcon) checkIcon.style.display = 'inline';
            if (incompleteIcon) incompleteIcon.style.display = 'none';
        } else {
            if (checkIcon) checkIcon.style.display = 'none';
            if (incompleteIcon) incompleteIcon.style.display = 'inline';
        }
    });

    const completionStatus = document.getElementById('completionStatus');
    if (completionStatus) {
        completionStatus.innerHTML = `<i class="fas fa-${completedCount === totalFields ? 'check-circle' : 'clock'} me-1"></i>${completedCount}/${totalFields} Complete`;
        completionStatus.className = `badge ${completedCount === totalFields ? 'bg-success' : 'bg-secondary'}`;
    }
}

/**
 * Add new image to the images array
 */
function addNewImage() {
    const urlInput = document.getElementById('newImageUrl');
    const url = urlInput.value.trim();

    if (!url) {
        showErrorMessage('Please enter an image URL');
        return;
    }

    if (!isValidUrl(url)) {
        showErrorMessage('Please enter a valid URL');
        return;
    }

    additionalImagesArray.push(url);

    const hiddenField = document.getElementById('editShopifyImages');
    if (hiddenField) {
        hiddenField.value = additionalImagesArray.join(',');
    }

    urlInput.value = '';

    if (window.displayAdditionalImages) {
        window.displayAdditionalImages(additionalImagesArray);
    }

    const countBadge = document.getElementById('additionalImagesCount');
    if (countBadge) {
        countBadge.textContent = `${additionalImagesArray.length} images`;
    }

    showSuccessMessage('Image added successfully');
}

/**
 * Remove image from the images array
 */
function removeImage(index) {
    if (index >= 0 && index < additionalImagesArray.length) {
        additionalImagesArray.splice(index, 1);

        const hiddenField = document.getElementById('editShopifyImages');
        if (hiddenField) {
            hiddenField.value = additionalImagesArray.join(',');
        }

        if (window.displayAdditionalImages) {
            window.displayAdditionalImages(additionalImagesArray);
        }

        const countBadge = document.getElementById('additionalImagesCount');
        if (countBadge) {
            countBadge.textContent = `${additionalImagesArray.length} images`;
        }
    }
}

// Modal initialization - set up event listeners when modal opens
document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('editProductModal');
    if (modal) {
        modal.addEventListener('shown.bs.modal', function() {
            updateContentCompletionIndicators();

            const contentFields = ['editBodyHtml', 'editFeatures', 'editCareInstructions', 'editFaqs', 'editAsteriskInfo'];
            contentFields.forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field) {
                    field.addEventListener('input', updateContentCompletionIndicators);
                }
            });
        });
    }
});

// Export functions to global scope
window.getCurrentCollectionName = getCurrentCollectionName;
window.collectFormData = collectFormData;
window.saveSmartToiletsProduct = saveSmartToiletsProduct;
window.syncGoogleSheet = syncGoogleSheet;
window.exportSmartToiletSpecs = exportSmartToiletSpecs;
window.updateFieldFromCard = updateFieldFromCard;
window.renderProductSpecs = renderProductSpecs;
window.populateCollectionSpecificFields = populateCollectionSpecificFields;
window.getCollectionSpecificFields = getCollectionSpecificFields;
window.updateContentCompletionIndicators = updateContentCompletionIndicators;
window.extractCurrentProductImages = extractCurrentProductImages;
window.extractSingleProductWithStatus = extractSingleProductWithStatus;
window.validateSpecSheetUrl = validateSpecSheetUrl;
window.generateTabContentWithAsterisk = generateTabContentWithAsterisk;
window.generateTabContent = generateTabContent;
window.addNewImage = addNewImage;
window.removeImage = removeImage;
window.additionalImagesArray = additionalImagesArray;
