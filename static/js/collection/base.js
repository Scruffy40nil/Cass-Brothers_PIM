/**
 * Base Collection JavaScript - Shared functionality across all collections
 */

// Global variables
let productsData = {};
let currentFilter = 'all';
let selectedProducts = [];
let modalCurrentImageIndex = 0;
let modalImages = [];

// Pricing field mappings (will be overridden by collection-specific configs)
const PRICING_FIELD_MAPPINGS = {
    ourPrice: 'our_current_price',
    competitorName: 'competitor_name',
    competitorPrice: 'competitor_price',
    lastUpdated: 'price_last_updated'
};

/**
 * Initialize the collection page
 */
function initializeCollection() {
    loadProductsData();
    setupEventListeners();
    updateStatistics();
}

/**
 * Load products data from backend
 */
async function loadProductsData() {
    try {
        showLoadingState();
        const response = await fetch(`/api/${COLLECTION_NAME}/products/all`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        productsData = data.products || {};

        renderProducts();
        updateStatistics();
        hideLoadingState();

    } catch (error) {
        console.error('Error loading products:', error);
        showErrorMessage('Failed to load products: ' + error.message);
        hideLoadingState();
    }
}

/**
 * Render products in the grid
 */
function renderProducts() {
    const container = document.getElementById('productsContainer');
    if (!container) return;

    const filteredProducts = filterProductsByCurrentFilter();

    if (filteredProducts.length === 0) {
        showEmptyState();
        return;
    }

    hideEmptyState();
    container.innerHTML = '';

    filteredProducts.forEach(([rowNumber, product], index) => {
        const productCard = createProductCard(product, product.row_number || rowNumber);
        container.appendChild(productCard);
    });

    // Apply fade-in animation
    container.classList.add('fade-in');
}

/**
 * Create a product card element
 */
function createProductCard(product, rowNum) {
    const card = document.createElement('div');
    card.className = 'col-xl-3 col-lg-4 col-md-6 mb-4';
    card.innerHTML = `
        <div class="product-card ${getQualityClass(product)}" data-row="${rowNum}" onclick="editProduct(${rowNum})">
            <input type="checkbox" class="form-check-input product-checkbox" data-row="${rowNum}" onclick="event.stopPropagation()">
            <div class="quality-badge ${getQualityBadgeClass(product)}">${getQualityScore(product)}%</div>

            <div class="product-image">
                ${product.shopify_images ?
                    `<img src="${product.shopify_images.split(',')[0]}" alt="${product.title || 'Product'}" onerror="this.style.display='none'">` :
                    '<i class="fas fa-image"></i>'
                }
            </div>

            <div class="product-details">
                <div class="product-meta">
                    <span class="product-sku">${product.variant_sku || 'No SKU'}</span>
                    <span class="product-vendor">${product.vendor || ''}</span>
                </div>

                <h6 class="product-title">${product.title || 'Untitled Product'}</h6>

                <div class="product-specs">
                    ${renderProductSpecs(product)}
                </div>

                <div class="d-flex justify-content-between align-items-center">
                    <small class="text-muted">Click to edit</small>
                    ${product.shopify_price ? `<strong class="text-success">$${product.shopify_price}</strong>` : ''}
                </div>
            </div>
        </div>
    `;
    return card;
}

/**
 * Render product specifications (to be overridden by collection-specific JS)
 */
function renderProductSpecs(product) {
    return `
        <div class="spec-row">
            <span class="spec-label">Status:</span>
            <span class="spec-value">${product.shopify_status || 'Draft'}</span>
        </div>
    `;
}

/**
 * Filter products based on current filter
 */
function filterProductsByCurrentFilter() {
    const products = Object.entries(productsData);

    switch (currentFilter) {
        case 'all':
            return products;
        case 'missing-critical':
            return products.filter(([key, product]) => getQualityScore(product) < 30);
        case 'missing-some':
            return products.filter(([key, product]) => {
                const score = getQualityScore(product);
                return score >= 30 && score < 80;
            });
        case 'complete':
            return products.filter(([key, product]) => getQualityScore(product) >= 80);
        case 'selected':
            return products.filter(([key, product]) => selectedProducts.includes(key));
        default:
            return products;
    }
}

/**
 * Get quality score for a product
 */
function getQualityScore(product) {
    if (product.quality_score) {
        return Math.round(parseFloat(product.quality_score));
    }

    // Calculate basic quality score based on filled fields
    const requiredFields = ['title', 'variant_sku', 'vendor', 'shopify_price'];
    const filledFields = requiredFields.filter(field => product[field] && product[field].trim());
    return Math.round((filledFields.length / requiredFields.length) * 100);
}

/**
 * Get quality CSS class
 */
function getQualityClass(product) {
    const score = getQualityScore(product);
    if (score >= 80) return 'complete';
    if (score >= 30) return 'missing-some';
    return 'missing-critical';
}

/**
 * Get quality badge CSS class
 */
function getQualityBadgeClass(product) {
    const score = getQualityScore(product);
    if (score >= 80) return 'quality-high';
    if (score >= 30) return 'quality-medium';
    return 'quality-low';
}

/**
 * Edit product - open modal
 */
function editProduct(rowNum) {
    console.log(`✏️ editProduct called for row: ${rowNum} in collection: ${COLLECTION_NAME}`);

    const modalElement = document.getElementById('editProductModal');
    if (!modalElement) {
        console.error('❌ Modal element not found!');
        return;
    }

    try {
        // Ensure we have product data
        if (!productsData[rowNum]) {
            console.warn('⚠️ No data found for row, creating minimal data...');
            productsData[rowNum] = createMinimalProductData(rowNum);
        }

        const data = productsData[rowNum];

        // Store current row for later reference
        modalElement.dataset.currentRow = rowNum;

        // Populate hidden fields for compatibility with original functions
        const editRowNumField = document.getElementById('editRowNum');
        const editCollectionNameField = document.getElementById('editCollectionName');
        if (editRowNumField) editRowNumField.value = rowNum;
        if (editCollectionNameField) editCollectionNameField.value = COLLECTION_NAME;

        // Update modal title
        const titleElement = document.getElementById('editProductTitle');
        if (titleElement) {
            titleElement.textContent = data.title || `Product ${rowNum}`;
        }

        // Populate form fields
        populateModalFields(data);

        // Setup image gallery
        setupImageGallery(data);

        // Setup pricing comparison if enabled
        if (COLLECTION_CONFIG.pricing_enabled) {
            populatePricingComparison(data);
        }

        // Show modal
        const modal = new bootstrap.Modal(modalElement, {
            backdrop: 'static',
            keyboard: true
        });

        modal.show();

    } catch (error) {
        console.error('❌ Error in editProduct function:', error);
        showErrorMessage('Error opening product editor: ' + error.message);
    }
}

/**
 * Populate modal fields with product data
 */
function populateModalFields(data) {
    // Basic fields that are common across all collections
    const basicFields = [
        { id: 'editSku', value: data.variant_sku || '' },
        { id: 'editTitle', value: data.title || '' },
        { id: 'editVendor', value: data.vendor || '' },
        { id: 'editRrpPrice', value: cleanPriceValue(data.shopify_compare_price || '') },
        { id: 'editSalePrice', value: cleanPriceValue(data.shopify_price || '') },
        { id: 'editWeight', value: data.shopify_weight || '' },
        { id: 'editSeoTitle', value: data.seo_title || '' },
        { id: 'editSeoDescription', value: data.seo_description || '' },
        { id: 'editBodyHtml', value: data.body_html || '' }
    ];

    basicFields.forEach(field => {
        const element = document.getElementById(field.id);
        if (element) {
            element.value = field.value;
        }
    });

    // Call collection-specific field population
    if (typeof populateCollectionSpecificFields === 'function') {
        console.log('🔄 Calling populateCollectionSpecificFields with data:', {
            hasFeatures: !!data.features,
            featuresLength: data.features ? data.features.length : 0,
            featuresPreview: data.features ? data.features.substring(0, 100) + '...' : 'No features'
        });
        populateCollectionSpecificFields(data);
    } else {
        console.warn('⚠️ populateCollectionSpecificFields function not found!');
    }
}

/**
 * Create minimal product data for new rows
 */
function createMinimalProductData(rowNum) {
    return {
        variant_sku: '',
        title: '',
        vendor: '',
        shopify_price: '',
        shopify_compare_price: '',
        shopify_weight: '',
        body_html: '',
        seo_title: '',
        seo_description: '',
        shopify_images: '',
        quality_score: 0
    };
}

/**
 * Setup image gallery in modal
 */
function setupImageGallery(data) {
    const imagesString = data.shopify_images || '';
    modalImages = imagesString ? imagesString.split(',').map(url => url.trim()).filter(url => url) : [];
    modalCurrentImageIndex = 0;

    updateModalImageDisplay();
    updateImageCounter();
    setupThumbnailGallery();
}

/**
 * Update modal image display
 */
function updateModalImageDisplay() {
    const container = document.getElementById('modalMainImageContainer');
    const placeholder = document.getElementById('modalImagePlaceholder');
    const prevBtn = document.getElementById('modalPrevImageBtn');
    const nextBtn = document.getElementById('modalNextImageBtn');
    const counter = document.getElementById('modalImageCounter');
    const badge = document.getElementById('modalImageCountBadge');

    if (!container) return;

    // Update image count badge
    if (badge) {
        badge.textContent = `${modalImages.length} images`;
    }

    if (modalImages.length === 0) {
        placeholder.style.display = 'flex';
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
        if (counter) counter.style.display = 'none';
        return;
    }

    placeholder.style.display = 'none';

    // Create or update main image
    let mainImg = container.querySelector('.main-product-image');
    if (!mainImg) {
        mainImg = document.createElement('img');
        mainImg.className = 'main-product-image';
        mainImg.style.cssText = 'width: 100%; height: 100%; object-fit: contain;';
        container.appendChild(mainImg);
    }

    mainImg.src = modalImages[modalCurrentImageIndex];
    mainImg.alt = 'Product Image';

    // Show navigation if multiple images
    if (modalImages.length > 1) {
        if (prevBtn) prevBtn.style.display = 'block';
        if (nextBtn) nextBtn.style.display = 'block';
        if (counter) counter.style.display = 'block';
    }
}

/**
 * Navigate modal images
 */
function navigateModalImage(direction) {
    if (modalImages.length <= 1) return;

    modalCurrentImageIndex += direction;

    if (modalCurrentImageIndex < 0) {
        modalCurrentImageIndex = modalImages.length - 1;
    } else if (modalCurrentImageIndex >= modalImages.length) {
        modalCurrentImageIndex = 0;
    }

    updateModalImageDisplay();
    updateImageCounter();
    updateThumbnailHighlight();
}

/**
 * Update image counter
 */
function updateImageCounter() {
    const counterCurrent = document.getElementById('modalCurrentImageIndex');
    const counterTotal = document.getElementById('modalTotalImages');

    if (counterCurrent && counterTotal && modalImages.length > 0) {
        counterCurrent.textContent = modalCurrentImageIndex + 1;
        counterTotal.textContent = modalImages.length;
    }
}

/**
 * Setup thumbnail gallery
 */
function setupThumbnailGallery() {
    const gallery = document.getElementById('modalThumbnailGallery');
    if (!gallery) return;

    if (modalImages.length <= 1) {
        gallery.style.display = 'none';
        return;
    }

    gallery.style.display = 'flex';
    gallery.innerHTML = '';

    modalImages.forEach((imageUrl, index) => {
        const thumbnailItem = document.createElement('div');
        thumbnailItem.className = `thumbnail-item ${index === modalCurrentImageIndex ? 'active' : ''}`;
        thumbnailItem.onclick = () => selectThumbnail(index);

        const thumbnailImg = document.createElement('img');
        thumbnailImg.src = imageUrl;
        thumbnailImg.alt = `Thumbnail ${index + 1}`;

        thumbnailItem.appendChild(thumbnailImg);
        gallery.appendChild(thumbnailItem);
    });
}

/**
 * Select thumbnail
 */
function selectThumbnail(index) {
    modalCurrentImageIndex = index;
    updateModalImageDisplay();
    updateImageCounter();
    updateThumbnailHighlight();
}

/**
 * Update thumbnail highlight
 */
function updateThumbnailHighlight() {
    const gallery = document.getElementById('modalThumbnailGallery');
    if (!gallery) return;

    const thumbnails = gallery.querySelectorAll('.thumbnail-item');
    thumbnails.forEach((thumbnail, index) => {
        thumbnail.classList.toggle('active', index === modalCurrentImageIndex);
    });
}

/**
 * Populate pricing comparison
 */
function populatePricingComparison(data) {
    const pricingSection = document.querySelector('.pricing-section');
    if (!pricingSection) return;

    const ourPrice = data[PRICING_FIELD_MAPPINGS.ourPrice];
    const competitorName = data[PRICING_FIELD_MAPPINGS.competitorName];
    const competitorPrice = data[PRICING_FIELD_MAPPINGS.competitorPrice];

    // Update our price
    const ourPriceEl = document.getElementById('ourCurrentPrice');
    const ourPriceStatusEl = document.getElementById('ourPriceStatus');
    if (ourPrice) {
        ourPriceEl.textContent = formatPrice(ourPrice);
        ourPriceStatusEl.textContent = 'Current pricing';
    } else {
        ourPriceEl.textContent = 'Not set';
        ourPriceStatusEl.textContent = 'Price not available';
    }

    // Update competitor info
    const competitorLabel = document.getElementById('competitorLabel');
    const competitorPriceEl = document.getElementById('competitorPrice');

    if (competitorName && competitorPrice) {
        competitorLabel.textContent = competitorName;
        competitorPriceEl.textContent = formatPrice(competitorPrice);
    } else {
        competitorLabel.textContent = 'Competitor';
        competitorPriceEl.textContent = 'N/A';
    }

    // Update price difference
    const priceDifferenceEl = document.getElementById('priceDifference');
    const priceDifferenceCard = document.getElementById('priceDifferenceCard');

    if (ourPrice && competitorPrice) {
        const ourPriceNum = parseFloat(ourPrice);
        const competitorPriceNum = parseFloat(competitorPrice);
        const difference = ourPriceNum - competitorPriceNum;

        if (difference > 0) {
            priceDifferenceEl.textContent = `+${formatPrice(Math.abs(difference))}`;
            priceDifferenceCard.className = 'pricing-card price-higher';
        } else if (difference < 0) {
            priceDifferenceEl.textContent = `-${formatPrice(Math.abs(difference))}`;
            priceDifferenceCard.className = 'pricing-card price-lower';
        } else {
            priceDifferenceEl.textContent = formatPrice(0);
            priceDifferenceCard.className = 'pricing-card price-same';
        }
    } else {
        priceDifferenceEl.textContent = 'N/A';
        priceDifferenceCard.className = 'pricing-card';
    }
}

/**
 * Save product changes
 */
async function saveProduct() {
    console.log('🚀 saveProduct() function called');

    // Get current row number from modal state
    const modal = document.getElementById('editProductModal');
    console.log('🔍 Modal element:', modal);

    const currentRow = modal ? modal.dataset.currentRow : null;
    console.log('🔢 Current row:', currentRow);

    if (!currentRow) {
        console.error('❌ No current row found');
        showErrorMessage('No product selected for editing');
        return;
    }

    try {
        showSaveProgress();

        console.log(`💾 Saving changes for ${COLLECTION_NAME} product ${currentRow}...`);
        console.log('🔍 Checking for collectFormData function:', typeof collectFormData);

        // Collect all form data using the existing function
        const updatedData = typeof collectFormData === 'function'
            ? collectFormData(COLLECTION_NAME)
            : collectFormDataFallback();

        console.log('📝 Data to save:', updatedData);
        console.log('📊 Number of fields to save:', Object.keys(updatedData).length);

        if (Object.keys(updatedData).length === 0) {
            showInfoMessage('No changes detected to save');
            return;
        }

        // Send updates to server (one API call per field)
        const promises = [];
        const apiCalls = [];

        Object.keys(updatedData).forEach(field => {
            if (updatedData[field] !== undefined && updatedData[field] !== '') {
                const apiUrl = `/api/${COLLECTION_NAME}/products/${currentRow}`;
                const payload = { field: field, value: updatedData[field] };

                console.log(`🌐 API Call: PUT ${apiUrl}`, payload);
                apiCalls.push({ url: apiUrl, payload: payload, field: field });

                promises.push(
                    fetch(apiUrl, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    })
                );
            }
        });

        // Wait for all updates to complete
        const responses = await Promise.all(promises);

        // Check if all updates were successful
        let allSuccessful = true;
        let failedFields = [];

        for (let i = 0; i < responses.length; i++) {
            const response = responses[i];
            const apiCall = apiCalls[i];

            if (!response.ok) {
                allSuccessful = false;
                failedFields.push(apiCall.field);
                console.error(`❌ Failed to update ${apiCall.field}:`, response.status);
            } else {
                const result = await response.json();
                if (!result.success) {
                    allSuccessful = false;
                    failedFields.push(apiCall.field);
                    console.error(`❌ API error for ${apiCall.field}:`, result.error);
                }
            }
        }

        if (allSuccessful) {
            console.log(`✅ Successfully saved ${promises.length} fields`);
            showSuccessMessage(`Product updated successfully! (${promises.length} fields saved)`);

            // Refresh the product data
            await loadProductsData();

            // Close modal
            bootstrap.Modal.getInstance(modal).hide();
        } else {
            throw new Error(`Failed to update some fields: ${failedFields.join(', ')}`);
        }

    } catch (error) {
        console.error('Error saving product:', error);
        showErrorMessage('Failed to save product: ' + error.message);
    } finally {
        hideSaveProgress();
    }
}

/**
 * Fallback function to collect form data if collectFormData is not available
 */
function collectFormDataFallback() {
    console.log('🔄 Using fallback form data collection...');
    const data = {};
    const form = document.getElementById('editProductForm');

    if (!form) {
        console.warn('❌ Edit product form not found');
        return data;
    }

    console.log('✅ Found edit product form');

    // Get all form inputs
    const inputs = form.querySelectorAll('input, textarea, select');
    console.log(`🔍 Found ${inputs.length} form inputs`);

    inputs.forEach(input => {
        const value = input.value ? input.value.trim() : '';
        console.log(`📄 Field ${input.id}: "${value}" (type: ${input.type})`);

        if (value !== '') {
            // Map form field IDs to data field names
            const fieldName = mapFieldIdToDataField(input.id, COLLECTION_NAME);
            if (fieldName) {
                data[fieldName] = value;
                console.log(`✅ Mapped ${input.id} → ${fieldName}: "${value}"`);
            } else {
                console.warn(`⚠️ No mapping found for field: ${input.id}`);
            }
        }
    });

    console.log('📋 Final collected data:', data);
    return data;
}

/**
 * Map form field IDs to data field names (comprehensive version)
 */
function mapFieldIdToDataField(fieldId, collectionName) {
    // Common mappings for all collections
    const commonMappings = {
        'editSku': 'variant_sku',
        'editTitle': 'title',
        'editVendor': 'vendor',
        'editBrandName': 'brand_name',
        'editImageUrl': 'image_url',
        'editRrpPrice': 'rrp_price',
        'editSalePrice': 'sale_price',
        'editWeight': 'weight',
        'editTags': 'tags',
        'editSeoTitle': 'seo_title',
        'editSeoDescription': 'seo_description',
        'editBodyHtml': 'body_html',
        'editFeatures': 'features',
        'editCareInstructions': 'care_instructions',
        'editProductMaterial': 'product_material',
        'editStyle': 'style',
        'editApplicationLocation': 'application_location'
    };

    // Collection-specific mappings
    const collectionMappings = {
        'sinks': {
            'editLengthMm': 'length_mm',
            'editOverallWidthMm': 'overall_width_mm',
            'editOverallDepthMm': 'overall_depth_mm',
            'editMinCabinetSize': 'min_cabinet_size',
            'editCutoutSize': 'cutout_size',
            'editBowlWidthMm': 'bowl_width_mm',
            'editBowlDepthMm': 'bowl_depth_mm',
            'editBowlHeightMm': 'bowl_height_mm',
            'editInstallationType': 'installation_type',
            'editBowlsNumber': 'bowls_number',
            'editHolesNumber': 'holes_number',
            'editHasOverflow': 'has_overflow',
            'editDrainPosition': 'drain_position'
        },
        'taps': {
            'editTapType': 'tap_type',
            'editMaterial': 'material',
            'editFinish': 'finish',
            'editMountingType': 'mounting_type',
            'editSpoutType': 'spout_type',
            'editHandleType': 'handle_type',
            'editFlowRate': 'flow_rate',
            'editPressureRating': 'pressure_rating',
            'editWarrantyYears': 'warranty_years'
        },
        'lighting': {
            'editLightType': 'light_type',
            'editBulbType': 'bulb_type',
            'editWattage': 'wattage',
            'editVoltage': 'voltage',
            'editColorTemperature': 'color_temperature',
            'editLumens': 'lumens',
            'editIpRating': 'ip_rating',
            'editDimmable': 'dimmable',
            'editMountingType': 'mounting_type',
            'editDimensions': 'dimensions',
            'editCertifications': 'certifications'
        }
    };

    // Try common mappings first
    if (commonMappings[fieldId]) {
        return commonMappings[fieldId];
    }

    // Try collection-specific mappings
    const collectionSpecific = collectionMappings[collectionName];
    if (collectionSpecific && collectionSpecific[fieldId]) {
        return collectionSpecific[fieldId];
    }

    // Fallback: convert editFieldName to field_name
    if (fieldId.startsWith('edit')) {
        return fieldId.replace('edit', '').replace(/([A-Z])/g, '_$1').toLowerCase();
    }

    return fieldId;
}

/**
 * Filter products
 */
function filterProducts(filterType) {
    currentFilter = filterType;

    // Update filter button states
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`filter-${filterType}`).classList.add('active');

    // Re-render products
    renderProducts();
    updateStatistics();
}

/**
 * Update statistics
 */
function updateStatistics() {
    const products = Object.values(productsData);
    const totalProducts = products.length;

    const completeProducts = products.filter(p => getQualityScore(p) >= 80).length;
    const missingInfoProducts = products.filter(p => getQualityScore(p) < 80).length;

    const qualityScores = products.map(p => getQualityScore(p));
    const avgQuality = qualityScores.length > 0
        ? Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length)
        : 0;

    // Update DOM elements
    const totalEl = document.getElementById('totalProducts');
    const completeEl = document.getElementById('completeProducts');
    const missingEl = document.getElementById('missingInfoProducts');
    const qualityEl = document.getElementById('dataQualityPercent');
    const selectedEl = document.getElementById('selectedCount');

    if (totalEl) totalEl.textContent = totalProducts;
    if (completeEl) completeEl.textContent = completeProducts;
    if (missingEl) missingEl.textContent = missingInfoProducts;
    if (qualityEl) qualityEl.textContent = `${avgQuality}%`;
    if (selectedEl) selectedEl.textContent = selectedProducts.length;
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Checkbox selection handling
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('product-checkbox')) {
            const rowNum = e.target.dataset.row;
            if (e.target.checked) {
                if (!selectedProducts.includes(rowNum)) {
                    selectedProducts.push(rowNum);
                }
            } else {
                selectedProducts = selectedProducts.filter(id => id !== rowNum);
            }
            updateStatistics();
        }
    });

    // Modal cleanup on hide
    document.addEventListener('hidden.bs.modal', function(e) {
        if (e.target.id === 'editProductModal') {
            delete e.target.dataset.currentRow;
        }
    });
}

// Utility functions
function formatPrice(price) {
    const num = parseFloat(price);
    return isNaN(num) ? '$0.00' : `$${num.toFixed(2)}`;
}

function cleanPriceValue(priceString) {
    if (!priceString) return '';
    const cleaned = priceString.toString().replace(/[\$,\s]/g, '');
    const numeric = parseFloat(cleaned);
    return isNaN(numeric) ? '' : numeric.toString();
}

function showLoadingState() {
    const loading = document.getElementById('loadingState');
    const container = document.getElementById('productsContainer');
    if (loading) loading.style.display = 'block';
    if (container) container.style.display = 'none';
}

function hideLoadingState() {
    const loading = document.getElementById('loadingState');
    const container = document.getElementById('productsContainer');
    if (loading) loading.style.display = 'none';
    if (container) container.style.display = 'block';
}

function showEmptyState() {
    const empty = document.getElementById('emptyState');
    if (empty) empty.classList.remove('d-none');
}

function hideEmptyState() {
    const empty = document.getElementById('emptyState');
    if (empty) empty.classList.add('d-none');
}

function showSaveProgress() {
    const saveBtn = document.querySelector('#editProductModal .btn-primary');
    if (saveBtn) {
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Saving...';
        saveBtn.disabled = true;
    }
}

function hideSaveProgress() {
    const saveBtn = document.querySelector('#editProductModal .btn-primary');
    if (saveBtn) {
        saveBtn.innerHTML = '<i class="fas fa-save me-1"></i>Save Changes';
        saveBtn.disabled = false;
    }
}

function showSuccessMessage(message) {
    // Simple alert for now - can be replaced with toast notification
    alert('✅ ' + message);
}

function showErrorMessage(message) {
    // Simple alert for now - can be replaced with toast notification
    alert('❌ ' + message);
}

function showInfoMessage(message) {
    // Simple alert for now - can be replaced with toast notification
    alert('ℹ️ ' + message);
}

function clearSelection() {
    selectedProducts = [];
    document.querySelectorAll('.product-checkbox').forEach(cb => cb.checked = false);
    updateStatistics();
}

/**
 * Show bulk AI extraction modal
 */
function showBulkExtractionModal() {
    if (selectedProducts.length === 0) {
        showErrorMessage('Please select products to extract with AI');
        return;
    }

    // Show the image extraction modal which handles bulk extraction
    const modal = new bootstrap.Modal(document.getElementById('imageExtractionModal'));
    modal.show();

    console.log(`🔄 Showing AI extraction modal for ${selectedProducts.length} selected products`);
}

/**
 * Generate descriptions for selected products
 */
async function generateDescriptionsForSelected(event) {
    if (selectedProducts.length === 0) {
        showErrorMessage('Please select products to generate descriptions for');
        return;
    }

    console.log(`🔄 Generating descriptions for ${selectedProducts.length} selected products`);

    // Start AI loading animation for bulk processing
    const loadingId = window.aiLoadingManager ?
        window.aiLoadingManager.startBulkProcessing(event ? event.target : null, 'descriptions') : null;

    try {
        const response = await fetch(`/api/${COLLECTION_NAME}/process/descriptions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                selected_rows: selectedProducts,
                use_url_content: true
            })
        });

        const result = await response.json();

        if (result.success) {
            // Stop loading animation
            if (loadingId && window.aiLoadingManager) {
                window.aiLoadingManager.stopLoading(loadingId);
            }

            showSuccessMessage(`✅ Generated descriptions for ${result.successful_count || selectedProducts.length} products`);
            // Live updates will handle individual product updates
            console.log('🔄 Bulk description generation complete, refreshing product data...');

            // Refresh the product data to show updated descriptions
            setTimeout(() => {
                loadProductsData();
            }, 2000);
        } else {
            throw new Error(result.message || 'Failed to generate descriptions');
        }

    } catch (error) {
        console.error('Error generating descriptions:', error);

        // Stop loading animation on error
        if (loadingId && window.aiLoadingManager) {
            window.aiLoadingManager.stopLoading(loadingId);
        }

        showErrorMessage('Failed to generate descriptions: ' + error.message);
    }
}

/**
 * Export selected products
 */
async function exportSelected() {
    if (selectedProducts.length === 0) {
        showErrorMessage('Please select products to export');
        return;
    }

    console.log(`📄 Exporting ${selectedProducts.length} selected products`);

    try {
        // Create CSV data from selected products
        const selectedData = selectedProducts.map(rowNum => productsData[rowNum]).filter(Boolean);

        if (selectedData.length === 0) {
            throw new Error('No valid product data found for selected items');
        }

        // Convert to CSV
        const headers = Object.keys(selectedData[0]);
        const csvContent = [
            headers.join(','),
            ...selectedData.map(product =>
                headers.map(header =>
                    `"${String(product[header] || '').replace(/"/g, '""')}"`
                ).join(',')
            )
        ].join('\n');

        // Download CSV file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${COLLECTION_NAME}_selected_products_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showSuccessMessage(`✅ Exported ${selectedData.length} products to CSV`);

    } catch (error) {
        console.error('Error exporting products:', error);
        showErrorMessage('Failed to export products: ' + error.message);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    if (typeof COLLECTION_NAME !== 'undefined') {
        initializeCollection();
    }
});

/**
 * Generic AI description generation function (used when collection-specific function doesn't exist)
 */
async function generateAIDescription(event) {
    const modal = document.getElementById('editProductModal');
    const currentRow = modal.dataset.currentRow;

    if (!currentRow || !productsData[currentRow]) {
        showErrorMessage('No product data available for AI description generation');
        return;
    }

    try {
        const data = productsData[currentRow];

        // Start AI loading animation
        const loadingId = window.aiLoadingManager ?
            window.aiLoadingManager.startDescriptionGeneration(event ? event.target : null) : null;

        const response = await fetch(`/api/${COLLECTION_NAME}/products/${currentRow}/generate-description`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                product_data: data,
                row_number: currentRow
            })
        });

        const result = await response.json();

        if (result.success) {
            // Stop loading animation
            if (loadingId && window.aiLoadingManager) {
                window.aiLoadingManager.stopLoading(loadingId);
            }

            showSuccessMessage('✅ AI description generated successfully!');

            // Live updates will handle field updates via SocketIO
            console.log('🔄 AI generation complete, waiting for live updates...');

            // If live updates are not available, manually refresh modal data
            if (!window.liveUpdatesManager || !window.liveUpdatesManager.isLiveUpdatesActive()) {
                console.log('🔄 Live updates not active, manually refreshing modal...');
                if (window.liveUpdatesManager) {
                    window.liveUpdatesManager.refreshModalData();
                }
            }
        } else {
            throw new Error(result.error || 'Failed to generate description');
        }

    } catch (error) {
        console.error('Error generating AI description:', error);

        // Stop loading animation on error
        if (loadingId && window.aiLoadingManager) {
            window.aiLoadingManager.stopLoading(loadingId);
        }

        showErrorMessage('Failed to generate AI description: ' + error.message);
    }
}

/**
 * Generic AI features generation function
 */
async function generateAIFeatures(event) {
    const modal = document.getElementById('editProductModal');
    const currentRow = modal.dataset.currentRow;

    if (!currentRow || !productsData[currentRow]) {
        showErrorMessage('No product data available for features generation');
        return;
    }

    try {
        const data = productsData[currentRow];

        // Start AI loading animation for features
        const loadingId = window.aiLoadingManager ?
            window.aiLoadingManager.startFeaturesGeneration(event ? event.target : null) : null;

        const response = await fetch(`/api/${COLLECTION_NAME}/products/${currentRow}/generate-features`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                product_data: data,
                row_number: currentRow
            })
        });

        const result = await response.json();

        if (result.success && result.features) {
            // Stop loading animation
            if (loadingId && window.aiLoadingManager) {
                window.aiLoadingManager.stopLoading(loadingId);
            }

            showSuccessMessage('✅ Key features generated successfully!');

            // Live updates will handle field updates via SocketIO
            console.log('🔄 Features generation complete, waiting for live updates...');
        } else {
            throw new Error(result.error || 'Failed to generate features');
        }

    } catch (error) {
        console.error('Error generating features:', error);

        // Stop loading animation on error
        if (loadingId && window.aiLoadingManager) {
            window.aiLoadingManager.stopLoading(loadingId);
        }

        showErrorMessage('Failed to generate features: ' + error.message);
    }
}

/**
 * Extract images from selected products
 */
async function extractImagesFromSelected(event) {
    if (selectedProducts.length === 0) {
        showErrorMessage('Please select products to extract images from');
        return;
    }

    console.log(`🖼️ Extracting images for ${selectedProducts.length} selected products`);

    // Start AI loading animation for bulk image processing
    const loadingId = window.aiLoadingManager ?
        window.aiLoadingManager.startBulkProcessing(event ? event.target : null, 'images') : null;

    // Show progress UI
    const progressDiv = document.getElementById('extractionProgress');
    const statusDiv = document.getElementById('extractionStatus');
    const progressBar = progressDiv.querySelector('.progress-bar');

    progressDiv.classList.remove('d-none');
    statusDiv.textContent = 'Starting image extraction...';
    progressBar.style.width = '0%';

    try {
        const response = await fetch(`/api/${COLLECTION_NAME}/process/extract-images`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                selected_rows: selectedProducts
            })
        });

        const result = await response.json();

        if (result.success) {
            // Stop loading animation
            if (loadingId && window.aiLoadingManager) {
                window.aiLoadingManager.stopLoading(loadingId);
            }

            progressBar.style.width = '100%';
            statusDiv.textContent = `✅ Extracted images for ${result.successful_count || selectedProducts.length} products`;

            showSuccessMessage(`✅ Image extraction completed for ${result.successful_count || selectedProducts.length} products`);

            // Refresh the product data to show extracted images
            setTimeout(() => {
                loadProductsData();
                // Hide the modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('imageExtractionModal'));
                if (modal) modal.hide();
            }, 2000);
        } else {
            throw new Error(result.message || 'Failed to extract images');
        }

    } catch (error) {
        console.error('Error extracting images:', error);

        // Stop loading animation on error
        if (loadingId && window.aiLoadingManager) {
            window.aiLoadingManager.stopLoading(loadingId);
        }

        statusDiv.textContent = '❌ Image extraction failed';
        showErrorMessage('Failed to extract images: ' + error.message);
    } finally {
        // Hide progress after delay
        setTimeout(() => {
            progressDiv.classList.add('d-none');
        }, 3000);
    }
}

/**
 * Extract images from a single product
 */
async function extractSingleProductImages(event) {
    const urlInput = document.getElementById('singleImageUrl');
    const rowInput = document.getElementById('singleImageRow');

    const url = urlInput.value.trim();
    const rowNum = parseInt(rowInput.value);

    if (!url) {
        showErrorMessage('Please enter a product URL');
        return;
    }

    if (!rowNum || rowNum < 1) {
        showErrorMessage('Please enter a valid row number');
        return;
    }

    console.log(`🖼️ Extracting images for single product at row ${rowNum} from ${url}`);

    // Start AI loading animation for single image extraction
    const loadingId = window.aiLoadingManager ?
        window.aiLoadingManager.startAIExtraction(event ? event.target : null) : null;

    // Show progress UI
    const progressDiv = document.getElementById('extractionProgress');
    const statusDiv = document.getElementById('extractionStatus');
    const progressBar = progressDiv.querySelector('.progress-bar');

    progressDiv.classList.remove('d-none');
    statusDiv.textContent = 'Extracting images from product page...';
    progressBar.style.width = '0%';

    try {
        const response = await fetch(`/api/${COLLECTION_NAME}/products/${rowNum}/extract-images`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                product_url: url
            })
        });

        const result = await response.json();

        if (result.success) {
            // Stop loading animation
            if (loadingId && window.aiLoadingManager) {
                window.aiLoadingManager.stopLoading(loadingId);
            }

            progressBar.style.width = '100%';
            statusDiv.textContent = `✅ Extracted ${result.image_count || 0} images`;

            showSuccessMessage(`✅ Extracted ${result.image_count || 0} images from product page`);

            // Clear the inputs
            urlInput.value = '';
            rowInput.value = '';

            // Refresh the product data
            setTimeout(() => {
                loadProductsData();
                // Hide the modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('imageExtractionModal'));
                if (modal) modal.hide();
            }, 2000);
        } else {
            throw new Error(result.message || 'Failed to extract images');
        }

    } catch (error) {
        console.error('Error extracting single product images:', error);

        // Stop loading animation on error
        if (loadingId && window.aiLoadingManager) {
            window.aiLoadingManager.stopLoading(loadingId);
        }

        statusDiv.textContent = '❌ Image extraction failed';
        showErrorMessage('Failed to extract images: ' + error.message);
    } finally {
        // Hide progress after delay
        setTimeout(() => {
            progressDiv.classList.add('d-none');
        }, 3000);
    }
}

// Export functions to window for onclick handlers
window.editProduct = editProduct;
window.navigateModalImage = navigateModalImage;
window.selectThumbnail = selectThumbnail;
window.saveProduct = saveProduct;
window.filterProducts = filterProducts;
window.clearSelection = clearSelection;
window.showBulkExtractionModal = showBulkExtractionModal;
window.generateDescriptionsForSelected = generateDescriptionsForSelected;
window.exportSelected = exportSelected;
window.generateAIDescription = generateAIDescription;
window.generateAIFeatures = generateAIFeatures;
window.extractImagesFromSelected = extractImagesFromSelected;
window.extractSingleProductImages = extractSingleProductImages;