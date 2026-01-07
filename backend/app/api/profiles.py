from fastapi import APIRouter, Depends, HTTPException, Body
from typing import List, Dict, Any, Optional
from supabase import Client
from app.dependencies import require_auth, UserContext, get_supabase_client
from pydantic import BaseModel

router = APIRouter()

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    bio: Optional[str] = None
    links: Optional[List[str]] = None
    assets: Optional[List[str]] = None
    # Buy box and others can be added as needed

@router.get("/me", response_model=Dict[str, Any])
def get_my_profile(
    ctx: UserContext = Depends(require_auth),
    client: Client = Depends(get_supabase_client)
):
    """
    Get the current user's claimed contact profile.
    """
    # Find contact claimed by user
    res = client.table("contacts").select("*, profile:contact_profiles(*), services(*)").eq("claimed_by_user_id", ctx.user.id).execute()
    
    if not res.data:
        # Not claimed yet
        return {"claimed": False}
        
    contact = res.data[0]
    
    # Normalize profile (might be list or dict)
    if isinstance(contact.get("profile"), list) and contact["profile"]:
        contact["profile"] = contact["profile"][0]
    elif isinstance(contact.get("profile"), list) and not contact["profile"]:
        contact["profile"] = {}
        
    return {"claimed": True, "contact": contact}

@router.patch("/me", response_model=Dict[str, Any])
def update_my_profile(
    payload: ProfileUpdate,
    ctx: UserContext = Depends(require_auth),
    client: Client = Depends(get_supabase_client)
):
    """
    Update core contact info and profile details.
    """
    # 1. Get Contact
    res = client.table("contacts").select("id, org_id").eq("claimed_by_user_id", ctx.user.id).execute()
    if not res.data:
         raise HTTPException(status_code=404, detail="No profile found")
    
    contact_id = res.data[0]["id"]
    org_id = res.data[0]["org_id"]  # Not used for update but good to have
    
    # 2. Update Contact Table (Name, Email, Phone, Links)
    contact_updates = {}
    if payload.name: contact_updates["name"] = payload.name
    if payload.email: contact_updates["email"] = payload.email
    if payload.phone: contact_updates["phone"] = payload.phone
    if payload.links is not None: contact_updates["links"] = payload.links
    
    if contact_updates:
        client.table("contacts").update(contact_updates).eq("id", contact_id).execute()
        
        # Audit Log
        client.table("audit_log").insert({
            "actor_id": ctx.user.id,
            "action": "update_profile_contact",
            "target_type": "contact",
            "target_id": contact_id,
            "diff": contact_updates
        }).execute()

    # 3. Update Profile Table (Bio, Assets)
    profile_updates = {}
    if payload.bio is not None: profile_updates["bio"] = payload.bio
    if payload.assets is not None: profile_updates["assets"] = payload.assets
    
    if profile_updates:
        # Check if profile exists
        p_res = client.table("contact_profiles").select("id").eq("contact_id", contact_id).execute()
        if p_res.data:
            client.table("contact_profiles").update(profile_updates).eq("contact_id", contact_id).execute()
        else:
            profile_updates["contact_id"] = contact_id
            client.table("contact_profiles").insert(profile_updates).execute()
            
        # Audit Log
        client.table("audit_log").insert({
            "actor_id": ctx.user.id,
            "action": "update_profile_details",
            "target_type": "contact_profile",
            "target_id": contact_id, # Using contact_id as proxy or fetch real id
            "diff": profile_updates
        }).execute()
            
    return {"status": "success"}
