import re
import hashlib
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

def clean_text(text: str) -> str:
    # Simple cleaning: remove excessive whitespace, null bytes
    text = text.replace("\x00", "")
    # Remove multiple spaces but KEEP newlines
    # 1. Replace multiple spaces/tabs within a line
    text = re.sub(r'[ \t]+', ' ', text)
    # 2. Normalize newlines (remove empty lines if desired, or just collapse multiple \n)
    text = re.sub(r'\n\s*\n', '\n', text) 
    return text.strip()

def compute_hash(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

def normalize_link(link: str) -> str:
    link = link.strip()
    
    # Ensure protocol
    if not link.startswith(('http://', 'https://')):
        if link.startswith('www.'):
            link = 'https://' + link
        else:
            link = 'https://' + link

    try:
        parsed = urlparse(link)
        
        # Remove fragments
        parsed = parsed._replace(fragment='')
        
        # Remove utm parameters
        if parsed.query:
            query_params = parse_qsl(parsed.query)
            filtered_params = [p for p in query_params if not p[0].startswith('utm_')]
            new_query = urlencode(filtered_params)
            parsed = parsed._replace(query=new_query)
            
        return urlunparse(parsed)
    except Exception:
        # Fallback to original if parsing fails
        return link


