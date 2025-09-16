"""
FAQ Generator using OpenAI ChatGPT
Generates product-specific FAQs based on existing product data
"""
import os
import json
from openai import OpenAI
from typing import Dict, List, Optional
from core.settings import Settings


class FAQGenerator:
    """Generate FAQs for products using ChatGPT"""

    def __init__(self):
        self.settings = Settings()
        self.client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

    def generate_faqs(self, product_data: Dict, collection_type: str = "sinks") -> str:
        """
        Generate FAQs based on product data

        Args:
            product_data: Dictionary containing product information
            collection_type: Type of product collection (sinks, taps, lighting)

        Returns:
            String containing formatted FAQs
        """
        try:
            # Extract relevant product information for FAQ generation
            product_info = self._extract_product_info(product_data, collection_type)

            # Create ChatGPT prompt
            prompt = self._create_faq_prompt(product_info, collection_type)

            # Generate FAQs using OpenAI
            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a product specialist generating helpful FAQs for plumbing and lighting products. Focus on practical customer questions about installation, compatibility, maintenance, and specifications."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                max_tokens=1000,
                temperature=0.7
            )

            faqs = response.choices[0].message.content.strip()
            return faqs

        except Exception as e:
            print(f"Error generating FAQs: {e}")
            return ""

    def _extract_product_info(self, product_data: Dict, collection_type: str) -> Dict:
        """Extract relevant product information for FAQ generation"""

        # Common fields for all products
        info = {
            'title': product_data.get('title', ''),
            'brand_name': product_data.get('brand_name', ''),
            'material': product_data.get('product_material', '') or product_data.get('material', ''),
            'warranty_years': product_data.get('warranty_years', ''),
            'features': product_data.get('features', ''),
            'care_instructions': product_data.get('care_instructions', ''),
            'body_html': product_data.get('body_html', '')
        }

        # Collection-specific fields
        if collection_type == "sinks":
            info.update({
                'installation_type': product_data.get('installation_type', ''),
                'grade_of_material': product_data.get('grade_of_material', ''),
                'style': product_data.get('style', ''),
                'has_overflow': product_data.get('has_overflow', ''),
                'holes_number': product_data.get('tap_holes_number', ''),
                'bowls_number': product_data.get('bowls_number', ''),
                'dimensions': f"{product_data.get('length_mm', '')}×{product_data.get('overall_width_mm', '')}×{product_data.get('overall_depth_mm', '')}mm",
                'min_cabinet_size': product_data.get('min_cabinet_size_mm', ''),
                'application_location': product_data.get('application_location', ''),
                'drain_position': product_data.get('drain_position', '')
            })
        elif collection_type == "taps":
            info.update({
                'tap_type': product_data.get('tap_type', ''),
                'finish': product_data.get('finish', ''),
                'mounting_type': product_data.get('mounting_type', ''),
                'spout_type': product_data.get('spout_type', ''),
                'handle_type': product_data.get('handle_type', ''),
                'water_flow_rate': product_data.get('water_flow_rate', ''),
                'pressure_rating': product_data.get('pressure_rating', ''),
                'aerator_type': product_data.get('aerator_type', ''),
                'valve_type': product_data.get('valve_type', '')
            })
        elif collection_type == "lighting":
            info.update({
                'light_type': product_data.get('light_type', ''),
                'bulb_type': product_data.get('bulb_type', ''),
                'wattage': product_data.get('wattage', ''),
                'color_temperature': product_data.get('color_temperature', ''),
                'lumens': product_data.get('lumens', ''),
                'dimming_compatible': product_data.get('dimming_compatible', ''),
                'ip_rating': product_data.get('ip_rating', ''),
                'finish': product_data.get('finish', ''),
                'mounting_type': product_data.get('mounting_type', '')
            })

        # Remove empty values
        return {k: v for k, v in info.items() if v and str(v).strip()}

    def _create_faq_prompt(self, product_info: Dict, collection_type: str) -> str:
        """Create ChatGPT prompt for FAQ generation"""

        product_details = "\n".join([f"- {k.replace('_', ' ').title()}: {v}" for k, v in product_info.items()])

        prompt = f"""
Based on the following {collection_type} product information, generate 5-7 frequently asked questions and answers that customers would typically ask about this product.

Product Details:
{product_details}

Please focus on practical questions that customers would have about:
- Installation requirements and compatibility
- Product specifications and features
- Maintenance and care
- Dimensions and sizing
- Material properties and durability
- Warranty and support

Format the response as:
Q: [Question]
A: [Answer]

Q: [Question]
A: [Answer]

Keep answers concise but informative, and base all answers strictly on the provided product information. Do not make assumptions about features or specifications not mentioned in the product details.
"""

        return prompt

    def update_product_faqs(self, collection_name: str, row_number: int, product_data: Dict) -> bool:
        """
        Generate and update FAQs for a specific product

        Args:
            collection_name: Name of the collection (sinks, taps, lighting)
            row_number: Row number in the spreadsheet
            product_data: Product data dictionary

        Returns:
            bool: True if successful, False otherwise
        """
        try:
            # Generate FAQs
            faqs = self.generate_faqs(product_data, collection_name)

            if not faqs:
                print(f"No FAQs generated for {collection_name} row {row_number}")
                return False

            # Update the spreadsheet with FAQs
            from core.sheets_manager import sheets_manager
            config = sheets_manager.get_collection_config(collection_name)
            faq_column = config.column_mapping.get('faqs')

            if not faq_column:
                print(f"FAQ column not configured for {collection_name}")
                return False

            # Update the cell with generated FAQs
            success = sheets_manager.update_cell_value(
                collection_name,
                row_number,
                faq_column,
                faqs
            )

            if success:
                print(f"✅ FAQs updated for {collection_name} row {row_number}")
            else:
                print(f"❌ Failed to update FAQs for {collection_name} row {row_number}")

            return success

        except Exception as e:
            print(f"Error updating FAQs: {e}")
            return False


# Global instance
faq_generator = FAQGenerator()