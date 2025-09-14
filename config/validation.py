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
        Validate an entire product
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
        
        return {
            'is_valid': len(errors) == 0,
            'errors': errors,
            'field_scores': field_scores,
            'quality_score': round(overall_quality, 1),
            'total_fields': len(self.validators),
            'completed_fields': sum(1 for score in field_scores.values() if score > 0),
            'validation_summary': {
                'critical_errors': len([e for f, e in errors.items() if self.validators[f].required]),
                'warning_count': len([e for f, e in errors.items() if not self.validators[f].required]),
                'completion_percentage': round(
                    sum(1 for score in field_scores.values() if score > 0) / len(self.validators) * 100, 1
                )
            }
        }

class SinksValidator(CollectionValidator):
    """Validator for Sinks & Tubs collection"""
    
    def setup_validators(self):
        # Critical fields (high weight)
        self.add_validator(TextValidator('sku', required=True, weight=3.0, min_length=2, max_length=50))
        self.add_validator(TextValidator('title', required=True, weight=3.0, min_length=5, max_length=200))
        self.add_validator(TextValidator('vendor', required=True, weight=2.0, min_length=2, max_length=100))
        
        # Product specifications (medium weight)
        self.add_validator(ChoiceValidator('installation_type', [
            'Topmount', 'Undermount', 'Flushmount', 'Wallmount', 'Apron Front', 'Tub & Cabinet'
        ], required=False, weight=2.0))
        
        self.add_validator(ChoiceValidator('product_material', [
            'Stainless Steel', 'Granite', 'Ceramic', 'Fireclay', 'Composite'
        ], required=False, weight=2.0))
        
        self.add_validator(TextValidator('brand_name', required=False, weight=1.5, min_length=2, max_length=50))
        
        # Dimensions (medium weight)
        self.add_validator(NumberValidator('length_mm', required=False, weight=1.5, min_value=100, max_value=2000))
        self.add_validator(NumberValidator('overall_width_mm', required=False, weight=1.5, min_value=100, max_value=2000))
        self.add_validator(NumberValidator('overall_depth_mm', required=False, weight=1.5, min_value=50, max_value=500))
        
        # Technical specifications (low weight)
        self.add_validator(BooleanValidator('is_undermount_sink', required=False, weight=1.0))
        self.add_validator(BooleanValidator('has_overflow', required=False, weight=1.0))
        self.add_validator(NumberValidator('holes_number', required=False, weight=1.0, min_value=0, max_value=5, allow_decimal=False))
        self.add_validator(NumberValidator('bowls_number', required=False, weight=1.0, min_value=1, max_value=4, allow_decimal=False))
        
        # Optional fields (low weight)
        self.add_validator(TextValidator('style', required=False, weight=0.5, max_length=50))
        self.add_validator(TextValidator('warranty_years', required=False, weight=0.5, max_length=20))
        self.add_validator(URLValidator('url', required=False, weight=0.5))

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