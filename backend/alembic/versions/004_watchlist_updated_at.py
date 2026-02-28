"""add updated_at to watchlist

Revision ID: 004_watchlist_updated_at
Revises: 003_management_layer
Create Date: 2026-02-28
"""
from alembic import op
import sqlalchemy as sa

revision = "004_watchlist_updated_at"
down_revision = "003_management_layer"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "watchlist",
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    # Back-fill existing rows so updated_at is never NULL
    op.execute("UPDATE watchlist SET updated_at = created_at WHERE updated_at IS NULL")


def downgrade():
    op.drop_column("watchlist", "updated_at")
