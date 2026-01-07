from fastapi import APIRouter, Depends, HTTPException, Body
from typing import List, Dict, Any, Optional
from supabase import Client
from app.dependencies import require_auth, UserContext, get_supabase_client
from pydantic import BaseModel

router = APIRouter()

class ServiceCreate(BaseModel):
    contact_id: str
    type: str # 'offer', 'request'
    description: str

class ServiceUpdate(BaseModel):
    description: Optional[str] = None
    is_archived: Optional[bool] = None

@router.post("/", response_model=Dict[str, Any])
def create_service(
    payload: ServiceCreate,
    ctx: UserContext = Depends(require_auth),
    client: Client = Depends(get_supabase_client)
):
    """
    Create a new service (offer/request).
    Requires user to be the owner of the contact (or admin).
    """
    # 1. Verify Ownership
    res = client.table("contacts").select("claimed_by_user_id, org_id").eq("id", payload.contact_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    contact = res.data[0]
    
    # Check if user is owner OR admin (admins usually have specific role, here we assume owner for now unless ctx tells us)
    # Context usually has role.
    is_owner = contact["claimed_by_user_id"] == ctx.user.id
    is_admin = ctx.role == "admin" # Assuming UserContext has role populated
    
    if not (is_owner or is_admin):
         raise HTTPException(status_code=403, detail="Not authorized to add services to this contact")

    # 2. Insert Service
    service_data = {
        "contact_id": payload.contact_id,
        "type": payload.type,
        "description": payload.description,
        "org_id": contact["org_id"], # Inherit org
        "created_by_user_id": ctx.user.id
    }
    
    insert_res = client.table("services").insert(service_data).select().execute()
    if not insert_res.data:
        raise HTTPException(status_code=500, detail="Failed to create service")
        
    return insert_res.data[0]

@router.patch("/{service_id}", response_model=Dict[str, Any])
def update_service(
    service_id: str,
    payload: ServiceUpdate,
    ctx: UserContext = Depends(require_auth),
    client: Client = Depends(get_supabase_client)
):
    """
    Update or Archive a service.
    """
    # 1. Fetch Service to check ownership via contact
    res = client.table("services").select("*, contact:contacts(claimed_by_user_id)").eq("id", service_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Service not found")
        
    service = res.data[0]
    contact = service["contact"] # Join result might be dict or list depending on lib version, usually dict if 1:1

    if not contact:
         # Should not happen
         raise HTTPException(status_code=404, detail="Parent contact not found")

    is_owner = contact.get("claimed_by_user_id") == ctx.user.id
    is_admin = ctx.role == "admin"
    
    if not (is_owner or is_admin):
         raise HTTPException(status_code=403, detail="Not authorized to edit this service")
         
    updates = {}
    if payload.description is not None:
        updates["description"] = payload.description
    if payload.is_archived is not None:
        updates["is_archived"] = payload.is_archived
        
    if not updates:
        return service # No op

    update_res = client.table("services").update(updates).eq("id", service_id).select().execute()
    return update_res.data[0]

@router.delete("/{service_id}")
def delete_service(
    service_id: str,
    ctx: UserContext = Depends(require_auth),
    client: Client = Depends(get_supabase_client)
):
    """
    Hard delete service. Usually prefer archive, but allowing delete for mistakes.
    """
    # 1. Check Auth (Same logic)
    res = client.table("services").select("*, contact:contacts(claimed_by_user_id)").eq("id", service_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Service not found")
    service = res.data[0]
    contact = service["contact"]
    
    is_owner = contact.get("claimed_by_user_id") == ctx.user.id
    is_admin = ctx.role == "admin"
    
    if not (is_owner or is_admin):
         raise HTTPException(status_code=403, detail="Not authorized")
         
    client.table("services").delete().eq("id", service_id).execute()
    return {"status": "deleted"}
