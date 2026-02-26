"""add management layer tables

Revision ID: 003_management_layer
Revises: 002_cameras
Create Date: 2026-02-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "003_management_layer"
down_revision = "002_cameras"
branch_labels = None
depends_on = None

def upgrade():
    # Update cameras table to include trigger_zone and last_seen
    op.add_column("cameras", sa.Column("trigger_zone", postgresql.JSONB(), nullable=True))
    op.add_column("cameras", sa.Column("last_seen", sa.DateTime(), nullable=True))
    op.add_column("cameras", sa.Column("fps", sa.Float(), nullable=True, server_default="2.0"))
    op.add_column("cameras", sa.Column("status", sa.String(length=20), nullable=False, server_default="OFFLINE"))
    
    # Create watchlist table
    op.create_table(
        "watchlist",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("plate_text_norm", sa.String(length=32), nullable=False, index=True),
        sa.Column("list_type", sa.Enum("BLACKLIST", "WHITELIST", name="watchlisttype"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("alert_level", sa.String(length=20), nullable=False, server_default="MEDIUM"),
        sa.Column("created_by", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_index("ix_watchlist_active", "watchlist", ["active", "list_type"])
    
    # Create alerts table
    op.create_table(
        "alerts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("read_id", sa.Integer(), sa.ForeignKey("plate_reads.id"), nullable=False, index=True),
        sa.Column("watchlist_id", sa.Integer(), sa.ForeignKey("watchlist.id"), nullable=False),
        sa.Column("camera_id", sa.String(length=100), nullable=True),
        sa.Column("alert_level", sa.String(length=20), nullable=False),
        sa.Column("acknowledged", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("acknowledged_by", sa.String(length=100), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    
    # Create system_metrics table for health monitoring
    op.create_table(
        "system_metrics",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("metric_type", sa.String(length=50), nullable=False),
        sa.Column("metric_name", sa.String(length=100), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("metric_metadata", postgresql.JSONB(), nullable=True),
        sa.Column("timestamp", sa.DateTime(), nullable=False, index=True),
    )
    op.create_index("ix_system_metrics_type_time", "system_metrics", ["metric_type", "timestamp"])

def downgrade():
    op.drop_index("ix_system_metrics_type_time", table_name="system_metrics")
    op.drop_table("system_metrics")
    op.drop_table("alerts")
    op.drop_index("ix_watchlist_active", table_name="watchlist")
    op.drop_table("watchlist")
    
    op.drop_column("cameras", "status")
    op.drop_column("cameras", "fps")
    op.drop_column("cameras", "last_seen")
    op.drop_column("cameras", "trigger_zone")
    
    op.execute("DROP TYPE IF EXISTS watchlisttype")