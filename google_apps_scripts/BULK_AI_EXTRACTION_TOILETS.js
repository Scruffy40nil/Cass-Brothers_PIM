/**
 * BULK AI EXTRACTION FOR TOILETS - Google Apps Script
 *
 * This script runs AI extraction on multiple toilets products directly from Google Sheets.
 * It automatically handles rate limiting, batching, and Vision API fallback for technical drawings.
 *
 * SETUP INSTRUCTIONS:
 * 1. Open your Toilets Google Sheet
 * 2. Go to Extensions → Apps Script
 * 3. Create a new script file and paste this code
 * 4. Run setupMenu() once to add the menu
 * 5. Use the "🤖 AI Extraction" menu to start bulk extraction
 *
 * FEATURES:
 * - Automatic Vision API fallback for technical drawing PDFs (like Alix K011)
 * - Smart batching to avoid timeouts
 * - Progress tracking and error reporting
 * - Skip already-extracted products
 * - Extract specific ranges or selected rows
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

// API Configuration
const API_BASE_URL = 'https://cassbrothers.pythonanywhere.com';
const COLLECTION_NAME = 'toilets';

// Processing Configuration
const TOILETS_TOILETS_BATCH_SIZE = 5;                    // Process 5 products at a time
const TOILETS_TOILETS_DELAY_BETWEEN_BATCHES = 65000;     // 65 seconds between batches (avoid quota limits)
const TOILETS_DELAY_BETWEEN_REQUESTS = 8000;     // 8 seconds between individual requests

// Column numbers (1-indexed) - Based on ToiletsCollection config
const TOILETS_TOILETS_COLUMNS = {
  URL: 1,                    // Column A (supplier_url)
  SKU: 2,                    // Column B (variant_sku)
  TITLE: 6,                  // Column F (title)
  BRAND: 8,                  // Column H (brand_name)
  INSTALLATION_TYPE: 9,      // Column I - AI extracts this
  TRAP_TYPE: 10,             // Column J - AI extracts this
  SPEC_SHEET: 36,            // Column AJ - shopify_spec_sheet
};

// ============================================================================
// MENU SETUP
// ============================================================================

/**
 * Adds custom menu to Google Sheets
 * Run this function once after pasting the script
 */
function setupMenu() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🤖 AI Extraction')
    .addItem('📊 Count Products Ready for Extraction', 'countProductsReadyForExtraction')
    .addSeparator()
    .addItem('▶️ Extract ALL Products with Spec Sheets', 'extractAllProducts')
    .addItem('🎯 Extract Selected Rows', 'extractSelectedRows')
    .addItem('🔢 Extract Specific Range', 'extractRangeDialog')
    .addSeparator()
    .addItem('⚙️ Settings', 'showSettings')
    .addItem('ℹ️ Help', 'showHelp')
    .addToUi();

  Logger.log('✅ Menu added! Refresh the page to see "🤖 AI Extraction" menu.');
  SpreadsheetApp.getActiveSpreadsheet().toast('Menu added! Refresh the page.', '✅ Success', 5);
}

/**
 * Auto-add menu when spreadsheet opens
 */
function onOpen() {
  setupMenu();
}

/**
 * Show help dialog
 */
function showHelp() {
  const ui = SpreadsheetApp.getUi();
  const helpText = `
🤖 BULK AI EXTRACTION FOR TOILETS

This tool extracts product specifications from spec sheet PDFs using AI.

FEATURES:
✅ Extracts from both text-based PDFs (PARISI format)
✅ Extracts from technical drawing PDFs (Fienza/RAK format) using Vision API
✅ Auto-detects sparse-text PDFs and uses Vision API fallback
✅ Skips products that are already extracted
✅ Processes in batches to avoid timeouts

WHAT IT EXTRACTS:
- Installation Type (Close Coupled, Back to Wall, Wall Hung)
- Trap Type (P-Trap, S-Trap)
- Flush Type (Dual Flush, Single Flush)
- Seat Type (Soft Close, Standard)
- Pan Dimensions (height, width, depth)
- Rim Design (Rimless, Standard)
- WELS Rating
- Model Name
- Overall Dimensions

USAGE:
1. Use "Count Products" to see how many need extraction
2. Use "Extract ALL" to process all products with spec sheets
3. Or select specific rows and use "Extract Selected Rows"

COST:
- Text PDFs: ~$0.001 per product (GPT-4o)
- Technical drawing PDFs: ~$0.01 per product (GPT-4o Vision)
- Average: ~$0.005 per product

PROCESSING TIME:
- ~10-15 seconds per product (including Vision API for drawings)
- Batches of 5 products with 65-second delays between batches
- Example: 100 products = ~30-40 minutes total
  `.trim();

  ui.alert('Help - Bulk AI Extraction', helpText, ui.ButtonSet.OK);
}

// ============================================================================
// MAIN EXTRACTION FUNCTIONS
// ============================================================================

/**
 * Count how many products have spec sheets and are ready for extraction
 */
function countProductsReadyForExtraction() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    SpreadsheetApp.getUi().alert('No data found in sheet.');
    return;
  }

  const specSheetColumn = sheet.getRange(2, TOILETS_COLUMNS.SPEC_SHEET, lastRow - 1, 1).getValues();
  const installationTypeColumn = sheet.getRange(2, TOILETS_COLUMNS.INSTALLATION_TYPE, lastRow - 1, 1).getValues();

  let withSpecSheet = 0;
  let withoutSpecSheet = 0;
  let alreadyExtracted = 0;

  for (let i = 0; i < specSheetColumn.length; i++) {
    const specSheet = specSheetColumn[i][0];
    const installationType = installationTypeColumn[i][0];

    if (specSheet && specSheet.toString().trim() !== '') {
      if (installationType && installationType.toString().trim() !== '') {
        alreadyExtracted++;
      } else {
        withSpecSheet++;
      }
    } else {
      withoutSpecSheet++;
    }
  }

  const estimatedCost = (withSpecSheet * 0.005).toFixed(2);
  const estimatedTime = Math.ceil(withSpecSheet / TOILETS_BATCH_SIZE) * (TOILETS_DELAY_BETWEEN_BATCHES / 1000 / 60);

  const message = `
📊 EXTRACTION READINESS REPORT

✅ Products ready for extraction: ${withSpecSheet}
   (have spec sheet but no installation_type)

✓ Products already extracted: ${alreadyExtracted}
   (have installation_type filled)

❌ Products without spec sheets: ${withoutSpecSheet}
   (cannot extract - no PDF)

📈 Total products: ${lastRow - 1}

💰 Estimated cost: $${estimatedCost}
⏱️ Estimated time: ~${estimatedTime} minutes

Would you like to extract the ${withSpecSheet} products that are ready?
  `.trim();

  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Extraction Report',
    message,
    ui.ButtonSet.YES_NO
  );

  if (response == ui.Button.YES && withSpecSheet > 0) {
    extractAllProducts();
  }
}

/**
 * Extract ALL products that have spec sheets but haven't been extracted yet
 */
function extractAllProducts() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    SpreadsheetApp.getUi().alert('No data found in sheet.');
    return;
  }

  // Get all spec sheets and installation types
  const specSheetColumn = sheet.getRange(2, TOILETS_COLUMNS.SPEC_SHEET, lastRow - 1, 1).getValues();
  const installationTypeColumn = sheet.getRange(2, TOILETS_COLUMNS.INSTALLATION_TYPE, lastRow - 1, 1).getValues();

  // Find rows with spec sheets but no installation_type (not yet extracted)
  const rowsToExtract = [];
  for (let i = 0; i < specSheetColumn.length; i++) {
    const specSheet = specSheetColumn[i][0];
    const installationType = installationTypeColumn[i][0];
    const rowNum = i + 2; // +2 because arrays are 0-indexed and data starts at row 2

    if (specSheet && specSheet.toString().trim() !== '') {
      if (!installationType || installationType.toString().trim() === '') {
        rowsToExtract.push(rowNum);
      }
    }
  }

  if (rowsToExtract.length === 0) {
    SpreadsheetApp.getUi().alert('No products found that need extraction. All products with spec sheets have already been extracted!');
    return;
  }

  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Confirm Bulk Extraction',
    `Found ${rowsToExtract.length} products to extract.\n\nThis will take approximately ${Math.ceil(rowsToExtract.length / TOILETS_BATCH_SIZE) * (TOILETS_DELAY_BETWEEN_BATCHES / 1000 / 60)} minutes.\n\nContinue?`,
    ui.ButtonSet.YES_NO
  );

  if (response != ui.Button.YES) {
    return;
  }

  processBulkExtraction(rowsToExtract);
}

/**
 * Extract only selected rows
 */
function extractSelectedRows() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const selection = sheet.getActiveRange();

  if (!selection) {
    SpreadsheetApp.getUi().alert('Please select rows to extract first.');
    return;
  }

  const startRow = selection.getRow();
  const numRows = selection.getNumRows();

  // Get row numbers (skip header row 1)
  const rowsToExtract = [];
  for (let i = 0; i < numRows; i++) {
    const rowNum = startRow + i;
    if (rowNum > 1) { // Skip header
      rowsToExtract.push(rowNum);
    }
  }

  if (rowsToExtract.length === 0) {
    SpreadsheetApp.getUi().alert('No valid rows selected (header row excluded).');
    return;
  }

  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Confirm Extraction',
    `Extract ${rowsToExtract.length} selected row(s)?\n\nRows: ${rowsToExtract.join(', ')}`,
    ui.ButtonSet.YES_NO
  );

  if (response != ui.Button.YES) {
    return;
  }

  processBulkExtraction(rowsToExtract);
}

/**
 * Show dialog to enter a specific range
 */
function extractRangeDialog() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();

  const response = ui.prompt(
    'Extract Specific Range',
    `Enter row range to extract (e.g., "2-50"):\n\nSheet has ${lastRow} rows (including header).`,
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() != ui.Button.OK) {
    return;
  }

  const input = response.getResponseText().trim();
  const match = input.match(/^(\d+)-(\d+)$/);

  if (!match) {
    ui.alert('❌ Invalid format. Please use format: 2-50');
    return;
  }

  const startRow = parseInt(match[1]);
  const endRow = parseInt(match[2]);

  // Validate
  if (startRow < 2 || endRow < startRow || endRow > lastRow) {
    ui.alert(`❌ Invalid range. Must be between 2 and ${lastRow}, with start <= end.`);
    return;
  }

  const rowsToExtract = [];
  for (let i = startRow; i <= endRow; i++) {
    rowsToExtract.push(i);
  }

  const confirmResponse = ui.alert(
    'Confirm Extraction',
    `Extract rows ${startRow}-${endRow} (${rowsToExtract.length} products)?\n\nEstimated time: ~${Math.ceil(rowsToExtract.length / TOILETS_BATCH_SIZE) * (TOILETS_DELAY_BETWEEN_BATCHES / 1000 / 60)} minutes`,
    ui.ButtonSet.YES_NO
  );

  if (confirmResponse != ui.Button.YES) {
    return;
  }

  processBulkExtraction(rowsToExtract);
}

// ============================================================================
// CORE PROCESSING LOGIC
// ============================================================================

/**
 * Process bulk extraction for given rows
 */
function processBulkExtraction(rowNumbers) {
  const startTime = new Date();
  const totalRows = rowNumbers.length;

  Logger.log(`🚀 Starting bulk extraction for ${totalRows} rows`);
  SpreadsheetApp.getActiveSpreadsheet().toast(`Starting extraction of ${totalRows} products...`, '🚀 Processing', 5);

  const results = {
    total: totalRows,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  // Process in batches
  for (let i = 0; i < rowNumbers.length; i += TOILETS_BATCH_SIZE) {
    const batchRows = rowNumbers.slice(i, i + TOILETS_BATCH_SIZE);
    const batchNum = Math.floor(i / TOILETS_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(rowNumbers.length / TOILETS_BATCH_SIZE);

    Logger.log(`📦 Processing batch ${batchNum}/${totalBatches}: rows ${batchRows.join(', ')}`);
    SpreadsheetApp.getActiveSpreadsheet().toast(
      `Batch ${batchNum}/${totalBatches}: Extracting rows ${batchRows.join(', ')}`,
      '⏳ Processing',
      10
    );

    // Call API with batch
    try {
      const batchResult = callBulkExtractionAPI(batchRows);

      // Update results
      results.succeeded += batchResult.summary.successful || 0;
      results.failed += batchResult.summary.failed || 0;
      results.skipped += batchResult.summary.skipped || 0;

      // Log errors
      if (batchResult.results) {
        batchResult.results.forEach(r => {
          if (!r.success && r.error) {
            results.errors.push(`Row ${r.row_num}: ${r.error}`);
          }
        });
      }

      Logger.log(`✅ Batch ${batchNum} complete: ${batchResult.summary.successful} succeeded, ${batchResult.summary.failed} failed`);

    } catch (error) {
      Logger.log(`❌ Batch ${batchNum} error: ${error.message}`);
      results.failed += batchRows.length;
      results.errors.push(`Batch ${batchNum}: ${error.message}`);
    }

    // Delay between batches (but not after the last batch)
    if (i + TOILETS_BATCH_SIZE < rowNumbers.length) {
      const delaySeconds = TOILETS_DELAY_BETWEEN_BATCHES / 1000;
      Logger.log(`⏸️ Waiting ${delaySeconds}s before next batch...`);
      SpreadsheetApp.getActiveSpreadsheet().toast(
        `Waiting ${delaySeconds}s before next batch... (${batchNum}/${totalBatches} complete)`,
        '⏸️ Paused',
        5
      );
      Utilities.sleep(TOILETS_DELAY_BETWEEN_BATCHES);
    }
  }

  const endTime = new Date();
  const durationMinutes = ((endTime - startTime) / 1000 / 60).toFixed(1);

  // Show final results
  const message = `
✅ BULK EXTRACTION COMPLETE

Total: ${results.total}
✓ Succeeded: ${results.succeeded}
✗ Failed: ${results.failed}
⏭️ Skipped: ${results.skipped}

⏱️ Time: ${durationMinutes} minutes

${results.errors.length > 0 ? '\n⚠️ Errors:\n' + results.errors.slice(0, 5).join('\n') : ''}
${results.errors.length > 5 ? `\n... and ${results.errors.length - 5} more errors (check logs)` : ''}
  `.trim();

  Logger.log('='.repeat(80));
  Logger.log(message);
  Logger.log('='.repeat(80));

  SpreadsheetApp.getUi().alert('Extraction Complete', message, SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * Call the bulk extraction API
 */
function callBulkExtractionAPI(rowNumbers) {
  const url = `${API_BASE_URL}/api/${COLLECTION_NAME}/process/extract`;

  const payload = {
    selected_rows: rowNumbers,
    overwrite_mode: true
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  Logger.log(`📡 Calling API: ${url}`);
  Logger.log(`📦 Payload: ${JSON.stringify(payload)}`);

  const response = UrlFetchApp.fetch(url, options);
  const statusCode = response.getResponseCode();
  const responseText = response.getContentText();

  Logger.log(`📥 Response status: ${statusCode}`);

  if (statusCode !== 200) {
    throw new Error(`API error (${statusCode}): ${responseText}`);
  }

  const result = JSON.parse(responseText);

  if (!result.success) {
    throw new Error(result.message || 'Unknown error');
  }

  return result;
}

/**
 * Show settings dialog
 */
function showSettings() {
  const ui = SpreadsheetApp.getUi();
  const settings = `
⚙️ CURRENT SETTINGS

API URL: ${API_BASE_URL}
Collection: ${COLLECTION_NAME}

Batch size: ${TOILETS_BATCH_SIZE} products
Delay between batches: ${TOILETS_DELAY_BETWEEN_BATCHES / 1000}s
Delay between requests: ${TOILETS_DELAY_BETWEEN_REQUESTS / 1000}s

To modify settings, edit the script configuration.
  `.trim();

  ui.alert('Settings', settings, ui.ButtonSet.OK);
}
