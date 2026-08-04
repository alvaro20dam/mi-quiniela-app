import os
from app import create_app
from utils.db import query

def apply():
    app = create_app()
    with app.app_context():
        print("Applying migration...")
        query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);")
        query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP WITH TIME ZONE;")
        print("Migration applied successfully.")

if __name__ == "__main__":
    apply()
