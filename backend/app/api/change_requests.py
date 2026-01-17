
from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel
from typing import Dict, Any, List
from app.dependencies import get_supabase_client, get_current_user
from supabase import Client

router = APIRouter()

class CreateChangeRequest(BaseModel):
    target_type: str # 'contact' or 'service'
    target_id: str
    changes: Dict[str, Any]

@router.post("/", response_model=Dict[str, Any])
def create_change_request(
    request: CreateChangeRequest,
    user: dict = Depends(get_current_user),
    client: Client = Depends(get_supabase_client)
):
    """
    Submit a change request.
    """
    if request.target_type not in ["contact", "service"]:
        raise HTTPException(status_code=400, detail="Invalid target_type")

    data = {
        "user_id": user.id,
        "target_type": request.target_type,
        "target_id": request.target_id,
        "changes": request.changes,
        "status": "pending"
    }

    res = client.table("change_requests").insert(data).execute()
    return res.data[0]

@router.get("/", response_model=List[Dict[str, Any]])
def list_change_requests(
    status: str = "pending", 
    limit: int = 50,
    user: dict = Depends(get_current_user),
    client: Client = Depends(get_supabase_client)
):
    """
    List change requests. Admins see all, users see their own (RLS handled by DB, but we can filter too).
    """
    query = client.table("change_requests").select("*")\
        .eq("status", status)\
        .order("created_at", desc=True)\
        .limit(limit)
    
    res = query.execute()
    data = res.data

    # Manually fetch related names because we don't have polymorphic FKs
    for req in data:
        target_id = req.get("target_id")
        target_type = req.get("target_type")
        
        req["contacts"] = None
        req["services"] = None
        
        if target_id:
            try:
                if target_type == "contact":
                    c_res = client.table("contacts").select("name").eq("id", target_id).execute()
                    if c_res.data:
                        req["contacts"] = {"name": c_res.data[0]["name"]}
                elif target_type == "service":
                    s_res = client.table("services").select("description").eq("id", target_id).execute()
                    if s_res.data:
                        req["services"] = {"description": s_res.data[0]["description"]}
            except Exception:
                pass # Ignore if target deleted or not found

    return data

@router.post("/{request_id}/review")
def review_change_request(
    request_id: str,
    body: Dict[str, str] = Body(...), # {"action": "approve" | "reject"}
    user: dict = Depends(get_current_user),
    client: Client = Depends(get_supabase_client)
):
    """
    Approve or Reject a request. (Admin only - handled by RLS or role check)
    For strict admin gating, we should check role here too.
    """
    # Strict key check or role check ideally.
    # For strict admin gating, we should check role here too.
    # Currently relying on RLS policies and decorator checks.
    
    action = body.get("action")
    if action not in ["approve", "reject"]:
        raise HTTPException(status_code=400, detail="Invalid action")
    
    # Update status
    update_res = client.table("change_requests").update({"status": f"{action}d"}).eq("id", request_id).execute()
    if not update_res.data:
         raise HTTPException(status_code=404, detail="Request not found")
         
    req = update_res.data[0]
    
    if action == "approve":
        # Apply changes
        target_table = "contacts" if req["target_type"] == "contact" else "services"
        changes = req["changes"]

        # Special handling for Service updates with "suggested_contact_name"
        if req["target_type"] == "service" and "suggested_contact_name" in changes:
            suggested_name = changes.pop("suggested_contact_name")
            suggested_email = changes.pop("suggested_contact_email", None)
            
            # Find or Create Contact logic
            # 1. Search by email first (high confidence)
            existing_contact_id = None
            if suggested_email:
                try:
                    res = client.table("contacts").select("id").eq("org_id", svc.get("org_id", ""))\
                        .eq("email", suggested_email).limit(1).execute()
                    if res.data:
                        existing_contact_id = res.data[0]["id"]
                except Exception as e:
                    pass

            # 2. Search by name if no email match
            if not existing_contact_id and suggested_name:
                try:
                    res = client.table("contacts").select("id").eq("org_id", svc.get("org_id", ""))\
                        .eq("name", suggested_name).limit(1).execute()
                    if res.data:
                        existing_contact_id = res.data[0]["id"]
                except Exception:
                    pass

            if existing_contact_id:
                changes["contact_id"] = existing_contact_id
            else:
                # Create new contact
                new_contact_data = {
                     "name": suggested_name,
                     "email": suggested_email,
                }
                # We need the org_id. Let's fetch the target service to get its org_id/user_id owner.
                service_res = client.table("services").select("user_id, org_id").eq("id", req["target_id"]).execute()
                if service_res.data:
                    svc = service_res.data[0]
                    new_contact_data["user_id"] = svc.get("user_id")
                    new_contact_data["org_id"] = svc.get("org_id")
                
                try:
                    contact_res = client.table("contacts").insert(new_contact_data).execute()
                    if contact_res.data:
                        new_contact_id = contact_res.data[0]["id"]
                        changes["contact_id"] = new_contact_id
                except Exception as e:
                    raise HTTPException(status_code=500, detail=f"Failed to create new contact: {e}")

        # We need to apply 'changes' (jsonb) to the target
        # Careful with security here. We trust the approved JSON.
        
        if changes:
             apply_res = client.table(target_table).update(changes).eq("id", req["target_id"]).execute()
        
    return {"status": "ok", "request": req}
