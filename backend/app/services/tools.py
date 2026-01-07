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


def advanced_contact_search(
    client: Client, 
    query: Optional[str] = None,
    asset_classes: Optional[List[str]] = None,
    markets: Optional[List[str]] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    role_tags: Optional[List[str]] = None,
    service_type: Optional[str] = None,
    limit: int = 25
) -> Dict[str, Any]:
    """
    Advanced search across contacts with structured filters.
    Used by AI for complex real estate queries like:
    "Buyers of SFH in MO, 2000sqft+, 4bed/3bath"
    
    Args:
        query: Freetext search across name, email, bio, offers, requests
        asset_classes: Filter by asset types e.g. ["SFH", "Multifamily"]
        markets: Filter by geographic markets e.g. ["MO", "TX"]
        min_price: Minimum target price
        max_price: Maximum target price
        role_tags: Filter by role tags e.g. ["buyer", "lender", "wholesaler"]
        service_type: Filter contacts by their service type: 'offer' or 'request'
        limit: Max results to return
    """
    results = {
        "contacts": [],
        "services": [],
        "filters_applied": [],
        "total_matches": 0
    }
    
    # Build contact query with profile join
    contact_query = client.table("contacts")\
        .select("*, profile:contact_profiles(*), services(*)")\
        .eq("is_archived", False)
    
    filters_applied = []
    
    # Text search on contacts
    if query:
        contact_query = contact_query.or_(
            f"name.ilike.%{query}%,email.ilike.%{query}%,phone.ilike.%{query}%"
        )
        filters_applied.append(f"text: '{query}'")
    
    # Execute initial contact search
    contact_res = contact_query.limit(100).execute()  # Get more to filter
    contacts = contact_res.data
    
    # Normalize and enrich profile data
    for c in contacts:
        if isinstance(c.get("profile"), list) and c["profile"]:
            c["profile"] = c["profile"][0]
        elif isinstance(c.get("profile"), list) and not c["profile"]:
            c["profile"] = {}
    
    # Apply profile-based filters (post-query filtering since Supabase 
    # doesn't allow deep JSONB array filters easily in REST)
    filtered_contacts = []
    
    for c in contacts:
        profile = c.get("profile", {}) or {}
        
        # Asset class filter
        if asset_classes:
            contact_assets = profile.get("assets", []) or []
            if not any(a.lower() in [x.lower() for x in contact_assets] for a in asset_classes):
                continue
        
        # Markets filter
        if markets:
            contact_markets = profile.get("markets", []) or []
            if not any(m.lower() in [x.lower() for x in contact_markets] for m in markets):
                continue
        
        # Price range filter
        contact_min = profile.get("min_target_price")
        contact_max = profile.get("max_target_price")
        
        if min_price and contact_max and contact_max < min_price:
            continue
        if max_price and contact_min and contact_min > max_price:
            continue
        
        # Role tags filter
        if role_tags:
            contact_tags = profile.get("role_tags", []) or []
            if not any(t.lower() in [x.lower() for x in contact_tags] for t in role_tags):
                continue
        
        # Service type filter
        if service_type:
            services = c.get("services", []) or []
            has_type = any(s.get("type") == service_type and not s.get("is_archived") for s in services)
            if not has_type:
                continue
        
        filtered_contacts.append(c)
    
    # Build filter description for AI response
    if asset_classes:
        filters_applied.append(f"assets: {asset_classes}")
    if markets:
        filters_applied.append(f"markets: {markets}")
    if min_price or max_price:
        filters_applied.append(f"price: {min_price or '0'} - {max_price or 'unlimited'}")
    if role_tags:
        filters_applied.append(f"roles: {role_tags}")
    if service_type:
        filters_applied.append(f"service_type: {service_type}")
    
    results["contacts"] = filtered_contacts[:limit]
    results["filters_applied"] = filters_applied
    results["total_matches"] = len(filtered_contacts)
    
    # Also search services if query provided
    if query:
        service_res = client.table("services")\
            .select("*, contacts(name, email)")\
            .ilike("description", f"%{query}%")\
            .eq("is_archived", False)\
            .limit(20)\
            .execute()
        results["services"] = service_res.data
    
    return results
