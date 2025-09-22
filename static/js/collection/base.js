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

    // Load missing info data for enhanced filtering
    loadMissingInfoData();
}

/**
 * Load missing information data for filtering
 */
let missingInfoData = null;
let lastMissingInfoData = null;
async function loadMissingInfoData() {
    try {
        console.log('📊 Loading missing info data for filtering...');
        const response = await fetch(`/api/${COLLECTION_NAME}/products/missing-info`);
        const data = await response.json();

        if (data.success) {
            missingInfoData = data;
            console.log('✅ Missing info data loaded:', data.summary);
        }
    } catch (error) {
        console.warn('⚠️ Could not load missing info data:', error);
    }
}

/**
 * Load products data from backend with performance optimization
 */
async function loadProductsData() {
    const startTime = performance.now();

    try {
        showLoadingState();
        console.log(`🚀 Loading products for ${COLLECTION_NAME}...`);

        const response = await fetch(`/api/${COLLECTION_NAME}/products/all`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        productsData = data.products || {};

        const loadTime = performance.now() - startTime;
        console.log(`⚡ Loaded ${Object.keys(productsData).length} products in ${loadTime.toFixed(1)}ms`);

        // DEBUG: Log the loaded data structure and sample data
        console.log('🔍 DEBUG: API Response structure:', {
            success: data.success,
            totalCount: data.total_count,
            collection: data.collection,
            productsKeys: Object.keys(data.products || {}),
            rawDataSample: data.products ? Object.values(data.products)[0] : null
        });

        // DEBUG: Log sample of productsData after assignment
        if (Object.keys(productsData).length > 0) {
            const firstRow = Object.keys(productsData)[0];
            const firstProduct = productsData[firstRow];
            console.log(`🔍 DEBUG: Sample loaded product (Row ${firstRow}):`, {
                title: firstProduct.title,
                installation_type: firstProduct.installation_type,
                product_material: firstProduct.product_material,
                has_overflow: firstProduct.has_overflow,
                cutout_size_mm: firstProduct.cutout_size_mm
            });
        } else {
            console.warn('⚠️ DEBUG: No products loaded into productsData!');
        }

        // Use progressive loader for better performance
        if (window.progressiveLoader) {
            await window.progressiveLoader.initialize(productsData);
        } else {
            // Fallback to traditional rendering
            renderProducts();
        }

        updateStatistics();
        hideLoadingState();

        // Performance analytics
        console.log('📊 Performance stats:', {
            loadTime: `${loadTime.toFixed(1)}ms`,
            productCount: Object.keys(productsData).length,
            cacheUsed: loadTime < 100 // Assume cache if very fast
        });

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
    card.className = 'product-card-wrapper';
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

    // DEBUG: Log the entire productsData structure and type checking
    console.log('🔍 DEBUG: Current productsData structure:', {
        totalProducts: Object.keys(productsData || {}).length,
        availableRows: Object.keys(productsData || {}),
        requestedRow: rowNum,
        requestedRowType: typeof rowNum,
        hasRequestedRow: !!(productsData && productsData[rowNum])
    });

    // DEBUG: Test different key formats
    const rowNumStr = rowNum.toString();
    const rowNumInt = parseInt(rowNum);
    console.log('🔍 DEBUG: Row number format testing:', {
        original: rowNum,
        asString: rowNumStr,
        asInt: rowNumInt,
        hasAsString: !!(productsData && productsData[rowNumStr]),
        hasAsInt: !!(productsData && productsData[rowNumInt])
    });

    const modalElement = document.getElementById('editProductModal');
    if (!modalElement) {
        console.error('❌ Modal element not found!');
        return;
    }

    try {
        // Ensure we have product data - try both string and number keys
        let data = productsData[rowNum] || productsData[rowNum.toString()] || productsData[parseInt(rowNum)];

        if (!data) {
            console.warn(`⚠️ No data found for row ${rowNum} (tried as string and number), creating minimal data...`);
            console.log('🔍 DEBUG: Available product rows are:', Object.keys(productsData || {}));
            data = createMinimalProductData(rowNum);
            productsData[rowNum] = data;
        } else {
            console.log(`✅ Found existing data for row ${rowNum}`);
        }

        // DEBUG: Log the specific product data being used
        console.log(`🔍 DEBUG: Product data for row ${rowNum}:`, {
            title: data.title,
            installation_type: data.installation_type,
            product_material: data.product_material,
            has_overflow: data.has_overflow,
            cutout_size_mm: data.cutout_size_mm,
            isMinimalData: !data.title || data.title === ''
        });

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
        { id: 'editBodyHtml', value: data.body_html || '' },
        { id: 'editFaqs', value: data.faqs || '' }
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
    if (ourPriceEl && ourPriceStatusEl) {
        if (ourPrice) {
            ourPriceEl.textContent = formatPrice(ourPrice);
            ourPriceStatusEl.textContent = 'Current pricing';
        } else {
            ourPriceEl.textContent = 'Not set';
            ourPriceStatusEl.textContent = 'Todays price';
        }
    }

    // Update competitor info
    const competitorLabel = document.getElementById('competitorLabel');
    const competitorPriceEl = document.getElementById('competitorPrice');

    if (competitorLabel && competitorPriceEl) {
        if (competitorName && competitorPrice) {
            competitorLabel.textContent = competitorName;
            competitorPriceEl.textContent = formatPrice(competitorPrice);
        } else {
            competitorLabel.textContent = 'Competitor';
            competitorPriceEl.textContent = 'N/A';
        }
    }

    // Update price difference
    const priceDifferenceEl = document.getElementById('priceDifference');
    const priceDifferenceCard = document.getElementById('priceDifferenceCard');

    if (priceDifferenceEl && priceDifferenceCard) {
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

    // Clear other filters when using quick filter buttons
    if (filterType !== 'all') {
        const searchInput = document.getElementById('searchInput');
        const brandFilter = document.getElementById('brandFilter');
        const missingInfoFilter = document.getElementById('missingInfoFilter');

        if (searchInput) searchInput.value = '';
        if (brandFilter) brandFilter.value = '';
        if (missingInfoFilter) missingInfoFilter.value = '';
    }

    // Apply all filters
    applyFilters();
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
    if (container) container.style.display = 'grid';
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

/**
 * Debug function to force refresh products data without page reload
 */
async function debugRefreshData() {
    console.log('🔄 DEBUG: Force refreshing products data...');

    try {
        // Force clear existing data
        productsData = {};

        // Force reload from API
        await loadProductsData();

        console.log('✅ DEBUG: Data refreshed successfully');
        console.log('🔍 DEBUG: New productsData:', {
            count: Object.keys(productsData).length,
            rows: Object.keys(productsData)
        });

        // Show success message
        if (typeof showSuccessMessage === 'function') {
            showSuccessMessage(`Data refreshed! ${Object.keys(productsData).length} products loaded.`);
        }

    } catch (error) {
        console.error('❌ DEBUG: Error refreshing data:', error);
        if (typeof showErrorMessage === 'function') {
            showErrorMessage('Failed to refresh data: ' + error.message);
        }
    }
}

// Make debug function globally available
window.debugRefreshData = debugRefreshData;

/**
 * Debug function to test modal with known data
 */
function debugTestModal() {
    console.log('🔍 DEBUG: Testing modal with known data...');

    // First, check what we have
    console.log('🔍 Current productsData:', Object.keys(productsData || {}));

    if (Object.keys(productsData || {}).length === 0) {
        console.log('⚠️ No productsData, trying to load...');
        loadProductsData().then(() => {
            debugTestModal(); // Retry after loading
        });
        return;
    }

    // Test with the first available row
    const firstRow = Object.keys(productsData)[0];
    console.log(`🧪 Testing modal with row ${firstRow}...`);

    // Log the data we're about to use
    const testData = productsData[firstRow];
    console.log('🔍 Test data:', {
        title: testData.title,
        installation_type: testData.installation_type,
        product_material: testData.product_material,
        has_overflow: testData.has_overflow,
        cutout_size_mm: testData.cutout_size_mm
    });

    // Open the modal
    editProduct(firstRow);
}

window.debugTestModal = debugTestModal;

/**
 * Show Missing Information Analysis Modal
 */
async function showMissingInfoAnalysis() {
    try {
        console.log(`🔍 Loading missing information analysis for ${COLLECTION_NAME}...`);

        // Show loading state
        const loadingHtml = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Analyzing...</span>
                </div>
                <p class="mt-3">Analyzing missing information...</p>
            </div>
        `;

        // Create or update modal
        let modal = document.getElementById('missingInfoModal');
        if (!modal) {
            modal = createMissingInfoModal();
            document.body.appendChild(modal);
        }

        const modalBody = modal.querySelector('.modal-body');
        modalBody.innerHTML = loadingHtml;

        // Show modal
        const bootstrapModal = new bootstrap.Modal(modal);
        bootstrapModal.show();

        // Fetch missing info analysis
        const response = await fetch(`/api/${COLLECTION_NAME}/products/missing-info`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to analyze missing information');
        }

        // Display results
        displayMissingInfoResults(modalBody, data);

    } catch (error) {
        console.error('Error loading missing info analysis:', error);
        showErrorMessage('Failed to analyze missing information: ' + error.message);
    }
}

/**
 * Create Missing Information Modal
 */
function createMissingInfoModal() {
    const modal = document.createElement('div');
    modal.id = 'missingInfoModal';
    modal.className = 'modal fade';
    modal.setAttribute('tabindex', '-1');
    modal.innerHTML = `
        <div class="modal-dialog modal-xl">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">
                        <i class="fas fa-exclamation-triangle me-2 text-warning"></i>
                        Missing Information Analysis
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <!-- Content will be loaded dynamically -->
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    <button type="button" class="btn btn-primary" onclick="exportMissingInfoReport()">
                        <i class="fas fa-download me-1"></i>Export Report
                    </button>
                </div>
            </div>
        </div>
    `;
    return modal;
}

/**
 * Display Missing Information Results
 */
function displayMissingInfoResults(container, data) {
    const { missing_info_analysis, summary, field_definitions } = data;

    // Store the data for later use in supplier contact functions
    lastMissingInfoData = data;

    const html = `
        <div class="missing-info-analysis">
            <!-- Summary Statistics -->
            <div class="row mb-4">
                <div class="col-md-4">
                    <div class="card text-center bg-danger text-white">
                        <div class="card-body">
                            <h3 class="mb-0">${summary.products_missing_critical}</h3>
                            <small>Products Missing Critical Info</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card text-center bg-warning text-white">
                        <div class="card-body">
                            <h3 class="mb-0">${summary.products_missing_some}</h3>
                            <small>Products Missing Some Info</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card text-center bg-info text-white">
                        <div class="card-body">
                            <h3 class="mb-0">${summary.total_products_with_missing_info}</h3>
                            <small>Total Products Needing Attention</small>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Supplier Contact Section -->
            ${generateSupplierContactSection(data.supplier_groups || [])}

            <!-- Most Common Missing Fields -->
            <div class="row mb-4">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">
                            <h6 class="mb-0"><i class="fas fa-chart-bar me-2"></i>Most Common Missing Fields</h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                ${Object.entries(summary.most_common_missing_fields)
                                    .slice(0, 6)
                                    .map(([field, count]) => `
                                        <div class="col-md-4 mb-2">
                                            <div class="d-flex justify-content-between align-items-center">
                                                <span class="small">${field}</span>
                                                <span class="badge bg-danger">${count}</span>
                                            </div>
                                        </div>
                                    `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Products with Missing Information -->
            <div class="card">
                <div class="card-header">
                    <h6 class="mb-3"><i class="fas fa-list me-2"></i>Products with Missing Information</h6>

                    <!-- Filter Controls Row -->
                    <div class="row g-2 mb-3">
                        <div class="col-md-4">
                            <label for="modalBrandFilter" class="form-label text-muted small">Filter by Brand</label>
                            <select class="form-select form-select-sm" id="modalBrandFilter">
                                <option value="">All Brands</option>
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label for="modalMissingTypeFilter" class="form-label text-muted small">Filter by Missing Type</label>
                            <select class="form-select form-select-sm" id="modalMissingTypeFilter">
                                <option value="">All Missing Types</option>
                                <option value="sink_specifications">Sink Specifications</option>
                                <option value="overall_dimensions">Overall Sink Dimensions</option>
                                <option value="bowl_dimensions">Bowl Dimensions</option>
                                <option value="additional_info">Additional Information</option>
                                <option value="seo_info">SEO Information</option>
                                <option value="product_content">Product Content</option>
                                <option value="spec_sheet_verification">Spec Sheet Verification</option>
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label for="modalSearchFilter" class="form-label text-muted small">Search Products</label>
                            <input type="text" class="form-control form-control-sm" id="modalSearchFilter" placeholder="Search by SKU, title, or brand...">
                        </div>
                    </div>

                    <!-- Quick Filter Buttons -->
                    <div class="btn-group btn-group-sm w-100" role="group">
                        <input type="radio" class="btn-check" name="missingFilter" id="filterCritical" checked>
                        <label class="btn btn-outline-danger" for="filterCritical">Critical Only</label>

                        <input type="radio" class="btn-check" name="missingFilter" id="filterAll">
                        <label class="btn btn-outline-warning" for="filterAll">All Missing</label>

                        <input type="radio" class="btn-check" name="missingFilter" id="filterComplete">
                        <label class="btn btn-outline-success" for="filterComplete">Show Complete</label>
                    </div>
                </div>
                <div class="card-body" style="max-height: 400px; overflow-y: auto;">
                    <div class="mb-2">
                        <small class="text-muted">
                            <span id="modalFilteredCount">Loading...</span> products shown
                        </small>
                    </div>
                    <div id="missingProductsList">
                        ${generateMissingProductsList(missing_info_analysis)}
                    </div>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;

    // Debug: Confirm modal content has been updated with brand dropdown
    console.log('📋 Modal content updated! Checking for brand dropdown...');
    const brandFilterCheck = document.getElementById('modalBrandFilter');
    if (brandFilterCheck) {
        console.log('✅ Brand dropdown found in modal!', brandFilterCheck);
    } else {
        console.error('❌ Brand dropdown NOT found in modal!');
    }

    // Initialize brand filter in modal
    initializeModalBrandFilter(missing_info_analysis);

    // Setup filter event listeners
    document.getElementById('filterCritical').addEventListener('change', () => {
        applyModalFilters(missing_info_analysis);
    });

    document.getElementById('filterAll').addEventListener('change', () => {
        applyModalFilters(missing_info_analysis);
    });

    document.getElementById('filterComplete').addEventListener('change', () => {
        applyModalFilters(missing_info_analysis);
    });

    document.getElementById('modalBrandFilter').addEventListener('change', () => {
        applyModalFilters(missing_info_analysis);
    });

    document.getElementById('modalMissingTypeFilter').addEventListener('change', () => {
        applyModalFilters(missing_info_analysis);
    });

    document.getElementById('modalSearchFilter').addEventListener('input', () => {
        applyModalFilters(missing_info_analysis);
    });
}

/**
 * Generate Missing Products List HTML
 */
function generateMissingProductsList(products, filterType = 'critical') {
    const filteredProducts = filterType === 'critical'
        ? products.filter(p => p.critical_missing_count > 0)
        : products;

    if (filteredProducts.length === 0) {
        return `
            <div class="text-center py-4">
                <i class="fas fa-check-circle fa-3x text-success mb-3"></i>
                <h5>Great job!</h5>
                <p class="text-muted">No products found with ${filterType === 'critical' ? 'critical' : 'any'} missing information.</p>
            </div>
        `;
    }

    return filteredProducts.map(product => `
        <div class="card mb-3 ${product.critical_missing_count > 0 ? 'border-danger' : 'border-warning'}">
            <div class="card-body">
                <div class="row align-items-center">
                    <div class="col-md-8">
                        <h6 class="mb-1">${product.title || `Product ${product.row_num}`}</h6>
                        <small class="text-muted">SKU: ${product.sku || 'N/A'} | Row: ${product.row_num} | Quality: ${product.quality_score}%</small>
                    </div>
                    <div class="col-md-4 text-end">
                        <button class="btn btn-sm btn-primary" onclick="editProduct(${product.row_num})">
                            <i class="fas fa-edit me-1"></i>Fix Now
                        </button>
                    </div>
                </div>
                <div class="mt-2">
                    <strong class="text-danger">Missing Fields:</strong>
                    <div class="mt-1">
                        ${product.missing_fields.map(field => `
                            <span class="badge ${field.verification_issue ? 'bg-info' : (field.is_critical ? 'bg-danger' : 'bg-warning')} me-1 mb-1"
                                  ${field.verification_issue && field.details ? `title="${field.details}"` : ''}>
                                ${field.verification_issue ? '🔍 ' : ''}${field.display_name}
                            </span>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

/**
 * Filter Missing Products List (legacy function for quick filters)
 */
function filterMissingProductsList(products, filterType) {
    const container = document.getElementById('missingProductsList');
    container.innerHTML = generateMissingProductsList(products, filterType);
}

/**
 * Initialize brand filter in modal
 */
function initializeModalBrandFilter(missingInfoProducts) {
    console.log('🔍 Initializing modal brand filter...', { missingInfoProducts, productsData });

    const brandFilter = document.getElementById('modalBrandFilter');
    if (!brandFilter) {
        console.warn('⚠️ modalBrandFilter element not found');
        return;
    }

    // Get unique brands from missing info products
    const brands = new Set();
    missingInfoProducts.forEach(product => {
        // Get the actual product data to find brand
        const fullProduct = productsData[product.row_num];
        if (fullProduct && fullProduct.brand_name) {
            const brandName = fullProduct.brand_name.trim();
            if (brandName) {
                brands.add(brandName);
                console.log(`📋 Found brand: ${brandName} for product ${product.row_num}`);
            }
        } else {
            console.log(`⚠️ No brand found for product row ${product.row_num}:`, fullProduct);
        }
    });

    // Clear existing options (except "All Brands")
    brandFilter.innerHTML = '<option value="">All Brands</option>';

    // Add brand options sorted alphabetically
    const sortedBrands = [...brands].sort();
    sortedBrands.forEach(brand => {
        const option = document.createElement('option');
        option.value = brand;
        option.textContent = brand;
        brandFilter.appendChild(option);
    });

    console.log(`🏷️ Modal brand filter initialized with ${brands.size} brands:`, sortedBrands);
}

/**
 * Apply all modal filters
 */
function applyModalFilters(allProducts) {
    const brandFilter = document.getElementById('modalBrandFilter')?.value || '';
    const missingTypeFilter = document.getElementById('modalMissingTypeFilter')?.value || '';
    const searchTerm = document.getElementById('modalSearchFilter')?.value.toLowerCase() || '';

    // Get quick filter selection
    let quickFilter = 'critical'; // default
    if (document.getElementById('filterAll')?.checked) quickFilter = 'all';
    if (document.getElementById('filterComplete')?.checked) quickFilter = 'complete';

    console.log('🔍 Modal filters:', { brandFilter, missingTypeFilter, searchTerm, quickFilter });

    // Filter products based on all criteria
    let filteredProducts = allProducts.filter(product => {
        // Get full product data for additional filtering
        const fullProduct = productsData[product.row_num];
        if (!fullProduct) return false;

        // Quick filter logic
        if (quickFilter === 'critical' && product.critical_missing_count === 0) return false;
        if (quickFilter === 'complete' && product.total_missing_count > 0) return false;
        // 'all' shows everything that has missing info

        // Brand filter
        if (brandFilter && fullProduct.brand_name !== brandFilter) return false;

        // Search filter
        if (searchTerm) {
            const searchFields = [
                product.title || '',
                product.sku || '',
                fullProduct.brand_name || '',
                fullProduct.product_material || ''
            ].join(' ').toLowerCase();

            if (!searchFields.includes(searchTerm)) return false;
        }

        // Missing type filter
        if (missingTypeFilter) {
            switch (missingTypeFilter) {
                case 'sink_specifications':
                    if (!hasMissingSinkSpecificationFields(product.missing_fields)) return false;
                    break;
                case 'overall_dimensions':
                    if (!hasMissingOverallDimensionFields(product.missing_fields)) return false;
                    break;
                case 'bowl_dimensions':
                    if (!hasMissingBowlDimensionFields(product.missing_fields)) return false;
                    break;
                case 'additional_info':
                    if (!hasMissingAdditionalInfoFields(product.missing_fields)) return false;
                    break;
                case 'seo_info':
                    if (!hasMissingSeoInfoFields(product.missing_fields)) return false;
                    break;
                case 'product_content':
                    if (!hasMissingProductContentFields(product.missing_fields)) return false;
                    break;
                case 'spec_sheet_verification':
                    if (!hasSpecSheetVerificationIssues(product.missing_fields)) return false;
                    break;
            }
        }

        return true;
    });

    // Update the display
    const container = document.getElementById('missingProductsList');
    const countElement = document.getElementById('modalFilteredCount');

    if (filteredProducts.length === 0) {
        container.innerHTML = `
            <div class="text-center py-4">
                <i class="fas fa-search fa-3x text-muted mb-3"></i>
                <h6>No products match your filters</h6>
                <small class="text-muted">Try adjusting your filter criteria</small>
            </div>
        `;
        countElement.textContent = '0';
    } else {
        container.innerHTML = generateFilteredMissingProductsList(filteredProducts);
        countElement.textContent = filteredProducts.length;
    }
}

/**
 * Generate filtered missing products list HTML
 */
function generateFilteredMissingProductsList(products) {
    return products.map(product => `
        <div class="card mb-3 ${product.critical_missing_count > 0 ? 'border-danger' : 'border-warning'}">
            <div class="card-body">
                <div class="row align-items-center">
                    <div class="col-md-8">
                        <h6 class="mb-1">${product.title || `Product ${product.row_num}`}</h6>
                        <small class="text-muted">SKU: ${product.sku || 'N/A'} | Row: ${product.row_num} | Quality: ${product.quality_score}%</small>
                        <div class="mt-1">
                            <span class="badge bg-secondary me-1">${productsData[product.row_num]?.brand_name || 'Unknown Brand'}</span>
                            <span class="badge ${product.critical_missing_count > 0 ? 'bg-danger' : 'bg-warning'}">${product.total_missing_count} missing</span>
                        </div>
                    </div>
                    <div class="col-md-4 text-end">
                        <button class="btn btn-sm btn-primary" onclick="editProduct(${product.row_num})">
                            <i class="fas fa-edit me-1"></i>Fix Now
                        </button>
                    </div>
                </div>
                <div class="mt-2">
                    <strong class="text-danger">Missing Fields:</strong>
                    <div class="mt-1">
                        ${product.missing_fields.map(field => `
                            <span class="badge ${field.verification_issue ? 'bg-info' : (field.is_critical ? 'bg-danger' : 'bg-warning')} me-1 mb-1"
                                  ${field.verification_issue && field.details ? `title="${field.details}"` : ''}>
                                ${field.verification_issue ? '🔍 ' : ''}${field.display_name}
                            </span>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

/**
 * Export Missing Information Report
 */
function exportMissingInfoReport() {
    console.log('📊 Exporting missing information report...');
    // This would generate a CSV or PDF report
    showSuccessMessage('Report export feature coming soon!');
}

// Add to global exports
window.showMissingInfoAnalysis = showMissingInfoAnalysis;
window.exportMissingInfoReport = exportMissingInfoReport;

/**
 * Initialize brand filter dropdown
 */
function initializeBrandFilter() {
    const brandFilter = document.getElementById('brandFilter');
    if (!brandFilter || !productsData) return;

    // Get unique brands from products data
    const brands = new Set();
    Object.values(productsData).forEach(product => {
        const brand = product.brand_name;
        if (brand && brand.trim()) {
            brands.add(brand.trim());
        }
    });

    // Clear existing options (except "All Brands")
    brandFilter.innerHTML = '<option value="">All Brands</option>';

    // Add brand options sorted alphabetically
    [...brands].sort().forEach(brand => {
        const option = document.createElement('option');
        option.value = brand;
        option.textContent = brand;
        brandFilter.appendChild(option);
    });

    console.log(`🏷️ Initialized brand filter with ${brands.size} brands`);
}

/**
 * Apply all active filters (search, brand, missing info type)
 */
function applyFilters() {
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const brandFilter = document.getElementById('brandFilter')?.value || '';
    const missingInfoFilter = document.getElementById('missingInfoFilter')?.value || '';

    console.log('🔍 Applying filters:', { searchTerm, brandFilter, missingInfoFilter, currentFilter });

    if (window.progressiveLoader && window.progressiveLoader.applyFilters) {
        // Use progressive loader's filtering if available
        window.progressiveLoader.applyFilters({
            search: searchTerm,
            brand: brandFilter,
            missingInfo: missingInfoFilter,
            quickFilter: currentFilter
        });
    } else {
        // Fallback to basic filtering - integrate with existing system
        combinedApplyFilters(searchTerm, brandFilter, missingInfoFilter, currentFilter);
    }

    updateFilteredCount();
}

/**
 * Combined filter implementation integrating quick filters and detailed filters
 */
function combinedApplyFilters(searchTerm, brandFilter, missingInfoFilter, quickFilter) {
    const productCards = document.querySelectorAll('.product-card');
    let visibleCount = 0;

    productCards.forEach(card => {
        const rowNum = card.dataset.row;
        const product = productsData[rowNum];

        if (!product) {
            card.style.display = 'none';
            return;
        }

        let showCard = true;

        // Apply quick filter first
        if (quickFilter && quickFilter !== 'all') {
            const qualityScore = getQualityScore(product);

            switch (quickFilter) {
                case 'missing-critical':
                    if (qualityScore >= 30) showCard = false;
                    break;
                case 'missing-some':
                    if (qualityScore < 30 || qualityScore >= 80) showCard = false;
                    break;
                case 'complete':
                    if (qualityScore < 80) showCard = false;
                    break;
                case 'selected':
                    if (!selectedProducts.includes(parseInt(rowNum))) showCard = false;
                    break;
            }
        }

        // Apply search filter
        if (showCard && searchTerm) {
            const searchFields = [
                product.title || '',
                product.variant_sku || '',
                product.brand_name || '',
                product.product_material || ''
            ].join(' ').toLowerCase();

            if (!searchFields.includes(searchTerm)) {
                showCard = false;
            }
        }

        // Apply brand filter
        if (showCard && brandFilter && product.brand_name !== brandFilter) {
            showCard = false;
        }

        // Apply missing info filter
        if (showCard && missingInfoFilter) {
            const hasMissingInfo = getProductMissingInfo(rowNum);

            switch (missingInfoFilter) {
                case 'missing-critical':
                    if (!hasMissingInfo || hasMissingInfo.critical_missing_count === 0) showCard = false;
                    break;
                case 'missing-content':
                    if (!hasMissingInfo || !hasMissingContentFields(hasMissingInfo.missing_fields)) showCard = false;
                    break;
                case 'missing-dimensions':
                    if (!hasMissingInfo || !hasMissingDimensionFields(hasMissingInfo.missing_fields)) showCard = false;
                    break;
                case 'missing-specifications':
                    if (!hasMissingInfo || !hasMissingSpecificationFields(hasMissingInfo.missing_fields)) showCard = false;
                    break;
                case 'complete':
                    if (hasMissingInfo && hasMissingInfo.total_missing_count > 0) showCard = false;
                    break;
            }
        }

        card.style.display = showCard ? 'block' : 'none';
        if (showCard) visibleCount++;
    });

    console.log(`📊 Combined filtered results: ${visibleCount} products visible`);
}

/**
 * Basic filter implementation (fallback)
 */
function basicApplyFilters(searchTerm, brandFilter, missingInfoFilter) {
    const productCards = document.querySelectorAll('.product-card');
    let visibleCount = 0;

    productCards.forEach(card => {
        const rowNum = card.dataset.row;
        const product = productsData[rowNum];

        if (!product) {
            card.style.display = 'none';
            return;
        }

        let showCard = true;

        // Search filter
        if (searchTerm) {
            const searchFields = [
                product.title || '',
                product.variant_sku || '',
                product.brand_name || '',
                product.product_material || ''
            ].join(' ').toLowerCase();

            if (!searchFields.includes(searchTerm)) {
                showCard = false;
            }
        }

        // Brand filter
        if (brandFilter && product.brand_name !== brandFilter) {
            showCard = false;
        }

        // Missing info filter
        if (missingInfoFilter) {
            const hasMissingInfo = getProductMissingInfo(rowNum);

            switch (missingInfoFilter) {
                case 'missing-critical':
                    if (!hasMissingInfo || hasMissingInfo.critical_missing_count === 0) showCard = false;
                    break;
                case 'missing-content':
                    if (!hasMissingInfo || !hasMissingContentFields(hasMissingInfo.missing_fields)) showCard = false;
                    break;
                case 'missing-dimensions':
                    if (!hasMissingInfo || !hasMissingDimensionFields(hasMissingInfo.missing_fields)) showCard = false;
                    break;
                case 'missing-specifications':
                    if (!hasMissingInfo || !hasMissingSpecificationFields(hasMissingInfo.missing_fields)) showCard = false;
                    break;
                case 'complete':
                    if (hasMissingInfo && hasMissingInfo.total_missing_count > 0) showCard = false;
                    break;
            }
        }

        card.style.display = showCard ? 'block' : 'none';
        if (showCard) visibleCount++;
    });

    console.log(`📊 Filtered results: ${visibleCount} products visible`);
}

/**
 * Get missing info data for a specific product row
 */
function getProductMissingInfo(rowNum) {
    if (!missingInfoData || !missingInfoData.missing_info_analysis) return null;

    return missingInfoData.missing_info_analysis.find(product =>
        product.row_num === parseInt(rowNum)
    );
}

/**
 * Check if missing fields contain content fields
 */
/**
 * Check if missing fields contain sink specification fields
 */
function hasMissingSinkSpecificationFields(missingFields) {
    if (!missingFields) return false;

    const sinkSpecFields = ['product_material', 'grade_of_material', 'installation_type', 'style', 'has_overflow', 'tap_holes_number', 'bowls_number', 'waste_outlet_dimensions'];
    return missingFields.some(field =>
        sinkSpecFields.includes(field.field)
    );
}

/**
 * Check if missing fields contain overall sink dimension fields
 */
function hasMissingOverallDimensionFields(missingFields) {
    if (!missingFields) return false;

    const overallDimensionFields = ['length_mm', 'overall_width_mm', 'overall_depth_mm', 'min_cabinet_size_mm', 'cutout_size_mm'];
    return missingFields.some(field =>
        overallDimensionFields.includes(field.field)
    );
}

/**
 * Check if missing fields contain bowl dimension fields
 */
function hasMissingBowlDimensionFields(missingFields) {
    if (!missingFields) return false;

    const bowlDimensionFields = ['bowl_width_mm', 'bowl_depth_mm', 'bowl_height_mm', 'second_bowl_width_mm', 'second_bowl_depth_mm', 'second_bowl_height_mm'];
    return missingFields.some(field =>
        bowlDimensionFields.includes(field.field)
    );
}

/**
 * Check if missing fields contain additional information fields
 */
function hasMissingAdditionalInfoFields(missingFields) {
    if (!missingFields) return false;

    const additionalInfoFields = ['brand_name', 'warranty_years', 'application_location', 'drain_position'];
    return missingFields.some(field =>
        additionalInfoFields.includes(field.field)
    );
}

/**
 * Check if missing fields contain SEO information fields
 */
function hasMissingSeoInfoFields(missingFields) {
    if (!missingFields) return false;

    const seoFields = ['seo_title', 'seo_description'];
    return missingFields.some(field =>
        seoFields.includes(field.field)
    );
}

/**
 * Check if missing fields contain product content fields
 */
function hasMissingProductContentFields(missingFields) {
    if (!missingFields) return false;

    const contentFields = ['body_html', 'features', 'care_instructions', 'faqs'];
    return missingFields.some(field =>
        contentFields.includes(field.field)
    );
}

/**
 * Check if missing fields contain spec sheet verification issues
 */
function hasSpecSheetVerificationIssues(missingFields) {
    if (!missingFields) return false;

    return missingFields.some(field =>
        field.verification_issue && (
            field.issue_type === 'spec_sheet_sku_mismatch' ||
            field.issue_type === 'spec_sheet_missing'
        )
    );
}

/**
 * Check if product has complete content fields (legacy function)
 */
function hasCompleteContent(product) {
    const contentFields = ['body_html', 'features', 'care_instructions', 'faqs'];
    return contentFields.every(field => {
        const value = product[field];
        return value && value.trim() && !['', 'none', 'null', 'n/a', '-', 'tbd', 'tbc'].includes(value.toLowerCase());
    });
}

/**
 * Generate supplier contact section HTML
 */
function generateSupplierContactSection(supplierGroups) {
    if (!supplierGroups || supplierGroups.length === 0) {
        return `
            <div class="row mb-4">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">
                            <h6 class="mb-0"><i class="fas fa-envelope me-2"></i>Supplier Contact</h6>
                        </div>
                        <div class="card-body text-center text-muted">
                            <i class="fas fa-check-circle fa-3x mb-3"></i>
                            <p>No missing information found. All products have complete data!</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    const supplierCards = supplierGroups.map(supplier => `
        <div class="col-md-6 mb-3 supplier-card-wrapper" data-supplier="${supplier.supplier_name}">
            <div class="card border-left-info">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h6 class="card-title mb-0">
                            <i class="fas fa-building me-2"></i>${supplier.supplier_name}
                        </h6>
                        <span class="badge bg-warning">${supplier.total_products} products</span>
                    </div>

                    <div class="row text-center mb-3">
                        <div class="col-4">
                            <small class="text-muted">Critical</small>
                            <div class="fw-bold text-danger">${supplier.critical_products}</div>
                        </div>
                        <div class="col-4">
                            <small class="text-muted">Total Missing</small>
                            <div class="fw-bold text-warning">${supplier.total_missing_fields}</div>
                        </div>
                        <div class="col-4">
                            <small class="text-muted">Contact</small>
                            <div class="fw-bold text-info">
                                ${supplier.supplier_contact?.email ? '✓' : '✗'}
                            </div>
                        </div>
                    </div>

                    ${supplier.supplier_contact?.email ? `
                        <div class="d-grid gap-2">
                            <button class="btn btn-primary btn-sm" onclick="contactSupplier('${supplier.supplier_name}')">
                                <i class="fas fa-envelope me-2"></i>Contact ${supplier.supplier_name}
                            </button>
                        </div>
                    ` : `
                        <div class="alert alert-warning alert-sm mb-0">
                            <i class="fas fa-exclamation-triangle me-2"></i>
                            No contact information available
                        </div>
                    `}
                </div>
            </div>
        </div>
    `).join('');

    return `
        <div class="row mb-4">
            <div class="col-12">
                <div class="card">
                    <div class="card-header">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="mb-0"><i class="fas fa-envelope me-2"></i>Supplier Contact</h6>
                            <div class="d-flex align-items-center gap-3">
                                <div class="flex-grow-1" style="max-width: 400px;">
                                    <select class="form-select form-select-sm" id="supplierFilterDropdown"
                                            onchange="filterSupplierCards()" style="height: 38px;">
                                        <option value="all" selected>All Suppliers (${supplierGroups.length})</option>
                                        ${supplierGroups.map(supplier =>
                                            `<option value="${supplier.supplier_name}">
                                                ${supplier.supplier_name} (${supplier.total_products} products)
                                            </option>`
                                        ).join('')}
                                    </select>
                                </div>
                                <button class="btn btn-success" onclick="contactAllSuppliers()">
                                    <i class="fas fa-envelope-bulk me-2"></i>Contact All Suppliers
                                </button>
                                <button class="btn btn-primary" id="contactSelectedSupplierBtn" onclick="contactSelectedSupplier()" style="display: none;">
                                    <i class="fas fa-envelope me-2"></i>Contact <span id="selectedSupplierName"></span>
                                </button>
                            </div>
                        </div>
                        <small class="text-muted">Select which suppliers to contact for missing product information</small>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            ${supplierCards}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Get collection display name
 */
function getCollectionDisplayName() {
    // Simple mapping based on COLLECTION_NAME
    const collectionNames = {
        'sinks': 'Sinks & Tubs',
        'taps': 'Taps & Faucets',
        'lighting': 'Lighting'
    };
    return collectionNames[COLLECTION_NAME] || COLLECTION_NAME.charAt(0).toUpperCase() + COLLECTION_NAME.slice(1);
}

/**
 * Generate CSV content for products with missing information
 */
function generateProductCSV(products) {
    const headers = ['Product Name', 'SKU', 'Missing Fields'];
    const rows = products.map(product => {
        const filteredFields = filterSupplierRelevantFields(product.missing_fields);
        const missingFields = filteredFields.map(field =>
            field.display_name || field.field || 'Missing field information'
        ).join('; ');

        return [
            `"${product.title.replace(/"/g, '""')}"`,
            product.sku,
            `"${missingFields.replace(/"/g, '""')}"`
        ];
    });

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

/**
 * Create and download CSV file
 */
function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');

    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

/**
 * Filter out internal fields that suppliers don't need to provide
 */
function filterSupplierRelevantFields(missingFields) {
    // Fields that are internal/generated and don't need supplier input
    const excludeFields = [
        'style',
        'application_location',
        'care_instructions',
        'faqs',
        'shopify_spec_sheet',  // This is the Shopify internal field
        'seo_title',
        'seo_description',
        'body_html',           // Generated content
        'features',            // Generated content
        'quality_score',       // Internal scoring
        'shopify_status',      // Internal status
        'shopify_collections', // Internal field
        'shopify_url',         // Internal field
        'last_shopify_sync'    // Internal field
    ];

    return missingFields.filter(field => {
        const fieldName = field.field || field.display_name || '';
        const fieldDisplayName = field.display_name || field.field || '';

        // Skip excluded fields
        if (excludeFields.includes(fieldName.toLowerCase())) {
            return false;
        }

        // Skip only "Shopify Spec Sheet" but keep supplier spec sheet fields
        if (fieldDisplayName.toLowerCase().includes('spec sheet')) {
            if (fieldDisplayName.toLowerCase().includes('shopify')) {
                return false; // Skip "Shopify Spec Sheet" - this is internal
            }
            // Keep supplier spec sheet fields like "Spec Sheet (Missing)" or just "Spec Sheet"
        }

        return true;
    });
}

/**
 * Create email body content for supplier
 */
function createSupplierEmailBody(supplierName, products) {
    const collectionName = getCollectionDisplayName();

    // If more than 5 products, suggest CSV and show summary
    if (products.length > 5) {
        const csvFilename = `${supplierName}_Missing_Info_${COLLECTION_NAME}_${new Date().toISOString().split('T')[0]}.csv`;
        const csvContent = generateProductCSV(products);

        // Auto-download CSV
        downloadCSV(csvContent, csvFilename);

        return `Dear ${supplierName} Team,

I hope this email finds you well. We are currently updating our ${collectionName} product database and noticed that some information is missing for your products in our system.

We have ${products.length} products that need attention. Due to the large number of items, I've attached a CSV file (${csvFilename}) with the complete list of products and their missing information.

Summary:
- Total products requiring updates: ${products.length}
- Collection: ${collectionName}

The CSV file contains:
- Product names and SKUs
- Detailed list of missing information for each product

This information will help us better showcase your products to our customers and ensure accurate product details on our website.

Please review the attached CSV file and reply with the requested information at your earliest convenience.

Thank you for your time and cooperation.

Best regards,
Cass Brothers Team`;
    } else {
        // Show detailed list for 5 or fewer products
        const productList = products.map(product => {
            const filteredFields = filterSupplierRelevantFields(product.missing_fields);
            const missingFields = filteredFields.map(field => `- ${field.display_name || field.field || 'Missing field information'}`).join('\n    ');
            return `• ${product.title} (SKU: ${product.sku})
    Missing Information:
    ${missingFields}`;
        }).join('\n\n');

        return `Dear ${supplierName} Team,

I hope this email finds you well. We are currently updating our ${collectionName} product database and noticed that some information is missing for your products in our system.

Could you please provide the following missing information for these products:

${productList}

This information will help us better showcase your products to our customers and ensure accurate product details on our website.

Please reply with the requested information at your earliest convenience.

Thank you for your time and cooperation.

Best regards,
Cass Brothers Team`;
    }
}

/**
 * Contact individual supplier via Outlook
 */
async function contactSupplier(supplierName) {
    console.log(`📧 Opening Outlook to contact supplier: ${supplierName}`);

    try {
        // Get the supplier's products from the current missing info data
        const supplierProducts = lastMissingInfoData?.supplier_groups?.find(
            group => group.supplier_name === supplierName
        )?.products || [];

        if (supplierProducts.length === 0) {
            showErrorMessage(`No products found for supplier: ${supplierName}`);
            return;
        }

        // Get supplier contact information
        const supplierGroup = lastMissingInfoData.supplier_groups.find(
            group => group.supplier_name === supplierName
        );

        const supplierEmail = supplierGroup?.supplier_contact?.email || 'supplier@example.com';

        // Create email content
        const collectionName = getCollectionDisplayName();
        const subject = `Missing ${collectionName} Product Information - ${supplierName}`;
        const body = createSupplierEmailBody(supplierName, supplierProducts);

        // Create mailto link
        const mailto = `mailto:${supplierEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

        // Open in default email client
        window.open(mailto);

        showSuccessMessage(`Opened email client to contact ${supplierName}`);

    } catch (error) {
        console.error('Error opening email client:', error);
        showErrorMessage(`Error opening email client: ${error.message}`);
    }
}

/**
 * Contact all suppliers with missing information
 */
async function contactAllSuppliers() {
    console.log('📧 Opening email client to contact all suppliers...');

    try {
        const supplierGroups = lastMissingInfoData?.supplier_groups || [];

        if (supplierGroups.length === 0) {
            showErrorMessage('No suppliers found with missing information');
            return;
        }

        // Create individual mailto links for each supplier
        supplierGroups.forEach((supplierGroup, index) => {
            // Small delay between opening emails to prevent browser blocking
            setTimeout(() => {
                const supplierEmail = supplierGroup.supplier_contact?.email || 'supplier@example.com';
                const collectionName = getCollectionDisplayName();
                const subject = `Missing ${collectionName} Product Information - ${supplierGroup.supplier_name}`;
                const body = createSupplierEmailBody(supplierGroup.supplier_name, supplierGroup.products);
                const mailto = `mailto:${supplierEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                window.open(mailto);
            }, index * 1000); // 1 second delay between each email
        });

        showSuccessMessage(`Opening ${supplierGroups.length} email drafts in your email client...`);

    } catch (error) {
        console.error('Error opening email clients:', error);
        showErrorMessage('Failed to open email clients. Please try again.');
    }
}

/**
 * Show email preview modal for individual supplier
 */
function showEmailPreviewModal(emailContent, supplierContact, supplierNames) {
    const modalHtml = `
        <div class="modal fade" id="emailPreviewModal" tabindex="-1" aria-labelledby="emailPreviewModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="emailPreviewModalLabel">
                            <i class="fas fa-envelope"></i> Email Preview - ${supplierContact.name}
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row mb-3">
                            <div class="col-md-6">
                                <strong>To:</strong> ${emailContent.to_email}
                            </div>
                            <div class="col-md-6">
                                <strong>From:</strong> ${emailContent.from_email}
                            </div>
                        </div>
                        <div class="mb-3">
                            <strong>Subject:</strong> ${emailContent.subject}
                        </div>
                        <div class="border p-3 bg-light" style="max-height: 400px; overflow-y: auto;">
                            <pre style="white-space: pre-wrap; font-family: inherit;">${emailContent.body}</pre>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="sendEmail('${supplierContact.name}')">
                            <i class="fas fa-paper-plane"></i> Send Email
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Remove existing modal
    document.getElementById('emailPreviewModal')?.remove();

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Store email data for sending
    window.currentEmailData = {
        emailContent: emailContent,
        supplierContact: supplierContact,
        supplierNames: supplierNames
    };

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('emailPreviewModal'));
    modal.show();
}

/**
 * Show bulk email preview modal for all suppliers
 */
function showBulkEmailPreviewModal(emails) {
    const emailsHtml = emails.map((email, index) => `
        <div class="accordion-item">
            <h2 class="accordion-header" id="heading${index}">
                <button class="accordion-button ${index === 0 ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#collapse${index}" aria-expanded="${index === 0}" aria-controls="collapse${index}">
                    <strong>${email.supplier_name}</strong>
                    <span class="badge bg-primary ms-2">${email.product_count} products</span>
                </button>
            </h2>
            <div id="collapse${index}" class="accordion-collapse collapse ${index === 0 ? 'show' : ''}" aria-labelledby="heading${index}" data-bs-parent="#emailAccordion">
                <div class="accordion-body">
                    <div class="row mb-2">
                        <div class="col-md-6">
                            <strong>To:</strong> ${email.email_content.to_email}
                        </div>
                        <div class="col-md-6">
                            <strong>From:</strong> ${email.email_content.from_email}
                        </div>
                    </div>
                    <div class="mb-2">
                        <strong>Subject:</strong> ${email.email_content.subject}
                    </div>
                    <div class="border p-2 bg-light" style="max-height: 300px; overflow-y: auto;">
                        <pre style="white-space: pre-wrap; font-family: inherit; font-size: 0.9em;">${email.email_content.body}</pre>
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    const modalHtml = `
        <div class="modal fade" id="bulkEmailPreviewModal" tabindex="-1" aria-labelledby="bulkEmailPreviewModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-xl">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="bulkEmailPreviewModalLabel">
                            <i class="fas fa-envelope-bulk"></i> Bulk Email Preview - ${emails.length} Suppliers
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-info">
                            <i class="fas fa-info-circle"></i>
                            Review the generated emails below. Each supplier will receive a customized email based on their missing product information.
                        </div>
                        <div class="accordion" id="emailAccordion">
                            ${emailsHtml}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="sendBulkEmails()">
                            <i class="fas fa-paper-plane"></i> Send All Emails (${emails.length})
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Remove existing modal
    document.getElementById('bulkEmailPreviewModal')?.remove();

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Store email data for sending
    window.currentBulkEmailData = emails;

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('bulkEmailPreviewModal'));
    modal.show();
}

/**
 * Send individual email
 */
async function sendEmail(supplierName) {
    const emailData = window.currentEmailData;
    if (!emailData) {
        showErrorMessage('No email data found');
        return;
    }

    try {
        showInfoMessage(`Sending email to ${supplierName}...`);

        // Call API to send email
        const response = await fetch(`/api/${COLLECTION_NAME}/send-supplier-email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email_content: emailData.emailContent,
                supplier_contact: emailData.supplierContact
            })
        });

        const result = await response.json();

        if (result.success) {
            showSuccessMessage(`Email sent successfully to ${supplierName}!`);

            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('emailPreviewModal'));
            modal?.hide();
        } else {
            showErrorMessage(`Failed to send email: ${result.error}`);
        }

    } catch (error) {
        console.error('Error sending email:', error);
        showErrorMessage(`Failed to send email: ${error.message}`);
    }
}

/**
 * Send bulk emails
 */
async function sendBulkEmails() {
    const emailsData = window.currentBulkEmailData;
    if (!emailsData || emailsData.length === 0) {
        showErrorMessage('No email data found');
        return;
    }

    try {
        showInfoMessage(`Sending ${emailsData.length} emails...`);

        // Call API to send bulk emails
        const response = await fetch(`/api/${COLLECTION_NAME}/send-bulk-supplier-emails`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                emails: emailsData
            })
        });

        const result = await response.json();

        if (result.success) {
            let message = `Successfully sent ${result.sent_count} out of ${result.total_emails} emails`;

            if (result.failed_emails && result.failed_emails.length > 0) {
                message += `\n\nFailed to send to: ${result.failed_emails.map(f => f.supplier).join(', ')}`;
                showWarningMessage(message);
            } else {
                showSuccessMessage(message);
            }

            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('bulkEmailPreviewModal'));
            modal?.hide();
        } else {
            showErrorMessage(`Failed to send emails: ${result.error}`);
        }

    } catch (error) {
        console.error('Error sending bulk emails:', error);
        showErrorMessage(`Failed to send emails: ${error.message}`);
    }
}

/**
 * Check if product has complete dimension fields
 */
function hasCompleteDimensions(product) {
    const dimensionFields = ['length_mm', 'overall_width_mm', 'overall_depth_mm', 'bowl_width_mm', 'bowl_depth_mm', 'bowl_height_mm'];
    return dimensionFields.every(field => {
        const value = product[field];
        return value && value.trim() && !['', 'none', 'null', 'n/a', '-', 'tbd', 'tbc'].includes(value.toLowerCase());
    });
}

/**
 * Check if product has complete specification fields
 */
function hasCompleteSpecifications(product) {
    const specFields = ['product_material', 'grade_of_material', 'installation_type', 'waste_outlet_dimensions'];
    return specFields.every(field => {
        const value = product[field];
        return value && value.trim() && !['', 'none', 'null', 'n/a', '-', 'tbd', 'tbc'].includes(value.toLowerCase());
    });
}

/**
 * Clear all filters
 */
function clearAllFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('brandFilter').value = '';
    document.getElementById('missingInfoFilter').value = '';

    // Reset filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('filter-all').classList.add('active');

    currentFilter = 'all';
    applyFilters();

    console.log('🧹 All filters cleared');
}

/**
 * Update filtered product count display
 */
function updateFilteredCount() {
    const visibleCards = document.querySelectorAll('.product-card[style*="block"], .product-card:not([style*="none"])');
    const totalCards = document.querySelectorAll('.product-card');

    // Update any count displays if they exist
    const countElements = document.querySelectorAll('.filtered-count');
    countElements.forEach(el => {
        el.textContent = `${visibleCards.length} of ${totalCards.length}`;
    });
}

/**
 * Enhanced product rendering with filter initialization
 */
const originalRenderProducts = window.renderProducts;
window.renderProducts = function() {
    if (originalRenderProducts) {
        originalRenderProducts();
    }

    // Initialize brand filter after products are rendered
    setTimeout(() => {
        initializeBrandFilter();
    }, 100);
};

/**
 * Filter supplier cards based on dropdown selection
 */
function filterSupplierCards() {
    const dropdown = document.getElementById('supplierFilterDropdown');
    const selectedValue = dropdown.value;
    const supplierCards = document.querySelectorAll('.supplier-card-wrapper');
    const contactSelectedBtn = document.getElementById('contactSelectedSupplierBtn');
    const selectedSupplierName = document.getElementById('selectedSupplierName');

    // Show/hide cards based on selection
    supplierCards.forEach(card => {
        const supplierName = card.getAttribute('data-supplier');
        if (selectedValue === 'all' || supplierName === selectedValue) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });

    // Update contact button visibility and text
    if (selectedValue === 'all') {
        contactSelectedBtn.style.display = 'none';
    } else {
        contactSelectedBtn.style.display = 'inline-block';
        selectedSupplierName.textContent = selectedValue;
    }
}

/**
 * Contact the currently selected supplier
 */
async function contactSelectedSupplier() {
    const dropdown = document.getElementById('supplierFilterDropdown');
    const selectedSupplier = dropdown.value;

    if (selectedSupplier === 'all') {
        showErrorMessage('Please select a specific supplier to contact');
        return;
    }

    // Use the existing contactSupplier function
    await contactSupplier(selectedSupplier);
}

// Add new functions to global exports
window.applyFilters = applyFilters;
window.clearAllFilters = clearAllFilters;
window.initializeBrandFilter = initializeBrandFilter;
window.filterSupplierCards = filterSupplierCards;
window.contactSelectedSupplier = contactSelectedSupplier;