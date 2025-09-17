/** @OnlyCurrentDoc */
/**
 * Shopify PIM Data Processor - Complete Checkbox Triggered Version
 * Automatically cleans data when checkbox in column BE is checked
 * Auto-adds highlighted values to rule sheets + Formula-based quality scores
 * CORRECTED COLUMN MAPPINGS based on actual spreadsheet structure
 * ENHANCED BOOLEAN LOGIC - Always sets TRUE/FALSE based on Installation Type
 */

// ===============================
// MENU AND INITIALIZATION
// ===============================

// Create custom menu when spreadsheet opens
function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('PIM Data Processor')
      .addItem('🧪 Test Sheet Access', 'testSheetAccess')
      .addItem('🏗️ Create Rule Sheets', 'createRuleSheets')
      .addSeparator()
      .addItem('⚡ Process Shopify Data', 'processShopifyData')
      .addItem('📊 Setup Quality Score Formula', 'setupQualityScoreFormula')
      .addItem('🎨 Apply Quality Score Colors', 'applyQualityScoreColors')
      .addSeparator()
      .addItem('🎯 Auto-Add Highlights to Rules', 'autoAddHighlightsToRules')
      .addItem('🧹 Clear Red Highlights', 'clearHighlights')
      .addItem('📋 Show Highlight Summary', 'showHighlightSummary')
      .addSeparator()
      .addItem('🔧 Setup Checkbox Column', 'setupCheckboxColumn')
      .addItem('🔄 Process All Checked Rows', 'processAllCheckedRows')
      .addItem('🧪 Test Boolean Logic', 'testBooleanLogic')
      .addToUi();
    
    console.log('✅ Menu created successfully');
  } catch (error) {
    console.error('❌ Error creating menu:', error);
  }
}

/**
 * Automatically triggered when any cell is edited
 * Checks if column BE checkbox was checked and triggers cleaning
 */
function onEdit(e) {
  try {
    console.log('🔄 onEdit triggered...');
    
    // Enhanced error checking
    if (!e || !e.range) {
      console.log('⚠️ No edit event or range found');
      return;
    }
    
    const range = e.range;
    const sheet = range.getSheet();
    const row = range.getRow();
    const col = range.getColumn();
    const value = range.getValue();
    
    console.log(`📍 Edit detected: Sheet=${sheet.getName()}, Row=${row}, Col=${col}, Value=${value}, Type=${typeof value}`);
    
    // Only process edits on Raw_Data sheet
    if (sheet.getName() !== 'Raw_Data') {
      console.log('⏭️ Edit not on Raw_Data sheet, ignoring');
      return;
    }
    
    // Only process edits in column BE (column 57)
    if (col !== 57) {
      console.log(`⏭️ Edit not in column BE (col ${col}), ignoring`);
      return;
    }
    
    // Only process when checkbox is checked (TRUE)
    if (value !== true) {
      console.log(`⏭️ Checkbox not checked (value: ${value}, type: ${typeof value}), ignoring`);
      return;
    }
    
    // Skip header row
    if (row === 1) {
      console.log('⏭️ Header row edit, ignoring');
      return;
    }
    
    console.log(`✅ Checkbox checked in row ${row}, starting data cleaning...`);
    
    // Start the cleaning process for this row
    cleanSingleRow(row);
    
  } catch (error) {
    console.error('❌ Error in onEdit trigger:', error);
    console.error('❌ Error stack:', error.stack);
    
    // Show user-friendly error message
    try {
      SpreadsheetApp.getUi().alert(`❌ Error processing checkbox: ${error.toString()}`);
    } catch (uiError) {
      console.error('❌ Could not show error alert:', uiError);
    }
  }
}

/**
 * Handle HTTP POST requests for external API calls
 * Allows external applications to trigger data cleaning
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === "cleanSingleRow") {
      // Call your existing cleanSingleRow function
      cleanSingleRow(data.row_number);
      return ContentService
        .createTextOutput(JSON.stringify({success: true}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService
      .createTextOutput(JSON.stringify({success: false, error: "Unknown action"}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({success: false, error: error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Quality Score Configuration - Updated for correct column structure
const QUALITY_SCORE_FIELDS = [
  'installation_type',
  'product_material', 
  'grade_of_material',
  'style',
  'warranty_years',
  'waste_outlet_dimensions',
  'is undermount',
  'is topmount', 
  'is flushmount',
  'has_overflow',
  'tap_holes_number',
  'bowls_number',
  'length_mm',
  'overall_width_mm',
  'overall_depth_mm',
  'min_cabinet_size_mm',
  'cutout_size_mm',
  'bowl width',
  'bowl depth',
  'bowl height',
  'brand_name',
  'application_location',
  'drain_position'
];

// ===============================
// NEW: CHECKBOX TRIGGER SYSTEM
// ===============================

/**
 * Clean data for a single row when checkbox is checked
 */
function cleanSingleRow(rowNum) {
  console.log(`🧹 Starting data cleaning for row ${rowNum}...`);
  
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const dataSheet = spreadsheet.getSheetByName('Raw_Data');
    
    if (!dataSheet) {
      throw new Error('Raw_Data sheet not found');
    }
    
    // Load all rule sheets
    console.log('🔄 Loading rule sheets...');
    const allRules = {
      warranty: loadRulesFromSheet(spreadsheet, 'Warranty_Rules'),
      material: loadRulesFromSheet(spreadsheet, 'Material_Rules'),
      installation: loadRulesFromSheet(spreadsheet, 'Installation_Rules'),
      style: loadRulesFromSheet(spreadsheet, 'Style_Rules'),
      grade: loadRulesFromSheet(spreadsheet, 'Grade_Rules'),
      location: loadRulesFromSheet(spreadsheet, 'Location_Rules'),
      drain: loadRulesFromSheet(spreadsheet, 'Drain_Rules')
    };
    
    // Load dimension map
    console.log('🔄 Loading dimension map...');
    const dimensionMap = loadDimensionMap(spreadsheet);
    
    // Get row data
    const lastCol = dataSheet.getLastColumn();
    const rowData = dataSheet.getRange(rowNum, 1, 1, lastCol).getValues()[0];
    
    // Check if row has title (column F = index 5)
    if (!rowData[5] || rowData[5].toString().trim() === '') {
      console.log(`⏭️ Row ${rowNum} has no title, skipping cleaning`);
      
      // Uncheck the checkbox and show message
      dataSheet.getRange(rowNum, 57).setValue(false);
      dataSheet.getRange(rowNum, 57).setNote('❌ Cannot clean: No product title found');
      return;
    }
    
    const title = rowData[5].toString();
    console.log(`🔍 Processing product: ${title.substring(0, 50)}...`);
    
    // Process the row
    const result = processRowSafely(rowData, allRules, dimensionMap);
    
    let updatesApplied = 0;
    let valuesCleared = 0;
    let highlightsAdded = 0;
    
    // Apply updates
    console.log(`🔄 Applying ${result.updates.length} updates for row ${rowNum}...`);
    for (const update of result.updates) {
      try {
        if (update.value !== undefined && update.value !== rowData[update.col - 1]) {
          dataSheet.getRange(rowNum, update.col).setValue(update.value);
          
          if (update.value === '') {
            valuesCleared++;
          } else {
            updatesApplied++;
          }
          
          console.log(`✅ Updated column ${update.col}: "${rowData[update.col - 1]}" → "${update.value}"`);
        }
      } catch (cellError) {
        console.error(`⚠️ Error updating cell (${rowNum}, ${update.col}):`, cellError);
      }
    }
    
    // Apply highlights
    console.log(`🔄 Applying ${result.noRuleMatches.length} highlights for row ${rowNum}...`);
    for (const highlight of result.noRuleMatches) {
      try {
        const cell = dataSheet.getRange(rowNum, highlight.col);
        cell.setBackground('#ffcccc');
        cell.setNote(`⚠️ ${highlight.reason}\n\nValue will be auto-added to rules on next "Auto-Add Highlights to Rules" run.`);
        highlightsAdded++;
        
        console.log(`🎨 Highlighted column ${highlight.col}: "${highlight.value}" - ${highlight.reason}`);
      } catch (highlightError) {
        console.error(`⚠️ Error highlighting cell (${rowNum}, ${highlight.col}):`, highlightError);
      }
    }
    
    // Update checkbox with completion status
    const checkboxCell = dataSheet.getRange(rowNum, 57);
    const summary = `✅ Cleaning Complete!\n• ${updatesApplied} fields updated\n• ${valuesCleared} values cleared\n• ${highlightsAdded} cells highlighted\n\nProcessed: ${title.substring(0, 30)}...`;
    
    // Change checkbox color to indicate completion
    checkboxCell.setBackground('#d4edda'); // Light green background
    checkboxCell.setNote(summary);
    
    console.log(`✅ Row ${rowNum} cleaning completed: ${updatesApplied} updates, ${valuesCleared} cleared, ${highlightsAdded} highlights`);
    
    // Optional: Auto-uncheck after a delay (remove if you want checkbox to stay checked)
    // Utilities.sleep(2000);
    // checkboxCell.setValue(false);
    
  } catch (error) {
    console.error(`❌ Error cleaning row ${rowNum}:`, error);
    console.error(`❌ Error stack:`, error.stack);
    
    // Update checkbox to show error
    try {
      const dataSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Raw_Data');
      const checkboxCell = dataSheet.getRange(rowNum, 57);
      checkboxCell.setValue(false);
      checkboxCell.setBackground('#f8d7da'); // Light red background
      checkboxCell.setNote(`❌ Cleaning failed: ${error.toString()}`);
    } catch (noteError) {
      console.error('❌ Could not update checkbox with error:', noteError);
    }
  }
}

/**
 * Setup checkbox column with proper formatting
 */
function setupCheckboxColumn() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const dataSheet = spreadsheet.getSheetByName('Raw_Data');
    
    if (!dataSheet) {
      SpreadsheetApp.getUi().alert('❌ Raw_Data sheet not found');
      return;
    }
    
    const lastRow = dataSheet.getLastRow();
    
    // Set header for column BE
    const headerCell = dataSheet.getRange(1, 57);
    headerCell.setValue('🧹 Clean Data');
    headerCell.setFontWeight('bold');
    headerCell.setBackground('#e6f3ff');
    headerCell.setHorizontalAlignment('center');
    
    // Add data validation (checkboxes) for all data rows
    if (lastRow > 1) {
      const checkboxRange = dataSheet.getRange(2, 57, lastRow - 1, 1);
      
      // Create checkbox validation
      const checkboxValidation = SpreadsheetApp.newDataValidation()
        .requireCheckbox()
        .setAllowInvalid(false)
        .setHelpText('Check this box to clean and standardize this product\'s data')
        .build();
      
      checkboxRange.setDataValidation(checkboxValidation);
      checkboxRange.setHorizontalAlignment('center');
      
      // Set initial values to false
      const falseValues = Array(lastRow - 1).fill([false]);
      checkboxRange.setValues(falseValues);
    }
    
    // Auto-resize column
    dataSheet.autoResizeColumn(57);
    
    SpreadsheetApp.getUi().alert(`✅ Checkbox Column Setup Complete!\n\n• Added header "🧹 Clean Data" to column BE\n• Added checkboxes for ${lastRow - 1} products\n• Check any checkbox to automatically clean that product's data\n\nThe cleaning will:\n• Standardize values using rule sheets\n• Auto-populate missing dimensions\n• Highlight non-standard values\n• Update quality scores`);
    
  } catch (error) {
    SpreadsheetApp.getUi().alert(`❌ Error setting up checkbox column: ${error.toString()}`);
    console.error('❌ Setup checkbox column error:', error);
  }
}

/**
 * Process all checked rows at once (optional function)
 */
function processAllCheckedRows() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const dataSheet = spreadsheet.getSheetByName('Raw_Data');
    
    if (!dataSheet) {
      SpreadsheetApp.getUi().alert('❌ Raw_Data sheet not found');
      return;
    }
    
    const lastRow = dataSheet.getLastRow();
    
    if (lastRow < 2) {
      SpreadsheetApp.getUi().alert('No data rows found');
      return;
    }
    
    // Get all checkbox values
    const checkboxRange = dataSheet.getRange(2, 57, lastRow - 1, 1);
    const checkboxValues = checkboxRange.getValues();
    
    const checkedRows = [];
    for (let i = 0; i < checkboxValues.length; i++) {
      if (checkboxValues[i][0] === true) {
        checkedRows.push(i + 2); // +2 because we started from row 2
      }
    }
    
    if (checkedRows.length === 0) {
      SpreadsheetApp.getUi().alert('No checkboxes are currently checked');
      return;
    }
    
    console.log(`🔄 Processing ${checkedRows.length} checked rows: ${checkedRows.join(', ')}`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const rowNum of checkedRows) {
      try {
        cleanSingleRow(rowNum);
        successCount++;
      } catch (error) {
        console.error(`❌ Error processing row ${rowNum}:`, error);
        errorCount++;
      }
    }
    
    SpreadsheetApp.getUi().alert(`✅ Batch Processing Complete!\n\n• ${successCount} rows processed successfully\n• ${errorCount} rows had errors\n• Total rows processed: ${checkedRows.length}`);
    
  } catch (error) {
    SpreadsheetApp.getUi().alert(`❌ Error in batch processing: ${error.toString()}`);
    console.error('❌ Batch processing error:', error);
  }
}

// ===============================
// EXISTING CORE FUNCTIONS
// ===============================

// Test boolean logic specifically
function testBooleanLogic() {
  const ui = SpreadsheetApp.getUi();
  
  try {
    console.log('🧪 Testing Boolean Logic...');
    
    // Test cases
    const testCases = [
      'Undermount',
      'Topmount', 
      'Flushmount',
      'Topmount & Undermount',
      'Flushmount & Topmount',
      'Undermount, Flushmount',
      'Top Mount',
      'Flush Mount',
      '',
      'Something Else'
    ];
    
    let results = '🧪 Boolean Logic Test Results:\n\n';
    
    for (const testType of testCases) {
      console.log(`\n🔍 Testing: "${testType}"`);
      
      // Simulate the boolean logic
      const installationTypeStr = testType.toString().toUpperCase().trim();
      
      let installationTypes = [];
      if (installationTypeStr) {
        const separators = [' & ', ' AND ', ', ', ',', ' + ', ' / ', '/'];
        let tempTypes = [installationTypeStr];
        
        for (const separator of separators) {
          if (installationTypeStr.includes(separator)) {
            tempTypes = installationTypeStr.split(separator);
            break;
          }
        }
        
        installationTypes = tempTypes.map(type => type.trim()).filter(type => type.length > 0);
      }
      
      function hasInstallationType(keyword) {
        if (installationTypes.length === 0) return false;
        
        const keywords = [keyword.toUpperCase()];
        if (keyword.toUpperCase() === 'TOPMOUNT') {
          keywords.push('TOP MOUNT', 'TOP-MOUNT', 'SURFACE MOUNT');
        } else if (keyword.toUpperCase() === 'FLUSHMOUNT') {
          keywords.push('FLUSH MOUNT', 'FLUSH-MOUNT');
        }
        
        return installationTypes.some(type => 
          keywords.some(kw => type.includes(kw))
        );
      }
      
      const undermount = hasInstallationType('UNDERMOUNT') ? 'TRUE' : 'FALSE';
      const topmount = hasInstallationType('TOPMOUNT') ? 'TRUE' : 'FALSE';
      const flushmount = hasInstallationType('FLUSHMOUNT') ? 'TRUE' : 'FALSE';
      
      results += `"${testType}" → U:${undermount}, T:${topmount}, F:${flushmount}\n`;
      console.log(`   → Undermount: ${undermount}, Topmount: ${topmount}, Flushmount: ${flushmount}`);
    }
    
    ui.alert(results + '\nCheck execution transcript for detailed logs!');
    
  } catch (error) {
    console.error('❌ Boolean test failed:', error);
    ui.alert(`❌ Test Failed: ${error.toString()}`);
  }
}

// Test function
function testSheetAccess() {
  const ui = SpreadsheetApp.getUi();
  
  try {
    console.log('🔍 Starting sheet access test...');
    
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const dataSheet = spreadsheet.getSheetByName('Raw_Data') || spreadsheet.getActiveSheet();
    
    const lastRow = dataSheet.getLastRow();
    const lastCol = dataSheet.getLastColumn();
    console.log(`✅ Sheet dimensions: ${lastRow} rows, ${lastCol} columns`);
    
    // Test quality score column detection
    const qualityColumns = findQualityScoreColumns(spreadsheet);
    console.log(`✅ Found ${qualityColumns.length} quality score columns`);
    
    // Test dimension map loading
    const dimensionMap = loadDimensionMap(spreadsheet);
    console.log(`✅ Dimension map loaded with ${Object.keys(dimensionMap).length} entries`);
    
    // Test a few sample keys from Raw_Data
    if (lastRow > 1) {
      console.log('🔍 Testing first few keys from Raw_Data:');
      for (let i = 2; i <= Math.min(5, lastRow); i++) {
        const key = dataSheet.getRange(i, 3).getValue(); // Column C
        console.log(`Row ${i}, Key: "${key}", Match: ${dimensionMap[key] ? 'YES' : 'NO'}`);
      }
    }
    
    ui.alert(`✅ Sheet Access Test Successful!\n\nSheet: ${dataSheet.getName()}\nDimensions: ${lastRow} rows × ${lastCol} columns\nQuality Fields Found: ${qualityColumns.length}/${QUALITY_SCORE_FIELDS.length}\nDimension Map Entries: ${Object.keys(dimensionMap).length}\n\nCheck execution transcript for detailed logs!`);
    
  } catch (error) {
    console.error('❌ Sheet access test failed:', error);
    ui.alert(`❌ Test Failed: ${error.toString()}`);
  }
}

// Enhanced main processing function
function processShopifyData() {
  const ui = SpreadsheetApp.getUi();
  
  console.log('🚀 Starting processShopifyData...');
  
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const dataSheet = spreadsheet.getSheetByName('Raw_Data') || spreadsheet.getActiveSheet();
    
    console.log(`✅ Using sheet: ${dataSheet.getName()}`);
    
    ui.alert('🚀 Processing Started: Loading rules and preparing data...');
    
    // Load rule sheets
    const warrantyRules = loadRulesFromSheet(spreadsheet, 'Warranty_Rules');
    const materialRules = loadRulesFromSheet(spreadsheet, 'Material_Rules');
    const installationRules = loadRulesFromSheet(spreadsheet, 'Installation_Rules');
    const styleRules = loadRulesFromSheet(spreadsheet, 'Style_Rules');
    const gradeRules = loadRulesFromSheet(spreadsheet, 'Grade_Rules');
    const locationRules = loadRulesFromSheet(spreadsheet, 'Location_Rules');
    const drainRules = loadRulesFromSheet(spreadsheet, 'Drain_Rules');
    
    // Load dimension lookup data
    const dimensionMap = loadDimensionMap(spreadsheet);
    
    // Setup quality score formula (much faster than script calculation)
    setupQualityScoreFormula();
    
    const lastRow = dataSheet.getLastRow();
    const lastCol = dataSheet.getLastColumn();
    
    if (lastRow < 2) {
      ui.alert('❌ No Data Found: Please add data starting from row 2.');
      return;
    }
    
    const BATCH_SIZE = 25;
    let processedCount = 0;
    let totalUpdates = 0;
    let totalCleared = 0;
    let totalHighlights = 0;
    let highlightsToAdd = [];
    
    console.log(`🔄 Processing ${lastRow - 1} rows in batches of ${BATCH_SIZE}...`);
    
    // Process in batches
    for (let startRow = 2; startRow <= lastRow; startRow += BATCH_SIZE) {
      const endRow = Math.min(startRow + BATCH_SIZE - 1, lastRow);
      const batchSize = endRow - startRow + 1;
      
      console.log(`📦 Processing batch: rows ${startRow} to ${endRow}`);
      
      try {
        const dataRange = dataSheet.getRange(startRow, 1, batchSize, lastCol);
        const data = dataRange.getValues();
        
        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          const rowIndex = startRow + i;
          
          // Skip empty rows - check Title column (F = index 5)
          if (!row[5] || row[5].toString().trim() === '') continue;
          
          console.log(`🔍 Processing row ${rowIndex}: ${row[5].toString().substring(0, 50)}...`);
          
          try {
            const result = processRowSafely(row, {
              warranty: warrantyRules,
              material: materialRules,
              installation: installationRules,
              style: styleRules,
              grade: gradeRules,
              location: locationRules,
              drain: drainRules
            }, dimensionMap);
            
            // Apply updates
            for (const update of result.updates) {
              try {
                if (update.value !== undefined && update.value !== row[update.col - 1]) {
                  dataSheet.getRange(rowIndex, update.col).setValue(update.value);
                  if (update.value === '') {
                    totalCleared++;
                  } else {
                    totalUpdates++;
                  }
                }
              } catch (cellError) {
                console.error(`⚠️ Cell update error:`, cellError);
              }
            }
            
            // Apply highlights and collect for rule addition
            for (const highlight of result.noRuleMatches) {
              try {
                const cell = dataSheet.getRange(rowIndex, highlight.col);
                cell.setBackground('#ffcccc');
                cell.setNote(`⚠️ ${highlight.reason}\n\nValue will be auto-added to rules on next "Auto-Add Highlights to Rules" run.`);
                totalHighlights++;
                
                highlightsToAdd.push({
                  rowIndex: rowIndex,
                  col: highlight.col,
                  value: highlight.value,
                  ruleType: highlight.ruleType,
                  reason: highlight.reason
                });
                
              } catch (highlightError) {
                console.error(`⚠️ Highlight error:`, highlightError);
              }
            }
            
            processedCount++;
            
          } catch (rowError) {
            console.error(`❌ Error processing row ${rowIndex}:`, rowError);
            continue;
          }
        }
        
        Utilities.sleep(100);
        
      } catch (batchError) {
        console.error(`❌ Error processing batch:`, batchError);
        continue;
      }
    }
    
    const message = `🎉 Processing Complete!\n\n📊 Results:\n• ${processedCount} products processed\n• ${totalUpdates} fields auto-populated\n• ${totalCleared} non-standard values cleared\n• ${totalHighlights} fields highlighted for review\n\n💡 Next Steps:\n1. Run "Auto-Add Highlights to Rules" to add search terms\n2. Edit rule sheets: Fill Standard Values or leave blank to DELETE\n3. Run "Setup Quality Score Formula" for instant quality tracking\n4. Run "Apply Quality Score Colors" if colors are missing\n5. Re-run processing to apply new rules\n\n📝 Rule Logic:\n• Search Term + Standard Value = Replace\n• Search Term + Blank Standard = DELETE from data\n• No Search Term = Highlight for review\n\n🔄 Override Behavior:\n• Dimension_Map: Always overrides existing length/width/depth\n• Warranty_Rules: Always overrides existing warranty values\n• Boolean Fields: Always set TRUE/FALSE based on Installation Type\n• Other Rules: Only fill empty cells\n\n📐 Dimension Lookup:\n• Key matching between Raw_Data and Dimension_Map\n• Auto-populates Length, Width, Depth from lookup table\n\n📈 Quality scores update automatically with formula!`;
    
    console.log('✅ Processing completed successfully');
    ui.alert(message);
    
  } catch (error) {
    const errorMessage = `❌ Processing Error: ${error.toString()}`;
    console.error('❌ Main processing error:', error);
    ui.alert(errorMessage);
  }
}

// Enhanced row processing with CORRECTED column mappings and ENHANCED BOOLEAN LOGIC
function processRowSafely(row, allRules, dimensionMap) {
  const updates = [];
  const noRuleMatches = [];
  
  try {
    const title = (row[5] || '').toString();     // Column F
    const vendor = (row[6] || '').toString();    // Column G
    const key = (row[2] || '').toString().trim(); // Column C

    // Helper to check if a value is already a standard name
    function isStandardName(value, rules) {
      if (!value || !rules) return false;
      const trimmedValue = value.toString().trim();
      const standardValues = Object.values(rules).filter(val => val && val.toString().trim() !== '');
      return standardValues.some(standardValue => 
        standardValue.toString().trim().toLowerCase() === trimmedValue.toLowerCase()
      );
    }

    // Helper to normalize boolean values
    function normalizeBooleanValue(value) {
      if (value === true || value === 'TRUE' || value === 'true' || value === 'True') {
        return 'TRUE';
      } else if (value === false || value === 'FALSE' || value === 'false' || value === 'False' || value === '' || value === null || value === undefined) {
        return 'FALSE';
      }
      return 'FALSE'; // Default to FALSE for any unrecognized value
    }

    // DIMENSION LOOKUP - Match key and populate dimensions (Columns U, V, W)
    // OVERRIDE BEHAVIOR: Dimension_Map always wins (replaces existing values)
    if (key && dimensionMap && dimensionMap[key]) {
      const dimensions = dimensionMap[key];
      console.log(`🔍 Found dimension match for key "${key}":`, dimensions);
      
      // Length - Column U (index 20)
      if (dimensions.length && row[20] !== dimensions.length) {
        updates.push({ col: 21, value: dimensions.length });
        console.log(`✅ Overriding length: ${row[20]} → ${dimensions.length} in column U`);
      }
      
      // Width - Column V (index 21)
      if (dimensions.width && row[21] !== dimensions.width) {
        updates.push({ col: 22, value: dimensions.width });
        console.log(`✅ Overriding width: ${row[21]} → ${dimensions.width} in column V`);
      }
      
      // Depth - Column W (index 22)
      if (dimensions.depth && row[22] !== dimensions.depth) {
        updates.push({ col: 23, value: dimensions.depth });
        console.log(`✅ Overriding depth: ${row[22]} → ${dimensions.depth} in column W`);
      }
    } else {
      if (!key) {
        console.log(`⚠️ No key found in column C for this row`);
      } else if (!dimensionMap) {
        console.log(`⚠️ Dimension map is empty or not loaded`);
      } else if (!dimensionMap[key]) {
        console.log(`⚠️ No dimension match found for key "${key}"`);
        console.log(`Available keys: ${Object.keys(dimensionMap).slice(0, 5).join(', ')}...`);
      }
    }

    // Installation Type (Column I = index 8)
    const installationType = findStandardValue(row[8], title, allRules.installation);
    if (installationType) {
      if (installationType === 'DELETE_VALUE') {
        updates.push({ col: 9, value: '' });
      } else {
        updates.push({ col: 9, value: installationType });
      }
    } else {
      const currentValue = row[8] ? row[8].toString().trim() : '';
      if (currentValue !== '' && !isStandardName(currentValue, allRules.installation)) {
        noRuleMatches.push({
          col: 9,
          value: currentValue,
          ruleType: 'installation',
          reason: `Not a standard Installation Type`
        });
      }
    }

    // Product Material (Column J = index 9)
    const material = findStandardValue(row[9], title, allRules.material);
    if (material) {
      if (material === 'DELETE_VALUE') {
        updates.push({ col: 10, value: '' });
      } else {
        updates.push({ col: 10, value: material });
      }
    } else {
      const currentValue = row[9] ? row[9].toString().trim() : '';
      if (currentValue !== '' && !isStandardName(currentValue, allRules.material)) {
        noRuleMatches.push({
          col: 10,
          value: currentValue,
          ruleType: 'material',
          reason: `Not a standard Material name`
        });
      }
    }

    // Grade of Material (Column K = index 10)
    const grade = findStandardValue(row[10], title, allRules.grade);
    if (grade) {
      if (grade === 'DELETE_VALUE') {
        updates.push({ col: 11, value: '' });
      } else {
        updates.push({ col: 11, value: grade });
      }
    } else {
      const currentValue = row[10] ? row[10].toString().trim() : '';
      if (currentValue !== '' && !isStandardName(currentValue, allRules.grade)) {
        noRuleMatches.push({
          col: 11,
          value: currentValue,
          ruleType: 'grade',
          reason: `Not a standard Grade name`
        });
      }
    }

    // Style (Column L = index 11)
    const style = findStandardValue(row[11], title, allRules.style);
    if (style) {
      if (style === 'DELETE_VALUE') {
        updates.push({ col: 12, value: '' });
      } else {
        updates.push({ col: 12, value: style });
      }
    } else {
      const currentValue = row[11] ? row[11].toString().trim() : '';
      if (currentValue !== '' && !isStandardName(currentValue, allRules.style)) {
        noRuleMatches.push({
          col: 12,
          value: currentValue,
          ruleType: 'style',
          reason: `Not a standard Style name`
        });
      }
    }

    // Warranty Years (Column M = index 12) - OVERRIDE BEHAVIOR: Warranty_Rules always wins
    const warranty = findWarranty(row[12], vendor, allRules.warranty);
    if (warranty) {
      if (warranty === 'DELETE_VALUE') {
        updates.push({ col: 13, value: '' });
        console.log(`✅ Deleting warranty value based on warranty rules`);
      } else if (row[12] !== warranty) {
        updates.push({ col: 13, value: warranty });
        console.log(`✅ Overriding warranty: ${row[12]} → ${warranty} based on vendor ${vendor}`);
      }
    }

    // Application Location (Column AG = index 32)
    const location = findStandardValue(row[32], title, allRules.location);
    if (location) {
      if (location === 'DELETE_VALUE') {
        updates.push({ col: 33, value: '' });
      } else {
        updates.push({ col: 33, value: location });
      }
    } else {
      const currentValue = row[32] ? row[32].toString().trim() : '';
      if (currentValue !== '' && !isStandardName(currentValue, allRules.location)) {
        noRuleMatches.push({
          col: 33,
          value: currentValue,
          ruleType: 'location',
          reason: `Not a standard Location name`
        });
      }
    }

    // Drain Position (Column AH = index 33)
    const drain = findStandardValue(row[33], title, allRules.drain);
    if (drain) {
      if (drain === 'DELETE_VALUE') {
        updates.push({ col: 34, value: '' });
      } else {
        updates.push({ col: 34, value: drain });
      }
    } else {
      const currentValue = row[33] ? row[33].toString().trim() : '';
      if (currentValue !== '' && !isStandardName(currentValue, allRules.drain)) {
        noRuleMatches.push({
          col: 34,
          value: currentValue,
          ruleType: 'drain',
          reason: `Not a standard Drain Position name`
        });
      }
    }

    // ===============================
    // ENHANCED BOOLEAN FIELD LOGIC - FIXED VERSION
    // ===============================
    
    // Get the installation type to process (either cleaned or original)
    const finalInstallationType = installationType || row[8] || '';
    const installationTypeStr = finalInstallationType.toString().toUpperCase().trim();
    
    console.log(`🔍 Processing boolean fields based on installation type: "${finalInstallationType}"`);
    
    // Parse installation type and handle compounds
    let installationTypes = [];
    if (installationTypeStr) {
      // Split by common separators and clean up
      const separators = [' & ', ' AND ', ', ', ',', ' + ', ' / ', '/'];
      let tempTypes = [installationTypeStr];
      
      for (const separator of separators) {
        if (installationTypeStr.includes(separator)) {
          tempTypes = installationTypeStr.split(separator);
          break; // Use first matching separator
        }
      }
      
      // Clean up and add to array
      installationTypes = tempTypes.map(type => type.trim()).filter(type => type.length > 0);
      console.log(`📋 Parsed installation types: [${installationTypes.join(', ')}]`);
    }
    
    // Helper function to check if any installation type contains keyword
    function hasInstallationType(keyword) {
      if (installationTypes.length === 0) return false;
      
      const keywords = [keyword.toUpperCase()];
      // Add common variations
      if (keyword.toUpperCase() === 'TOPMOUNT') {
        keywords.push('TOP MOUNT', 'TOP-MOUNT', 'SURFACE MOUNT');
      } else if (keyword.toUpperCase() === 'FLUSHMOUNT') {
        keywords.push('FLUSH MOUNT', 'FLUSH-MOUNT');
      }
      
      return installationTypes.some(type => 
        keywords.some(kw => type.includes(kw))
      );
    }
    
    // Is Undermount (Column O = index 14) - Always update
    const shouldBeUndermount = hasInstallationType('UNDERMOUNT');
    const newUndermount = shouldBeUndermount ? 'TRUE' : 'FALSE';
    const currentUndermount = normalizeBooleanValue(row[14]);
    
    // Always push update (don't check if different)
    updates.push({ col: 15, value: newUndermount });
    console.log(`✅ Boolean Update - Is Undermount: ${currentUndermount} → ${newUndermount} (Based on: "${finalInstallationType}")`);
    
    // Is Topmount (Column P = index 15) - Always update
    const shouldBeTopmount = hasInstallationType('TOPMOUNT');
    const newTopmount = shouldBeTopmount ? 'TRUE' : 'FALSE';
    const currentTopmount = normalizeBooleanValue(row[15]);
    
    // Always push update (don't check if different)
    updates.push({ col: 16, value: newTopmount });
    console.log(`✅ Boolean Update - Is Topmount: ${currentTopmount} → ${newTopmount} (Based on: "${finalInstallationType}")`);
    
    // Is Flushmount (Column Q = index 16) - Always update
    const shouldBeFlushmount = hasInstallationType('FLUSHMOUNT');
    const newFlushmount = shouldBeFlushmount ? 'TRUE' : 'FALSE';
    const currentFlushmount = normalizeBooleanValue(row[16]);
    
    // Always push update (don't check if different)
    updates.push({ col: 17, value: newFlushmount });
    console.log(`✅ Boolean Update - Is Flushmount: ${currentFlushmount} → ${newFlushmount} (Based on: "${finalInstallationType}")`);
    
    // Log summary for compound types
    if (installationTypes.length > 1) {
      console.log(`🔗 Compound installation type processed: "${finalInstallationType}"`);
      console.log(`   → Split into: [${installationTypes.join(', ')}]`);
      console.log(`   → Results: Undermount=${newUndermount}, Topmount=${newTopmount}, Flushmount=${newFlushmount}`);
    }

    // Has Overflow (Column R = index 17) - Only set TRUE if title mentions overflow
    if (!row[17] && title.toUpperCase().includes('OVERFLOW')) {
      updates.push({ col: 18, value: 'TRUE' });
      console.log(`✅ Setting Has Overflow to TRUE based on title containing "OVERFLOW"`);
    }

    // Bowls Number (Column T = index 19)
    if (!row[19]) {
      const bowlsNumber = extractBowlsNumber(title);
      if (bowlsNumber) {
        updates.push({ col: 20, value: bowlsNumber });
        console.log(`✅ Setting Bowls Number to ${bowlsNumber} based on title analysis`);
      }
    }

    // Calculated fields
    // Min Cabinet Size (Column X = index 23) - based on overall_width_mm (Column V = index 21)
    if (!row[23] && row[21]) {
      const cabinetSize = calculateCabinetSize(row[21]);
      if (cabinetSize) {
        updates.push({ col: 24, value: cabinetSize });
        console.log(`✅ Calculated Min Cabinet Size: ${cabinetSize}mm (width + 100mm)`);
      }
    }

    // Calculate capacity based on Bowl Width, Depth, Height (Columns Z, AA, AB = indices 25, 26, 27)
    if (!row[25] && row[25] && row[26] && row[27]) {
      const capacity = calculateCapacityFromBowlDimensions(row[25], row[26], row[27], extractShapeFromTitle(title));
      if (capacity) {
        updates.push({ col: 26, value: capacity });
        console.log(`✅ Calculated capacity: ${capacity}L based on bowl dimensions`);
      }
    }

    // Brand Name (Column AF = index 31) and Vendor (Column G = index 6) sync
    const brandName = row[31] ? row[31].toString().trim() : '';

    // If brand_name is populated but vendor is empty, copy brand_name to vendor
    if (brandName && (!vendor || vendor.toString().trim() === '')) {
      updates.push({ col: 7, value: brandName });
      console.log(`✅ Setting Vendor to brand_name: ${brandName}`);
    }

    // If vendor is populated but brand_name is empty, copy vendor to brand_name (existing logic)
    if (!brandName && vendor) {
      updates.push({ col: 32, value: vendor });
      console.log(`✅ Setting Brand Name to vendor: ${vendor}`);
    }

    // If both are populated but different, prioritize brand_name (AI extracted data)
    if (brandName && vendor && brandName !== vendor.toString().trim()) {
      updates.push({ col: 7, value: brandName });
      console.log(`✅ Syncing vendor to match brand_name: ${vendor} → ${brandName}`);
    }

    return { updates, noRuleMatches };
    
  } catch (error) {
    console.error('Error in processRowSafely:', error);
    return { updates: [], noRuleMatches: [] };
  }
}

// Auto-add highlighted values to rule sheets with CORRECTED column mappings
function autoAddHighlightsToRules() {
  const ui = SpreadsheetApp.getUi();
  
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const dataSheet = spreadsheet.getSheetByName('Raw_Data') || spreadsheet.getActiveSheet();
    
    const lastRow = dataSheet.getLastRow();
    const lastCol = dataSheet.getLastColumn();
    
    if (lastRow < 2) {
      ui.alert('No data found to process.');
      return;
    }
    
    let addedToRules = 0;
    let processedHighlights = 0;
    let totalCellsScanned = 0;
    let highlightedCells = [];
    
    const ruleSheetMap = {
      'installation': 'Installation_Rules',
      'material': 'Material_Rules',
      'grade': 'Grade_Rules',
      'style': 'Style_Rules',
      'location': 'Location_Rules',
      'drain': 'Drain_Rules'
    };
    
    console.log('🎯 Scanning for highlighted cells to convert to rules...');
    console.log(`📏 Scanning ${lastRow - 1} rows, ${lastCol} columns`);
    
    // Scan for highlighted cells
    for (let row = 2; row <= lastRow; row++) {
      for (let col = 1; col <= lastCol; col++) {
        totalCellsScanned++;
        
        try {
          const cell = dataSheet.getRange(row, col);
          const background = cell.getBackground();
          
          const isRed = background === '#ffcccc' || 
                       background === '#FFCCCC' || 
                       background.toLowerCase() === '#ffcccc' ||
                       background === 'red' ||
                       (background && background.includes('ff') && background.includes('cc'));
          
          if (isRed) {
            const cellValue = cell.getValue();
            const columnLetter = String.fromCharCode(64 + col);
            
            console.log(`🔍 Found highlighted cell at ${columnLetter}${row}: "${cellValue}" (Background: ${background})`);
            
            highlightedCells.push({
              row: row,
              col: col,
              value: cellValue,
              background: background
            });
            
            if (cellValue && cellValue.toString().trim() !== '') {
              
              let ruleType = null;
              // CORRECTED column mappings
              if (col === 9) ruleType = 'installation';      // Column I
              else if (col === 10) ruleType = 'material';    // Column J
              else if (col === 11) ruleType = 'grade';       // Column K
              else if (col === 12) ruleType = 'style';       // Column L
              else if (col === 33) ruleType = 'location';    // Column AG
              else if (col === 34) ruleType = 'drain';       // Column AH
              
              console.log(`📍 Column ${col} (${columnLetter}) mapped to rule type: ${ruleType}`);
              
              if (ruleType && ruleSheetMap[ruleType]) {
                console.log(`🔄 Attempting to add "${cellValue}" to ${ruleSheetMap[ruleType]}`);
                
                const added = addValueToRuleSheet(spreadsheet, ruleSheetMap[ruleType], cellValue.toString().trim());
                if (added) {
                  addedToRules++;
                  
                  cell.setBackground(null);
                  cell.clearNote();
                  
                  console.log(`✅ Successfully added "${cellValue}" to ${ruleSheetMap[ruleType]} and cleared highlight`);
                } else {
                  console.log(`⚠️ Failed to add "${cellValue}" to ${ruleSheetMap[ruleType]} (might already exist)`);
                }
              } else {
                console.log(`⚠️ Column ${col} (${columnLetter}) not mapped to any rule type`);
              }
              
              processedHighlights++;
            } else {
              console.log(`⚠️ Highlighted cell at ${columnLetter}${row} is empty`);
            }
          }
        } catch (cellError) {
          console.error(`❌ Error processing cell (${row}, ${col}):`, cellError);
        }
      }
      
      if (row % 20 === 0) {
        console.log(`📊 Progress: Scanned row ${row}/${lastRow}`);
      }
    }
    
    console.log(`🔍 Scan complete: ${totalCellsScanned} cells scanned, ${highlightedCells.length} highlighted cells found`);
    
    let summary = `🎯 Auto-Add Complete!\n\n📊 Scan Results:\n• ${totalCellsScanned} cells scanned\n• ${highlightedCells.length} highlighted cells found\n• ${processedHighlights} highlighted cells with values\n• ${addedToRules} new search terms added\n\n`;
    
    if (highlightedCells.length === 0) {
      summary += `❓ No highlighted cells found.\n\nTo debug:\n1. Check cells are highlighted in RED (#ffcccc)\n2. Run "Process Shopify Data" first to create highlights\n3. Check execution transcript for details`;
    } else if (addedToRules === 0) {
      summary += `⚠️ Found highlighted cells but none were added to rules.\n\nPossible reasons:\n1. Highlighted cells not in correct columns (I, J, K, L, AG, AH)\n2. Values already exist in rule sheets\n3. Rule sheets don't exist - run "Create Rule Sheets" first\n\nCheck execution transcript for details`;
    } else {
      summary += `📝 Next Steps:\n1. Review rule sheets and fill in STANDARD VALUES\n2. Leave Standard Value BLANK to DELETE that value from data\n3. Run "Process Shopify Data" to apply rules\n\n💡 Workflow:\n• Search Term + Standard Value = Replace with standard\n• Search Term + Blank Standard = Delete from data\n• No Search Term = Highlight for review`;
    }
    
    ui.alert(summary);
    
  } catch (error) {
    ui.alert('Error auto-adding highlights: ' + error.toString());
    console.error('Auto-add highlights error:', error);
  }
}

// ===============================
// HELPER FUNCTIONS
// ===============================

// Helper function to add value to rule sheet
function addValueToRuleSheet(spreadsheet, sheetName, value) {
  try {
    const ruleSheet = spreadsheet.getSheetByName(sheetName);
    if (!ruleSheet) {
      console.log(`⚠️ ${sheetName} not found`);
      return false;
    }
    
    const data = ruleSheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().trim().toUpperCase() === value.toUpperCase()) {
        console.log(`⚠️ "${value}" already exists in ${sheetName}`);
        return false;
      }
    }
    
    const lastRow = ruleSheet.getLastRow();
    const newRow = lastRow + 1;
    
    ruleSheet.getRange(newRow, 1).setValue(value);
    ruleSheet.getRange(newRow, 2).setValue('');
    
    ruleSheet.getRange(newRow, 2).setNote('📝 Enter standard value here, or leave blank to DELETE this value from data');
    
    return true;
    
  } catch (error) {
    console.error(`Error adding to ${sheetName}:`, error);
    return false;
  }
}

// Setup Quality Score Formula
function setupQualityScoreFormula() {
  const ui = SpreadsheetApp.getUi();
  
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const dataSheet = spreadsheet.getSheetByName('Raw_Data') || spreadsheet.getActiveSheet();
    
    const qualityColumns = findQualityScoreColumns(spreadsheet);
    
    if (qualityColumns.length === 0) {
      ui.alert('⚠️ No quality score columns found. Make sure your headers match the expected metafield names.');
      return;
    }
    
    const qualityScoreColumn = findOrCreateQualityColumn(dataSheet);
    
    if (!qualityScoreColumn) {
      ui.alert('❌ Could not create Quality Score column');
      return;
    }
    
    const lastRow = dataSheet.getLastRow();
    
    if (lastRow < 2) {
      ui.alert('No data rows found.');
      return;
    }
    
    const columnLetters = qualityColumns.map(col => columnNumberToLetter(col));
    const totalFields = qualityColumns.length;
    
    console.log(`📊 Creating quality formula for columns: ${columnLetters.join(', ')}`);
    
    let formula = `=ROUND((`;
    const countFormulas = columnLetters.map(letter => `IF(${letter}2<>"",1,0)`);
    formula += countFormulas.join('+');
    formula += `)/${totalFields}*100,0)`;
    
    console.log(`📝 Quality formula: ${formula}`);
    
    dataSheet.getRange(2, qualityScoreColumn).setFormula(formula);
    
    if (lastRow > 2) {
      const sourceRange = dataSheet.getRange(2, qualityScoreColumn);
      const targetRange = dataSheet.getRange(2, qualityScoreColumn, lastRow - 1, 1);
      sourceRange.copyTo(targetRange);
    }
    
    setupQualityScoreFormatting(dataSheet, qualityScoreColumn, lastRow);
    
    ui.alert(`✅ Quality Score Formula Setup Complete!\n\n📊 Details:\n• Formula applied to ${lastRow - 1} rows\n• Tracking ${qualityColumns.length} quality fields\n• Auto-updates when data changes\n• Color-coded quality scores:\n  🟢 Green (90-100%): Excellent\n  🟡 Yellow (70-89%): Good\n  🔴 Light Red (50-69%): Fair\n  🔴 Dark Red (0-49%): Poor\n\n💡 Quality scores will now update instantly!`);
    
  } catch (error) {
    ui.alert('Error setting up quality formula: ' + error.toString());
    console.error('Quality formula setup error:', error);
  }
}

// Apply quality score color coding
function applyQualityScoreColors() {
  const ui = SpreadsheetApp.getUi();
  
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const dataSheet = spreadsheet.getSheetByName('Raw_Data') || spreadsheet.getActiveSheet();
    
    const qualityScoreColumn = findOrCreateQualityColumn(dataSheet);
    
    if (!qualityScoreColumn) {
      ui.alert('❌ Quality Score column not found. Run "Setup Quality Score Formula" first.');
      return;
    }
    
    const lastRow = dataSheet.getLastRow();
    
    if (lastRow < 2) {
      ui.alert('No data rows found.');
      return;
    }
    
    setupQualityScoreFormatting(dataSheet, qualityScoreColumn, lastRow);
    
    ui.alert(`✅ Quality Score Colors Applied!\n\n🎨 Color Coding:\n🟢 Green (90-100%): Excellent completion\n🟡 Yellow (70-89%): Good completion\n🔴 Light Red (50-69%): Fair completion\n🔴 Dark Red (0-49%): Poor completion\n\nApplied to ${lastRow - 1} rows in column ${columnNumberToLetter(qualityScoreColumn)}`);
    
  } catch (error) {
    ui.alert('Error applying quality score colors: ' + error.toString());
    console.error('Quality score color error:', error);
  }
}

function findQualityScoreColumns(spreadsheet) {
  try {
    const dataSheet = spreadsheet.getSheetByName('Raw_Data') || spreadsheet.getActiveSheet();
    const headers = dataSheet.getRange(1, 1, 1, dataSheet.getLastColumn()).getValues()[0];
    const qualityColumns = [];
    
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i].toString().toLowerCase();
      
      for (const field of QUALITY_SCORE_FIELDS) {
        if (header.includes(field.toLowerCase()) || 
            header.includes(field.replace(/_/g, ' ')) ||
            header.includes(field.replace(/_/g, ''))) {
          qualityColumns.push(i + 1);
          break;
        }
      }
    }
    
    console.log(`📊 Found ${qualityColumns.length}/${QUALITY_SCORE_FIELDS.length} quality columns`);
    return qualityColumns;
    
  } catch (error) {
    console.error('Error finding quality columns:', error);
    return [];
  }
}

function columnNumberToLetter(column) {
  let temp, letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}

function setupQualityScoreFormatting(dataSheet, qualityScoreColumn, lastRow) {
  try {
    if (lastRow < 2) return;
    
    const range = dataSheet.getRange(2, qualityScoreColumn, lastRow - 1, 1);
    
    range.clearFormat();
    
    const rules = [];
    
    const greenRule = SpreadsheetApp.newConditionalFormatRule()
      .setRanges([range])
      .whenNumberGreaterThanOrEqualTo(90)
      .setBackground('#d4edda')
      .setFontColor('#155724')
      .build();
    rules.push(greenRule);
    
    const yellowRule = SpreadsheetApp.newConditionalFormatRule()
      .setRanges([range])
      .whenNumberBetween(70, 89)
      .setBackground('#fff3cd')
      .setFontColor('#856404')
      .build();
    rules.push(yellowRule);
    
    const lightRedRule = SpreadsheetApp.newConditionalFormatRule()
      .setRanges([range])
      .whenNumberBetween(50, 69)
      .setBackground('#f8d7da')
      .setFontColor('#721c24')
      .build();
    rules.push(lightRedRule);
    
    const darkRedRule = SpreadsheetApp.newConditionalFormatRule()
      .setRanges([range])
      .whenNumberBetween(0, 49)
      .setBackground('#f5c6cb')
      .setFontColor('#721c24')
      .build();
    rules.push(darkRedRule);
    
    dataSheet.setConditionalFormatRules(rules);
    
    console.log('✅ Quality score color coding applied');
    
  } catch (error) {
    console.error('Error setting up quality score formatting:', error);
    
    try {
      for (let row = 2; row <= lastRow; row++) {
        const cell = dataSheet.getRange(row, qualityScoreColumn);
        const value = cell.getValue();
        
        if (typeof value === 'number') {
          if (value >= 90) {
            cell.setBackground('#d4edda').setFontColor('#155724');
          } else if (value >= 70) {
            cell.setBackground('#fff3cd').setFontColor('#856404');
          } else if (value >= 50) {
            cell.setBackground('#f8d7da').setFontColor('#721c24');
          } else {
            cell.setBackground('#f5c6cb').setFontColor('#721c24');
          }
        }
      }
      console.log('✅ Fallback quality score coloring applied');
    } catch (fallbackError) {
      console.error('Fallback coloring also failed:', fallbackError);
    }
  }
}

function findOrCreateQualityColumn(dataSheet) {
  try {
    const headers = dataSheet.getRange(1, 1, 1, dataSheet.getLastColumn()).getValues()[0];
    
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i].toString().toLowerCase();
      if (header.includes('quality') && header.includes('score')) {
        return i + 1;
      }
    }
    
    const lastCol = dataSheet.getLastColumn();
    const newQualityCol = lastCol + 1;
    
    dataSheet.getRange(1, newQualityCol).setValue('Quality Score %');
    dataSheet.getRange(1, newQualityCol).setFontWeight('bold').setBackground('#e6f3ff');
    
    return newQualityCol;
    
  } catch (error) {
    console.error('Error finding/creating quality column:', error);
    return null;
  }
}

function isValueInStandardList(value, rules) {
  if (!rules || !value) return false;
  
  const standardValues = Object.values(rules).filter(val => val && val.toString().trim() !== '');
  const trimmedValue = value.toString().trim();
  
  return standardValues.some(standardValue => 
    standardValue.toString().trim().toLowerCase() === trimmedValue.toLowerCase()
  );
}

function loadRulesFromSheet(spreadsheet, sheetName) {
  try {
    const ruleSheet = spreadsheet.getSheetByName(sheetName);
    if (!ruleSheet) {
      console.log(`⚠️ ${sheetName} not found`);
      return {};
    }
    
    const rules = {};
    const data = ruleSheet.getDataRange().getValues();
    
    if (data.length < 2) return {};
    
    for (let i = 1; i < data.length; i++) {
      const searchTerm = data[i][0];
      const standardValue = data[i][1];
      
      if (searchTerm) {
        const key = searchTerm.toString().trim().toUpperCase();
        rules[key] = standardValue ? standardValue.toString().trim() : '';
      }
    }
    
    console.log(`✅ Loaded ${Object.keys(rules).length} rules from ${sheetName}`);
    return rules;
    
  } catch (error) {
    console.error(`Error loading ${sheetName}:`, error);
    return {};
  }
}

function loadDimensionMap(spreadsheet) {
  try {
    const dimensionSheet = spreadsheet.getSheetByName('Dimension_Map');
    if (!dimensionSheet) {
      console.log(`⚠️ Dimension_Map sheet not found`);
      return {};
    }
    
    const dimensionMap = {};
    const data = dimensionSheet.getDataRange().getValues();
    
    console.log(`📊 Dimension_Map has ${data.length} total rows`);
    
    if (data.length < 2) {
      console.log(`⚠️ Dimension_Map sheet is empty or only has headers`);
      return {};
    }
    
    // Log headers for debugging
    console.log(`📋 Dimension_Map headers:`, data[0]);
    
    for (let i = 1; i < data.length; i++) {
      const key = data[i][2]; // Column C - Key
      const length = data[i][6]; // Column G - Length
      const width = data[i][7];  // Column H - Width  
      const depth = data[i][8];  // Column I - Depth
      
      console.log(`🔍 Row ${i + 1}: Key="${key}", Length="${length}", Width="${width}", Depth="${depth}"`);
      
      if (key) {
        const keyStr = key.toString().trim();
        dimensionMap[keyStr] = {
          length: length || null,
          width: width || null,
          depth: depth || null
        };
        console.log(`✅ Added key "${keyStr}" to dimension map`);
      } else {
        console.log(`⚠️ Row ${i + 1} has empty key in column C`);
      }
    }
    
    console.log(`✅ Loaded ${Object.keys(dimensionMap).length} dimension entries from Dimension_Map`);
    console.log(`📋 Sample keys:`, Object.keys(dimensionMap).slice(0, 5));
    return dimensionMap;
    
  } catch (error) {
    console.error(`Error loading Dimension_Map:`, error);
    return {};
  }
}

function findStandardValue(currentValue, title, rules) {
  if (!rules || Object.keys(rules).length === 0) return null;
  
  if (currentValue && currentValue.toString().trim() !== '') {
    const standardValues = Object.values(rules).filter(val => val && val.toString().trim() !== '');
    if (standardValues.includes(currentValue.toString().trim())) {
      return null;
    }
    
    // Check if this is a compound value (contains commas)
    const currentStr = currentValue.toString().trim();
    if (currentStr.includes(',')) {
      return processCompoundValue(currentStr, rules);
    }
    
    // Single value processing (existing logic)
    const upperCurrent = currentStr.toUpperCase();
    for (const [searchTerm, standardValue] of Object.entries(rules)) {
      if (upperCurrent.includes(searchTerm)) {
        if (!standardValue || standardValue.toString().trim() === '') {
          return 'DELETE_VALUE';
        }
        return standardValue;
      }
    }
  }
  
  if (title) {
    const upperTitle = title.toString().toUpperCase();
    for (const [searchTerm, standardValue] of Object.entries(rules)) {
      if (upperTitle.includes(searchTerm)) {
        if (!standardValue || standardValue.toString().trim() === '') {
          return 'DELETE_VALUE';
        }
        return standardValue;
      }
    }
  }
  
  return null;
}

function processCompoundValue(currentValue, rules) {
  // Split by comma and clean up each part
  const parts = currentValue.split(',').map(part => part.trim()).filter(part => part.length > 0);
  
  if (parts.length === 0) return null;
  
  const processedParts = [];
  let hasAnyMatch = false;
  let shouldDelete = false;
  
  console.log(`🔍 Processing compound value: "${currentValue}" with ${parts.length} parts`);
  
  for (const part of parts) {
    const upperPart = part.toUpperCase();
    let foundMatch = false;
    
    // Check if this part matches any rule
    for (const [searchTerm, standardValue] of Object.entries(rules)) {
      if (upperPart.includes(searchTerm)) {
        foundMatch = true;
        hasAnyMatch = true;
        
        if (!standardValue || standardValue.toString().trim() === '') {
          // This part should be deleted
          shouldDelete = true;
          console.log(`❌ Part "${part}" matched "${searchTerm}" → DELETE`);
        } else {
          // This part should be replaced
          processedParts.push(standardValue.toString().trim());
          console.log(`✅ Part "${part}" matched "${searchTerm}" → "${standardValue}"`);
        }
        break; // Stop at first match for this part
      }
    }
    
    // If no rule matched this part, keep it as-is
    if (!foundMatch) {
      processedParts.push(part);
      console.log(`⚠️ Part "${part}" has no matching rule - keeping as-is`);
    }
  }
  
  // If any part should be deleted, return DELETE_VALUE for the whole cell
  if (shouldDelete) {
    console.log(`🗑️ Compound value contains parts marked for deletion - deleting entire cell`);
    return 'DELETE_VALUE';
  }
  
  // If we found matches and have processed parts, join them
  if (hasAnyMatch && processedParts.length > 0) {
    const result = processedParts.join(' & ');
    console.log(`🔗 Compound result: "${currentValue}" → "${result}"`);
    return result;
  }
  
  // No matches found
  return null;
}

function findWarranty(currentWarranty, vendor, warrantyRules) {
  // OVERRIDE BEHAVIOR: Always check for warranty rules regardless of current value
  if (!vendor || !warrantyRules) return null;
  
  const upperVendor = vendor.toString().trim().toUpperCase();
  
  if (warrantyRules[upperVendor]) {
    const standardValue = warrantyRules[upperVendor];
    if (!standardValue || standardValue.toString().trim() === '') {
      return 'DELETE_VALUE';
    }
    return standardValue;
  }
  
  for (const [brand, warranty] of Object.entries(warrantyRules)) {
    if (upperVendor.includes(brand) || brand.includes(upperVendor)) {
      if (!warranty || warranty.toString().trim() === '') {
        return 'DELETE_VALUE';
      }
      return warranty;
    }
  }
  
  return null;
}

function extractBowlsNumber(title) {
  if (!title) return null;
  
  const upperTitle = title.toString().toUpperCase();
  if (upperTitle.includes('DOUBLE BOWL') || upperTitle.includes('2 BOWL')) return 2;
  if (upperTitle.includes('TRIPLE BOWL') || upperTitle.includes('3 BOWL')) return 3;
  if (upperTitle.includes('SINGLE BOWL') || upperTitle.includes('1 BOWL')) return 1;
  
  const bowlMatch = upperTitle.match(/(\d+)\s*BOWL/);
  if (bowlMatch) return parseInt(bowlMatch[1]);
  
  return 1;
}

function extractShapeFromTitle(title) {
  if (!title) return 'Rectangle';
  
  const upperTitle = title.toString().toUpperCase();
  if (upperTitle.includes('ROUND') || upperTitle.includes('CIRCULAR')) return 'Round';
  if (upperTitle.includes('SQUARE')) return 'Square';
  if (upperTitle.includes('OVAL')) return 'Oval';
  
  return 'Rectangle';
}

function calculateCabinetSize(widthData) {
  if (!widthData) return null;
  
  try {
    if (widthData.toString().includes('{')) {
      const parsed = JSON.parse(widthData);
      if (parsed.width) return parseInt(parsed.width) + 100;
    }
    
    const width = parseInt(widthData.toString());
    if (width && !isNaN(width)) return width + 100;
    
    const dimensionStr = widthData.toString();
    const match = dimensionStr.match(/\d+/);
    if (match) return parseInt(match[0]) + 100;
    
  } catch (error) {
    console.log('Error calculating cabinet size:', error);
  }
  
  return null;
}

function calculateCapacityFromBowlDimensions(bowlWidth, bowlDepth, bowlHeight, shape) {
  if (!bowlWidth || !bowlDepth || !bowlHeight) return null;
  
  try {
    const width = parseInt(bowlWidth.toString());
    const depth = parseInt(bowlDepth.toString());
    const height = parseInt(bowlHeight.toString());
    
    if (!width || !depth || !height) return null;
    
    let volume = 0;
    const upperShape = shape.toString().toUpperCase();
    
    if (upperShape.includes('RECTANGULAR') || upperShape.includes('SQUARE') || upperShape.includes('RECTANGLE')) {
      volume = (width * depth * height) / 1000000;
    } else if (upperShape.includes('ROUND') || upperShape.includes('CIRCULAR')) {
      const radius = width / 2;
      volume = (Math.PI * radius * radius * height) / 1000000;
    } else {
      volume = (width * depth * height) / 1000000;
    }
    
    return volume > 0 ? Math.round(volume * 100) / 100 : null;
    
  } catch (error) {
    console.log('Error calculating capacity from bowl dimensions:', error);
    return null;
  }
}

function clearHighlights() {
  const ui = SpreadsheetApp.getUi();
  
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const dataSheet = spreadsheet.getSheetByName('Raw_Data') || spreadsheet.getActiveSheet();
    
    const lastRow = dataSheet.getLastRow();
    const lastCol = dataSheet.getLastColumn();
    
    if (lastRow < 2) {
      ui.alert('No data found to clear highlights from.');
      return;
    }
    
    const dataRange = dataSheet.getRange(2, 1, lastRow - 1, lastCol);
    dataRange.setBackground(null);
    dataRange.clearNote();
    
    ui.alert('✅ All highlights and notes cleared!');
    
  } catch (error) {
    ui.alert('Error clearing highlights: ' + error.toString());
  }
}

function showHighlightSummary() {
  const ui = SpreadsheetApp.getUi();
  
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const dataSheet = spreadsheet.getSheetByName('Raw_Data') || spreadsheet.getActiveSheet();
    
    const lastRow = dataSheet.getLastRow();
    const lastCol = dataSheet.getLastColumn();
    
    if (lastRow < 2) {
      ui.alert('No data found to check.');
      return;
    }
    
    let highlightCount = 0;
    const highlightsByColumn = {};
    
    for (let row = 2; row <= lastRow; row++) {
      for (let col = 1; col <= lastCol; col++) {
        const cell = dataSheet.getRange(row, col);
        const background = cell.getBackground();
        
        if (background === '#ffcccc') {
          highlightCount++;
          
          const columnLetter = String.fromCharCode(64 + col);
          if (!highlightsByColumn[columnLetter]) {
            highlightsByColumn[columnLetter] = 0;
          }
          highlightsByColumn[columnLetter]++;
        }
      }
    }
    
    if (highlightCount === 0) {
      ui.alert('No highlighted cells found.');
    } else {
      let summary = `Found ${highlightCount} highlighted cells:\n\n`;
      
      for (const [column, count] of Object.entries(highlightsByColumn)) {
        summary += `Column ${column}: ${count} cells\n`;
      }
      
      summary += '\nUse "Auto-Add Highlights to Rules" to convert these to rules automatically.';
      ui.alert(summary);
    }
    
  } catch (error) {
    ui.alert('Error checking highlights: ' + error.toString());
  }
}

function createRuleSheets() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  createSampleWarrantyRules(spreadsheet);
  createSampleMaterialRules(spreadsheet);
  createSampleInstallationRules(spreadsheet);
  createSampleStyleRules(spreadsheet);
  createSampleGradeRules(spreadsheet);
  createSampleLocationRules(spreadsheet);
  createSampleDrainRules(spreadsheet);
  
  SpreadsheetApp.getUi().alert('✅ All rule sheets created with sample data!');
}

function createSampleWarrantyRules(spreadsheet) {
  let sheet = spreadsheet.getSheetByName('Warranty_Rules');
  if (!sheet) {
    sheet = spreadsheet.insertSheet('Warranty_Rules');
    sheet.getRange('A1:B1').setValues([['Brand Name', 'Warranty Years']]);
    sheet.getRange('A1:B1').setFontWeight('bold').setBackground('#e6f3ff');
    sheet.autoResizeColumns(1, 2);
    console.log('✅ Created empty Warranty_Rules sheet with headers only');
  } else {
    console.log('⚠️ Warranty_Rules sheet already exists - leaving it unchanged');
  }
}

function createSampleMaterialRules(spreadsheet) {
  let sheet = spreadsheet.getSheetByName('Material_Rules');
  if (!sheet) {
    sheet = spreadsheet.insertSheet('Material_Rules');
    sheet.getRange('A1:B1').setValues([['Search Term', 'Standard Name']]);
    sheet.getRange('A1:B1').setFontWeight('bold').setBackground('#e6f3ff');
    sheet.autoResizeColumns(1, 2);
    console.log('✅ Created empty Material_Rules sheet with headers only');
  } else {
    console.log('⚠️ Material_Rules sheet already exists - leaving it unchanged');
  }
}

function createSampleInstallationRules(spreadsheet) {
  let sheet = spreadsheet.getSheetByName('Installation_Rules');
  if (!sheet) {
    sheet = spreadsheet.insertSheet('Installation_Rules');
    sheet.getRange('A1:B1').setValues([['Search Term', 'Standard Name']]);
    sheet.getRange('A1:B1').setFontWeight('bold').setBackground('#e6f3ff');
    sheet.autoResizeColumns(1, 2);
    console.log('✅ Created empty Installation_Rules sheet with headers only');
  } else {
    console.log('⚠️ Installation_Rules sheet already exists - leaving it unchanged');
  }
}

function createSampleStyleRules(spreadsheet) {
  let sheet = spreadsheet.getSheetByName('Style_Rules');
  if (!sheet) {
    sheet = spreadsheet.insertSheet('Style_Rules');
    sheet.getRange('A1:B1').setValues([['Search Term', 'Standard Name']]);
    sheet.getRange('A1:B1').setFontWeight('bold').setBackground('#e6f3ff');
    sheet.autoResizeColumns(1, 2);
    console.log('✅ Created empty Style_Rules sheet with headers only');
  } else {
    console.log('⚠️ Style_Rules sheet already exists - leaving it unchanged');
  }
}

function createSampleGradeRules(spreadsheet) {
  let sheet = spreadsheet.getSheetByName('Grade_Rules');
  if (!sheet) {
    sheet = spreadsheet.insertSheet('Grade_Rules');
    sheet.getRange('A1:B1').setValues([['Search Term', 'Standard Name']]);
    sheet.getRange('A1:B1').setFontWeight('bold').setBackground('#e6f3ff');
    sheet.autoResizeColumns(1, 2);
    console.log('✅ Created empty Grade_Rules sheet with headers only');
  } else {
    console.log('⚠️ Grade_Rules sheet already exists - leaving it unchanged');
  }
}

function createSampleLocationRules(spreadsheet) {
  let sheet = spreadsheet.getSheetByName('Location_Rules');
  if (!sheet) {
    sheet = spreadsheet.insertSheet('Location_Rules');
    sheet.getRange('A1:B1').setValues([['Search Term', 'Standard Name']]);
    sheet.getRange('A1:B1').setFontWeight('bold').setBackground('#e6f3ff');
    sheet.autoResizeColumns(1, 2);
    console.log('✅ Created empty Location_Rules sheet with headers only');
  } else {
    console.log('⚠️ Location_Rules sheet already exists - leaving it unchanged');
  }
}

function createSampleDrainRules(spreadsheet) {
  let sheet = spreadsheet.getSheetByName('Drain_Rules');
  if (!sheet) {
    sheet = spreadsheet.insertSheet('Drain_Rules');
    sheet.getRange('A1:B1').setValues([['Search Term', 'Standard Name']]);
    sheet.getRange('A1:B1').setFontWeight('bold').setBackground('#e6f3ff');
    sheet.autoResizeColumns(1, 2);
    console.log('✅ Created empty Drain_Rules sheet with headers only');
  } else {
    console.log('⚠️ Drain_Rules sheet already exists - leaving it unchanged');
  }
}