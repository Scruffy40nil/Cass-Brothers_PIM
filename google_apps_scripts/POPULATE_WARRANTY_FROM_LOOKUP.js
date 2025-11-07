/**
 * POPULATE WARRANTY FROM LOOKUP - Google Apps Script
 *
 * This script looks up warranty years from the "Warranty" worksheet
 * and populates them into the Taps Raw_Data sheet based on brand name.
 *
 * SETUP INSTRUCTIONS:
 * 1. Open your Taps Raw_Data Google Sheet
 * 2. Go to Extensions → Apps Script
 * 3. Create a new script file and paste this code
 * 4. Run setupMenu() once to add the menu
 * 5. Use the "Populate Warranty" menu to fill in warranty years
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

// Column numbers in TAPS Raw_Data sheet (1-indexed)
const WARRANTY_COLUMNS = {
  BRAND: 8,            // Column H - brand_name
  WARRANTY_YEARS: 14,  // Column N - warranty_years
};

// Warranty lookup worksheet name
const WARRANTY_SHEET_NAME = 'Warranty';

// Batch processing configuration
const BATCH_SIZE = 100;          // Process 100 rows at a time
const MAX_RETRIES = 3;           // Retry failed operations up to 3 times
const RETRY_DELAY_MS = 2000;     // Wait 2 seconds between retries
const DEBUG_LOGGING = false;     // Set to true to enable detailed logging

// ============================================================================
// MENU SETUP
// ============================================================================

function setupWarrantyMenu() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📋 Populate Warranty')
    .addItem('📊 Count Products Ready', 'countProductsReadyForWarranty')
    .addSeparator()
    .addItem('▶️ Populate ALL Warranties', 'populateAllWarranties')
    .addItem('🔢 Populate Range', 'populateWarrantyRangeDialog')
    .addItem('1️⃣ Populate Single Row', 'populateWarrantySingleRowDialog')
    .addSeparator()
    .addItem('⚙️ View Warranty Data', 'showWarrantyData')
    .addToUi();

  Logger.log('✅ Populate Warranty menu added!');
  SpreadsheetApp.getActiveSpreadsheet().toast('Menu added! Refresh the page.', '✅ Success', 5);
}

function onOpen() {
  setupWarrantyMenu();
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

function countProductsReadyForWarranty() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    SpreadsheetApp.getUi().alert('No data found in sheet.');
    return;
  }

  const brandColumn = sheet.getRange(2, WARRANTY_COLUMNS.BRAND, lastRow - 1, 1).getValues();
  const warrantyColumn = sheet.getRange(2, WARRANTY_COLUMNS.WARRANTY_YEARS, lastRow - 1, 1).getValues();

  let needsWarranty = 0;
  let alreadyHasWarranty = 0;
  let noBrand = 0;

  for (let i = 0; i < brandColumn.length; i++) {
    const brand = brandColumn[i][0];
    const warranty = warrantyColumn[i][0];

    if (!brand || brand.toString().trim() === '') {
      noBrand++;
    } else if (warranty && warranty.toString().trim() !== '') {
      alreadyHasWarranty++;
    } else {
      needsWarranty++;
    }
  }

  const message =
    '📊 WARRANTY POPULATION READINESS\n\n' +
    'Ready for warranty lookup: ' + needsWarranty + '\n' +
    'Already has warranty: ' + alreadyHasWarranty + '\n' +
    'No brand (skipped): ' + noBrand + '\n' +
    'Total: ' + (lastRow - 1) + '\n\n' +
    'Populate warranties for ' + needsWarranty + ' products?';

  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('Warranty Population Report', message, ui.ButtonSet.YES_NO);

  if (response == ui.Button.YES) {
    populateAllWarranties();
  }
}

function populateAllWarranties() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    SpreadsheetApp.getUi().alert('No data found.');
    return;
  }

  const brandColumn = sheet.getRange(2, WARRANTY_COLUMNS.BRAND, lastRow - 1, 1).getValues();
  const warrantyColumn = sheet.getRange(2, WARRANTY_COLUMNS.WARRANTY_YEARS, lastRow - 1, 1).getValues();

  const rowsToPopulate = [];
  for (let i = 0; i < brandColumn.length; i++) {
    const brand = brandColumn[i][0];
    const warranty = warrantyColumn[i][0];
    const rowNum = i + 2;

    if (brand && brand.toString().trim() !== '' && (!warranty || warranty.toString().trim() === '')) {
      rowsToPopulate.push(rowNum);
    }
  }

  if (rowsToPopulate.length === 0) {
    SpreadsheetApp.getUi().alert('No products need warranty population.');
    return;
  }

  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Bulk Warranty Population',
    'Populate warranties for ' + rowsToPopulate.length + ' products?\n\n' +
    'Est. time: ' + Math.ceil(rowsToPopulate.length * 0.05) + ' minutes',
    ui.ButtonSet.YES_NO
  );

  if (response == ui.Button.YES) {
    bulkWarrantyPopulation(rowsToPopulate);
  }
}

function populateWarrantyRangeDialog() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();

  const response = ui.prompt(
    'Warranty Population Range',
    'Enter row range (e.g., "2-50"):\nMax row: ' + lastRow,
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const input = response.getResponseText().trim();
  const parts = input.split('-');
  const start = parseInt(parts[0]);
  const end = parseInt(parts[1]);

  // Validate input format
  if (isNaN(start) || isNaN(end)) {
    ui.alert('❌ Invalid Format', 'Please use format: 2-50', ui.ButtonSet.OK);
    return;
  }

  // Validate range is not reversed
  if (start > end) {
    ui.alert('❌ Invalid Range', 'Start row (' + start + ') must be <= end row (' + end + ')', ui.ButtonSet.OK);
    return;
  }

  // Validate range is within sheet bounds
  if (start < 2) {
    ui.alert('❌ Invalid Range', 'Start row must be >= 2 (row 1 is headers)', ui.ButtonSet.OK);
    return;
  }

  if (end > lastRow) {
    ui.alert('❌ Invalid Range', 'End row (' + end + ') exceeds sheet last row (' + lastRow + ')', ui.ButtonSet.OK);
    return;
  }

  const rowsToPopulate = [];
  for (let i = start; i <= end; i++) {
    rowsToPopulate.push(i);
  }

  bulkWarrantyPopulation(rowsToPopulate);
}

function populateWarrantySingleRowDialog() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Warranty Population Single Row',
    'Enter row number:',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const rowNum = parseInt(response.getResponseText().trim());

  if (isNaN(rowNum) || rowNum < 2) {
    ui.alert('Invalid row number. Must be 2 or greater.');
    return;
  }

  bulkWarrantyPopulation([rowNum]);
}

// ============================================================================
// WARRANTY LOOKUP LOGIC
// ============================================================================

function bulkWarrantyPopulation(rowNumbers) {
  const tapsSheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const startTime = new Date();

  Logger.log('🚀 Starting warranty population for ' + rowNumbers.length + ' rows');
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Starting warranty population...',
    '📋 Populate Warranty',
    5
  );

  // Load warranty lookup data
  const warrantyData = loadWarrantyData();

  if (!warrantyData) {
    SpreadsheetApp.getUi().alert('❌ Error', 'Could not load warranty data from "' + WARRANTY_SHEET_NAME + '" sheet.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }

  const results = {
    total: rowNumbers.length,
    populated: 0,
    notFound: 0,
    errors: []
  };

  // Process in batches to avoid quota limits and improve performance
  for (let batchStart = 0; batchStart < rowNumbers.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, rowNumbers.length);
    const batchRows = rowNumbers.slice(batchStart, batchEnd);

    if (batchStart > 0) {
      SpreadsheetApp.getActiveSpreadsheet().toast(
        'Progress: ' + batchStart + '/' + rowNumbers.length + ' (' + results.populated + ' populated)',
        '⏳ Processing',
        3
      );
      // Add small delay between batches to avoid rate limiting
      Utilities.sleep(500);
    }

    try {
      const batchResult = processBatchWithRetry(tapsSheet, batchRows, warrantyData);
      results.populated += batchResult.populated;
      results.notFound += batchResult.notFound;
      results.errors = results.errors.concat(batchResult.errors);
    } catch (error) {
      Logger.log('❌ Batch error: ' + error);
      results.errors.push({ row: 'Batch ' + batchStart + '-' + batchEnd, error: error.toString() });
    }
  }

  const duration = Math.round((new Date() - startTime) / 1000);

  Logger.log('🎉 Complete! ' + results.populated + ' populated, ' + results.notFound + ' not found');

  let errorReport = '';
  if (results.errors.length > 0) {
    errorReport = '\n\nErrors:\n' + results.errors.slice(0, 3).map(function (e) {
      return 'Row ' + e.row + ': ' + e.error;
    }).join('\n');
    if (results.errors.length > 3) {
      errorReport += '\n... and ' + (results.errors.length - 3) + ' more';
    }
  }

  SpreadsheetApp.getUi().alert(
    '🎉 Warranty Population Complete',
    'Processed ' + results.total + ' in ' + duration + ' seconds\n\n' +
    '✅ Populated: ' + results.populated + '\n' +
    '⚠️ Not Found: ' + results.notFound + '\n' +
    '❌ Errors: ' + results.errors.length +
    errorReport
  );
}

/**
 * Process a batch of rows with retry logic for transient errors
 */
function processBatchWithRetry(sheet, rowNumbers, warrantyData) {
  let attempt = 0;
  let lastError = null;

  while (attempt < MAX_RETRIES) {
    try {
      return processBatch(sheet, rowNumbers, warrantyData);
    } catch (error) {
      attempt++;
      lastError = error;
      Logger.log('⚠️ Batch attempt ' + attempt + ' failed: ' + error);

      if (attempt < MAX_RETRIES) {
        Logger.log('   Retrying in ' + RETRY_DELAY_MS + 'ms...');
        Utilities.sleep(RETRY_DELAY_MS);
      }
    }
  }

  // All retries failed
  throw new Error('Batch failed after ' + MAX_RETRIES + ' attempts: ' + lastError);
}

/**
 * Process a batch of rows using batched range updates
 */
function processBatch(sheet, rowNumbers, warrantyData) {
  const results = {
    populated: 0,
    notFound: 0,
    errors: []
  };

  // Read all brands for this batch in one operation
  const brands = [];
  for (let i = 0; i < rowNumbers.length; i++) {
    const rowNum = rowNumbers[i];
    try {
      const brand = sheet.getRange(rowNum, WARRANTY_COLUMNS.BRAND).getValue();
      brands.push({ rowNum: rowNum, brand: brand });
    } catch (error) {
      results.errors.push({ row: rowNum, error: 'Failed to read brand: ' + error });
      brands.push({ rowNum: rowNum, brand: null });
    }
  }

  // Look up warranties and prepare batch update
  const updateData = [];
  const updateRows = [];

  for (let i = 0; i < brands.length; i++) {
    const item = brands[i];
    const rowNum = item.rowNum;
    const brand = item.brand;

    if (!brand || brand.toString().trim() === '') {
      results.notFound++;
      if (DEBUG_LOGGING) {
        Logger.log('⚠️ Row ' + rowNum + ': No brand');
      }
      continue;
    }

    const brandStr = brand.toString().trim();
    const brandKey = normalizeBrandKey(brandStr);

    // Look up warranty in map
    if (warrantyData.hasOwnProperty(brandKey)) {
      const warrantyYears = warrantyData[brandKey];
      updateData.push([warrantyYears]);
      updateRows.push(rowNum);
      results.populated++;

      if (DEBUG_LOGGING) {
        Logger.log('✅ Row ' + rowNum + ': Set warranty to ' + warrantyYears + ' years');
      }
    } else {
      results.notFound++;
      if (DEBUG_LOGGING) {
        Logger.log('⚠️ Row ' + rowNum + ': Brand "' + brandStr + '" not found in warranty lookup');
      }
    }
  }

  // Batch write warranties if we have any to write
  if (updateData.length > 0) {
    // Group contiguous rows for efficient batch updates
    const batches = groupContiguousRows(updateRows, updateData);

    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      try {
        // Use setValues for contiguous ranges (much faster than setValue per row)
        if (batch.count === 1) {
          sheet.getRange(batch.startRow, WARRANTY_COLUMNS.WARRANTY_YEARS).setValue(batch.data[0][0]);
        } else {
          sheet.getRange(batch.startRow, WARRANTY_COLUMNS.WARRANTY_YEARS, batch.count, 1).setValues(batch.data);
        }
      } catch (error) {
        // If batch write fails, fall back to individual writes for this batch
        for (let i = 0; i < batch.data.length; i++) {
          try {
            sheet.getRange(batch.startRow + i, WARRANTY_COLUMNS.WARRANTY_YEARS).setValue(batch.data[i][0]);
          } catch (individualError) {
            results.errors.push({ row: batch.startRow + i, error: 'Failed to write warranty: ' + individualError });
            results.populated--;
          }
        }
      }
    }
  }

  return results;
}

/**
 * Group rows into contiguous batches for efficient range updates
 * @param {number[]} rows - Array of row numbers
 * @param {Array[]} data - Corresponding data values
 * @returns {Array} Array of batch objects with {startRow, count, data}
 */
function groupContiguousRows(rows, data) {
  if (rows.length === 0) return [];

  const batches = [];
  let currentBatch = {
    startRow: rows[0],
    count: 1,
    data: [data[0]]
  };

  for (let i = 1; i < rows.length; i++) {
    if (rows[i] === rows[i-1] + 1) {
      // Contiguous - add to current batch
      currentBatch.count++;
      currentBatch.data.push(data[i]);
    } else {
      // Gap - start new batch
      batches.push(currentBatch);
      currentBatch = {
        startRow: rows[i],
        count: 1,
        data: [data[i]]
      };
    }
  }

  // Add final batch
  batches.push(currentBatch);

  return batches;
}

/**
 * Normalize brand name for consistent matching
 * - Converts to lowercase
 * - Trims whitespace
 * - Removes extra spaces
 * - Removes trailing punctuation
 */
function normalizeBrandKey(brandName) {
  if (!brandName) return '';

  return brandName.toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')              // Collapse multiple spaces
    .replace(/[.,;:!?]+$/g, '')        // Remove trailing punctuation
    .trim();
}

function loadWarrantyData() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const warrantySheet = spreadsheet.getSheetByName(WARRANTY_SHEET_NAME);

    if (!warrantySheet) {
      Logger.log('❌ Warranty sheet "' + WARRANTY_SHEET_NAME + '" not found');
      return null;
    }

    const data = warrantySheet.getDataRange().getValues();

    if (data.length < 2) {
      Logger.log('❌ No data in warranty sheet');
      return null;
    }

    // Build warranty lookup map (case-insensitive with normalization)
    const warrantyMap = {};
    const headers = data[0];

    // Find column indices
    let brandColIdx = -1;
    let warrantyColIdx = -1;

    for (let i = 0; i < headers.length; i++) {
      const header = headers[i].toString().toLowerCase().trim();
      if (header === 'brand name' || header === 'brand') {
        brandColIdx = i;
      } else if (header === 'warranty years' || header === 'warranty') {
        warrantyColIdx = i;
      }
    }

    if (brandColIdx === -1 || warrantyColIdx === -1) {
      Logger.log('❌ Could not find required columns in warranty sheet');
      Logger.log('   Headers: ' + headers.join(', '));
      return null;
    }

    // Build lookup map with normalized keys
    let loadedCount = 0;
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const brand = row[brandColIdx];
      const warranty = row[warrantyColIdx];

      if (brand && brand.toString().trim() !== '') {
        const brandKey = normalizeBrandKey(brand);
        const warrantyValue = warranty ? warranty.toString().trim() : '';

        if (warrantyValue !== '') {
          warrantyMap[brandKey] = warrantyValue;
          loadedCount++;

          // Only log in debug mode to avoid flooding logs
          if (DEBUG_LOGGING) {
            Logger.log('   Loaded: ' + brand + ' = ' + warrantyValue + ' years');
          }
        }
      }
    }

    Logger.log('✅ Loaded ' + loadedCount + ' warranty entries');

    // Log a sample for verification (always show a few examples)
    if (loadedCount > 0) {
      const sampleBrands = Object.keys(warrantyMap).slice(0, 3);
      Logger.log('   Sample brands: ' + sampleBrands.map(function(b) {
        return b + ' (' + warrantyMap[b] + 'y)';
      }).join(', '));
    }

    return warrantyMap;

  } catch (error) {
    Logger.log('❌ Error loading warranty data: ' + error);
    return null;
  }
}

// Note: populateSingleWarranty removed - now uses batch processing via processBatch()

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function showWarrantyData() {
  const warrantyData = loadWarrantyData();

  if (!warrantyData) {
    SpreadsheetApp.getUi().alert('❌ Error', 'Could not load warranty data.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }

  let message = '📋 WARRANTY LOOKUP DATA\n\n';
  message += 'Brands loaded: ' + Object.keys(warrantyData).length + '\n\n';

  const brands = Object.keys(warrantyData).sort();
  for (let i = 0; i < Math.min(brands.length, 15); i++) {
    const brand = brands[i];
    // Capitalize first letter of each word for display
    const displayBrand = brand.split(' ').map(function(word) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
    message += displayBrand + ': ' + warrantyData[brand] + ' years\n';
  }

  if (brands.length > 15) {
    message += '\n... and ' + (brands.length - 15) + ' more';
  }

  SpreadsheetApp.getUi().alert('Warranty Data', message, SpreadsheetApp.getUi().ButtonSet.OK);
}
