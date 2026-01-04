from fastapi import APIRouter, Depends
from app.dependencies import get_user_context, UserContext

router = APIRouter()

@router.get("/me", response_model=dict)
def get_my_profile(ctx: UserContext = Depends(get_user_context)):
    """
    Returns the current user's profile including Organization and Role.
    Required for Frontend routing (Admin vs User).
    """
    return {
        "id": ctx.user.id,
        "email": ctx.user.email,
        "org_id": ctx.org_id,
        "role": ctx.role
    }
