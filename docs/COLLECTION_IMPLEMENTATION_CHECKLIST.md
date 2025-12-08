# Collection Implementation Checklist

This checklist ensures all collections in the Cass Brothers PIM system are implemented consistently and completely.

---

## Quick Reference: Current Collections Status

| Collection | Config | Modal | JS | Docs | Product Cards | Status |
|------------|--------|-------|-----|------|---------------|--------|
| Sinks | ✅ | ✅ | ✅ | ✅ | ✅ | Complete |
| Taps | ✅ | ✅ | ✅ | ✅ | ✅ | Complete |
| Basins | ✅ | ✅ | ✅ | ❌ | ⚠️ | Needs Review |
| Filter Taps | ✅ | ✅ | ✅ | ❌ | ⚠️ | Needs Review |
| Showers | ✅ | ✅ | ✅ | ❌ | ⚠️ | Needs Review |
| Smart Toilets | ✅ | ✅ | ✅ | ❌ | ⚠️ | Needs Review |

---

## 1. Configuration (`config/collections.py`)

### Required Class Setup
- [ ] Class inherits from `CollectionConfig`
- [ ] `name` - lowercase identifier (e.g., 'taps')
- [ ] `display_name` - human-readable name (e.g., 'Taps')
- [ ] `spreadsheet_id` - Google Sheets ID
- [ ] `worksheet_name` - typically 'Raw_Data'

### Feature Flags
- [ ] `extract_images` - Enable/disable image extraction (True/False)
- [ ] `pricing_enabled` - Enable/disable pricing columns (True/False)

### Column Mapping
- [ ] `column_mapping` dictionary maps field names to column numbers (1-indexed)
- [ ] All columns from A to last column are mapped
- [ ] Field names match those used in JavaScript and templates

### AI Extraction Fields
- [ ] `ai_extraction_fields` list defines which fields AI can populate
- [ ] WELS fields excluded if using lookup instead of AI

### Quality Fields
- [ ] `quality_fields` list defines fields used for quality score calculation

### Pricing Fields (if applicable)
- [ ] `pricing_fields` dictionary (empty `{}` if pricing disabled)

### AI Content Fields
- [ ] `ai_description_field` - field for AI-generated description
- [ ] `ai_features_field` - field for AI-generated features
- [ ] `ai_care_field` - field for AI-generated care instructions

---

## 2. Product Modal (`templates/collection/modals/{collection}_modal.html`)

### Basic Structure
- [ ] Modal ID is `editProductModal`
- [ ] All form fields have unique IDs matching JS field mappings
- [ ] Hidden field for `editAdditionalImages` exists

### Required Sections
- [ ] Basic Product Info (SKU, Title, Vendor, Brand)
- [ ] Product Specifications (collection-specific fields)
- [ ] Content (body_html, features, care_instructions)
- [ ] SEO Information (seo_title, seo_description)
- [ ] Media & Images section with:
  - [ ] Spec sheet URL field (`editShopifySpecSheet`)
  - [ ] Image preview container (`imagePreviewContainer`)
  - [ ] New image URL input (`newImageUrl`)
  - [ ] Add image button calling `addNewImage()`
  - [ ] Images count badge (`additionalImagesCount`)
  - [ ] Current images list (`currentImagesList`)

### Boolean Fields
- [ ] Use `<select>` with Yes/No options (not TRUE/FALSE)
- [ ] Options: `<option value="">Select...</option>`, `<option value="Yes">Yes</option>`, `<option value="No">No</option>`

### Compare Button
- [ ] Button with ID `compareButton` exists
- [ ] Initially hidden (`style="display: none;"`)
- [ ] Calls `openCompareView()` onclick

### Footer Buttons
- [ ] Save button calls `saveProduct()`
- [ ] Close button dismisses modal

---

## 3. Collection JavaScript (`static/js/collection/{collection}.js`)

### Field Mappings
- [ ] `{COLLECTION}_FIELD_MAPPINGS` constant defined
- [ ] Maps form element IDs to data field names
- [ ] All modal fields included

### Global Variables
- [ ] `additionalImagesArray = []`
- [ ] `backgroundSaveQueue = []`
- [ ] `backgroundSaveInProgress = false`

### Required Functions

#### Data Collection
- [ ] `collectFormData(collectionName)` - gathers all form data
  - [ ] Boolean conversion (Yes/No → TRUE/FALSE) for saving
  - [ ] Images array included
  - [ ] Force-include important fields even if empty

#### Save Functions
- [ ] `save{Collection}Product()` - instant save with background sync
- [ ] `processBackgroundSaveQueue()` - processes background saves
- [ ] `addBackgroundSaveIndicator()` - shows sync indicator
- [ ] `updateBackgroundSaveIndicator(count)` - updates pending count
- [ ] `removeBackgroundSaveIndicator()` - removes indicator when done
- [ ] `showSubtleNotification(message, type)` - background notifications

#### Modal Population
- [ ] `populateCollectionSpecificFields(data)` - loads data into modal
  - [ ] Boolean conversion (TRUE/FALSE → Yes/No) for display
  - [ ] `additionalImagesArray` populated from `data.shopify_images`
  - [ ] Compare button visibility based on supplier URL
  - [ ] Calls `initializeAdditionalImages()` after population

#### Product Card Rendering
- [ ] `renderProductSpecs(product)` - renders specs on product cards
  - [ ] Dropdowns show current value from Google Sheet
  - [ ] Custom values (not in predefined list) added as selected option
  - [ ] Case-insensitive matching with `isSelected()` helper
  - [ ] `isInOptions()` helper for checking predefined options

#### Image Management
- [ ] `initializeAdditionalImages()` - loads images from hidden field
- [ ] `addNewImage()` - adds image URL to array
- [ ] `removeImage(index)` - removes image from array
- [ ] `updateAdditionalImagesDisplay()` - renders image preview cards
- [ ] `updateHiddenField()` - syncs array to hidden field

#### Drag and Drop
- [ ] `handleDragStart(event)`
- [ ] `handleDragOver(event)`
- [ ] `handleDrop(event)`
- [ ] `handleDragEnd(event)`
- [ ] `draggedIndex` variable for tracking

### Window Exports
All functions must be exported to window:
```javascript
// Save functions
window.collectFormData = collectFormData;
window.save{Collection}Product = save{Collection}Product;
window.saveProduct = save{Collection}Product;

// Image management
window.initializeAdditionalImages = initializeAdditionalImages;
window.addNewImage = addNewImage;
window.removeImage = removeImage;
window.updateAdditionalImagesDisplay = updateAdditionalImagesDisplay;
window.updateHiddenField = updateHiddenField;

// Drag and drop
window.handleDragStart = handleDragStart;
window.handleDragOver = handleDragOver;
window.handleDrop = handleDrop;
window.handleDragEnd = handleDragEnd;

// Product card rendering
window.renderProductSpecs = renderProductSpecs;

// Modal population
window.populateCollectionSpecificFields = populateCollectionSpecificFields;
```

### Keyboard Support
- [ ] Enter key in `newImageUrl` triggers `addNewImage()`

---

## 4. Data Processing (`core/data_processor.py`)

### Dual-Source Collections
If collection uses PDF + URL extraction:
- [ ] Add to `dual_source_collections` list
- [ ] Define dimension fields that prefer PDF source

### WELS Lookup (taps-like collections)
- [ ] WELS enrichment after AI extraction
- [ ] Brand-based lookup from reference sheet

---

## 5. Product Card Dropdowns

### Requirements for Dropdowns on Cards
- [ ] Dropdown shows "Select..." as first option
- [ ] Current value from sheet is selected
- [ ] If value not in predefined options, add as custom selected option
- [ ] Case-insensitive matching
- [ ] `onchange` calls `updateFieldFromCard(event)`
- [ ] `onclick` has `event.stopPropagation()`

### Example Implementation
```javascript
// Predefined options
const handleOptions = ['Pin Lever', 'Disc Handle', 'Twin Lever', 'Single Lever'];

// Build dropdown with custom value support
let optionsHtml = '<option value="">Select...</option>';
if (handleType && !isInOptions(handleType, handleOptions)) {
    optionsHtml += `<option value="${handleType}" selected>${handleType}</option>`;
}
handleOptions.forEach(opt => {
    optionsHtml += `<option value="${opt}" ${isSelected(handleType, opt) ? 'selected' : ''}>${opt}</option>`;
});
```

---

## 6. Documentation (`docs/{COLLECTION}_COLLECTION.md`)

### Required Sections
- [ ] Overview
- [ ] Configuration details
- [ ] Field Mappings table (Column, Field Name, Description)
- [ ] AI Extraction fields list
- [ ] Quality Fields list
- [ ] Templates & UI file references
- [ ] JavaScript functionality overview
- [ ] API Endpoints
- [ ] Data Flow diagram
- [ ] Common Workflows
- [ ] Troubleshooting

---

## 7. Testing Checklist

### Modal Tests
- [ ] Open modal → all fields populated from Google Sheet
- [ ] Boolean fields show Yes/No (not TRUE/FALSE)
- [ ] Images display as thumbnails
- [ ] Compare button visible when supplier URL exists
- [ ] Save → data written to Google Sheet correctly
- [ ] Boolean fields save as TRUE/FALSE
- [ ] Images preserved on save

### Product Card Tests
- [ ] Dropdowns show current value from sheet
- [ ] Custom values (not predefined) display correctly
- [ ] Changing dropdown updates sheet
- [ ] Other specs display correctly

### Image Management Tests
- [ ] Add image → appears in preview
- [ ] Remove image → removed from preview and array
- [ ] Drag to reorder → order updates
- [ ] Save → images saved to sheet
- [ ] Reload → images still present

---

## 8. Common Issues & Solutions

### Issue: Dropdown not showing sheet value
**Cause:** Strict equality comparison fails due to case/whitespace
**Solution:** Use `isSelected()` helper with case-insensitive, trimmed comparison

### Issue: Images deleted on save
**Cause:** `additionalImagesArray` not populated when modal opens
**Solution:** Populate from `data.shopify_images` in `populateCollectionSpecificFields()`

### Issue: Boolean fields not converting
**Cause:** Missing conversion in `populateCollectionSpecificFields()` or `collectFormData()`
**Solution:** Add TRUE/FALSE ↔ Yes/No conversion for boolean field IDs

### Issue: Compare button never shows
**Cause:** Not checking supplier URL in `populateCollectionSpecificFields()`
**Solution:** Check `data.url` and set `compareBtn.style.display`

### Issue: `pricing_fields` AttributeError
**Cause:** Collection config doesn't define `pricing_fields`
**Solution:** Add `self.pricing_fields = {}` to collection's `setup_fields()`

---

## 9. File Reference

| Purpose | File Path |
|---------|-----------|
| Collection Config | `config/collections.py` |
| Modal Template | `templates/collection/modals/{collection}_modal.html` |
| Collection JS | `static/js/collection/{collection}.js` |
| Base JS | `static/js/collection/base.js` |
| Data Processor | `core/data_processor.py` |
| Sheets Manager | `core/sheets_manager.py` |
| AI Extractor | `core/ai_extractor.py` |
| Data Cleaner | `core/data_cleaner.py` |
| Documentation | `docs/{COLLECTION}_COLLECTION.md` |

---

*Last Updated: December 2024*
