from typing import List, Optional, Dict, Any
from supabase import Client

# These functions will be wrapped as tools. 
# The 'client' argument will be injected, not provided by the LLM.

def list_meeting_chats(client: Client, limit: int = 10, offset: int = 0) -> List[Dict[str, Any]]:
    """List recent meeting chats."""
    res = client.table("meeting_chats")\
        .select("id, meeting_name, created_at, telegram_chat_id")\
        .order("created_at", desc=True)\
        .range(offset, offset + limit - 1)\
        .execute()
    return res.data

def get_meeting_chat(client: Client, meeting_id: str) -> Dict[str, Any]:
    """Get full details of a specific meeting chat by ID."""
    res = client.table("meeting_chats")\
        .select("*")\
        .eq("id", meeting_id)\
        .execute()
    if not res.data:
        return {"error": "Meeting not found"}
    return res.data[0]

def search_contacts(client: Client, query: str) -> List[Dict[str, Any]]:
    """Search contacts by name, email, or phone."""
    # Supabase/Postgres simple ILIKE search for MVP
    # For more complex search we'd use full text search
    res = client.table("contacts")\
        .select("*, profile:contact_profiles(*)")\
        .or_(f"name.ilike.%{query}%,email.ilike.%{query}%,phone.ilike.%{query}%")\
        .limit(20)\
        .execute()
    
    # Normalize profile
    data = res.data
    for c in data:
        if isinstance(c.get("profile"), list) and c["profile"]:
            c["profile"] = c["profile"][0]
        elif isinstance(c.get("profile"), list) and not c["profile"]:
            c["profile"] = {}
            
    return data

def list_services(client: Client, type_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    """List services (offers/requests). Optional type_filter: 'offer' or 'request'."""
    query = client.table("services").select("*, contacts(name, email)")
    if type_filter:
        query = query.eq("type", type_filter)
    res = query.limit(50).execute()
    return res.data

def search_everything(client: Client, query: str) -> Dict[str, Any]:
    """Global search across chats, contacts, and services."""
    contacts = search_contacts(client, query)
    
    chats = client.table("meeting_chats")\
        .select("id, meeting_name, created_at")\
        .ilike("meeting_name", f"%{query}%")\
        .limit(10)\
        .execute().data
        
    services = client.table("services")\
        .select("*, contacts(name)")\
        .ilike("description", f"%{query}%")\
        .limit(20)\
        .execute().data
        
    return {
        "contacts": contacts,
        "chats": chats,
        "services": services
    }
