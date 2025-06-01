from fastapi import HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os
import httpx
import asyncio
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

# Your Google OAuth 2.0 Client ID (not needed for access token flow)
GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID')
# Your allowed email address
ALLOWED_EMAIL = os.getenv('ALLOWED_EMAIL')

security = HTTPBearer()

async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        # Get the access token from the Authorization header
        access_token = credentials.credentials
        
        # Use the access token to get user info from Google's userinfo API
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=401,
                    detail="Invalid access token"
                )
            
            user_info = response.json()

        print("jkasdbhflkasdhjkjlasdhfklasdhfkasdhfkdasjkfasdhjkfasdfhkasdfhklasdjfhkladsfklasdh")
        print(user_info)
        print("jkasdbhflkasdhjkjlasdhfklasdhfkasdhfkdasjkfasdhjkfasdfhkasdfhklasdjfhkladsfklasdh2")
        print(ALLOWED_EMAIL)
        
        # Check if the email matches the allowed email
        if user_info.get('email') != ALLOWED_EMAIL:
            raise HTTPException(
                status_code=403,
                detail="Access denied. Only authorized users can access this application."
            )
        
        return user_info
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=401,
            detail=f"Failed to verify token: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=401,
            detail=f"Invalid authentication credentials: {str(e)}"
        )

def get_current_user(token_info: dict = Depends(verify_token)) -> dict:
    return token_info 