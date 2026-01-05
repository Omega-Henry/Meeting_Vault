from fastapi import APIRouter, Depends, HTTPException, Body
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from supabase import Client
from app.dependencies import get_user_context, UserContext, get_supabase_client, require_admin

router = APIRouter()

class ChangeRequestPayload(BaseModel):
    target_type: str # 'contact', 'service', 'contact_link'
    target_id: Optional[str] = None # Null for new
    summary: str
    payload: Dict[str, Any]

@router.post("/", response_model=dict)
def submit_change_request(
    data: ChangeRequestPayload,
    ctx: UserContext = Depends(get_user_context),
    client: Client = Depends(get_supabase_client)
):
    """
    User submits a suggestion.
    """
    request_data = {
        "org_id": ctx.org_id,
        "created_by": ctx.user.id,
        "status": "pending",
        "target_type": data.target_type,
        "target_id": data.target_id,
        "summary": data.summary,
        "payload": data.payload
    }
    
    res = client.table("change_requests").insert(request_data).execute()
    return {"status": "success", "id": res.data[0]["id"]}

@router.get("/mine", response_model=List[dict])
def list_my_requests(
    ctx: UserContext = Depends(get_user_context),
    client: Client = Depends(get_supabase_client)
):
    """
    List requests created by the current user.
    """
    res = client.table("change_requests").select("*").eq("created_by", ctx.user.id).order("created_at", desc=True).execute()
    return res.data

# --- ADMIN ENDPOINTS ---

@router.get("/admin/pending", response_model=List[dict])
def list_pending_requests(
    ctx: UserContext = Depends(require_admin),
    client: Client = Depends(get_supabase_client)
):
    """
    Admin: List all pending requests for the organization.
    """
    res = client.table("change_requests").select("*").eq("org_id", ctx.org_id).eq("status", "pending").order("created_at", desc=True).execute()
    return res.data

@router.post("/admin/{request_id}/{action}", response_model=dict)
def review_change_request(
    request_id: str,
    action: str, # 'approve' or 'reject'
    reason: Optional[str] = Body(None, embed=True),
    ctx: UserContext = Depends(require_admin),
    client: Client = Depends(get_supabase_client)
):
    """
    Admin: Approve or Reject a request.
    If Approved, applies the changes to the canonical table.
    """
    if action not in ["approve", "reject"]:
        raise HTTPException(status_code=400, detail="Invalid action")

    # 1. Fetch Request
    req_res = client.table("change_requests").select("*").eq("id", request_id).single().execute()
    if not req_res.data:
        raise HTTPException(status_code=404, detail="Request not found")
    
    request = req_res.data
    
    if request["status"] != "pending":
         raise HTTPException(status_code=400, detail="Request is already processed")

    # 2. If Approve, Apply Changes
    if action == "approve":
        try:
            target_type = request["target_type"]
            target_id = request["target_id"]
            payload = request["payload"]
            
            if target_type == "contact":
                if target_id:
                    # Update Existing
                    client.table("contacts").update(payload).eq("id", target_id).execute()
                else:
                    # Create New (Ensure org_id and user_id are set)
                    payload["org_id"] = ctx.org_id
                    # Ideally allow setting owner, but for now user_id comes from payload or creator
                    if "user_id" not in payload:
                        payload["user_id"] = request["created_by"]
                    client.table("contacts").insert(payload).execute()
                    
            elif target_type == "service":
                if target_id:
                    client.table("services").update(payload).eq("id", target_id).execute()
                else:
                    payload["org_id"] = ctx.org_id
                    if "user_id" not in payload:
                         payload["user_id"] = request["created_by"]
                    client.table("services").insert(payload).execute()
            
            # TODO: Handle contact_links
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to apply changes: {str(e)}")

    # 3. Update Request Status
    update_data = {
        "status": "approved" if action == "approve" else "rejected",
        "reviewed_by": ctx.user.id,
        "reviewed_at": "now()",
        "decision_reason": reason
    }
    
    client.table("change_requests").update(update_data).eq("id", request_id).execute()
    
    return {"status": "success", "action": action}
