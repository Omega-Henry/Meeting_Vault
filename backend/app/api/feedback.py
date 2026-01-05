
from fastapi import APIRouter, Depends, HTTPException, Body
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from app.dependencies import get_current_user, get_supabase_client, require_admin, UserContext
from supabase import Client
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

class FeedbackCreate(BaseModel):
    message: str
    rating: Optional[int] = None

@router.post("/", response_model=Dict[str, Any])
def submit_feedback(
    feedback: FeedbackCreate,
    user: dict = Depends(get_current_user),
    client: Client = Depends(get_supabase_client)
):
    """
    Submit feedback.
    """
    if feedback.rating is not None and (feedback.rating < 1 or feedback.rating > 5):
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    data = {
        "user_id": user.id,
        "message": feedback.message,
        "rating": feedback.rating,
        "status": "new"
    }

    res = client.table("feedback").insert(data).execute()
    return res.data[0]

@router.get("/", response_model=List[Dict[str, Any]])
def list_feedback(
    status: str = "new",
    limit: int = 50,
    ctx: UserContext = Depends(require_admin), # Admin only
    client: Client = Depends(get_supabase_client)
):
    """
    List feedback (Admin only).
    """
    # Assuming we want to see user details, we might need to join or fetch users.
    # Supabase auth.users is not easily joinable via standard foreign keys in postgrest 
    # unless we made a public users table wrapper.
    # But usually we can just fetch feedback and maybe the client handles user lookup or we join on a public profiles table if it exists.
    # For now, we return user_id.
    
    # If we have a public 'users' table (directory), we can join it.
    # change_requests.py implementation didn't join auth.users.
    
    query = client.table("feedback").select("*").order("created_at", desc=True).limit(limit)
    
    if status != "all":
        query = query.eq("status", status)
        
    res = query.execute()
    return res.data
