from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from app.core.config import settings
from pydantic import BaseModel
from typing import Optional

security = HTTPBearer()

class UserContext(BaseModel):
    user: object # Supabase User object
    id: str
    email: str
    org_id: str
    role: str

def get_supabase_client(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Client:
    """
    Creates a Supabase client authenticated with the user's JWT.
    This ensures RLS policies are applied.
    """
    token = credentials.credentials
    try:
        client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
        client.auth.set_session(access_token=token, refresh_token=token)
        return client
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

def get_service_role_client() -> Client:
    """
    Creates a Supabase client with SERVICE ROLE privileges.
    Used for bootstrapping memberships and admin-only actions.
    """
    if not settings.SUPABASE_SERVICE_ROLE_KEY:
        # Fallback to anon key if service role is missing, but warn (RLS might block)
        return create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

def get_current_user(client: Client = Depends(get_supabase_client)):
    """
    Retrieves the current user from the authenticated Supabase client.
    """
    try:
        user_response = client.auth.get_user()
        if not user_response or not user_response.user:
             raise HTTPException(status_code=401, detail="User not found")
        return user_response.user
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_user_context(
    user = Depends(get_current_user),
    client: Client = Depends(get_supabase_client)
) -> UserContext:
    """
    Resolves the user's Organization and Role.
    Bootstraps membership if it doesn't exist.
    """
    # Use the authenticated client (user's JWT) for operations.
    # This relies on RLS policies allowing:
    # 1. Reading 'organizations' (Public/Anon read policy)
    # 2. Reading 'memberships' (User verifies own membership policy)
    # 3. Inserting 'memberships' (User creates own membership policy)
    
    # Check for existing membership
    # Parse admin emails safely and case-insensitively
    admin_emails = []
    if hasattr(settings, "ADMIN_EMAILS") and settings.ADMIN_EMAILS:
        admin_emails = [e.strip().lower() for e in settings.ADMIN_EMAILS.split(",") if e.strip()]
    if hasattr(settings, "ADMIN_EMAIL") and settings.ADMIN_EMAIL: # Handle singular legacy var
         admin_emails.append(settings.ADMIN_EMAIL.strip().lower())

    # Check for existing membership
    res = client.table("memberships").select("*").eq("user_id", user.id).execute()

    user_email_lower = user.email.lower()
    should_be_admin = user_email_lower in admin_emails

    if res.data:
        membership = res.data[0]
        # Auto-Promote: If user is in env vars but not admin in DB, fix it.
        if should_be_admin:
            if membership["role"] != "admin":
                 # Use service client to upgrade role
                 service_client = get_service_role_client()
                 service_client.table("memberships").update({"role": "admin"}).eq("user_id", user.id).execute()
                 membership["role"] = "admin"
    else:
        # Bootstrap: Create Membership
        # Use Service Role client to bypass RLS for creation (users can't insert their own membership by default)
        service_client = get_service_role_client()

        # 1. Determine Role
        role = "admin" if should_be_admin else "user"
            
        # 2. Get Default Org (Global Directory)
        # Use service client here too for safety
        org_res = service_client.table("organizations").select("id").eq("name", "Global Directory").single().execute()
        if not org_res.data:
            # Should exist from migration, but handle edge case
            raise HTTPException(status_code=500, detail="Default Organization not found. Please run migrations.")
            
        default_org_id = org_res.data["id"]
        
        # 3. Create Membership
        new_mem = {
            "org_id": default_org_id,
            "user_id": user.id,
            "role": role
        }
        create_res = service_client.table("memberships").insert(new_mem).execute()
        if create_res.data:
            membership = create_res.data[0]
        else:
            raise HTTPException(status_code=500, detail="Failed to create membership.")

    if not membership:
         raise HTTPException(status_code=403, detail="User has no organization membership.")

    return UserContext(
        user=user,
        id=user.id,
        email=user.email,
        org_id=membership["org_id"],
        role=membership["role"]
    )

def require_admin(ctx: UserContext = Depends(get_user_context)) -> UserContext:
    if ctx.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return ctx
