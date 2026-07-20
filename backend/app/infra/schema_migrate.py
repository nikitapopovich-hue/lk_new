from __future__ import annotations

from sqlalchemy import inspect, text


def migrate_employee_profiles(connection) -> None:
    """Добавляет новые колонки в employee_profiles без Alembic."""
    insp = inspect(connection)
    if not insp.has_table("employee_profiles"):
        return
    cols = {c["name"] for c in insp.get_columns("employee_profiles")}
    dialect = connection.dialect.name
    additions = [
        ("full_name", "VARCHAR(256) NOT NULL DEFAULT ''"),
        ("department", "VARCHAR(256) NOT NULL DEFAULT ''"),
        ("remote_work_reminder_month", "VARCHAR(7) NOT NULL DEFAULT ''"),
        ("subscribe_recalculations", "BOOLEAN NOT NULL DEFAULT TRUE"),
        ("subscribe_monitoring", "BOOLEAN NOT NULL DEFAULT TRUE"),
        ("subscribe_kpd", "BOOLEAN NOT NULL DEFAULT TRUE"),
        ("subscribe_all", "BOOLEAN NOT NULL DEFAULT TRUE"),
        ("google_refresh_token", "VARCHAR(512) NOT NULL DEFAULT ''"),
        ("google_access_token", "TEXT NOT NULL DEFAULT ''"),
        ("google_access_exp", "INTEGER NOT NULL DEFAULT 0"),
        ("google_birthday", "VARCHAR(32) NOT NULL DEFAULT ''"),
        ("google_picture", "TEXT NOT NULL DEFAULT ''"),
    ]
    for name, ddl in additions:
        if name in cols:
            continue
        if dialect == "sqlite":
            ddl = (
                ddl.replace("VARCHAR(256)", "TEXT")
                .replace("VARCHAR(7)", "TEXT")
                .replace("VARCHAR(512)", "TEXT")
                .replace("VARCHAR(2048)", "TEXT")
                .replace("VARCHAR(32)", "TEXT")
                .replace("INTEGER NOT NULL DEFAULT 0", "INTEGER NOT NULL DEFAULT 0")
                .replace("BOOLEAN NOT NULL DEFAULT TRUE", "BOOLEAN NOT NULL DEFAULT 1")
            )
        connection.execute(text(f"ALTER TABLE employee_profiles ADD COLUMN {name} {ddl}"))


def migrate_employee_profiles_google_widen(connection) -> None:
    """Расширяет google_picture / google_access_token — URL аватара Google бывает >512 символов."""
    insp = inspect(connection)
    if not insp.has_table("employee_profiles"):
        return
    dialect = connection.dialect.name
    if dialect == "postgresql":
        for col in insp.get_columns("employee_profiles"):
            name = col["name"]
            type_str = str(col["type"]).upper()
            if name == "google_picture" and "TEXT" not in type_str:
                connection.execute(
                    text("ALTER TABLE employee_profiles ALTER COLUMN google_picture TYPE TEXT")
                )
            elif name == "google_access_token" and "TEXT" not in type_str:
                connection.execute(
                    text("ALTER TABLE employee_profiles ALTER COLUMN google_access_token TYPE TEXT")
                )
    elif dialect == "sqlite":
        # SQLite не меняет тип через ALTER; для dev достаточно TEXT при create_all на новых БД.
        pass


def migrate_kc_structure_nodes(connection) -> None:
    insp = inspect(connection)
    if not insp.has_table("kc_structure_nodes"):
        return
    cols = {c["name"] for c in insp.get_columns("kc_structure_nodes")}
    dialect = connection.dialect.name
    additions = [
        ("pos_x", "FLOAT NOT NULL DEFAULT 0"),
        ("pos_y", "FLOAT NOT NULL DEFAULT 0"),
        ("manual_member_ids", "VARCHAR(2048) NOT NULL DEFAULT '[]'"),
    ]
    for name, ddl in additions:
        if name in cols:
            continue
        if dialect == "sqlite":
            ddl = ddl.replace("VARCHAR(2048)", "TEXT").replace("FLOAT", "REAL")
        connection.execute(text(f"ALTER TABLE kc_structure_nodes ADD COLUMN {name} {ddl}"))

    if "is_root" not in cols:
        ddl = "BOOLEAN NOT NULL DEFAULT 0" if dialect == "sqlite" else "BOOLEAN NOT NULL DEFAULT FALSE"
        connection.execute(text(f"ALTER TABLE kc_structure_nodes ADD COLUMN is_root {ddl}"))

    if "is_branch_leader" not in cols:
        ddl = "BOOLEAN NOT NULL DEFAULT 0" if dialect == "sqlite" else "BOOLEAN NOT NULL DEFAULT FALSE"
        connection.execute(text(f"ALTER TABLE kc_structure_nodes ADD COLUMN is_branch_leader {ddl}"))

    if "branch_leader_title" not in cols:
        ddl = "VARCHAR(256) NOT NULL DEFAULT ''"
        if dialect == "sqlite":
            ddl = "TEXT NOT NULL DEFAULT ''"
        connection.execute(text(f"ALTER TABLE kc_structure_nodes ADD COLUMN branch_leader_title {ddl}"))

    if "is_location" not in cols:
        ddl = "BOOLEAN NOT NULL DEFAULT 0" if dialect == "sqlite" else "BOOLEAN NOT NULL DEFAULT FALSE"
        connection.execute(text(f"ALTER TABLE kc_structure_nodes ADD COLUMN is_location {ddl}"))

    if "location_city" not in cols:
        ddl = "VARCHAR(256) NOT NULL DEFAULT ''"
        if dialect == "sqlite":
            ddl = "TEXT NOT NULL DEFAULT ''"
        connection.execute(text(f"ALTER TABLE kc_structure_nodes ADD COLUMN location_city {ddl}"))


def migrate_kc_structure_links(connection) -> None:
    insp = inspect(connection)
    if insp.has_table("kc_structure_links"):
        return
    dialect = connection.dialect.name
    if dialect == "sqlite":
        connection.execute(
            text(
                """
                CREATE TABLE kc_structure_links (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    from_node_id INTEGER NOT NULL REFERENCES kc_structure_nodes(id) ON DELETE CASCADE,
                    to_node_id INTEGER NOT NULL REFERENCES kc_structure_nodes(id) ON DELETE CASCADE,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (from_node_id, to_node_id)
                )
                """
            )
        )
    else:
        connection.execute(
            text(
                """
                CREATE TABLE kc_structure_links (
                    id SERIAL PRIMARY KEY,
                    from_node_id INTEGER NOT NULL REFERENCES kc_structure_nodes(id) ON DELETE CASCADE,
                    to_node_id INTEGER NOT NULL REFERENCES kc_structure_nodes(id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (from_node_id, to_node_id)
                )
                """
            )
        )


def migrate_kc_structure_suppressed_keys(connection) -> None:
    insp = inspect(connection)
    if insp.has_table("kc_structure_suppressed_keys"):
        return
    dialect = connection.dialect.name
    if dialect == "sqlite":
        connection.execute(
            text(
                """
                CREATE TABLE kc_structure_suppressed_keys (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    match_department TEXT NOT NULL DEFAULT '',
                    match_subdivision TEXT NOT NULL DEFAULT '',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (match_department, match_subdivision)
                )
                """
            )
        )
    else:
        connection.execute(
            text(
                """
                CREATE TABLE kc_structure_suppressed_keys (
                    id SERIAL PRIMARY KEY,
                    match_department VARCHAR(256) NOT NULL DEFAULT '',
                    match_subdivision VARCHAR(256) NOT NULL DEFAULT '',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (match_department, match_subdivision)
                )
                """
            )
        )


def migrate_kc_employees(connection) -> None:
    """Добавляет новые колонки в kc_employees без Alembic."""
    insp = inspect(connection)
    if not insp.has_table("kc_employees"):
        return
    cols = {c["name"] for c in insp.get_columns("kc_employees")}
    dialect = connection.dialect.name
    additions = [
        ("express_id", "VARCHAR(128) NOT NULL DEFAULT ''"),
        ("extra_data", "VARCHAR(8192) NOT NULL DEFAULT '{}'"),
        ("career_path", "VARCHAR(8192) NOT NULL DEFAULT '[]'"),
        ("subdivision", "VARCHAR(256) NOT NULL DEFAULT ''"),
    ]
    for name, ddl in additions:
        if name in cols:
            continue
        if dialect == "sqlite":
            ddl = ddl.replace("VARCHAR(128)", "TEXT").replace("VARCHAR(8192)", "TEXT")
        connection.execute(text(f"ALTER TABLE kc_employees ADD COLUMN {name} {ddl}"))


def migrate_kc_field_visibility_rows(connection) -> None:
    """Добавляет строки видимости для новых полей KC (если их ещё нет)."""
    from app.domain.kc_data_fields import KC_FIELD_DEFINITIONS

    insp = inspect(connection)
    if not insp.has_table("kc_field_visibility"):
        return
    existing = {
        row[0]
        for row in connection.execute(text("SELECT field_key FROM kc_field_visibility")).fetchall()
    }
    dialect = connection.dialect.name
    for field in KC_FIELD_DEFINITIONS:
        if field.key in existing:
            continue
        op = "TRUE" if field.default_operator else "FALSE"
        sup = "TRUE" if field.default_supervisor else "FALSE"
        if dialect == "sqlite":
            op = "1" if field.default_operator else "0"
            sup = "1" if field.default_supervisor else "0"
        connection.execute(
            text(
                f"INSERT INTO kc_field_visibility (field_key, visible_operator, visible_supervisor) "
                f"VALUES (:key, {op}, {sup})"
            ),
            {"key": field.key},
        )


def migrate_kc_employees_extended_fields(connection) -> None:
    """Доп. счёт и статусы сотрудника (декрет / уволен)."""
    insp = inspect(connection)
    if not insp.has_table("kc_employees"):
        return
    cols = {c["name"] for c in insp.get_columns("kc_employees")}
    dialect = connection.dialect.name
    additions = [
        ("account_number_extra", "VARCHAR(64) NOT NULL DEFAULT ''"),
        ("on_maternity_leave", "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("is_dismissed", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ]
    for name, ddl in additions:
        if name in cols:
            continue
        if dialect == "sqlite":
            ddl = (
                ddl.replace("VARCHAR(64)", "TEXT")
                .replace("BOOLEAN NOT NULL DEFAULT FALSE", "BOOLEAN NOT NULL DEFAULT 0")
            )
        connection.execute(text(f"ALTER TABLE kc_employees ADD COLUMN {name} {ddl}"))


def migrate_kc_employees_line_widen(connection) -> None:
    """Расширяет kc_employees.line — в импорте встречаются значения длиннее 16 символов."""
    insp = inspect(connection)
    if not insp.has_table("kc_employees"):
        return
    if connection.dialect.name != "postgresql":
        return
    for col in insp.get_columns("kc_employees"):
        if col["name"] != "line":
            continue
        type_str = str(col["type"]).lower()
        if "16" in type_str:
            connection.execute(text("ALTER TABLE kc_employees ALTER COLUMN line TYPE VARCHAR(32)"))
        return


def migrate_violation_journal_entries(connection) -> None:
    insp = inspect(connection)
    if not insp.has_table("violation_journal_entries"):
        return
    cols = {c["name"] for c in insp.get_columns("violation_journal_entries")}
    if "recorded_by_email" in cols:
        return
    dialect = connection.dialect.name
    ddl = "VARCHAR(320) NOT NULL DEFAULT ''"
    if dialect == "sqlite":
        ddl = "TEXT NOT NULL DEFAULT ''"
    connection.execute(text(f"ALTER TABLE violation_journal_entries ADD COLUMN recorded_by_email {ddl}"))


def migrate_teams(connection) -> None:
    insp = inspect(connection)
    dialect = connection.dialect.name

    if insp.has_table("teams"):
        cols = {c["name"] for c in insp.get_columns("teams")}
        if "owner_email" not in cols:
            ddl = "VARCHAR(320) NOT NULL DEFAULT ''"
            if dialect == "sqlite":
                ddl = "TEXT NOT NULL DEFAULT ''"
            connection.execute(text(f"ALTER TABLE teams ADD COLUMN owner_email {ddl}"))

    if insp.has_table("team_members"):
        cols = {c["name"] for c in insp.get_columns("team_members")}
        if "kc_employee_id" not in cols:
            ddl = "INTEGER"
            connection.execute(text(f"ALTER TABLE team_members ADD COLUMN kc_employee_id {ddl}"))


def migrate_violation_fine_acknowledgments(connection) -> None:
    insp = inspect(connection)
    if not insp.has_table("violation_fine_acknowledgments"):
        return
    cols = {c["name"] for c in insp.get_columns("violation_fine_acknowledgments")}
    if "supervisor_email" in cols:
        return
    dialect = connection.dialect.name
    ddl = "VARCHAR(320) NOT NULL DEFAULT ''"
    if dialect == "sqlite":
        ddl = "TEXT NOT NULL DEFAULT ''"
    connection.execute(text(f"ALTER TABLE violation_fine_acknowledgments ADD COLUMN supervisor_email {ddl}"))
