from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import String, cast, delete, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Base, get_session

router = APIRouter(prefix="/admin", tags=["admin"])
PAGE_SIZE_MAX = 100
IMMUTABLE_COLUMNS = {"id", "created_at", "updated_at"}


def _table_or_404(table_name: str):
    table = Base.metadata.tables.get(table_name)
    if table is None:
        raise HTTPException(status_code=404, detail="Table not found")
    return table


def _serialize(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _row_data(row: dict[str, Any]) -> dict[str, Any]:
    return {key: _serialize(value) for key, value in row.items()}


@router.get("/tables")
async def list_tables() -> list[dict[str, Any]]:
    return [
        {
            "name": table.name,
            "columns": [column.name for column in table.columns],
        }
        for table in sorted(Base.metadata.tables.values(), key=lambda item: item.name)
    ]


@router.get("/tables/{table_name}")
async def list_table_rows(
    table_name: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=PAGE_SIZE_MAX),
    search: str | None = Query(default=None, max_length=200),
    sort_by: str | None = Query(default=None),
    sort_dir: str = Query(default="asc", pattern="^(asc|desc)$"),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    table = _table_or_404(table_name)
    columns = list(table.columns)
    column_names = {column.name for column in columns}
    if sort_by is not None and sort_by not in column_names:
        raise HTTPException(status_code=422, detail="Invalid sort column")

    filters = []
    if search:
        term = f"%{search.strip()}%"
        filters.append(or_(*(cast(column, String).ilike(term) for column in columns)))

    count_query = select(func.count()).select_from(table)
    data_query = select(table)
    if filters:
        count_query = count_query.where(*filters)
        data_query = data_query.where(*filters)

    sort_column = table.c[sort_by] if sort_by else table.c.get("id")
    if sort_column is not None:
        data_query = data_query.order_by(
            sort_column.desc() if sort_dir == "desc" else sort_column.asc()
        )
    data_query = data_query.offset((page - 1) * page_size).limit(page_size)

    total = await session.scalar(count_query) or 0
    result = await session.execute(data_query)
    return {
        "table": table.name,
        "columns": [column.name for column in columns],
        "primary_key": [column.name for column in table.primary_key.columns],
        "rows": [_row_data(dict(row)) for row in result.mappings().all()],
        "page": page,
        "page_size": page_size,
        "total": total,
    }


@router.patch("/tables/{table_name}/{row_id}")
async def update_table_row(
    table_name: str,
    row_id: int,
    payload: dict[str, Any],
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    table = _table_or_404(table_name)
    primary_key = next(iter(table.primary_key.columns), None)
    if primary_key is None:
        raise HTTPException(status_code=422, detail="Table has no primary key")
    editable = {column.name for column in table.columns} - IMMUTABLE_COLUMNS
    invalid = set(payload) - editable
    if invalid:
        raise HTTPException(
            status_code=422,
            detail=f"Columns cannot be edited: {', '.join(sorted(invalid))}",
        )
    if not payload:
        raise HTTPException(status_code=422, detail="No changes provided")

    try:
        result = await session.execute(
            update(table).where(primary_key == row_id).values(**payload).returning(table)
        )
        row = result.mappings().first()
        if row is None:
            raise HTTPException(status_code=404, detail="Row not found")
        await session.commit()
        return _row_data(dict(row))
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=422, detail="Update violates a table constraint") from exc


@router.delete("/tables/{table_name}/{row_id}", status_code=204)
async def delete_table_row(
    table_name: str,
    row_id: int,
    session: AsyncSession = Depends(get_session),
) -> Response:
    table = _table_or_404(table_name)
    primary_key = next(iter(table.primary_key.columns), None)
    if primary_key is None:
        raise HTTPException(status_code=422, detail="Table has no primary key")
    try:
        result = await session.execute(delete(table).where(primary_key == row_id))
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Row not found")
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=422, detail="Delete violates a table constraint") from exc
    return Response(status_code=204)
