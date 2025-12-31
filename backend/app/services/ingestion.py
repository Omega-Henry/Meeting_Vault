import re
import hashlib
from typing import List, Tuple, Dict, Set
from app.schemas import ContactBase, ServiceBase, ExtractedData

def clean_text(text: str) -> str:
    # Simple cleaning: remove excessive whitespace, null bytes
    text = text.replace("\x00", "")
    return re.sub(r'\s+', ' ', text).strip()

def compute_hash(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

def normalize_link(link: str) -> str:
    link = link.strip()
    # Remove fragments
    if '#' in link:
        link = link.split('#')[0]
    
    # Remove utm params (simple version)
    if 'utm_' in link:
        # This is a naive removal, a proper URL parser is better but this works for MVP
        parts = link.split('?')
        if len(parts) > 1:
            query = parts[1]
            params = query.split('&')
            filtered_params = [p for p in params if not p.startswith('utm_')]
            if filtered_params:
                link = parts[0] + '?' + '&'.join(filtered_params)
            else:
                link = parts[0]
    
    # Add protocol
    if not link.startswith(('http://', 'https://')):
        if link.startswith('www.'):
            link = 'https://' + link
        else:
            # Bare domain or other
            link = 'https://' + link
            
    return link

def extract_links(text: str) -> List[str]:
    # Robust link regex
    url_pattern = r'(https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/[a-zA-Z0-9]+\.[^\s]{2,})'
    raw_links = re.findall(url_pattern, text)
    # Filter out phone-like numbers that might match loose URL patterns if any
    # The regex above is decent.
    return [l for l in raw_links if not re.match(r'^\d+(\.\d+)+$', l)]

def extract_contacts(text: str) -> List[ContactBase]:
    contacts = []
    
    # Emails
    email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
    emails = list(set(re.findall(email_pattern, text)))
    
    # Phones (US-centric simple regex for MVP)
    phone_pattern = r'\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}'
    phones = list(set(re.findall(phone_pattern, text)))
    
    # For MVP, we treat each email/phone as a potential separate contact 
    # unless we can link them (which is hard without LLM or structured format).
    # We will create one contact per email. Phones that don't map to lines with emails are separate.
    # This is a simplification.
    
    for email in emails:
        contacts.append(ContactBase(email=email, links=[]))
        
    for phone in phones:
        # Check if this phone is near an email? Too complex for deterministic MVP.
        # Just add as separate contact for now.
        contacts.append(ContactBase(phone=phone, links=[]))
        
    return contacts

def extract_services(text: str) -> List[ServiceBase]:
    services = []
    lines = text.split('.') # Split by sentences roughly
    
    offer_keywords = ["i offer", "i provide", "service", "i can help", "offering"]
    request_keywords = ["looking for", "need", "seeking", "anyone know", "searching for"]
    
    for line in lines:
        line_lower = line.lower()
        
        # Check for Offer
        is_offer = any(k in line_lower for k in offer_keywords)
        # Check for Request
        is_request = any(k in line_lower for k in request_keywords)
        
        if is_offer:
            links = extract_links(line)
            services.append(ServiceBase(type="offer", description=line.strip(), links=links))
        elif is_request:
            links = extract_links(line)
            services.append(ServiceBase(type="request", description=line.strip(), links=links))
            
    return services

def process_text(text: str) -> ExtractedData:
    cleaned = clean_text(text)
    contacts = extract_contacts(cleaned)
    services = extract_services(cleaned)
    return ExtractedData(contacts=contacts, services=services)
