"""005 – users table with seeded admin account

Revision ID: 005_users
Revises: 004_watchlist_alerts
Create Date: 2025-01-01 00:00:00.000000

The default admin password is: admin1234
Change it immediately after first login via PUT /api/auth/users/{id}.
"""

revision = "005_users"
down_revision = "004_watchlist_alerts"
branch_labels = None
depends_on = None

import sqlalchemy as sa
from alembic import op


# bcrypt hash of "admin1234"  (work-factor 12, generated with bcrypt==3.2.2)
# The previous value ($2b$12$EixZaYVK…) was a well-known tutorial example hash
# for the string "password", not "admin1234".  bcrypt.checkpw confirmed the
# mismatch — any login attempt with "admin1234" returned 401.
_ADMIN_HASH = "$2b$12$zGajF3AKK64OG7k8G7wgIOrMUV2Lo4mlK7jCS7HUm4gGXzJvUC/pa"


def upgrade():
    op.create_table(
        "users",
        sa.Column("id",              sa.Integer,      primary_key=True),
        sa.Column("username",        sa.String(64),   nullable=False, unique=True),
        sa.Column("full_name",       sa.String(128),  nullable=True),
        sa.Column("hashed_password", sa.Text,         nullable=False),
        sa.Column("role",            sa.String(20),   nullable=False, server_default="GUARD"),
        sa.Column("active",          sa.Boolean,      nullable=False, server_default="TRUE"),
        sa.Column("created_at",      sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.text("NOW()")),
        sa.Column("last_login",      sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index("ix_users_username", "users", ["username"], unique=True)

    # Seed default admin account
    op.execute(
        sa.text(
            "INSERT INTO users (username, full_name, hashed_password, role, active) "
            "VALUES (:username, :full_name, :hashed_password, :role, :active)"
        ).bindparams(
            username="admin",
            full_name="System Administrator",
            hashed_password=_ADMIN_HASH,
            role="ADMIN",
            active=True,
        )
    )


def downgrade():
    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")
