from typing import List, Optional
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from app.core.config import settings

# --- Pydantic Models for LLM Output ---

class ExtractedContact(BaseModel):
    name: str = Field(description="Full name of the person")
    email: Optional[str] = Field(None, description="Email address if found")
    phone: Optional[str] = Field(None, description="Phone number if found")
    role: Optional[str] = Field(None, description="Job title or role if mentioned")

class ExtractedService(BaseModel):
    type: str = Field(description="Either 'offer' or 'request'")
    description: str = Field(description="Concise description of the offer or request. Clean up the text to remove timestamps and sender names.")
    contact_name: str = Field(description="Name of the person associated with this service. Must match a name in the extracted contacts.")
    links: List[str] = Field(default_factory=list, description="URLs mentioned in the context of this service")

class MeetingSummary(BaseModel):
    summary: str = Field(description="A concise summary of the meeting discussion (3-5 sentences).")
    key_topics: List[str] = Field(description="List of key topics discussed.")

class ExtractedMeetingData(BaseModel):
    contacts: List[ExtractedContact]
    services: List[ExtractedService]
    summary: MeetingSummary

# --- Extraction Logic ---

def extract_meeting_data(text: str) -> ExtractedMeetingData:
    """
    Uses the LLM to extract structured data from the meeting transcript.
    """
    
    # Configure LLM
    api_key = settings.OPENROUTER_API_KEY or settings.OPENAI_API_KEY
    base_url = settings.OPENROUTER_BASE_URL if settings.OPENROUTER_API_KEY else None
    
    llm = ChatOpenAI(
        model=settings.LLM_MODEL,
        api_key=api_key,
        base_url=base_url,
        temperature=0
    )
    
    # Structured Output
    structured_llm = llm.with_structured_output(ExtractedMeetingData)
    
    # Prompt
    prompt = f"""
    You are an expert data extractor. Analyze the following meeting chat transcript.
    
    Extract:
    1. All participants as Contacts. Try to infer names from the "From Name to Everyone:" pattern.
    2. All "Offers" (services/products people are selling/providing) and "Requests" (what people are looking for).
       - CLEAN the description: Remove timestamps (e.g. "09:26:10"), sender names, and "From X to Everyone:".
       - Attribute each service to the correct Contact Name.
    3. A brief summary of the meeting and key topics.
    
    Transcript:
    {text[:15000]}  # Truncate to avoid token limits if necessary, though 15k chars is usually fine for 4o-mini
    """
    
    return structured_llm.invoke(prompt)
