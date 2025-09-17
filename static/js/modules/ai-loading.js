/**
 * AI Loading Manager Module
 * Handles loading animations and states for AI generation processes
 */

class AILoadingManager {
    constructor() {
        this.activeProcesses = new Set();
        this.loadingStates = new Map();
    }

    /**
     * Start loading state for a specific AI process
     */
    startLoading(processType, options = {}) {
        const processId = `${processType}_${Date.now()}`;

        const config = {
            processId,
            processType,
            button: options.button,
            fields: options.fields || [],
            fieldGroup: options.fieldGroup,
            loadingText: options.loadingText || 'AI is processing...',
            buttonText: options.buttonText || 'Processing...',
            ...options
        };

        this.activeProcesses.add(processId);
        this.loadingStates.set(processId, config);

        this.applyLoadingState(config);

        console.log(`🔄 Started AI loading: ${processType} (${processId})`);
        return processId;
    }

    /**
     * Stop loading state for a specific process
     */
    stopLoading(processId) {
        if (!this.activeProcesses.has(processId)) {
            console.warn(`⚠️ Process ${processId} not found in active processes`);
            return;
        }

        const config = this.loadingStates.get(processId);
        if (config) {
            this.removeLoadingState(config);
        }

        this.activeProcesses.delete(processId);
        this.loadingStates.delete(processId);

        console.log(`✅ Stopped AI loading: ${processId}`);
    }

    /**
     * Apply loading state to UI elements
     */
    applyLoadingState(config) {
        // Handle button loading state
        if (config.button) {
            this.setButtonLoading(config.button, config.buttonText);
        }

        // Handle field loading states
        config.fields.forEach(fieldId => {
            this.setFieldLoading(fieldId, config.loadingText);
        });

        // Handle field group loading state (single or multiple)
        if (config.fieldGroup) {
            this.setFieldGroupLoading(config.fieldGroup, true);
        }

        // Handle multiple field groups
        if (config.fieldGroups && Array.isArray(config.fieldGroups)) {
            config.fieldGroups.forEach(groupId => {
                this.setFieldGroupLoading(groupId, true);
            });
        }
    }

    /**
     * Remove loading state from UI elements
     */
    removeLoadingState(config) {
        // Restore button state
        if (config.button) {
            this.setButtonLoading(config.button, null);
        }

        // Restore field states
        config.fields.forEach(fieldId => {
            this.setFieldLoading(fieldId, null);
        });

        // Restore field group state (single or multiple)
        if (config.fieldGroup) {
            this.setFieldGroupLoading(config.fieldGroup, false);
        }

        // Restore multiple field groups
        if (config.fieldGroups && Array.isArray(config.fieldGroups)) {
            config.fieldGroups.forEach(groupId => {
                this.setFieldGroupLoading(groupId, false);
            });
        }
    }

    /**
     * Set button loading state
     */
    setButtonLoading(button, loadingText) {
        if (typeof button === 'string') {
            button = document.getElementById(button) || document.querySelector(button);
        }

        if (!button) return;

        if (loadingText) {
            // Store original content
            if (!button.dataset.originalContent) {
                button.dataset.originalContent = button.innerHTML;
            }

            // Apply loading state
            button.classList.add('btn-ai-loading');
            button.disabled = true;
            button.innerHTML = `<span class="btn-content">${loadingText}</span>`;
        } else {
            // Restore original state
            button.classList.remove('btn-ai-loading');
            button.disabled = false;
            if (button.dataset.originalContent) {
                button.innerHTML = button.dataset.originalContent;
                delete button.dataset.originalContent;
            }
        }
    }

    /**
     * Set field loading state
     */
    setFieldLoading(fieldId, loadingText) {
        const field = document.getElementById(fieldId);
        if (!field) return;

        if (loadingText) {
            // Store original values
            if (!field.dataset.originalValue) {
                field.dataset.originalValue = field.value;
            }
            if (!field.dataset.originalDisabled) {
                field.dataset.originalDisabled = field.disabled;
            }

            // Apply loading state
            field.classList.add('ai-loading-field');
            field.value = loadingText;
            field.disabled = true;

            // Add overlay
            this.addFieldOverlay(field, loadingText);
        } else {
            // Restore original state
            field.classList.remove('ai-loading-field');

            if (field.dataset.originalValue !== undefined) {
                field.value = field.dataset.originalValue;
                delete field.dataset.originalValue;
            }

            if (field.dataset.originalDisabled !== undefined) {
                field.disabled = field.dataset.originalDisabled === 'true';
                delete field.dataset.originalDisabled;
            }

            // Remove overlay
            this.removeFieldOverlay(field);
        }
    }

    /**
     * Add loading overlay to field
     */
    addFieldOverlay(field, loadingText) {
        // Remove existing overlay
        this.removeFieldOverlay(field);

        const overlay = document.createElement('div');
        overlay.className = 'ai-loading-overlay';
        overlay.innerHTML = `
            <div class="ai-loading-spinner"></div>
            <div class="ai-loading-text">${loadingText}</div>
        `;

        // Make field container relative if needed
        const container = field.parentElement;
        if (container && window.getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        container.appendChild(overlay);
        field.dataset.hasOverlay = 'true';
    }

    /**
     * Remove loading overlay from field
     */
    removeFieldOverlay(field) {
        if (field.dataset.hasOverlay) {
            const container = field.parentElement;
            const overlay = container.querySelector('.ai-loading-overlay');
            if (overlay) {
                overlay.remove();
            }
            delete field.dataset.hasOverlay;
        }
    }

    /**
     * Set field group loading state
     */
    setFieldGroupLoading(fieldGroupId, isLoading) {
        // Try by ID first
        let fieldGroup = document.getElementById(fieldGroupId);

        // If not found by ID, try by class name
        if (!fieldGroup) {
            fieldGroup = document.querySelector(`.${fieldGroupId}`);
        }

        if (!fieldGroup) {
            console.warn(`⚠️ Field group not found: ${fieldGroupId}`);
            return;
        }

        if (isLoading) {
            fieldGroup.classList.add('ai-processing');
            console.log(`🔄 Added loading animation to: ${fieldGroupId}`);
        } else {
            fieldGroup.classList.remove('ai-processing');
            console.log(`✅ Removed loading animation from: ${fieldGroupId}`);
        }
    }

    /**
     * Quick start methods for common AI processes
     */
    startDescriptionGeneration(buttonId = null) {
        return this.startLoading('description', {
            button: buttonId,
            fields: ['editBodyHtml'],
            fieldGroup: 'descriptionGroup',
            loadingText: 'AI is crafting your product description...',
            buttonText: '<i class="fas fa-robot me-1"></i>AI Generating...'
        });
    }

    startFeaturesGeneration(buttonId = null) {
        return this.startLoading('features', {
            button: buttonId,
            fields: ['editFeatures'],
            fieldGroup: 'featuresGroup',
            loadingText: 'AI is analyzing features...',
            buttonText: '<i class="fas fa-robot me-1"></i>AI Generating...'
        });
    }

    startCareInstructionsGeneration(buttonId = null) {
        return this.startLoading('care_instructions', {
            button: buttonId,
            fields: ['editCareInstructions'],
            fieldGroup: 'careGroup',
            loadingText: 'AI is creating care instructions...',
            buttonText: '<i class="fas fa-robot me-1"></i>AI Generating...'
        });
    }

    startFullAIGeneration(buttonId = null) {
        return this.startLoading('full_ai', {
            button: buttonId,
            fields: ['editBodyHtml', 'editFeatures', 'editCareInstructions'],
            fieldGroup: null, // Will handle multiple groups
            loadingText: 'AI is processing...',
            buttonText: '<i class="fas fa-robot me-1"></i>AI Processing...'
        });
    }

    startAIExtraction(buttonId = null) {
        return this.startLoading('ai_extraction', {
            button: buttonId,
            fields: ['editSku', 'editTitle', 'editVendor', 'editBodyHtml', 'editFeatures'],
            fieldGroups: ['basicInfoGroup', 'sinksSpecsGroup', 'sinkDimensionsGroup', 'bowlDimensionsGroup'],
            loadingText: 'AI is extracting product data...',
            buttonText: '<i class="fas fa-robot me-1"></i>AI Extracting...'
        });
    }

    startImageExtraction(buttonId = null) {
        return this.startLoading('image_extraction', {
            button: buttonId,
            fields: [],
            fieldGroups: ['image-section', 'additional-images-section'],
            loadingText: 'AI is extracting images...',
            buttonText: '<i class="fas fa-images me-1"></i>Extracting Images...'
        });
    }

    startBulkProcessing(buttonId = null, processType = 'descriptions') {
        let loadingText, buttonText;

        switch(processType) {
            case 'descriptions':
                loadingText = 'AI is generating descriptions for selected products...';
                buttonText = '<i class="fas fa-robot me-1"></i>Processing descriptions...';
                break;
            case 'images':
                loadingText = 'AI is extracting images from selected products...';
                buttonText = '<i class="fas fa-images me-1"></i>Extracting images...';
                break;
            default:
                loadingText = 'AI is processing selected products...';
                buttonText = `<i class="fas fa-robot me-1"></i>Processing ${processType}...`;
        }

        return this.startLoading('bulk_processing', {
            button: buttonId,
            fields: [],
            fieldGroup: null,
            loadingText: loadingText,
            buttonText: buttonText
        });
    }

    startFAQGeneration(buttonId = null) {
        return this.startLoading('faq_generation', {
            button: buttonId,
            fields: [],
            fieldGroup: null,
            loadingText: 'AI is generating FAQs...',
            buttonText: '<i class="fas fa-spinner fa-spin me-1"></i>Generating FAQs...'
        });
    }

    /**
     * Check if any AI process is currently running
     */
    isAnyProcessActive() {
        return this.activeProcesses.size > 0;
    }

    /**
     * Get active processes
     */
    getActiveProcesses() {
        return Array.from(this.activeProcesses);
    }

    /**
     * Stop all active processes
     */
    stopAllProcesses() {
        const processIds = Array.from(this.activeProcesses);
        processIds.forEach(processId => this.stopLoading(processId));

        console.log(`🛑 Stopped ${processIds.length} AI loading processes`);
    }

    /**
     * Create a loading indicator for any element
     */
    createLoadingIndicator(text = 'Loading...') {
        const indicator = document.createElement('div');
        indicator.className = 'ai-loading-overlay';
        indicator.innerHTML = `
            <div class="ai-loading-spinner"></div>
            <div class="ai-loading-text">${text}</div>
        `;
        return indicator;
    }

    /**
     * Add tab loading state
     */
    setTabLoading(tabId, isLoading) {
        const tab = document.getElementById(tabId);
        if (!tab) return;

        if (isLoading) {
            const originalText = tab.textContent;
            if (!tab.dataset.originalText) {
                tab.dataset.originalText = originalText;
            }
            tab.innerHTML = `
                <span class="spinner-border spinner-border-sm me-2" role="status">
                    <span class="visually-hidden">Loading...</span>
                </span>
                ${originalText}
            `;
            tab.disabled = true;
        } else {
            if (tab.dataset.originalText) {
                tab.textContent = tab.dataset.originalText;
                delete tab.dataset.originalText;
            }
            tab.disabled = false;
        }
    }
}

// Global instance
let aiLoadingManager = null;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    aiLoadingManager = new AILoadingManager();

    // Make it globally accessible
    window.aiLoadingManager = aiLoadingManager;

    console.log('✅ AI Loading Manager initialized');
});

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AILoadingManager;
}