from fastapi import APIRouter, Depends
from app.dependencies import get_user_context, UserContext
from app.core.config import settings

router = APIRouter()

@router.get("/me", response_model=dict)
def get_my_profile(ctx: UserContext = Depends(get_user_context)):
    """
    Returns the current user's profile including Organization and Role.
    Required for Frontend routing (Admin vs User).
    """
    role = ctx.role
    
    return {
        "id": ctx.user.id,
        "email": ctx.user.email,
        "org_id": ctx.org_id,
        "role": role
    }
