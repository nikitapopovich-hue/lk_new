from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.passwords import generate_password, hash_password
from app.core.config import Settings
from app.infra.models import UserAccount


async def seed_bootstrap_admin_if_empty(session: AsyncSession, settings: Settings) -> None:
    """Если таблица учёток пуста и задан BOOTSTRAP_ADMIN_EMAIL — создать стартовую учётку."""
    email = settings.bootstrap_admin_email.strip().lower()
    if not email:
        return
    count = (await session.execute(select(func.count()).select_from(UserAccount))).scalar_one()
    if count:
        return
    password = settings.bootstrap_admin_password.strip() or generate_password()
    session.add(UserAccount(email=email, password_hash=hash_password(password), created_by_email=""))
    await session.commit()
    print(f"[LK] Bootstrap-учётка создана: {email} / пароль: {password}")
    print("[LK] Чтобы вкладка 'Суперадмин' работала — email должен быть в SUPERADMIN_EMAILS.")
