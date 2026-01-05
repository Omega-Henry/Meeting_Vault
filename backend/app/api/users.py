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
    role = "member"
    admin_list = []
    if settings.ADMIN_EMAIL:
        admin_list.extend([e.strip() for e in settings.ADMIN_EMAIL.split(',')])
    if settings.ADMIN_EMAILS:
        admin_list.extend([e.strip() for e in settings.ADMIN_EMAILS.split(',')])
        
    if ctx.user.email in admin_list:
        role = "admin"
    
    return {
        "id": ctx.user.id,
        "email": ctx.user.email,
        "org_id": ctx.org_id,
        "role": role
    }
