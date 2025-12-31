import re
from typing import List, Dict, Set, Optional, Tuple
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from app.core.config import settings

# --- Pydantic Models (Matching existing ones) ---
class ExtractedContact(BaseModel):
    name: str = Field(description="Full name of the person")
    email: Optional[str] = Field(None, description="Email address if found")
    phone: Optional[str] = Field(None, description="Phone number if found")
    role: Optional[str] = Field(None, description="Job title or role if mentioned")

class ExtractedService(BaseModel):
    type: str = Field(description="Either 'offer' or 'request'")
    description: str = Field(description="Concise description")
    contact_name: str = Field(description="Name of the person associated with this service")
    links: List[str] = Field(default_factory=list, description="URLs mentioned")

class MeetingSummary(BaseModel):
    summary: str = Field(description="A concise summary of the meeting discussion (3-5 sentences).")
    key_topics: List[str] = Field(description="List of key topics discussed.")

class ExtractedMeetingData(BaseModel):
    contacts: List[ExtractedContact]
    services: List[ExtractedService]
    summary: MeetingSummary
    cleaned_transcript: List[CleanedMessage] = Field(default_factory=list, description="Structured parsed messages")
    
# --- Regex Patterns ---
PHONE_REGEX = r'\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}'
EMAIL_REGEX = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
URL_REGEX = r'(https?://[^\s]+)'

# Zoom Pattern: HH:MM:SS From [Name] to Everyone: [Message]
# Regex to capture Name and Message. Ignore Timestamp.
# Zoom Pattern: Optional Date + Time + From [Name] to Everyone: [Message]
# Matches: "09:00:00 From Bob to Everyone: Hello" AND "2025-12-31 09:00:00 From Bob to Everyone: Hello"
ZOOM_MSG_PATTERN = re.compile(r'(?:\d{4}-\d{2}-\d{2}\s+)?\d{2}:\d{2}:\d{2}\s+From\s+(.+?)\s+to\s+Everyone:\s+(.*)', re.IGNORECASE)

# Keywords
OFFER_KEYWORDS = ["offering", "provide", "fund", "lender", "investor", "tc", "coordinator", "service", "help you", "capital", "available"]
REQUEST_KEYWORDS = ["looking for", "need", "seeking", "anyone doing", "who has", "connect with", "iso", "searching"]

class CleanedMessage(BaseModel):
    sender: str
    message: str
    timestamp: Optional[str] = None

def clean_description(text: str) -> str:
    """Removes URLs and extra whitespace for a cleaner description."""
    # Remove URLs
    text = re.sub(URL_REGEX, '', text)
    return text.strip()

def extract_contacts_and_services(text: str) -> Tuple[List[ExtractedContact], List[ExtractedService], List[CleanedMessage]]:
    """
    Pass 1: Deterministic Parsing
    """
    lines = text.split('\n')
    
    contacts_map: Dict[str, Dict] = {} # Name -> {email, phone, role, set(links)}
    services_list: List[ExtractedService] = []
    cleaned_messages: List[CleanedMessage] = []
    
    for line in lines:
        match = ZOOM_MSG_PATTERN.search(line)
        if not match:
            continue
            
        sender_name = match.group(1).strip()
        message = match.group(2).strip()
        
        # Add to cleaned transcript
        cleaned_messages.append(CleanedMessage(sender=sender_name, message=message))
        
        # 1. Initialize Contact if new
        if sender_name not in contacts_map:
            contacts_map[sender_name] = {"email": None, "phone": None, "links": set()}
        
        # 2. Extract Hard Data (Phone, Email, URL) from Message AND Name
        # Check Name string for info (sometimes people put phone in name)
        combined_text = f"{sender_name} {message}"
        
        phones = re.findall(PHONE_REGEX, combined_text)
        emails = re.findall(EMAIL_REGEX, combined_text)
        urls = re.findall(URL_REGEX, combined_text)
        
        # Update Contact Info (Simple aggregation: take first found or overwrite)
        if phones:
            contacts_map[sender_name]["phone"] = phones[0] # Take first valid phone found
        if emails:
            contacts_map[sender_name]["email"] = emails[0] # Take first valid email
        
        # Collect links
        for url in urls:
            contacts_map[sender_name]["links"].add(url)
            
        # 3. Intent Classification (Service Extraction)
        msg_lower = message.lower()
        
        service_type = None
        if any(k in msg_lower for k in OFFER_KEYWORDS):
            service_type = "offer"
        elif any(k in msg_lower for k in REQUEST_KEYWORDS):
            service_type = "request"
            
        if service_type:
            # Create Service entry
            # Prioritize clean description
            desc = clean_description(message)
            if len(desc) > 5: # Ignore very short messages
                services_list.append(ExtractedService(
                    type=service_type,
                    description=desc,
                    contact_name=sender_name,
                    links=list(set(urls)) # Attach links found in this specific message
                ))

    # Convert map to list of ExtractedContact
    final_contacts = []
    for name, info in contacts_map.items():
        # Only include if they have a service output OR useful contact info (email/phone)
        has_service = any(s.contact_name == name for s in services_list)
        has_contact_info = info["email"] or info["phone"] or info["links"]
        
        if has_service or has_contact_info:
             final_contacts.append(ExtractedContact(
                 name=name,
                 email=info["email"],
                 phone=info["phone"],
                 role=None # Hard to regex, leave empty or infer later
             ))

    # Create dummy summary holder (will be filled by LLM)
    return final_contacts, services_list, cleaned_messages

def extract_summary_with_llm(text: str) -> MeetingSummary:
    """
    Pass 2: LLM for Summary only.
    """
    if not settings.OPENROUTER_API_KEY:
        return MeetingSummary(summary="No API Key provided for summary.", key_topics=[])

    try:
        api_key = settings.OPENROUTER_API_KEY
        base_url = settings.OPENROUTER_BASE_URL
        
        llm = ChatOpenAI(
            model=settings.LLM_MODEL,
            api_key=api_key,
            base_url=base_url,
            temperature=0
        )
        structured_llm = llm.with_structured_output(MeetingSummary)
        
        prompt = f"""
        Summarize the following meeting chat.
        Identify 3-5 key topics discussed.
        
        Transcript:
        {text[:15000]}
        """
        
        return structured_llm.invoke(prompt)
    except Exception as e:
        print(f"LLM Summary failed: {e}")
        return MeetingSummary(summary="Summary generation failed.", key_topics=[])

def extract_meeting_data(text: str) -> ExtractedMeetingData:
    # Pass 1: Deterministic
    contacts, services, cleaned_transcript = extract_contacts_and_services(text)
    
    # Pass 2: LLM
    summary_data = extract_summary_with_llm(text)
    
    return ExtractedMeetingData(
        contacts=contacts,
        services=services,
        summary=summary_data,
        cleaned_transcript=cleaned_transcript
    )
