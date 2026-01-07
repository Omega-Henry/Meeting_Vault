from fastapi import APIRouter, Depends, HTTPException, Body
from typing import List, Dict, Any, Optional
from supabase import Client
from app.dependencies import require_admin, UserContext, get_supabase_client
from pydantic import BaseModel
import logging
import datetime

router = APIRouter()
logger = logging.getLogger(__name__)

# --- Models ---

class ActionRequest(BaseModel):
    action: str # 'approve', 'reject'
    reason: Optional[str] = None

# --- Claim Requests ---

@router.get("/requests/claims", response_model=List[dict])
def list_claim_requests(
    status: str = 'pending',
    ctx: UserContext = Depends(require_admin),
    client: Client = Depends(get_supabase_client)
):
    """
    List claim requests filtered by status.
    Uses RLS (Admin can view all).
    """
    res = client.table("claim_requests").select("*, contact:contacts(name, email, phone)").eq("status", status).eq("org_id", ctx.org_id).execute()
    return res.data

@router.post("/requests/claims/{request_id}/action")
def handle_claim_request(
    request_id: str,
    payload: ActionRequest,
    ctx: UserContext = Depends(require_admin),
    client: Client = Depends(get_supabase_client)
):
    """
    Approve or Reject a profile claim request.
    On Approve:
    1. Update claim_request status to 'approved'.
    2. Update contact: set claimed_by_user_id = requester_user_id.
    3. (Optional) Create empty profile if none exists? (Schema allows auto-creation via trigger or manual)
       Current design: we just link the user. The user can then create/edit profile.
    4. Log audit.
    """
    # 1. Fetch Request
    res = client.table("claim_requests").select("*").eq("id", request_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Request not found")
    req = res.data[0]
    
    if req["status"] != "pending":
         raise HTTPException(status_code=400, detail="Request already processed")

    if payload.action == "approve":
        # Transactional logic if possible, or sequential
        # A. Update Contact
        update_res = client.table("contacts").update({
            "claimed_by_user_id": req["user_id"]
        }).eq("id", req["contact_id"]).execute()
        
        if not update_res.data:
             # Could fail if contact deleted or RLS issue?
             raise HTTPException(status_code=500, detail="Failed to update contact ownership")

        # B. Update Request Status
        client.table("claim_requests").update({
            "status": "approved", 
            "admin_notes": payload.reason
        }).eq("id", request_id).execute()
        
        # C. Audit Log
        client.table("audit_log").insert({
            "org_id": ctx.org_id,
            "entity_type": "contact",
            "entity_id": req["contact_id"],
            "action": "claim_approved",
            "actor_id": ctx.user.id,
            "changes": {"claimed_by": req["user_id"], "request_id": request_id}
        }).execute()
        
        return {"status": "approved"}
        
    elif payload.action == "reject":
        client.table("claim_requests").update({
            "status": "rejected", 
            "admin_notes": payload.reason
        }).eq("id", request_id).execute()
        
        return {"status": "rejected"}
        
    else:
        raise HTTPException(status_code=400, detail="Invalid action")


# --- Change Requests (General Data Updates) ---
# Assuming 'change_requests' table exists from migration 003.

@router.get("/requests/changes", response_model=List[dict])
def list_change_requests(
    status: str = 'pending',
    ctx: UserContext = Depends(require_admin),
    client: Client = Depends(get_supabase_client)
):
    res = client.table("change_requests").select("*").eq("status", status).eq("org_id", ctx.org_id).execute()
    return res.data

@router.post("/requests/changes/{request_id}/action")
def handle_change_request(
    request_id: str,
    payload: ActionRequest,
    ctx: UserContext = Depends(require_admin),
    client: Client = Depends(get_supabase_client)
):
    """
    Approve/Reject data change requests.
    On Approve: Apply the changes to the target table.
    """
    res = client.table("change_requests").select("*").eq("id", request_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Request not found")
    req = res.data[0]
    
    if req["status"] != "pending":
         raise HTTPException(status_code=400, detail="Request already processed")

    if payload.action == "approve":
        # Apply changes
        # Target table depends on request type or implicit?
        # Assuming change_request has 'table_name', 'record_id', 'data' (json)
        # Check migration 003 schema to be safe.
        # Assuming standard structure:
        table = req.get("table_name", "contacts") # Default or dynamic
        record_id = req.get("record_id")
        data = req.get("data")
        
        if table and record_id and data:
             try:
                client.table(table).update(data).eq("id", record_id).execute()
             except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to apply changes: {e}")

        client.table("change_requests").update({
            "status": "approved",
            "admin_notes": payload.reason
        }).eq("id", request_id).execute()
        
        client.table("audit_log").insert({
            "org_id": ctx.org_id,
            "entity_type": table,
            "entity_id": record_id,
            "action": "change_approved",
            "actor_id": ctx.user.id,
            "changes": {"request_id": request_id, "data": data}
        }).execute()
        
        return {"status": "approved"}

    elif payload.action == "reject":
        client.table("change_requests").update({
            "status": "rejected",
            "admin_notes": payload.reason
        }).eq("id", request_id).execute()
        
        return {"status": "rejected"}
        
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
