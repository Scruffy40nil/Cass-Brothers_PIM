# Collection Implementation Checklist

This checklist ensures all collections in the Cass Brothers PIM system are implemented consistently and completely.

---

## Quick Reference: Current Collections Status

| Collection | Config | Validator | JS Quality Fields | Modal | JS File | Docs | Status |
|------------|--------|-----------|-------------------|-------|---------|------|--------|
| Sinks | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **Complete** |
| Taps | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **Complete** |
| Basins | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **Complete** |
| Toilets | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | Needs Docs |
| Baths | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | Needs Docs |
| Showers | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | Needs Docs |
| Smart Toilets | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | Needs Docs |
| Filter Taps | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | Needs Docs |
| Hot Water | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | Needs Docs |
| Lighting | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | **Needs Config Review** |

### Legend
- ✅ = Complete and verified
- ❌ = Missing or needs work
- ⚠️ = Partially complete

---

## Per-Collection Detailed Checklist

### Sinks Collection
- [x] **Config** (`config/collections.py`) - SinksCollection class
- [x] **Validator** (`config/validation.py`) - SinksValidator in VALIDATORS registry
- [x] **JS Quality Fields** (`static/js/collection/base.js`) - COLLECTION_QUALITY_FIELDS['sinks']
- [x] **Modal** (`templates/collection/modals/sinks_modal.html`)
- [x] **JS File** (`static/js/collection/sinks.js`)
- [x] **Documentation** (`docs/SINKS_COLLECTION.md`)
- [x] Spec sheet field in quality_fields

### Taps Collection
- [x] **Config** (`config/collections.py`) - TapsCollection class
- [x] **Validator** (`config/validation.py`) - TapsValidator in VALIDATORS registry
- [x] **JS Quality Fields** (`static/js/collection/base.js`) - COLLECTION_QUALITY_FIELDS['taps']
- [x] **Modal** (`templates/collection/modals/taps_modal.html`)
- [x] **JS File** (`static/js/collection/taps.js`)
- [x] **Documentation** (`docs/TAPS_COLLECTION.md`)
- [x] Spec sheet field in quality_fields

### Basins Collection
- [x] **Config** (`config/collections.py`) - BasinsCollection class
- [x] **Validator** (`config/validation.py`) - BasinsValidator in VALIDATORS registry
- [x] **JS Quality Fields** (`static/js/collection/base.js`) - COLLECTION_QUALITY_FIELDS['basins']
- [x] **Modal** (`templates/collection/modals/basins_modal.html`)
- [x] **JS File** (`static/js/collection/basins.js`)
- [x] **Documentation** (`docs/BASINS_COLLECTION.md`)
- [x] Spec sheet field in quality_fields

### Toilets Collection
- [x] **Config** (`config/collections.py`) - ToiletsCollection class
- [x] **Validator** (`config/validation.py`) - ToiletsValidator in VALIDATORS registry
- [x] **JS Quality Fields** (`static/js/collection/base.js`) - COLLECTION_QUALITY_FIELDS['toilets']
- [x] **Modal** (`templates/collection/modals/toilets_modal.html`)
- [x] **JS File** (`static/js/collection/toilets.js`)
- [ ] **Documentation** - NEEDS CREATION
- [ ] Spec sheet field in quality_fields - CHECK IF NEEDED

### Baths Collection
- [x] **Config** (`config/collections.py`) - BathsCollection class
- [x] **Validator** (`config/validation.py`) - BathsValidator in VALIDATORS registry
- [x] **JS Quality Fields** (`static/js/collection/base.js`) - COLLECTION_QUALITY_FIELDS['baths']
- [x] **Modal** (`templates/collection/modals/baths_modal.html`)
- [x] **JS File** (`static/js/collection/baths.js`)
- [ ] **Documentation** - NEEDS CREATION
- [ ] Spec sheet field in quality_fields - CHECK IF NEEDED

### Showers Collection
- [x] **Config** (`config/collections.py`) - ShowersCollection class
- [x] **Validator** (`config/validation.py`) - ShowersValidator in VALIDATORS registry
- [x] **JS Quality Fields** (`static/js/collection/base.js`) - COLLECTION_QUALITY_FIELDS['showers']
- [x] **Modal** (`templates/collection/modals/showers_modal.html`)
- [x] **JS File** (`static/js/collection/showers.js`)
- [ ] **Documentation** - NEEDS CREATION
- [x] Spec sheet field in quality_fields

### Smart Toilets Collection
- [x] **Config** (`config/collections.py`) - SmartToiletsCollection class
- [x] **Validator** (`config/validation.py`) - SmartToiletsValidator in VALIDATORS registry
- [x] **JS Quality Fields** (`static/js/collection/base.js`) - COLLECTION_QUALITY_FIELDS['smart_toilets']
- [x] **Modal** (`templates/collection/modals/smart_toilets_modal.html`)
- [x] **JS File** (`static/js/collection/smart_toilets.js`)
- [ ] **Documentation** - NEEDS CREATION
- [x] Spec sheet field in quality_fields

### Filter Taps Collection
- [x] **Config** (`config/collections.py`) - FilterTapsCollection class
- [x] **Validator** (`config/validation.py`) - FilterTapsValidator in VALIDATORS registry
- [x] **JS Quality Fields** (`static/js/collection/base.js`) - COLLECTION_QUALITY_FIELDS['filter_taps']
- [x] **Modal** (`templates/collection/modals/filter_taps_modal.html`)
- [x] **JS File** (`static/js/collection/filter_taps.js`)
- [ ] **Documentation** - NEEDS CREATION
- [ ] Spec sheet field in quality_fields - CHECK IF NEEDED

### Hot Water Collection
- [x] **Config** (`config/collections.py`) - HotWaterCollection class
- [x] **Validator** (`config/validation.py`) - HotWaterValidator in VALIDATORS registry
- [x] **JS Quality Fields** (`static/js/collection/base.js`) - COLLECTION_QUALITY_FIELDS['hot_water']
- [x] **Modal** (`templates/collection/modals/hot_water_modal.html`)
- [x] **JS File** (`static/js/collection/hot_water.js`)
- [ ] **Documentation** - NEEDS CREATION
- [ ] Spec sheet field in quality_fields - CHECK IF NEEDED

### Lighting Collection (NEEDS REVIEW)
- [ ] **Config** - NO LightingCollection class exists in collections.py!
- [x] **Validator** (`config/validation.py`) - LightingValidator in VALIDATORS registry
- [ ] **JS Quality Fields** - NOT in COLLECTION_QUALITY_FIELDS
- [x] **Modal** (`templates/collection/modals/lighting_modal.html`)
- [x] **JS File** (`static/js/collection/lighting.js`)
- [ ] **Documentation** - NEEDS CREATION

---

## Component Requirements Checklist

### 1. Configuration (`config/collections.py`)

Each collection class must have:
- [ ] Class inherits from `CollectionConfig`
- [ ] `name` - lowercase identifier (e.g., 'basins')
- [ ] `display_name` - human-readable name (e.g., 'Basins')
- [ ] `spreadsheet_id` - Google Sheets ID
- [ ] `worksheet_name` - typically 'Raw_Data'
- [ ] `extract_images` - Enable/disable image extraction (True/False)
- [ ] `pricing_enabled` - Enable/disable pricing columns (True/False)
- [ ] `column_mapping` - dictionary maps field names to column numbers (1-indexed)
- [ ] `ai_extraction_fields` - list of fields AI can populate
- [ ] `quality_fields` - list of fields for quality score calculation
- [ ] `pricing_fields` - dictionary (empty `{}` if pricing disabled)
- [ ] `ai_description_field` - typically 'body_html'
- [ ] `ai_features_field` - typically 'features'
- [ ] `ai_care_field` - typically 'care_instructions'

### 2. Validator (`config/validation.py`)

Each collection must have:
- [ ] Validator class extending `CollectionValidator`
- [ ] `setup_validators()` method defining field validators
- [ ] Entry in `VALIDATORS` dictionary at bottom of file

### 3. JS Quality Fields (`static/js/collection/base.js`)

Each collection must have an entry in `COLLECTION_QUALITY_FIELDS`:
- [ ] Array of field names matching `quality_fields` in config
- [ ] Must include `shopify_spec_sheet` if collection uses spec sheets

### 4. Modal Template (`templates/collection/modals/{collection}_modal.html`)

Required elements:
- [ ] Modal ID is `editProductModal`
- [ ] All form fields have unique IDs matching JS field mappings
- [ ] Hidden field for `editAdditionalImages`
- [ ] Basic Product Info section (SKU, Title, Vendor, Brand)
- [ ] Product Specifications section (collection-specific fields)
- [ ] Content section (body_html, features, care_instructions)
- [ ] SEO section (seo_title, seo_description)
- [ ] Media & Images section with spec sheet field
- [ ] Boolean fields use `<select>` with Yes/No options
- [ ] Compare button (initially hidden)
- [ ] Save/Close buttons in footer

### 5. Collection JavaScript (`static/js/collection/{collection}.js`)

Required components:
- [ ] `{COLLECTION}_FIELD_MAPPINGS` constant
- [ ] `additionalImagesArray` global variable
- [ ] `collectFormData()` function
- [ ] `save{Collection}Product()` function
- [ ] `populateCollectionSpecificFields(data)` function
- [ ] `renderProductSpecs(product)` function
- [ ] Image management functions
- [ ] Window exports for all functions
- [ ] Content completion tracking (updateContentCompletionIndicators)
- [ ] Modal initialization event listener

### 6. Documentation (`docs/{COLLECTION}_COLLECTION.md`)

Required sections:
- [ ] Overview
- [ ] Google Sheet Structure (column mapping table)
- [ ] Quality Fields list
- [ ] AI Extraction Fields list
- [ ] File references
- [ ] Troubleshooting

---

## Consistency Verification Commands

### Check all validators exist:
```bash
grep -E "class \w+Validator\(" config/validation.py
grep -E "'[a-z_]+': \w+Validator" config/validation.py
```

### Check all collection configs exist:
```bash
grep -E "class \w+Collection\(CollectionConfig\)" config/collections.py
```

### Check JS quality fields:
```bash
grep -A 5 "COLLECTION_QUALITY_FIELDS" static/js/collection/base.js
```

### List all modals:
```bash
ls templates/collection/modals/*_modal.html
```

### List all collection JS files:
```bash
ls static/js/collection/*.js | grep -v base.js
```

---

## Common Issues & Solutions

### Issue: "Complete Products" count incorrect
**Cause:** Collection missing from VALIDATORS registry
**Solution:** Add validator class and registry entry in `config/validation.py`

### Issue: Quality scores always 100% or 0%
**Cause:** Stale cache or missing COLLECTION_QUALITY_FIELDS entry
**Solution:** Add entry to `COLLECTION_QUALITY_FIELDS` in `base.js`, clear cache

### Issue: Missing Fields modal shows wrong data
**Cause:** Stale cache data
**Solution:** API now uses `force_refresh=true` automatically

### Issue: Spec sheet not tracked in Missing Fields
**Cause:** `shopify_spec_sheet` not in `quality_fields`
**Solution:** Add to both `config/collections.py` and `base.js` COLLECTION_QUALITY_FIELDS

### Issue: Dropdown not showing selected value
**Cause:** Case-sensitive comparison or value not in options
**Solution:** Use `isSelected()` helper with case-insensitive matching

### Issue: Images lost on save
**Cause:** `additionalImagesArray` not populated on modal open
**Solution:** Populate from `data.shopify_images` in `populateCollectionSpecificFields()`

---

## File Reference

| Purpose | File Path |
|---------|-----------|
| Collection Configs | `config/collections.py` |
| Validators | `config/validation.py` |
| Base JS (quality fields) | `static/js/collection/base.js` |
| Modal Templates | `templates/collection/modals/{collection}_modal.html` |
| Collection JS | `static/js/collection/{collection}.js` |
| Documentation | `docs/{COLLECTION}_COLLECTION.md` |

---

*Last Updated: December 2024*
