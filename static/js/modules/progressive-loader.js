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
        console.log('⚡ Initializing progressive loader with', Object.keys(productsData).length, 'products');

        // Convert to array and add search index
        this.allProducts = Object.entries(productsData).map(([rowNum, product]) => ({
            ...product,
            rowNum: parseInt(rowNum),
            searchIndex: this.createSearchIndex(product)
        }));

        // Sort by quality score (best first)
        this.allProducts.sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0));

        // Initial load
        this.applyFilters();
        this.loadNextPage();

        console.log('✅ Progressive loader initialized');
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
    loadNextPage() {
        if (this.isLoading || !this.hasMore) return;

        this.isLoading = true;
        this.showLoadingIndicator();

        // Simulate network delay for smooth UX
        setTimeout(() => {
            const start = this.currentPage * this.pageSize;
            const end = start + this.pageSize;
            const pageProducts = this.visibleProducts.slice(start, end);

            if (pageProducts.length === 0) {
                this.hasMore = false;
                this.hideLoadingIndicator();
                this.isLoading = false;
                return;
            }

            // Queue products for rendering
            pageProducts.forEach(product => {
                this.renderQueue.push(product);
            });

            this.processRenderQueue();
            this.currentPage++;

            // Check if we have more
            this.hasMore = end < this.visibleProducts.length;

            this.hideLoadingIndicator();
            this.isLoading = false;

            console.log(`📄 Loaded page ${this.currentPage}, showing ${Math.min(end, this.visibleProducts.length)} of ${this.visibleProducts.length} products`);
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
                        ${product.shopify_price ? `<span class="price-sale">$${product.shopify_price}</span>` : '<span class="price-placeholder">Price on request</span>'}
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