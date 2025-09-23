/**
 * Progressive Loading System - Makes large datasets load lightning fast
 * Features: Virtual scrolling, lazy loading, smart pagination
 */

class ProgressiveLoader {
    constructor(options = {}) {
        this.container = options.container || document.getElementById('productsContainer');
        this.pageSize = options.pageSize || 20;
        this.threshold = options.threshold || 500; // px from bottom to trigger load
        this.isLoading = false;
        this.hasMore = true;
        this.currentPage = 0;
        this.allProducts = [];
        this.visibleProducts = [];
        this.searchQuery = '';
        this.activeFilters = {};

        // Performance optimization
        this.renderQueue = [];
        this.renderTimer = null;

        this.setupInfiniteScroll();
        this.setupVirtualization();
    }

    /**
     * Initialize with product data
     */
    async initialize(productsData) {
        // For backward compatibility
        return this.initializeWithPagination(productsData, null);
    }

    /**
     * Initialize with paginated product data for better performance
     */
    async initializeWithPagination(productsData, paginationInfo) {
        console.log('⚡ Initializing progressive loader with', Object.keys(productsData).length, 'products');

        // Clear existing products to prevent duplicates
        if (this.container) {
            this.container.innerHTML = '';
        }

        // Clear render queue to prevent duplicates
        this.renderQueue = [];
        if (this.renderTimer) {
            cancelAnimationFrame(this.renderTimer);
            this.renderTimer = null;
        }

        // Store pagination info for server-side pagination
        this.paginationInfo = paginationInfo;
        this.serverPagination = !!paginationInfo;

        // Convert to array and add search index
        this.allProducts = Object.entries(productsData).map(([rowNum, product]) => ({
            ...product,
            rowNum: parseInt(rowNum),
            searchIndex: this.createSearchIndex(product)
        }));

        // Sort by row number to maintain Google Sheets order
        this.allProducts.sort((a, b) => (a.rowNum || 0) - (b.rowNum || 0));

        // Set visible products for client-side display
        this.visibleProducts = [...this.allProducts];
        this.currentPage = 0;
        this.hasMore = this.serverPagination ? this.paginationInfo.has_next : true;

        // Initial load
        this.loadNextPage();

        console.log('✅ Progressive loader initialized with server pagination:', this.serverPagination);
    }

    /**
     * Create search index for fast filtering
     */
    createSearchIndex(product) {
        const searchableFields = [
            'title', 'vendor', 'variant_sku', 'handle',
            'features', 'body_html', 'seo_title'
        ];

        return searchableFields
            .map(field => (product[field] || '').toLowerCase())
            .join(' ')
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Apply search and filters
     */
    applyFilters() {
        let filtered = [...this.allProducts];

        // Text search
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(product =>
                product.searchIndex.includes(query)
            );
        }

        // Quality filter
        if (this.activeFilters.quality) {
            const minScore = this.activeFilters.quality;
            filtered = filtered.filter(product =>
                (product.quality_score || 0) >= minScore
            );
        }

        // Status filter
        if (this.activeFilters.status && this.activeFilters.status !== 'all') {
            filtered = filtered.filter(product => {
                const score = product.quality_score || 0;
                switch (this.activeFilters.status) {
                    case 'excellent': return score >= 90;
                    case 'good': return score >= 70 && score < 90;
                    case 'needs-work': return score < 70;
                    default: return true;
                }
            });
        }

        this.visibleProducts = filtered;
        this.currentPage = 0;
        this.hasMore = true;

        // Clear container and reload
        if (this.container) {
            this.container.innerHTML = '';
        }

        console.log(`🔍 Filtered ${filtered.length} products from ${this.allProducts.length} total`);
    }

    /**
     * Load next page of products
     */
    async loadNextPage() {
        if (this.isLoading || !this.hasMore) return;

        this.isLoading = true;
        this.showLoadingIndicator();

        const start = this.currentPage * this.pageSize;
        const end = start + this.pageSize;
        let pageProducts = this.visibleProducts.slice(start, end);

        // If we don't have enough products and server pagination is available, fetch more
        if (pageProducts.length < this.pageSize && this.serverPagination && this.paginationInfo.has_next) {
            try {
                console.log(`📡 Fetching more products from server (page ${this.paginationInfo.current_page + 1})`);

                // Fetch next page from server
                // Check if force refresh is requested via URL parameter
                const urlParams = new URLSearchParams(window.location.search);
                const forceRefresh = urlParams.get('force_refresh') === 'true';
                const refreshParam = forceRefresh ? '&force_refresh=true' : '';

                const response = await fetch(`/api/${window.COLLECTION_NAME}/products/paginated?page=${this.paginationInfo.current_page + 1}&limit=100${refreshParam}`);
                if (response.ok) {
                    const data = await response.json();

                    // Add new products to our collection
                    const newProducts = Object.entries(data.products || {}).map(([rowNum, product]) => ({
                        ...product,
                        rowNum: parseInt(rowNum),
                        searchIndex: this.createSearchIndex(product)
                    }));

                    // Sort and add to existing products
                    this.allProducts = [...this.allProducts, ...newProducts];
                    this.allProducts.sort((a, b) => (a.rowNum || 0) - (b.rowNum || 0));

                    // Update visible products and pagination info
                    this.visibleProducts = [...this.allProducts];
                    this.paginationInfo = data.pagination;

                    // Get the products we need for this page
                    pageProducts = this.visibleProducts.slice(start, end);

                    console.log(`✅ Fetched ${newProducts.length} more products, total: ${this.allProducts.length}`);
                } else {
                    console.warn(`⚠️ Failed to fetch more products: ${response.status}`);
                }
            } catch (error) {
                console.error('❌ Error fetching more products:', error);
            }
        }

        // If we still don't have products, we're done
        if (pageProducts.length === 0) {
            this.hasMore = false;
            this.hideLoadingIndicator();
            this.isLoading = false;
            return;
        }

        // Simulate network delay for smooth UX
        setTimeout(() => {
            // Queue products for rendering
            pageProducts.forEach(product => {
                this.renderQueue.push(product);
            });

            this.processRenderQueue();
            this.currentPage++;

            // Check if we have more (either client-side or server-side)
            const clientHasMore = (this.currentPage * this.pageSize) < this.visibleProducts.length;
            const serverHasMore = this.serverPagination && this.paginationInfo.has_next;
            this.hasMore = clientHasMore || serverHasMore;

            this.hideLoadingIndicator();
            this.isLoading = false;

            console.log(`📄 Loaded page ${this.currentPage}, showing ${Math.min(this.currentPage * this.pageSize, this.visibleProducts.length)} of ${this.paginationInfo?.total_count || this.visibleProducts.length} total products`);
        }, 50);
    }

    /**
     * Process render queue with throttling
     */
    processRenderQueue() {
        if (this.renderTimer) return;

        this.renderTimer = requestAnimationFrame(() => {
            const batchSize = 5; // Render 5 products at a time
            const batch = this.renderQueue.splice(0, batchSize);

            batch.forEach(product => {
                const card = this.createProductCard(product);
                if (this.container) {
                    this.container.appendChild(card);
                }
            });

            // Continue processing if there are more items
            if (this.renderQueue.length > 0) {
                this.renderTimer = null;
                this.processRenderQueue();
            } else {
                this.renderTimer = null;
            }
        });
    }

    /**
     * Create optimized product card
     */
    createProductCard(product) {
        const card = document.createElement('div');
        card.className = 'product-card-wrapper';
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';

        const qualityClass = this.getQualityClass(product);
        const qualityBadgeClass = this.getQualityBadgeClass(product);

        card.innerHTML = `
            <div class="product-card ${qualityClass}" data-row="${product.rowNum}" onclick="editProduct(${product.rowNum})">
                <input type="checkbox" class="form-check-input product-checkbox" data-row="${product.rowNum}" onclick="event.stopPropagation()">
                <div class="quality-badge ${qualityBadgeClass}">${product.quality_score || 0}%</div>

                <div class="product-image">
                    ${product.shopify_images ?
                        `<img src="${product.shopify_images.split(',')[0]}" alt="${product.title || 'Product'}" loading="lazy" onerror="this.style.display='none'">` :
                        '<i class="fas fa-image"></i>'
                    }
                </div>

                <div class="product-details">
                    <div class="product-meta">
                        <span class="product-sku">${product.variant_sku || product.sku || 'No SKU'}</span>
                        <span class="product-brand">${product.brand_name || product.vendor || 'Unknown Brand'}</span>
                    </div>

                    <h6 class="product-title">${product.title || 'Untitled Product'}</h6>

                    <div class="product-specs">
                        ${this.generateProductSpecs(product)}
                    </div>

                    <div class="product-pricing">
                        ${product.shopify_price ? `<span class="price-sale">${product.shopify_price.toString().startsWith('$') ? product.shopify_price : '$' + product.shopify_price}</span>` : '<span class="price-placeholder">Price on request</span>'}
                    </div>
                </div>
            </div>
        `;

        // Smooth animation
        requestAnimationFrame(() => {
            card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        });

        return card;
    }

    /**
     * Setup infinite scroll
     */
    setupInfiniteScroll() {
        let ticking = false;

        const checkScroll = () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    const scrollPosition = window.innerHeight + window.scrollY;
                    const documentHeight = document.documentElement.offsetHeight;

                    if (scrollPosition >= documentHeight - this.threshold && this.hasMore && !this.isLoading) {
                        this.loadNextPage();
                    }

                    ticking = false;
                });
                ticking = true;
            }
        };

        window.addEventListener('scroll', checkScroll, { passive: true });
    }

    /**
     * Setup virtualization for very large datasets
     */
    setupVirtualization() {
        // This could be enhanced for datasets > 1000 products
        // For now, progressive loading handles most cases well
    }

    /**
     * Search functionality
     */
    search(query) {
        this.searchQuery = query;
        this.applyFilters();
        this.loadNextPage();
    }

    /**
     * Filter functionality
     */
    filter(filters) {
        this.activeFilters = { ...this.activeFilters, ...filters };
        this.applyFilters();
        this.loadNextPage();
    }

    /**
     * Get quality class for styling
     */
    getQualityClass(product) {
        const score = product.quality_score || 0;
        if (score >= 90) return 'quality-excellent';
        if (score >= 70) return 'quality-good';
        if (score >= 50) return 'quality-fair';
        return 'quality-poor';
    }

    /**
     * Get quality badge class
     */
    getQualityBadgeClass(product) {
        const score = product.quality_score || 0;
        if (score >= 90) return 'bg-success';
        if (score >= 70) return 'bg-primary';
        if (score >= 50) return 'bg-warning';
        return 'bg-danger';
    }

    /**
     * Show loading indicator
     */
    showLoadingIndicator() {
        let indicator = document.getElementById('progressiveLoadingIndicator');
        if (!indicator && this.container) {
            indicator = document.createElement('div');
            indicator.id = 'progressiveLoadingIndicator';
            indicator.className = 'text-center py-4';
            indicator.innerHTML = `
                <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                Loading more products...
            `;
            this.container.appendChild(indicator);
        }
        if (indicator) {
            indicator.style.display = 'block';
        }
    }

    /**
     * Hide loading indicator
     */
    hideLoadingIndicator() {
        const indicator = document.getElementById('progressiveLoadingIndicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }

    /**
     * Get performance stats
     */
    getStats() {
        return {
            totalProducts: this.allProducts.length,
            visibleProducts: this.visibleProducts.length,
            loadedProducts: this.currentPage * this.pageSize,
            currentPage: this.currentPage,
            isLoading: this.isLoading,
            hasMore: this.hasMore
        };
    }

    /**
     * Generate product specifications for display in tiles
     */
    generateProductSpecs(product) {
        const specs = [];

        // Material specification
        if (product.product_material) {
            specs.push(`<div class="spec-row">
                <span class="spec-label"><i class="fas fa-cube"></i> Material</span>
                <span class="spec-value">${product.product_material}</span>
            </div>`);
        }

        // Installation type for sinks
        if (product.installation_type) {
            specs.push(`<div class="spec-row">
                <span class="spec-label"><i class="fas fa-tools"></i> Installation</span>
                <span class="spec-value">${product.installation_type}</span>
            </div>`);
        }

        // Number of bowls for sinks
        if (product.bowls_number) {
            const bowlText = product.bowls_number === '1' ? 'Single Bowl' :
                           product.bowls_number === '2' ? 'Double Bowl' :
                           `${product.bowls_number} Bowls`;
            specs.push(`<div class="spec-row">
                <span class="spec-label"><i class="fas fa-circle"></i> Configuration</span>
                <span class="spec-value">${bowlText}</span>
            </div>`);
        }

        // Dimensions
        if (product.length_mm && product.overall_width_mm) {
            specs.push(`<div class="spec-row">
                <span class="spec-label"><i class="fas fa-ruler"></i> Size</span>
                <span class="spec-value">${product.length_mm}×${product.overall_width_mm}mm</span>
            </div>`);
        }

        // Quality score
        if (product.quality_score) {
            const score = Math.round(product.quality_score);
            specs.push(`<div class="spec-row">
                <span class="spec-label"><i class="fas fa-star"></i> Quality</span>
                <span class="spec-value">${score}% Complete</span>
            </div>`);
        }

        return specs.join('');
    }
}

// Global instance
window.progressiveLoader = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    if (typeof COLLECTION_NAME !== 'undefined') {
        window.progressiveLoader = new ProgressiveLoader({
            container: document.getElementById('productsContainer'),
            pageSize: 20
        });
    }
});