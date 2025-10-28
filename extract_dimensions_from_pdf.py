"""
PDF Dimension Extractor using Claude AI API
Extracts product dimensions from PDF spec sheets
"""
import os
import base64
import json
import anthropic
from pathlib import Path
from typing import Dict, Optional, List
try:
    from pdf2image import convert_from_path
    PDF2IMAGE_AVAILABLE = True
except ImportError:
    PDF2IMAGE_AVAILABLE = False
    print("⚠️ pdf2image not available - will try direct PDF upload")

class PDFDimensionExtractor:
    """Extract dimensions from PDF spec sheets using Claude AI"""

    def __init__(self, api_key: str = None):
        """
        Initialize the extractor with Anthropic API key

        Args:
            api_key: Anthropic API key. If not provided, reads from ANTHROPIC_API_KEY env var
        """
        self.api_key = api_key or os.environ.get('ANTHROPIC_API_KEY')
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY not found. Set it as environment variable or pass as argument.")

        self.client = anthropic.Anthropic(api_key=self.api_key)
        # Use Claude 3 Sonnet - base model available to all API tiers
        self.model = "claude-3-sonnet-20240229"

    def extract_dimensions_from_pdf(self, pdf_path: str, product_type: str = "sink") -> Dict:
        """
        Extract dimensions from a PDF spec sheet

        Args:
            pdf_path: Path to the PDF file
            product_type: Type of product (sink, tap, lighting, etc.)

        Returns:
            Dictionary with extracted dimensions
        """
        print(f"\n📄 Processing PDF: {pdf_path}")

        # Read and encode PDF
        pdf_data = self._read_pdf(pdf_path)
        if not pdf_data:
            return {"error": "Failed to read PDF"}

        # Create prompt based on product type
        prompt = self._build_extraction_prompt(product_type)

        # Call Claude API with PDF
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=2000,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "document",
                                "source": {
                                    "type": "base64",
                                    "media_type": "application/pdf",
                                    "data": pdf_data
                                }
                            },
                            {
                                "type": "text",
                                "text": prompt
                            }
                        ]
                    }
                ]
            )

            # Parse response
            result = self._parse_claude_response(response.content[0].text)
            print(f"✅ Extracted dimensions: {json.dumps(result, indent=2)}")
            return result

        except Exception as e:
            print(f"❌ Error calling Claude API: {e}")
            return {"error": str(e)}

    def _read_pdf(self, pdf_path: str) -> Optional[str]:
        """Read PDF file and return base64 encoded data"""
        try:
            with open(pdf_path, 'rb') as f:
                pdf_bytes = f.read()
            return base64.standard_b64encode(pdf_bytes).decode('utf-8')
        except Exception as e:
            print(f"❌ Error reading PDF: {e}")
            return None

    def _build_extraction_prompt(self, product_type: str) -> str:
        """Build extraction prompt based on product type"""

        base_prompt = """Please extract all product dimensions from this PDF spec sheet.

Look for measurements in the following formats:
- Length/Width/Height/Depth (in mm or inches)
- Cutout dimensions
- Installation dimensions
- Bowl dimensions (for sinks)
- For double bowl sinks: Extract dimensions for BOTH bowls separately
- Any other relevant measurements

Return the data in JSON format with the following structure:
"""

        if product_type.lower() in ["sink", "sinks"]:
            schema = """
{
  "overall_length_mm": <number or null>,
  "overall_width_mm": <number or null>,
  "overall_depth_mm": <number or null>,
  "bowl_length_mm": <number or null>,
  "bowl_width_mm": <number or null>,
  "bowl_depth_mm": <number or null>,
  "second_bowl_length_mm": <number or null>,
  "second_bowl_width_mm": <number or null>,
  "second_bowl_depth_mm": <number or null>,
  "cutout_length_mm": <number or null>,
  "cutout_width_mm": <number or null>,
  "minimum_cabinet_size_mm": <number or null>,
  "measurements_unit": "mm",
  "notes": "<any important notes about dimensions>"
}"""

        elif product_type.lower() in ["tap", "taps", "faucet", "mixer"]:
            schema = """
{
  "height_mm": <number or null>,
  "spout_reach_mm": <number or null>,
  "spout_height_mm": <number or null>,
  "base_diameter_mm": <number or null>,
  "installation_holes": <number or null>,
  "hole_diameter_mm": <number or null>,
  "measurements_unit": "mm",
  "notes": "<any important notes about dimensions>"
}

CRITICAL - Tap/Faucet Dimension Definitions:
- spout_reach_mm: Horizontal distance from mounting center to end of spout (also called "projection" or "reach")
- spout_height_mm: Vertical height from mounting surface/deck to the SPOUT OUTLET (where water comes out), NOT the total height
- height_mm: Total overall height from base to top of tap (tallest point)

IMPORTANT: spout_height_mm is DIFFERENT from total height. Look carefully at the technical drawing for:
- The dimension showing vertical distance to the spout outlet/tip (where water exits)
- Labels like "Spout height", "Outlet height", or "H" measured to the spout
- DO NOT use the total/overall height for spout_height_mm"""

        elif product_type.lower() == "lighting":
            schema = """
{
  "length_mm": <number or null>,
  "width_mm": <number or null>,
  "height_mm": <number or null>,
  "diameter_mm": <number or null>,
  "cutout_diameter_mm": <number or null>,
  "cutout_length_mm": <number or null>,
  "cutout_width_mm": <number or null>,
  "measurements_unit": "mm",
  "notes": "<any important notes about dimensions>"
}"""

        else:
            schema = """
{
  "length_mm": <number or null>,
  "width_mm": <number or null>,
  "height_mm": <number or null>,
  "depth_mm": <number or null>,
  "measurements_unit": "mm",
  "notes": "<any important notes about dimensions>"
}"""

        prompt = f"""{base_prompt}
{schema}

IMPORTANT:
- All measurements should be in millimeters (mm)
- If measurements are in inches, convert to mm (1 inch = 25.4 mm)
- Return only the JSON object, no additional text
- Use null for any dimension not found in the PDF
- Be precise with numbers - extract exact values from the spec sheet
- Include any important notes about the dimensions in the "notes" field"""

        # Add sink-specific instructions
        if product_type.lower() in ["sink", "sinks"]:
            prompt += """
- For DOUBLE BOWL sinks: Look for dimensions for BOTH bowls
- The first bowl dimensions go in bowl_length_mm, bowl_width_mm, bowl_depth_mm
- The second bowl dimensions go in second_bowl_length_mm, second_bowl_width_mm, second_bowl_depth_mm
- If it's a single bowl sink, set all second_bowl_* fields to null
- Check the technical drawings carefully - double bowls often show two separate bowl measurements
"""
        else:
            prompt += "\n"""
        return prompt

    def _parse_claude_response(self, response_text: str) -> Dict:
        """Parse Claude's response and extract JSON"""
        try:
            # Clean response (remove markdown code blocks if present)
            response_text = response_text.strip()
            if response_text.startswith('```'):
                # Remove code block markers
                lines = response_text.split('\n')
                response_text = '\n'.join(lines[1:-1])

            # Parse JSON
            result = json.loads(response_text)

            # ALWAYS calculate minimum cabinet size (override any value from PDF)
            # Rule: Add 30mm clearance to length and round to nearest standard cabinet size
            if result.get('overall_length_mm') or result.get('length_mm'):
                length = result.get('overall_length_mm') or result.get('length_mm')
                if length:
                    # Add 30mm clearance
                    required_size = length + 30

                    # Standard cabinet sizes in mm (common Australian/international sizes)
                    standard_sizes = [
                        300, 350, 400, 450, 500, 550, 600, 650, 700, 750,
                        800, 850, 900, 950, 1000, 1050, 1100, 1150, 1200,
                        1250, 1300, 1350, 1400, 1450, 1500, 1550, 1600,
                        1650, 1700, 1750, 1800, 1850, 1900, 1950, 2000
                    ]

                    # Find the smallest standard size that fits
                    cabinet_size = None
                    for size in standard_sizes:
                        if size >= required_size:
                            cabinet_size = size
                            break

                    # If no standard size fits, round up to nearest 50mm
                    if cabinet_size is None:
                        cabinet_size = int((required_size + 49) // 50 * 50)

                    # Store the calculated value and log if we're overriding
                    if result.get('minimum_cabinet_size_mm') and result['minimum_cabinet_size_mm'] != cabinet_size:
                        print(f"📐 Overriding PDF value ({result['minimum_cabinet_size_mm']}mm) with calculated: {length}mm (sink) + 30mm (clearance) = {required_size}mm → {cabinet_size}mm (standard size)")
                    else:
                        print(f"📐 Auto-calculated min cabinet size: {length}mm (sink) + 30mm (clearance) = {required_size}mm → {cabinet_size}mm (standard size)")

                    result['minimum_cabinet_size_mm'] = cabinet_size

            return result

        except json.JSONDecodeError as e:
            print(f"⚠️ Failed to parse JSON response: {e}")
            print(f"Raw response: {response_text}")
            return {
                "error": "Failed to parse response",
                "raw_response": response_text
            }

    def batch_extract(self, pdf_directory: str, product_type: str = "sink") -> List[Dict]:
        """
        Extract dimensions from all PDFs in a directory

        Args:
            pdf_directory: Path to directory containing PDF files
            product_type: Type of product

        Returns:
            List of results for each PDF
        """
        pdf_dir = Path(pdf_directory)
        if not pdf_dir.exists():
            print(f"❌ Directory not found: {pdf_directory}")
            return []

        # Find all PDF files
        pdf_files = list(pdf_dir.glob("*.pdf"))
        print(f"\n📁 Found {len(pdf_files)} PDF files in {pdf_directory}")

        results = []
        for i, pdf_path in enumerate(pdf_files, 1):
            print(f"\n{'='*60}")
            print(f"Processing {i}/{len(pdf_files)}: {pdf_path.name}")
            print(f"{'='*60}")

            result = self.extract_dimensions_from_pdf(str(pdf_path), product_type)
            results.append({
                "filename": pdf_path.name,
                "dimensions": result
            })

        return results


def main():
    """Example usage"""
    import sys

    print("\n" + "="*60)
    print("PDF Dimension Extractor - Claude AI")
    print("="*60)

    # Check if API key is set
    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        print("\n❌ ERROR: ANTHROPIC_API_KEY not set")
        print("\nTo use this script:")
        print("1. Get your API key from: https://console.anthropic.com/")
        print("2. Set environment variable:")
        print("   export ANTHROPIC_API_KEY='your-api-key-here'")
        print("\n")
        return

    # Example: Extract from single PDF
    if len(sys.argv) > 1:
        pdf_path = sys.argv[1]
        product_type = sys.argv[2] if len(sys.argv) > 2 else "sink"

        extractor = PDFDimensionExtractor()
        result = extractor.extract_dimensions_from_pdf(pdf_path, product_type)

        print("\n" + "="*60)
        print("EXTRACTION RESULT")
        print("="*60)
        print(json.dumps(result, indent=2))

    else:
        print("\nUsage:")
        print("  python extract_dimensions_from_pdf.py <pdf_path> [product_type]")
        print("\nExample:")
        print("  python extract_dimensions_from_pdf.py spec_sheet.pdf sink")
        print("\nProduct types: sink, tap, lighting, shower_mixer, bathroom_vanity")
        print("\nOr use batch processing:")
        print("  extractor = PDFDimensionExtractor()")
        print("  results = extractor.batch_extract('./pdf_directory', 'sink')")


if __name__ == '__main__':
    main()
