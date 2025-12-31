from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from app.core.config import settings

security = HTTPBearer()

def get_supabase_client(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Client:
    """
    Creates a Supabase client authenticated with the user's JWT.
    This ensures RLS policies are applied.
    """
    token = credentials.credentials
    try:
        # We use the anon key to initialize, but then set the session with the user's token
        # Actually, passing the token in the headers or using 'auth' method is better.
        # For supabase-py, we can initialize with the URL and Key, then set the auth token.
        
        # However, a cleaner way for RLS is to just pass the token in the headers of the request
        # made by the supabase client.
        
        client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
        client.auth.set_session(access_token=token, refresh_token=token) # refresh_token is dummy here if we just want to auth the request
        return client
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

def get_current_user(client: Client = Depends(get_supabase_client)):
    """
    Retrieves the current user from the authenticated Supabase client.
    """
    try:
        user = client.auth.get_user()
        if not user:
             raise HTTPException(status_code=401, detail="User not found")
        return user.user
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token")
