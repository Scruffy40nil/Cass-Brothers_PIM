/**
 * AI Processor Module
 * Handles all AI extraction and processing functionality
 */

class AIProcessor {
    constructor(collectionName) {
        this.collectionName = collectionName;
        this.uiUtils = null; // Will be set when UIUtils is available
        this.isProcessing = false;
    }

    /**
     * Extract single product with status updates
     */
    async extractSingleProductWithStatus(event) {
        if (event) event.preventDefault();
        
        const rowNum = document.getElementById('editRowNum')?.value;

        if (!rowNum) {
            this.uiUtils?.showErrorMessage('No product row selected');
            return;
        }

        console.log(`🤖 Starting AI extraction for product ${rowNum} from modal`);

        // Show status in modal
        this.updateModalStatus('Extracting...', 'bg-warning');

        // Start the animation sequence
        this.startAIExtractionAnimation();

        try {
            const result = await this.callExtractionAPI([parseInt(rowNum)], true);

            if (result.success) {
                console.log('✅ AI extraction successful:', result);
                this.updateModalStatus('Extraction Complete!', 'bg-success');
                this.showExtractionSuccess();

                // Reload the product data in the modal after a short delay
                setTimeout(() => {
                    this.loadProductIntoModal(rowNum);
                }, 1500);

                this.uiUtils?.showSuccessMessage('AI extraction completed!');
            } else {
                console.error('❌ AI extraction failed:', result.message);
                this.updateModalStatus('Extraction Failed', 'bg-danger');
                this.stopAIExtractionAnimation();
                this.uiUtils?.showErrorMessage(`AI extraction failed: ${result.message}`);
            }
        } catch (error) {
            console.error('❌ Error during AI extraction:', error);
            this.updateModalStatus('Error', 'bg-danger');
            this.stopAIExtractionAnimation();
            this.uiUtils?.showErrorMessage(`Error during AI extraction: ${error.message}`);
        }
    }

    /**
     * Generate single description
     */
    async generateSingleDescription(event) {
        if (event) event.preventDefault();
        
        const rowNum = document.getElementById('editRowNum')?.value;

        if (!rowNum) {
            this.uiUtils?.showErrorMessage('No product row selected');
            return;
        }

        console.log(`📝 Generating description for product ${rowNum} from modal`);

        // Show status in modal
        this.updateModalStatus('Generating...', 'bg-info');

        // Start description-specific animation
        this.animateDescriptionGeneration();

        try {
            const response = await fetch(`/api/${this.collectionName}/products/${rowNum}/generate-description`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    use_url_content: true
                })
            });

            const result = await response.json();

            if (result.success) {
                console.log('✅ Description generation successful:', result);
                this.updateModalStatus('Description Generated!', 'bg-success');
                this.showDescriptionSuccess();

                // Reload the product data in the modal
                setTimeout(() => {
                    this.loadProductIntoModal(rowNum);
                }, 1000);

                this.uiUtils?.showSuccessMessage('Description generated successfully!');
            } else {
                console.error('❌ Description generation failed:', result.error);
                this.updateModalStatus('Generation Failed', 'bg-danger');
                this.uiUtils?.showErrorMessage(`Description generation failed: ${result.error}`);
            }
        } catch (error) {
            console.error('❌ Error during description generation:', error);
            this.updateModalStatus('Error', 'bg-danger');
            this.uiUtils?.showErrorMessage(`Error during description generation: ${error.message}`);
        }
    }

    /**
     * Bulk AI extraction
     */
    async startBulkAIExtraction(selectedProducts) {
        if (!selectedProducts || selectedProducts.length === 0) {
            this.uiUtils?.showErrorMessage('Please select products first by checking the boxes on product cards');
            return;
        }

        const confirmed = confirm(`Start AI extraction for ${selectedProducts.length} selected products?\n\nThis will extract product information from supplier URLs.`);
        if (!confirmed) return;

        console.log(`🤖 Starting bulk AI extraction for ${selectedProducts.length} products`);

        this.uiUtils?.showInfoMessage(`Starting AI extraction for ${selectedProducts.length} products...`);

        try {
            const result = await this.callExtractionAPI(selectedProducts, true);

            if (result.success) {
                console.log('✅ Bulk AI extraction successful:', result);
                this.uiUtils?.showSuccessMessage(result.message);
                
                // Trigger data reload
                if (window.dataManager) {
                    window.dataManager.loadProductData();
                }
            } else {
                console.error('❌ Bulk AI extraction failed:', result.message);
                this.uiUtils?.showErrorMessage(`Bulk AI extraction failed: ${result.message}`);
            }
        } catch (error) {
            console.error('❌ Error during bulk AI extraction:', error);
            this.uiUtils?.showErrorMessage(`Error during bulk AI extraction: ${error.message}`);
        }
    }

    /**
     * Generate bulk descriptions
     */
    async generateBulkDescriptions(selectedProducts) {
        if (!selectedProducts || selectedProducts.length === 0) {
            this.uiUtils?.showErrorMessage('Please select products first by checking the boxes on product cards');
            return;
        }

        const confirmed = confirm(`Generate descriptions for ${selectedProducts.length} selected products?\n\nThis will create AI-generated product descriptions.`);
        if (!confirmed) return;

        console.log(`📝 Starting bulk description generation for ${selectedProducts.length} products`);

        this.uiUtils?.showInfoMessage(`Starting description generation for ${selectedProducts.length} products...`);

        try {
            const response = await fetch(`/api/${this.collectionName}/process/descriptions`, {
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
                console.log('✅ Bulk description generation successful:', result);
                this.uiUtils?.showSuccessMessage(result.message);
                
                if (window.dataManager) {
                    window.dataManager.loadProductData();
                }
            } else {
                console.error('❌ Bulk description generation failed:', result.message);
                this.uiUtils?.showErrorMessage(`Bulk description generation failed: ${result.message}`);
            }
        } catch (error) {
            console.error('❌ Error during bulk description generation:', error);
            this.uiUtils?.showErrorMessage(`Error during bulk description generation: ${error.message}`);
        }
    }

    /**
     * Call extraction API
     */
    async callExtractionAPI(selectedRows, overwriteMode) {
        const response = await fetch(`/api/${this.collectionName}/process/extract`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                selected_rows: selectedRows,
                overwrite_mode: overwriteMode
            })
        });

        return await response.json();
    }

    /**
     * Animation Functions
     */
    startAIExtractionAnimation() {
        console.log('🎬 Starting AI extraction animation sequence...');

        // Reset any previous animations
        this.stopAIExtractionAnimation();

        // Get all the field groups that will be processed
        const fieldGroups = [
            { id: 'basicInfoGroup', name: 'Basic Information', delay: 0 },
            { id: 'productDetailsGroup', name: 'Product Details', delay: 1000 },
            { id: 'dimensionsGroup', name: 'Dimensions', delay: 2000 },
            { id: 'ecommerceGroup', name: 'E-commerce Information', delay: 3000 },
            { id: 'contentGroup', name: 'Product Content', delay: 4000 }
        ];

        // Update badge to show overall progress
        this.updateModalStatus('Processing Fields...', 'bg-warning');

        // Animate each field group in sequence
        fieldGroups.forEach((group, index) => {
            setTimeout(() => {
                this.animateFieldGroup(group.id, group.name);
            }, group.delay);
        });
    }

    animateFieldGroup(groupId, groupName) {
        const group = document.getElementById(groupId);
        if (!group) {
            console.warn(`⚠️ Group ${groupId} not found`);
            return;
        }

        console.log(`✨ Animating ${groupName} fields...`);

        // Add processing class to the entire group
        group.classList.add('ai-processing');

        // Add progress indicator
        const progressIndicator = document.createElement('div');
        progressIndicator.className = 'ai-progress-indicator';
        group.style.position = 'relative';
        group.appendChild(progressIndicator);

        // Find and animate the group header
        const groupHeader = group.querySelector('h6');
        if (groupHeader) {
            groupHeader.classList.add('ai-label-processing');
        }

        // Find all input fields in this group and animate them
        const inputFields = group.querySelectorAll('input, select, textarea');
        console.log(`Found ${inputFields.length} fields in ${groupName}`);

        inputFields.forEach((field, index) => {
            setTimeout(() => {
                this.animateIndividualField(field);
            }, index * 200); // Stagger the field animations
        });

        // Update status badge with current group
        this.updateModalStatus(`Processing ${groupName}...`, 'bg-warning');
    }

    animateIndividualField(field) {
        console.log(`🔄 Animating individual field:`, field.id || field.name);

        // Add processing animation to the field
        field.classList.add('ai-field-processing');

        // Create a wrapper with shimmer effect
        const wrapper = field.parentElement;
        if (wrapper) {
            wrapper.style.position = 'relative';

            // Add shimmer overlay
            const shimmer = document.createElement('div');
            shimmer.className = 'field-shimmer';
            shimmer.innerHTML = '<div class="shimmer-line"></div>';
            wrapper.appendChild(shimmer);

            // Remove shimmer after animation
            setTimeout(() => {
                if (shimmer.parentElement) {
                    shimmer.remove();
                }
            }, 1500);
        }
    }

    showExtractionSuccess() {
        console.log('🎉 Showing extraction success animation...');

        // Remove all processing animations
        this.stopAIExtractionAnimation();

        // Add success animations to all field groups
        const fieldGroups = document.querySelectorAll('.field-group');
        fieldGroups.forEach((group, index) => {
            setTimeout(() => {
                group.classList.add('extraction-success');

                // Add success checkmarks to fields with values
                const fields = group.querySelectorAll('input, select, textarea');
                fields.forEach(field => {
                    if (field.value && field.value.trim() !== '') {
                        this.addSuccessIndicator(field);
                    }
                });
            }, index * 300);
        });

        // Clear success animations after delay
        setTimeout(() => {
            document.querySelectorAll('.field-group').forEach(group => {
                group.classList.remove('extraction-success');
            });
            document.querySelectorAll('.success-indicator').forEach(indicator => {
                indicator.remove();
            });
        }, 3000);
    }

    stopAIExtractionAnimation() {
        console.log('⏹️ Stopping AI extraction animations...');

        // Remove all animation classes
        document.querySelectorAll('.field-group').forEach(group => {
            group.classList.remove('ai-processing');
        });

        document.querySelectorAll('h6').forEach(header => {
            header.classList.remove('ai-label-processing');
        });

        document.querySelectorAll('input, select, textarea').forEach(field => {
            field.classList.remove('ai-field-processing');
        });

        // Remove any shimmer effects and progress indicators
        document.querySelectorAll('.field-shimmer, .ai-progress-indicator').forEach(el => {
            el.remove();
        });
    }

    addSuccessIndicator(field) {
        // Add a success checkmark to extracted fields
        const wrapper = field.parentElement;
        if (wrapper && !wrapper.querySelector('.success-indicator')) {
            const indicator = document.createElement('div');
            indicator.className = 'success-indicator';
            indicator.innerHTML = '<i class="fas fa-check-circle"></i>';
            indicator.style.cssText = `
                position: absolute;
                top: 5px;
                right: 5px;
                color: #28a745;
                font-size: 16px;
                z-index: 10;
                animation: successPop 0.8s ease-out;
            `;
            wrapper.style.position = 'relative';
            wrapper.appendChild(indicator);

            // Also add visual feedback to the field
            field.classList.add('field-extracted');
        }
    }

    animateDescriptionGeneration() {
        const contentGroup = document.getElementById('contentGroup');
        if (!contentGroup) return;

        console.log('✨ Animating description generation...');

        // Add processing animation to content group
        contentGroup.classList.add('ai-processing');

        const groupHeader = contentGroup.querySelector('h6');
        if (groupHeader) {
            groupHeader.classList.add('ai-label-processing');
        }

        // Animate the description fields
        const descriptionFields = ['editBodyHtml', 'editFeatures'];
        descriptionFields.forEach((fieldId, index) => {
            const field = document.getElementById(fieldId);
            if (field) {
                setTimeout(() => {
                    this.animateIndividualField(field);
                }, index * 500);
            }
        });
    }

    showDescriptionSuccess() {
        const contentGroup = document.getElementById('contentGroup');
        if (!contentGroup) return;

        console.log('🎉 Showing description success animation...');

        contentGroup.classList.remove('ai-processing');
        contentGroup.classList.add('extraction-success');

        // Add success indicators to description fields
        const descriptionFields = ['editBodyHtml', 'editFeatures'];
        descriptionFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field && field.value.trim() !== '') {
                this.addSuccessIndicator(field);
            }
        });

        setTimeout(() => {
            contentGroup.classList.remove('extraction-success');
        }, 2000);
    }

    /**
     * Utility methods
     */
    updateModalStatus(text, className) {
        const statusBadge = document.getElementById('modalStatusBadge');
        if (statusBadge) {
            statusBadge.textContent = text;
            statusBadge.className = `badge ${className} ms-3`;
            statusBadge.style.display = 'inline';
        }
    }

    async loadProductIntoModal(rowNum) {
        console.log(`🔄 Reloading product ${rowNum} data into modal`);

        try {
            const response = await fetch(`/api/${this.collectionName}/products/${rowNum}`);
            const data = await response.json();

            if (data.success) {
                // Update global products data
                if (window.productsData) {
                    window.productsData[rowNum] = data.product;
                }

                // If product editor is available, repopulate fields
                if (window.productEditor) {
                    window.productEditor.populateBasicFields(data.product);
                    window.productEditor.populateDynamicFields(data.product);
                }

                console.log(`✅ Reloaded product ${rowNum} data into modal`);
            } else {
                console.error(`❌ Failed to reload product ${rowNum} data:`, data.error);
            }
        } catch (error) {
            console.error(`❌ Error reloading product ${rowNum} data:`, error);
        }
    }

    /**
     * Set dependencies
     */
    setUIUtils(uiUtils) {
        this.uiUtils = uiUtils;
    }
}

// Export for global use
window.AIProcessor = AIProcessor;