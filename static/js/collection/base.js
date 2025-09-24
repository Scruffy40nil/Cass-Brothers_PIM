/**
 * Base Collection JavaScript - Shared functionality across all collections
 */

// Global variables
let productsData = {};
let currentFilter = 'all';
let selectedProducts = [];
let modalCurrentImageIndex = 0;
let modalImages = [];

// Pagination variables
let currentPage = 1;
let totalPages = 1;
let productsPerPage = 100;

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
    loadProductsData(1);
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
 * Load products data from backend with traditional pagination
 */
async function loadProductsData(page = 1) {
    const startTime = performance.now();

    try {
        // Check cache first for instant loading
        const cacheKey = `page_${page}`;
        if (window.backgroundCache && window.backgroundCache[cacheKey]) {
            console.log(`⚡ Loading page ${page} from cache (instant!)`);
            const data = window.backgroundCache[cacheKey];
            delete window.backgroundCache[cacheKey]; // Remove from cache after use

            processPageData(data, page, startTime);
            return;
        }

        // Show minimal loading indicator
        showMinimalLoadingState();
        console.log(`🚀 Loading page ${page} products for ${COLLECTION_NAME}...`);

        // Check if force refresh is requested via URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        const forceRefresh = urlParams.get('force_refresh') === 'true';
        const refreshParam = forceRefresh ? '&force_refresh=true' : '';

        const response = await fetch(`/api/${COLLECTION_NAME}/products/paginated?page=${page}&limit=${productsPerPage}${refreshParam}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        processPageData(data, page, startTime);


    } catch (error) {
        console.error('Error loading products:', error);
        showErrorMessage('Failed to load products: ' + error.message);
        hideLoadingState();
    }
}

/**
 * Process page data (shared between cache and API responses)
 */
function processPageData(data, page, startTime) {
    // Store pagination info
    window.paginationInfo = data.pagination || {
        current_page: page,
        has_next: false,
        has_prev: page > 1,
        total_count: Object.keys(data.products || {}).length,
        total_pages: Math.ceil((Object.keys(data.products || {}).length) / productsPerPage)
    };

    // Update pagination variables
    currentPage = window.paginationInfo.current_page;
    totalPages = window.paginationInfo.total_pages || Math.ceil(window.paginationInfo.total_count / productsPerPage);

    // Keep global variables in sync
    window.currentPage = currentPage;
    window.totalPages = totalPages;

    productsData = data.products || {};

    const loadTime = performance.now() - startTime;
    console.log(`⚡ Loaded ${Object.keys(productsData).length} products (page ${currentPage}/${totalPages}) in ${loadTime.toFixed(1)}ms`);

    // Debug: Log first few products to verify order
    const productKeys = Object.keys(productsData).map(k => parseInt(k)).sort((a, b) => a - b);
    console.log(`📋 Product order verification - first 5 row numbers: [${productKeys.slice(0, 5).join(', ')}]`);

    // Render products and update UI
    renderProducts();
    updatePaginationControls();
    updateStatistics();
    hideLoadingState();

    // Preload next page for even faster navigation
    setTimeout(() => preloadNextPage(), 100);

    // Performance analytics
    console.log('📊 Performance stats:', {
        loadTime: `${loadTime.toFixed(1)}ms`,
        currentPage: currentPage,
        totalPages: totalPages,
        pageSize: productsPerPage,
        totalCount: window.paginationInfo.total_count,
        cacheUsed: loadTime < 100
    });
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
 * Update pagination controls
 */
function updatePaginationControls() {
    const paginationContainer = document.getElementById('paginationContainer');
    const currentPageStart = document.getElementById('currentPageStart');
    const currentPageEnd = document.getElementById('currentPageEnd');
    const totalProductCount = document.getElementById('totalProductCount');
    const currentPageDisplay = document.getElementById('currentPageDisplay');
    const prevPageItem = document.getElementById('prevPageItem');
    const nextPageItem = document.getElementById('nextPageItem');

    if (!paginationContainer) return;

    // Show pagination container
    paginationContainer.style.display = 'block';

    // Calculate display values
    const startIndex = ((currentPage - 1) * productsPerPage) + 1;
    const endIndex = Math.min(currentPage * productsPerPage, window.paginationInfo.total_count);

    // Update pagination info
    if (currentPageStart) currentPageStart.textContent = startIndex;
    if (currentPageEnd) currentPageEnd.textContent = endIndex;
    if (totalProductCount) totalProductCount.textContent = window.paginationInfo.total_count;
    if (currentPageDisplay) currentPageDisplay.textContent = currentPage;

    // Update navigation button states
    if (prevPageItem) {
        if (currentPage <= 1) {
            prevPageItem.classList.add('disabled');
        } else {
            prevPageItem.classList.remove('disabled');
        }
    }

    if (nextPageItem) {
        if (currentPage >= totalPages || !window.paginationInfo.has_next) {
            nextPageItem.classList.add('disabled');
        } else {
            nextPageItem.classList.remove('disabled');
        }
    }

    console.log(`📄 Updated pagination: Page ${currentPage}/${totalPages}, showing ${startIndex}-${endIndex} of ${window.paginationInfo.total_count}`);
}

/**
 * Navigate to a specific page
 */
function goToPage(page) {
    if (page < 1 || page > totalPages) return;
    if (page === currentPage) return;

    console.log(`🔄 Navigating from page ${currentPage} to page ${page}`);

    // Clear current products and selection
    selectedProducts = [];
    updateSelectAllState();

    // Scroll to top immediately (no animation for faster transition)
    window.scrollTo({ top: 0, behavior: 'instant' });

    // Load new page
    loadProductsData(page);
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
                <!-- Status Badge Container -->
                <div class="product-status-container" id="product-status-container-${rowNum}">
                    <span class="product-status-badge status-${(product.shopify_status || 'draft').toLowerCase()}" id="product-status-badge-${rowNum}">${getProductStatusDisplay(product)}</span>
                </div>

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
 * Get product status display text
 */
function getProductStatusDisplay(product) {
    const status = (product.shopify_status || 'draft').toLowerCase();
    return status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * Update product status badge
 */
function updateProductStatusBadge(rowNum, status) {
    console.log(`🎯 Updating status badge for row ${rowNum} to: ${status}`);

    const badge = document.getElementById(`product-status-badge-${rowNum}`);
    if (badge) {
        // Update text
        badge.textContent = status.charAt(0).toUpperCase() + status.slice(1);

        // Remove all status classes
        badge.classList.remove('status-active', 'status-draft', 'status-archived', 'status-unknown');

        // Add appropriate status class
        const statusClass = `status-${status.toLowerCase()}`;
        badge.classList.add(statusClass);

        console.log(`✅ Status badge updated for row ${rowNum}: ${status} (class: ${statusClass})`);
    } else {
        console.warn(`❌ Status badge not found for row ${rowNum}`);
    }
}

/**
 * Filter products based on current filter
 */
function filterProductsByCurrentFilter() {
    const products = Object.entries(productsData);

    // Sort by row number to maintain Google Sheets order
    products.sort(([keyA, productA], [keyB, productB]) => {
        const rowA = productA.row_number || parseInt(keyA) || 0;
        const rowB = productB.row_number || parseInt(keyB) || 0;
        return rowA - rowB;
    });

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
            return products.filter(([key, product]) => selectedProducts.includes(parseInt(key)));
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
 * Update the select all checkbox state based on current selection
 */
function updateSelectAllState() {
    const selectAllCheckbox = document.getElementById('selectAllProducts');
    if (!selectAllCheckbox) return;

    const productCheckboxes = document.querySelectorAll('.product-checkbox');
    const checkedCheckboxes = document.querySelectorAll('.product-checkbox:checked');
    const totalCheckboxes = productCheckboxes.length;
    const checkedCount = checkedCheckboxes.length;

    if (checkedCount === 0) {
        // No products selected
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    } else if (checkedCount === totalCheckboxes) {
        // All products selected
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else {
        // Some products selected
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Select All checkbox handling
    const selectAllCheckbox = document.getElementById('selectAllProducts');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function(e) {
            console.log('🔄 Select All clicked:', this.checked);
            const productCheckboxes = document.querySelectorAll('.product-checkbox');

            if (this.checked) {
                // Select all visible products
                selectedProducts = [];
                productCheckboxes.forEach(checkbox => {
                    checkbox.checked = true;
                    const rowNum = parseInt(checkbox.dataset.row);
                    if (!selectedProducts.includes(rowNum)) {
                        selectedProducts.push(rowNum);
                    }
                });
            } else {
                // Unselect all products
                selectedProducts = [];
                productCheckboxes.forEach(checkbox => {
                    checkbox.checked = false;
                });
            }
            updateStatistics();
            updateSelectAllState();
        });
    }

    // Individual checkbox selection handling
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('product-checkbox')) {
            const rowNum = parseInt(e.target.dataset.row); // Convert to integer!
            console.log(`🔄 Individual checkbox clicked: row ${rowNum}, checked: ${e.target.checked}`);

            if (e.target.checked) {
                if (!selectedProducts.includes(rowNum)) {
                    selectedProducts.push(rowNum);
                    console.log(`✅ Added row ${rowNum} to selection. Total selected: ${selectedProducts.length}`);
                }
            } else {
                const beforeCount = selectedProducts.length;
                selectedProducts = selectedProducts.filter(id => id !== rowNum);
                console.log(`❌ Removed row ${rowNum} from selection. Before: ${beforeCount}, After: ${selectedProducts.length}`);
            }

            console.log(`📊 Current selectedProducts: [${selectedProducts.join(', ')}]`);
            updateStatistics();
            updateSelectAllState();
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

/**
 * Show minimal loading state - keeps products visible with overlay
 */
function showMinimalLoadingState() {
    const container = document.getElementById('productsContainer');
    if (container) {
        container.style.opacity = '0.6';
        container.style.pointerEvents = 'none';
    }
}

function hideLoadingState() {
    const loading = document.getElementById('loadingState');
    const container = document.getElementById('productsContainer');
    if (loading) loading.style.display = 'none';
    if (container) {
        container.style.display = 'grid';
        container.style.opacity = '1';
        container.style.pointerEvents = 'auto';
    }
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
 * Show bulk AI extraction confirmation and start extraction
 */
function showBulkExtractionModal() {
    if (selectedProducts.length === 0) {
        showErrorMessage('Please select products first by checking the boxes on product cards');
        return;
    }

    // Warn about large batches that may timeout
    let message = `Start AI extraction for ${selectedProducts.length} selected products?\n\nThis will extract product information from supplier URLs.`;

    if (selectedProducts.length > 10) {
        message += `\n\n⚠️ WARNING: You have selected ${selectedProducts.length} products. Large batches may timeout.\nFor best results, process 10 or fewer products at a time.`;
    }

    const confirmed = confirm(message);
    if (confirmed) {
        startBulkAIExtraction();
    }
}

/**
 * Start bulk AI extraction for selected products
 */
function startBulkAIExtraction() {
    console.log(`🤖 Starting bulk AI extraction for ${selectedProducts.length} products`);
    console.log(`📊 Selected product row numbers: [${selectedProducts.join(', ')}]`);

    showInfoMessage(`Starting AI extraction for ${selectedProducts.length} products... This may take several minutes.`);

    // Set a longer timeout for bulk operations
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes

    fetch(`/api/${COLLECTION_NAME}/process/extract`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            selected_rows: selectedProducts,
            overwrite_mode: true
        }),
        signal: controller.signal
    })
    .then(async response => {
        clearTimeout(timeoutId);

        // Check if response is JSON or HTML (error page)
        const contentType = response.headers.get('content-type');

        if (!response.ok) {
            if (response.status === 504) {
                throw new Error('Server timeout - the extraction process may be taking longer than expected. Please check back in a few minutes.');
            } else if (response.status === 502 || response.status === 503) {
                throw new Error('Server temporarily unavailable. Please try again in a few minutes.');
            } else {
                throw new Error(`Server error: ${response.status} ${response.statusText}`);
            }
        }

        if (contentType && contentType.includes('application/json')) {
            return response.json();
        } else {
            // Server returned HTML instead of JSON (likely an error page)
            const text = await response.text();
            console.warn('Server returned non-JSON response:', text.substring(0, 200));
            throw new Error('Server returned an unexpected response. Please try again.');
        }
    })
    .then(result => {
        if (result.success) {
            const summary = result.summary || {};
            const successful = summary.successful || 0;
            const failed = summary.failed || 0;
            const skipped = summary.skipped || 0;

            showSuccessMessage(
                `AI extraction completed! ` +
                `${successful} successful, ${failed} failed, ${skipped} skipped.`
            );

            // Force refresh the products data to show updates and clear cache
            setTimeout(() => {
                // Force clear selection to reset state
                selectedProducts = [];
                document.querySelectorAll('.product-checkbox').forEach(cb => cb.checked = false);
                updateStatistics();

                // Force refresh data to ensure next bulk extraction works
                const currentUrl = new URL(window.location);
                currentUrl.searchParams.set('force_refresh', 'true');
                window.location.href = currentUrl.toString();
            }, 2000);
        } else {
            showErrorMessage(`AI extraction failed: ${result.message || 'Unknown error'}`);
        }
    })
    .catch(error => {
        clearTimeout(timeoutId);
        console.error('❌ Error during bulk AI extraction:', error);

        if (error.name === 'AbortError') {
            showErrorMessage('AI extraction timed out after 5 minutes. The process may still be running in the background. Please check back later.');
        } else {
            showErrorMessage('AI extraction failed: ' + error.message);
        }
    });
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
window.startBulkAIExtraction = startBulkAIExtraction;
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

    // Store missing info analysis globally for header filtering
    window.lastMissingInfoAnalysis = missing_info_analysis;

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
                            <h6 class="mb-0"><i class="fas fa-chart-bar me-2"></i>Field Completion Status (Click to Filter)</h6>
                        </div>
                        <div class="card-body">
                            <div class="row" id="missingFieldsChart">
                                ${generateFieldCompletionChart(summary.field_completion_status || {})}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Header Analysis Section (shows when header is filtered) -->
            <div class="row mb-4" id="headerAnalysisSection" style="display: none;">
                <div class="col-12">
                    <div class="card border-primary">
                        <div class="card-header bg-primary text-white">
                            <h6 class="mb-0"><i class="fas fa-columns me-2"></i>Analysis for Header: <span id="selectedHeaderName"></span></h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-4">
                                    <div class="text-center">
                                        <h4 class="text-danger mb-0" id="headerMissingCount">0</h4>
                                        <small class="text-muted">Products Missing This Field</small>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="text-center">
                                        <h4 class="text-warning mb-0" id="headerCriticalCount">0</h4>
                                        <small class="text-muted">Critical Missing</small>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="text-center">
                                        <button class="btn btn-sm btn-outline-secondary" onclick="clearHeaderFilter()">
                                            <i class="fas fa-times me-1"></i>Clear Filter
                                        </button>
                                    </div>
                                </div>
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
                        <div class="col-md-3">
                            <label for="modalBrandFilter" class="form-label text-muted small">Filter by Brand</label>
                            <select class="form-select form-select-sm" id="modalBrandFilter">
                                <option value="">All Brands</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label for="modalHeaderFilter" class="form-label text-muted small">Filter by Header/Column</label>
                            <select class="form-select form-select-sm" id="modalHeaderFilter">
                                <option value="">All Headers</option>
                            </select>
                        </div>
                        <div class="col-md-3">
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
                        <div class="col-md-3">
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

    // Initialize header filter in modal
    initializeModalHeaderFilter(missing_info_analysis);

    // Initialize supplier card filtering - show only first supplier by default
    setTimeout(() => {
        filterSupplierCards();
    }, 100);

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

    document.getElementById('modalHeaderFilter').addEventListener('change', () => {
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
 * Initialize header filter in modal
 */
function initializeModalHeaderFilter(missingInfoProducts) {
    console.log('🔍 Initializing modal header filter...', { missingInfoProducts });

    const headerFilter = document.getElementById('modalHeaderFilter');
    if (!headerFilter) {
        console.warn('⚠️ modalHeaderFilter element not found');
        return;
    }

    // Define priority headers to focus on
    const priorityHeaders = [
        'installation_type',
        'product_material',
        'grade_of_material',
        'style',
        'warranty_years',
        'waste_outlet_dimensions',
        'Is Undermount',
        'Is Topmount',
        'Is Flushmount',
        'has_overflow',
        'tap_holes_number',
        'bowls_number',
        'length_mm',
        'overall_width_mm',
        'overall_depth_mm',
        'min_cabinet_size_mm',
        'cutout_size_mm',
        'Bowl Width',
        'Bowl Depth',
        'Bowl Height',
        '2nd Bowl Width',
        '2nd Bowl Depth',
        '2nd Bowl Height',
        'location',
        'drain_position',
        'Body HTML',
        'Features',
        'Care Instructions and FAQ\'s',
        'spec_sheet'
    ];

    // Create display name mappings
    const headerDisplayNames = {
        'installation_type': 'Installation Type',
        'product_material': 'Product Material',
        'grade_of_material': 'Grade of Material',
        'style': 'Style',
        'warranty_years': 'Warranty Years',
        'waste_outlet_dimensions': 'Waste Outlet Dimensions',
        'Is Undermount': 'Is Undermount',
        'Is Topmount': 'Is Topmount',
        'Is Flushmount': 'Is Flushmount',
        'has_overflow': 'Has Overflow',
        'tap_holes_number': 'Tap Holes Number',
        'bowls_number': 'Bowls Number',
        'length_mm': 'Length (mm)',
        'overall_width_mm': 'Overall Width (mm)',
        'overall_depth_mm': 'Overall Depth (mm)',
        'min_cabinet_size_mm': 'Min Cabinet Size (mm)',
        'cutout_size_mm': 'Cutout Size (mm)',
        'Bowl Width': 'Bowl Width',
        'Bowl Depth': 'Bowl Depth',
        'Bowl Height': 'Bowl Height',
        '2nd Bowl Width': '2nd Bowl Width',
        '2nd Bowl Depth': '2nd Bowl Depth',
        '2nd Bowl Height': '2nd Bowl Height',
        'location': 'Location',
        'drain_position': 'Drain Position',
        'Body HTML': 'Body HTML',
        'Features': 'Features',
        'Care Instructions and FAQ\'s': 'Care Instructions and FAQ\'s',
        'spec_sheet': 'Spec Sheet'
    };

    // Get headers that actually have missing data from the priority list
    const availableHeaders = new Set();
    missingInfoProducts.forEach(product => {
        if (product.missing_fields && Array.isArray(product.missing_fields)) {
            product.missing_fields.forEach(field => {
                if (field.field && priorityHeaders.includes(field.field)) {
                    availableHeaders.add(field.field);
                }
            });
        }
    });

    // Clear existing options (except "All Headers")
    while (headerFilter.children.length > 1) {
        headerFilter.removeChild(headerFilter.lastChild);
    }

    // Add header options in the order specified in priorityHeaders
    priorityHeaders.forEach(header => {
        if (availableHeaders.has(header)) {
            const option = document.createElement('option');
            option.value = header;
            option.textContent = headerDisplayNames[header] || header;
            headerFilter.appendChild(option);
        }
    });

    console.log(`📋 Modal header filter initialized with ${availableHeaders.size} priority headers:`, [...availableHeaders]);
}

/**
 * Generate priority missing fields chart HTML
 */
function generateFieldCompletionChart(fieldCompletionStatus) {
    console.log('🎯 Generating color-coded field completion chart:', fieldCompletionStatus);

    if (!fieldCompletionStatus || Object.keys(fieldCompletionStatus).length === 0) {
        return '<div class="col-12 text-center text-muted"><em>No field completion data available</em></div>';
    }

    // Convert to array and sort by completion percentage (worst first)
    const sortedFields = Object.entries(fieldCompletionStatus)
        .sort((a, b) => a[1].completion_percentage - b[1].completion_percentage);

    return sortedFields.map(([fieldKey, fieldInfo]) => {
        const { display_name, completion_percentage, missing_count, color, status } = fieldInfo;

        // Color mapping for Bootstrap classes
        const colorClasses = {
            'red': 'btn-danger',
            'yellow': 'btn-warning',
            'green': 'btn-success'
        };

        const buttonClass = colorClasses[color] || 'btn-secondary';
        const percentage = completion_percentage.toFixed(1);

        return `
            <div class="col-md-6 col-lg-4 col-xl-3 mb-2">
                <button class="btn ${buttonClass} w-100 d-flex justify-content-between align-items-center p-2 field-completion-item"
                        data-field="${fieldKey}"
                        data-bs-toggle="tooltip"
                        data-bs-placement="top"
                        title="${display_name}: ${percentage}% complete (${missing_count} missing)"
                        onclick="filterByHeader('${fieldKey}')"
                        style="text-align: left; font-size: 0.85rem;">
                    <span class="text-truncate me-2" style="max-width: 120px;">${display_name}</span>
                    <div class="d-flex align-items-center">
                        <small class="me-1">${percentage}%</small>
                        <span class="badge bg-light text-dark">${missing_count}</span>
                    </div>
                </button>
            </div>
        `;
    }).join('');
}

/**
 * Generate products missing a specific field from ALL products in the collection
 */
function generateProductsForSpecificField(fieldName) {
    console.log(`📊 Generating products missing field: ${fieldName}`);

    if (!productsData || Object.keys(productsData).length === 0) {
        console.warn('❌ No products data available for field filtering');
        return [];
    }

    const productsWithMissingField = [];

    Object.entries(productsData).forEach(([rowNum, product]) => {
        // Check if the product is missing the specific field
        const fieldValue = product[fieldName];
        const isMissing = fieldValue === null || fieldValue === undefined ||
                         fieldValue === '' || fieldValue === 'NULL';

        if (isMissing) {
            // Create a product object matching the structure expected by the filtering system
            const productWithMissingInfo = {
                row_num: parseInt(rowNum),
                title: product.title || `Product ${rowNum}`,
                sku: product.sku || '',
                missing_fields: [{
                    field: fieldName,
                    is_critical: isFieldCritical(fieldName)
                }],
                total_missing_count: 1,
                critical_missing_count: isFieldCritical(fieldName) ? 1 : 0,
                quality_score: 95 // Placeholder score for products with only this field missing
            };

            productsWithMissingField.push(productWithMissingInfo);
        }
    });

    console.log(`✅ Found ${productsWithMissingField.length} products missing field: ${fieldName}`);
    return productsWithMissingField;
}

/**
 * Helper function to determine if a field is critical
 */
function isFieldCritical(fieldName) {
    // List of critical fields based on the backend logic
    const criticalFields = [
        'title', 'sku', 'brand_name', 'product_material', 'length_mm',
        'overall_width_mm', 'overall_depth_mm', 'bowl_width_mm',
        'bowl_depth_mm', 'bowl_height_mm', 'application_location'
    ];
    return criticalFields.includes(fieldName);
}

/**
 * Filter products by specific header/field
 */
function filterByHeader(fieldName) {
    console.log(`🔍 Filtering by header: ${fieldName}`);

    const headerFilter = document.getElementById('modalHeaderFilter');
    if (headerFilter) {
        headerFilter.value = fieldName;

        // Update the header analysis section
        updateHeaderAnalysisSection(fieldName);

        // Generate products missing this specific field from ALL products
        const productsWithMissingField = generateProductsForSpecificField(fieldName);

        // Apply the filter with the specific field products
        applyModalFilters(productsWithMissingField);
    }
}

/**
 * Clear header filter
 */
function clearHeaderFilter() {
    console.log(`🔄 Clearing header filter`);

    const headerFilter = document.getElementById('modalHeaderFilter');
    if (headerFilter) {
        headerFilter.value = '';

        // Hide the header analysis section
        const analysisSection = document.getElementById('headerAnalysisSection');
        if (analysisSection) {
            analysisSection.style.display = 'none';
        }

        // Apply the filter with original missing info analysis
        if (window.lastMissingInfoAnalysis) {
            applyModalFilters(window.lastMissingInfoAnalysis);
        }
    }
}

/**
 * Update the header analysis section
 */
function updateHeaderAnalysisSection(fieldName) {
    const analysisSection = document.getElementById('headerAnalysisSection');
    const selectedHeaderName = document.getElementById('selectedHeaderName');
    const headerMissingCount = document.getElementById('headerMissingCount');
    const headerCriticalCount = document.getElementById('headerCriticalCount');

    if (!analysisSection || !productsData) return;

    // Show the section
    analysisSection.style.display = 'block';

    // Update header name
    if (selectedHeaderName) {
        selectedHeaderName.textContent = fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    // Calculate counts for this specific field from ALL products
    let missingCount = 0;
    let criticalCount = 0;

    Object.values(productsData).forEach(product => {
        const fieldValue = product[fieldName];
        const isMissing = fieldValue === null || fieldValue === undefined ||
                         fieldValue === '' || fieldValue === 'NULL';

        if (isMissing) {
            missingCount++;
            if (isFieldCritical(fieldName)) {
                criticalCount++;
            }
        }
    });

    // Update counts
    if (headerMissingCount) {
        headerMissingCount.textContent = missingCount;
    }
    if (headerCriticalCount) {
        headerCriticalCount.textContent = criticalCount;
    }
}

/**
 * Apply all modal filters
 */
function applyModalFilters(allProducts) {
    const brandFilter = document.getElementById('modalBrandFilter')?.value || '';
    const headerFilter = document.getElementById('modalHeaderFilter')?.value || '';
    const missingTypeFilter = document.getElementById('modalMissingTypeFilter')?.value || '';
    const searchTerm = document.getElementById('modalSearchFilter')?.value.toLowerCase() || '';

    // Get quick filter selection
    let quickFilter = 'critical'; // default
    if (document.getElementById('filterAll')?.checked) quickFilter = 'all';
    if (document.getElementById('filterComplete')?.checked) quickFilter = 'complete';

    console.log('🔍 Modal filters:', { brandFilter, headerFilter, missingTypeFilter, searchTerm, quickFilter });

    // Show/hide header analysis section
    const analysisSection = document.getElementById('headerAnalysisSection');
    if (headerFilter && analysisSection) {
        updateHeaderAnalysisSection(headerFilter);
    } else if (analysisSection) {
        analysisSection.style.display = 'none';
    }

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

        // Header/Column filter - show only products missing data in specific header
        if (headerFilter) {
            const hasMissingHeader = product.missing_fields.some(field => field.field === headerFilter);
            if (!hasMissingHeader) return false;
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

    try {
        // Create a link to download the CSV with cache-busting parameter
        const timestamp = new Date().getTime();
        const downloadUrl = `/api/${COLLECTION_NAME}/products/missing-info-export?t=${timestamp}`;

        console.log('🔗 Downloading from URL:', downloadUrl);

        // Create temporary download link
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `${COLLECTION_NAME}_missing_information_detailed.csv`;
        link.style.display = 'none';

        // Add to page, click, and remove
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showSuccessMessage('Detailed missing information report downloaded successfully!');

    } catch (error) {
        console.error('Error downloading missing info report:', error);
        showErrorMessage('Failed to download missing information report: ' + error.message);
    }
}

/**
 * Show Testing Feature - Gamified Missing Info UX
 */
async function showTestingFeature() {
    try {
        console.log(`🧪 Loading Testing Feature for ${COLLECTION_NAME}...`);

        // Show loading state
        const loadingHtml = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Analyzing...</span>
                </div>
                <p class="mt-3">🎮 Loading gamified data quality experience...</p>
            </div>
        `;

        // Create or update modal
        let modal = document.getElementById('testingFeatureModal');
        if (!modal) {
            modal = createTestingFeatureModal();
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

        if (data.success) {
            // Store globally for filtering
            window.testingFeatureMissingInfo = data.missing_info_analysis;

            // Display the gamified UI
            displayTestingFeatureResults(modalBody, data);
        } else {
            modalBody.innerHTML = `
                <div class="alert alert-danger">
                    <h5>Error Loading Testing Feature</h5>
                    <p>${data.error || 'Unknown error occurred'}</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('❌ Error loading Testing Feature:', error);
        const modalBody = document.getElementById('testingFeatureModal')?.querySelector('.modal-body');
        if (modalBody) {
            modalBody.innerHTML = `
                <div class="alert alert-warning">
                    <h5><i class="fas fa-exclamation-triangle me-2"></i>Testing Feature Unavailable</h5>
                    <p>The missing data analysis API is not available on the current server.</p>
                    <div class="mt-3">
                        <strong>To use this feature:</strong>
                        <ol class="mt-2">
                            <li>Access the site directly via <code>http://127.0.0.1:8000/sinks</code></li>
                            <li>Or use the regular "Find Missing Info" button for now</li>
                        </ol>
                    </div>
                    <hr>
                    <small class="text-muted">
                        <strong>Technical Details:</strong><br>
                        Network error: ${error.message}<br>
                        The local Flask server has this feature, but tunnel/proxy URLs may not.
                    </small>
                </div>
            `;
        }
    }
}

/**
 * Create Testing Feature Modal
 */
function createTestingFeatureModal() {
    const modal = document.createElement('div');
    modal.className = 'modal fade testing-modal';
    modal.id = 'testingFeatureModal';
    modal.tabIndex = -1;
    modal.setAttribute('aria-labelledby', 'testingFeatureModalLabel');
    modal.setAttribute('aria-hidden', 'true');

    modal.innerHTML = `
        <div class="modal-dialog modal-xl">
            <div class="modal-content">
                <div class="modal-header bg-info text-white">
                    <h1 class="modal-title fs-5" id="testingFeatureModalLabel">
                        <i class="fas fa-flask me-2"></i>🎮 Testing Feature - Gamified Data Quality
                    </h1>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <!-- Content will be loaded here -->
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                </div>
            </div>
        </div>
    `;

    return modal;
}

/**
 * Display Testing Feature Results - Simple & Visual UX
 */
function displayTestingFeatureResults(container, data) {
    const { missing_info_analysis, summary, field_definitions } = data;

    // Calculate overall stats
    // Note: productsData only contains currently loaded products (paginated)
    // missing_info_analysis contains all products with issues from the entire collection
    const loadedProducts = Object.keys(productsData).length;
    const productsWithIssues = missing_info_analysis.length;

    // Use the summary data from Flask for accurate totals, or fall back to pagination info
    const totalProducts = summary?.total_products || window.paginationInfo?.total_count || loadedProducts;
    const productsComplete = Math.max(0, totalProducts - productsWithIssues);
    const overallCompleteness = totalProducts > 0 ? Math.round((productsComplete / totalProducts) * 100) : 100;

    console.log('📊 Testing Feature Stats:', {
        loadedProducts,
        productsWithIssues,
        totalProducts,
        productsComplete,
        overallCompleteness
    });

    // Generate smart insights and analytics
    const brandStats = generateBrandInsights(missing_info_analysis);
    const criticalProducts = missing_info_analysis.filter(p => p.critical_missing_count > 0).length;
    const recommendedProducts = missing_info_analysis.filter(p => p.critical_missing_count === 0 && p.total_missing_count > 0).length;

    container.innerHTML = `
        <div class="testing-feature-content">
            <!-- Enhanced Header with Progress -->
            <div class="row mb-4">
                <div class="col-12">
                    <div class="card border-0 shadow-sm">
                        <div class="card-body text-center">
                            <h2><i class="fas fa-microscope me-2 text-primary"></i>Data Quality Dashboard</h2>

                            <!-- Progress Rings -->
                            <div class="row mt-4">
                                <div class="col-md-4">
                                    <div class="progress-ring-container">
                                        <div class="progress-ring" data-progress="${overallCompleteness}">
                                            <svg class="progress-ring-svg" width="120" height="120">
                                                <circle class="progress-ring-background" cx="60" cy="60" r="50"></circle>
                                                <circle class="progress-ring-progress" cx="60" cy="60" r="50"
                                                        style="stroke-dasharray: ${2 * Math.PI * 50}; stroke-dashoffset: ${2 * Math.PI * 50 * (1 - overallCompleteness/100)};"></circle>
                                            </svg>
                                            <div class="progress-ring-text">
                                                <div class="progress-percentage">${overallCompleteness}%</div>
                                                <div class="progress-label">Complete</div>
                                            </div>
                                        </div>
                                        <div class="mt-2">
                                            <strong class="text-success">${productsComplete}</strong> of <strong>${totalProducts}</strong> products complete
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="stat-card critical">
                                        <div class="stat-number">${criticalProducts}</div>
                                        <div class="stat-label">Critical Issues</div>
                                        <div class="stat-sublabel">Need immediate attention</div>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="stat-card recommended">
                                        <div class="stat-number">${recommendedProducts}</div>
                                        <div class="stat-label">Improvements</div>
                                        <div class="stat-sublabel">Nice to have fixes</div>
                                    </div>
                                </div>
                            </div>

                            <!-- Smart Suggestions -->
                            <div class="smart-suggestions mt-4">
                                <div class="alert alert-light border-0">
                                    <i class="fas fa-lightbulb text-warning me-2"></i>
                                    <strong>Smart Suggestion:</strong> ${brandStats.topBrand ?
                                        `Focus on ${brandStats.topBrand.name} first (${brandStats.topBrand.count} products need attention)` :
                                        'Great job! Most products are in good shape.'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Quick Filter Chips & Controls -->
            <div class="row mb-4">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <!-- Quick Filter Chips -->
                            <div class="mb-3">
                                <label class="form-label fw-bold"><i class="fas fa-filter me-1"></i>Quick Filters</label>
                                <div class="d-flex flex-wrap gap-2">
                                    <button class="btn btn-outline-danger btn-sm filter-chip" onclick="applyQuickFilter('critical')">
                                        <i class="fas fa-exclamation-circle me-1"></i>Critical Missing (${criticalProducts})
                                    </button>
                                    <button class="btn btn-outline-warning btn-sm filter-chip" onclick="applyQuickFilter('recommended')">
                                        <i class="fas fa-info-circle me-1"></i>Improvements (${recommendedProducts})
                                    </button>
                                    <button class="btn btn-outline-info btn-sm filter-chip" onclick="applyQuickFilter('missing_images')">
                                        <i class="fas fa-image me-1"></i>Missing Images
                                    </button>
                                    <button class="btn btn-outline-secondary btn-sm filter-chip" onclick="applyQuickFilter('no_descriptions')">
                                        <i class="fas fa-file-text me-1"></i>No Descriptions
                                    </button>
                                    <button class="btn btn-outline-primary btn-sm filter-chip" onclick="applyQuickFilter('price_issues')">
                                        <i class="fas fa-dollar-sign me-1"></i>Price Issues
                                    </button>
                                </div>
                            </div>

                            <!-- Search & Advanced Filters -->
                            <div class="row align-items-center">
                                <div class="col-md-3">
                                    <div class="input-group">
                                        <span class="input-group-text"><i class="fas fa-search"></i></span>
                                        <input type="text" class="form-control" id="testingFeatureSearch"
                                               placeholder="Search products..."
                                               onkeyup="filterTestingFeatureResults()">
                                    </div>
                                </div>
                                <div class="col-md-2">
                                    <select class="form-select" id="testingFeatureSortBy" onchange="sortTestingFeatureResults()">
                                        <option value="priority">Priority First</option>
                                        <option value="brand">By Brand</option>
                                        <option value="completion">By Completion</option>
                                        <option value="alphabetical">A-Z</option>
                                    </select>
                                </div>
                                <div class="col-md-2">
                                    <select class="form-select" id="testingFeatureFieldFilter" onchange="filterTestingFeatureResults()">
                                        <option value="">All Fields</option>
                                        <option value="critical">Critical Only</option>
                                        <option value="recommended">Recommended Only</option>
                                        ${generateFieldFilterOptions(missing_info_analysis)}
                                    </select>
                                </div>
                                <div class="col-md-3">
                                    <select class="form-select" id="testingFeatureBrandFilter" onchange="filterTestingFeatureResults()">
                                        <option value="">All Brands</option>
                                        ${generateBrandFilterOptions(missing_info_analysis)}
                                    </select>
                                </div>
                                <div class="col-md-2">
                                    <div class="d-flex gap-2">
                                        <button class="btn btn-outline-secondary btn-sm" onclick="clearTestingFeatureFilters()">
                                            <i class="fas fa-times"></i>
                                        </button>
                                        <button class="btn btn-primary btn-sm" onclick="showBulkActions()" title="Bulk Actions">
                                            <i class="fas fa-tasks"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Enhanced Product List View -->
            <div class="row">
                <div class="col-12">
                    <div id="testingFeatureResults">
                        ${generateEnhancedProductList(missing_info_analysis)}
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Generate brand insights for smart suggestions
 */
function generateBrandInsights(products) {
    const brandCounts = {};

    products.forEach(product => {
        const brand = product.brand_name || 'Unknown Brand';
        if (!brandCounts[brand]) {
            brandCounts[brand] = { name: brand, count: 0, criticalCount: 0 };
        }
        brandCounts[brand].count++;
        if (product.critical_missing_count > 0) {
            brandCounts[brand].criticalCount++;
        }
    });

    const sortedBrands = Object.values(brandCounts).sort((a, b) => b.criticalCount - a.criticalCount);
    return {
        topBrand: sortedBrands[0] || null,
        brands: sortedBrands
    };
}

/**
 * Generate Enhanced Product List with priority sorting and visual improvements
 */
function generateEnhancedProductList(products) {
    // Filter out empty rows and sort by priority
    const realProducts = products.filter(product => {
        const hasTitle = product.title && product.title.trim() !== '';
        const hasSku = product.sku && product.sku.trim() !== '';
        return hasTitle || hasSku;
    });

    // Sort by priority: critical first, then by total missing count
    realProducts.sort((a, b) => {
        if (a.critical_missing_count !== b.critical_missing_count) {
            return b.critical_missing_count - a.critical_missing_count;
        }
        return b.total_missing_count - a.total_missing_count;
    });

    if (!realProducts || realProducts.length === 0) {
        return `
            <div class="text-center py-5">
                <div class="alert alert-success border-0 shadow-sm">
                    <i class="fas fa-check-circle fa-3x text-success mb-3"></i>
                    <h4>🎉 Outstanding Work!</h4>
                    <p>Every product in this collection has complete data quality.</p>
                </div>
            </div>
        `;
    }

    // Update the display counter
    setTimeout(() => {
        const countElement = document.getElementById('testingFeatureCount');
        if (countElement) {
            countElement.textContent = realProducts.length;
        }
    }, 100);

    let html = `
        <div class="enhanced-product-scanner">
            <div class="scanner-header mb-3">
                <div class="row align-items-center">
                    <div class="col-md-8">
                        <h5 class="mb-0"><i class="fas fa-list-alt me-2"></i>Products Requiring Attention</h5>
                        <small class="text-muted">Sorted by priority • Click any product to edit</small>
                    </div>
                    <div class="col-md-4 text-end">
                        <div class="d-flex align-items-center justify-content-end gap-3">
                            <span class="badge bg-primary fs-6">${realProducts.length} products</span>
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" id="bulkSelectMode" onchange="toggleBulkSelection()">
                                <label class="form-check-label text-muted small" for="bulkSelectMode">
                                    Bulk Select
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="scanner-list">
    `;

    realProducts.forEach((product, index) => {
        const productData = productsData[product.row_num];

        // Get product details
        const productName = product.title || `Product ${product.row_num}`;
        const sku = product.sku || 'No SKU';
        const brandName = product.brand_name || productData?.brand_name || 'Unknown Brand';

        // Determine severity level
        const severityLevel = product.critical_missing_count > 5 ? 'critical' :
                             product.critical_missing_count > 0 ? 'important' : 'nice-to-have';

        const severityColor = severityLevel === 'critical' ? 'danger' :
                             severityLevel === 'important' ? 'warning' : 'info';

        // Create a simple SVG placeholder as data URL to avoid network issues
        const placeholderSvg = `data:image/svg+xml;base64,${btoa(`
            <svg width="60" height="60" xmlns="http://www.w3.org/2000/svg">
                <rect width="60" height="60" fill="#e9ecef"/>
                <text x="30" y="30" text-anchor="middle" dy="0.3em" font-family="Arial, sans-serif" font-size="10" fill="#6c757d">No Image</text>
            </svg>
        `)}`;

        // Get thumbnail image - prioritize API data, then fallback to productsData
        let thumbnailUrl = product.image_url || placeholderSvg;

        // If no image from API, try productsData as fallback
        if (!product.image_url && productData) {
            thumbnailUrl = productData.shopify_images ||
                          productData.image_url ||
                          productData.featured_image ||
                          productData.image ||
                          productData.shopify_image_url ||
                          productData.main_image ||
                          (productData.images && productData.images.length > 0 ? productData.images[0].url || productData.images[0] : null) ||
                          (productData.product_images && productData.product_images.length > 0 ? productData.product_images[0] : null) ||
                          placeholderSvg;
        }

        // Debug logging to see what image data is available
        if (index === 0) { // Only log for first product to avoid spam
            console.log('🖼️ Product image debug:', {
                apiImageUrl: product.image_url,
                hasProductData: !!productData,
                shopifyImages: productData?.shopify_images,
                productDataKeys: productData ? Object.keys(productData).filter(key => key.toLowerCase().includes('image')) : [],
                finalThumbnailUrl: thumbnailUrl.substring(0, 50) + '...' // Truncate for readability
            });
        }

        // Count missing fields by priority
        let criticalFields = [];
        let recommendedFields = [];

        product.missing_fields.forEach(field => {
            const fieldDisplay = field.field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            if (isFieldCritical(field.field)) {
                criticalFields.push(fieldDisplay);
            } else {
                recommendedFields.push(fieldDisplay);
            }
        });

        html += `
            <div class="enhanced-scanner-item ${severityLevel}" data-product-id="${product.row_num}" data-brand="${brandName}">
                <!-- Bulk Selection Checkbox -->
                <div class="bulk-select-checkbox" style="display: none;">
                    <input type="checkbox" class="form-check-input" data-product-id="${product.row_num}">
                </div>

                <!-- Priority Indicator -->
                <div class="priority-indicator ${severityLevel}">
                    <div class="priority-badge bg-${severityColor}">
                        ${product.critical_missing_count > 0 ? product.critical_missing_count : '!'}
                    </div>
                </div>

                <!-- Product Content -->
                <div class="row align-items-center">
                    <!-- Thumbnail & Product Info -->
                    <div class="col-md-4">
                        <div class="product-info-enhanced">
                            <div class="d-flex align-items-center">
                                <div class="product-thumbnail me-3">
                                    <img src="${thumbnailUrl}" alt="${productName}"
                                         class="img-thumbnail" style="width: 60px; height: 60px; object-fit: cover;">
                                </div>
                                <div class="product-details">
                                    <h6 class="mb-1 product-title">${productName.length > 40 ? productName.substring(0, 40) + '...' : productName}</h6>
                                    <div class="product-meta">
                                        <span class="badge bg-${severityColor} me-1">${brandName}</span>
                                        <small class="text-muted">SKU: ${sku}</small>
                                    </div>
                                    <div class="completion-indicator mt-1">
                                        <div class="progress progress-sm">
                                            <div class="progress-bar bg-${severityColor}"
                                                 style="width: ${product.quality_score || 0}%"></div>
                                        </div>
                                        <small class="text-muted">${Math.round(product.quality_score || 0)}% complete</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Missing Critical Fields -->
                    <div class="col-md-5">
                        ${criticalFields.length > 0 ? `
                            <div class="missing-critical">
                                <div class="field-priority-label">
                                    <i class="fas fa-exclamation-triangle text-danger me-1"></i>
                                    <strong class="text-danger">Critical Missing (${criticalFields.length}):</strong>
                                </div>
                                <div class="missing-fields" id="critical-fields-${product.row_num}">
                                    ${criticalFields.slice(0, 4).map(field =>
                                        `<span class="badge bg-danger me-1 mb-1">${field}</span>`
                                    ).join('')}
                                    ${criticalFields.length > 4 ? `<span class="badge bg-outline-danger expandable-badge" onclick="event.stopPropagation(); toggleMissingFields('critical-fields-${product.row_num}', ${JSON.stringify(criticalFields)}, 'danger', 4)">+${criticalFields.length - 4} more</span>` : ''}
                                </div>
                            </div>
                        ` : ''}

                        ${recommendedFields.length > 0 ? `
                            <div class="missing-recommended ${criticalFields.length > 0 ? 'mt-2' : ''}">
                                <div class="field-priority-label">
                                    <i class="fas fa-info-circle text-warning me-1"></i>
                                    <strong class="text-warning">Recommended (${recommendedFields.length}):</strong>
                                </div>
                                <div class="missing-fields" id="recommended-fields-${product.row_num}">
                                    ${recommendedFields.slice(0, 3).map(field =>
                                        `<span class="badge bg-warning text-dark me-1 mb-1">${field}</span>`
                                    ).join('')}
                                    ${recommendedFields.length > 3 ? `<span class="badge bg-outline-warning expandable-badge" onclick="event.stopPropagation(); toggleMissingFields('recommended-fields-${product.row_num}', ${JSON.stringify(recommendedFields)}, 'warning', 3)">+${recommendedFields.length - 3} more</span>` : ''}
                                </div>
                            </div>
                        ` : ''}
                    </div>

                    <!-- Quick Actions -->
                    <div class="col-md-3 text-end">
                        <div class="action-buttons mb-2">
                            <button class="btn btn-${severityColor} btn-sm" onclick="event.stopPropagation(); editProductFromTestingFeature(${product.row_num})">
                                <i class="fas fa-edit me-1"></i>Fix Now
                            </button>
                        </div>

                        <!-- Completion Ring -->
                        <div class="completion-ring">
                            <svg width="40" height="40" viewBox="0 0 40 40">
                                <circle cx="20" cy="20" r="18" fill="none" stroke="#e9ecef" stroke-width="3"/>
                                <circle cx="20" cy="20" r="18" fill="none" stroke="${severityLevel === 'critical' ? '#dc3545' : severityLevel === 'important' ? '#ffc107' : '#17a2b8'}"
                                        stroke-width="3" stroke-dasharray="${2 * Math.PI * 18}"
                                        stroke-dashoffset="${2 * Math.PI * 18 * (1 - (product.quality_score || 0)/100)}"
                                        transform="rotate(-90 20 20)"/>
                            </svg>
                            <div class="completion-text">${Math.round(product.quality_score || 0)}%</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    html += `
            </div>
        </div>
    `;

    return html;
}

/**
 * Generate Simple Product List - Clean UX focused on missing data visibility
 */
function generateSimpleProductList(products) {
    // Filter out empty rows (products with no title, sku, or meaningful data)
    const realProducts = products.filter(product => {
        const hasTitle = product.title && product.title.trim() !== '';
        const hasSku = product.sku && product.sku.trim() !== '';
        const productData = productsData[product.row_num];
        const hasBrand = product.brand_name && product.brand_name.trim() !== '' ||
                         productData?.brand_name && productData.brand_name.trim() !== '';

        // Require products to have title AND/OR sku (brand alone is not enough)
        // This filters out empty rows that might only have brand data
        return hasTitle || hasSku;
    });

    if (!realProducts || realProducts.length === 0) {
        return `
            <div class="text-center py-5">
                <div class="alert alert-success">
                    <i class="fas fa-check-circle fa-3x text-success mb-3"></i>
                    <h4>🎉 All Products Complete!</h4>
                    <p>Every product in this collection has all required data.</p>
                </div>
            </div>
        `;
    }

    // Update the display counter to show real products count
    setTimeout(() => {
        const countElement = document.getElementById('testingFeatureCount');
        if (countElement) {
            countElement.textContent = realProducts.length;
        }
    }, 100);

    let html = `
        <div class="missing-data-scanner">
            <div class="scanner-header mb-3">
                <div class="row align-items-center">
                    <div class="col-md-8">
                        <h5 class="mb-0"><i class="fas fa-list me-2"></i>Products Missing Data</h5>
                        <small class="text-muted">Click any product to fix missing fields</small>
                    </div>
                    <div class="col-md-4 text-end">
                        <span class="badge bg-warning fs-6">${realProducts.length} products</span>
                    </div>
                </div>
            </div>
            <div class="scanner-list">
    `;

    realProducts.forEach(product => {
        const productData = productsData[product.row_num];

        // Use data from missing_info_analysis (which has complete product info from API)
        // Fallback to productData if needed
        const productName = product.title || `Product ${product.row_num}`;
        const sku = product.sku || 'No SKU';
        const brandName = product.brand_name || productData?.brand_name || 'Unknown Brand';

        // Count missing fields by priority
        let criticalFields = [];
        let recommendedFields = [];

        product.missing_fields.forEach(field => {
            const fieldDisplay = field.field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            if (isFieldCritical(field.field)) {
                criticalFields.push(fieldDisplay);
            } else {
                recommendedFields.push(fieldDisplay);
            }
        });

        html += `
            <div class="scanner-item">
                <div class="row align-items-center">
                    <!-- Product Info -->
                    <div class="col-md-4">
                        <div class="product-info">
                            <h6 class="mb-1">${productName.length > 30 ? productName.substring(0, 30) + '...' : productName}</h6>
                            <div class="product-meta">
                                <span class="badge bg-secondary me-1">${brandName}</span>
                                <small class="text-muted">SKU: ${sku}</small>
                            </div>
                        </div>
                    </div>

                    <!-- Missing Critical Fields -->
                    <div class="col-md-4">
                        ${criticalFields.length > 0 ? `
                            <div class="missing-critical">
                                <div class="field-priority-label">
                                    <i class="fas fa-exclamation-circle text-danger me-1"></i>
                                    <strong>Critical Missing:</strong>
                                </div>
                                <div class="missing-fields">
                                    ${criticalFields.slice(0, 3).map(field =>
                                        `<span class="badge bg-danger me-1 mb-1">${field}</span>`
                                    ).join('')}
                                    ${criticalFields.length > 3 ? `<span class="badge bg-outline-danger">+${criticalFields.length - 3} more</span>` : ''}
                                </div>
                            </div>
                        ` : ''}

                        ${recommendedFields.length > 0 ? `
                            <div class="missing-recommended ${criticalFields.length > 0 ? 'mt-2' : ''}">
                                <div class="field-priority-label">
                                    <i class="fas fa-info-circle text-warning me-1"></i>
                                    <strong>Recommended:</strong>
                                </div>
                                <div class="missing-fields">
                                    ${recommendedFields.slice(0, 4).map(field =>
                                        `<span class="badge bg-warning text-dark me-1 mb-1">${field}</span>`
                                    ).join('')}
                                    ${recommendedFields.length > 4 ? `<span class="badge bg-outline-warning">+${recommendedFields.length - 4} more</span>` : ''}
                                </div>
                            </div>
                        ` : ''}
                    </div>

                    <!-- Action -->
                    <div class="col-md-4 text-end">
                        <div class="completion-status">
                            <div class="completion-circle ${product.quality_score >= 90 ? 'high' : product.quality_score >= 70 ? 'medium' : 'low'}">
                                ${Math.round(product.quality_score || 0)}%
                            </div>
                        </div>
                        <button class="btn btn-primary btn-sm mt-2">
                            <i class="fas fa-edit me-1"></i>Fix Now
                        </button>
                    </div>
                </div>
            </div>
        `;
    });

    html += '</div></div>';
    return html;
}

/**
 * Generate Quality Heatmap
 */
function generateQualityHeatmap(missingInfoAnalysis) {
    if (!missingInfoAnalysis || missingInfoAnalysis.length === 0) {
        return '<div class="text-center py-4"><p>🎉 All products have complete data!</p></div>';
    }

    // Get first few products for demo
    const sampleProducts = missingInfoAnalysis.slice(0, 10);

    // Get common missing fields
    const allFields = new Set();
    sampleProducts.forEach(product => {
        product.missing_fields.forEach(field => {
            allFields.add(field.field);
        });
    });

    const fieldList = Array.from(allFields).slice(0, 8); // Limit to 8 fields for display

    if (fieldList.length === 0) {
        return '<div class="text-center py-4"><p>🎉 All products have complete data!</p></div>';
    }

    let heatmapHTML = '<div class="heatmap-grid">';

    // Header row with field names
    heatmapHTML += '<div class="heatmap-cell field-header-cell">Product</div>';
    fieldList.forEach(field => {
        const displayName = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        heatmapHTML += `<div class="heatmap-cell field-header-cell" title="${displayName}">${displayName.split(' ').map(w => w.substring(0, 3)).join('')}</div>`;
    });

    // Product rows
    sampleProducts.forEach(product => {
        const productData = productsData[product.row_num];
        const productName = product.title || `Product ${product.row_num}`;

        // Skip this product if productData is not available
        if (!productData) {
            console.warn(`Product data not found for row ${product.row_num}`);
            return;
        }

        heatmapHTML += `<div class="heatmap-cell product-name-cell" title="${productName}">${productName.length > 25 ? productName.substring(0, 25) + '...' : productName}</div>`;

        fieldList.forEach(field => {
            const fieldValue = productData[field];
            const isMissing = fieldValue === null || fieldValue === undefined || fieldValue === '' || fieldValue === 'NULL';
            const isCritical = isFieldCritical(field);

            let cellClass = 'complete';
            if (isMissing) {
                cellClass = isCritical ? 'missing-critical' : 'missing-recommended';
            }

            const displayName = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const tooltip = isMissing ? `Missing: ${displayName}` : `Complete: ${displayName}`;

            heatmapHTML += `
                <div class="heatmap-cell ${cellClass}"
                     onclick="openFieldEditor(${product.row_num}, '${field}')"
                     title="${tooltip}">
                    <i class="fas fa-${isMissing ? (isCritical ? 'times' : 'exclamation') : 'check'}"></i>
                </div>
            `;
        });
    });

    heatmapHTML += '</div>';
    return heatmapHTML;
}

/**
 * Generate Global Issues Panel
 */
function generateGlobalIssuesPanel(fieldCompletionStatus) {
    if (!fieldCompletionStatus || Object.keys(fieldCompletionStatus).length === 0) {
        return '<div class="p-4 text-center">No field completion data available</div>';
    }

    // Sort fields by missing count (highest first)
    const sortedFields = Object.entries(fieldCompletionStatus)
        .sort((a, b) => b[1].missing_count - a[1].missing_count)
        .slice(0, 8); // Show top 8 issues

    return sortedFields.map(([fieldKey, fieldInfo]) => {
        const { display_name, missing_count, color } = fieldInfo;
        const priorityClass = color === 'red' ? 'field-priority-critical' : color === 'yellow' ? 'field-priority-recommended' : 'field-priority-optional';

        return `
            <div class="issue-item ${priorityClass}" onclick="batchFixField('${fieldKey}')">
                <div>
                    <strong>${display_name}</strong>
                    <br>
                    <small class="text-muted">${missing_count} products affected</small>
                </div>
                <button class="fix-button">
                    <i class="fas fa-magic me-1"></i>Batch Fix
                </button>
            </div>
        `;
    }).join('');
}

/**
 * Generate Completeness Cards
 */
function generateCompletenessCards(products) {
    if (!products || products.length === 0) {
        return '<div class="col-12 text-center py-4"><p>🎉 All products have complete data!</p></div>';
    }

    return products.map(product => {
        const productData = productsData[product.row_num];

        // Skip if product data not available
        if (!productData) {
            console.warn(`Product data not found for row ${product.row_num}`);
            return '';
        }

        const completeness = Math.round(product.quality_score || 0);
        const missingCount = product.total_missing_count || 0;
        const criticalCount = product.critical_missing_count || 0;

        const ringColor = completeness >= 90 ? '#28a745' : completeness >= 70 ? '#ffc107' : '#dc3545';
        const circumference = 2 * Math.PI * 20;
        const strokeDasharray = circumference;
        const strokeDashoffset = circumference * (1 - completeness / 100);

        return `
            <div class="col-md-6 col-lg-4 col-xl-3 mb-3">
                <div class="completeness-card">
                    <div class="progress-ring" style="width: 50px; height: 50px;">
                        <svg class="progress-circle" style="width: 50px; height: 50px;">
                            <circle cx="25" cy="25" r="20" class="progress-circle-bg"></circle>
                            <circle cx="25" cy="25" r="20" class="progress-circle-fill"
                                    style="stroke: ${ringColor}; stroke-dasharray: ${strokeDasharray}; stroke-dashoffset: ${strokeDashoffset};">
                            </circle>
                        </svg>
                        <div class="progress-percentage" style="font-size: 11px;">${completeness}%</div>
                    </div>
                    <h6 class="mt-2 mb-1">${(product.title || `Product ${product.row_num}`).substring(0, 20)}${product.title && product.title.length > 20 ? '...' : ''}</h6>
                    <small class="text-muted d-block">SKU: ${product.sku || 'N/A'}</small>
                    <div class="mt-2">
                        <span class="badge bg-secondary me-1">${productData?.brand_name || 'Unknown'}</span>
                        ${criticalCount > 0 ? `<span class="badge bg-danger">${criticalCount} critical</span>` : ''}
                        ${missingCount > 0 ? `<span class="badge bg-warning">${missingCount} missing</span>` : ''}
                    </div>
                    <button class="fix-button mt-2 w-100" onclick="event.stopPropagation(); editProductFromTestingFeature(${product.row_num})">
                        <i class="fas fa-edit me-1"></i>Fix Now
                    </button>
                </div>
            </div>
        `;
    }).filter(card => card !== '').join('');
}

/**
 * Open Field Editor for specific field
 */
function openFieldEditor(rowNum, fieldName) {
    console.log(`🔧 Opening field editor for product ${rowNum}, field: ${fieldName}`);

    // For now, just open the regular product editor and show a message
    editProduct(rowNum);

    // Show a toast notification about which field to focus on
    setTimeout(() => {
        const fieldDisplayName = fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        showSuccessMessage(`💡 Focus on updating: ${fieldDisplayName}`);
    }, 1000);
}

/**
 * Batch Fix Field - Open modal for batch editing specific field
 */
function batchFixField(fieldName) {
    console.log(`🔧 Opening batch fix for field: ${fieldName}`);

    const fieldDisplayName = fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    showSuccessMessage(`🚀 Batch fix feature for "${fieldDisplayName}" coming soon!`);

    // TODO: Implement batch fix modal
}

/**
 * Start Fix Wizard
 */
function startFixWizard() {
    console.log(`🧙‍♂️ Starting Fix Wizard...`);

    // Create confetti effect
    createConfetti();

    showSuccessMessage(`✨ Fix Wizard coming soon! For now, click individual products to edit them.`);

    // TODO: Implement fix wizard modal that walks through products one by one
}

/**
 * Create Confetti Animation
 */
function createConfetti() {
    const colors = ['#ff6b6b', '#ffd93d', '#6bcf7f', '#4d96ff', '#9b59b6'];

    for (let i = 0; i < 30; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDelay = Math.random() * 2 + 's';
        confetti.style.animationDuration = (Math.random() * 3 + 2) + 's';

        document.body.appendChild(confetti);

        // Remove confetti after animation
        setTimeout(() => {
            if (confetti.parentNode) {
                confetti.parentNode.removeChild(confetti);
            }
        }, 5000);
    }
}

/**
 * Generate Field Filter Options
 */
function generateFieldFilterOptions(missingInfoAnalysis) {
    const fieldCounts = {};

    // Count occurrences of each missing field
    missingInfoAnalysis.forEach(product => {
        product.missing_fields.forEach(field => {
            const fieldDisplay = field.field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            fieldCounts[field.field] = fieldCounts[field.field] || { display: fieldDisplay, count: 0 };
            fieldCounts[field.field].count++;
        });
    });

    // Sort by count (highest first) and create options
    return Object.entries(fieldCounts)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 15) // Show top 15 most common missing fields
        .map(([fieldKey, fieldInfo]) =>
            `<option value="${fieldKey}">${fieldInfo.display} (${fieldInfo.count})</option>`
        ).join('');
}

/**
 * Generate Brand Filter Options
 */
function generateBrandFilterOptions(missingInfoAnalysis) {
    const brandCounts = {};

    // Count occurrences of each brand
    missingInfoAnalysis.forEach(product => {
        const productData = productsData[product.row_num];
        const brand = product.brand_name || productData?.brand_name || 'Unknown Brand';
        brandCounts[brand] = (brandCounts[brand] || 0) + 1;
    });

    // Sort by count (highest first) and create options
    return Object.entries(brandCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([brand, count]) =>
            `<option value="${brand}">${brand} (${count})</option>`
        ).join('');
}

/**
 * Filter Testing Feature Results
 */
function filterTestingFeatureResults() {
    const searchTerm = document.getElementById('testingFeatureSearch')?.value.toLowerCase() || '';
    const fieldFilter = document.getElementById('testingFeatureFieldFilter')?.value || '';
    const brandFilter = document.getElementById('testingFeatureBrandFilter')?.value || '';

    if (!window.testingFeatureMissingInfo) return;

    let filteredProducts = window.testingFeatureMissingInfo.filter(product => {
        const productData = productsData[product.row_num];

        // Filter out empty rows first - require title and/or sku
        const hasTitle = product.title && product.title.trim() !== '';
        const hasSku = product.sku && product.sku.trim() !== '';
        const hasBrand = product.brand_name && product.brand_name.trim() !== '' ||
                         productData?.brand_name && productData.brand_name.trim() !== '';
        if (!hasTitle && !hasSku) return false;

        // Search filter
        if (searchTerm) {
            const searchableText = [
                product.title || '',
                product.sku || '',
                product.brand_name || productData?.brand_name || '',
                ...product.missing_fields.map(f => f.field.replace(/_/g, ' '))
            ].join(' ').toLowerCase();

            if (!searchableText.includes(searchTerm)) return false;
        }

        // Brand filter
        const productBrand = product.brand_name || productData?.brand_name || '';
        if (brandFilter && productBrand !== brandFilter) return false;

        // Field filter
        if (fieldFilter) {
            if (fieldFilter === 'critical') {
                const hasCriticalMissing = product.missing_fields.some(field => isFieldCritical(field.field));
                if (!hasCriticalMissing) return false;
            } else if (fieldFilter === 'recommended') {
                const hasRecommendedMissing = product.missing_fields.some(field => !isFieldCritical(field.field));
                if (!hasRecommendedMissing) return false;
            } else {
                // Specific field filter
                const hasSpecificField = product.missing_fields.some(field => field.field === fieldFilter);
                if (!hasSpecificField) return false;
            }
        }

        return true;
    });

    // Update the results display
    const resultsContainer = document.getElementById('testingFeatureResults');
    const countElement = document.getElementById('testingFeatureCount');

    if (resultsContainer) {
        resultsContainer.innerHTML = generateSimpleProductList(filteredProducts);
    }

    if (countElement) {
        countElement.textContent = filteredProducts.length;
    }

    console.log(`🔍 Filtered testing feature results: ${filteredProducts.length} products`, {
        searchTerm, fieldFilter, brandFilter
    });
}

/**
 * Clear Testing Feature Filters
 */
function clearTestingFeatureFilters() {
    // Clear all filter inputs
    const searchInput = document.getElementById('testingFeatureSearch');
    const fieldSelect = document.getElementById('testingFeatureFieldFilter');
    const brandSelect = document.getElementById('testingFeatureBrandFilter');

    if (searchInput) searchInput.value = '';
    if (fieldSelect) fieldSelect.value = '';
    if (brandSelect) brandSelect.value = '';

    // Refresh results
    filterTestingFeatureResults();
}

// Add to global exports
window.showMissingInfoAnalysis = showMissingInfoAnalysis;
window.exportMissingInfoReport = exportMissingInfoReport;
window.filterByHeader = filterByHeader;
window.clearHeaderFilter = clearHeaderFilter;
window.showTestingFeature = showTestingFeature;
window.openFieldEditor = openFieldEditor;
window.batchFixField = batchFixField;
window.startFixWizard = startFixWizard;
window.filterTestingFeatureResults = filterTestingFeatureResults;
window.clearTestingFeatureFilters = clearTestingFeatureFilters;

// New enhanced Testing Feature functions
window.applyQuickFilter = applyQuickFilter;
window.sortTestingFeatureResults = sortTestingFeatureResults;
window.showBulkActions = showBulkActions;
window.toggleBulkSelection = toggleBulkSelection;
window.expandMissingFields = expandMissingFields;

/**
 * Apply quick filter chips
 */
function applyQuickFilter(filterType) {
    const fieldFilter = document.getElementById('testingFeatureFieldFilter');
    const searchInput = document.getElementById('testingFeatureSearch');

    // Clear existing filters first
    clearTestingFeatureFilters();

    switch(filterType) {
        case 'critical':
            fieldFilter.value = 'critical';
            break;
        case 'recommended':
            fieldFilter.value = 'recommended';
            break;
        case 'missing_images':
            searchInput.value = 'image';
            break;
        case 'no_descriptions':
            searchInput.value = 'description';
            break;
        case 'price_issues':
            searchInput.value = 'price';
            break;
    }

    // Highlight active filter chip
    document.querySelectorAll('.filter-chip').forEach(btn => {
        btn.classList.remove('active', 'btn-danger', 'btn-warning', 'btn-info', 'btn-secondary', 'btn-primary');
        btn.classList.add('btn-outline-' + (btn.textContent.includes('Critical') ? 'danger' :
                                            btn.textContent.includes('Improvements') ? 'warning' :
                                            btn.textContent.includes('Images') ? 'info' :
                                            btn.textContent.includes('Descriptions') ? 'secondary' : 'primary'));
    });

    event.target.classList.remove('btn-outline-danger', 'btn-outline-warning', 'btn-outline-info', 'btn-outline-secondary', 'btn-outline-primary');
    event.target.classList.add('active', 'btn-' + (filterType === 'critical' ? 'danger' :
                                                   filterType === 'recommended' ? 'warning' :
                                                   filterType === 'missing_images' ? 'info' :
                                                   filterType === 'no_descriptions' ? 'secondary' : 'primary'));

    filterTestingFeatureResults();
}

/**
 * Sort testing feature results
 */
function sortTestingFeatureResults() {
    const sortBy = document.getElementById('testingFeatureSortBy')?.value || 'priority';
    const resultsContainer = document.getElementById('testingFeatureResults');

    if (!window.testingFeatureMissingInfo) return;

    let sortedProducts = [...window.testingFeatureMissingInfo];

    switch(sortBy) {
        case 'priority':
            sortedProducts.sort((a, b) => {
                if (a.critical_missing_count !== b.critical_missing_count) {
                    return b.critical_missing_count - a.critical_missing_count;
                }
                return b.total_missing_count - a.total_missing_count;
            });
            break;
        case 'brand':
            sortedProducts.sort((a, b) => {
                const brandA = (a.brand_name || 'Unknown').toLowerCase();
                const brandB = (b.brand_name || 'Unknown').toLowerCase();
                return brandA.localeCompare(brandB);
            });
            break;
        case 'completion':
            sortedProducts.sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0));
            break;
        case 'alphabetical':
            sortedProducts.sort((a, b) => {
                const titleA = (a.title || '').toLowerCase();
                const titleB = (b.title || '').toLowerCase();
                return titleA.localeCompare(titleB);
            });
            break;
    }

    resultsContainer.innerHTML = generateEnhancedProductList(sortedProducts);
}

/**
 * Show bulk actions modal
 */
function showBulkActions() {
    const bulkMode = document.getElementById('bulkSelectMode');
    if (!bulkMode.checked) {
        bulkMode.checked = true;
        toggleBulkSelection();
    }

    // Show bulk actions panel
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = `
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title"><i class="fas fa-tasks me-2"></i>Bulk Actions</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="alert alert-info">
                        <i class="fas fa-info-circle me-2"></i>
                        Select products from the list below, then choose an action to apply to all selected items.
                    </div>

                    <div class="row">
                        <div class="col-md-6">
                            <h6>Field Operations</h6>
                            <div class="d-grid gap-2">
                                <button class="btn btn-outline-primary" onclick="bulkFillField()">
                                    <i class="fas fa-edit me-2"></i>Fill Missing Field
                                </button>
                                <button class="btn btn-outline-info" onclick="bulkGenerateDescriptions()">
                                    <i class="fas fa-magic me-2"></i>Generate Descriptions
                                </button>
                                <button class="btn btn-outline-warning" onclick="bulkValidatePrices()">
                                    <i class="fas fa-dollar-sign me-2"></i>Validate Prices
                                </button>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <h6>Brand Operations</h6>
                            <div class="d-grid gap-2">
                                <button class="btn btn-outline-success" onclick="bulkApplyTemplate()">
                                    <i class="fas fa-copy me-2"></i>Apply Brand Template
                                </button>
                                <button class="btn btn-outline-secondary" onclick="bulkUpdateStatus()">
                                    <i class="fas fa-toggle-on me-2"></i>Update Status
                                </button>
                                <button class="btn btn-outline-danger" onclick="bulkArchive()">
                                    <i class="fas fa-archive me-2"></i>Archive Products
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    <button type="button" class="btn btn-primary" onclick="getSelectedProducts()">
                        <i class="fas fa-check me-1"></i>Apply to Selected (<span id="selectedCount">0</span>)
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    const bootstrapModal = new bootstrap.Modal(modal);
    bootstrapModal.show();

    modal.addEventListener('hidden.bs.modal', () => {
        document.body.removeChild(modal);
    });
}

/**
 * Toggle bulk selection mode
 */
function toggleBulkSelection() {
    const isEnabled = document.getElementById('bulkSelectMode').checked;
    const checkboxes = document.querySelectorAll('.bulk-select-checkbox');

    checkboxes.forEach(checkbox => {
        checkbox.style.display = isEnabled ? 'block' : 'none';
    });

    if (!isEnabled) {
        // Clear all selections
        document.querySelectorAll('.bulk-select-checkbox input').forEach(input => {
            input.checked = false;
        });
    }
}

/**
 * Expand missing fields from element data attributes (safer approach)
 */
function expandMissingFieldsFromElement(element) {
    const containerId = element.getAttribute('data-container-id');
    const badgeType = element.getAttribute('data-badge-type');
    const allFields = JSON.parse(element.getAttribute('data-all-fields'));

    expandMissingFields(containerId, allFields, badgeType);
}

/**
 * Expand missing fields to show all items
 */
function expandMissingFields(containerId, allFields, badgeType) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Generate all field badges
    const allFieldsHtml = allFields.map(field =>
        `<span class="badge bg-${badgeType === 'warning' ? 'warning text-dark' : badgeType} me-1 mb-1">${field}</span>`
    ).join('');

    // Add collapse button
    const collapseButton = `<span class="badge bg-outline-${badgeType} expandable-badge" data-container-id="${containerId}" data-badge-type="${badgeType}" data-all-fields='${JSON.stringify(allFields)}' onclick="event.stopPropagation(); collapseMissingFieldsFromElement(this)">- show less</span>`;

    container.innerHTML = allFieldsHtml + collapseButton;
}

/**
 * Collapse missing fields from element data attributes (safer approach)
 */
function collapseMissingFieldsFromElement(element) {
    const containerId = element.getAttribute('data-container-id');
    const badgeType = element.getAttribute('data-badge-type');
    const allFields = JSON.parse(element.getAttribute('data-all-fields'));

    collapseMissingFields(containerId, allFields, badgeType);
}

/**
 * Collapse missing fields back to truncated view
 */
function collapseMissingFields(containerId, allFields, badgeType) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const isRecommended = badgeType === 'warning';
    const visibleCount = isRecommended ? 3 : 4;
    const visibleFields = allFields.slice(0, visibleCount);

    // Generate truncated view
    const visibleFieldsHtml = visibleFields.map(field =>
        `<span class="badge bg-${badgeType === 'warning' ? 'warning text-dark' : badgeType} me-1 mb-1">${field}</span>`
    ).join('');

    // Add expand button if there are more fields
    const expandButton = allFields.length > visibleCount ?
        `<span class="badge bg-outline-${badgeType} expandable-badge" onclick="expandMissingFields('${containerId}', ${JSON.stringify(allFields)}, '${badgeType}')">+${allFields.length - visibleCount} more</span>` : '';

    container.innerHTML = visibleFieldsHtml + expandButton;
}

// Export the new function
window.collapseMissingFields = collapseMissingFields;

/**
 * Simple toggle function for missing fields that doesn't break elements
 */
function toggleMissingFields(containerId, allFields, badgeType, visibleCount) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const isExpanded = container.dataset.expanded === 'true';

    if (isExpanded) {
        // Collapse - show only visible count
        const visibleFields = allFields.slice(0, visibleCount);
        const visibleFieldsHtml = visibleFields.map(field =>
            `<span class="badge bg-${badgeType === 'warning' ? 'warning text-dark' : badgeType} me-1 mb-1">${field}</span>`
        ).join('');

        const expandButton = allFields.length > visibleCount ?
            `<span class="badge bg-outline-${badgeType} expandable-badge" onclick="event.stopPropagation(); toggleMissingFields('${containerId}', ${JSON.stringify(allFields)}, '${badgeType}', ${visibleCount})">+${allFields.length - visibleCount} more</span>` : '';

        container.innerHTML = visibleFieldsHtml + expandButton;
        container.dataset.expanded = 'false';
    } else {
        // Expand - show all fields
        const allFieldsHtml = allFields.map(field =>
            `<span class="badge bg-${badgeType === 'warning' ? 'warning text-dark' : badgeType} me-1 mb-1">${field}</span>`
        ).join('');

        const collapseButton = `<span class="badge bg-outline-${badgeType} expandable-badge" onclick="event.stopPropagation(); toggleMissingFields('${containerId}', ${JSON.stringify(allFields)}, '${badgeType}', ${visibleCount})">- show less</span>`;

        container.innerHTML = allFieldsHtml + collapseButton;
        container.dataset.expanded = 'true';
    }
}

/**
 * Edit product directly with SKU passed from the card
 */
function editProductDirectly(rowNum, sku, title) {
    console.log(`🚀 editProductDirectly called for row: ${rowNum}, SKU: ${sku}, title: ${title}`);

    // Ensure productsData exists and has this product with the correct SKU
    if (!productsData) {
        productsData = {};
    }

    // Set the product data directly with the SKU we know exists
    productsData[rowNum] = {
        ...productsData[rowNum], // Keep any existing data
        variant_sku: sku,
        title: title,
        row_num: rowNum
    };

    console.log(`✅ Set productsData[${rowNum}] with SKU: ${sku}`);

    // Now call the original editProduct function
    editProduct(rowNum);
}

/**
 * Edit product from Testing Feature with proper data sync
 */
function editProductFromTestingFeature(rowNum) {
    console.log(`🔧 editProductFromTestingFeature called for row: ${rowNum}`);

    // Simple approach: just ensure productsData has something for this row
    if (!productsData) {
        productsData = {};
    }

    // If we have Testing Feature data, use it
    if (window.testingFeatureMissingInfo && window.testingFeatureMissingInfo.products) {
        const testingProduct = window.testingFeatureMissingInfo.products.find(p => p.row_num == rowNum);

        if (testingProduct) {
            console.log(`✅ Found product for row ${rowNum}: ${testingProduct.title}`);

            // Simple sync - just copy the data
            productsData[rowNum] = testingProduct;

            console.log(`🔄 Synced product data for row ${rowNum} with SKU: ${testingProduct.variant_sku || testingProduct.sku}`);
        } else {
            console.warn(`⚠️ Product ${rowNum} not found in Testing Feature data`);
        }
    }

    // Call original editProduct function
    editProduct(rowNum);
}

function getSelectedProducts() {
    const selected = [];
    document.querySelectorAll('.bulk-select-checkbox input:checked').forEach(input => {
        selected.push(input.dataset.productId);
    });

    document.getElementById('selectedCount').textContent = selected.length;
    return selected;
}

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
                case 'active':
                    if ((product.shopify_status || 'draft').toLowerCase() !== 'active') showCard = false;
                    break;
                case 'draft':
                    if ((product.shopify_status || 'draft').toLowerCase() !== 'draft') showCard = false;
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
                                        ${supplierGroups.map((supplier, index) =>
                                            `<option value="${supplier.supplier_name}" ${index === 0 ? 'selected' : ''}>
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
 * Generate CSV content for products with missing information - MATRIX FORMAT
 */
function generateProductCSV(products) {
    // First, collect all possible missing fields across all products
    const allMissingFields = new Set();

    // Fields we don't want to include in the CSV
    const excludedFields = ['Brand', 'Warranty Years', 'Min Cabinet Size Mm'];

    products.forEach(product => {
        const filteredFields = filterSupplierRelevantFields(product.missing_fields);
        filteredFields.forEach(field => {
            const fieldName = field.display_name || field.field || 'Unknown Field';
            // Skip excluded fields
            if (!excludedFields.includes(fieldName)) {
                allMissingFields.add(fieldName);
            }
        });
    });

    // Convert to sorted array for consistent column order
    const fieldColumns = Array.from(allMissingFields).sort();

    // Create header row: Product info + all missing fields as columns
    const headers = [
        'Product Title',
        'SKU',
        'Total Missing',
        ...fieldColumns
    ];

    const rows = [];
    rows.push(headers.join(','));

    // Generate data rows - one row per product
    products.forEach(product => {
        const filteredFields = filterSupplierRelevantFields(product.missing_fields);
        const productMissingFields = new Set(
            filteredFields
                .map(field => field.display_name || field.field || 'Unknown Field')
                .filter(fieldName => !excludedFields.includes(fieldName))
        );

        // Build row data
        const rowData = [
            `"${product.title.replace(/"/g, '""')}"`,
            `"${product.sku || ''}"`,
            productMissingFields.size
        ];

        // For each possible field, mark if it's missing for this product
        fieldColumns.forEach(fieldName => {
            if (productMissingFields.has(fieldName)) {
                rowData.push('NEEDED');
            } else {
                rowData.push('');
            }
        });

        rows.push(rowData.join(','));
    });

    // Add a helpful second header row with examples
    const exampleRow = [
        '(Examples below)',
        '(Product codes)',
        '(Count)',
        ...fieldColumns.map(field => {
            // Get example for this field
            const fieldExamples = {
                'Product Material': 'e.g. Stainless Steel',
                'Grade Of Material': 'e.g. 304, 316',
                'Installation Type': 'e.g. Undermount',
                'Bowl Width Mm': 'e.g. 450mm',
                'Bowl Depth Mm': 'e.g. 200mm',
                'Bowl Height Mm': 'e.g. 180mm',
                'Length Mm': 'e.g. 800mm',
                'Overall Width Mm': 'e.g. 450mm',
                'Overall Depth Mm': 'e.g. 450mm',
                'Tap Holes Number': 'e.g. 1, 3',
                'Bowls Number': 'e.g. 1, 2',
                'Has Overflow': 'Yes/No',
                'Is Undermount': 'Yes/No',
                'Is Topmount': 'Yes/No',
                'Drain Position': 'e.g. Center, Rear',
                'Waste Outlet Dimensions': 'e.g. 90mm',
                'Spec Sheet': 'URL to spec sheet'
            };
            return `"${fieldExamples[field] || 'Please provide'}"`;
        })
    ];

    // Insert example row after header
    rows.splice(1, 0, exampleRow.join(','));

    return rows.join('\n');
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

        // Skip excluded fields (by field name)
        if (excludeFields.includes(fieldName.toLowerCase())) {
            return false;
        }

        // Special handling for spec sheet fields - exclude only internal "Shopify Spec Sheet"
        if (fieldDisplayName.toLowerCase().includes('spec sheet')) {
            // Skip "Shopify Spec Sheet" - this is internal
            if (fieldDisplayName.toLowerCase().includes('shopify')) {
                return false;
            }
            // Keep supplier spec sheet fields like "Spec Sheet (Missing)" or "Spec Sheet"
            return true;
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
        if (supplierName === selectedValue) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });

    // Update contact button visibility and text
    if (selectedValue) {
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

/**
 * Preload next and previous pages in background for smoother user experience
 */
async function preloadNextPage() {
    if (!window.paginationInfo) return;

    try {
        // Initialize cache if needed
        if (!window.backgroundCache) {
            window.backgroundCache = {};
        }

        const currentPageNum = window.paginationInfo.current_page;
        const pagesToPreload = [];

        // Add next page if available
        if (window.paginationInfo.has_next && currentPageNum < totalPages) {
            pagesToPreload.push(currentPageNum + 1);
        }

        // Add previous page if available
        if (window.paginationInfo.has_prev && currentPageNum > 1) {
            pagesToPreload.push(currentPageNum - 1);
        }

        // Preload pages in parallel
        const preloadPromises = pagesToPreload.map(async (page) => {
            const cacheKey = `page_${page}`;

            // Skip if already cached
            if (window.backgroundCache[cacheKey]) return;

            console.log(`📦 Preloading page ${page} in background...`);

            try {
                const response = await fetch(`/api/${COLLECTION_NAME}/products/paginated?page=${page}&limit=${productsPerPage}`);
                if (response.ok) {
                    const data = await response.json();
                    window.backgroundCache[cacheKey] = data;
                    console.log(`✅ Cached page ${page} for instant navigation`);
                }
            } catch (err) {
                console.warn(`Failed to preload page ${page}:`, err);
            }
        });

        await Promise.all(preloadPromises);

    } catch (error) {
        console.warn('Background preloading failed:', error);
    }
}

/**
 * Load specific page from cache or server
 */
async function loadPage(pageNumber) {
    // Check background cache first
    if (window.backgroundCache && window.backgroundCache[`page_${pageNumber}`]) {
        console.log(`📋 Loading page ${pageNumber} from cache`);
        return window.backgroundCache[`page_${pageNumber}`];
    }

    // Fetch from server
    console.log(`🔄 Fetching page ${pageNumber} from server`);
    const response = await fetch(`/api/${COLLECTION_NAME}/products/paginated?page=${pageNumber}&limit=100`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
}

/**
 * Update loading progress indicator
 */
function updateLoadingProgress(loaded, total) {
    const loadingText = document.getElementById('loadingText');
    const loadingProgress = document.getElementById('loadingProgress');
    const loadingCount = document.getElementById('loadingCount');
    const loadingTotal = document.getElementById('loadingTotal');

    if (total > 0 && loadingProgress) {
        loadingProgress.style.display = 'block';
        if (loadingCount) loadingCount.textContent = loaded;
        if (loadingTotal) loadingTotal.textContent = total;

        if (loadingText) {
            const percentage = Math.round((loaded / total) * 100);
            loadingText.textContent = `Loading products... ${percentage}%`;
        }
    }
}

// Add new functions to global exports
window.applyFilters = applyFilters;
window.clearAllFilters = clearAllFilters;
window.initializeBrandFilter = initializeBrandFilter;
window.filterSupplierCards = filterSupplierCards;
window.contactSelectedSupplier = contactSelectedSupplier;
window.preloadNextPage = preloadNextPage;
window.loadPage = loadPage;
window.updateLoadingProgress = updateLoadingProgress;
window.goToPage = goToPage;
window.updatePaginationControls = updatePaginationControls;
window.expandMissingFieldsFromElement = expandMissingFieldsFromElement;
window.collapseMissingFieldsFromElement = collapseMissingFieldsFromElement;
window.editProductFromTestingFeature = editProductFromTestingFeature;
window.toggleMissingFields = toggleMissingFields;
window.editProductDirectly = editProductDirectly;

// Expose pagination variables globally
window.currentPage = currentPage;
window.totalPages = totalPages;

// Find Missing Info Feature
function showFindMissingInfo() {
    const modal = createFindMissingInfoModal();
    document.body.appendChild(modal);
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();

    modal.addEventListener('hidden.bs.modal', function () {
        document.body.removeChild(modal);
    });

    displayCleanMissingInfoResults(modal);
}

function createFindMissingInfoModal() {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'findMissingInfoModal';
    modal.innerHTML = `
        <div class="modal-dialog modal-xl">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Find Missing Info</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div id="findMissingInfoContent">
                        <div class="d-flex justify-content-center">
                            <div class="spinner-border" role="status"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    return modal;
}

function displayCleanMissingInfoResults(modal) {
    const content = modal.querySelector('#findMissingInfoContent');

    if (!window.productsData || window.productsData.length === 0) {
        content.innerHTML = '<p>No products loaded. Please load products first.</p>';
        return;
    }

    const CRITICAL_FIELDS = ['name', 'category', 'price', 'sku'];
    const RECOMMENDED_FIELDS = ['description', 'brand', 'supplier', 'image_url'];

    function isEmpty(value) {
        return !value || value.toString().trim() === '';
    }

    function getMissingFields(product) {
        const missing = [];
        [...CRITICAL_FIELDS, ...RECOMMENDED_FIELDS].forEach(field => {
            if (isEmpty(product[field])) {
                missing.push(field);
            }
        });
        return missing;
    }

    function calculateCompleteness(product) {
        const criticalMissing = CRITICAL_FIELDS.filter(field => isEmpty(product[field]));
        const recommendedMissing = RECOMMENDED_FIELDS.filter(field => isEmpty(product[field]));

        const criticalScore = ((CRITICAL_FIELDS.length - criticalMissing.length) / CRITICAL_FIELDS.length) * 70;
        const recommendedScore = ((RECOMMENDED_FIELDS.length - recommendedMissing.length) / RECOMMENDED_FIELDS.length) * 30;

        return Math.round(criticalScore + recommendedScore);
    }

    const productsWithMissing = window.productsData
        .map(product => ({
            ...product,
            missingFields: getMissingFields(product),
            completeness: calculateCompleteness(product)
        }))
        .filter(product => product.missingFields.length > 0)
        .sort((a, b) => a.completeness - b.completeness);

    if (productsWithMissing.length === 0) {
        content.innerHTML = `
            <div class="alert alert-success text-center">
                <h4>🎉 All products are complete!</h4>
                <p>No missing information found in any products.</p>
            </div>
        `;
        return;
    }

    const html = `
        <div class="mb-3">
            <h6>Products with Missing Information (${productsWithMissing.length} of ${window.productsData.length})</h6>
        </div>
        <div class="row">
            ${productsWithMissing.map(product => `
                <div class="col-md-6 mb-3">
                    <div class="card h-100">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-start mb-2">
                                <h6 class="card-title mb-0">${product.name || 'Unnamed Product'}</h6>
                                <span class="badge bg-${product.completeness < 50 ? 'danger' : product.completeness < 80 ? 'warning' : 'success'}">
                                    ${product.completeness}%
                                </span>
                            </div>
                            <p class="text-muted small mb-2">SKU: ${product.sku || 'N/A'}</p>
                            <div class="missing-fields">
                                <strong>Missing:</strong>
                                ${product.missingFields.map(field =>
                                    `<span class="badge bg-${CRITICAL_FIELDS.includes(field) ? 'danger' : 'warning'} me-1">${field}</span>`
                                ).join('')}
                            </div>
                            <div class="mt-2">
                                <button class="btn btn-primary btn-sm" onclick="editProduct('${product.sku}')">
                                    Fix Now
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    content.innerHTML = html;
}

window.showFindMissingInfo = showFindMissingInfo;