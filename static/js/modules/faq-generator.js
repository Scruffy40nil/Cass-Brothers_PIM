/**
 * FAQ Generator Module
 * Handles AI-powered FAQ generation using ChatGPT and Google Sheets data
 */

class FAQGenerator {
    constructor() {
        this.currentCollection = null;
        this.isGenerating = false;
        this.generatedFAQs = null;

        this.initializeEventListeners();
    }

    /**
     * Initialize event listeners for FAQ functionality
     */
    initializeEventListeners() {
        // Collection selection change
        document.addEventListener('change', (e) => {
            if (e.target.id === 'faqCollectionSelect') {
                this.onCollectionChange(e.target.value);
            }
        });

        // Modal tab change
        document.addEventListener('shown.bs.tab', (e) => {
            if (e.target.id === 'faq-tab') {
                this.onFAQTabActivated();
            }
        });
    }

    /**
     * Handle collection selection change
     */
    async onCollectionChange(collectionName) {
        this.currentCollection = collectionName;
        const productSelect = document.getElementById('faqProductSelect');

        if (!collectionName) {
            productSelect.disabled = true;
            productSelect.innerHTML = '<option value="">Select product or generate general FAQs...</option>';
            return;
        }

        try {
            // Show loading state
            productSelect.disabled = true;
            productSelect.innerHTML = '<option value="">Loading products...</option>';

            // Fetch products for this collection
            const response = await fetch(`/api/${collectionName}/products`);
            const data = await response.json();

            if (data.success && data.products) {
                // Populate product dropdown
                let optionsHtml = '<option value="">Generate general FAQs for all products...</option>';

                data.products.forEach(product => {
                    optionsHtml += `<option value="${product.row_num}">${product.display_name}</option>`;
                });

                productSelect.innerHTML = optionsHtml;
                productSelect.disabled = false;

                console.log(`✅ Loaded ${data.products.length} products for ${collectionName}`);
            } else {
                throw new Error(data.error || 'Failed to load products');
            }

        } catch (error) {
            console.error('Error loading products:', error);
            productSelect.innerHTML = '<option value="">Error loading products</option>';
            this.showError('Failed to load products: ' + error.message);
        }
    }

    /**
     * Handle FAQ tab activation
     */
    onFAQTabActivated() {
        // Set initial focus to collection select if empty
        const collectionSelect = document.getElementById('faqCollectionSelect');
        if (!collectionSelect.value) {
            collectionSelect.focus();
        }
    }

    /**
     * Show error message to user
     */
    showError(message) {
        // Create or update error alert
        let errorAlert = document.getElementById('faqErrorAlert');
        if (!errorAlert) {
            errorAlert = document.createElement('div');
            errorAlert.id = 'faqErrorAlert';
            errorAlert.className = 'alert alert-danger alert-dismissible fade show mt-3';

            const faqContent = document.querySelector('.faq-generator');
            faqContent.appendChild(errorAlert);
        }

        errorAlert.innerHTML = `
            <i class="fas fa-exclamation-triangle me-2"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
    }

    /**
     * Show success message to user
     */
    showSuccess(message) {
        // Create or update success alert
        let successAlert = document.getElementById('faqSuccessAlert');
        if (!successAlert) {
            successAlert = document.createElement('div');
            successAlert.id = 'faqSuccessAlert';
            successAlert.className = 'alert alert-success alert-dismissible fade show mt-3';

            const faqResults = document.getElementById('faqResults');
            faqResults.parentNode.insertBefore(successAlert, faqResults);
        }

        successAlert.innerHTML = `
            <i class="fas fa-check-circle me-2"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (successAlert) {
                successAlert.remove();
            }
        }, 5000);
    }

    /**
     * Get selected FAQ types
     */
    getSelectedFAQTypes() {
        const faqTypes = [];

        const typeMap = {
            'faqInstallation': 'installation',
            'faqMaintenance': 'maintenance',
            'faqCompatibility': 'compatibility',
            'faqWarranty': 'warranty',
            'faqTechnical': 'technical',
            'faqTroubleshooting': 'troubleshooting'
        };

        for (const [checkboxId, faqType] of Object.entries(typeMap)) {
            const checkbox = document.getElementById(checkboxId);
            if (checkbox && checkbox.checked) {
                faqTypes.push(faqType);
            }
        }

        return faqTypes;
    }

    /**
     * Generate FAQs using ChatGPT
     */
    async generateFAQs() {
        if (this.isGenerating) {
            return;
        }

        try {
            // Validate inputs
            const collection = document.getElementById('faqCollectionSelect').value;
            if (!collection) {
                this.showError('Please select a collection first');
                return;
            }

            const faqTypes = this.getSelectedFAQTypes();
            if (faqTypes.length === 0) {
                this.showError('Please select at least one FAQ type');
                return;
            }

            this.isGenerating = true;

            // Get selected product (optional)
            const productSelect = document.getElementById('faqProductSelect');
            const productRow = productSelect.value ? parseInt(productSelect.value) : null;

            // Show loading state
            this.showLoadingState();

            console.log(`🔄 Generating FAQs for ${collection}, product: ${productRow}, types: ${faqTypes.join(', ')}`);

            // Make API request
            const requestData = {
                faq_types: faqTypes,
                num_faqs_per_type: 3
            };

            if (productRow) {
                requestData.product_row = productRow;
            }

            const response = await fetch(`/api/${collection}/generate-faqs`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });

            const data = await response.json();

            if (data.success) {
                this.generatedFAQs = data.faqs;
                this.displayFAQs(data);
                this.showSuccess(data.message);
                console.log(`✅ Generated ${data.generated_count} FAQs successfully`);
            } else {
                throw new Error(data.error || 'Failed to generate FAQs');
            }

        } catch (error) {
            console.error('Error generating FAQs:', error);
            this.showError('Failed to generate FAQs: ' + error.message);
        } finally {
            this.isGenerating = false;
            this.hideLoadingState();
        }
    }

    /**
     * Show loading state
     */
    showLoadingState() {
        const generateBtn = document.getElementById('generateFaqBtn');
        const loadingDiv = document.getElementById('faqLoading');
        const resultsDiv = document.getElementById('faqResults');

        // Update button
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Generating FAQs...';

        // Show loading indicator
        loadingDiv.classList.remove('d-none');
        resultsDiv.classList.add('d-none');

        // Clear any previous alerts
        const alerts = document.querySelectorAll('#faqErrorAlert, #faqSuccessAlert');
        alerts.forEach(alert => alert.remove());
    }

    /**
     * Hide loading state
     */
    hideLoadingState() {
        const generateBtn = document.getElementById('generateFaqBtn');
        const loadingDiv = document.getElementById('faqLoading');

        // Restore button
        generateBtn.disabled = false;
        generateBtn.innerHTML = '<i class="fas fa-magic me-1"></i>Generate FAQs with ChatGPT';

        // Hide loading indicator
        loadingDiv.classList.add('d-none');
    }

    /**
     * Display generated FAQs
     */
    displayFAQs(data) {
        const resultsDiv = document.getElementById('faqResults');
        const contentDiv = document.getElementById('faqContent');

        let html = '';

        // Add generation info
        const productInfo = data.product_row ?
            `for specific product (row ${data.product_row})` :
            'for entire collection';

        html += `
            <div class="mb-3">
                <small class="text-muted">
                    <i class="fas fa-info-circle me-1"></i>
                    Generated ${data.generated_count} FAQs ${productInfo} in ${data.collection} collection
                </small>
            </div>
        `;

        // Group FAQs by category
        const categories = data.types_generated;

        categories.forEach(category => {
            const categoryFAQs = data.faqs[category];
            if (!categoryFAQs || categoryFAQs.length === 0) return;

            html += `
                <div class="faq-category mb-4">
                    <h6 class="text-primary mb-3">
                        <i class="fas fa-tag me-1"></i>
                        ${this.formatCategoryName(category)}
                        <span class="badge bg-primary">${categoryFAQs.length}</span>
                    </h6>

                    <div class="accordion" id="faq-${category}">
            `;

            categoryFAQs.forEach((faq, index) => {
                const collapseId = `faq-${category}-${index}`;
                const headingId = `heading-${category}-${index}`;

                html += `
                    <div class="accordion-item">
                        <h2 class="accordion-header" id="${headingId}">
                            <button class="accordion-button collapsed" type="button"
                                    data-bs-toggle="collapse" data-bs-target="#${collapseId}">
                                <span class="me-2">
                                    <i class="fas fa-question-circle text-primary"></i>
                                </span>
                                ${faq.question}
                            </button>
                        </h2>
                        <div id="${collapseId}" class="accordion-collapse collapse"
                             data-bs-parent="#faq-${category}">
                            <div class="accordion-body">
                                <div class="faq-answer">
                                    ${this.formatAnswer(faq.answer)}
                                </div>
                                <div class="faq-meta mt-2">
                                    <small class="text-muted">
                                        <span class="badge bg-light text-dark me-1">
                                            ${faq.target_audience}
                                        </span>
                                        <span class="text-muted">${category}</span>
                                    </small>
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
        });

        contentDiv.innerHTML = html;
        resultsDiv.classList.remove('d-none');

        // Scroll to results
        resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /**
     * Format category name for display
     */
    formatCategoryName(category) {
        return category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' ');
    }

    /**
     * Format answer text with line breaks and formatting
     */
    formatAnswer(answer) {
        // Convert line breaks to HTML
        return answer
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => `<p class="mb-2">${line}</p>`)
            .join('');
    }

    /**
     * Copy FAQs to clipboard
     */
    async copyFAQsToClipboard() {
        if (!this.generatedFAQs) {
            this.showError('No FAQs to copy');
            return;
        }

        try {
            let text = 'Generated FAQs\n================\n\n';

            Object.entries(this.generatedFAQs).forEach(([category, faqs]) => {
                text += `${this.formatCategoryName(category).toUpperCase()}\n`;
                text += '-'.repeat(category.length + 10) + '\n\n';

                faqs.forEach((faq, index) => {
                    text += `${index + 1}. ${faq.question}\n`;
                    text += `${faq.answer}\n\n`;
                });

                text += '\n';
            });

            await navigator.clipboard.writeText(text);
            this.showSuccess('FAQs copied to clipboard!');

        } catch (error) {
            console.error('Error copying to clipboard:', error);
            this.showError('Failed to copy FAQs to clipboard');
        }
    }

    /**
     * Export FAQs as downloadable file
     */
    exportFAQs() {
        if (!this.generatedFAQs) {
            this.showError('No FAQs to export');
            return;
        }

        try {
            // Create JSON export
            const exportData = {
                generated_at: new Date().toISOString(),
                collection: this.currentCollection,
                faqs: this.generatedFAQs,
                total_count: Object.values(this.generatedFAQs).reduce((sum, faqs) => sum + faqs.length, 0)
            };

            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            // Create download link
            const a = document.createElement('a');
            a.href = url;
            a.download = `faqs-${this.currentCollection}-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.showSuccess('FAQs exported successfully!');

        } catch (error) {
            console.error('Error exporting FAQs:', error);
            this.showError('Failed to export FAQs');
        }
    }
}

// Global functions called by the HTML
function generateProductFAQs(event) {
    if (window.faqGenerator) {
        window.faqGenerator.generateFAQs(event);
    }
}

function copyFAQsToClipboard() {
    if (window.faqGenerator) {
        window.faqGenerator.copyFAQsToClipboard();
    }
}

function exportFAQs() {
    if (window.faqGenerator) {
        window.faqGenerator.exportFAQs();
    }
}

// Initialize FAQ generator when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.faqGenerator = new FAQGenerator();
    console.log('✅ FAQ Generator initialized');
});

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FAQGenerator;
}