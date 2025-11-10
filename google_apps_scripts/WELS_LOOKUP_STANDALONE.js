/**
 * STANDALONE WELS LOOKUP - Google Apps Script
 *
 * This script looks up WELS ratings, flow rates, and registration numbers
 * directly from the WELS Rating Google Sheet and populates them into the Taps sheet.
 *
 * SETUP INSTRUCTIONS:
 * 1. Open your Taps Raw_Data Google Sheet
 * 2. Go to Extensions → Apps Script
 * 3. Create a new script file and paste this code
 * 4. Update WELS_SHEET_ID below with your WELS Rating sheet ID
 * 5. Run setupMenu() once to add the menu
 * 6. Use the "WELS Lookup" menu to start lookups
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

// WELS Rating Google Sheet ID
const WELS_SHEET_ID = '19OZSFFzSOzcy-5NYIYqy3rFWWrceDitR6uSVqY23FGY';

// Brand name mapping - maps brands to their worksheet names in WELS sheet
const BRAND_MAPPING = {
  'gareth ashton': 'abey',
  'armando vicario': 'abey',
  'gessi': 'abey',
  'abey': 'abey',
  // Add more mappings as needed
};

// Column numbers in TAPS sheet (1-indexed)
const TAPS_COLUMNS = {
  URL: 1,              // Column A
  VARIANT_SKU: 2,      // Column B
  HANDLE: 5,           // Column E - Model code
  TITLE: 6,            // Column F - May contain variant model codes
  BRAND: 8,            // Column H
  FLOW_RATE: 21,       // Column U - To be filled
  WELS_RATING: 24,     // Column X - To be filled
  WELS_REG_NUM: 25,    // Column Y - To be filled
};

// Common column names in WELS reference sheet
const WELS_SKU_COLUMNS = ['Model code', 'Variant model code', 'SKU', 'sku', 'Product Code', 'Code', 'Model'];
const WELS_DATA_COLUMNS = {
  RATING: ['Star rating', 'WELS Rating', 'WELS', 'Rating', 'Star Rating', 'Stars'],
  FLOW: ['Water consumption (Litres)', 'Water consump. (L/min)', 'Flow Rate', 'Flow', 'L/min', 'Flow (L/min)', 'Litres/min', 'L/Min'],
  REG_NUM: ['Registration number', 'Reg. number', 'WELS Registration', 'Registration Number', 'Reg Number', 'WELS Reg', 'Reg']
};

// ============================================================================
// MENU SETUP
// ============================================================================

function setupMenu() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🔍 WELS Lookup')
    .addItem('📊 Count Products Ready', 'countProductsReadyForWELS')
    .addSeparator()
    .addItem('▶️ Lookup ALL Products', 'lookupAllProducts')
    .addItem('🔢 Lookup Range', 'lookupRangeDialog')
    .addItem('1️⃣ Lookup Single Row', 'lookupSingleRowDialog')
    .addSeparator()
    .addItem('⚙️ Settings', 'showSettings')
    .addToUi();

  Logger.log('✅ WELS Lookup menu added!');
  SpreadsheetApp.getActiveSpreadsheet().toast('Menu added! Refresh the page.', '✅ Success', 5);
}

function onOpen() {
  setupMenu();
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

function countProductsReadyForWELS() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    SpreadsheetApp.getUi().alert('No data found in sheet.');
    return;
  }

  const brandColumn = sheet.getRange(2, TAPS_COLUMNS.BRAND, lastRow - 1, 1).getValues();
  const welsColumn = sheet.getRange(2, TAPS_COLUMNS.WELS_RATING, lastRow - 1, 1).getValues();

  let needsLookup = 0;
  let alreadyHasWELS = 0;
  let noBrand = 0;

  for (let i = 0; i < brandColumn.length; i++) {
    const brand = brandColumn[i][0];
    const wels = welsColumn[i][0];

    if (!brand || brand.toString().trim() === '') {
      noBrand++;
    } else if (wels && wels.toString().trim() !== '') {
      alreadyHasWELS++;
    } else {
      needsLookup++;
    }
  }

  const message =
    '📊 WELS LOOKUP READINESS\n\n' +
    'Ready for lookup: ' + needsLookup + '\n' +
    'Already has WELS: ' + alreadyHasWELS + '\n' +
    'No brand (skipped): ' + noBrand + '\n' +
    'Total: ' + (lastRow - 1) + '\n\n' +
    'Lookup the ' + needsLookup + ' products?';

  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('WELS Lookup Report', message, ui.ButtonSet.YES_NO);

  if (response == ui.Button.YES) {
    lookupAllProducts();
  }
}

function lookupAllProducts() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    SpreadsheetApp.getUi().alert('No data found.');
    return;
  }

  const brandColumn = sheet.getRange(2, TAPS_COLUMNS.BRAND, lastRow - 1, 1).getValues();
  const welsColumn = sheet.getRange(2, TAPS_COLUMNS.WELS_RATING, lastRow - 1, 1).getValues();

  const rowsToLookup = [];
  for (let i = 0; i < brandColumn.length; i++) {
    const brand = brandColumn[i][0];
    const wels = welsColumn[i][0];
    const rowNum = i + 2;

    if (brand && brand.toString().trim() !== '' && (!wels || wels.toString().trim() === '')) {
      rowsToLookup.push(rowNum);
    }
  }

  if (rowsToLookup.length === 0) {
    SpreadsheetApp.getUi().alert('No products need WELS lookup.');
    return;
  }

  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Bulk WELS Lookup',
    'Lookup WELS data for ' + rowsToLookup.length + ' products?\n\n' +
    'Est. time: ' + Math.ceil(rowsToLookup.length * 0.5) + ' minutes',
    ui.ButtonSet.YES_NO
  );

  if (response == ui.Button.YES) {
    bulkWELSLookup(rowsToLookup);
  }
}

function lookupRangeDialog() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'WELS Lookup Range',
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

  if (isNaN(start) || isNaN(end)) {
    ui.alert('Invalid format. Use: 2-50');
    return;
  }

  const rowsToLookup = [];
  for (let i = start; i <= end; i++) {
    rowsToLookup.push(i);
  }

  bulkWELSLookup(rowsToLookup);
}

function lookupSingleRowDialog() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'WELS Lookup Single Row',
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

  bulkWELSLookup([rowNum]);
}

// ============================================================================
// WELS LOOKUP LOGIC
// ============================================================================

function bulkWELSLookup(rowNumbers) {
  const tapsSheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const startTime = new Date();

  Logger.log('🚀 Starting WELS lookup for ' + rowNumbers.length + ' rows');
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Starting WELS lookup...',
    '🔍 WELS Lookup',
    5
  );

  // Open WELS reference sheet
  let welsSpreadsheet;
  try {
    welsSpreadsheet = SpreadsheetApp.openById(WELS_SHEET_ID);
  } catch (error) {
    SpreadsheetApp.getUi().alert('❌ Error', 'Could not open WELS reference sheet. Check WELS_SHEET_ID.', SpreadsheetApp.getUi().ButtonSet.OK);
    Logger.log('❌ Could not open WELS sheet: ' + error);
    return;
  }

  const results = {
    total: rowNumbers.length,
    found: 0,
    notFound: 0,
    errors: []
  };

  for (let i = 0; i < rowNumbers.length; i++) {
    const rowNum = rowNumbers[i];

    if (i > 0 && i % 10 === 0) {
      SpreadsheetApp.getActiveSpreadsheet().toast(
        'Progress: ' + i + '/' + rowNumbers.length + ' (' + results.found + ' found)',
        '⏳ WELS Lookup',
        3
      );
    }

    try {
      const result = lookupSingleProduct(tapsSheet, rowNum, welsSpreadsheet);

      if (result.success) {
        results.found++;
        Logger.log('✅ Row ' + rowNum + ': Found WELS data');
      } else {
        results.notFound++;
        Logger.log('⚠️ Row ' + rowNum + ': ' + result.error);
      }

      // Small delay to avoid rate limits
      Utilities.sleep(500);

    } catch (error) {
      results.errors.push({ row: rowNum, error: error.toString() });
      Logger.log('❌ Row ' + rowNum + ': ' + error);
    }
  }

  const duration = Math.round((new Date() - startTime) / 1000 / 60);

  Logger.log('🎉 Complete! ' + results.found + ' found, ' + results.notFound + ' not found');

  let errorReport = '';
  if (results.errors.length > 0) {
    errorReport = '\n\nErrors:\n' + results.errors.slice(0, 3).map(function (e) {
      return 'Row ' + e.row + ': ' + e.error;
    }).join('\n');
  }

  SpreadsheetApp.getUi().alert(
    '🎉 WELS Lookup Complete',
    'Processed ' + results.total + ' in ' + duration + ' min\n\n' +
    '✅ Found: ' + results.found + '\n' +
    '⚠️ Not Found: ' + results.notFound + '\n' +
    '❌ Errors: ' + results.errors.length +
    errorReport
  );
}

function lookupSingleProduct(tapsSheet, rowNum, welsSpreadsheet) {
  try {
    // Get brand from taps sheet
    const brand = tapsSheet.getRange(rowNum, TAPS_COLUMNS.BRAND).getValue();

    if (!brand || brand.toString().trim() === '') {
      return { success: false, error: 'No brand' };
    }

    // Get potential SKU values from multiple columns
    const handle = tapsSheet.getRange(rowNum, TAPS_COLUMNS.HANDLE).getValue();
    const title = tapsSheet.getRange(rowNum, TAPS_COLUMNS.TITLE).getValue();
    const variantSku = tapsSheet.getRange(rowNum, TAPS_COLUMNS.VARIANT_SKU).getValue();

    // Build list of SKUs to try (handle comma-separated values)
    const skusToTry = [];

    function addSKU(value) {
      if (value && value.toString().trim() !== '') {
        const valueStr = value.toString().trim();
        if (valueStr.indexOf(',') !== -1) {
          // Comma-separated - split and add each
          const parts = valueStr.split(',');
          for (let i = 0; i < parts.length; i++) {
            const sku = parts[i].trim();
            if (sku && skusToTry.indexOf(sku) === -1) {
              skusToTry.push(sku);
            }
          }
        } else {
          // Single value
          if (skusToTry.indexOf(valueStr) === -1) {
            skusToTry.push(valueStr);
          }
        }
      }
    }

    // Column B - Standard SKU (e.g., "151-7815-12-1")
    addSKU(variantSku);

    // Also try base SKU from Column B (strip variant suffix)
    // Example: "151-7815-12-1" -> also try "151-7815"
    if (variantSku && variantSku.toString().trim() !== '') {
      const variantSkuStr = variantSku.toString().trim();
      // Match pattern like "151-7815-12-1" -> extract "151-7815"
      const baseSkuMatch = variantSkuStr.match(/^([A-Z0-9]+-[A-Z0-9]+)(?:-[A-Z0-9]+-[A-Z0-9]+)$/i);
      if (baseSkuMatch && skusToTry.indexOf(baseSkuMatch[1]) === -1) {
        skusToTry.push(baseSkuMatch[1]);
        Logger.log('   Extracted base SKU: ' + baseSkuMatch[1] + ' from ' + variantSkuStr);
      }
    }

    // Column E - Model code
    addSKU(handle);

    // Column F - Title (may contain variant description or base model)
    // Example: "S2.01-2E190.50- Fucile PVD" -> extract "S2.01-2E190.50"
    // Example: "S2.01-2E190.50- Matt Black" -> extract "S2.01-2E190.50"
    // Example: "S2.01-2E190.50- Brushed Nickel" -> extract "S2.01-2E190.50"
    // Example: "151-7815" -> use as-is
    if (title && title.toString().trim() !== '') {
      const titleStr = title.toString().trim();

      // Check if title has variant description after hyphen-space pattern
      // Pattern: "SKU- Description" -> extract "SKU"
      // The description can be anything (colors, finishes, etc.)
      const variantMatch = titleStr.match(/^([A-Z0-9.-]+)-\s+(.+)$/i);
      if (variantMatch) {
        const extractedSku = variantMatch[1].trim();
        if (extractedSku && skusToTry.indexOf(extractedSku) === -1) {
          skusToTry.push(extractedSku);
          Logger.log('   Extracted SKU from title: ' + extractedSku + ' from "' + titleStr + '"');
        }
      } else {
        // No variant description, use title as-is
        addSKU(title);
      }
    }

    if (skusToTry.length === 0) {
      return { success: false, error: 'No SKU found in columns B, E, or F' };
    }

    Logger.log('🔍 Row ' + rowNum + ' - Will try ' + skusToTry.length + ' SKU(s): ' + skusToTry.join(', '));

    // Map brand to worksheet name
    const brandLower = brand.toString().toLowerCase().trim();
    const mappedBrand = BRAND_MAPPING[brandLower] || brand;

    // Try to find WELS data
    const welsData = searchWELSSheet(welsSpreadsheet, mappedBrand, skusToTry);

    if (!welsData) {
      // Try original brand name if mapping didn't work
      if (mappedBrand.toLowerCase() !== brandLower) {
        const welsData2 = searchWELSSheet(welsSpreadsheet, brand, skusToTry);
        if (welsData2) {
          writeWELSDataToSheet(tapsSheet, rowNum, welsData2);
          return { success: true };
        }
      }

      return { success: false, error: 'No WELS data found for brand "' + brand + '"' };
    }

    // Write WELS data to taps sheet
    writeWELSDataToSheet(tapsSheet, rowNum, welsData);

    return { success: true };

  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function searchWELSSheet(welsSpreadsheet, brandName, skusToTry) {
  try {
    // Find worksheet by brand name (case-insensitive)
    const worksheets = welsSpreadsheet.getSheets();
    let targetWorksheet = null;

    for (let i = 0; i < worksheets.length; i++) {
      if (worksheets[i].getName().toLowerCase() === brandName.toLowerCase()) {
        targetWorksheet = worksheets[i];
        break;
      }
    }

    if (!targetWorksheet) {
      Logger.log('⚠️ Worksheet "' + brandName + '" not found in WELS sheet');
      const availableSheets = worksheets.map(function (ws) { return ws.getName(); }).join(', ');
      Logger.log('📋 Available worksheets: ' + availableSheets);
      return null;
    }

    Logger.log('🔍 Searching worksheet "' + targetWorksheet.getName() + '"');

    // Get all data from worksheet
    const data = targetWorksheet.getDataRange().getValues();

    if (data.length < 2) {
      Logger.log('⚠️ No data in worksheet');
      return null;
    }

    const headers = data[0];

    // Find SKU column indices
    const skuColumnIndices = [];
    for (let i = 0; i < headers.length; i++) {
      for (let j = 0; j < WELS_SKU_COLUMNS.length; j++) {
        if (headers[i] === WELS_SKU_COLUMNS[j]) {
          skuColumnIndices.push(i);
          break;
        }
      }
    }

    if (skuColumnIndices.length === 0) {
      Logger.log('⚠️ No SKU columns found in worksheet');
      return null;
    }

    // Search for matching SKU
    for (let rowIdx = 1; rowIdx < data.length; rowIdx++) {
      const row = data[rowIdx];

      // Check each SKU column
      for (let colIdx = 0; colIdx < skuColumnIndices.length; colIdx++) {
        const skuColIndex = skuColumnIndices[colIdx];
        const cellValue = row[skuColIndex];

        if (!cellValue || cellValue.toString().trim() === '') {
          continue;
        }

        const cellValueStr = cellValue.toString().trim().toUpperCase();

        // Check if this cell matches any of our SKUs
        for (let skuIdx = 0; skuIdx < skusToTry.length; skuIdx++) {
          const searchSku = skusToTry[skuIdx].toUpperCase();

          // Exact match
          if (cellValueStr === searchSku) {
            Logger.log('✅ Found exact match: "' + searchSku + '" in row ' + (rowIdx + 1));
            return extractWELSData(headers, row, searchSku);
          }

          // Check if SKU is in comma-separated list
          if (cellValueStr.indexOf(',') !== -1) {
            const cellSkus = cellValueStr.split(',').map(function (s) { return s.trim(); });
            if (cellSkus.indexOf(searchSku) !== -1) {
              Logger.log('✅ Found in comma-separated list: "' + searchSku + '" in row ' + (rowIdx + 1));
              return extractWELSData(headers, row, searchSku);
            }
          }
        }
      }
    }

    Logger.log('⚠️ No matching SKU found in worksheet');
    return null;

  } catch (error) {
    Logger.log('❌ Error searching WELS sheet: ' + error);
    return null;
  }
}

function extractWELSData(headers, row, sku) {
  function findValue(possibleHeaders) {
    for (let i = 0; i < possibleHeaders.length; i++) {
      const headerIdx = headers.indexOf(possibleHeaders[i]);
      if (headerIdx !== -1 && row[headerIdx]) {
        const value = row[headerIdx].toString().trim();
        if (value && value.toLowerCase() !== 'n/a' && value !== '-') {
          return value;
        }
      }
    }
    return '';
  }

  const welsData = {
    sku: sku,
    rating: findValue(WELS_DATA_COLUMNS.RATING),
    flow: findValue(WELS_DATA_COLUMNS.FLOW),
    regNum: findValue(WELS_DATA_COLUMNS.REG_NUM)
  };

  return welsData;
}

function writeWELSDataToSheet(sheet, rowNum, welsData) {
  if (welsData.rating) {
    sheet.getRange(rowNum, TAPS_COLUMNS.WELS_RATING).setValue(welsData.rating);
  }
  if (welsData.flow) {
    sheet.getRange(rowNum, TAPS_COLUMNS.FLOW_RATE).setValue(welsData.flow);
  }
  if (welsData.regNum) {
    sheet.getRange(rowNum, TAPS_COLUMNS.WELS_REG_NUM).setValue(welsData.regNum);
  }

  Logger.log('✅ Wrote WELS data: Rating=' + welsData.rating + ', Flow=' + welsData.flow + ', Reg=' + welsData.regNum);
}

// ============================================================================
// SETTINGS
// ============================================================================

function showSettings() {
  const ui = SpreadsheetApp.getUi();

  let welsSheetStatus = '❌ Not accessible';
  try {
    const welsSheet = SpreadsheetApp.openById(WELS_SHEET_ID);
    welsSheetStatus = '✅ Connected (' + welsSheet.getName() + ')';
  } catch (error) {
    welsSheetStatus = '❌ Error: ' + error.message;
  }

  ui.alert(
    '⚙️ WELS Lookup Settings',
    'WELS Reference Sheet: ' + welsSheetStatus + '\n' +
    'WELS Sheet ID: ' + WELS_SHEET_ID + '\n\n' +
    'Brand Mappings: ' + Object.keys(BRAND_MAPPING).length + '\n\n' +
    'To change settings, edit the script.',
    ui.ButtonSet.OK
  );
}
