/**
 * BULK AI EXTRACTION FOR BATHS - Google Apps Script
 *
 * This script enables bulk AI extraction for the Baths collection.
 * Extracts product specifications from PDF spec sheets and populates the Google Sheet.
 *
 * SETUP INSTRUCTIONS:
 * 1. Open your Baths Raw_Data Google Sheet
 * 2. Go to Extensions → Apps Script
 * 3. Create a new script file and paste this code
 * 4. Update API_BASE_URL below if needed (defaults to PythonAnywhere)
 * 5. Run setupMenu() once to add the menu
 * 6. Use the "Bulk AI Extraction" menu to extract products
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_BASE_URL = 'https://cassbrothers.pythonanywhere.com';
const COLLECTION_NAME = 'baths';

// Column numbers in BATHS sheet (1-indexed) - matches BathsCollection column_mapping
const BATHS_COLUMNS = {
  URL: 1,                    // Column A - supplier_url (not used for extraction)
  VARIANT_SKU: 2,            // Column B - variant_sku
  KEY: 3,                    // Column C
  ID: 4,                     // Column D
  HANDLE: 5,                 // Column E
  TITLE: 6,                  // Column F
  VENDOR: 7,                 // Column G
  BRAND: 8,                  // Column H - brand_name
  INSTALLATION_TYPE: 9,      // Column I - AI extracts this
  PRODUCT_MATERIAL: 10,      // Column J - AI extracts this
  GRADE_OF_MATERIAL: 11,     // Column K - AI extracts this
  STYLE: 12,                 // Column L - AI extracts this
  WARRANTY_YEARS: 13,        // Column M - AI extracts this
  WASTE_OUTLET: 14,          // Column N - AI extracts this
  HAS_OVERFLOW: 15,          // Column O - AI extracts this
  LENGTH_MM: 16,             // Column P - AI extracts this
  WIDTH_MM: 17,              // Column Q - AI extracts this
  DEPTH_MM: 18,              // Column R - AI extracts this
  APPLICATION_LOCATION: 19,  // Column S - AI extracts this
  SPEC_SHEET: 32,            // Column AF - shopify_spec_sheet (PDF URLs - USED for extraction)
};

// ============================================================================
// MENU SETUP
// ============================================================================

function setupMenu() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🛁 Bulk AI Extraction')
    .addItem('📊 Count Products Ready', 'countProductsReady')
    .addSeparator()
    .addItem('▶️ Extract Selected Rows', 'extractSelectedRows')
    .addItem('🔢 Extract Range', 'extractRangeDialog')
    .addItem('🌐 Extract ALL Products', 'extractAllProducts')
    .addSeparator()
    .addItem('⚙️ Settings', 'showSettings')
    .addToUi();

  Logger.log('✅ Bulk AI Extraction menu added!');
  SpreadsheetApp.getActiveSpreadsheet().toast('Menu added! Refresh the page.', '✅ Success', 5);
}

function onOpen() {
  setupMenu();
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

function countProductsReady() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    SpreadsheetApp.getUi().alert('No data found in sheet.');
    return;
  }

  const specSheetColumn = sheet.getRange(2, BATHS_COLUMNS.SPEC_SHEET, lastRow - 1, 1).getValues();
  const installationTypeColumn = sheet.getRange(2, BATHS_COLUMNS.INSTALLATION_TYPE, lastRow - 1, 1).getValues();

  let withSpecSheet = 0;
  let alreadyExtracted = 0;
  let noSpecSheet = 0;

  for (let i = 0; i < specSheetColumn.length; i++) {
    const specSheet = specSheetColumn[i][0];
    const installationType = installationTypeColumn[i][0];

    if (!specSheet || specSheet.toString().trim() === '') {
      noSpecSheet++;
    } else if (installationType && installationType.toString().trim() !== '') {
      alreadyExtracted++;
    } else {
      withSpecSheet++;
    }
  }

  const totalProducts = lastRow - 1;
  const estimatedCost = (withSpecSheet * 0.10).toFixed(2);
  const estimatedTime = Math.ceil(withSpecSheet * 0.5);

  const message = `
📊 EXTRACTION READINESS

Ready to extract: ${withSpecSheet}
Already extracted: ${alreadyExtracted}
No spec sheet: ${noSpecSheet}
Total products: ${totalProducts}

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

function extractAllProducts() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    SpreadsheetApp.getUi().alert('No data found in sheet.');
    return;
  }

  // Get all spec sheets and installation types
  const specSheetColumn = sheet.getRange(2, BATHS_COLUMNS.SPEC_SHEET, lastRow - 1, 1).getValues();
  const installationTypeColumn = sheet.getRange(2, BATHS_COLUMNS.INSTALLATION_TYPE, lastRow - 1, 1).getValues();

  // Find rows with spec sheets but no installation_type (not yet extracted)
  const rowsToExtract = [];
  for (let i = 0; i < specSheetColumn.length; i++) {
    const specSheet = specSheetColumn[i][0];
    const installationType = installationTypeColumn[i][0];
    const rowNum = i + 2; // +2 because arrays are 0-indexed and data starts at row 2

    if (specSheet && specSheet.toString().trim() !== '' &&
        (!installationType || installationType.toString().trim() === '')) {
      rowsToExtract.push(rowNum);
    }
  }

  if (rowsToExtract.length === 0) {
    SpreadsheetApp.getUi().alert('No products need extraction. All products either lack spec sheets or have already been extracted.');
    return;
  }

  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Bulk Extraction',
    `Extract AI data for ${rowsToExtract.length} baths?\n\nThis will process all rows with spec sheets that haven't been extracted yet.\n\nEstimated time: ${Math.ceil(rowsToExtract.length * 0.5)} minutes`,
    ui.ButtonSet.YES_NO
  );

  if (response == ui.Button.YES) {
    bulkExtractRows(rowsToExtract);
  }
}

function extractSelectedRows() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const selection = sheet.getActiveRange();

  if (!selection) {
    SpreadsheetApp.getUi().alert('Please select rows first.');
    return;
  }

  const startRow = selection.getRow();
  const numRows = selection.getNumRows();

  // Skip header row
  if (startRow === 1) {
    SpreadsheetApp.getUi().alert('Please select data rows (not the header row).');
    return;
  }

  const rowsToExtract = [];
  for (let i = 0; i < numRows; i++) {
    rowsToExtract.push(startRow + i);
  }

  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Extract Selected Rows',
    `Extract AI data for ${rowsToExtract.length} selected row(s)?\n\nRows: ${rowsToExtract.join(', ')}\n\nEstimated time: ${Math.ceil(rowsToExtract.length * 0.5)} minutes`,
    ui.ButtonSet.YES_NO
  );

  if (response == ui.Button.YES) {
    bulkExtractRows(rowsToExtract);
  }
}

function extractRangeDialog() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Extract Range',
    'Enter row range (e.g., "2-50"):',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const input = response.getResponseText().trim();
  const parts = input.split('-');
  const start = parseInt(parts[0]);
  const end = parseInt(parts[1]);

  if (isNaN(start) || isNaN(end) || start < 2) {
    ui.alert('Invalid format. Use: 2-50 (data rows only, not header)');
    return;
  }

  const rowsToExtract = [];
  for (let i = start; i <= end; i++) {
    rowsToExtract.push(i);
  }

  bulkExtractRows(rowsToExtract);
}

// ============================================================================
// BULK EXTRACTION LOGIC
// ============================================================================

function bulkExtractRows(rowNumbers) {
  const startTime = new Date();

  Logger.log('🚀 Starting bulk extraction for ' + rowNumbers.length + ' rows');
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Starting bulk extraction for ' + rowNumbers.length + ' baths...',
    '🔄 Extracting',
    5
  );

  // Process in batches of 5 with delays
  const BATCH_SIZE = 5;
  const DELAY_SECONDS = 65;

  let totalSucceeded = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (let i = 0; i < rowNumbers.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = rowNumbers.slice(i, i + BATCH_SIZE);

    Logger.log(`\n📦 Batch ${batchNum}: Rows ${batch.join(', ')}`);

    try {
      const result = callBulkExtractionAPI(batch);

      if (result && result.summary) {
        totalSucceeded += result.summary.successful || 0;
        totalFailed += result.summary.failed || 0;
        totalSkipped += result.summary.skipped || 0;

        Logger.log(`✅ Batch ${batchNum}: ${result.summary.successful} succeeded, ${result.summary.failed} failed, ${result.summary.skipped} skipped`);
      }

      // Show progress
      SpreadsheetApp.getActiveSpreadsheet().toast(
        `Batch ${batchNum} complete. Processed ${i + batch.length}/${rowNumbers.length}`,
        '⏳ Progress',
        3
      );

      // Delay between batches (except for last batch)
      if (i + BATCH_SIZE < rowNumbers.length) {
        Logger.log(`⏸️ Waiting ${DELAY_SECONDS} seconds before next batch...`);
        Utilities.sleep(DELAY_SECONDS * 1000);
      }

    } catch (error) {
      Logger.log(`❌ Batch ${batchNum} error: ${error}`);
      totalFailed += batch.length;
    }
  }

  const duration = Math.round((new Date() - startTime) / 1000 / 60);

  const message = `
🎉 Extraction Complete!

Total: ${rowNumbers.length}
✓ Succeeded: ${totalSucceeded}
✗ Failed: ${totalFailed}
⏭️ Skipped: ${totalSkipped}

⏱️ Duration: ${duration} minutes
  `.trim();

  Logger.log(message);
  SpreadsheetApp.getUi().alert('Bulk Extraction Complete', message, SpreadsheetApp.getUi().ButtonSet.OK);
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

// ============================================================================
// SETTINGS
// ============================================================================

function showSettings() {
  const ui = SpreadsheetApp.getUi();

  const message = `
⚙️ BULK AI EXTRACTION SETTINGS

API Endpoint: ${API_BASE_URL}
Collection: ${COLLECTION_NAME}

Column Mappings:
  Spec Sheet: Column AF (${BATHS_COLUMNS.SPEC_SHEET})
  Installation Type: Column I (${BATHS_COLUMNS.INSTALLATION_TYPE})
  Material: Column J (${BATHS_COLUMNS.PRODUCT_MATERIAL})
  Style: Column L (${BATHS_COLUMNS.STYLE})

Batch Size: 5 products per batch
Delay: 65 seconds between batches

To change settings, edit the script.
  `.trim();

  ui.alert('Settings', message, ui.ButtonSet.OK);
}
