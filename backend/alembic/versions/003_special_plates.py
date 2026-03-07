"""add plate_type column and make province nullable for special plates

Revision ID: 003_special_plates
Revises: 002_cameras
Create Date: 2026-03-07
"""
from alembic import op
import sqlalchemy as sa

revision = "003_special_plates"
down_revision = "002_cameras"
branch_labels = None
depends_on = None

# Enum values for plate_type
_PLATE_TYPE_VALUES = ("STANDARD", "POLICE", "MILITARY", "TEST_CAR", "DIPLOMAT")
_PLATE_TYPE_ENUM = sa.Enum(*_PLATE_TYPE_VALUES, name="platetype")


def upgrade():
    # 1. Create the platetype enum type in the database
    _PLATE_TYPE_ENUM.create(op.get_bind(), checkfirst=True)

    # 2. Add plate_type to plate_reads (nullable, default STANDARD)
    op.add_column(
        "plate_reads",
        sa.Column(
            "plate_type",
            sa.Enum(*_PLATE_TYPE_VALUES, name="platetype"),
            nullable=True,
            server_default="STANDARD",
        ),
    )

    # 3. Add corrected_plate_type to verification_jobs
    op.add_column(
        "verification_jobs",
        sa.Column(
            "corrected_plate_type",
            sa.Enum(*_PLATE_TYPE_VALUES, name="platetype"),
            nullable=True,
        ),
    )

    # 4. Add plate_type to master_plates
    op.add_column(
        "master_plates",
        sa.Column(
            "plate_type",
            sa.Enum(*_PLATE_TYPE_VALUES, name="platetype"),
            nullable=True,
            server_default="STANDARD",
        ),
    )

    # 5. Make province nullable in plate_reads
    #    (existing rows keep their current value – empty string stays valid)
    op.alter_column(
        "plate_reads",
        "province",
        existing_type=sa.String(length=64),
        nullable=True,
    )

    # 6. Make province nullable in master_plates
    op.alter_column(
        "master_plates",
        "province",
        existing_type=sa.String(length=64),
        nullable=True,
    )


def downgrade():
    # Reverse province nullable
    op.alter_column(
        "master_plates",
        "province",
        existing_type=sa.String(length=64),
        nullable=False,
        server_default="",
    )
    op.alter_column(
        "plate_reads",
        "province",
        existing_type=sa.String(length=64),
        nullable=False,
        server_default="",
    )

    # Remove added columns
    op.drop_column("master_plates", "plate_type")
    op.drop_column("verification_jobs", "corrected_plate_type")
    op.drop_column("plate_reads", "plate_type")

    # Drop the enum type
    _PLATE_TYPE_ENUM.drop(op.get_bind(), checkfirst=True)
