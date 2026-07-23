"""initial_migration

Revision ID: 1e0a8b9f1d02
Revises: None
Create Date: 2026-07-22 13:45:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '1e0a8b9f1d02'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. Create users table
    op.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INT PRIMARY KEY,
            name VARCHAR(100),
            email VARCHAR(100),
            role VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    # 2. Create kafka_events table
    op.execute("""
        CREATE TABLE IF NOT EXISTS kafka_events (
            id SERIAL PRIMARY KEY,
            event_id VARCHAR(100),
            topic VARCHAR(100),
            payload TEXT,
            received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    # 3. Seed default users
    op.execute("""
        INSERT INTO users (id, name, email, role)
        VALUES 
            (42, 'Alice Smith', 'alice@lgtm.local', 'editor'),
            (108, 'Bob Jones', 'bob@lgtm.local', 'viewer'),
            (200, 'Charlie Dev', 'charlie@lgtm.local', 'admin')
        ON CONFLICT (id) DO NOTHING;
    """)

def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS kafka_events;")
    op.execute("DROP TABLE IF EXISTS users;")
