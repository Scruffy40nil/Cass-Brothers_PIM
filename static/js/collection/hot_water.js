/**
 * Hot Water Collection JavaScript
 * Collection-specific functions for hot water products
 */

// Collection-specific field mappings for form elements
const FILTER_TAPS_FIELD_MAPPINGS = {
    // System fields (hidden)
    'editUrl': 'url',
    'editKey': 'key',
    'editId': 'id',
    'editHandle': 'handle',

    // Basic Info
    'editTitle': 'title',
    'editSku': 'variant_sku',
    'editVendor': 'vendor',
    'editBrand': 'brand',
    'editRange': 'range',
    'editStyle': 'style',

    // Filter Tap Specifications
    'editMountingType': 'mounting_type',
    'editColourFinish': 'colour_finish',
    'editUnderbenchUnitDimensions': 'underbench_unit_dimensions',
    'editCapacity': 'capacity',
    'editCommercial': 'commercial',
    'editResidential': 'residential',

    // Water Features
    'editHasSparkling': 'has_sparkling',
    'editHasBoiling': 'has_boiling',
    'editHasChilled': 'has_chilled',
    'editHasAmbient': 'has_ambient',
    'editHasHot': 'has_hot',
    'editHasCold': 'has_cold',

    // Materials and Construction
    'editMaterial': 'material',
    'editWarranty': 'warranty',

    // Dimensions
    'editSpoutHeightMm': 'spout_height_mm',
    'editSpoutReachMm': 'spout_reach_mm',
    'editHandleType': 'handle_type',
    'editHandleCount': 'handle_count',
    'editSwivelSpout': 'swivel_spout',

    // Technical Specs
    'editCartridgeType': 'cartridge_type',
    'editFlowRate': 'flow_rate',
    'editMinPressureKpa': 'min_pressure_kpa',
    'editMaxPressureKpa': 'max_pressure_kpa',

    // Certifications
    'editWelsRating': 'wels_rating',
    'editWelsRegistrationNumber': 'wels_registration_number',
    'editWatermarkCertification': 'watermark_certification',
    'editLeadFreeCompliance': 'lead_free_compliance',

    // Location
    'editLocation': 'location',

    // Content (in tabs)
    'editBodyHtml': 'body_html',
    'editFeatures': 'features',
    'editCareInstructions': 'care_instructions',
    'editFaqs': 'faqs',

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
    'editCleanData': 'clean_data',
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
    return window.COLLECTION_NAME || 'hot_water';
}

/**
 * Sync Google Sheet - reload data from Google Sheets
 */
async function syncGoogleSheet() {
  const collectionName = getCurrentCollectionName();

  const btn = event?.target?.closest('button');
  if (btn) {
    const originalHTML = btn.innerHTML;
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
      showSuccessMessage('Google Sheet synced successfully! Reloading page...');

      // Wait a moment, then reload the page with cache busting
      setTimeout(() => {
        // Clear any cached data
        if (window.productsCache) {
          window.productsCache = null;
        }
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
 * Export filter tap specifications to CSV
 */
function exportFilterTapSpecs() {
    const collectionName = getCurrentCollectionName();

    showSuccessMessage('Preparing export...');

    // Create CSV headers
    const headers = [
        'SKU', 'Title', 'Brand', 'Range', 'Style', 'Mounting Type',
        'Colour/Finish', 'Capacity', 'Material', 'Warranty',
        'Sparkling', 'Boiling', 'Chilled', 'Ambient', 'Hot', 'Cold',
        'Spout Height (mm)', 'Spout Reach (mm)', 'Handle Type', 'Handle Count',
        'Flow Rate', 'Min Pressure (kPa)', 'Max Pressure (kPa)',
        'WELS Rating', 'WaterMark', 'Location', 'Shopify Status'
    ];

    // Get all products
    const products = window.allProducts || [];

    // Create CSV rows
    const rows = products.map(product => [
        product.variant_sku || '',
        product.title || '',
        product.brand || '',
        product.range || '',
        product.style || '',
        product.mounting_type || '',
        product.colour_finish || '',
        product.capacity || '',
        product.material || '',
        product.warranty || '',
        product.has_sparkling || '',
        product.has_boiling || '',
        product.has_chilled || '',
        product.has_ambient || '',
        product.has_hot || '',
        product.has_cold || '',
        product.spout_height_mm || '',
        product.spout_reach_mm || '',
        product.handle_type || '',
        product.handle_count || '',
        product.flow_rate || '',
        product.min_pressure_kpa || '',
        product.max_pressure_kpa || '',
        product.wels_rating || '',
        product.watermark_certification || '',
        product.location || '',
        product.shopify_status || ''
    ]);

    // Combine headers and rows
    const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `filter_taps_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showSuccessMessage(`Exported ${products.length} hot water to CSV`);
}

/**
 * Render product specifications on the card
 */
function renderProductSpecs(product) {
    const rowNum = product.row_number;
    const specs = [];

    // Mounting Type - editable dropdown
    specs.push({
        label: 'Mounting',
        html: `<select class="spec-dropdown" data-row="${rowNum}" data-field="mounting_type" onchange="updateFieldFromCard(event)" onclick="event.stopPropagation()">
            <option value="">Select...</option>
            <option value="Deck-mounted" ${product.mounting_type === 'Deck-mounted' ? 'selected' : ''}>Deck-mounted</option>
            <option value="Wall-mounted" ${product.mounting_type === 'Wall-mounted' ? 'selected' : ''}>Wall-mounted</option>
            <option value="Undermount" ${product.mounting_type === 'Undermount' ? 'selected' : ''}>Undermount</option>
        </select>`
    });

    // Colour/Finish
    if (product.colour_finish) {
        specs.push({
            label: 'Finish',
            value: product.colour_finish
        });
    }

    // Water Features (show as badges)
    const waterFeatures = [];
    if (product.has_sparkling === 'Yes') waterFeatures.push('Sparkling');
    if (product.has_boiling === 'Yes') waterFeatures.push('Boiling');
    if (product.has_chilled === 'Yes') waterFeatures.push('Chilled');
    if (product.has_ambient === 'Yes') waterFeatures.push('Ambient');
    if (product.has_hot === 'Yes') waterFeatures.push('Hot');
    if (product.has_cold === 'Yes') waterFeatures.push('Cold');

    if (waterFeatures.length > 0) {
        specs.push({
            label: 'Features',
            html: waterFeatures.map(f => `<span class="badge bg-info me-1">${f}</span>`).join('')
        });
    }

    // Capacity
    if (product.capacity) {
        specs.push({
            label: 'Capacity',
            value: product.capacity
        });
    }

    // Spout Height & Reach
    if (product.spout_height_mm || product.spout_reach_mm) {
        specs.push({
            label: 'Spout',
            value: `H: ${product.spout_height_mm || '?'}mm / R: ${product.spout_reach_mm || '?'}mm`
        });
    }

    // Flow Rate
    if (product.flow_rate) {
        specs.push({
            label: 'Flow Rate',
            value: product.flow_rate
        });
    }

    // WELS Rating
    if (product.wels_rating) {
        specs.push({
            label: 'WELS',
            value: product.wels_rating
        });
    }

    // Material
    if (product.material) {
        specs.push({
            label: 'Material',
            value: product.material
        });
    }

    // Warranty
    if (product.warranty) {
        specs.push({
            label: 'Warranty',
            value: product.warranty
        });
    }

    return specs;
}

/**
 * Populate collection-specific fields in the modal
 */
function populateCollectionSpecificFields(data) {
    // Use the field mappings to populate all fields
    Object.entries(FILTER_TAPS_FIELD_MAPPINGS).forEach(([elementId, fieldName]) => {
        const element = document.getElementById(elementId);
        if (element) {
            const value = data[fieldName];
            if (element.type === 'checkbox') {
                element.checked = value === 'Yes' || value === true || value === 'true';
            } else {
                element.value = value || '';
            }
        }
    });

    // Update modal title
    const titleElement = document.getElementById('editProductTitle');
    if (titleElement) {
        titleElement.textContent = data.title || 'Unknown Product';
    }
}

/**
 * Get collection-specific fields from the modal form
 */
function getCollectionSpecificFields() {
    const fields = {};

    // Use the field mappings to collect all field values
    Object.entries(FILTER_TAPS_FIELD_MAPPINGS).forEach(([elementId, fieldName]) => {
        const element = document.getElementById(elementId);
        if (element) {
            if (element.type === 'checkbox') {
                fields[fieldName] = element.checked ? 'Yes' : 'No';
            } else {
                fields[fieldName] = element.value;
            }
        }
    });

    return fields;
}

/**
 * Validate spec sheet URL
 */
async function validateSpecSheetUrl() {
    const collectionName = getCurrentCollectionName();
    const urlInput = document.getElementById('editShopifySpecSheet');
    const resultDiv = document.getElementById('specSheetValidationResult');
    const statusBadge = document.getElementById('specSheetStatus');

    if (!urlInput || !urlInput.value) {
        resultDiv.innerHTML = '<div class="alert alert-warning">Please enter a URL</div>';
        resultDiv.style.display = 'block';
        return;
    }

    const url = urlInput.value;

    // Show loading
    resultDiv.innerHTML = '<div class="alert alert-info"><i class="fas fa-spinner fa-spin me-2"></i>Validating...</div>';
    resultDiv.style.display = 'block';

    try {
        const response = await fetch(`/api/${collectionName}/validate-spec-sheet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url })
        });

        const data = await response.json();

        if (data.valid) {
            resultDiv.innerHTML = `
                <div class="alert alert-success">
                    <i class="fas fa-check-circle me-2"></i>Valid spec sheet URL
                    ${data.file_type ? `<br><small>File type: ${data.file_type}</small>` : ''}
                    ${data.file_size ? `<br><small>File size: ${(data.file_size / 1024).toFixed(2)} KB</small>` : ''}
                </div>
            `;
            statusBadge.textContent = 'Valid spec sheet';
            statusBadge.className = 'badge bg-success ms-2';
        } else {
            resultDiv.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-times-circle me-2"></i>Invalid or inaccessible URL
                    ${data.error ? `<br><small>${data.error}</small>` : ''}
                </div>
            `;
            statusBadge.textContent = 'Invalid spec sheet';
            statusBadge.className = 'badge bg-danger ms-2';
        }
    } catch (error) {
        resultDiv.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-times-circle me-2"></i>Error validating URL: ${error.message}
            </div>
        `;
        statusBadge.textContent = 'Validation error';
        statusBadge.className = 'badge bg-danger ms-2';
    }
}

/**
 * Extract single product with status updates
 */
async function extractSingleProductWithStatus(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const collectionName = getCurrentCollectionName();
    const rowNum = document.getElementById('editRowNum')?.value;

    if (!rowNum) {
        showErrorMessage('No product selected for extraction');
        return;
    }

    const btn = event?.target?.closest('button');
    if (btn) {
        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Extracting...';
    }

    try {
        const response = await fetch(`/api/${collectionName}/products/${rowNum}/extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.status === 'success') {
            showSuccessMessage('Product extracted successfully! Reloading data...');

            // Reload the product data
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } else {
            showErrorMessage('Extraction failed: ' + (data.error || 'Unknown error'));
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalHTML;
            }
        }
    } catch (error) {
        showErrorMessage('Error during extraction: ' + error.message);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
        }
    }
}

/**
 * Extract images for current product
 */
async function extractCurrentProductImages(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const collectionName = getCurrentCollectionName();
    const rowNum = document.getElementById('editRowNum')?.value;

    if (!rowNum) {
        showErrorMessage('No product selected for image extraction');
        return;
    }

    const btn = event?.target?.closest('button');
    if (btn) {
        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Extracting Images...';
    }

    try {
        const response = await fetch(`/api/${collectionName}/products/${rowNum}/extract-images`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.status === 'success') {
            showSuccessMessage('Images extracted successfully! Reloading data...');

            // Reload the product data
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } else {
            showErrorMessage('Image extraction failed: ' + (data.error || 'Unknown error'));
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalHTML;
            }
        }
    } catch (error) {
        showErrorMessage('Error during image extraction: ' + error.message);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
        }
    }
}

/**
 * Generate content for a specific tab using AI
 */
async function generateTabContent(tabType) {
    const collectionName = getCurrentCollectionName();
    const rowNum = document.getElementById('editRowNum')?.value;

    if (!rowNum) {
        showErrorMessage('No product selected');
        return;
    }

    showSuccessMessage(`Generating ${tabType}...`);

    try {
        const response = await fetch(`/api/${collectionName}/products/${rowNum}/generate-content`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content_type: tabType })
        });

        const data = await response.json();

        if (data.status === 'success') {
            // Update the appropriate field
            let fieldId;
            if (tabType === 'description') fieldId = 'editBodyHtml';
            else if (tabType === 'features') fieldId = 'editFeatures';
            else if (tabType === 'care') fieldId = 'editCareInstructions';
            else if (tabType === 'faqs') fieldId = 'editFaqs';

            if (fieldId) {
                const field = document.getElementById(fieldId);
                if (field) {
                    field.value = data.content;
                    showSuccessMessage(`${tabType} generated successfully!`);
                }
            }
        } else {
            showErrorMessage('Generation failed: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        showErrorMessage('Error generating content: ' + error.message);
    }
}

/**
 * Show bulk PDF extraction modal and load statistics
 */
async function showBulkPdfExtractionModal() {
    const modal = new bootstrap.Modal(document.getElementById('bulkPdfExtractionModal'));
    modal.show();

    // Reset UI
    document.getElementById('bulkPdfProgressContainer').style.display = 'none';
    document.getElementById('bulkPdfResults').style.display = 'none';
    document.getElementById('btnStartBulkExtraction').disabled = false;

    // Load statistics
    try {
        const collectionName = getCurrentCollectionName();
        const response = await fetch(`/api/${collectionName}/count-pdfs`);
        const data = await response.json();

        if (data.success) {
            document.getElementById('statTotalProducts').textContent = data.total_products;
            document.getElementById('statWithPdf').textContent = data.with_pdf;
            document.getElementById('statWithData').textContent = data.with_data;
            document.getElementById('statReadyToExtract').textContent = data.ready_to_extract;
        }
    } catch (error) {
        console.error('Error loading PDF statistics:', error);
    }
}

/**
 * Start bulk PDF extraction
 */
async function startBulkPdfExtraction() {
    const batchSize = parseInt(document.getElementById('bulkPdfBatchSize').value);
    const delaySeconds = parseInt(document.getElementById('bulkPdfDelay').value);
    const overwrite = document.getElementById('bulkPdfOverwrite').checked;

    // Show progress UI
    document.getElementById('bulkPdfProgressContainer').style.display = 'block';
    document.getElementById('bulkPdfResults').style.display = 'none';
    document.getElementById('btnStartBulkExtraction').disabled = true;
    document.getElementById('bulkPdfLog').innerHTML = '';

    // Initialize progress
    const progressBar = document.getElementById('bulkPdfProgressBar');
    progressBar.style.width = '0%';
    progressBar.classList.add('progress-bar-animated');
    progressBar.textContent = '0%';

    document.getElementById('bulkPdfProgressText').textContent =
        'Starting extraction...';

    // Add initial log entry
    const logDiv = document.getElementById('bulkPdfLog');
    const logEntry = document.createElement('div');
    logEntry.className = 'text-info';
    logEntry.textContent = '🚀 Starting bulk PDF extraction in background...';
    logDiv.appendChild(logEntry);

    // Simple progress tracking - just show that it's running
    // (SocketIO doesn't work reliably on PythonAnywhere)
    let estimatedTime = Math.ceil((454 * 3) / 60); // Rough estimate: 454 products * 3 sec each
    document.getElementById('bulkPdfProgressText').textContent =
        `Extraction running in background. Estimated time: ${estimatedTime} minutes. Check server logs for progress.`;

    // Start the bulk extraction
    try {
        const collectionName = getCurrentCollectionName();
        const response = await fetch(`/api/${collectionName}/bulk-extract-pdfs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                batch_size: batchSize,
                delay_seconds: delaySeconds,
                overwrite: overwrite
            })
        });

        const data = await response.json();

        if (data.success) {
            // Show success message
            const successEntry = document.createElement('div');
            successEntry.className = 'text-success';
            successEntry.textContent = '✅ Extraction started successfully!';
            logDiv.appendChild(successEntry);

            const infoEntry = document.createElement('div');
            infoEntry.className = 'text-warning mt-2';
            infoEntry.innerHTML = `
                <strong>Note:</strong> The extraction is running in the background.<br>
                Please wait approximately ${Math.ceil(batchSize * delaySeconds / 60)} minutes, then refresh this page to see the results.
            `;
            logDiv.appendChild(infoEntry);

            // Show results section with message
            document.getElementById('bulkPdfResults').style.display = 'block';
            document.getElementById('resultTotal').textContent = '?';
            document.getElementById('resultSucceeded').textContent = '?';
            document.getElementById('resultFailed').textContent = '?';
            document.getElementById('resultSkipped').textContent = '?';

            // Stop animated progress
            progressBar.classList.remove('progress-bar-animated');
            progressBar.textContent = 'Running in background...';

            document.getElementById('btnStartBulkExtraction').disabled = false;
        } else {
            showErrorMessage('Failed to start bulk extraction: ' + (data.error || 'Unknown error'));
            document.getElementById('btnStartBulkExtraction').disabled = false;
        }
    } catch (error) {
        showErrorMessage('Error starting bulk extraction: ' + error.message);
        document.getElementById('btnStartBulkExtraction').disabled = false;
    }
}

// Export functions for use in other modules
window.getCurrentCollectionName = getCurrentCollectionName;
window.syncGoogleSheet = syncGoogleSheet;
window.exportFilterTapSpecs = exportFilterTapSpecs;
window.renderProductSpecs = renderProductSpecs;
window.populateCollectionSpecificFields = populateCollectionSpecificFields;
window.getCollectionSpecificFields = getCollectionSpecificFields;
window.validateSpecSheetUrl = validateSpecSheetUrl;
window.extractSingleProductWithStatus = extractSingleProductWithStatus;
window.extractCurrentProductImages = extractCurrentProductImages;
window.generateTabContent = generateTabContent;
window.showBulkPdfExtractionModal = showBulkPdfExtractionModal;
window.startBulkPdfExtraction = startBulkPdfExtraction;
