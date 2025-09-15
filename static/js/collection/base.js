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

    filteredProducts.forEach((product, index) => {
        const productCard = createProductCard(product, index);
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
        populateCollectionSpecificFields(data);
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
    const form = document.getElementById('editProductForm');
    const formData = new FormData(form);

    // Get current row number from modal state
    const modal = document.getElementById('editProductModal');
    const currentRow = modal.dataset.currentRow;

    if (!currentRow) {
        showErrorMessage('No product selected for editing');
        return;
    }

    try {
        showSaveProgress();

        const response = await fetch(`/api/${COLLECTION_NAME}/products/${currentRow}`, {
            method: 'PUT',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (result.success) {
            showSuccessMessage('Product updated successfully!');
            // Refresh the product data
            await loadProductsData();
            // Close modal
            bootstrap.Modal.getInstance(modal).hide();
        } else {
            throw new Error(result.error || 'Unknown error occurred');
        }

    } catch (error) {
        console.error('Error saving product:', error);
        showErrorMessage('Failed to save product: ' + error.message);
    } finally {
        hideSaveProgress();
    }
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

function clearSelection() {
    selectedProducts = [];
    document.querySelectorAll('.product-checkbox').forEach(cb => cb.checked = false);
    updateStatistics();
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    if (typeof COLLECTION_NAME !== 'undefined') {
        initializeCollection();
    }
});

// Export functions to window for onclick handlers
window.editProduct = editProduct;
window.navigateModalImage = navigateModalImage;
window.selectThumbnail = selectThumbnail;
window.saveProduct = saveProduct;
window.filterProducts = filterProducts;
window.clearSelection = clearSelection;