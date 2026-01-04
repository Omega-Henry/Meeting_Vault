from fastapi import APIRouter, Depends, Query, HTTPException
from typing import List, Optional
from supabase import Client
from app.dependencies import get_user_context, UserContext, get_supabase_client
from app.schemas import Contact, Service

router = APIRouter()

@router.get("/contacts", response_model=List[dict])
def list_contacts(
    ctx: UserContext = Depends(get_user_context),
    client: Client = Depends(get_supabase_client),
    q: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    """
    List contacts in the user's organization.
    """
    query = client.table("contacts").select("*").eq("org_id", ctx.org_id)
    
    if q:
        # Simple ILIKE search on name or email
        query = query.or_(f"name.ilike.%{q}%,email.ilike.%{q}%")
        
    res = query.range(offset, offset + limit - 1).execute()
    return res.data

@router.get("/services", response_model=List[dict])
def list_services(
    ctx: UserContext = Depends(get_user_context),
    client: Client = Depends(get_supabase_client),
    type: Optional[str] = None, # 'offer' or 'request'
    q: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    """
    List services (offers/requests) in the user's organization.
    Includes contact details.
    """
    query = client.table("services").select("*, contacts(name, email, phone)").eq("org_id", ctx.org_id)
    
    if type:
        query = query.eq("type", type)
        
    if q:
        query = query.ilike("description", f"%{q}%")
        
    res = query.range(offset, offset + limit - 1).execute()
    return res.data
