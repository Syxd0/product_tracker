import os
from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pwdlib import PasswordHash

import database_models
from database import session

# Load configuration from environment variables
SECRET_KEY = os.getenv("SECRET_KEY", "product-tracker-secret-key-super-secure-production-2026-v1")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

# Password hashing with Argon2 via pwdlib
pwd_hasher = PasswordHash.recommended()

security_bearer = HTTPBearer(auto_error=False)

def hash_password(password: str) -> str:
    """Hash plaintext password using Argon2/pwdlib."""
    return pwd_hasher.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plaintext password against stored hash."""
    return pwd_hasher.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create signed, expiring JWT token."""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "iat": now})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_db():
    db = session()
    try:
        yield db
    finally:
        db.close()

def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    db: Session = Depends(get_db)
) -> database_models.User:
    """
    Extract and validate current authenticated user from either Bearer token header or cookie.
    Raises HTTP 401 if token is missing, invalid, or user does not exist.
    """
    token = None
    # 1. Check Bearer Authorization header
    if credentials and credentials.scheme.lower() == "bearer":
        token = credentials.credentials
    # 2. Check HttpOnly cookie
    elif "access_token" in request.cookies:
        cookie_val = request.cookies.get("access_token")
        if cookie_val.startswith("Bearer "):
            token = cookie_val[7:]
        else:
            token = cookie_val

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: Optional[int] = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(database_models.User).filter(database_models.User.id == int(user_id)).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account no longer exists",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
