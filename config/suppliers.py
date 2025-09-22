"""
Supplier Configuration System
Maps brand names to supplier contact information for bulk communication
"""

class SupplierContact:
    """Supplier contact information"""

    def __init__(self, name, email, contact_person=None, company_name=None, phone=None):
        self.name = name
        self.email = email
        self.contact_person = contact_person or name
        self.company_name = company_name or name
        self.phone = phone

    def to_dict(self):
        return {
            'name': self.name,
            'email': self.email,
            'contact_person': self.contact_person,
            'company_name': self.company_name,
            'phone': self.phone
        }

# Supplier contact database
# Map brand names to supplier contact information
SUPPLIER_CONTACTS = {
    'Phoenix Tapware': SupplierContact(
        name='Phoenix Tapware',
        email='info@phoenixtapware.com.au',
        contact_person='Phoenix Sales Team',
        company_name='Phoenix Tapware Pty Ltd'
    ),
    'ABI Interiors': SupplierContact(
        name='ABI Interiors',
        email='sales@abiinteriors.com.au',
        contact_person='ABI Sales Team',
        company_name='ABI Interiors'
    ),
    'Methven': SupplierContact(
        name='Methven',
        email='australia@methven.com',
        contact_person='Methven Australia Team',
        company_name='Methven'
    ),
    'Caroma': SupplierContact(
        name='Caroma',
        email='customerservice@caroma.com.au',
        contact_person='Caroma Customer Service',
        company_name='Caroma Industries'
    ),
    # Add more suppliers as needed
}

# Default supplier for unmapped brands
DEFAULT_SUPPLIER = SupplierContact(
    name='General Supplier',
    email='scott@cassbrothers.com.au',  # Falls back to your email for manual handling
    contact_person='Supplier Contact',
    company_name='Unknown Supplier'
)

def get_supplier_contact(brand_name):
    """Get supplier contact information for a brand"""
    if not brand_name:
        return None

    # Clean brand name for lookup
    brand_clean = brand_name.strip().title()

    # Direct lookup
    if brand_clean in SUPPLIER_CONTACTS:
        return SUPPLIER_CONTACTS[brand_clean]

    # Fuzzy matching for common variations
    for supplier_brand, contact in SUPPLIER_CONTACTS.items():
        if brand_clean.lower() in supplier_brand.lower() or supplier_brand.lower() in brand_clean.lower():
            return contact

    # Return default for unmapped brands
    return DEFAULT_SUPPLIER

def get_all_suppliers():
    """Get all configured suppliers"""
    return SUPPLIER_CONTACTS

def add_supplier_contact(brand_name, supplier_contact):
    """Add a new supplier contact"""
    SUPPLIER_CONTACTS[brand_name] = supplier_contact

def update_supplier_contact(brand_name, **kwargs):
    """Update existing supplier contact"""
    if brand_name in SUPPLIER_CONTACTS:
        contact = SUPPLIER_CONTACTS[brand_name]
        for key, value in kwargs.items():
            if hasattr(contact, key):
                setattr(contact, key, value)