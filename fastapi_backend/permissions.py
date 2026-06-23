"""
Phase 5: Workplace/Room authorization helpers.

Provides UserContext + SQL filter builders for dashboards and alerts.
All filters are role-aware:
- admin: see everything
- teacher: own rooms + own classes' students + own classes' group rooms
- student: own rooms + group rooms the student is a member of
"""
from dataclasses import dataclass, field
from typing import Optional

from fastapi import HTTPException
from database import get_mysql
from auth import get_current_user


@dataclass
class UserContext:
    """Snapshot of user's authorization-relevant data for a single request."""
    user_id: int
    email: str
    role: str  # 'admin' | 'teacher' | 'student'
    lop_hoc_id: Optional[int] = None  # for student: their class
    # IDs of classes the user can see (teacher: classes they teach; student: their class)
    class_ids: list = field(default_factory=list)
    # IDs of phong (rooms) the user is owner of (phong ca nhan)
    personal_phong_ids: list = field(default_factory=list)
    # IDs of phong_nhom (group rooms) the user is a member of
    group_room_ids: list = field(default_factory=list)
    # Union for convenience
    visible_phong_ids: list = field(default_factory=list)


def get_user_context(current_user_email: str) -> UserContext:
    """
    Build UserContext from JWT email. Queries DB 1x per request.
    Returns UserContext with all authorization-relevant fields populated.
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, email, vai_tro, lop_hoc_id FROM nguoi_dung WHERE email = %s",
            (current_user_email,),
        )
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        ctx = UserContext(
            user_id=user["id"],
            email=user["email"],
            role=user["vai_tro"],
            lop_hoc_id=user.get("lop_hoc_id"),
        )

        if ctx.role == "admin":
            # Admin: no restrictions
            return ctx

        if ctx.role == "teacher":
            # Classes teacher teaches
            cursor.execute(
                "SELECT id FROM lop_hoc WHERE giao_vien_id = %s",
                (ctx.user_id,),
            )
            ctx.class_ids = [c["id"] for c in cursor.fetchall()]

            # Phong ca nhan of teacher + phong ca nhan of students in their classes
            cursor.execute(
                "SELECT id FROM phong WHERE nguoi_so_huu_id = %s",
                (ctx.user_id,),
            )
            ctx.personal_phong_ids = [p["id"] for p in cursor.fetchall()]

            if ctx.class_ids:
                placeholders = ",".join(["%s"] * len(ctx.class_ids))
                # Group rooms of those classes
                cursor.execute(
                    f"SELECT id FROM phong WHERE loai_phong='nhom' AND lop_hoc_id IN ({placeholders})",
                    tuple(ctx.class_ids),
                )
                ctx.group_room_ids = [p["id"] for p in cursor.fetchall()]
        else:
            # Student: phong ca nhan + group rooms they're a member of
            cursor.execute(
                "SELECT id FROM phong WHERE nguoi_so_huu_id = %s",
                (ctx.user_id,),
            )
            ctx.personal_phong_ids = [p["id"] for p in cursor.fetchall()]

            cursor.execute(
                """
                SELECT pntv.phong_id FROM phong_nhom_thanh_vien pntv
                JOIN phong p ON p.id = pntv.phong_id
                WHERE pntv.user_id = %s AND p.loai_phong = 'nhom'
                """,
                (ctx.user_id,),
            )
            ctx.group_room_ids = [p["phong_id"] for p in cursor.fetchall()]

        ctx.visible_phong_ids = list(set(ctx.personal_phong_ids) | set(ctx.group_room_ids))
        return ctx
    finally:
        cursor.close()
        conn.close()


# ──────────────────────────────────────────────────────────────────
# Dashboard filter
# ──────────────────────────────────────────────────────────────────
def build_dashboard_filter_sql(ctx: UserContext, alias: str = "d") -> tuple[str, list]:
    """
    Build WHERE clause for custom_dashboards based on user role.

    Returns (where_sql, params) - caller appends to existing WHERE.

    Rules:
    - admin: 1=1
    - teacher: owner OR phong personal OR lop_hoc in their classes OR shared via dashboard_permissions
    - student: owner OR phong personal OR phong in their group rooms OR lop_hoc = their class OR shared
    - NULL phong_id/lop_hoc dashboards (legacy/global): visible to owner + shared (admin sees all)
    """
    if ctx.role == "admin":
        return "1=1", []

    parts = []
    params: list = []

    # Owner
    parts.append(f"{alias}.nguoi_tao_id = %s")
    params.append(ctx.user_id)

    # Personal phong rooms (ca nhan) - everyone has at least their own
    if ctx.personal_phong_ids:
        placeholders = ",".join(["%s"] * len(ctx.personal_phong_ids))
        parts.append(f"{alias}.phong_id IN ({placeholders})")
        params.extend(ctx.personal_phong_ids)

    # Class context (teacher: classes they teach, student: their class)
    if ctx.role == "teacher" and ctx.class_ids:
        placeholders = ",".join(["%s"] * len(ctx.class_ids))
        parts.append(f"{alias}.lop_hoc_id IN ({placeholders})")
        params.extend(ctx.class_ids)
    elif ctx.role == "student" and ctx.lop_hoc_id is not None:
        parts.append(f"{alias}.lop_hoc_id = %s")
        params.append(ctx.lop_hoc_id)

    # Group rooms (student only - teacher already covered by class_ids)
    if ctx.role == "student" and ctx.group_room_ids:
        placeholders = ",".join(["%s"] * len(ctx.group_room_ids))
        parts.append(f"{alias}.phong_id IN ({placeholders})")
        params.extend(ctx.group_room_ids)

    # Explicit share via dashboard_permissions
    parts.append(
        f"EXISTS (SELECT 1 FROM dashboard_permissions p "
        f"WHERE p.dashboard_id = {alias}.id AND p.nguoi_dung_id = %s)"
    )
    params.append(ctx.user_id)

    return "(" + " OR ".join(parts) + ")", params


# ──────────────────────────────────────────────────────────────────
# Alert filter
# ──────────────────────────────────────────────────────────────────
def build_alert_filter_sql(ctx: UserContext, alias_tb: str = "tb") -> tuple[str, list]:
    """
    Build WHERE clause for canh_bao based on user role.
    Filter via JOIN thiet_bi -> phong.

    Returns (where_sql, params).

    Rules:
    - admin: 1=1
    - teacher: device in personal room of teacher, or device in personal room of student in their class, or device in group room of their class
    - student: device in personal room of student, or device in group room they're a member of
    """
    if ctx.role == "admin":
        return "1=1", []

    if ctx.role == "teacher":
        # Devices in teacher's personal phong
        personal_conds = [f"{alias_tb}.phong_id IN (SELECT id FROM phong WHERE nguoi_so_huu_id = %s)"]
        personal_params = [ctx.user_id]

        # Devices in personal phong of students in teacher's classes
        if ctx.class_ids:
            placeholders = ",".join(["%s"] * len(ctx.class_ids))
            personal_conds.append(
                f"{alias_tb}.phong_id IN (SELECT id FROM phong WHERE nguoi_so_huu_id IN ("
                f"SELECT id FROM nguoi_dung WHERE lop_hoc_id IN ({placeholders})))"
            )
            personal_params.extend(ctx.class_ids)

            # Devices in group rooms of teacher's classes
            personal_conds.append(
                f"{alias_tb}.phong_id IN (SELECT id FROM phong "
                f"WHERE loai_phong='nhom' AND lop_hoc_id IN ({placeholders}))"
            )
            personal_params.extend(ctx.class_ids)

        return "(" + " OR ".join(personal_conds) + ")", personal_params

    # Student: personal phong + group rooms they're a member of
    return (
        f"({alias_tb}.phong_id IN (SELECT id FROM phong WHERE nguoi_so_huu_id = %s) "
        f"OR {alias_tb}.phong_id IN (SELECT id FROM phong "
        f"WHERE loai_phong='nhom' AND id IN ("
        f"SELECT phong_id FROM phong_nhom_thanh_vien WHERE user_id = %s)))",
        [ctx.user_id, ctx.user_id],
    )


# ──────────────────────────────────────────────────────────────────
# Per-dashboard access check
# ──────────────────────────────────────────────────────────────────
def can_access_dashboard(
    ctx: UserContext, dashboard: dict, required_permission: str = "view"
) -> bool:
    """
    Check if user can access a single dashboard (for get/update/delete).

    dashboard: dict with keys 'nguoi_tao_id', 'phong_id', 'lop_hoc_id'.

    Returns True if:
    - user is admin
    - user is owner
    - dashboard is in user's personal_phong_ids
    - dashboard's lop_hoc_id is in user's class_ids (teacher) or equals user's lop_hoc_id (student)
    - dashboard's phong_id is in user's group_room_ids (student)
    """
    if ctx.role == "admin":
        return True

    if dashboard.get("nguoi_tao_id") == ctx.user_id:
        return True

    phong_id = dashboard.get("phong_id")
    lop_hoc_id = dashboard.get("lop_hoc_id")

    if phong_id is not None and phong_id in ctx.personal_phong_ids:
        return True

    if ctx.role == "teacher" and lop_hoc_id is not None and lop_hoc_id in ctx.class_ids:
        return True

    if ctx.role == "student":
        if lop_hoc_id is not None and lop_hoc_id == ctx.lop_hoc_id:
            return True
        if phong_id is not None and phong_id in ctx.group_room_ids:
            return True

    # Shared via dashboard_permissions
    return _check_dashboard_share(dashboard.get("id"), ctx.user_id, required_permission)


def _check_dashboard_share(dashboard_id: Optional[int], user_id: int, required_permission: str) -> bool:
    """Check dashboard_permissions table for explicit share."""
    if dashboard_id is None:
        return False
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT quyen FROM dashboard_permissions WHERE dashboard_id = %s AND nguoi_dung_id = %s",
            (dashboard_id, user_id),
        )
        perm = cursor.fetchone()
        if not perm:
            return False
        permission_map = {"view": ["view", "edit", "owner"], "edit": ["edit", "owner"]}
        allowed = permission_map.get(required_permission, ["view", "edit", "owner"])
        return perm["quyen"] in allowed
    finally:
        cursor.close()
        conn.close()


# ──────────────────────────────────────────────────────────────────
# Validation: dashboard context when creating/updating
# ──────────────────────────────────────────────────────────────────
def validate_dashboard_context(
    ctx: UserContext, phong_id: Optional[int], lop_hoc_id: Optional[int]
) -> None:
    """
    Validate user can create/update dashboard with given phong_id / lop_hoc_id.
    Raises HTTPException(403) if not authorized.
    """
    if phong_id is not None and lop_hoc_id is not None:
        raise HTTPException(status_code=400, detail="Chi set mot trong phong_id hoac lop_hoc_id")

    if phong_id is None and lop_hoc_id is None:
        return  # global/legacy - only owner/admin can edit later

    if ctx.role == "admin":
        return

    if phong_id is not None:
        conn = get_mysql()
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute(
                "SELECT id, nguoi_so_huu_id, loai_phong, lop_hoc_id FROM phong WHERE id = %s",
                (phong_id,),
            )
            phong = cursor.fetchone()
            if not phong:
                raise HTTPException(status_code=404, detail="Phong khong ton tai")

            # Owner of the phong
            if phong["nguoi_so_huu_id"] == ctx.user_id:
                return

            # Teacher of the class (if group room)
            if phong["loai_phong"] == "nhom" and phong["lop_hoc_id"] in ctx.class_ids:
                return

            # Student member of the group room
            if phong["loai_phong"] == "nhom":
                cursor.execute(
                    "SELECT 1 FROM phong_nhom_thanh_vien WHERE phong_id = %s AND user_id = %s",
                    (phong_id, ctx.user_id),
                )
                if cursor.fetchone():
                    return

            raise HTTPException(
                status_code=403, detail="Khong co quyen tao dashboard cho phong nay"
            )
        finally:
            cursor.close()
            conn.close()

    if lop_hoc_id is not None:
        if ctx.role == "teacher" and lop_hoc_id in ctx.class_ids:
            return
        if ctx.role == "student" and lop_hoc_id == ctx.lop_hoc_id:
            return
        raise HTTPException(status_code=403, detail="Khong phai lop ban quan ly")


# ──────────────────────────────────────────────────────────────────
# FastAPI dependency
# ──────────────────────────────────────────────────────────────────
from fastapi import Depends


def require_user_context(current_user: str = Depends(get_current_user)) -> UserContext:
    """FastAPI dependency: build UserContext from JWT for the current request."""
    return get_user_context(current_user)
