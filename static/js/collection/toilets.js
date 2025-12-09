/**
 * Toilets Collection JavaScript
 * Collection-specific functions for toilets products
 */

// Global variable for additional images array
let additionalImagesArray = [];

// Collection-specific field mappings for form elements
// IMPORTANT: These must match the column_mapping in config/collections.py ToiletsCollection
const TOILETS_FIELD_MAPPINGS = {
    // System fields (hidden)
    'editUrl': 'url',
    'editKey': 'key',
    'editId': 'id',
    'editHandle': 'handle',

    // Basic Info (cols 6-8, 11, 17)
    'editTitle': 'title',
    'editSku': 'variant_sku',
    'editVendor': 'vendor',
    'editBrandName': 'brand_name',
    'editStyle': 'style',
    'editModelName': 'model_name',           // col 17 - model/product name

    // Toilet Specifications (actual column names from sheet)
    'editToiletType': 'installation_type',   // col 9 - Close Coupled, Back to Wall, etc.
    'editPanShape': 'trap_type',             // col 13 - S-trap, P-trap, Skew trap
    'editFlushType': 'actuation_type',       // col 14 - Dual Flush, Single Flush
    'editSeatType': 'toilet_seat_type',      // col 27 - Soft Close, Standard, etc.
    'editRimDesign': 'toilet_rim_design',    // col 28 - Rimless, Standard, etc.
    'editInletType': 'inlet_type',           // col 15 - water inlet position
    'editMaterial': 'product_material',      // col 10 - Ceramic, Vitreous China
    'editWarrantyYears': 'warranty_years',   // col 12

    // Dimensions (cols 18-21)
    'editDimensions': 'overall_width_depth_height_mm',  // col 18 - combined dimensions
    'editHeight': 'pan_height',              // col 19 - pan height (mm)
    'editDepth': 'pan_depth',                // col 20 - pan depth (mm)
    'editWidth': 'pan_width',                // col 21 - pan width (mm)

    // Water Performance & WELS (cols 16, 24-25)
    'editWelsRating': 'wels_rating',                    // col 16 - WELS star rating
    'editWelsRegistration': 'wels_product_registration_number',  // col 25
    'editFlowRate': 'flow_rate_L_per_min',              // col 24 - flow rate

    // Location (col 26)
    'editApplicationLocation': 'application_location',  // col 26

    // Content (in tabs) - NOTE: cols 45-47 are beyond sheet but needed for UI
    'editBodyHtml': 'body_html',
    'editFeatures': 'features',
    'editCareInstructions': 'care_instructions',
    'editFaqs': 'faqs',                      // col 44
    'editAsteriskInfo': 'asterisk_info',     // UI only, not in sheet

    // System fields (hidden)
    'editQualityScore': 'quality_score',

    // Shopify Fields (cols 29-37)
    'editShopifyStatus': 'shopify_status',
    'editShopifyPrice': 'shopify_price',
    'editShopifyImages': 'shopify_images',              // col 33
    'editShopifySpecSheet': 'shopify_spec_sheet',       // col 34
    'editShopifyComparePrice': 'shopify_compare_price',
    'editShopifyWeight': 'shopify_weight',              // col 29
    'editShopifyTags': 'shopify_tags',                  // col 30

    // SEO (cols 31-32)
    'editSeoTitle': 'seo_title',
    'editSeoDescription': 'seo_description',

    // System fields (hidden)
    'editShopifyCollections': 'shopify_collections',    // col 35
    'editShopifyUrl': 'shopify_url',                    // col 36
    'editLastShopifySync': 'last_shopify_sync',         // col 37
    'editCleanData': 'clean_data',                      // col 43
};

/**
 * Get current collection name
 */
function getCurrentCollectionName() {
    // Try to get from hidden field first
    const collectionField = document.getElementById('editCollectionName');
    if (collectionField && collectionField.value) {
        return collectionField.value;
    }

    // Fall back to window.COLLECTION_NAME or default
    return window.COLLECTION_NAME || 'toilets';
}

/**
 * Collect all form data for saving
 */
function collectFormData() {
    const formData = {};

    // Collect all mapped fields
    Object.entries(TOILETS_FIELD_MAPPINGS).forEach(([fieldId, dataKey]) => {
        const element = document.getElementById(fieldId);
        if (element) {
            formData[dataKey] = element.value || '';
        }
    });

    // Handle additional images array
    if (additionalImagesArray && additionalImagesArray.length > 0) {
        formData.shopify_images = additionalImagesArray.join(',');
    }

    console.log('🚽 Collected toilets form data:', formData);
    return formData;
}

/**
 * Save toilets product
 */
async function saveToiletsProduct() {
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

            // Update local cache
            if (window.productsData && window.productsData[rowNum]) {
                Object.assign(window.productsData[rowNum], formData);
            }

            // Trigger refresh if available
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

  // Show loading indicator
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
      showSuccessMessage(`✅ Google Sheet synced! Loaded ${data.products_loaded} products in ${data.duration}s`);

      // Clear all caches and force fresh reload
      setTimeout(() => {
        // Clear background cache
        if (window.backgroundCache) {
          window.backgroundCache = {};
        }

        // Force refresh with cache busting
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
 * Export toilet specifications to CSV
 */
function exportToiletSpecs() {
    console.log('Exporting toilet specifications...');
    showInfoMessage('ℹ️ Export feature will be available soon');
}

/**
 * Render toilet-specific product specifications for product cards
 * Displays key toilet specs on collection page cards
 */
function renderProductSpecs(product) {
    const rowNum = product.row_number;
    const specs = [];

    // Installation Type - editable dropdown (maps to installation_type column)
    // Values match Google Sheet exactly
    specs.push({
        label: 'Type',
        html: `<select class="spec-dropdown" data-row="${rowNum}" data-field="installation_type" onchange="updateFieldFromCard(event)" onclick="event.stopPropagation()">
            <option value="">Select...</option>
            <option value="Back to Wall" ${product.installation_type === 'Back to Wall' ? 'selected' : ''}>Back to Wall</option>
            <option value="Close Coupled" ${product.installation_type === 'Close Coupled' ? 'selected' : ''}>Close Coupled</option>
            <option value="Floor Mounted" ${product.installation_type === 'Floor Mounted' ? 'selected' : ''}>Floor Mounted</option>
            <option value="Wall Faced" ${product.installation_type === 'Wall Faced' ? 'selected' : ''}>Wall Faced</option>
            <option value="Wall Hung" ${product.installation_type === 'Wall Hung' ? 'selected' : ''}>Wall Hung</option>
        </select>`
    });

    // Trap Type - editable dropdown (maps to trap_type column)
    // Values match Google Sheet exactly
    specs.push({
        label: 'Trap',
        html: `<select class="spec-dropdown" data-row="${rowNum}" data-field="trap_type" onchange="updateFieldFromCard(event)" onclick="event.stopPropagation()">
            <option value="">Select...</option>
            <option value="P-Trap" ${product.trap_type === 'P-Trap' ? 'selected' : ''}>P-Trap</option>
            <option value="S-Trap" ${product.trap_type === 'S-Trap' ? 'selected' : ''}>S-Trap</option>
            <option value="S & P-Trap" ${product.trap_type === 'S & P-Trap' ? 'selected' : ''}>S & P-Trap</option>
        </select>`
    });

    // Actuation Type - editable dropdown (maps to actuation_type column)
    // Values match Google Sheet exactly
    specs.push({
        label: 'Flush',
        html: `<select class="spec-dropdown" data-row="${rowNum}" data-field="actuation_type" onchange="updateFieldFromCard(event)" onclick="event.stopPropagation()">
            <option value="">Select...</option>
            <option value="Dual Flush" ${product.actuation_type === 'Dual Flush' ? 'selected' : ''}>Dual Flush</option>
            <option value="HygienicFlush" ${product.actuation_type === 'HygienicFlush' ? 'selected' : ''}>HygienicFlush</option>
            <option value="Mechanical flush" ${product.actuation_type === 'Mechanical flush' ? 'selected' : ''}>Mechanical flush</option>
            <option value="TwistFlush" ${product.actuation_type === 'TwistFlush' ? 'selected' : ''}>TwistFlush</option>
        </select>`
    });

    // WELS Rating
    if (product.wels_rating) {
        specs.push({
            label: 'WELS',
            value: product.wels_rating,
            badge: 'wels-badge'
        });
    }

    // Flow Rate (maps to flow_rate_L_per_min column)
    if (product.flow_rate_L_per_min) {
        specs.push({
            label: 'Flow Rate',
            value: `${product.flow_rate_L_per_min} L/min`
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
 * Populate toilet-specific fields in modal
 */
function populateCollectionSpecificFields(data) {
    console.log('🚽 Populating toilet-specific fields:', data);

    // Initialize images array from data
    if (data.shopify_images) {
        additionalImagesArray = data.shopify_images.split(',').map(url => url.trim()).filter(url => url);
    } else {
        additionalImagesArray = [];
    }

    // Map all toilet-specific fields
    Object.entries(TOILETS_FIELD_MAPPINGS).forEach(([fieldId, dataKey]) => {
        const element = document.getElementById(fieldId);
        if (element && data[dataKey] !== undefined) {
            if (element.tagName === 'SELECT') {
                // Handle select elements - find matching option
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
 * Get updated toilet-specific fields from modal
 */
function getCollectionSpecificFields() {
    const fields = {};

    Object.entries(TOILETS_FIELD_MAPPINGS).forEach(([fieldId, dataKey]) => {
        const element = document.getElementById(fieldId);
        if (element) {
            fields[dataKey] = element.value || '';
        }
    });

    console.log('🚽 Collected toilet-specific fields:', fields);
    return fields;
}

/**
 * Update a field directly from the product card dropdown
 * Saves to backend immediately without opening modal
 */
async function updateFieldFromCard(event) {
  event.stopPropagation(); // Prevent card click from opening modal

  const select = event.target;
  const rowNum = parseInt(select.getAttribute('data-row'));
  const field = select.getAttribute('data-field');
  const newValue = select.value;

  console.log(`📝 Updating ${field} for row ${rowNum} to: ${newValue}`);

  // Show loading state
  select.disabled = true;
  select.style.opacity = '0.6';

  try {
    // Save to backend
    const response = await fetch(`/api/${window.COLLECTION_NAME || 'toilets'}/products/${rowNum}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field: field,
        value: newValue
      })
    });

    const data = await response.json();

    if (data.success) {
      console.log(`✅ Successfully updated ${field} for row ${rowNum}`);

      // Update local cache
      if (window.productsData && window.productsData[rowNum]) {
        window.productsData[rowNum][field] = newValue;
      }
      if (window.allProductsCache && window.allProductsCache[rowNum]) {
        window.allProductsCache[rowNum][field] = newValue;
      }

      // Show brief success feedback
      select.style.borderColor = '#28a745';
      setTimeout(() => {
        select.style.borderColor = '';
      }, 1000);
    } else {
      throw new Error(data.error || 'Update failed');
    }
  } catch (error) {
    console.error(`❌ Error updating ${field}:`, error);

    // Show error feedback
    select.style.borderColor = '#dc3545';
    setTimeout(() => {
      select.style.borderColor = '';
    }, 2000);

    // Optionally show error message
    if (window.showErrorMessage) {
      window.showErrorMessage(`Failed to update ${field}: ${error.message}`);
    }
  } finally {
    // Re-enable dropdown
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
        showErrorMessage('No product URL found for image extraction. Please add a URL to this product first.');
        return;
    }

    console.log(`🖼️ Extracting images for product row ${currentRow} from ${productUrl}`);

    // Start AI loading animation for image extraction
    const loadingId = window.aiLoadingManager ?
        window.aiLoadingManager.startAIExtraction(event ? event.target : null) : null;

    // Show status in modal
    const statusBadge = document.getElementById('modalStatusBadge');
    if (statusBadge) {
        statusBadge.textContent = 'Extracting Images...';
        statusBadge.className = 'badge bg-warning ms-3';
        statusBadge.style.display = 'inline';
    }

    try {
        const response = await fetch(`/api/toilets/products/${currentRow}/extract-images`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                product_url: productUrl
            })
        });

        const result = await response.json();

        if (result.success) {
            // Stop loading animation
            if (loadingId && window.aiLoadingManager) {
                window.aiLoadingManager.stopLoading(loadingId);
            }

            if (statusBadge) {
                statusBadge.textContent = 'Images Extracted';
                statusBadge.className = 'badge bg-success ms-3';
            }

            showSuccessMessage(`✅ Extracted ${result.image_count || 0} images successfully!`);

            // Live updates will handle the data refresh
            console.log('🔄 Image extraction complete, waiting for live updates...');

            // If live updates are not available, manually refresh modal data
            if (!window.liveUpdatesManager || !window.liveUpdatesManager.isLiveUpdatesActive()) {
                console.log('🔄 Live updates not active, manually refreshing modal...');
                if (window.liveUpdatesManager) {
                    window.liveUpdatesManager.refreshModalData();
                }
            }
        } else {
            throw new Error(result.error || 'Failed to extract images');
        }

    } catch (error) {
        console.error('Error extracting images:', error);

        // Stop loading animation on error
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

    console.log(`🤖 Starting AI extraction for product ${rowNum}`);

    // Start AI loading animation for extraction
    const loadingId = window.aiLoadingManager ?
        window.aiLoadingManager.startAIExtraction(event ? event.target : null) : null;

    // Show status in modal
    const statusBadge = document.getElementById('modalStatusBadge');
    if (statusBadge) {
        statusBadge.textContent = 'Extracting...';
        statusBadge.className = 'badge bg-warning ms-3';
        statusBadge.style.display = 'inline';
    }

    try {
        // Call the single product AI extraction endpoint
        const response = await fetch(`/api/toilets/products/${rowNum}/extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                overwrite_mode: true
            })
        });

        const result = await response.json();

        // Debug logging - show full response
        console.log('🔍 Full API response:', result);
        console.log('🔍 Response status:', response.status);
        console.log('🔍 Error message:', result.message);
        console.log('🔍 URL used:', result.url);

        if (result.success) {
            console.log('✅ AI extraction successful');

            // Stop loading animation
            if (loadingId && window.aiLoadingManager) {
                window.aiLoadingManager.stopLoading(loadingId);
            }

            if (statusBadge) {
                statusBadge.textContent = 'Extraction Complete';
                statusBadge.className = 'badge bg-success ms-3';
            }

            showSuccessMessage('✅ AI extraction completed successfully!');

            const modal = document.getElementById('editProductModal');
            const currentRow = modal?.dataset?.currentRow;

            if (currentRow) {
                // Wait for Google Apps Script to process the data
                setTimeout(async () => {
                    console.log('🔄 Refreshing modal after Google Apps Script processing...');
                    if (window.refreshModalAfterExtraction) {
                        await window.refreshModalAfterExtraction(currentRow);
                    }
                }, 5000);
            }
        } else {
            // Extraction failed - show detailed error message
            const errorMsg = result.message || 'AI extraction failed';
            console.error('❌ AI extraction failed:', errorMsg);

            // Stop loading animation
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
        console.error('❌ AI extraction error:', error);

        // Stop loading animation on error
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

    // Show loading state
    const button = document.querySelector('button[onclick="validateSpecSheetUrl()"]');
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Validating...';
    button.disabled = true;

    // Clear previous results
    const resultDiv = document.getElementById('specSheetValidationResult');
    if (resultDiv) {
        resultDiv.style.display = 'none';
    }

    // Run validation and reset button afterwards
    validateSpecSheetInBackground(url).finally(() => {
        button.innerHTML = originalText;
        button.disabled = false;
    });
}

/**
 * Show validation result message
 */
function showValidationResult(message, type) {
    const resultDiv = document.getElementById('specSheetValidationResult');
    if (!resultDiv) return;

    resultDiv.className = `alert alert-${type}`;
    resultDiv.innerHTML = message;
    resultDiv.style.display = 'block';
}

/**
 * Validate spec sheet URL in background with API call
 */
async function validateSpecSheetInBackground(url) {
    try {
        const modal = document.getElementById('editProductModal');
        const currentRow = modal.dataset.currentRow;

        if (!currentRow) {
            showValidationResult('⚠️ No product selected for validation', 'warning');
            return;
        }

        const requestData = {
            spec_sheet_url: url,
            row_num: parseInt(currentRow)
        };

        const collectionName = getCurrentCollectionName();
        const response = await fetch(`/api/${collectionName}/validate-spec-sheet`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });

        const data = await response.json();

        if (!response.ok) {
            showValidationResult(`❌ ${data.error || 'Validation failed'}`, 'danger');
            return;
        }

        if (data.success) {
            let message = '<strong>✅ Spec sheet validated successfully!</strong><br>';
            if (data.accessible) {
                message += '<span class="text-success">• PDF is accessible</span><br>';
            }
            if (data.sku_match) {
                message += '<span class="text-success">• SKU matches product</span><br>';
            }
            showValidationResult(message, 'success');
        } else {
            showValidationResult('⚠️ Validation completed with warnings', 'warning');
        }

    } catch (error) {
        console.error('Error validating spec sheet:', error);
        showValidationResult(`❌ Error: ${error.message}`, 'danger');
    }
}

/**
 * Check if URL is valid
 */
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * Generate tab content with asterisk info (for description and features)
 */
async function generateTabContentWithAsterisk(tabType) {
    console.log(`🤖 Generating ${tabType} with asterisk info...`);

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

    // Show loading state
    const button = event.target;
    const originalHTML = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Generating...';

    try {
        const response = await fetch(`/api/toilets/products/${currentRow}/generate-content`, {
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
            // Update the textarea
            const textareaId = tabType === 'description' ? 'editBodyHtml' : 'editFeatures';
            const textarea = document.getElementById(textareaId);
            if (textarea && result.content) {
                textarea.value = result.content;
            }

            // Update content completion indicators
            updateContentCompletionIndicators();

            showSuccessMessage(`✅ ${tabType.charAt(0).toUpperCase() + tabType.slice(1)} generated successfully!`);
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
 * Generate tab content (for care instructions and FAQs)
 */
async function generateTabContent(tabType) {
    console.log(`🤖 Generating ${tabType}...`);

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

    // Show loading state
    const button = event.target;
    const originalHTML = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Generating...';

    try {
        const response = await fetch(`/api/toilets/products/${currentRow}/generate-content`, {
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
            // Update the textarea
            const fieldMap = {
                'care': 'editCareInstructions',
                'faqs': 'editFaqs'
            };
            const textareaId = fieldMap[tabType];
            const textarea = document.getElementById(textareaId);
            if (textarea && result.content) {
                textarea.value = result.content;
            }

            showSuccessMessage(`✅ ${tabType.charAt(0).toUpperCase() + tabType.slice(1)} generated successfully!`);

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

    // Update completion badge
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

    // Add to array
    additionalImagesArray.push(url);

    // Update hidden field
    const hiddenField = document.getElementById('editShopifyImages');
    if (hiddenField) {
        hiddenField.value = additionalImagesArray.join(',');
    }

    // Clear input
    urlInput.value = '';

    // Refresh display
    if (window.displayAdditionalImages) {
        window.displayAdditionalImages(additionalImagesArray);
    }

    // Update count badge
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

        // Update hidden field
        const hiddenField = document.getElementById('editShopifyImages');
        if (hiddenField) {
            hiddenField.value = additionalImagesArray.join(',');
        }

        // Refresh display
        if (window.displayAdditionalImages) {
            window.displayAdditionalImages(additionalImagesArray);
        }

        // Update count badge
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
            // Update content completion indicators when modal opens
            updateContentCompletionIndicators();

            // Set up input listeners for real-time completion tracking
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
window.saveToiletsProduct = saveToiletsProduct;
window.syncGoogleSheet = syncGoogleSheet;
window.exportToiletSpecs = exportToiletSpecs;
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
