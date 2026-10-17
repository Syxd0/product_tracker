import os
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import desc

import database_models
from database import session, engine
from models import (
    Product as ProductSchema,
    ProductCreate,
    ProductUpdate,
    UserCreate,
    UserLogin,
    UserResponse,
    TokenResponse,
)
from auth import (
    get_db,
    get_current_user,
    hash_password,
    verify_password,
    create_access_token,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)

app = FastAPI(
    title="Product Tracker API",
    description="Secure, multi-tenant inventory & product tracker backend",
    version="1.0.0",
)

# Configure CORS
# Support local dev servers and production Vercel domains
raw_origins = os.getenv("ALLOWED_ORIGINS", "")
allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
]
if raw_origins:
    for o in raw_origins.split(","):
        clean = o.strip()
        if clean and clean not in allowed_origins:
            allowed_origins.append(clean)

# Also support origin regex for all preview and production *.vercel.app deployments
allow_origin_regex = os.getenv("ALLOW_ORIGIN_REGEX", r"https://.*\.vercel\.app")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure database tables exist without modifying existing data
database_models.Base.metadata.create_all(bind=engine)

# Helper to set auth cookie
def set_auth_cookie(response: Response, token: str):
    is_prod = os.getenv("ENVIRONMENT", "development").lower() in ("production", "prod")
    response.set_cookie(
        key="access_token",
        value=f"Bearer {token}",
        httponly=True,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        expires=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite="none" if is_prod else "lax",
        secure=is_prod,
    )

# ----------------- Root / Health -----------------
@app.get("/")
def root():
    return {
        "name": "Product Tracker API",
        "status": "healthy",
        "version": "1.0.0",
        "branding": "Product Tracker",
    }

# ----------------- Authentication Endpoints -----------------
@app.post("/auth/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(user_in: UserCreate, response: Response, db: Session = Depends(get_db)):
    # Check if user already exists
    existing = db.query(database_models.User).filter(
        database_models.User.email == user_in.email
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists.",
        )

    # Hash password securely with Argon2
    hashed = hash_password(user_in.password)
    user = database_models.User(email=user_in.email, hashed_password=hashed)
    db.add(user)
    db.commit()
    db.refresh(user)

    # Issue access token
    access_token = create_access_token(data={"sub": str(user.id), "email": user.email})
    set_auth_cookie(response, access_token)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@app.post("/auth/login", response_model=TokenResponse)
def login(user_in: UserLogin, response: Response, db: Session = Depends(get_db)):
    user = db.query(database_models.User).filter(
        database_models.User.email == user_in.email
    ).first()
    if not user or not verify_password(user_in.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(data={"sub": str(user.id), "email": user.email})
    set_auth_cookie(response, access_token)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@app.post("/auth/logout")
def logout(response: Response):
    is_prod = os.getenv("ENVIRONMENT", "development").lower() in ("production", "prod")
    response.delete_cookie(
        key="access_token",
        samesite="none" if is_prod else "lax",
        secure=is_prod,
    )
    return {"message": "Logged out successfully"}


@app.get("/auth/me", response_model=UserResponse)
def get_current_user_profile(current_user: database_models.User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


# ----------------- User-Specific Product Endpoints -----------------

@app.get("/products", response_model=List[ProductSchema])
def get_all_products(
    current_user: database_models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Return only products belonging to the authenticated user."""
    products = (
        db.query(database_models.Product)
        .filter(database_models.Product.owner_id == current_user.id)
        .order_by(database_models.Product.id.asc())
        .all()
    )
    return products


@app.get("/products/{product_id}", response_model=ProductSchema)
def get_product_by_id(
    product_id: int,
    current_user: database_models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Return a single product only if owned by the authenticated user."""
    product = (
        db.query(database_models.Product)
        .filter(
            database_models.Product.id == product_id,
            database_models.Product.owner_id == current_user.id,
        )
        .first()
    )
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )
    return product


@app.post("/products", response_model=ProductSchema, status_code=status.HTTP_201_CREATED)
def add_product(
    product_in: ProductCreate,
    current_user: database_models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new product owned strictly by the authenticated user.
    Client-supplied ownership parameters are completely ignored.
    """
    # If custom ID was supplied and positive, ensure it does not conflict
    if product_in.id is not None and product_in.id > 0:
        conflict = db.query(database_models.Product).filter(
            database_models.Product.id == product_in.id
        ).first()
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Product with ID {product_in.id} already exists.",
            )
        new_product = database_models.Product(
            id=product_in.id,
            name=product_in.name,
            description=product_in.description or "",
            price=product_in.price,
            quantity=product_in.quantity,
            owner_id=current_user.id,
        )
    else:
        new_product = database_models.Product(
            name=product_in.name,
            description=product_in.description or "",
            price=product_in.price,
            quantity=product_in.quantity,
            owner_id=current_user.id,
        )

    db.add(new_product)
    db.commit()
    db.refresh(new_product)
    return new_product


@app.put("/products/{product_id}", response_model=ProductSchema)
def update_product(
    product_id: int,
    product_in: ProductUpdate,
    current_user: database_models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a product only if it belongs to the authenticated user."""
    product = (
        db.query(database_models.Product)
        .filter(
            database_models.Product.id == product_id,
            database_models.Product.owner_id == current_user.id,
        )
        .first()
    )
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )

    if product_in.name is not None:
        product.name = product_in.name
    if product_in.description is not None:
        product.description = product_in.description
    if product_in.price is not None:
        product.price = product_in.price
    if product_in.quantity is not None:
        product.quantity = product_in.quantity

    db.commit()
    db.refresh(product)
    return product


@app.delete("/products/{product_id}")
def delete_product(
    product_id: int,
    current_user: database_models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a product only if owned by the authenticated user."""
    product = (
        db.query(database_models.Product)
        .filter(
            database_models.Product.id == product_id,
            database_models.Product.owner_id == current_user.id,
        )
        .first()
    )
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )

    db.delete(product)
    db.commit()
    return {"message": "Product deleted successfully", "id": product_id}
