/**
 * BULK AI EXTRACTION - Google Apps Script
 *
 * This script runs AI extraction on multiple products in bulk directly from Google Sheets.
 * It automatically handles rate limiting and batching to avoid quota issues.
 *
 * SETUP INSTRUCTIONS:
 * 1. Open your Google Sheet (Taps Raw_Data)
 * 2. Go to Extensions → Apps Script
 * 3. Create a new script file and paste this code
 * 4. Update the API_BASE_URL to your server URL (localhost or PythonAnywhere)
 * 5. Run setupMenu() once to add the menu
 * 6. Use the "AI Extraction" menu to start bulk extraction
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

// IMPORTANT: Update this to your server URL
const API_BASE_URL = 'https://cassbrothers.pythonanywhere.com'; // For production
// const API_BASE_URL = 'http://127.0.0.1:8000'; // For local testing (won't work from Google Sheets due to CORS)

const COLLECTION_NAME = 'taps'; // Change to 'sinks', 'taps', etc.
const BATCH_SIZE = 5; // Process 5 products at a time
const DELAY_BETWEEN_BATCHES = 65000; // 65 seconds delay to avoid quota limits (60 sec + 5 sec buffer)
const DELAY_BETWEEN_REQUESTS = 8000; // 8 seconds between individual requests

// Column numbers (1-indexed)
// Based on TapsCollection config from config/collections.py
const COLUMNS = {
  URL: 1,              // Column A (supplier_url)
  SKU: 2,              // Column B (variant_sku)
  TITLE: 6,            // Column F (title)
  BRAND: 8,            // Column H (brand_name)
  COLOUR_FINISH: 12,   // Column L (colour_finish) - AI extracted field
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
    .addItem('▶️ Extract ALL Products with URLs', 'extractAllProducts')
    .addItem('🎯 Extract Selected Rows', 'extractSelectedRows')
    .addItem('🔢 Extract Specific Range', 'extractRangeDialog')
    .addSeparator()
    .addItem('⚙️ Settings', 'showSettings')
    .addToUi();

  Logger.log('✅ Menu added! Refresh the page to see "AI Extraction" menu.');
  SpreadsheetApp.getActiveSpreadsheet().toast('Menu added! Refresh the page.', '✅ Success', 5);
}

/**
 * Auto-add menu when spreadsheet opens
 */
function onOpen() {
  setupMenu();
}

// ============================================================================
// MAIN EXTRACTION FUNCTIONS
// ============================================================================

/**
 * Count how many products have URLs and are ready for extraction
 */
function countProductsReadyForExtraction() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    SpreadsheetApp.getUi().alert('No data found in sheet.');
    return;
  }

  const urlColumn = sheet.getRange(2, COLUMNS.URL, lastRow - 1, 1).getValues();
  const colourFinishColumn = sheet.getRange(2, COLUMNS.COLOUR_FINISH, lastRow - 1, 1).getValues();

  let withURL = 0;
  let withoutURL = 0;
  let alreadyExtracted = 0;

  for (let i = 0; i < urlColumn.length; i++) {
    const url = urlColumn[i][0];
    const colourFinish = colourFinishColumn[i][0];

    if (url && url.toString().trim() !== '') {
      if (colourFinish && colourFinish.toString().trim() !== '') {
        alreadyExtracted++;
      } else {
        withURL++;
      }
    } else {
      withoutURL++;
    }
  }

  const message = `
📊 EXTRACTION READINESS REPORT

Products with URL ready for extraction: ${withURL}
Products already extracted (have brand): ${alreadyExtracted}
Products without URL (cannot extract): ${withoutURL}

Total products: ${lastRow - 1}

Would you like to extract the ${withURL} products that are ready?
  `.trim();

  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Extraction Report',
    message,
    ui.ButtonSet.YES_NO
  );

  if (response == ui.Button.YES) {
    extractAllProducts();
  }
}

/**
 * Extract ALL products that have URLs
 */
function extractAllProducts() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    SpreadsheetApp.getUi().alert('No data found in sheet.');
    return;
  }

  // Get all URLs
  const urlColumn = sheet.getRange(2, COLUMNS.URL, lastRow - 1, 1).getValues();
  const colourFinishColumn = sheet.getRange(2, COLUMNS.COLOUR_FINISH, lastRow - 1, 1).getValues();

  // Find rows with URLs but no colour_finish (not yet extracted)
  const rowsToExtract = [];
  for (let i = 0; i < urlColumn.length; i++) {
    const url = urlColumn[i][0];
    const colourFinish = colourFinishColumn[i][0];
    const rowNum = i + 2; // +2 because arrays are 0-indexed and we start from row 2

    if (url && url.toString().trim() !== '' && (!colourFinish || colourFinish.toString().trim() === '')) {
      rowsToExtract.push(rowNum);
    }
  }

  if (rowsToExtract.length === 0) {
    SpreadsheetApp.getUi().alert('No products found that need extraction.\n\nAll products either have no URL or have already been extracted.');
    return;
  }

  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Bulk AI Extraction',
    'Ready to extract ' + rowsToExtract.length + ' products.\n\n' +
    'This will process ' + BATCH_SIZE + ' products at a time with ' + (DELAY_BETWEEN_BATCHES/1000) + 's delays between batches.\n\n' +
    'Estimated time: ' + Math.ceil(rowsToExtract.length / BATCH_SIZE) * (DELAY_BETWEEN_BATCHES/1000/60) + ' minutes\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );

  if (response == ui.Button.YES) {
    bulkExtract(rowsToExtract);
  }
}

/**
 * Extract selected rows only
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

  if (startRow === 1) {
    SpreadsheetApp.getUi().alert('Cannot extract header row. Please select data rows (row 2 and below).');
    return;
  }

  const rowsToExtract = [];
  for (let i = 0; i < numRows; i++) {
    rowsToExtract.push(startRow + i);
  }

  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Extract Selected Rows',
    'Extract ' + rowsToExtract.length + ' selected rows?\n\nRows: ' + rowsToExtract.join(', '),
    ui.ButtonSet.YES_NO
  );

  if (response == ui.Button.YES) {
    bulkExtract(rowsToExtract);
  }
}

/**
 * Extract specific range via dialog
 */
function extractRangeDialog() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Extract Range',
    'Enter row range to extract (e.g., "2-50" or "10,15,20,25"):',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const input = response.getResponseText().trim();
  const rowsToExtract = parseRowRange(input);

  if (rowsToExtract.length === 0) {
    ui.alert('Invalid range format. Examples:\n\n"2-50" for rows 2 to 50\n"10,15,20" for specific rows');
    return;
  }

  var rowsPreview = rowsToExtract.slice(0, 10).join(', ');
  if (rowsToExtract.length > 10) {
    rowsPreview += '...';
  }

  const confirmResponse = ui.alert(
    'Confirm Extraction',
    'Extract ' + rowsToExtract.length + ' rows?\n\nRows: ' + rowsPreview,
    ui.ButtonSet.YES_NO
  );

  if (confirmResponse == ui.Button.YES) {
    bulkExtract(rowsToExtract);
  }
}

/**
 * Parse row range input (e.g., "2-50" or "10,15,20")
 */
function parseRowRange(input) {
  const rows = [];

  if (input.includes('-')) {
    // Range format: "2-50"
    const parts = input.split('-');
    const start = parseInt(parts[0]);
    const end = parseInt(parts[1]);

    if (isNaN(start) || isNaN(end) || start < 2 || end < start) {
      return [];
    }

    for (let i = start; i <= end; i++) {
      rows.push(i);
    }
  } else if (input.includes(',')) {
    // Comma-separated: "10,15,20"
    const parts = input.split(',');
    for (const part of parts) {
      const num = parseInt(part.trim());
      if (!isNaN(num) && num >= 2) {
        rows.push(num);
      }
    }
  } else {
    // Single number
    const num = parseInt(input);
    if (!isNaN(num) && num >= 2) {
      rows.push(num);
    }
  }

  return rows;
}

// ============================================================================
// BULK EXTRACTION LOGIC
// ============================================================================

/**
 * Main bulk extraction function
 * Processes rows in batches with rate limiting
 */
function bulkExtract(rowNumbers) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const startTime = new Date();

  Logger.log(`🚀 Starting bulk extraction for ${rowNumbers.length} rows`);
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `Starting extraction for ${rowNumbers.length} products...`,
    '🤖 AI Extraction Started',
    5
  );

  const results = {
    total: rowNumbers.length,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  // Process in batches
  for (let i = 0; i < rowNumbers.length; i += BATCH_SIZE) {
    const batch = rowNumbers.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(rowNumbers.length / BATCH_SIZE);

    Logger.log(`📦 Processing batch ${batchNum}/${totalBatches}: Rows ${batch.join(', ')}`);
    SpreadsheetApp.getActiveSpreadsheet().toast(
      `Processing batch ${batchNum}/${totalBatches} (${results.succeeded} succeeded, ${results.failed} failed)`,
      '⏳ Extracting...',
      5
    );

    // Process each row in the batch
    for (const rowNum of batch) {
      try {
        const result = extractSingleProduct(rowNum);

        if (result.success) {
          results.succeeded++;
          Logger.log(`✅ Row ${rowNum}: Success`);
        } else {
          results.failed++;
          results.errors.push({row: rowNum, error: result.error});
          Logger.log(`❌ Row ${rowNum}: ${result.error}`);
        }

        // Small delay between individual requests
        if (batch.indexOf(rowNum) < batch.length - 1) {
          Utilities.sleep(DELAY_BETWEEN_REQUESTS);
        }

      } catch (error) {
        results.failed++;
        results.errors.push({row: rowNum, error: error.toString()});
        Logger.log(`❌ Row ${rowNum}: Exception - ${error}`);
      }
    }

    // Delay between batches (except after last batch)
    if (i + BATCH_SIZE < rowNumbers.length) {
      const remainingBatches = totalBatches - batchNum;
      Logger.log(`⏸️ Batch ${batchNum} complete. Waiting ${DELAY_BETWEEN_BATCHES/1000}s before next batch (${remainingBatches} batches remaining)...`);
      SpreadsheetApp.getActiveSpreadsheet().toast(
        `Batch ${batchNum}/${totalBatches} complete. Waiting ${DELAY_BETWEEN_BATCHES/1000}s to avoid rate limits...\n\n${results.succeeded} succeeded, ${results.failed} failed`,
        '⏸️ Waiting...',
        10
      );
      Utilities.sleep(DELAY_BETWEEN_BATCHES);
    }
  }

  // Final results
  const endTime = new Date();
  const durationMinutes = Math.round((endTime - startTime) / 1000 / 60);

  Logger.log('🎉 Bulk extraction complete!');
  Logger.log(`   Total: ${results.total}, Succeeded: ${results.succeeded}, Failed: ${results.failed}`);
  Logger.log(`   Duration: ${durationMinutes} minutes`);

  let errorReport = '';
  if (results.errors.length > 0) {
    errorReport = '\n\nErrors:\n' + results.errors.slice(0, 5).map(e => `Row ${e.row}: ${e.error}`).join('\n');
    if (results.errors.length > 5) {
      errorReport += `\n... and ${results.errors.length - 5} more errors`;
    }
  }

  SpreadsheetApp.getUi().alert(
    '🎉 Bulk Extraction Complete',
    'Processed ' + results.total + ' products in ' + durationMinutes + ' minutes\n\n' +
    '✅ Succeeded: ' + results.succeeded + '\n' +
    '❌ Failed: ' + results.failed + '\n' +
    '⏭️ Skipped: ' + results.skipped +
    errorReport
  );
}

/**
 * Extract a single product
 * Calls the Flask API endpoint for single product extraction
 */
function extractSingleProduct(rowNum) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    // Get product URL
    const url = sheet.getRange(rowNum, COLUMNS.URL).getValue();

    if (!url || url.toString().trim() === '') {
      return {success: false, error: 'No URL found'};
    }

    // Call Flask API endpoint for single product extraction
    // Add cache-busting parameter to force fresh data from Google Sheets
    const apiUrl = API_BASE_URL + '/api/' + COLLECTION_NAME + '/products/' + rowNum + '/extract';

    Logger.log('🔄 Extracting row ' + rowNum + ': ' + apiUrl);

    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        force_refresh: true  // Force server to refresh from Google Sheets
      }),
      muteHttpExceptions: true,
      followRedirects: true
    };

    const response = UrlFetchApp.fetch(apiUrl, options);
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();

    Logger.log(`📡 Response ${statusCode}: ${responseText.substring(0, 200)}`);

    if (statusCode === 200) {
      const data = JSON.parse(responseText);

      if (data.success) {
        // Mark row with extraction timestamp
        sheet.getRange(rowNum, sheet.getLastColumn() + 1).setValue(new Date());
        return {success: true};
      } else {
        return {success: false, error: data.message || data.error || 'Unknown error'};
      }
    } else if (statusCode === 400) {
      // Client error (e.g., 404 URL, no content)
      const data = JSON.parse(responseText);
      return {success: false, error: data.message || 'Client error'};
    } else {
      return {success: false, error: `HTTP ${statusCode}`};
    }

  } catch (error) {
    Logger.log(`❌ Exception in extractSingleProduct: ${error}`);
    return {success: false, error: error.toString()};
  }
}

// ============================================================================
// SETTINGS
// ============================================================================

function showSettings() {
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    '⚙️ Bulk AI Extraction Settings',
    'Current Configuration:\n\n' +
    'API URL: ' + API_BASE_URL + '\n' +
    'Collection: ' + COLLECTION_NAME + '\n' +
    'Batch Size: ' + BATCH_SIZE + ' products\n' +
    'Delay Between Batches: ' + (DELAY_BETWEEN_BATCHES/1000) + ' seconds\n' +
    'Delay Between Requests: ' + (DELAY_BETWEEN_REQUESTS/1000) + ' seconds\n\n' +
    'To change these settings, edit the CONFIGURATION section at the top of the script.',
    ui.ButtonSet.OK
  );
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Test function - extracts a single row for testing
 */
function testExtractSingleRow() {
  const result = extractSingleProduct(7); // Test with row 7
  Logger.log('Test result:', JSON.stringify(result));
  SpreadsheetApp.getActiveSpreadsheet().toast(
    JSON.stringify(result),
    '🧪 Test Result',
    5
  );
}
