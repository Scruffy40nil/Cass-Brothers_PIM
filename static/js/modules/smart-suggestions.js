/**
 * Smart Suggestions System - AI-powered intelligent assistance
 * Features: Auto-complete, data validation, smart recommendations
 */

class SmartSuggestions {
    constructor() {
        this.isEnabled = true;
        this.suggestionCache = new Map();
        this.recentSuggestions = [];
        this.fieldAnalytics = {};

        this.init();
    }

    /**
     * Initialize smart suggestions
     */
    init() {
        console.log('🧠 Initializing Smart Suggestions System...');

        this.setupFieldWatchers();
        this.setupAutoComplete();
        this.setupDataValidation();
        this.setupSmartDefaults();

        console.log('✅ Smart Suggestions System ready');
    }

    /**
     * Setup field watchers for intelligent suggestions
     */
    setupFieldWatchers() {
        // Watch for common input fields
        const watchFields = [
            'editTitle', 'editVendor', 'editSku', 'editFeatures',
            'editTags', 'editSeoTitle', 'editSeoDescription'
        ];

        watchFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.addEventListener('input', (e) => this.onFieldInput(e, fieldId));
                field.addEventListener('focus', (e) => this.onFieldFocus(e, fieldId));
                field.addEventListener('blur', (e) => this.onFieldBlur(e, fieldId));
            }
        });
    }

    /**
     * Handle field input events
     */
    onFieldInput(event, fieldId) {
        const value = event.target.value;
        const suggestions = this.generateSuggestions(fieldId, value);

        if (suggestions.length > 0) {
            this.showSuggestions(event.target, suggestions);
        }

        // Real-time validation
        this.validateField(event.target, fieldId, value);

        // Smart data enrichment
        this.enrichData(fieldId, value);
    }

    /**
     * Handle field focus events
     */
    onFieldFocus(event, fieldId) {
        // Show contextual help
        this.showContextualHelp(event.target, fieldId);

        // Track field analytics
        this.trackFieldUsage(fieldId);
    }

    /**
     * Handle field blur events
     */
    onFieldBlur(event, fieldId) {
        // Hide suggestions
        setTimeout(() => {
            this.hideSuggestions();
        }, 150);

        // Run final validation
        this.finalizeField(event.target, fieldId);
    }

    /**
     * Generate intelligent suggestions based on field type and current value
     */
    generateSuggestions(fieldId, value) {
        if (!value || value.length < 2) return [];

        const suggestions = [];

        switch (fieldId) {
            case 'editTitle':
                suggestions.push(...this.generateTitleSuggestions(value));
                break;
            case 'editVendor':
                suggestions.push(...this.generateVendorSuggestions(value));
                break;
            case 'editSku':
                suggestions.push(...this.generateSkuSuggestions(value));
                break;
            case 'editFeatures':
                suggestions.push(...this.generateFeatureSuggestions(value));
                break;
            case 'editSeoTitle':
                suggestions.push(...this.generateSeoSuggestions(value, 'title'));
                break;
            case 'editSeoDescription':
                suggestions.push(...this.generateSeoSuggestions(value, 'description'));
                break;
        }

        return suggestions.slice(0, 5); // Limit to 5 suggestions
    }

    /**
     * Generate title suggestions
     */
    generateTitleSuggestions(value) {
        const suggestions = [];
        const lowerValue = value.toLowerCase();

        // Collection-specific suggestions
        if (window.COLLECTION_NAME === 'sinks') {
            if (lowerValue.includes('sink')) {
                suggestions.push(
                    `${value} - Premium Kitchen Sink`,
                    `${value} - Stainless Steel Sink`,
                    `${value} - Double Bowl Sink`,
                    `${value} - Undermount Sink`
                );
            }
        } else if (window.COLLECTION_NAME === 'lighting') {
            if (lowerValue.includes('light')) {
                suggestions.push(
                    `${value} - LED Lighting`,
                    `${value} - Modern Light Fixture`,
                    `${value} - Energy Efficient Lighting`,
                    `${value} - Designer Light`
                );
            }
        } else if (window.COLLECTION_NAME === 'taps') {
            if (lowerValue.includes('tap')) {
                suggestions.push(
                    `${value} - Kitchen Mixer Tap`,
                    `${value} - Bathroom Tap`,
                    `${value} - Premium Tap`,
                    `${value} - Water Saving Tap`
                );
            }
        }

        return suggestions;
    }

    /**
     * Generate vendor suggestions
     */
    generateVendorSuggestions(value) {
        const commonVendors = [
            'Franke', 'Blanco', 'Oliveri', 'Clark', 'Abey',
            'Philips', 'Osram', 'GE', 'Samsung', 'LG',
            'Grohe', 'Hansgrohe', 'Methven', 'Phoenix', 'Caroma'
        ];

        return commonVendors
            .filter(vendor => vendor.toLowerCase().includes(value.toLowerCase()))
            .map(vendor => vendor);
    }

    /**
     * Generate SKU suggestions
     */
    generateSkuSuggestions(value) {
        const suggestions = [];
        const upperValue = value.toUpperCase();

        // Generate SKU patterns
        if (value.length >= 3) {
            // Pattern: BRAND-MODEL-SIZE
            suggestions.push(
                `${upperValue}-01`,
                `${upperValue}-02`,
                `${upperValue}-STD`,
                `${upperValue}-LRG`
            );
        }

        return suggestions;
    }

    /**
     * Generate feature suggestions
     */
    generateFeatureSuggestions(value) {
        const featureTemplates = [
            'Premium quality construction',
            'Easy to clean and maintain',
            'Modern contemporary design',
            'Durable and long-lasting',
            'Scratch and stain resistant',
            'Energy efficient operation',
            'Professional grade quality',
            'Sleek and stylish appearance',
            'Environmentally friendly',
            'Backed by manufacturer warranty'
        ];

        return featureTemplates
            .filter(template => template.toLowerCase().includes(value.toLowerCase().split(' ').pop()))
            .slice(0, 3);
    }

    /**
     * Generate SEO suggestions
     */
    generateSeoSuggestions(value, type) {
        const suggestions = [];

        if (type === 'title') {
            suggestions.push(
                `${value} | Best Prices Online`,
                `Buy ${value} | Fast Delivery`,
                `${value} - Premium Quality`,
                `${value} | Professional Grade`
            );
        } else if (type === 'description') {
            suggestions.push(
                `Discover the premium ${value} collection with fast delivery and best prices...`,
                `Shop ${value} online with confidence. Premium quality, competitive prices...`,
                `Professional grade ${value} available now. Easy installation, long warranty...`
            );
        }

        return suggestions;
    }

    /**
     * Show suggestion dropdown
     */
    showSuggestions(targetElement, suggestions) {
        this.hideSuggestions(); // Clear existing

        const dropdown = document.createElement('div');
        dropdown.className = 'smart-suggestions-dropdown';
        dropdown.style.cssText = `
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: white;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            max-height: 200px;
            overflow-y: auto;
        `;

        suggestions.forEach((suggestion, index) => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.style.cssText = `
                padding: 8px 12px;
                cursor: pointer;
                border-bottom: 1px solid #f0f0f0;
                font-size: 14px;
                transition: background-color 0.2s;
            `;
            item.textContent = suggestion;

            item.addEventListener('mouseenter', () => {
                item.style.backgroundColor = '#f8f9fa';
            });

            item.addEventListener('mouseleave', () => {
                item.style.backgroundColor = 'white';
            });

            item.addEventListener('click', () => {
                targetElement.value = suggestion;
                targetElement.dispatchEvent(new Event('input'));
                this.hideSuggestions();

                // Track suggestion usage
                this.trackSuggestionUsage(suggestion);
            });

            dropdown.appendChild(item);
        });

        // Position relative to target
        const container = targetElement.parentElement;
        if (container.style.position !== 'relative') {
            container.style.position = 'relative';
        }
        container.appendChild(dropdown);
    }

    /**
     * Hide suggestion dropdown
     */
    hideSuggestions() {
        const existing = document.querySelector('.smart-suggestions-dropdown');
        if (existing) {
            existing.remove();
        }
    }

    /**
     * Validate field input
     */
    validateField(element, fieldId, value) {
        const validationResult = this.performValidation(fieldId, value);

        if (!validationResult.isValid) {
            this.showValidationError(element, validationResult.message);
        } else {
            this.clearValidationError(element);
        }
    }

    /**
     * Perform field validation
     */
    performValidation(fieldId, value) {
        switch (fieldId) {
            case 'editSku':
                if (value && !/^[A-Z0-9-_]+$/i.test(value)) {
                    return {
                        isValid: false,
                        message: 'SKU should contain only letters, numbers, and hyphens'
                    };
                }
                break;

            case 'editTitle':
                if (value && value.length > 255) {
                    return {
                        isValid: false,
                        message: 'Title should be under 255 characters'
                    };
                }
                break;

            case 'editSeoTitle':
                if (value && value.length > 60) {
                    return {
                        isValid: false,
                        message: 'SEO title should be under 60 characters for best results'
                    };
                }
                break;

            case 'editSeoDescription':
                if (value && value.length > 160) {
                    return {
                        isValid: false,
                        message: 'SEO description should be under 160 characters'
                    };
                }
                break;
        }

        return { isValid: true };
    }

    /**
     * Show validation error
     */
    showValidationError(element, message) {
        this.clearValidationError(element);

        const errorElement = document.createElement('div');
        errorElement.className = 'smart-validation-error';
        errorElement.style.cssText = `
            color: #dc3545;
            font-size: 12px;
            margin-top: 4px;
            padding: 4px;
            background: #f8d7da;
            border: 1px solid #f5c6cb;
            border-radius: 3px;
        `;
        errorElement.textContent = message;

        element.parentElement.appendChild(errorElement);
        element.style.borderColor = '#dc3545';
    }

    /**
     * Clear validation error
     */
    clearValidationError(element) {
        const existing = element.parentElement.querySelector('.smart-validation-error');
        if (existing) {
            existing.remove();
        }
        element.style.borderColor = '';
    }

    /**
     * Show contextual help
     */
    showContextualHelp(element, fieldId) {
        const helpText = this.getContextualHelp(fieldId);
        if (!helpText) return;

        // Implementation for contextual help tooltips
        console.log(`💡 Help for ${fieldId}: ${helpText}`);
    }

    /**
     * Get contextual help text
     */
    getContextualHelp(fieldId) {
        const helpMap = {
            'editTitle': 'Create a clear, descriptive product title that customers will search for',
            'editSku': 'Use a unique identifier combining brand, model, and variant codes',
            'editFeatures': 'List 5 key benefits that will convince customers to buy',
            'editSeoTitle': 'Optimize for search engines - include main keywords under 60 chars',
            'editSeoDescription': 'Compelling description for search results - under 160 chars'
        };

        return helpMap[fieldId];
    }

    /**
     * Smart data enrichment
     */
    enrichData(fieldId, value) {
        // Auto-generate related fields based on input
        if (fieldId === 'editTitle' && value.length > 10) {
            this.autoGenerateSeoTitle(value);
        }

        if (fieldId === 'editVendor' && value.length > 2) {
            this.suggestVendorDefaults(value);
        }
    }

    /**
     * Auto-generate SEO title from product title
     */
    autoGenerateSeoTitle(title) {
        const seoTitleField = document.getElementById('editSeoTitle');
        if (seoTitleField && !seoTitleField.value) {
            const seoTitle = `${title} | Best Prices Online`.substring(0, 60);
            seoTitleField.value = seoTitle;
            seoTitleField.style.backgroundColor = '#e8f5e8';

            setTimeout(() => {
                seoTitleField.style.backgroundColor = '';
            }, 2000);
        }
    }

    /**
     * Track field usage analytics
     */
    trackFieldUsage(fieldId) {
        if (!this.fieldAnalytics[fieldId]) {
            this.fieldAnalytics[fieldId] = { usage: 0, lastUsed: Date.now() };
        }
        this.fieldAnalytics[fieldId].usage++;
        this.fieldAnalytics[fieldId].lastUsed = Date.now();
    }

    /**
     * Track suggestion usage
     */
    trackSuggestionUsage(suggestion) {
        this.recentSuggestions.unshift({
            text: suggestion,
            timestamp: Date.now()
        });

        // Keep only recent 50 suggestions
        if (this.recentSuggestions.length > 50) {
            this.recentSuggestions = this.recentSuggestions.slice(0, 50);
        }
    }

    /**
     * Get usage analytics
     */
    getAnalytics() {
        return {
            fieldUsage: this.fieldAnalytics,
            recentSuggestions: this.recentSuggestions,
            cacheSize: this.suggestionCache.size
        };
    }

    /**
     * Enable/disable smart suggestions
     */
    toggle(enabled = null) {
        this.isEnabled = enabled !== null ? enabled : !this.isEnabled;
        console.log(`🧠 Smart Suggestions ${this.isEnabled ? 'enabled' : 'disabled'}`);
        return this.isEnabled;
    }
}

// Global instance
window.smartSuggestions = new SmartSuggestions();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    if (window.smartSuggestions) {
        console.log('🧠 Smart Suggestions ready for', window.COLLECTION_NAME || 'unknown collection');
    }
});