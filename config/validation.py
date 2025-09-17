"""
Field Validation System
Defines validation rules and quality scoring for different product collections
"""
import re
import json
from typing import Dict, List, Any, Tuple, Optional

class FieldValidator:
    """Base class for field validation"""
    
    def __init__(self, field_name: str, required: bool = False, weight: float = 1.0):
        self.field_name = field_name
        self.required = required
        self.weight = weight  # Weight for quality scoring
    
    def validate(self, value: Any) -> Tuple[bool, str]:
        """
        Validate a field value
        Returns: (is_valid, error_message)
        """
        if self.required and self._is_empty(value):
            return False, f"{self.field_name} is required"
        
        if self._is_empty(value):
            return True, ""  # Empty but not required is valid
        
        return self._validate_value(value)
    
    def _is_empty(self, value: Any) -> bool:
        """Check if value is considered empty"""
        if value is None:
            return True
        
        if isinstance(value, str):
            return value.strip() == "" or value.strip().lower() in ['none', 'null', '-', 'n/a']
        
        return False
    
    def _validate_value(self, value: Any) -> Tuple[bool, str]:
        """Override in subclasses for specific validation logic"""
        return True, ""
    
    def calculate_quality_score(self, value: Any) -> float:
        """Calculate quality score for this field (0.0 to 1.0)"""
        is_valid, _ = self.validate(value)
        
        if not is_valid:
            return 0.0
        
        if self._is_empty(value):
            return 0.0 if self.required else 0.5  # Partial score for optional empty fields
        
        return self._calculate_value_quality(value)
    
    def _calculate_value_quality(self, value: Any) -> float:
        """Override in subclasses for specific quality calculation"""
        return 1.0  # Default: valid value = perfect score

class TextValidator(FieldValidator):
    """Validator for text fields"""
    
    def __init__(self, field_name: str, required: bool = False, weight: float = 1.0, 
                 min_length: int = 1, max_length: int = 1000, pattern: str = None):
        super().__init__(field_name, required, weight)
        self.min_length = min_length
        self.max_length = max_length
        self.pattern = re.compile(pattern) if pattern else None
    
    def _validate_value(self, value: Any) -> Tuple[bool, str]:
        if not isinstance(value, str):
            value = str(value)
        
        if len(value) < self.min_length:
            return False, f"{self.field_name} must be at least {self.min_length} characters"
        
        if len(value) > self.max_length:
            return False, f"{self.field_name} must be at most {self.max_length} characters"
        
        if self.pattern and not self.pattern.match(value):
            return False, f"{self.field_name} format is invalid"
        
        return True, ""
    
    def _calculate_value_quality(self, value: Any) -> float:
        if self._is_empty(value):
            return 0.0
        
        value_str = str(value).strip()
        
        # Length-based quality scoring
        if len(value_str) < self.min_length:
            return 0.0
        
        # Good length gets full score, very long gets slight penalty
        if len(value_str) <= self.max_length * 0.8:
            return 1.0
        elif len(value_str) <= self.max_length:
            return 0.9
        else:
            return 0.7

class NumberValidator(FieldValidator):
    """Validator for numeric fields"""
    
    def __init__(self, field_name: str, required: bool = False, weight: float = 1.0,
                 min_value: float = None, max_value: float = None, allow_decimal: bool = True):
        super().__init__(field_name, required, weight)
        self.min_value = min_value
        self.max_value = max_value
        self.allow_decimal = allow_decimal
    
    def _validate_value(self, value: Any) -> Tuple[bool, str]:
        try:
            if isinstance(value, str):
                value = value.strip()
                if not value:
                    return True, ""
            
            num_value = float(value) if self.allow_decimal else int(value)
            
            if self.min_value is not None and num_value < self.min_value:
                return False, f"{self.field_name} must be at least {self.min_value}"
            
            if self.max_value is not None and num_value > self.max_value:
                return False, f"{self.field_name} must be at most {self.max_value}"
            
            return True, ""
        
        except (ValueError, TypeError):
            return False, f"{self.field_name} must be a valid number"

class BooleanValidator(FieldValidator):
    """Validator for boolean fields"""

    def _validate_value(self, value: Any) -> Tuple[bool, str]:
        if isinstance(value, bool):
            return True, ""

        if isinstance(value, str):
            value = value.strip().lower()
            if value in ['true', 'false', 'yes', 'no', '1', '0']:
                return True, ""

        return False, f"{self.field_name} must be true/false or yes/no"

class ContentQualityValidator(FieldValidator):
    """Validator that assesses content quality, not just presence"""

    def __init__(self, field_name: str, required: bool = False, weight: float = 1.0,
                 content_type: str = 'text', min_length: int = 0):
        super().__init__(field_name, required, weight)
        self.content_type = content_type
        self.min_length = min_length

    def _validate_value(self, value: Any) -> Tuple[bool, str]:
        if self._is_empty(value):
            return True, ""  # Empty validation handled by parent

        if self.content_type == 'images':
            return self._validate_images(value)
        elif self.content_type == 'description':
            return self._validate_description(value)
        elif self.content_type == 'features':
            return self._validate_features(value)
        elif self.content_type == 'care':
            return self._validate_care_instructions(value)

        return True, ""

    def _validate_images(self, value: Any) -> Tuple[bool, str]:
        """Validate image content - check for multiple images"""
        if not value:
            return False, f"{self.field_name} should have at least one image"

        value_str = str(value).strip()
        if not value_str or value_str in ['-', 'None', 'null']:
            return False, f"{self.field_name} should have at least one image"

        # Count images (comma-separated URLs)
        image_count = len([img for img in value_str.split(',') if img.strip()])
        if image_count == 0:
            return False, f"{self.field_name} should have at least one image"

        return True, ""

    def _validate_description(self, value: Any) -> Tuple[bool, str]:
        """Validate description content quality"""
        if not value:
            return False, f"{self.field_name} is required for customer understanding"

        value_str = str(value).strip()
        if len(value_str) < self.min_length:
            return False, f"{self.field_name} should be at least {self.min_length} characters for good customer experience"

        return True, ""

    def _validate_features(self, value: Any) -> Tuple[bool, str]:
        """Validate key features content"""
        if not value:
            return False, f"{self.field_name} help customers understand product value"

        value_str = str(value).strip()
        # Count bullet points or features
        feature_indicators = value_str.count('•') + value_str.count('*') + value_str.count('-')
        if feature_indicators < 3:
            return False, f"{self.field_name} should have at least 3 key features"

        return True, ""

    def _validate_care_instructions(self, value: Any) -> Tuple[bool, str]:
        """Validate care instructions"""
        if not value:
            return True, ""  # Optional field

        value_str = str(value).strip()
        if len(value_str) < 20:
            return False, f"{self.field_name} should provide meaningful care guidance"

        return True, ""

    def _calculate_value_quality(self, value: Any) -> float:
        """Calculate quality score based on content richness"""
        if self._is_empty(value):
            return 0.0

        if self.content_type == 'images':
            return self._score_images(value)
        elif self.content_type == 'description':
            return self._score_description(value)
        elif self.content_type == 'features':
            return self._score_features(value)
        elif self.content_type == 'care':
            return self._score_care_instructions(value)

        return 1.0

    def _score_images(self, value: Any) -> float:
        """Score based on number and quality of images"""
        value_str = str(value).strip()
        if not value_str or value_str in ['-', 'None', 'null']:
            return 0.0

        image_count = len([img for img in value_str.split(',') if img.strip()])

        if image_count == 0:
            return 0.0
        elif image_count == 1:
            return 0.6  # Minimum viable
        elif image_count <= 3:
            return 0.8  # Good
        else:
            return 1.0  # Excellent

    def _score_description(self, value: Any) -> float:
        """Score based on description quality"""
        value_str = str(value).strip()
        length = len(value_str)

        if length < 50:
            return 0.2
        elif length < 100:
            return 0.5
        elif length < 200:
            return 0.8
        else:
            return 1.0

    def _score_features(self, value: Any) -> float:
        """Score based on number of features"""
        value_str = str(value).strip()
        feature_count = value_str.count('•') + value_str.count('*') + value_str.count('-')

        if feature_count < 3:
            return 0.3
        elif feature_count < 5:
            return 0.7
        else:
            return 1.0

    def _score_care_instructions(self, value: Any) -> float:
        """Score care instructions"""
        value_str = str(value).strip()
        if len(value_str) < 20:
            return 0.3
        elif len(value_str) < 100:
            return 0.7
        else:
            return 1.0

class URLValidator(FieldValidator):
    """Validator for URL fields"""

    def _validate_value(self, value: Any) -> Tuple[bool, str]:
        if not value:
            return True, ""  # Empty URLs are handled by required flag

        value_str = str(value).strip()
        if not value_str.startswith(('http://', 'https://')):
            return False, f"{self.field_name} must be a valid URL starting with http:// or https://"

        return True, ""

    def _calculate_value_quality(self, value: Any) -> float:
        """URLs get full score if valid"""
        if self._is_empty(value):
            return 0.0

        is_valid, _ = self.validate(value)
        return 1.0 if is_valid else 0.0

class ChoiceValidator(FieldValidator):
    """Validator for fields with predefined choices"""
    
    def __init__(self, field_name: str, choices: List[str], required: bool = False, weight: float = 1.0):
        super().__init__(field_name, required, weight)
        self.choices = [choice.lower() for choice in choices]
        self.original_choices = choices
    
    def _validate_value(self, value: Any) -> Tuple[bool, str]:
        if not isinstance(value, str):
            value = str(value)
        
        if value.lower().strip() in self.choices:
            return True, ""
        
        return False, f"{self.field_name} must be one of: {', '.join(self.original_choices)}"

class URLValidator(FieldValidator):
    """Validator for URL fields"""
    
    def __init__(self, field_name: str, required: bool = False, weight: float = 1.0):
        super().__init__(field_name, required, weight)
        self.url_pattern = re.compile(
            r'^https?://'  # http:// or https://
            r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|'  # domain...
            r'localhost|'  # localhost...
            r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})'  # ...or ip
            r'(?::\d+)?'  # optional port
            r'(?:/?|[/?]\S+)$', re.IGNORECASE)
    
    def _validate_value(self, value: Any) -> Tuple[bool, str]:
        if not isinstance(value, str):
            value = str(value)
        
        if not self.url_pattern.match(value.strip()):
            return False, f"{self.field_name} must be a valid URL"
        
        return True, ""

class CollectionValidator:
    """Validator for an entire product collection"""
    
    def __init__(self, collection_name: str):
        self.collection_name = collection_name
        self.validators: Dict[str, FieldValidator] = {}
        self.setup_validators()
    
    def setup_validators(self):
        """Override in subclasses to define collection-specific validators"""
        pass
    
    def add_validator(self, validator: FieldValidator):
        """Add a field validator"""
        self.validators[validator.field_name] = validator
    
    def validate_product(self, product_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate an entire product with customer-focused category breakdown
        Returns validation results with errors and quality score
        """
        errors = {}
        field_scores = {}

        for field_name, validator in self.validators.items():
            value = product_data.get(field_name)
            is_valid, error_message = validator.validate(value)

            if not is_valid:
                errors[field_name] = error_message

            field_scores[field_name] = validator.calculate_quality_score(value)

        # Calculate overall quality score
        total_weight = sum(validator.weight for validator in self.validators.values())
        weighted_score = sum(
            score * self.validators[field].weight
            for field, score in field_scores.items()
        )

        overall_quality = (weighted_score / total_weight * 100) if total_weight > 0 else 0

        # Calculate category scores for customer-focused insights
        category_scores = self._calculate_category_scores(field_scores)

        return {
            'is_valid': len(errors) == 0,
            'errors': errors,
            'field_scores': field_scores,
            'quality_score': round(overall_quality, 1),
            'category_scores': category_scores,
            'total_fields': len(self.validators),
            'completed_fields': sum(1 for score in field_scores.values() if score > 0),
            'validation_summary': {
                'critical_errors': len([e for f, e in errors.items() if self.validators[f].required]),
                'warning_count': len([e for f, e in errors.items() if not self.validators[f].required]),
                'completion_percentage': round(
                    sum(1 for score in field_scores.values() if score > 0) / len(self.validators) * 100, 1
                ),
                'customer_readiness': self._get_customer_readiness_summary(category_scores)
            }
        }

    def _calculate_category_scores(self, field_scores: Dict[str, float]) -> Dict[str, float]:
        """Calculate scores for customer-focused categories"""
        # Define category weight ranges (based on our new weighting system)
        purchase_decision_fields = [f for f, v in self.validators.items() if v.weight >= 6.0]
        search_discovery_fields = [f for f, v in self.validators.items() if 4.0 <= v.weight < 6.0]
        trust_confidence_fields = [f for f, v in self.validators.items() if 2.0 <= v.weight < 4.0]
        seo_findability_fields = [f for f, v in self.validators.items() if v.weight < 2.0]

        def calculate_category_score(fields):
            if not fields:
                return 0.0
            total_weight = sum(self.validators[f].weight for f in fields)
            weighted_score = sum(field_scores.get(f, 0) * self.validators[f].weight for f in fields)
            return (weighted_score / total_weight * 100) if total_weight > 0 else 0

        return {
            'purchase_decision': round(calculate_category_score(purchase_decision_fields), 1),
            'search_discovery': round(calculate_category_score(search_discovery_fields), 1),
            'trust_confidence': round(calculate_category_score(trust_confidence_fields), 1),
            'seo_findability': round(calculate_category_score(seo_findability_fields), 1)
        }

    def _get_customer_readiness_summary(self, category_scores: Dict[str, float]) -> str:
        """Get human-readable customer readiness assessment"""
        purchase = category_scores.get('purchase_decision', 0)
        search = category_scores.get('search_discovery', 0)

        if purchase >= 80 and search >= 80:
            return "Excellent - Ready for customers"
        elif purchase >= 60 and search >= 60:
            return "Good - Minor improvements needed"
        elif purchase >= 40 or search >= 40:
            return "Fair - Needs significant work"
        else:
            return "Poor - Not ready for customers"

class SinksValidator(CollectionValidator):
    """Customer-Centric Validator for Sinks & Tubs collection"""

    def setup_validators(self):
        # === PURCHASE DECISION FIELDS (40% weight) ===
        # What customers need to decide "yes, I want this"

        # Product images (critical for purchase decisions)
        self.add_validator(ContentQualityValidator('shopify_images',
            required=True, weight=8.0, content_type='images'))

        # Pricing (essential for decision making)
        self.add_validator(NumberValidator('shopify_price',
            required=True, weight=6.0, min_value=0))
        self.add_validator(NumberValidator('shopify_compare_price',
            required=False, weight=4.0, min_value=0))

        # Key specifications customers need
        self.add_validator(ChoiceValidator('installation_type', [
            'Topmount', 'Undermount', 'Flushmount', 'Wallmount', 'Apron Front', 'Tub & Cabinet'
        ], required=True, weight=6.0))

        self.add_validator(ChoiceValidator('product_material', [
            'Stainless Steel', 'Granite', 'Ceramic', 'Fireclay', 'Composite'
        ], required=True, weight=6.0))

        # === SEARCH/DISCOVERY FIELDS (30% weight) ===
        # What helps customers find the product

        self.add_validator(TextValidator('title',
            required=True, weight=8.0, min_length=10, max_length=200))
        self.add_validator(TextValidator('variant_sku',
            required=True, weight=4.0, min_length=2, max_length=50))
        self.add_validator(TextValidator('brand_name',
            required=True, weight=6.0, min_length=2, max_length=50))

        # Product description (affects search ranking)
        self.add_validator(ContentQualityValidator('body_html',
            required=True, weight=8.0, content_type='description', min_length=100))

        # === TRUST/CONFIDENCE FIELDS (20% weight) ===
        # What builds customer confidence

        # Key features (help customers understand value)
        self.add_validator(ContentQualityValidator('features',
            required=True, weight=6.0, content_type='features'))

        # Warranty information (builds trust)
        self.add_validator(TextValidator('warranty_years',
            required=False, weight=4.0, max_length=20))

        # Care instructions (reduces returns)
        self.add_validator(ContentQualityValidator('care_instructions',
            required=False, weight=3.0, content_type='care'))

        # Dimensions (technical confidence)
        self.add_validator(NumberValidator('length_mm',
            required=False, weight=3.0, min_value=100, max_value=2000))
        self.add_validator(NumberValidator('overall_width_mm',
            required=False, weight=3.0, min_value=100, max_value=2000))
        self.add_validator(NumberValidator('overall_depth_mm',
            required=False, weight=3.0, min_value=50, max_value=500))

        # === SEO/FINDABILITY FIELDS (10% weight) ===
        # What helps with search engine visibility

        self.add_validator(TextValidator('seo_title',
            required=False, weight=2.0, min_length=30, max_length=60))
        self.add_validator(TextValidator('seo_description',
            required=False, weight=2.0, min_length=120, max_length=160))
        self.add_validator(URLValidator('url',
            required=False, weight=1.0))

class TapsValidator(CollectionValidator):
    """Validator for Taps & Faucets collection"""
    
    def setup_validators(self):
        # Critical fields
        self.add_validator(TextValidator('sku', required=True, weight=3.0, min_length=2, max_length=50))
        self.add_validator(TextValidator('title', required=True, weight=3.0, min_length=5, max_length=200))
        self.add_validator(TextValidator('vendor', required=True, weight=2.0, min_length=2, max_length=100))
        
        # Product specifications
        self.add_validator(ChoiceValidator('tap_type', [
            'Kitchen Mixer', 'Basin Mixer', 'Bath Mixer', 'Shower Mixer', 'Laundry Mixer'
        ], required=False, weight=2.0))
        
        self.add_validator(ChoiceValidator('material', [
            'Stainless Steel', 'Brass', 'Chrome', 'Ceramic'
        ], required=False, weight=1.5))
        
        self.add_validator(ChoiceValidator('finish', [
            'Chrome', 'Brushed Nickel', 'Matte Black', 'Brushed Gold', 'Stainless Steel'
        ], required=False, weight=1.5))
        
        # Dimensions and specs
        self.add_validator(NumberValidator('height_mm', required=False, weight=1.0, min_value=50, max_value=800))
        self.add_validator(NumberValidator('spout_reach_mm', required=False, weight=1.0, min_value=50, max_value=500))
        self.add_validator(NumberValidator('water_flow_rate', required=False, weight=1.0, min_value=1, max_value=20))

class LightingValidator(CollectionValidator):
    """Validator for Lighting collection"""
    
    def setup_validators(self):
        # Critical fields
        self.add_validator(TextValidator('sku', required=True, weight=3.0, min_length=2, max_length=50))
        self.add_validator(TextValidator('title', required=True, weight=3.0, min_length=5, max_length=200))
        self.add_validator(TextValidator('vendor', required=True, weight=2.0, min_length=2, max_length=100))
        
        # Product specifications
        self.add_validator(ChoiceValidator('light_type', [
            'Pendant', 'Chandelier', 'Ceiling Mount', 'Wall Sconce', 'Track Light', 'Recessed'
        ], required=False, weight=2.0))
        
        self.add_validator(ChoiceValidator('bulb_type', [
            'LED', 'Halogen', 'Incandescent', 'Fluorescent'
        ], required=False, weight=1.5))
        
        # Technical specs
        self.add_validator(NumberValidator('wattage', required=False, weight=1.5, min_value=1, max_value=500))
        self.add_validator(NumberValidator('voltage', required=False, weight=1.0, min_value=12, max_value=240))
        self.add_validator(NumberValidator('lumens', required=False, weight=1.0, min_value=100, max_value=10000))

# Validator Registry
VALIDATORS = {
    'sinks': SinksValidator('sinks'),
    'taps': TapsValidator('taps'),
    'lighting': LightingValidator('lighting')
}

def get_validator(collection_name: str) -> CollectionValidator:
    """Get validator for a specific collection"""
    if collection_name not in VALIDATORS:
        raise ValueError(f"Unknown collection: {collection_name}. Available: {list(VALIDATORS.keys())}")
    return VALIDATORS[collection_name]

def validate_product_data(collection_name: str, product_data: Dict[str, Any]) -> Dict[str, Any]:
    """Validate product data for a specific collection"""
    validator = get_validator(collection_name)
    return validator.validate_product(product_data)

def calculate_quality_score(collection_name: str, product_data: Dict[str, Any]) -> float:
    """Calculate quality score for a product"""
    validation_result = validate_product_data(collection_name, product_data)
    return validation_result['quality_score']