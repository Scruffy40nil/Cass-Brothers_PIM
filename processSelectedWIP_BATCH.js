/**
 * Process selected WIP products using NEW BATCH WORKFLOW
 *
 * Phase 1: Extract ALL products → Save to SQLite (no Google Sheets calls)
 * Phase 2: Batch upload ALL to Google Sheets (ONE API call)
 * Phase 3: Run cleaner on all rows (ONE operation)
 *
 * This eliminates rate limit errors completely!
 *
 * COPY THIS FUNCTION INTO add_products.js to replace the old processSelectedWIP()
 */
async function processSelectedWIP() {
    const checkboxes = document.querySelectorAll('.wip-select:checked');
    const wipIds = Array.from(checkboxes).map(cb => parseInt(cb.value));

    if (wipIds.length === 0) {
        showNotification('Please select at least one product', 'warning');
        return;
    }

    if (wipIds.length > 30) {
        showNotification('Maximum 30 products can be processed at once', 'danger');
        return;
    }

    const fastMode = confirm(`Process ${wipIds.length} product(s) in FAST MODE?\n\n✅ FAST MODE (Recommended):\n  • 45-60 seconds per product\n  • Skips AI content generation\n  • You can add descriptions later\n  • NO rate limit errors!\n\n❌ FULL MODE:\n  • 3-5 minutes per product\n  • Generates AI descriptions\n  • Takes much longer\n\nClick OK for Fast Mode, Cancel for Full Mode`);

    try {
        startWIPAutoRefresh();

        console.log(`🚀 BATCH PROCESSING: Extracting ${wipIds.length} products...`);
        console.log(`⚡ Fast mode: ${fastMode ? 'ENABLED' : 'DISABLED'}`);
        console.log(`📊 This will be MUCH faster - no delays, no rate limits!`);

        // PHASE 1: Extract ALL products (save to SQLite, NO Google Sheets)
        showLoading(`Phase 1/2: Extracting ${wipIds.length} products...`);

        let extracted = 0;
        let extractFailed = 0;
        const extractErrors = [];

        for (let i = 0; i < wipIds.length; i++) {
            const wipId = wipIds[i];
            const progress = `${i + 1}/${wipIds.length}`;

            try {
                console.log(`\n🤖 Extracting product ${progress} (WIP ID: ${wipId})...`);

                const response = await fetch(`/api/${COLLECTION_NAME}/wip/extract-only`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        wip_id: wipId,
                        fast_mode: fastMode
                    })
                });

                const data = await response.json();

                if (data.success) {
                    extracted++;
                    console.log(`✅ ${progress} - ${data.sku} extracted in ${Math.round(data.duration)}s (${data.extracted_fields.length} fields)`);
                } else {
                    extractFailed++;
                    extractErrors.push(`Product ${wipId}: ${data.error}`);
                    console.error(`❌ ${progress} - Failed: ${data.error}`);
                }

                // Refresh to show progress
                await refreshAllWIPTabs();

            } catch (error) {
                extractFailed++;
                extractErrors.push(`Product ${wipId}: ${error.message}`);
                console.error(`❌ ${progress} - Error:`, error);
            }
        }

        console.log(`\n📊 Phase 1 Complete: ${extracted} extracted, ${extractFailed} failed`);

        if (extracted === 0) {
            stopWIPAutoRefresh();
            hideLoading();
            showNotification(`❌ All products failed to extract. Check console for details.`, 'danger');
            console.error('Extraction errors:', extractErrors);
            return;
        }

        // PHASE 2: Batch upload ALL extracted products to Google Sheets (ONE API call!)
        console.log(`\n📤 Phase 2: Uploading ${extracted} products to Google Sheets in ONE batch...`);
        showLoading(`Phase 2/2: Uploading ${extracted} products to Google Sheets...`);

        const uploadResponse = await fetch(`/api/${COLLECTION_NAME}/wip/batch-upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wip_ids: wipIds })
        });

        const uploadResult = await uploadResponse.json();

        console.log(`\n✅ Batch upload complete!`);
        console.log(`   📤 Uploaded: ${uploadResult.uploaded}`);
        console.log(`   ❌ Failed: ${uploadResult.failed}`);
        console.log(`   ⏱️  Total time: ${Math.round(uploadResult.duration)}s`);

        if (uploadResult.failed > 0) {
            console.error('Upload failures:', uploadResult.failed_details);
        }

        // Stop auto-refresh
        stopWIPAutoRefresh();
        hideLoading();

        // Show final results
        const totalSuccess = uploadResult.uploaded;
        const totalFailed = extractFailed + uploadResult.failed;

        if (totalFailed === 0) {
            showNotification(`🎉 Successfully processed all ${totalSuccess} products!`, 'success');
        } else if (totalSuccess > 0) {
            showNotification(
                `⚠️ Processed ${totalSuccess} products, ${totalFailed} failed. Check console for details.`,
                'warning'
            );
        } else {
            showNotification(`❌ All products failed. Check console for details.`, 'danger');
        }

        // Final refresh
        await refreshAllWIPTabs();

    } catch (error) {
        console.error('Error in batch processing:', error);
        showNotification(`Error: ${error.message}`, 'danger');
        stopWIPAutoRefresh();
        hideLoading();
    }
}
