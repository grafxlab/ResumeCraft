from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from enum import Enum
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import Boolean, Date, DateTime, Float, Integer, String, cast, delete, func, or_, select, update
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.auth import current_admin
from app.config import settings
from app.database import Base, get_session
from app.models import AIModelSelection, AIProviderSelection, AIUsageEvent, User
from app.schemas import AdminUserOut, AdminUserUpdate
from app.services.ai_models import (
    ANTHROPIC_MODELS,
    MODEL_SELECTION_IDS,
    OPENAI_MODELS,
    OPENAI_PRICING_SOURCE,
    PRICING_SOURCE,
    active_model,
    active_provider,
    model_details,
    openai_model_details,
    pricing_details,
)

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(current_admin)],
)
PAGE_SIZE_MAX = 100
USER_ROLES = {"user", "admin"}
USER_PLANS = {"trial", "essential", "pro", "power"}
DEDICATED_ADMIN_TABLES = {"users"}


def _table_or_404(table_name: str):
    if table_name in DEDICATED_ADMIN_TABLES:
        raise HTTPException(status_code=404, detail="Table not found")
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


def _protected_columns(table) -> set[str]:
    primary_keys = {column.name for column in table.primary_key.columns}
    foreign_keys = {
        column.name for column in table.columns if column.foreign_keys
    }
    return primary_keys | foreign_keys


def _coerce_value(column, value: Any) -> Any:
    if value is None:
        return None
    if isinstance(column.type, Boolean):
        if isinstance(value, bool):
            return value
        normalized = str(value).strip().lower()
        if normalized in {"true", "1", "yes"}:
            return True
        if normalized in {"false", "0", "no"}:
            return False
        raise ValueError("must be true or false")
    if isinstance(column.type, Integer):
        return int(value)
    if isinstance(column.type, Float):
        return float(value)
    if isinstance(column.type, DateTime):
        if isinstance(value, datetime):
            return value
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if isinstance(column.type, Date):
        if isinstance(value, date):
            return value
        return date.fromisoformat(str(value))
    return value


@router.get("/database-info")
async def database_info() -> dict[str, Any]:
    """Return the connected database host (without credentials)."""
    url = make_url(settings.database_url)
    return {
        "host": url.host or "localhost",
        "port": url.port,
        "database": url.database,
    }


@router.get("/users", response_model=list[AdminUserOut])
async def list_users(
    session: AsyncSession = Depends(get_session),
) -> list[User]:
    result = await session.scalars(select(User).order_by(User.created_at.desc()))
    return list(result.all())


@router.patch("/users/{user_id}", response_model=AdminUserOut)
async def update_user_access(
    user_id: int,
    payload: AdminUserUpdate,
    admin: User = Depends(current_admin),
    session: AsyncSession = Depends(get_session),
) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.role is not None and payload.role not in USER_ROLES:
        raise HTTPException(status_code=422, detail="Invalid user role")
    if payload.plan is not None and payload.plan not in USER_PLANS:
        raise HTTPException(status_code=422, detail="Invalid user plan")
    if payload.role == "user" and user.id == admin.id:
        raise HTTPException(
            status_code=422,
            detail="You cannot remove your own administrator role",
        )
    if payload.role == "user" and user.role == "admin":
        admin_count = await session.scalar(
            select(func.count(User.id)).where(User.role == "admin")
        )
        if (admin_count or 0) <= 1:
            raise HTTPException(status_code=422, detail="At least one administrator is required")
    if payload.role is not None:
        user.role = payload.role
    if payload.plan is not None:
        user.plan = payload.plan
    await session.commit()
    await session.refresh(user)
    return user


@router.get("/ai-usage")
async def ai_usage(
    days: int = Query(default=30, ge=1, le=365),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    since = datetime.now(UTC) - timedelta(days=days)
    period_filter = AIUsageEvent.created_at >= since
    totals = (
        await session.execute(
            select(
                func.count(AIUsageEvent.id).label("requests"),
                func.count(AIUsageEvent.id)
                .filter(AIUsageEvent.successful.is_(False))
                .label("failures"),
                func.coalesce(func.sum(AIUsageEvent.input_tokens), 0).label(
                    "input_tokens"
                ),
                func.coalesce(func.sum(AIUsageEvent.output_tokens), 0).label(
                    "output_tokens"
                ),
                func.coalesce(func.sum(AIUsageEvent.total_tokens), 0).label(
                    "total_tokens"
                ),
                func.sum(AIUsageEvent.estimated_cost_usd).label(
                    "estimated_cost_usd"
                ),
                func.avg(AIUsageEvent.duration_ms).label("average_duration_ms"),
            ).where(period_filter)
        )
    ).mappings().one()
    operations = (
        await session.execute(
            select(
                AIUsageEvent.operation,
                func.count(AIUsageEvent.id).label("requests"),
                func.coalesce(func.sum(AIUsageEvent.total_tokens), 0).label(
                    "total_tokens"
                ),
                func.sum(AIUsageEvent.estimated_cost_usd).label(
                    "estimated_cost_usd"
                ),
                func.avg(AIUsageEvent.duration_ms).label("average_duration_ms"),
            )
            .where(period_filter)
            .group_by(AIUsageEvent.operation)
            .order_by(func.sum(AIUsageEvent.total_tokens).desc())
        )
    ).mappings().all()
    users = (
        await session.execute(
            select(
                AIUsageEvent.user_id,
                User.email,
                func.count(AIUsageEvent.id).label("requests"),
                func.count(AIUsageEvent.id)
                .filter(AIUsageEvent.successful.is_(False))
                .label("failures"),
                func.coalesce(func.sum(AIUsageEvent.total_tokens), 0).label(
                    "total_tokens"
                ),
                func.sum(AIUsageEvent.estimated_cost_usd).label(
                    "estimated_cost_usd"
                ),
                func.avg(AIUsageEvent.duration_ms).label("average_duration_ms"),
            )
            .outerjoin(User, User.id == AIUsageEvent.user_id)
            .where(period_filter)
            .group_by(AIUsageEvent.user_id, User.email)
            .order_by(func.count(AIUsageEvent.id).desc())
        )
    ).mappings().all()
    recent = (
        await session.execute(
            select(AIUsageEvent)
            .where(period_filter)
            .order_by(AIUsageEvent.created_at.desc())
            .limit(50)
        )
    ).scalars().all()
    selected_provider = await active_provider()
    selected_model = await active_model(selected_provider)
    return {
        "days": days,
        "pricing_configured": (
            pricing_details(selected_provider, selected_model) is not None
            if selected_provider in MODEL_SELECTION_IDS
            else settings.llm_input_cost_per_million is not None
            and settings.llm_output_cost_per_million is not None
        ),
        "totals": _row_data(dict(totals)),
        "users": [_row_data(dict(row)) for row in users],
        "operations": [_row_data(dict(row)) for row in operations],
        "recent": [
            {
                "id": event.id,
                "user_id": event.user_id,
                "provider": event.provider,
                "model": event.model,
                "operation": event.operation,
                "input_tokens": event.input_tokens,
                "output_tokens": event.output_tokens,
                "total_tokens": event.total_tokens,
                "estimated_cost_usd": event.estimated_cost_usd,
                "duration_ms": event.duration_ms,
                "successful": event.successful,
                "error": event.error,
                "created_at": event.created_at.isoformat(),
            }
            for event in recent
        ],
    }


@router.get("/ai-models")
async def ai_models() -> dict[str, Any]:
    selected_provider = await active_provider()
    return {
        "active_provider": selected_provider,
        "providers": [
            {
                "id": "anthropic",
                "name": "Anthropic",
                "configured": bool(settings.anthropic_api_key),
                "selected_model": await active_model("anthropic"),
                "pricing_source": PRICING_SOURCE,
                "price_unit": "USD per million tokens",
                "models": [model_details(item["id"]) for item in ANTHROPIC_MODELS],
            },
            {
                "id": "openai",
                "name": "OpenAI",
                "configured": bool(settings.openai_api_key),
                "selected_model": await active_model("openai"),
                "pricing_source": OPENAI_PRICING_SOURCE,
                "price_unit": "USD per million tokens",
                "models": [openai_model_details(item["id"]) for item in OPENAI_MODELS],
            },
        ],
    }


@router.put("/ai-models/selection")
async def select_ai_model(
    payload: dict[str, str],
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    provider = payload.get("provider", "").strip().lower()
    model_id = payload.get("model", "").strip()
    details = pricing_details(provider, model_id)
    if details is None:
        raise HTTPException(status_code=422, detail="Unsupported provider or model")
    provider_configured = (
        bool(settings.anthropic_api_key) if provider == "anthropic" else bool(settings.openai_api_key)
    )
    if not provider_configured:
        raise HTTPException(status_code=422, detail=f"{provider.title()} API key is not configured")
    selection = await session.get(AIModelSelection, MODEL_SELECTION_IDS[provider])
    if selection is None:
        selection = AIModelSelection(id=MODEL_SELECTION_IDS[provider], model=model_id)
        session.add(selection)
    else:
        selection.model = model_id
    provider_selection = await session.get(AIProviderSelection, 1)
    if provider_selection is None:
        provider_selection = AIProviderSelection(id=1, provider=provider)
        session.add(provider_selection)
    else:
        provider_selection.provider = provider
    await session.commit()
    return {"active_provider": provider, "selected_model": model_id, "model": details}


@router.get("/tables")
async def list_tables(
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    tables = []
    for table in sorted(Base.metadata.tables.values(), key=lambda item: item.name):
        if table.name in DEDICATED_ADMIN_TABLES:
            continue
        row_count = await session.scalar(select(func.count()).select_from(table)) or 0
        tables.append(
            {
                "name": table.name,
                "columns": [column.name for column in table.columns],
                "row_count": row_count,
            }
        )
    return tables


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
        "foreign_keys": [
            column.name for column in columns if column.foreign_keys
        ],
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
    protected = _protected_columns(table)
    editable = {column.name for column in table.columns} - protected
    invalid = set(payload) - editable
    if invalid:
        raise HTTPException(
            status_code=422,
            detail=f"Columns cannot be edited: {', '.join(sorted(invalid))}",
        )
    if not payload:
        raise HTTPException(status_code=422, detail="No changes provided")

    values: dict[str, Any] = {}
    for key, value in payload.items():
        try:
            values[key] = _coerce_value(table.c[key], value)
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid value for {key}: {exc}",
            ) from exc

    try:
        result = await session.execute(
            update(table).where(primary_key == row_id).values(**values).returning(table)
        )
        row = result.mappings().first()
        if row is None:
            raise HTTPException(status_code=404, detail="Row not found")
        await session.commit()
        return _row_data(dict(row))
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=422, detail="Update violates a table constraint") from exc
    except DBAPIError as exc:
        await session.rollback()
        raise HTTPException(status_code=422, detail="One or more values are invalid for this table") from exc


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
