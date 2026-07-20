from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.infra.db import metadata


class Base(DeclarativeBase):
    metadata = metadata


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    owner_email: Mapped[str] = mapped_column(String(320), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class TeamMember(Base):
    __tablename__ = "team_members"
    __table_args__ = (UniqueConstraint("team_id", "user_id", name="team_members_team_user_unique"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    team_id: Mapped[int] = mapped_column(Integer, nullable=False)
    user_id: Mapped[str] = mapped_column(String(128), nullable=False)
    kc_employee_id: Mapped[int | None] = mapped_column(Integer, nullable=True)


class EmployeeMapping(Base):
    """
    Канонический пользователь: email (Google @pari.ru).
    Внешние идентификаторы в системах: Backoffice/Usedesk/UIS.
    """

    __tablename__ = "employee_mappings"
    __table_args__ = (UniqueConstraint("email", name="employee_mappings_email_unique"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    display_name: Mapped[str] = mapped_column(String(256), nullable=False, default="")

    backoffice_user_id: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    backoffice_logon_name: Mapped[str] = mapped_column(String(64), nullable=False, default="")

    usedesk_user_id: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    usedesk_email: Mapped[str] = mapped_column(String(320), nullable=False, default="")

    uis_employee_id: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    uis_login: Mapped[str] = mapped_column(String(64), nullable=False, default="")

    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class EmployeeProfile(Base):
    """Профиль сотрудника: удалённая работа и подписки на уведомления."""

    __tablename__ = "employee_profiles"
    __table_args__ = (UniqueConstraint("email", name="employee_profiles_email_unique"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False)

    home_address: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    internet_provider: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    patch_cord_length: Mapped[str] = mapped_column(String(64), nullable=False, default="")

    has_pc_laptop: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    can_work_programs_home: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    internet_access: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    has_headset: Mapped[str] = mapped_column(String(32), nullable=False, default="")

    subscribe_bonuses: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    subscribe_overtime: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    subscribe_new_fines: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    subscribe_recalculations: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    subscribe_monitoring: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    subscribe_kpd: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    subscribe_all: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    full_name: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    department: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    remote_work_reminder_month: Mapped[str] = mapped_column(String(7), nullable=False, default="")

    google_refresh_token: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    google_access_token: Mapped[str] = mapped_column(Text, nullable=False, default="")
    google_access_exp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    google_birthday: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    google_picture: Mapped[str] = mapped_column(Text, nullable=False, default="")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class UserAccount(Base):
    """Учётка для входа по email+паролю (демо-макет). Роль здесь не хранится."""

    __tablename__ = "user_accounts"
    __table_args__ = (UniqueConstraint("email", name="user_accounts_email_unique"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    created_by_email: Mapped[str] = mapped_column(String(320), nullable=False, default="")


class KcEmployee(Base):
    """Справочник сотрудников КЦ (раздел «Данные КЦ»)."""

    __tablename__ = "kc_employees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    department: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    subdivision: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    line: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    company: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    city: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    full_name: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    position: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    grade_new: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    email_new: Mapped[str] = mapped_column(String(320), nullable=False, default="")
    phone: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    skype: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    residence_address: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    telegram_username: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    express_id: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    extra_data: Mapped[str] = mapped_column(String(8192), nullable=False, default="{}")
    account_number: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    account_number_extra: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    on_maternity_leave: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_dismissed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    telegram_id: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    birth_date: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    first_work_day: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    access_date: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    leave_or_transfer_date: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    career_path: Mapped[str] = mapped_column(String(8192), nullable=False, default="[]")
    photo_url: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class KcStructureLink(Base):
    """Визуальная связь между узлами структуры (рисуется на карте, как в Miro)."""

    __tablename__ = "kc_structure_links"
    __table_args__ = (UniqueConstraint("from_node_id", "to_node_id", name="kc_structure_links_pair_unique"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    from_node_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("kc_structure_nodes.id", ondelete="CASCADE"), nullable=False
    )
    to_node_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("kc_structure_nodes.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class KcStructureSuppressedKey(Base):
    """Отдел/подраздел, удалённый с карты — не создавать снова при авто-синхронизации."""

    __tablename__ = "kc_structure_suppressed_keys"
    __table_args__ = (
        UniqueConstraint("match_department", "match_subdivision", name="kc_structure_suppressed_keys_unique"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    match_department: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    match_subdivision: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class KcStructureNode(Base):
    """Узел организационной структуры КЦ (иерархия отделов)."""

    __tablename__ = "kc_structure_nodes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    parent_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("kc_structure_nodes.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    match_department: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    match_subdivision: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    manager_employee_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("kc_employees.id", ondelete="SET NULL"), nullable=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pos_x: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    pos_y: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    manual_member_ids: Mapped[str] = mapped_column(String(2048), nullable=False, default="[]")
    is_root: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_branch_leader: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    branch_leader_title: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    is_location: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    location_city: Mapped[str] = mapped_column(String(256), nullable=False, default="")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class KcFieldVisibility(Base):
    """Видимость полей «Данные КЦ» по ролям (настраивает суперадмин)."""

    __tablename__ = "kc_field_visibility"
    __table_args__ = (UniqueConstraint("field_key", name="kc_field_visibility_key_unique"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    field_key: Mapped[str] = mapped_column(String(64), nullable=False)
    visible_operator: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    visible_supervisor: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class KcSubdivision(Base):
    """Подраздел внутри отдела (справочник для «Данные КЦ»)."""

    __tablename__ = "kc_subdivisions"
    __table_args__ = (UniqueConstraint("department", "name", name="kc_subdivisions_dept_name_unique"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    department: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    name: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class KcCustomFieldDef(Base):
    """Дополнительные текстовые поля карточки сотрудника (настраивает суперадмин)."""

    __tablename__ = "kc_custom_field_defs"

    field_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    label: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ViolationTypePrice(Base):
    """Справочник типов нарушений и сумм штрафов."""

    __tablename__ = "violation_type_prices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    fine_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ViolationJournalEntry(Base):
    """Запись журнала нарушений."""

    __tablename__ = "violation_journal_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    violation_date: Mapped[date] = mapped_column(nullable=False)
    employee_name: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    recorded_by: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    recorded_by_email: Mapped[str] = mapped_column(String(320), nullable=False, default="")
    group_name: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    violation_type: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    penalty_kind: Mapped[str] = mapped_column(String(32), nullable=False, default="warning")
    has_explanation: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    fine_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    comment: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class FinanceJournalEntry(Base):
    """Запись финансового журнала: переработки, премии, перерасчёты."""

    __tablename__ = "finance_journal_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entry_type: Mapped[str] = mapped_column(String(32), nullable=False, default="overtime")
    entry_date: Mapped[date] = mapped_column(nullable=False)
    employee_name: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    recorded_by: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    recorded_by_email: Mapped[str] = mapped_column(String(320), nullable=False, default="")
    hours: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    reason: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class NotificationRead(Base):
    """Отметка «прочитано» для оповещения пользователя."""

    __tablename__ = "notification_reads"
    __table_args__ = (
        UniqueConstraint("user_email", "notification_id", name="notification_reads_user_notification_unique"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_email: Mapped[str] = mapped_column(String(320), nullable=False)
    notification_id: Mapped[str] = mapped_column(String(128), nullable=False)
    read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ViolationFineAcknowledgment(Base):
    """Оператор ознакомился со штрафом — уведомление руководителю."""

    __tablename__ = "violation_fine_acknowledgments"
    __table_args__ = (
        UniqueConstraint(
            "violation_entry_id",
            "operator_email",
            name="violation_fine_ack_entry_operator_unique",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    violation_entry_id: Mapped[int] = mapped_column(Integer, nullable=False)
    operator_email: Mapped[str] = mapped_column(String(320), nullable=False)
    operator_display_name: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    supervisor_email: Mapped[str] = mapped_column(String(320), nullable=False, default="")
    acknowledged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class NotificationDismissed(Base):
    """Оповещение удалено из архива пользователем."""

    __tablename__ = "notification_dismissed"
    __table_args__ = (
        UniqueConstraint("user_email", "notification_id", name="notification_dismissed_user_notification_unique"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_email: Mapped[str] = mapped_column(String(320), nullable=False)
    notification_id: Mapped[str] = mapped_column(String(128), nullable=False)
    dismissed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class HoroscopeDailyCache(Base):
    """Кэш переведённого гороскопа дня: один текст на (дата MSK, знак зодиака)."""

    __tablename__ = "horoscope_daily_cache"
    __table_args__ = (
        UniqueConstraint("cache_date", "sign", name="horoscope_daily_cache_date_sign_unique"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cache_date: Mapped[date] = mapped_column(nullable=False)
    sign: Mapped[str] = mapped_column(String(32), nullable=False)
    horoscope_ru: Mapped[str] = mapped_column(Text, nullable=False)
    date_label: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    period: Mapped[str] = mapped_column(String(32), nullable=False, default="daily")
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
