/**
 * Award-Winning PIM Modal JavaScript
 * Enhanced UX interactions and workflow optimization
 */

class PIMModal {
    constructor() {
        this.currentSection = 'overview';
        this.unsavedChanges = false;
        this.autoSaveTimer = null;
        this.completionData = {};
        this.validationRules = {};
        this.shortcuts = {};

        this.init();
    }

    init() {
        this.bindEvents();
        this.initializeShortcuts();
        this.initializeAutoSave();
        this.initializeValidation();
        this.initializeProgressTracking();
        this.initializeScrollSpy();
    }

    bindEvents() {
        // Navigation events
        document.addEventListener('click', (e) => {
            if (e.target.matches('.nav-item')) {
                e.preventDefault();
                this.switchSection(e.target.dataset.section);
            }

            if (e.target.matches('.card-action, .action-btn')) {
                this.handleActionClick(e);
            }

            if (e.target.matches('[onclick*="toggleMoreActions"]')) {
                this.toggleMoreActions();
            }
        });

        // Form change tracking
        document.addEventListener('input', (e) => {
            if (e.target.matches('.form-control')) {
                this.handleFieldChange(e.target);
            }
        });

        // Character counters
        document.addEventListener('input', (e) => {
            if (e.target.id === 'editSeoTitle') {
                this.updateCharCounter('seoTitleCount', e.target.value, 60);
            }
            if (e.target.id === 'editSeoDescription') {
                this.updateCharCounter('seoDescCount', e.target.value, 160);
            }
        });

        // Modal events
        const modal = document.getElementById('editProductModal');
        if (modal) {
            modal.addEventListener('shown.bs.modal', () => this.onModalShow());
            modal.addEventListener('hidden.bs.modal', () => this.onModalHide());
        }

        // Escape key handling
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isModalOpen()) {
                if (this.unsavedChanges) {
                    this.showUnsavedChangesDialog();
                } else {
                    this.closeModal();
                }
            }
        });
    }

    initializeShortcuts() {
        this.shortcuts = {
            'ctrl+s': () => this.saveProduct(),
            'ctrl+shift+a': () => this.triggerQuickAI(),
            'ctrl+1': () => this.switchSection('overview'),
            'ctrl+2': () => this.switchSection('specifications'),
            'ctrl+3': () => this.switchSection('content'),
            'ctrl+4': () => this.switchSection('media'),
            'ctrl+5': () => this.switchSection('pricing'),
            'ctrl+6': () => this.switchSection('ecommerce')
        };

        document.addEventListener('keydown', (e) => {
            const key = `${e.ctrlKey ? 'ctrl+' : ''}${e.shiftKey ? 'shift+' : ''}${e.key.toLowerCase()}`;
            if (this.shortcuts[key] && this.isModalOpen()) {
                e.preventDefault();
                this.shortcuts[key]();
            }
        });
    }

    initializeAutoSave() {
        this.autoSaveTimer = setInterval(() => {
            if (this.unsavedChanges && this.isModalOpen()) {
                this.autoSave();
            }
        }, 30000); // Auto-save every 30 seconds
    }

    initializeValidation() {
        this.validationRules = {
            editSku: { required: true, pattern: /^[A-Z0-9-_]+$/i },
            editTitle: { required: true, minLength: 10, maxLength: 200 },
            editVendor: { required: true },
            editProductMaterial: { required: true },
            editSeoTitle: { maxLength: 60 },
            editSeoDescription: { maxLength: 160 }
        };
    }

    initializeProgressTracking() {
        this.completionData = {
            overview: 0,
            specifications: 0,
            content: 0,
            media: 0,
            pricing: 0,
            ecommerce: 0
        };
    }

    initializeScrollSpy() {
        // Auto-update active tab based on scroll position in single-page view
        const mainContent = document.querySelector('.main-content');
        if (!mainContent) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
                    const sectionId = entry.target.id;
                    const sectionName = sectionId.replace('Section', '');

                    // Update active nav item without scrolling
                    document.querySelector('.nav-item.active')?.classList.remove('active');
                    const navItem = document.querySelector(`[data-section="${sectionName}"]`);
                    if (navItem) {
                        navItem.classList.add('active');
                        this.currentSection = sectionName;
                    }

                    // Update active section highlight
                    document.querySelector('.content-section.active')?.classList.remove('active');
                    entry.target.classList.add('active');
                }
            });
        }, {
            threshold: [0.1, 0.5, 0.9],
            rootMargin: '-20% 0px -20% 0px'
        });

        // Observe all sections
        document.querySelectorAll('.content-section').forEach((section) => {
            observer.observe(section);
        });
    }

    // Section Navigation
    switchSection(sectionName) {
        // Smooth scroll to section instead of hiding/showing
        const targetSection = document.getElementById(`${sectionName}Section`);
        if (!targetSection) return;

        // Update active nav item
        document.querySelector('.nav-item.active')?.classList.remove('active');
        const newNavItem = document.querySelector(`[data-section="${sectionName}"]`);
        if (newNavItem) {
            newNavItem.classList.add('active');
        }

        // Smooth scroll to the target section
        targetSection.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
            inline: 'nearest'
        });

        // Update current section
        this.currentSection = sectionName;

        // Add visual feedback
        targetSection.classList.add('fade-in');
        setTimeout(() => targetSection.classList.remove('fade-in'), 300);

        // Update URL hash for browser back/forward
        history.replaceState(null, null, `#${sectionName}`);

        // Lazy load section content if needed
        this.loadSectionContent(sectionName);

        // Update progress
        this.updateSectionProgress(sectionName);
    }

    loadSectionContent(sectionName) {
        // Implement lazy loading for heavy sections
        switch (sectionName) {
            case 'media':
                this.loadMediaContent();
                break;
            case 'pricing':
                this.loadPricingContent();
                break;
            case 'ecommerce':
                this.loadEcommerceContent();
                break;
        }
    }

    // Field Handling
    handleFieldChange(field) {
        this.unsavedChanges = true;
        this.updateSaveStatus('unsaved');

        // Real-time validation
        this.validateField(field);

        // Update completion tracking
        this.updateFieldCompletion(field);

        // Add visual feedback
        field.classList.add('field-updated');
        setTimeout(() => field.classList.remove('field-updated'), 1000);

        // Trigger related field updates
        this.handleFieldDependencies(field);
    }

    validateField(field) {
        const rules = this.validationRules[field.id];
        if (!rules) return;

        let isValid = true;
        let errorMessage = '';

        // Required validation
        if (rules.required && !field.value.trim()) {
            isValid = false;
            errorMessage = 'This field is required';
        }

        // Pattern validation
        if (rules.pattern && field.value && !rules.pattern.test(field.value)) {
            isValid = false;
            errorMessage = 'Invalid format';
        }

        // Length validation
        if (rules.minLength && field.value.length < rules.minLength) {
            isValid = false;
            errorMessage = `Minimum ${rules.minLength} characters required`;
        }

        if (rules.maxLength && field.value.length > rules.maxLength) {
            isValid = false;
            errorMessage = `Maximum ${rules.maxLength} characters allowed`;
        }

        // Apply validation state
        field.classList.remove('input-success', 'input-error');
        field.classList.add(isValid ? 'input-success' : 'input-error');

        // Show/hide error message
        const statusElement = field.parentNode.querySelector('.input-status');
        if (statusElement) {
            statusElement.innerHTML = isValid ?
                '<i class="fas fa-check-circle text-success"></i>' :
                `<i class="fas fa-exclamation-circle text-danger" title="${errorMessage}"></i>`;
        }

        return isValid;
    }

    handleFieldDependencies(field) {
        // Handle field interdependencies
        switch (field.id) {
            case 'editBowlsNumber':
                this.toggleSecondaryBowlFields(field.value === '2');
                break;
            case 'editTitle':
                this.generateSEOTitle(field.value);
                break;
            case 'editProductMaterial':
                this.suggestCareInstructions(field.value);
                break;
        }
    }

    updateFieldCompletion(field) {
        // Update completion tracking for the specific field
        const fieldId = field.id;
        const sectionName = this.getFieldSection(fieldId);

        if (sectionName) {
            this.updateSectionProgress(sectionName);
        }

        // Update overall progress
        this.updateOverallProgress();
    }

    getFieldSection(fieldId) {
        // Map field IDs to sections
        const fieldSectionMap = {
            'editSku': 'overview',
            'editTitle': 'overview',
            'editVendor': 'overview',
            'editInstallationType': 'overview',
            'editProductMaterial': 'overview',
            'editGradeOfMaterial': 'overview',
            'editBrandName': 'overview',
            'editStyle': 'overview',
            'editLengthMm': 'specifications',
            'editOverallWidthMm': 'specifications',
            'editOverallDepthMm': 'specifications',
            'editBowlWidthMm': 'specifications',
            'editBowlDepthMm': 'specifications',
            'editBowlHeightMm': 'specifications',
            'editSecondBowlWidthMm': 'specifications',
            'editSecondBowlDepthMm': 'specifications',
            'editSecondBowlHeightMm': 'specifications',
            'editMinCabinetSizeMm': 'specifications',
            'editBowlsNumber': 'specifications',
            'editFaucetHoles': 'specifications',
            'editHasOverflow': 'specifications',
            'editWarrantyYears': 'specifications',
            'editWasteOutletDimensions': 'specifications',
            'editDrainPosition': 'specifications',
            'editCutoutSizeMm': 'specifications',
            'editApplicationLocation': 'specifications',
            'editBodyHtml': 'content',
            'editFeatures': 'content',
            'editSeoTitle': 'content',
            'editSeoDescription': 'content',
            'editFaqs': 'content',
            'editCareInstructions': 'content',
            'editShopifySpecSheet': 'media',
            'editRrpPrice': 'pricing',
            'editSalePrice': 'pricing',
            'editWeight': 'ecommerce',
            'editTags': 'ecommerce'
        };

        return fieldSectionMap[fieldId] || null;
    }

    // Progress Tracking
    updateSectionProgress(sectionName) {
        const completion = this.calculateSectionCompletion(sectionName);
        this.completionData[sectionName] = completion;

        // Update UI
        const completionElement = document.getElementById(`${sectionName}Completion`);
        if (completionElement) {
            completionElement.textContent = `${completion}%`;
        }

        // Update overall progress
        this.updateOverallProgress();
    }

    calculateSectionCompletion(sectionName) {
        const sectionFields = this.getSectionFields(sectionName);
        const completedFields = sectionFields.filter(field => {
            const element = document.getElementById(field);
            return element && element.value.trim() !== '';
        });

        return Math.round((completedFields.length / sectionFields.length) * 100);
    }

    getSectionFields(sectionName) {
        const fieldMap = {
            overview: ['editSku', 'editTitle', 'editVendor', 'editInstallationType', 'editProductMaterial'],
            specifications: ['editLengthMm', 'editOverallWidthMm', 'editOverallDepthMm', 'editBowlWidthMm'],
            content: ['editBodyHtml', 'editFeatures', 'editSeoTitle', 'editSeoDescription'],
            media: ['editShopifySpecSheet'],
            pricing: ['editRrpPrice', 'editSalePrice'],
            ecommerce: ['editWeight', 'editTags']
        };

        return fieldMap[sectionName] || [];
    }

    updateOverallProgress() {
        const sections = Object.keys(this.completionData);
        const totalCompletion = sections.reduce((sum, section) => sum + this.completionData[section], 0);
        const averageCompletion = Math.round(totalCompletion / sections.length);

        // Update progress bar
        const progressBar = document.getElementById('overallProgress');
        const progressText = document.querySelector('.progress-text');

        if (progressBar) {
            progressBar.style.width = `${averageCompletion}%`;
        }

        if (progressText) {
            progressText.textContent = `${averageCompletion}% Complete`;
        }

        // Update header quality indicator
        const qualityIndicator = document.getElementById('modalQualityIndicator');
        const qualityText = document.getElementById('modalQualityText');

        if (qualityText) {
            qualityText.textContent = `Quality: ${averageCompletion}%`;
        }

        if (qualityIndicator) {
            const icon = qualityIndicator.querySelector('.fas');
            icon.className = `fas fa-circle ${this.getQualityClass(averageCompletion)}`;
        }
    }

    getQualityClass(percentage) {
        if (percentage >= 90) return 'text-success';
        if (percentage >= 70) return 'text-warning';
        return 'text-danger';
    }

    // Actions
    handleActionClick(e) {
        e.preventDefault();
        const action = e.target.closest('.card-action, .action-btn');

        // Add loading state
        this.setActionLoading(action, true);

        // Trigger the original onclick if it exists
        if (action.onclick) {
            try {
                action.onclick.call(action, e);
            } catch (error) {
                console.error('Action error:', error);
                this.showErrorMessage('Action failed. Please try again.');
            } finally {
                setTimeout(() => this.setActionLoading(action, false), 2000);
            }
        }
    }

    setActionLoading(button, loading) {
        if (loading) {
            button.dataset.originalContent = button.innerHTML;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            button.disabled = true;
        } else {
            button.innerHTML = button.dataset.originalContent || button.innerHTML;
            button.disabled = false;
        }
    }

    triggerQuickAI() {
        this.showAIOptionsDialog();
    }

    showAIOptionsDialog() {
        // Create AI options modal
        const aiModal = document.createElement('div');
        aiModal.className = 'ai-options-overlay';
        aiModal.innerHTML = `
            <div class="ai-options-dialog">
                <h3><i class="fas fa-magic"></i> AI Enhancement Options</h3>
                <div class="ai-options-grid">
                    <button class="ai-option" onclick="generateAIDescription(event)">
                        <i class="fas fa-file-text"></i>
                        <span>Generate Description</span>
                    </button>
                    <button class="ai-option" onclick="generateAIFeatures(event)">
                        <i class="fas fa-list-check"></i>
                        <span>Generate Features</span>
                    </button>
                    <button class="ai-option" onclick="generateAIFaqs(event)">
                        <i class="fas fa-question-circle"></i>
                        <span>Generate FAQs</span>
                    </button>
                    <button class="ai-option" onclick="optimizeSEO()">
                        <i class="fas fa-search"></i>
                        <span>Optimize SEO</span>
                    </button>
                </div>
                <button class="ai-close" onclick="this.parentNode.parentNode.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        document.body.appendChild(aiModal);

        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (aiModal.parentNode) {
                aiModal.remove();
            }
        }, 10000);
    }

    toggleMoreActions() {
        const panel = document.getElementById('moreActionsPanel');
        const isVisible = panel.style.display !== 'none';

        panel.style.display = isVisible ? 'none' : 'block';

        if (!isVisible) {
            panel.classList.add('slide-in');
        }
    }

    // Save Operations
    saveProduct() {
        if (this.validateAllFields()) {
            this.updateSaveStatus('saving');

            // Call original save function
            if (window.saveProduct) {
                window.saveProduct();
            }

            this.unsavedChanges = false;
            setTimeout(() => this.updateSaveStatus('saved'), 2000);
        } else {
            this.showValidationErrors();
        }
    }

    autoSave() {
        this.updateSaveStatus('auto-saving');

        // Implement auto-save logic
        console.log('Auto-saving changes...');

        setTimeout(() => {
            this.updateSaveStatus('auto-saved');
            this.unsavedChanges = false;
        }, 1000);
    }

    saveAndContinue() {
        this.saveProduct();
        // Logic to move to next product or close modal
    }

    updateSaveStatus(status) {
        const statusElement = document.getElementById('saveStatus');
        if (!statusElement) return;

        const statusConfig = {
            saved: { icon: 'check-circle', text: 'All changes saved', class: 'text-success' },
            saving: { icon: 'spinner fa-spin', text: 'Saving changes...', class: 'text-info' },
            'auto-saving': { icon: 'spinner fa-spin', text: 'Auto-saving...', class: 'text-info' },
            'auto-saved': { icon: 'check-circle', text: 'Auto-saved', class: 'text-success' },
            unsaved: { icon: 'exclamation-triangle', text: 'Unsaved changes', class: 'text-warning' },
            error: { icon: 'exclamation-circle', text: 'Save failed', class: 'text-danger' }
        };

        const config = statusConfig[status] || statusConfig.saved;
        statusElement.innerHTML = `
            <i class="fas fa-${config.icon} ${config.class}"></i>
            <span>${config.text}</span>
        `;
    }

    // Validation
    validateAllFields() {
        const fields = document.querySelectorAll('.form-control');
        let allValid = true;

        fields.forEach(field => {
            if (!this.validateField(field)) {
                allValid = false;
            }
        });

        return allValid;
    }

    showValidationErrors() {
        const firstError = document.querySelector('.input-error');
        if (firstError) {
            firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstError.focus();
        }

        this.showErrorMessage('Please fix the validation errors before saving.');
    }

    // Utility Methods
    updateCharCounter(counterId, value, maxLength) {
        const counter = document.getElementById(counterId);
        if (counter) {
            counter.textContent = value.length;
            counter.parentNode.classList.toggle('text-danger', value.length > maxLength);
        }
    }

    toggleSecondaryBowlFields(show) {
        const secondaryFields = document.getElementById('secondaryBowlDimensions');
        if (secondaryFields) {
            secondaryFields.style.display = show ? 'block' : 'none';
        }
    }

    generateSEOTitle(productTitle) {
        if (!productTitle) return;

        const seoTitle = document.getElementById('editSeoTitle');
        if (seoTitle && !seoTitle.value) {
            // Auto-generate SEO title if empty
            const generatedTitle = `${productTitle} | Cass Brothers`;
            if (generatedTitle.length <= 60) {
                seoTitle.value = generatedTitle;
                this.updateCharCounter('seoTitleCount', generatedTitle, 60);
            }
        }
    }

    suggestCareInstructions(material) {
        const careField = document.getElementById('editCareInstructions');
        if (careField && !careField.value) {
            const careMap = {
                'Stainless Steel': 'Clean with mild soap and water. Avoid abrasive cleaners. Dry thoroughly to prevent water spots.',
                'Granite': 'Clean with pH-neutral cleaner. Seal annually. Avoid acidic substances.',
                'Ceramic': 'Clean with non-abrasive cleaners. Avoid thermal shock.',
                'Fireclay': 'Clean with soft cloth and mild detergent. Avoid harsh chemicals.'
            };

            if (careMap[material]) {
                careField.value = careMap[material];
                this.handleFieldChange(careField);
            }
        }
    }

    // Modal Events
    onModalShow() {
        // Initialize from URL hash
        const hash = window.location.hash.substring(1);
        if (hash && ['overview', 'specifications', 'content', 'media', 'pricing', 'ecommerce'].includes(hash)) {
            this.switchSection(hash);
        }

        // Update progress tracking
        setTimeout(() => this.updateAllSectionProgress(), 100);

        // Focus first field
        const firstField = document.querySelector('.content-section.active .form-control');
        if (firstField) {
            firstField.focus();
        }

        // Initialize dynamic content
        this.populateQuickInsights();
        this.loadProductAvatar();
    }

    onModalHide() {
        // Clean up
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
        }

        // Remove URL hash
        history.replaceState(null, null, ' ');

        // Reset state
        this.currentSection = 'overview';
        this.unsavedChanges = false;
    }

    isModalOpen() {
        const modal = document.getElementById('editProductModal');
        return modal && modal.classList.contains('show');
    }

    closeModal() {
        const modal = bootstrap.Modal.getInstance(document.getElementById('editProductModal'));
        if (modal) {
            modal.hide();
        }
    }

    // Content Loading
    loadMediaContent() {
        // Implement media gallery loading
        console.log('Loading media content...');
    }

    loadPricingContent() {
        // Implement pricing data loading
        console.log('Loading pricing content...');
    }

    loadEcommerceContent() {
        // Implement e-commerce data loading
        console.log('Loading e-commerce content...');
    }

    populateQuickInsights() {
        // Populate the quick insights panel with relevant information
        console.log('Populating quick insights...');
    }

    loadProductAvatar() {
        // Load product avatar image
        const avatar = document.getElementById('modalProductAvatar');
        const images = document.getElementById('editShopifySpecSheet')?.value;

        if (avatar && images) {
            const imageUrls = images.split(',');
            if (imageUrls[0]) {
                avatar.src = imageUrls[0].trim();
                avatar.style.display = 'block';
            }
        }
    }

    updateAllSectionProgress() {
        ['overview', 'specifications', 'content', 'media', 'pricing', 'ecommerce'].forEach(section => {
            this.updateSectionProgress(section);
        });
    }

    // Messages
    showSuccessMessage(message) {
        this.showMessage(message, 'success');
    }

    showErrorMessage(message) {
        this.showMessage(message, 'error');
    }

    showMessage(message, type) {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = `pim-toast pim-toast-${type}`;
        toast.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
            <span>${message}</span>
        `;

        document.body.appendChild(toast);

        // Remove after 5 seconds
        setTimeout(() => toast.remove(), 5000);
    }

    showUnsavedChangesDialog() {
        if (confirm('You have unsaved changes. Are you sure you want to close?')) {
            this.unsavedChanges = false;
            this.closeModal();
        }
    }
}

// Initialize the PIM Modal
document.addEventListener('DOMContentLoaded', () => {
    window.pimModal = new PIMModal();
});

// CSS for additional elements
const additionalCSS = `
.ai-options-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(5px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
}

.ai-options-dialog {
    background: white;
    border-radius: 1rem;
    padding: 2rem;
    box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1);
    max-width: 500px;
    width: 90%;
    position: relative;
}

.ai-options-dialog h3 {
    margin: 0 0 1.5rem 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--pim-gray-900);
}

.ai-options-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
}

.ai-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1.5rem;
    border: 2px solid var(--pim-gray-200);
    border-radius: 0.75rem;
    background: white;
    cursor: pointer;
    transition: all 0.2s;
}

.ai-option:hover {
    border-color: var(--pim-primary);
    background: var(--pim-gray-50);
    transform: translateY(-2px);
}

.ai-option i {
    font-size: 1.5rem;
    color: var(--pim-primary);
}

.ai-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    width: 2rem;
    height: 2rem;
    border: none;
    background: var(--pim-gray-100);
    border-radius: 50%;
    cursor: pointer;
}

.pim-toast {
    position: fixed;
    top: 2rem;
    right: 2rem;
    padding: 1rem 1.5rem;
    border-radius: 0.5rem;
    color: white;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    z-index: 10000;
    animation: slideInRight 0.3s ease-out;
}

.pim-toast-success {
    background: var(--pim-success);
}

.pim-toast-error {
    background: var(--pim-error);
}

@keyframes slideInRight {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
}
`;

// Inject additional CSS
if (!document.getElementById('pim-modal-additional-css')) {
    const style = document.createElement('style');
    style.id = 'pim-modal-additional-css';
    style.textContent = additionalCSS;
    document.head.appendChild(style);
}