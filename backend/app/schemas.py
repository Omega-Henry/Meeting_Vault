from pydantic import BaseModel, HttpUrl, Field
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime

class ContactLink(BaseModel):
    link: str
    normalized_link: str

class ContactBase(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    links: List[str] = []

class ServiceBase(BaseModel):
    type: str # 'offer' or 'request'
    description: str
    links: List[str] = []

Contact = ContactBase
Service = ServiceBase

class MeetingChatBase(BaseModel):
    meeting_name: str
    cleaned_text: str
    digest_bullets: Optional[List[str]] = None

class MeetingChatCreate(MeetingChatBase):
    telegram_chat_id: str = "unknown" # Default for uploaded files

class MeetingChatResponse(MeetingChatBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    
    class Config:
        from_attributes = True

class ExtractedData(BaseModel):
    contacts: List[ContactBase]
    services: List[ServiceBase]
