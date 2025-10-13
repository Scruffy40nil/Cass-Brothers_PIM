# 🏗️ COLLECTION BUILD PLAN
## Optimized Build Sequence for Multiple Collections

**Your Strategy**: Build iteratively, with each step informing the next
**Time Per Collection**: 14-23 hours
**Recommended**: Build 1-2 collections fully before starting the next

---

## 🎯 PHASE 1: GOOGLE SHEETS & RULES (Foundation)
**Time**: 2-4 hours per collection
**Goal**: Define data structure and standardization rules

### Collection Priority Order (Recommended):

1. **Sinks** - Already done ✅
2. **Taps** - Next priority (high volume)
3. **Lighting** - After taps
4. **Shower Mixers** - After lighting
5. **Bathroom Vanities** - Last

### For Each Collection:

#### Step 1.1: Research Product Type (30-60 min)
```
[ ] Study 10-20 supplier product pages
[ ] List all attributes you see:
    - Core specs (material, type, finish, etc.)
    - Dimensions (varies by product type)
    - Features (overflow, dimmable, flow rate, etc.)
    - Installation details
[ ] Note variations in terminology:
    - "Stainless Steel" vs "SS" vs "304SS"
    - "Undermount" vs "Under Mount" vs "Under-mount"
[ ] Identify calculated fields:
    - Cabinet size (from width)
    - Cubic weight (from dimensions)
    - Capacity (from bowl size)
[ ] Identify boolean fields:
    - is_dimmable, has_overflow, is_thermostatic, etc.
```

**Output**: Spreadsheet with 3 columns:
| Field Name | Variations Seen | Standardized Value |
|------------|-----------------|-------------------|
| material | SS, Stainless, 304SS | Stainless Steel |
| material | Granite, Granite Composite | Granite Composite |

---

#### Step 1.2: Create Google Spreadsheet (60-90 min)

**Naming**: `{Collection Name} - PIM Data`

**Worksheet Structure**:

```
WORKSHEET: Raw_Data

COLUMNS A-G (System Fields - SAME FOR ALL COLLECTIONS):
A  - url                    (Source URL)
B  - variant_sku            (Product SKU)
C  - key                    (Lookup key for dimensions)
D  - id                     (System ID)
E  - handle                 (URL handle)
F  - title                  (Product title)
G  - vendor                 (Brand/supplier)

COLUMNS H-AL (Collection-Specific Fields - VARIES):
H  - {your_field_1}
I  - {your_field_2}
J  - {your_field_3}
... design based on your research

COLUMNS AM-BJ (Standard End Fields - SAME FOR ALL):
AL (38)  - quality_score
AM (39)  - shopify_status
AN (40)  - shopify_price
AO (41)  - shopify_compare_price
AP (42)  - shopify_weight
AQ (43)  - shopify_tags
AR (44)  - seo_title
AS (45)  - seo_description
AT (46)  - shopify_images
AU (47)  - shopify_spec_sheet
AV (48)  - shopify_collections
AW (49)  - shopify_url
AX (50)  - last_shopify_sync
BE (57)  - selected (checkbox)
BF (58)  - faqs
BG (59)  - our_current_price
BH (60)  - competitor_name
BI (61)  - competitor_price
BJ (62)  - price_last_updated
```

**Design Tips**:
- Group related fields (dimensions together, features together)
- Put most important fields first (after system fields)
- Leave room for future fields (don't use every column)
- Use clear, consistent naming (snake_case)

---

#### Step 1.3: Create Rule Sheets (60-90 min)

Create these worksheets in same spreadsheet:

**Material_Rules**:
| Search Term | Standard Name |
|-------------|---------------|
| SS | Stainless Steel |
| STAINLESS | Stainless Steel |
| 304 | Stainless Steel |
| GRANITE | Granite Composite |

**Type_Rules** (e.g., installation_type, tap_type, light_type):
| Search Term | Standard Name |
|-------------|---------------|
| UNDER MOUNT | Undermount |
| UNDER-MOUNT | Undermount |
| TOP MOUNT | Topmount |

**Finish_Rules** (for taps, lighting):
| Search Term | Standard Name |
|-------------|---------------|
| CHROME | Chrome |
| BRUSHED NICKEL | Brushed Nickel |
| MATTE BLACK | Matte Black |

**Style_Rules**:
| Search Term | Standard Name |
|-------------|---------------|
| MODERN | Modern |
| CONTEMPORARY | Modern |
| TRADITIONAL | Traditional |

**Grade_Rules** (material grade):
| Search Term | Standard Name |
|-------------|---------------|
| 304 | 304 |
| 316 | 316 |
| COMMERCIAL | Commercial |

**Location_Rules** (application location):
| Search Term | Standard Name |
|-------------|---------------|
| KITCHEN | Kitchen |
| BATHROOM | Bathroom |
| LAUNDRY | Laundry |

**Warranty_Rules**:
| Brand Name | Warranty Years |
|------------|----------------|
| ABEY | 25 |
| CLARK | 15 |
| METHVEN | 10 |

**Drain_Rules** (for sinks):
| Search Term | Standard Name |
|-------------|---------------|
| REAR | Rear |
| CENTRE | Centre |
| CENTER | Centre |

---

#### Step 1.4: Add Sample Data (30 min)

Add 5-10 sample products manually:
- Mix of different types/styles
- Include edge cases (compound values like "Topmount & Undermount")
- Include missing data scenarios
- Include non-standard values to test highlighting

**Why**: This gives you real data to test Apps Script with

---

#### Step 1.5: Document Column Mapping (30 min)

Create a reference sheet in your spreadsheet:

**Worksheet**: `_Column_Reference`

| Column Letter | Column Number | Field Name | Type | Example |
|---------------|---------------|------------|------|---------|
| A | 1 | url | URL | https://... |
| B | 2 | variant_sku | Text | ABC123 |
| C | 3 | key | Text | SINK-ABC123 |
| ... | ... | ... | ... | ... |

**Why**: You'll reference this constantly when writing Apps Script and config

---

### Phase 1 Checklist Per Collection:

```
[ ] Researched 10-20 product pages
[ ] Listed all attributes and variations
[ ] Created Google Spreadsheet
[ ] Added Raw_Data worksheet with columns A-BJ
[ ] Created Material_Rules sheet
[ ] Created Type_Rules sheet
[ ] Created Finish_Rules sheet (if applicable)
[ ] Created Style_Rules sheet
[ ] Created Grade_Rules sheet
[ ] Created Warranty_Rules sheet
[ ] Created Location_Rules sheet
[ ] Created Drain/Position_Rules sheet (if applicable)
[ ] Added 5-10 sample products
[ ] Created _Column_Reference sheet
[ ] Noted Spreadsheet ID
```

---

## 🎯 PHASE 2: GOOGLE APPS SCRIPT (Data Cleaning Logic)
**Time**: 4-6 hours per collection
**Goal**: Automated data cleaning and standardization

### For Each Collection:

#### Step 2.1: Setup Apps Script Project (15 min)

```
[ ] Open Google Spreadsheet
[ ] Extensions → Apps Script
[ ] Name project: "{Collection} PIM Data Processor"
[ ] Copy static/rulebase.gs as starting template
[ ] Save project
```

---

#### Step 2.2: Update Quality Score Fields (30 min)

**File**: Apps Script, Lines ~15-50

Find and replace the `QUALITY_SCORE_FIELDS` array:

```javascript
const QUALITY_SCORE_FIELDS = [
  'brand_name',
  'your_field_1',
  'your_field_2',
  'your_field_3',
  // ... list ALL fields that matter for quality
  // Include dimensions, features, content fields
  // Should match your quality_fields in Python config
];
```

**Reference**: Your `_Column_Reference` sheet

**Tip**: Start with 15-20 key fields, add more later

---

#### Step 2.3: Update Column Mappings (2-3 hours)

**File**: Apps Script, Function `processRowSafely()`, Lines ~200-600

This is the **most critical part**. You're mapping JavaScript array indices to your columns.

**IMPORTANT**: JavaScript arrays are 0-indexed!
- Column A (1) = `row[0]`
- Column B (2) = `row[1]`
- Column F (6) = `row[5]`
- Column I (9) = `row[8]`

**Example Mapping**:
```javascript
// System fields (same for all collections)
const title = (row[5] || '').toString();     // Column F (6)
const vendor = (row[6] || '').toString();    // Column G (7)
const key = (row[2] || '').toString().trim(); // Column C (3)

// YOUR COLLECTION-SPECIFIC FIELDS
// Use your _Column_Reference sheet!
const yourField1 = row[7];   // Column H (8)
const yourField2 = row[8];   // Column I (9)
const yourField3 = row[9];   // Column J (10)
// ... continue for all fields
```

**Sections to Update**:

1. **Rule-Based Fields** (Lines ~250-400):
```javascript
// Material (adjust column index!)
const material = findStandardValue(row[9], title, allRules.material);
if (material) {
  if (material === 'DELETE_VALUE') {
    updates.push({ col: 10, value: '' });  // Column J
  } else {
    updates.push({ col: 10, value: material });
  }
}

// Type (adjust column index!)
const type = findStandardValue(row[8], title, allRules.type);
// ... same pattern
```

2. **Calculated Fields** (Lines ~450-550):
```javascript
// Example: Cabinet size from width
if (!row[23] && row[21]) {  // If col X empty and col V has value
  const cabinetSize = calculateCabinetSize(row[21]);
  if (cabinetSize) {
    updates.push({ col: 24, value: cabinetSize });  // Update col X
  }
}

// Add YOUR calculated fields
// Examples:
// - Flow rate from pressure
// - Lumens from wattage
// - Coverage area from dimensions
```

3. **Boolean Fields** (Lines ~500-550):
```javascript
// Example: Parse compound installation type
const installationType = row[8] || '';  // Adjust to your column!
const installationTypeStr = installationType.toString().toUpperCase().trim();

// Parse "Topmount & Undermount" → set both flags
const isTopmount = installationTypeStr.includes('TOPMOUNT') ? 'TRUE' : 'FALSE';
const isUndermount = installationTypeStr.includes('UNDERMOUNT') ? 'TRUE' : 'FALSE';

updates.push({ col: 15, value: isUndermount });  // Adjust column!
updates.push({ col: 16, value: isTopmount });    // Adjust column!

// Add YOUR boolean fields
// Examples for other collections:
// - is_dimmable (lighting)
// - is_thermostatic (shower mixers)
// - has_soft_close (vanities)
```

4. **Dimension Lookups** (Lines ~400-450):
```javascript
// If you have a Dimension_Map sheet
if (key && dimensionMap && dimensionMap[key]) {
  const dimensions = dimensionMap[key];

  // Update your dimension columns
  if (dimensions.length && row[20] !== dimensions.length) {
    updates.push({ col: 21, value: dimensions.length });  // Adjust column!
  }

  if (dimensions.width && row[21] !== dimensions.width) {
    updates.push({ col: 22, value: dimensions.width });   // Adjust column!
  }

  if (dimensions.depth && row[22] !== dimensions.depth) {
    updates.push({ col: 23, value: dimensions.depth });   // Adjust column!
  }
}
```

---

#### Step 2.4: Test Apps Script (1-2 hours)

**Testing Strategy**:

1. **Manual Single Row Test**:
```
[ ] Select one sample product row
[ ] Check the checkbox in column BE
[ ] Wait 5-10 seconds
[ ] Check if:
    [ ] Values standardized (e.g., "SS" → "Stainless Steel")
    [ ] Calculated fields populated
    [ ] Boolean flags set correctly
    [ ] Non-standard values highlighted in red
    [ ] Quality score calculated
```

2. **Check Execution Log**:
```
[ ] View → Execution log
[ ] Look for errors
[ ] Check console.log output
[ ] Verify column numbers mentioned match your mapping
```

3. **Test Edge Cases**:
```
[ ] Compound values ("Topmount & Undermount")
[ ] Empty fields
[ ] Non-standard values (should highlight)
[ ] Values to delete (blank standard value in rules)
[ ] Missing dimensions (should not crash)
```

4. **Batch Test**:
```
[ ] Check 5 rows
[ ] Run "Process All Checked Rows" from menu
[ ] Verify all process correctly
```

**Common Issues**:
- Column number off by 1 → Check if you're using 0-index or 1-index
- "Cannot read property" error → Column is undefined, check index
- Rule not applying → Check rule sheet name matches code
- Highlight not appearing → Check color code `#ffcccc`

---

#### Step 2.5: Create Helper Functions (Optional, 30-60 min)

Add collection-specific helpers at bottom of script:

```javascript
/**
 * Calculate flow rate from pressure (Taps example)
 */
function calculateFlowRate(pressure) {
  if (!pressure) return null;
  const p = parseFloat(pressure);
  if (isNaN(p)) return null;

  // Your formula here
  const flowRate = p * 0.5; // Example
  return Math.round(flowRate * 10) / 10;
}

/**
 * Calculate lumens from wattage (Lighting example)
 */
function calculateLumens(wattage, bulbType) {
  if (!wattage) return null;
  const w = parseFloat(wattage);
  if (isNaN(w)) return null;

  // LED: ~100 lumens per watt
  // Halogen: ~20 lumens per watt
  const efficiency = bulbType.includes('LED') ? 100 : 20;
  return Math.round(w * efficiency);
}
```

---

### Phase 2 Checklist Per Collection:

```
[ ] Created Apps Script project
[ ] Copied rulebase.gs template
[ ] Updated QUALITY_SCORE_FIELDS array
[ ] Updated all column indices in processRowSafely()
[ ] Added rule-based field processing
[ ] Added calculated field logic
[ ] Added boolean field logic
[ ] Added dimension lookup logic (if applicable)
[ ] Tested single row cleaning
[ ] Tested batch cleaning
[ ] Tested edge cases
[ ] Created helper functions (if needed)
[ ] Verified no errors in execution log
[ ] Documented any quirks or gotchas
```

---

## 🎯 PHASE 3: AI EXTRACTION PROMPTS (Smart Extraction)
**Time**: 2-3 hours per collection
**Goal**: Extract data that matches your standardized formats

### For Each Collection:

#### Step 3.1: Plan Extraction Fields (30 min)

**Question**: What should AI extract?

**Extraction Field Categories**:

1. **Core Identity**: Always extract
   - sku
   - title
   - brand_name
   - vendor

2. **Specifications**: Product-specific
   - Sinks: installation_type, material, bowls_number, dimensions
   - Taps: tap_type, finish, spout_type, flow_rate
   - Lighting: light_type, bulb_type, wattage, IP_rating
   - Etc.

3. **Images**: If `extract_images = True`
   - shopify_images (AI finds product images, not logos)

**List Your Fields**:
```python
ai_extraction_fields = [
    'sku',
    'title',
    'brand_name',
    'vendor',
    # Add 10-15 key fields that appear on supplier sites
    'your_field_1',
    'your_field_2',
    # Don't extract calculated fields (Apps Script does that)
    # Don't extract rare fields (fill manually if needed)
]
```

**Rule**: Extract 10-20 fields max. More = slower + more errors.

---

#### Step 3.2: Write Extraction Prompt (60-90 min)

**File**: `core/ai_extractor.py`, add function at end (~line 500+)

```python
def _build_your_collection_extraction_prompt(self, url, html_content):
    """Build AI extraction prompt for Your Collection products"""

    return f"""
    You are extracting product information for a {YOUR_PRODUCT_TYPE} from a supplier website.

    URL: {url}

    Extract the following fields in JSON format. Use the exact field names provided.

    {{
        "sku": "Product SKU, model number, or catalog number",
        "title": "Full product title exactly as shown",
        "brand_name": "Brand or manufacturer name",
        "vendor": "Supplier or vendor name (may be same as brand)",

        // YOUR PRODUCT-SPECIFIC FIELDS
        "your_field_1": "Description - be specific about format",
        "your_field_2": "Description - mention valid options if limited",
        "your_field_3": "Description - specify units (mm, L, kg, etc.)",

        // DIMENSIONS (if applicable)
        "length_mm": "Length in millimeters (number only, no units)",
        "width_mm": "Width in millimeters (number only, no units)",
        "height_mm": "Height in millimeters (number only, no units)",

        // FEATURES (if applicable)
        "has_feature_x": "true or false - does product have feature X?",

        // IMAGES
        "shopify_images": "Comma-separated list of product image URLs (not logos or banners)"
    }}

    EXTRACTION RULES:

    1. TERMINOLOGY MATCHING:
       - Use standardized terms from these options:
         • your_field_1: [{list valid options}]
         • your_field_2: [{list valid options}]
       - If you see "{variation}", extract as "{standard}"

    2. DIMENSIONS:
       - Extract numbers only, no units
       - Convert to millimeters if shown in other units
       - Use "length_mm", "width_mm", "height_mm" format

    3. BOOLEAN FIELDS:
       - Use lowercase "true" or "false" only
       - If feature not mentioned, use "false"

    4. MISSING DATA:
       - If field not found, use empty string ""
       - Do NOT guess or make assumptions
       - Do NOT use "N/A", "Unknown", or similar

    5. IMAGES:
       - Extract only product images (not lifestyle, installation diagrams, logos)
       - Provide full URLs
       - Separate multiple URLs with commas
       - First image should be main product image

    6. NUMBERS:
       - Extract as numbers without units
       - Use decimal point for fractions (e.g., 12.5)
       - No commas in numbers

    IMPORTANT: Return valid JSON only. No explanatory text before or after.

    HTML Content:
    {html_content[:15000]}
    """
```

**Tips for Good Prompts**:
- List valid options for enum fields (e.g., "Topmount" or "Undermount")
- Explain terminology (e.g., "Pull-out" means extendable spout)
- Give examples of what to extract vs. ignore
- Mention your standardized terms from rule sheets

---

#### Step 3.3: Write Description Prompt (60-90 min)

**File**: `core/ai_extractor.py`, add function

```python
def _build_your_collection_description_prompt(self, data):
    """Build AI description generation prompt for Your Collection"""

    # Extract product details
    title = data.get('title', 'Product')
    brand = data.get('brand_name', '')
    field1 = data.get('your_field_1', '')
    field2 = data.get('your_field_2', '')
    field3 = data.get('your_field_3', '')
    # ... extract all relevant fields

    # Build context
    context = f"Title: {title}\n"
    if brand: context += f"Brand: {brand}\n"
    if field1: context += f"Field1: {field1}\n"
    if field2: context += f"Field2: {field2}\n"
    # ... add all fields

    return f"""
    Generate a professional, SEO-optimized product description for this {YOUR_PRODUCT_TYPE}.

    PRODUCT DETAILS:
    {context}

    DESCRIPTION REQUIREMENTS:

    1. STRUCTURE:
       - Opening paragraph: Hook + key benefit
       - Middle paragraph: Key features and specifications
       - Closing paragraph: Installation, usage, or warranty info
       - Total: 150-250 words, 2-3 paragraphs

    2. TONE & STYLE:
       - Professional but approachable
       - Focus on benefits, not just features
       - Use Australian English
       - Industry-appropriate terminology

    3. KEY POINTS TO COVER:
       - Highlight the {field1} feature
       - Mention {field2} specification
       - Emphasize quality and durability
       - Explain typical use cases
       - Include {brand} brand quality reputation (if premium brand)

    4. SEO KEYWORDS (weave naturally):
       - {YOUR_PRODUCT_TYPE}
       - {field1}
       - {field2}
       - "Australian"
       - Brand name

    5. FORMATTING:
       - Use <p> tags for paragraphs
       - Bold important terms with <strong>
       - No bullet points in description (save for features section)
       - Clean HTML only (no divs, classes, or inline styles)

    6. AVOID:
       - Generic fluff ("perfect addition to your home")
       - Superlatives without justification ("best", "perfect", "amazing")
       - Pricing information
       - Installation instructions (goes in care section)
       - Measurements (already displayed separately)

    EXAMPLE OPENING:
    "The {brand} {title} combines {field1} construction with {field2} design,
    delivering exceptional performance and lasting quality for Australian {context}."

    Generate the HTML description now:
    """
```

---

#### Step 3.4: Write Features Prompt (30 min)

```python
def _build_your_collection_features_prompt(self, data):
    """Build AI features generation prompt for Your Collection"""

    title = data.get('title', 'Product')
    # ... extract all fields

    return f"""
    Generate a bullet-point list of key features for this {YOUR_PRODUCT_TYPE}.

    PRODUCT DETAILS:
    {context}

    FEATURES REQUIREMENTS:

    1. FORMAT:
       - HTML unordered list (<ul><li>...</li></ul>)
       - 5-8 bullet points
       - Each point 5-15 words
       - Start each point with capital letter, no ending punctuation

    2. CONTENT:
       - Focus on tangible, factual features
       - Include specifications that matter to buyers
       - Mention quality/durability indicators
       - Include practical benefits

    3. PRIORITY ORDER:
       - Most important/unique features first
       - Technical specs second
       - Installation/use benefits last

    4. FEATURE TYPES TO INCLUDE:
       - Material/construction: "{field1} construction"
       - Performance specs: "{field2} {specification}"
       - Dimensions: "Measures {X}mm x {Y}mm"
       - Quality indicators: "{X} year warranty"
       - Compatibility: "Suitable for {use case}"
       - Care: "Easy to clean and maintain"

    5. AVOID:
       - Duplicating description content
       - Vague claims ("looks great")
       - Subjective opinions
       - Marketing fluff

    EXAMPLE FORMAT:
    <ul>
      <li>Premium {field1} construction ensures lasting durability</li>
      <li>{field2} design suits modern Australian kitchens/bathrooms</li>
      <li>Measures {X}mm W x {Y}mm D x {Z}mm H</li>
      <li>{Brand} {X}-year manufacturer warranty included</li>
      <li>Easy installation with standard fittings</li>
      <li>Low maintenance and simple to clean</li>
    </ul>

    Generate the features list now:
    """
```

---

#### Step 3.5: Write Care Instructions Prompt (30 min)

```python
def _build_your_collection_care_prompt(self, data):
    """Build AI care instructions prompt for Your Collection"""

    material = data.get('your_material_field', '')
    finish = data.get('your_finish_field', '')

    return f"""
    Generate care and maintenance instructions for this {YOUR_PRODUCT_TYPE}.

    PRODUCT DETAILS:
    - Material: {material}
    - Finish: {finish}
    (Include other relevant specs)

    CARE INSTRUCTIONS REQUIREMENTS:

    1. FORMAT:
       - 2-3 short paragraphs
       - Use <p> tags
       - 100-150 words total
       - Clear, actionable advice

    2. SECTIONS TO COVER:

       CLEANING:
       - Daily/regular cleaning method
       - Recommended cleaning products
       - Products to AVOID (very important!)
       - Frequency recommendations

       MAINTENANCE:
       - Preventive care tips
       - How to maintain finish/material
       - Signs of wear to watch for

       WARNINGS (if applicable):
       - Material-specific warnings
       - Things that can damage the product
       - What voids warranty

    3. MATERIAL-SPECIFIC GUIDANCE:

       IF STAINLESS STEEL:
       - Avoid abrasive cleaners and steel wool
       - Clean with soft cloth and mild detergent
       - Wipe in direction of grain
       - Dry after each use to prevent water spots

       IF CHROME/BRASS:
       - Use mild soap and water only
       - Avoid acidic or ammonia-based cleaners
       - Polish regularly with soft cloth
       - Dry immediately after cleaning

       IF GLASS:
       - Use standard glass cleaner or water and vinegar
       - Avoid abrasive scrubbers
       - Wipe dry to prevent streaks

       [Add guidance for YOUR materials]

    4. TONE:
       - Practical and helpful
       - Not alarmist but appropriately cautionary
       - Empowering ("maintain beauty for years")

    5. AUSTRALIAN CONTEXT:
       - Mention Australian water conditions if relevant
       - Reference local cleaning products if helpful

    EXAMPLE STRUCTURE:
    <p>Regular cleaning is simple – wipe down with a soft cloth and mild
    detergent after each use, then dry thoroughly. Avoid abrasive cleaners,
    steel wool, or chlorine-based products which can damage the {material}
    finish.</p>

    <p>For best results, clean spills immediately and maintain the {finish}
    by {specific care tip}. With proper care, your {product} will maintain
    its beauty and performance for years to come.</p>

    Generate the care instructions now:
    """
```

---

#### Step 3.6: Register Prompts (15 min)

**File**: `core/ai_extractor.py`, update dicts at top of class (~lines 42-66)

```python
# Line ~42
self.extraction_prompts = {
    'sinks': self._build_sinks_extraction_prompt,
    'taps': self._build_taps_extraction_prompt,
    'lighting': self._build_lighting_extraction_prompt,
    'your_collection': self._build_your_collection_extraction_prompt,  # ADD THIS
}

# Line ~49
self.description_prompts = {
    'sinks': self._build_sinks_description_prompt,
    'taps': self._build_taps_description_prompt,
    'lighting': self._build_lighting_description_prompt,
    'your_collection': self._build_your_collection_description_prompt,  # ADD THIS
}

# Line ~56
self.chatgpt_features_prompts = {
    'sinks': self._build_sinks_features_prompt,
    'taps': self._build_taps_features_prompt,
    'lighting': self._build_lighting_features_prompt,
    'your_collection': self._build_your_collection_features_prompt,  # ADD THIS
}

# Line ~62
self.chatgpt_care_prompts = {
    'sinks': self._build_sinks_care_prompt,
    'taps': self._build_taps_care_prompt,
    'lighting': self._build_lighting_care_prompt,
    'your_collection': self._build_your_collection_care_prompt,  # ADD THIS
}
```

---

### Phase 3 Checklist Per Collection:

```
[ ] Listed 10-20 key extraction fields
[ ] Wrote extraction prompt with rules and examples
[ ] Wrote description prompt with structure guidance
[ ] Wrote features prompt with format requirements
[ ] Wrote care instructions prompt with material-specific tips
[ ] Registered extraction prompt in extraction_prompts dict
[ ] Registered description prompt in description_prompts dict
[ ] Registered features prompt in chatgpt_features_prompts dict
[ ] Registered care prompt in chatgpt_care_prompts dict
[ ] Tested prompts with sample URLs (manual test in ChatGPT)
[ ] Refined prompts based on test results
```

---

## 🎯 PHASE 4: BACKEND CONFIGURATION (Easy Translation)
**Time**: 1-2 hours per collection
**Goal**: Translate your Google Sheet structure into Python config

### For Each Collection:

#### Step 4.1: Create Collection Class (60-90 min)

**File**: `config/collections.py`, add class before COLLECTIONS dict

```python
class YourCollectionCollection(CollectionConfig):
    """Configuration for Your Collection collection"""

    def setup_fields(self):
        # Feature flags
        self.extract_images = True   # Set based on your needs
        self.pricing_enabled = False  # Set if you have pricing data

        # AI extraction fields (from Phase 3)
        self.ai_extraction_fields = [
            'sku',
            'title',
            'brand_name',
            'vendor',
            'your_field_1',
            'your_field_2',
            # ... fields from your extraction prompt
        ]

        # Quality score fields (from Phase 2 Apps Script)
        self.quality_fields = [
            'brand_name',
            'your_field_1',
            'your_field_2',
            # ... fields from QUALITY_SCORE_FIELDS in Apps Script
        ]

        # Column mapping (from your _Column_Reference sheet)
        self.column_mapping = {
            # System fields (same for everyone)
            'url': 1,
            'variant_sku': 2,
            'key': 3,
            'id': 4,
            'handle': 5,
            'title': 6,
            'vendor': 7,

            # YOUR COLLECTION FIELDS
            # Copy from your _Column_Reference sheet
            'your_field_1': 8,    # Column H
            'your_field_2': 9,    # Column I
            'your_field_3': 10,   # Column J
            # ... EVERY FIELD IN YOUR SHEET

            # Standard end fields (same for everyone)
            'quality_score': 38,
            'shopify_status': 39,
            'shopify_price': 40,
            'shopify_compare_price': 41,
            'shopify_weight': 42,
            'shopify_tags': 43,
            'seo_title': 44,
            'seo_description': 45,
            'shopify_images': 46,
            'shopify_spec_sheet': 47,
            'shopify_collections': 48,
            'shopify_url': 49,
            'last_shopify_sync': 50,
            'selected': 57,
            'faqs': 58,
            'our_current_price': 59,
            'competitor_name': 60,
            'competitor_price': 61,
            'price_last_updated': 62
        }

        # Content field mappings (standard)
        self.ai_description_field = 'body_html'
        self.ai_features_field = 'features'
        self.ai_care_field = 'care_instructions'
```

**Tip**: Open your `_Column_Reference` sheet side-by-side and copy-paste!

---

#### Step 4.2: Register Collection (15 min)

**File**: `config/collections.py`, bottom of file, COLLECTIONS dict

```python
COLLECTIONS = {
    'sinks': SinksCollection(...),
    'taps': TapsCollection(...),
    'lighting': LightingCollection(...),

    # ADD YOUR COLLECTION HERE:
    'your_collection_key': YourCollectionCollection(
        name='Your Collection Display Name',
        description='Short description (1-2 sentences)',
        spreadsheet_id=os.environ.get('YOUR_COLLECTION_KEY_SPREADSHEET_ID', ''),
        worksheet_name='Raw_Data',
        checkbox_column='selected'
    ),
}
```

**Collection Key Rules**:
- Lowercase
- Snake_case (underscores)
- No spaces
- Used in URLs: `/collection/your_collection_key`

---

#### Step 4.3: Update Environment Variables (5 min)

**File**: `.env`

```bash
# Add this line
YOUR_COLLECTION_KEY_SPREADSHEET_ID=1abc123def456...

# Example:
SHOWER_SCREENS_SPREADSHEET_ID=1ZJKWefjt7rcVv6nIhrvbdJrVfTr83fSLtQswXDTAhw8
```

**Get Spreadsheet ID**:
From URL: `https://docs.google.com/spreadsheets/d/THIS_PART/edit`

---

### Phase 4 Checklist Per Collection:

```
[ ] Created YourCollectionCollection class
[ ] Set extract_images flag
[ ] Set pricing_enabled flag
[ ] Added ai_extraction_fields list
[ ] Added quality_fields list
[ ] Added complete column_mapping dict (every field!)
[ ] Verified column numbers match _Column_Reference sheet
[ ] Set ai_description_field, ai_features_field, ai_care_field
[ ] Registered collection in COLLECTIONS dict
[ ] Used correct collection key (lowercase, snake_case)
[ ] Added spreadsheet ID to .env file
[ ] Tested: Flask app starts without errors
[ ] Tested: Can visit /collection/your_key (shows placeholder)
```

---

## 🎯 PHASE 5: FRONTEND TEMPLATE (Visual Polish)
**Time**: 3-5 hours per collection
**Goal**: Beautiful, functional edit modal for your collection

### For Each Collection:

#### Step 5.1: Copy Base Template (15 min)

```bash
cp templates/collection/sinks.html templates/collection/your_collection.html
```

**Starting point**: 800+ lines of HTML/CSS/JavaScript

---

#### Step 5.2: Update CSS Styles (30-60 min)

**File**: `templates/collection/your_collection.html`, `{% block extra_styles %}`

**Replace sinks-specific styles with yours**:

```html
{% block extra_styles %}
/* Your Collection specific styles */

/* Field group styling */
.your-field-group {
  background: #e3f2fd;
  border-radius: 6px;
  padding: 15px;
  margin-bottom: 15px;
  border: 1px solid #e9ecef;
}

/* Badge styles for your fields */
.your-type-badge {
  background: #e8f5e8;
  color: #2e7d32;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
}

/* Keep modal spacing styles (don't delete these) */
.modal-body-spaced { ... }
.modal-footer { ... }
{% endblock %}
```

---

#### Step 5.3: Design Modal Layout (2-4 hours)

**File**: `templates/collection/your_collection.html`, `{% block collection_modal %}`

**This is the biggest task!** You're building the entire edit form.

**Modal Structure**:

```html
{% block collection_modal %}
<div class="modal fade" id="editModal" tabindex="-1">
  <div class="modal-dialog modal-xl">
    <div class="modal-content">

      <!-- MODAL HEADER (keep as-is) -->
      <div class="modal-header">
        <h5 class="modal-title" id="editModalLabel">Edit Product</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>

      <div class="modal-body modal-body-spaced">

        <!-- IMAGE SECTION (keep as-is) -->
        <div class="image-section">
          <!-- Gallery code from sinks template -->
        </div>

        <!-- YOUR COLLECTION-SPECIFIC FIELDS -->

        <!-- Group 1: Core Information -->
        <div class="field-group">
          <h6><i class="fas fa-info-circle me-2"></i>Core Information</h6>

          <div class="row">
            <div class="col-md-6">
              <label class="form-label">SKU</label>
              <input type="text" id="editSku" class="form-control" readonly>
              <small class="text-muted">System-generated, read-only</small>
            </div>

            <div class="col-md-6">
              <label class="form-label">Brand</label>
              <input type="text" id="editBrandName" class="form-control">
            </div>
          </div>

          <div class="row mt-2">
            <div class="col-12">
              <label class="form-label">Title</label>
              <input type="text" id="editTitle" class="form-control">
            </div>
          </div>
        </div>

        <!-- Group 2: Specifications -->
        <div class="field-group">
          <h6><i class="fas fa-cogs me-2"></i>Specifications</h6>

          <div class="row">
            <!-- YOUR FIELDS HERE -->

            <!-- Example: Dropdown -->
            <div class="col-md-6">
              <label class="form-label">Your Field 1</label>
              <select id="editYourField1" class="form-control">
                <option value="">Select...</option>
                <option value="Option1">Option 1</option>
                <option value="Option2">Option 2</option>
              </select>
            </div>

            <!-- Example: Text Input -->
            <div class="col-md-6">
              <label class="form-label">Your Field 2</label>
              <input type="text" id="editYourField2" class="form-control"
                     placeholder="Enter value">
            </div>
          </div>

          <div class="row mt-2">
            <!-- Example: Number Input -->
            <div class="col-md-4">
              <label class="form-label">Your Field 3 (mm)</label>
              <input type="number" id="editYourField3" class="form-control"
                     placeholder="0">
            </div>

            <!-- Example: Checkbox -->
            <div class="col-md-4">
              <label class="form-label">Your Boolean Field</label>
              <select id="editYourBooleanField" class="form-control">
                <option value="">Not Set</option>
                <option value="TRUE">Yes</option>
                <option value="FALSE">No</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Group 3: Dimensions (if applicable) -->
        <div class="field-group">
          <h6><i class="fas fa-ruler-combined me-2"></i>Dimensions</h6>

          <div class="row">
            <div class="col-md-4">
              <label class="form-label">Length (mm)</label>
              <input type="number" id="editLengthMm" class="form-control">
            </div>
            <div class="col-md-4">
              <label class="form-label">Width (mm)</label>
              <input type="number" id="editWidthMm" class="form-control">
            </div>
            <div class="col-md-4">
              <label class="form-label">Height (mm)</label>
              <input type="number" id="editHeightMm" class="form-control">
            </div>
          </div>
        </div>

        <!-- CONTENT TABS (keep as-is from sinks template) -->
        <div class="content-section">
          <!-- Tabs for Description, Features, Care Instructions, FAQs -->
        </div>

        <!-- PRICING SECTION (keep if pricing_enabled) -->
        <div class="pricing-section">
          <!-- Pricing fields from sinks template -->
        </div>

        <!-- SHOPIFY FIELDS (keep as-is) -->
        <div class="field-group">
          <!-- Status, Price, Tags, etc. -->
        </div>

      </div>

      <!-- MODAL FOOTER (keep as-is) -->
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
          Cancel
        </button>
        <button type="button" class="btn btn-primary" onclick="saveCurrentProduct()">
          <i class="fas fa-save me-1"></i>Save Changes
        </button>
      </div>

    </div>
  </div>
</div>
{% endblock %}
```

**Field ID Naming Convention**:
- Column mapping key: `your_field_name`
- Modal input ID: `editYourFieldName` (camelCase with "edit" prefix)

**Examples**:
```python
# config/collections.py
'tap_holes_number': 19

# template
<input id="editTapHolesNumber">
```

---

#### Step 5.4: Test Modal (30 min)

```
[ ] Open collection page in browser
[ ] Click on a product card (should open modal)
[ ] Check all fields display
[ ] Check all field IDs match column_mapping (console.log if needed)
[ ] Try editing fields and saving
[ ] Verify changes persist
[ ] Check for JavaScript errors in console
```

---

### Phase 5 Checklist Per Collection:

```
[ ] Copied sinks.html template
[ ] Renamed to your_collection.html
[ ] Updated CSS styles in extra_styles block
[ ] Designed modal layout with all fields
[ ] Grouped fields logically
[ ] Used correct field IDs (editFieldName format)
[ ] Added appropriate input types (text, number, select, etc.)
[ ] Added placeholder text and help text
[ ] Kept image gallery section
[ ] Kept content tabs section
[ ] Kept pricing section (if pricing_enabled)
[ ] Kept Shopify fields section
[ ] Tested modal opens
[ ] Tested fields load correctly
[ ] Tested fields save correctly
[ ] No JavaScript console errors
```

---

## 🎯 PHASE 6: END-TO-END TESTING (Quality Assurance)
**Time**: 2-3 hours per collection
**Goal**: Everything works perfectly before moving to next collection

### Testing Checklist Per Collection:

#### Test 1: Collection Page Loads
```
[ ] Navigate to /collection/your_collection_key
[ ] Page loads without errors
[ ] Products display (if any sample data)
[ ] No JavaScript errors in console
[ ] Action buttons visible
```

#### Test 2: Add Product (AI Extraction)
```
[ ] Click "Add Product" button
[ ] Modal opens correctly
[ ] Paste 1-2 supplier URLs
[ ] Click "Add Products"
[ ] Progress indicators work:
    [ ] Pending → Extracting → Generating → Cleaning
[ ] Products appear in Google Sheet
[ ] Check extracted data accuracy:
    [ ] Core fields (SKU, title, brand)
    [ ] Specifications (your fields)
    [ ] Images extracted (if enabled)
[ ] No errors in browser console
[ ] No errors in Flask logs
```

#### Test 3: Apps Script Cleaning
```
[ ] Open Google Sheet
[ ] Find newly added product
[ ] Check checkbox in column BE
[ ] Wait 10-15 seconds
[ ] Verify cleaning happened:
    [ ] Non-standard values replaced
    [ ] Calculated fields populated
    [ ] Boolean flags set correctly
    [ ] Non-standard values highlighted
    [ ] Quality score calculated
[ ] Check Apps Script execution log for errors
```

#### Test 4: Edit Product
```
[ ] In collection page, click a product card
[ ] Modal opens with all fields populated
[ ] Try editing each field type:
    [ ] Text fields
    [ ] Dropdowns
    [ ] Number fields
    [ ] Boolean fields
[ ] Click "Save Changes"
[ ] Modal closes
[ ] Check Google Sheet - changes saved
[ ] Re-open modal - changes persisted
```

#### Test 5: Generate Description
```
[ ] Open product modal
[ ] Go to "Description" tab
[ ] Click "Generate Description"
[ ] Wait for generation
[ ] Verify description:
    [ ] Relevant to product
    [ ] Well-formatted HTML
    [ ] Appropriate length (150-250 words)
    [ ] Industry terminology correct
[ ] Save and verify in Google Sheet
```

#### Test 6: Generate Features
```
[ ] Open product modal
[ ] Go to "Features" tab
[ ] Click "Generate Features"
[ ] Verify features:
    [ ] 5-8 bullet points
    [ ] Factual and specific
    [ ] Formatted as HTML list
[ ] Save and verify
```

#### Test 7: Generate Care Instructions
```
[ ] Open product modal
[ ] Go to "Care Instructions" tab
[ ] Click "Generate Care Instructions"
[ ] Verify care instructions:
    [ ] Material-appropriate advice
    [ ] Practical and clear
    [ ] 100-150 words
[ ] Save and verify
```

#### Test 8: CSV Import/Export
```
[ ] Click "Export Selected" (select 2-3 products first)
[ ] CSV downloads
[ ] Open CSV, verify data
[ ] Modify some values in CSV
[ ] Click "Import CSV"
[ ] Upload modified CSV
[ ] Verify updates applied in Google Sheet
```

#### Test 9: Quality Score
```
[ ] Open Google Sheet
[ ] Find quality_score column
[ ] Verify formula exists
[ ] Verify color coding:
    [ ] 90%+ = green
    [ ] 70-89% = yellow
    [ ] 50-69% = light red
    [ ] <50% = dark red
[ ] Add/remove data, verify score updates
```

#### Test 10: Missing Info Filter
```
[ ] Click "Missing Some Info" button
[ ] Modal shows missing field categories
[ ] Numbers shown match Google Sheet
[ ] Click a category badge
[ ] Products filter to show only those missing that field
[ ] Click "Clear All Filters" - shows all products again
```

---

## 📊 PROGRESS TRACKING

### Recommended Build Order:

```
Week 1: Taps Collection
[ ] Phase 1: Google Sheets & Rules (4 hours)
[ ] Phase 2: Apps Script (6 hours)
[ ] Phase 3: AI Prompts (3 hours)
[ ] Phase 4: Backend Config (2 hours)
[ ] Phase 5: Frontend Template (4 hours)
[ ] Phase 6: Testing (3 hours)
Total: 22 hours

Week 2: Lighting Collection
[ ] Repeat phases 1-6 (18 hours with experience)

Week 3: Shower Mixers Collection
[ ] Repeat phases 1-6 (16 hours with experience)

Week 4: Bathroom Vanities Collection
[ ] Repeat phases 1-6 (16 hours with experience)
```

**Total Estimated Time**: 72 hours (4 collections, 18 hours average each)

---

## 🎯 SUCCESS CRITERIA

Before marking a collection as "complete":

```
✅ Google Sheet exists with all columns defined
✅ Rule sheets created with sample standardization rules
✅ Apps Script cleaning works on all test products
✅ AI extraction pulls correct fields from supplier URLs
✅ AI description generation produces quality content
✅ Backend config has no errors (Flask starts)
✅ Frontend template shows all fields correctly
✅ Modal save works and persists to Google Sheet
✅ Quality score calculates and colors correctly
✅ CSV import/export works
✅ No console errors
✅ No Python errors in logs
✅ Team member can add product without your help
```

---

## 💡 TIPS FOR SUCCESS

**1. Build One Collection Fully First**
- Don't start 5 collections and leave them half-done
- Complete Taps end-to-end before starting Lighting
- Each completion teaches you for the next one

**2. Keep a Gotchas Log**
- Note column number mistakes
- Note field ID naming issues
- Note Apps Script quirks
- Reference for next collection

**3. Use Your _Column_Reference Sheet**
- It's your single source of truth
- Reference it constantly
- Update it if you change columns

**4. Test Early, Test Often**
- Don't wait until Phase 6
- Test Apps Script immediately after writing
- Test AI prompts in ChatGPT before coding
- Test modal fields as you add them

**5. Reuse Pattern, Not Code**
- Each collection is unique
- Copy structure, not values
- Understand logic, don't blindly copy

**6. Document Decisions**
- Why did you choose this field structure?
- Why these calculated fields?
- Why these rule sheets?
- Future-you will thank you

---

## 🆘 WHEN YOU GET STUCK

**Phase 1 (Sheets) Issues**:
- Look at supplier sites for 10 more products
- Check competitor sites for ideas
- Ask: "What do customers care about?"

**Phase 2 (Apps Script) Issues**:
- Check execution log for exact error
- Verify column numbers match sheet
- Test with one product before batch
- Use console.log liberally

**Phase 3 (AI Prompts) Issues**:
- Test prompts in ChatGPT directly first
- Check if extraction fields are too many (limit to 15)
- Verify terminology matches your rule sheets
- Look at failed extractions to find patterns

**Phase 4 (Backend Config) Issues**:
- Check Flask error logs
- Verify .env variable set correctly
- Verify collection registered in COLLECTIONS dict
- Check for typos in class name

**Phase 5 (Frontend) Issues**:
- Check browser console for JavaScript errors
- Verify field IDs match column_mapping exactly
- Check HTML syntax (missing closing tags)
- Test with simple fields first, add complexity later

**Phase 6 (Testing) Issues**:
- Isolate: Test one feature at a time
- Check both browser console and Flask logs
- Verify Google Sheet updated (manual check)
- Check Apps Script execution log

---

**Good luck! You've got a solid plan. Build methodically, test thoroughly, and you'll have all collections running smoothly!** 🚀
