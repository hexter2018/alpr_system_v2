"""006 – Fix admin password hash

Revision ID: 006_fix_admin_hash
Revises: 005_users
Create Date: 2025-01-02 00:00:00.000000

Migration 005 seeded the admin account with the bcrypt hash for the string
"password" (a well-known tutorial example value) instead of "admin1234".
This migration corrects the stored hash for any database that ran 005.

The corrected hash below was generated with:
    import bcrypt
    bcrypt.hashpw(b"admin1234", bcrypt.gensalt(rounds=12)).decode()

Default admin credentials after this migration:
    username: admin
    password: admin1234

Change the password immediately via PUT /api/auth/users/1.
"""

revision = "006_fix_admin_hash"
down_revision = "005_users"
branch_labels = None
depends_on = None

import sqlalchemy as sa
from alembic import op

# Correct bcrypt hash of "admin1234" (work-factor 12, bcrypt==3.2.2)
_CORRECT_HASH = "$2b$12$zGajF3AKK64OG7k8G7wgIOrMUV2Lo4mlK7jCS7HUm4gGXzJvUC/pa"

# The wrong hash from migration 005 (bcrypt hash of "password")
_WRONG_HASH = "$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW"


def upgrade():
    # Update only if the row still carries the broken hash so that admins who
    # already changed their password are not affected.
    op.execute(
        sa.text(
            "UPDATE users "
            "SET hashed_password = :correct "
            "WHERE username = 'admin' AND hashed_password = :wrong"
        ).bindparams(correct=_CORRECT_HASH, wrong=_WRONG_HASH)
    )


def downgrade():
    # Restore the (non-functional) original hash — downgrade is informational only.
    op.execute(
        sa.text(
            "UPDATE users "
            "SET hashed_password = :wrong "
            "WHERE username = 'admin' AND hashed_password = :correct"
        ).bindparams(correct=_CORRECT_HASH, wrong=_WRONG_HASH)
    )
