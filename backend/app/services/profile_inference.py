"""
AI Profile Inference - Pre-fill contact profiles from extracted services.
This module analyzes a contact's offers/requests to infer profile fields.
"""
import re
import logging
from typing import Dict, List, Any, Optional
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from app.core.config import settings

logger = logging.getLogger(__name__)

# Role tag keywords to detect from service descriptions
ROLE_TAG_KEYWORDS = {
    'buyer': ['buyer', 'buying', 'purchase', 'acquire', 'looking for deals', 'looking for properties'],
    'seller': ['seller', 'selling', 'have deal', 'have property', 'disposing'],
    'wholesaler': ['wholesaler', 'wholesale', 'assign', 'assignment fee'],
    'lender': ['lender', 'lending', 'fund', 'funding', 'capital', 'hard money', 'private money', 'money to lend'],
    'investor': ['investor', 'investing', 'invest', 'deploy capital'],
    'tc': ['tc', 'transaction coordinator', 'coordination', 'closing'],
    'gator': ['gator', 'gator lender', 'earnest money', 'emd'],
    'subto': ['subto', 'subject to', 'sub-to', 'sub2', 'creative finance'],
    'bird_dog': ['bird dog', 'birddog', 'finding deals', 'lead generation'],
}

# Asset class keywords
ASSET_CLASS_KEYWORDS = {
    'SFH': ['sfh', 'single family', 'single-family', 'house', 'home'],
    'Multifamily': ['multifamily', 'multi-family', 'apartment', 'duplex', 'triplex', 'fourplex', 'unit'],
    'Commercial': ['commercial', 'office', 'retail', 'shopping'],
    'Land': ['land', 'lot', 'acreage', 'vacant'],
    'Mobile Home': ['mobile home', 'manufactured', 'trailer', 'mh'],
    'Industrial': ['industrial', 'warehouse', 'distribution'],
}

# State codes to detect markets
STATE_CODES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY']
STATE_NAMES = {
    'texas': 'TX', 'florida': 'FL', 'california': 'CA', 'missouri': 'MO',
    'ohio': 'OH', 'georgia': 'GA', 'arizona': 'AZ', 'colorado': 'CO',
    'new york': 'NY', 'north carolina': 'NC', 'tennessee': 'TN', 'indiana': 'IN',
    'michigan': 'MI', 'pennsylvania': 'PA', 'nevada': 'NV', 'oklahoma': 'OK',
    'nationwide': 'Nationwide', 'all states': 'Nationwide'
}

def extract_role_tags(text: str) -> List[str]:
    """Extract role tags from text based on keyword matching."""
    text_lower = text.lower()
    detected = set()
    for role, keywords in ROLE_TAG_KEYWORDS.items():
        for kw in keywords:
            if kw in text_lower:
                detected.add(role)
                break
    return list(detected)

def extract_asset_classes(text: str) -> List[str]:
    """Extract asset classes from text."""
    text_lower = text.lower()
    detected = set()
    for asset, keywords in ASSET_CLASS_KEYWORDS.items():
        for kw in keywords:
            if kw in text_lower:
                detected.add(asset)
                break
    return list(detected)

def extract_markets(text: str) -> List[str]:
    """Extract geographic markets (states) from text."""
    detected = set()
    text_upper = text.upper()
    text_lower = text.lower()
    
    # Check for state codes (with word boundaries)
    for code in STATE_CODES:
        if re.search(rf'\b{code}\b', text_upper):
            detected.add(code)
    
    # Check for state names
    for name, code in STATE_NAMES.items():
        if name in text_lower:
            detected.add(code)
    
    return list(detected)

def extract_prices(text: str) -> Dict[str, Optional[float]]:
    """Extract price mentions from text."""
    prices = []
    
    # Match patterns like $500k, $1M, $100,000, etc.
    patterns = [
        r'\$(\d+(?:,\d{3})*(?:\.\d+)?)\s*[kK]',  # $500k
        r'\$(\d+(?:\.\d+)?)\s*[mM]',  # $1M
        r'\$(\d+(?:,\d{3})*(?:\.\d+)?)',  # $100,000
        r'(\d+(?:,\d{3})*)\s*dollars?',  # 100000 dollars
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, text)
        for match in matches:
            try:
                num = float(match.replace(',', ''))
                # Handle k and M suffixes
                if 'k' in text.lower()[text.lower().find(match):text.lower().find(match)+len(match)+2]:
                    num *= 1000
                elif 'm' in text.lower()[text.lower().find(match):text.lower().find(match)+len(match)+2]:
                    num *= 1000000
                prices.append(num)
            except:
                pass
    
    if not prices:
        return {'min': None, 'max': None}
    
    return {
        'min': min(prices) if prices else None,
        'max': max(prices) if prices else None
    }

    # Build profile update
    profile_update = {}
    field_provenance = {}

def infer_profile_from_services(services: List[Dict[str, Any]], contact_name: str, extracted_roles: List[str] = None) -> Dict[str, Any]:
    """
    Infer profile fields from a contact's services AND explicitly extracted roles.
    Returns a dict of inferred profile fields ready for database update.
    """
    # Combine all service descriptions for this contact
    all_descriptions = []
    offers = []
    requests = []
    
    for service in services:
        desc = service.get('description', '')
        all_descriptions.append(desc)
        if service.get('type') == 'offer':
            offers.append(desc)
        else:
            requests.append(desc)
    
    # Extract fields
    role_tags = extract_role_tags(combined_text)
    
    # Merge explicit extracted roles (e.g. from Emojis/Regex)
    if extracted_roles:
        # Normalize and dedup
        role_tags.extend([r for r in extracted_roles if r not in role_tags])
        
    assets = extract_asset_classes(combined_text)
    markets = extract_markets(combined_text)
    prices = extract_prices(combined_text)
    
    # Extract "Hot Plate" (simple heuristic)
    hot_plate = None
    hot_plate_match = re.search(r'(currently working on|looking for|active in)\s+([^.\n]+)', combined_text, re.IGNORECASE)
    if hot_plate_match:
        hot_plate = hot_plate_match.group(2).strip()
    
    # Build structured Buy Box
    # Only if we have some investment criteria
    buy_box = {}
    if assets or markets or prices['min'] or prices['max'] or 'investor' in role_tags or 'buyer' in role_tags:
        buy_box = {
             "assets": assets,
             "markets": markets,
             "min_price": prices['min'],
             "max_price": prices['max'],
             "strategy": [r for r in role_tags if r in ['subto', 'gator', 'wholesaler']]
        }

    # Build profile update
    profile_update = {}
    field_provenance = {}
    
    # --- Populating Fields ---
    
    if role_tags:
        profile_update['role_tags'] = role_tags
        field_provenance['role_tags'] = 'ai_generated'
    
    if assets:
        profile_update['asset_classes'] = assets
        field_provenance['asset_classes'] = 'ai_generated'
    
    if markets:
        profile_update['markets'] = markets
        field_provenance['markets'] = 'ai_generated'
        
    if prices['min']:
        profile_update['min_target_price'] = prices['min']
        field_provenance['min_target_price'] = 'ai_generated'
    
    if prices['max']:
        profile_update['max_target_price'] = prices['max']
        field_provenance['max_target_price'] = 'ai_generated'
        
    if buy_box:
        profile_update['buy_box'] = buy_box
        field_provenance['buy_box'] = 'ai_generated'
        
    if hot_plate:
        profile_update['hot_plate'] = hot_plate
        field_provenance['hot_plate'] = 'ai_generated'
    
    # Build "I can help with" from offers
    if offers:
        help_with = '; '.join(offers[:3])  # Top 3 offers
        if len(help_with) > 300:
            help_with = help_with[:297] + '...'
        profile_update['i_can_help_with'] = help_with
        field_provenance['i_can_help_with'] = 'ai_generated'
    
    # Build "Help me with" from requests
    if requests:
        need_help = '; '.join(requests[:3])  # Top 3 requests
        if len(need_help) > 300:
            need_help = need_help[:297] + '...'
        profile_update['help_me_with'] = need_help
        field_provenance['help_me_with'] = 'ai_generated'
    
    profile_update['field_provenance'] = field_provenance
    
    return profile_update


async def update_contact_profile_from_services(client, contact_id: str, services: List[Dict], extracted_roles: List[str] = None) -> bool:
    """
    Updates a contact's profile with AI-inferred data from their services AND explicit roles.
    Only updates fields that are currently empty and marks them as ai_generated.
    """
    if not services and not extracted_roles:
        return False
    
    try:
        # Get contact name
        contact_res = client.table("contacts").select("name").eq("id", contact_id).execute()
        if not contact_res.data:
            return False
        contact_name = contact_res.data[0].get('name', 'Unknown')
        
        # Infer profile
        inferred = infer_profile_from_services(services, contact_name, extracted_roles)
        if not inferred or len(inferred) <= 1:  # Only has field_provenance
            return False
        
        # Check if profile exists
        existing = client.table("contact_profiles").select("*").eq("contact_id", contact_id).execute()
        
        if existing.data:
            # Update only empty fields
            current = existing.data[0]
            current_provenance = current.get('field_provenance', {}) or {}
            new_provenance = inferred.pop('field_provenance', {})
            
            updates = {}
            for field, value in inferred.items():
                # Only update if current field is empty/null
                if not current.get(field) or (isinstance(current.get(field), list) and len(current.get(field)) == 0):
                    updates[field] = value
                    current_provenance[field] = new_provenance.get(field, 'ai_generated')
            
            if updates:
                updates['field_provenance'] = current_provenance
                client.table("contact_profiles").update(updates).eq("contact_id", contact_id).execute()
                logger.info(f"Updated profile for {contact_name} with AI-inferred: {list(updates.keys())}")
                return True
        else:
            # Create new profile with inferred data
            inferred['contact_id'] = contact_id
            client.table("contact_profiles").insert(inferred).execute()
            logger.info(f"Created AI-inferred profile for {contact_name}")
            return True
        
        return False
        
    except Exception as e:
        logger.error(f"Profile inference failed for {contact_id}: {e}")
        return False
