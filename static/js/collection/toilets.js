/**
 * Toilets Collection JavaScript
 * Collection-specific functions for toilets products
 */

// Collection-specific field mappings for form elements (All 48 fields)
const TOILETS_FIELD_MAPPINGS = {
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
    'editRange': 'range',
    'editStyle': 'style',

    // Toilet Specifications
    'editToiletType': 'toilet_type',
    'editPanShape': 'pan_shape',
    'editFlushType': 'flush_type',
    'editSeatType': 'seat_type',
    'editColourFinish': 'colour_finish',
    'editMaterial': 'material',
    'editWarrantyYears': 'warranty_years',

    // Dimensions
    'editHeight': 'height_mm',
    'editWidth': 'width_mm',
    'editDepth': 'depth_mm',

    // Water Performance & WELS
    'editWelsRating': 'wels_rating',
    'editWelsRegistration': 'wels_registration_number',
    'editFullFlush': 'water_usage_full_flush',
    'editHalfFlush': 'water_usage_half_flush',

    // Certifications
    'editWatermarkCert': 'watermark_certification',

    // Content
    'editBodyHtml': 'body_html',
    'editFeatures': 'features',
    'editCareInstructions': 'care_instructions',

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
    'editFaqs': 'faqs',

    // Pricing fields (hidden)
    'editOurCurrentPrice': 'our_current_price',
    'editCompetitorName': 'competitor_name',
    'editCompetitorPrice': 'competitor_price',
    'editPriceLastUpdated': 'price_last_updated',
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

    // Toilet Type - editable dropdown
    specs.push({
        label: 'Type',
        html: `<select class="spec-dropdown" data-row="${rowNum}" data-field="toilet_type" onchange="updateFieldFromCard(event)" onclick="event.stopPropagation()">
            <option value="">Select...</option>
            <option value="Close Coupled" ${product.toilet_type === 'Close Coupled' ? 'selected' : ''}>Close Coupled</option>
            <option value="Back to Wall" ${product.toilet_type === 'Back to Wall' ? 'selected' : ''}>Back to Wall</option>
            <option value="Wall Hung" ${product.toilet_type === 'Wall Hung' ? 'selected' : ''}>Wall Hung</option>
            <option value="In-Wall" ${product.toilet_type === 'In-Wall' ? 'selected' : ''}>In-Wall</option>
        </select>`
    });

    // Pan Shape - editable dropdown
    specs.push({
        label: 'Pan Shape',
        html: `<select class="spec-dropdown" data-row="${rowNum}" data-field="pan_shape" onchange="updateFieldFromCard(event)" onclick="event.stopPropagation()">
            <option value="">Select...</option>
            <option value="S-trap" ${product.pan_shape === 'S-trap' ? 'selected' : ''}>S-trap</option>
            <option value="P-trap" ${product.pan_shape === 'P-trap' ? 'selected' : ''}>P-trap</option>
            <option value="Skew trap" ${product.pan_shape === 'Skew trap' ? 'selected' : ''}>Skew trap</option>
        </select>`
    });

    // Flush Type - editable dropdown
    specs.push({
        label: 'Flush',
        html: `<select class="spec-dropdown" data-row="${rowNum}" data-field="flush_type" onchange="updateFieldFromCard(event)" onclick="event.stopPropagation()">
            <option value="">Select...</option>
            <option value="Dual Flush" ${product.flush_type === 'Dual Flush' ? 'selected' : ''}>Dual Flush</option>
            <option value="Single Flush" ${product.flush_type === 'Single Flush' ? 'selected' : ''}>Single Flush</option>
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

    // Water Usage
    if (product.water_usage_full_flush || product.water_usage_half_flush) {
        const usage = [];
        if (product.water_usage_full_flush) usage.push(`${product.water_usage_full_flush}L`);
        if (product.water_usage_half_flush) usage.push(`${product.water_usage_half_flush}L`);
        specs.push({
            label: 'Water Usage',
            value: usage.join(' / ')
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

    // Map all toilet-specific fields
    Object.entries(TOILETS_FIELD_MAPPINGS).forEach(([fieldId, dataKey]) => {
        const element = document.getElementById(fieldId);
        if (element && data[dataKey] !== undefined) {
            element.value = data[dataKey] || '';
        }
    });
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

// Export functions to global scope
window.getCurrentCollectionName = getCurrentCollectionName;
window.syncGoogleSheet = syncGoogleSheet;
window.exportToiletSpecs = exportToiletSpecs;
window.updateFieldFromCard = updateFieldFromCard;
window.renderProductSpecs = renderProductSpecs;
window.populateCollectionSpecificFields = populateCollectionSpecificFields;
window.getCollectionSpecificFields = getCollectionSpecificFields;
