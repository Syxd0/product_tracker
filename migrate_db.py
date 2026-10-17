import os
from datetime import datetime, timezone
from dotenv import load_dotenv
from sqlalchemy import create_engine, text, inspect
from pwdlib import PasswordHash

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL is not set")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)
elif DATABASE_URL.startswith("postgresql://") and not DATABASE_URL.startswith("postgresql+"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)

engine = create_engine(DATABASE_URL)
password_hash = PasswordHash.recommended()

def run_migration():
    print("Connecting to database...")
    with engine.begin() as conn:
        inspector = inspect(conn)
        tables = inspector.get_table_names()
        print(f"Existing tables: {tables}")

        # 1. Create users table if it doesn't exist
        if "users" not in tables:
            print("Creating 'users' table...")
            conn.execute(text("""
                CREATE TABLE users (
                    id SERIAL PRIMARY KEY,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    hashed_password VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX ix_users_id ON users (id);
                CREATE UNIQUE INDEX ix_users_email ON users (email);
            """))
            print("'users' table created.")
        else:
            print("'users' table already exists.")

        # 2. Check product table and owner_id column
        if "product" in tables:
            cols = [col["name"] for col in inspector.get_columns("product")]
            print(f"Existing product columns: {cols}")
            if "owner_id" not in cols:
                print("Adding 'owner_id' column to 'product' table...")
                conn.execute(text("""
                    ALTER TABLE product 
                    ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
                """))
                print("'owner_id' column added.")
            else:
                print("'owner_id' column already exists in 'product'.")

            # Check for products with NULL owner_id
            result = conn.execute(text("SELECT count(*) FROM product WHERE owner_id IS NULL")).scalar()
            print(f"Products with null owner_id: {result}")
            if result > 0:
                # Ensure a default user exists to assign existing products to
                existing_default = conn.execute(text("SELECT id FROM users WHERE email = 'admin@producttracker.local'")).fetchone()
                if not existing_default:
                    print("Creating initial user 'admin@producttracker.local' to preserve existing products...")
                    default_pw = password_hash.hash("TrackerAdmin2026!")
                    user_res = conn.execute(
                        text("INSERT INTO users (email, hashed_password) VALUES (:email, :pw) RETURNING id"),
                        {"email": "admin@producttracker.local", "pw": default_pw}
                    ).fetchone()
                    default_user_id = user_res[0]
                else:
                    default_user_id = existing_default[0]

                print(f"Assigning {result} legacy products to user id {default_user_id}...")
                conn.execute(
                    text("UPDATE product SET owner_id = :uid WHERE owner_id IS NULL"),
                    {"uid": default_user_id}
                )
                print("Legacy products safely assigned to initial user.")

            # Synchronize product_id_seq sequence with max(id)
            print("Synchronizing product ID sequence...")
            try:
                conn.execute(text("""
                    SELECT setval(
                        pg_get_serial_sequence('product', 'id'), 
                        COALESCE((SELECT MAX(id) FROM product), 1)
                    );
                """))
                print("Product ID sequence synchronized.")
            except Exception as e:
                print(f"Sequence sync warning: {e}")

        print("Migration completed successfully!")

if __name__ == "__main__":
    run_migration()
