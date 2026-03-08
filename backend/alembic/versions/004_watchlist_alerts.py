"""add watchlist and alerts tables

Revision ID: 004_watchlist_alerts
Revises: 003_special_plates
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa

revision = "004_watchlist_alerts"
down_revision = "003_special_plates"
branch_labels = None
depends_on = None


def upgrade():
    # ── 1. watchlist ──────────────────────────────────────────────────────────
    op.create_table(
        "watchlist",
        sa.Column("id",             sa.Integer,     primary_key=True),
        sa.Column("plate_text_norm",sa.String(32),  nullable=False),
        sa.Column("province",       sa.String(64),  nullable=True),
        # BLACKLIST | WHITELIST | VIP
        sa.Column("list_type",      sa.String(20),  nullable=False, server_default="BLACKLIST"),
        sa.Column("reason",         sa.Text,        nullable=True),
        # LOW | MEDIUM | HIGH | CRITICAL
        sa.Column("alert_level",    sa.String(20),  nullable=False, server_default="MEDIUM"),
        sa.Column("created_by",     sa.String(100), nullable=True),
        sa.Column("created_at",     sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("NOW()")),
        sa.Column("expires_at",     sa.DateTime(timezone=True), nullable=True),
        sa.Column("active",         sa.Boolean,     nullable=False, server_default="TRUE"),
    )
    # Partial unique index: one active entry per plate+list_type combination
    op.create_index(
        "uq_watchlist_plate_type",
        "watchlist",
        ["plate_text_norm", "list_type"],
        unique=True,
        postgresql_where=sa.text("active = TRUE"),
    )
    op.create_index("ix_watchlist_plate_text_norm", "watchlist", ["plate_text_norm"])

    # ── 2. alerts ─────────────────────────────────────────────────────────────
    op.create_table(
        "alerts",
        sa.Column("id",               sa.Integer, primary_key=True),
        sa.Column("read_id",          sa.Integer, sa.ForeignKey("plate_reads.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("watchlist_id",     sa.Integer, sa.ForeignKey("watchlist.id"),
                  nullable=False),
        sa.Column("camera_id",        sa.String(100), nullable=True),
        sa.Column("alert_level",      sa.String(20),  nullable=False),
        sa.Column("telegram_sent",    sa.Boolean,     nullable=False, server_default="FALSE"),
        sa.Column("acknowledged",     sa.Boolean,     nullable=False, server_default="FALSE"),
        sa.Column("acknowledged_by",  sa.String(100), nullable=True),
        sa.Column("acknowledged_at",  sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at",       sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("NOW()")),
    )
    op.create_index("ix_alerts_read_id",    "alerts", ["read_id"])
    op.create_index("ix_alerts_created_at", "alerts", ["created_at"])
    op.create_index("ix_alerts_acknowledged", "alerts", ["acknowledged"])


def downgrade():
    op.drop_table("alerts")
    op.drop_index("uq_watchlist_plate_type", table_name="watchlist")
    op.drop_index("ix_watchlist_plate_text_norm", table_name="watchlist")
    op.drop_table("watchlist")
