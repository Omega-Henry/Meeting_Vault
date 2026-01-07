from fastapi import APIRouter, Depends, HTTPException, Body
from typing import List, Dict, Any, Optional
from supabase import Client
from app.dependencies import require_auth, UserContext, get_supabase_client
from pydantic import BaseModel

router = APIRouter()

class ProfileUpdate(BaseModel):
    # Contact table fields
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    links: Optional[List[str]] = None
    
    # Profile table fields
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    assets: Optional[List[str]] = None  # Asset classes: SFH, Multifamily, etc.
    buy_box: Optional[Dict[str, Any]] = None  # Structured buy criteria
    
    # New rich profile fields
    cell_phone: Optional[str] = None
    office_phone: Optional[str] = None
    blinq: Optional[str] = None
    website: Optional[str] = None
    communities: Optional[List[str]] = None
    markets: Optional[List[str]] = None  # Geographic markets: MO, TX, etc.
    min_target_price: Optional[float] = None
    max_target_price: Optional[float] = None
    limits: Optional[Dict[str, Any]] = None  # Interest rate, ownership %, etc.
    i_can_help_with: Optional[str] = None
    help_me_with: Optional[str] = None
    hot_plate: Optional[str] = None  # Currently working on
    message_to_world: Optional[str] = None
    role_tags: Optional[List[str]] = None  # e.g. ["tc", "gator"]
    
    # Field provenance (optional - usually set by backend)
    field_provenance: Optional[Dict[str, str]] = None

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

    # 3. Update Profile Table (All rich profile fields)
    profile_updates = {}
    
    # Core profile fields
    if payload.bio is not None: profile_updates["bio"] = payload.bio
    if payload.avatar_url is not None: profile_updates["avatar_url"] = payload.avatar_url
    if payload.assets is not None: profile_updates["assets"] = payload.assets
    if payload.buy_box is not None: profile_updates["buy_box"] = payload.buy_box
    
    # New rich profile fields
    if payload.cell_phone is not None: profile_updates["cell_phone"] = payload.cell_phone
    if payload.office_phone is not None: profile_updates["office_phone"] = payload.office_phone
    if payload.blinq is not None: profile_updates["blinq"] = payload.blinq
    if payload.website is not None: profile_updates["website"] = payload.website
    if payload.communities is not None: profile_updates["communities"] = payload.communities
    if payload.markets is not None: profile_updates["markets"] = payload.markets
    if payload.min_target_price is not None: profile_updates["min_target_price"] = payload.min_target_price
    if payload.max_target_price is not None: profile_updates["max_target_price"] = payload.max_target_price
    if payload.limits is not None: profile_updates["limits"] = payload.limits
    if payload.i_can_help_with is not None: profile_updates["i_can_help_with"] = payload.i_can_help_with
    if payload.help_me_with is not None: profile_updates["help_me_with"] = payload.help_me_with
    if payload.hot_plate is not None: profile_updates["hot_plate"] = payload.hot_plate
    if payload.message_to_world is not None: profile_updates["message_to_world"] = payload.message_to_world
    if payload.role_tags is not None: profile_updates["role_tags"] = payload.role_tags
    
    # Update field provenance - mark user-edited fields as user_verified
    if profile_updates:
        existing_provenance = {}
        p_res = client.table("contact_profiles").select("contact_id, field_provenance").eq("contact_id", contact_id).execute()
        
        if p_res.data:
            existing_provenance = p_res.data[0].get("field_provenance", {}) or {}
            
            # Mark each updated field as user_verified
            for field in profile_updates.keys():
                if field not in ["field_provenance"]:
                    existing_provenance[field] = "user_verified"
            
            profile_updates["field_provenance"] = existing_provenance
            client.table("contact_profiles").update(profile_updates).eq("contact_id", contact_id).execute()
        else:
            # Create new profile
            profile_updates["contact_id"] = contact_id
            for field in profile_updates.keys():
                if field not in ["contact_id", "field_provenance"]:
                    existing_provenance[field] = "user_verified"
            profile_updates["field_provenance"] = existing_provenance
            client.table("contact_profiles").insert(profile_updates).execute()
            
        # Audit Log
        client.table("audit_log").insert({
            "actor_id": ctx.user.id,
            "action": "update_profile_details",
            "target_type": "contact_profile",
            "target_id": contact_id,
            "diff": profile_updates
        }).execute()
            
    return {"status": "success"}
