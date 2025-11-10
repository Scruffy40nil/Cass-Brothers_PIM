/**
 * EXTRACT COLOUR FROM TITLE - Google Apps Script
 *
 * This script extracts colour/finish information from the product title
 * and populates it into the colour_finish column.
 *
 * SETUP INSTRUCTIONS:
 * 1. Open your Taps Raw_Data Google Sheet
 * 2. Go to Extensions → Apps Script
 * 3. Create a new script file and paste this code
 * 4. Run setupMenu() once to add the menu
 * 5. Use the "Extract Colours" menu to extract colours from titles
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

// Column numbers in TAPS sheet (1-indexed)
const COLOUR_EXTRACT_COLUMNS = {
  TITLE: 6,            // Column F
  COLOUR_FINISH: 12,   // Column L
};

// List of all possible colours/finishes (in order of specificity - most specific first)
const COLOUR_LIST = [
  'Brushed Nickel',
  'Brushed Gold',
  'Brushed Brass',
  'Brushed Carbon',
  'Matt Black',
  'Matt White',
  'Matt Bronze',
  'Gun Metal',
  'Light Gold',
  'Stainless Steel',
  'Antique Brass',
  'Antique Black',
  'Fucile',
  'Pewter',
  'Bronze',
  'Chrome',
  'Black'  // This will be converted to "Matt Black"
];

// ============================================================================
// MENU SETUP
// ============================================================================

function setupMenu() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🎨 Extract Colours')
    .addItem('📊 Count Products Ready', 'countProductsReadyForColour')
    .addSeparator()
    .addItem('▶️ Extract ALL Colours', 'extractAllColours')
    .addItem('🔢 Extract Range', 'extractRangeDialog')
    .addItem('1️⃣ Extract Single Row', 'extractSingleRowDialog')
    .addToUi();

  Logger.log('✅ Extract Colours menu added!');
  SpreadsheetApp.getActiveSpreadsheet().toast('Menu added! Refresh the page.', '✅ Success', 5);
}

function onOpen() {
  setupMenu();
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

function countProductsReadyForColour() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    SpreadsheetApp.getUi().alert('No data found in sheet.');
    return;
  }

  const titleColumn = sheet.getRange(2, COLOUR_EXTRACT_COLUMNS.TITLE, lastRow - 1, 1).getValues();
  const colourColumn = sheet.getRange(2, COLOUR_EXTRACT_COLUMNS.COLOUR_FINISH, lastRow - 1, 1).getValues();

  let needsExtraction = 0;
  let alreadyHasColour = 0;
  let noTitle = 0;

  for (let i = 0; i < titleColumn.length; i++) {
    const title = titleColumn[i][0];
    const colour = colourColumn[i][0];

    if (!title || title.toString().trim() === '') {
      noTitle++;
    } else if (colour && colour.toString().trim() !== '') {
      alreadyHasColour++;
    } else {
      needsExtraction++;
    }
  }

  const message =
    '📊 COLOUR EXTRACTION READINESS\n\n' +
    'Ready for extraction: ' + needsExtraction + '\n' +
    'Already has colour: ' + alreadyHasColour + '\n' +
    'No title (skipped): ' + noTitle + '\n' +
    'Total: ' + (lastRow - 1) + '\n\n' +
    'Extract colours for ' + needsExtraction + ' products?';

  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('Colour Extraction Report', message, ui.ButtonSet.YES_NO);

  if (response == ui.Button.YES) {
    extractAllColours();
  }
}

function extractAllColours() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    SpreadsheetApp.getUi().alert('No data found.');
    return;
  }

  const titleColumn = sheet.getRange(2, COLOUR_EXTRACT_COLUMNS.TITLE, lastRow - 1, 1).getValues();
  const colourColumn = sheet.getRange(2, COLOUR_EXTRACT_COLUMNS.COLOUR_FINISH, lastRow - 1, 1).getValues();

  const rowsToExtract = [];
  for (let i = 0; i < titleColumn.length; i++) {
    const title = titleColumn[i][0];
    const colour = colourColumn[i][0];
    const rowNum = i + 2;

    if (title && title.toString().trim() !== '' && (!colour || colour.toString().trim() === '')) {
      rowsToExtract.push(rowNum);
    }
  }

  if (rowsToExtract.length === 0) {
    SpreadsheetApp.getUi().alert('No products need colour extraction.');
    return;
  }

  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Bulk Colour Extraction',
    'Extract colours for ' + rowsToExtract.length + ' products?\n\n' +
    'Est. time: ' + Math.ceil(rowsToExtract.length * 0.1) + ' minutes',
    ui.ButtonSet.YES_NO
  );

  if (response == ui.Button.YES) {
    bulkColourExtraction(rowsToExtract);
  }
}

function extractRangeDialog() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Colour Extraction Range',
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

  const rowsToExtract = [];
  for (let i = start; i <= end; i++) {
    rowsToExtract.push(i);
  }

  bulkColourExtraction(rowsToExtract);
}

function extractSingleRowDialog() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Colour Extraction Single Row',
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

  bulkColourExtraction([rowNum]);
}

// ============================================================================
// COLOUR EXTRACTION LOGIC
// ============================================================================

function bulkColourExtraction(rowNumbers) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const startTime = new Date();

  Logger.log('🚀 Starting colour extraction for ' + rowNumbers.length + ' rows');
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Starting colour extraction...',
    '🎨 Extract Colours',
    5
  );

  const results = {
    total: rowNumbers.length,
    extracted: 0,
    notFound: 0,
    errors: []
  };

  for (let i = 0; i < rowNumbers.length; i++) {
    const rowNum = rowNumbers[i];

    if (i > 0 && i % 50 === 0) {
      SpreadsheetApp.getActiveSpreadsheet().toast(
        'Progress: ' + i + '/' + rowNumbers.length + ' (' + results.extracted + ' extracted)',
        '⏳ Extracting',
        3
      );
    }

    try {
      const result = extractSingleColour(sheet, rowNum);

      if (result.success) {
        results.extracted++;
        Logger.log('✅ Row ' + rowNum + ': Extracted "' + result.colour + '"');
      } else {
        results.notFound++;
        Logger.log('⚠️ Row ' + rowNum + ': ' + result.error);
      }

    } catch (error) {
      results.errors.push({ row: rowNum, error: error.toString() });
      Logger.log('❌ Row ' + rowNum + ': ' + error);
    }
  }

  const duration = Math.round((new Date() - startTime) / 1000);

  Logger.log('🎉 Complete! ' + results.extracted + ' extracted, ' + results.notFound + ' not found');

  let errorReport = '';
  if (results.errors.length > 0) {
    errorReport = '\n\nErrors:\n' + results.errors.slice(0, 3).map(function (e) {
      return 'Row ' + e.row + ': ' + e.error;
    }).join('\n');
  }

  SpreadsheetApp.getUi().alert(
    '🎉 Colour Extraction Complete',
    'Processed ' + results.total + ' in ' + duration + ' seconds\n\n' +
    '✅ Extracted: ' + results.extracted + '\n' +
    '⚠️ Not Found: ' + results.notFound + '\n' +
    '❌ Errors: ' + results.errors.length +
    errorReport
  );
}

function extractSingleColour(sheet, rowNum) {
  try {
    // Get title from sheet
    const title = sheet.getRange(rowNum, COLOUR_EXTRACT_COLUMNS.TITLE).getValue();

    if (!title || title.toString().trim() === '') {
      return { success: false, error: 'No title' };
    }

    const titleStr = title.toString().trim();

    // Search for colour in title (check most specific first)
    for (let i = 0; i < COLOUR_LIST.length; i++) {
      const colour = COLOUR_LIST[i];
      const regex = new RegExp('\\b' + colour + '\\b', 'i');

      if (regex.test(titleStr)) {
        // Found colour!
        let extractedColour = colour;

        // Special case: Convert "Black" to "Matt Black"
        if (colour.toLowerCase() === 'black') {
          // Check it's not already "Matt Black", "Antique Black", etc.
          if (!titleStr.match(/\b(Matt|Antique)\s+Black\b/i)) {
            extractedColour = 'Matt Black';
            Logger.log('   Converted "Black" to "Matt Black"');
          }
        }

        // Write colour to sheet
        sheet.getRange(rowNum, COLOUR_EXTRACT_COLUMNS.COLOUR_FINISH).setValue(extractedColour);

        return { success: true, colour: extractedColour };
      }
    }

    // No colour found
    return { success: false, error: 'No colour found in title: "' + titleStr + '"' };

  } catch (error) {
    return { success: false, error: error.toString() };
  }
}
