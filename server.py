"""
server.py - Flask Web Application and REST API for Dharmanagar Gym Management
"""

import os
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, render_template, send_from_directory, session
from werkzeug.security import generate_password_hash, check_password_hash
from database import get_db, init_db, format_username, format_dob_password

app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = os.environ.get("SECRET_KEY", "dharmanagar-iron-gym-secret-key-2026-secure")
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

# Days of week constant
DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# ----------------- Auth Helper Functions -----------------
def get_current_user():
    user_id = session.get("user_id")
    # Also support X-User-Id header if passed (convenient for API tests or mobile tokens)
    if not user_id and request.headers.get("X-User-Id"):
        try:
            user_id = int(request.headers.get("X-User-Id"))
        except ValueError:
            user_id = None

    if not user_id:
        return None

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT u.id, u.username, u.full_name, u.dob, u.phone, u.email, u.role, 
               u.membership_status, u.membership_plan, u.start_date, u.expiry_date,
               ms.split_id, ws.name as split_name
        FROM users u
        LEFT JOIN member_splits ms ON u.id = ms.user_id
        LEFT JOIN workout_splits ws ON ms.split_id = ws.id
        WHERE u.id = ?
    """, (user_id,))
    user = cursor.fetchone()
    conn.close()
    if user:
        return dict(user)
    return None

def login_required(role=None):
    def decorator(f):
        def wrapper(*args, **kwargs):
            user = get_current_user()
            if not user:
                return jsonify({"error": "Authentication required"}), 401
            if role and user["role"] != role:
                return jsonify({"error": "Forbidden: insufficient permissions"}), 403
            return f(*args, user=user, **kwargs)
        wrapper.__name__ = f.__name__
        return wrapper
    return decorator

# ----------------- Frontend Route -----------------
@app.route("/")
def index():
    return render_template("index.html")

# ----------------- Authentication Endpoints -----------------
@app.route("/api/auth/login", methods=["POST"])
def api_login():
    data = request.get_json() or {}
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    # Username format: The user's full name converted to all lowercase with no spaces
    # (e.g. rahul das becomes rahuldas, admin stays admin)
    username_norm = format_username(username)
    # Password format: Date of birth numbers only, without spaces, hyphens, slashes, or gaps (DDMMYYYY)
    password_digits = "".join(c for c in password if c.isdigit())

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ? OR username = ?", (username_norm, username))
    user = cursor.fetchone()
    conn.close()

    if not user:
        return jsonify({"error": "Invalid username or password"}), 401

    # Check password: either raw password string or digits-only DDMMYYYY
    is_valid = check_password_hash(user["password_hash"], password)
    if not is_valid and password_digits:
        is_valid = check_password_hash(user["password_hash"], password_digits)

    if not is_valid:
        return jsonify({"error": "Invalid username or password"}), 401

    session["user_id"] = user["id"]
    session["role"] = user["role"]
    session["username"] = user["username"]

    return jsonify({
        "message": "Login successful",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "full_name": user["full_name"],
            "role": user["role"],
            "membership_status": user["membership_status"]
        }
    })

@app.route("/api/auth/register", methods=["POST"])
def api_register():
    """
    Public member registration:
    Requires Full Name and Date of Birth fields.
    Automatically generates and hashes login credentials:
      Username: Full name converted to all lowercase with no spaces (e.g. rahul das -> rahuldas)
      Password: Date of birth numbers only in DDMMYYYY format (e.g. 15082000)
    """
    data = request.get_json() or {}
    full_name = data.get("full_name", "").strip()
    dob = data.get("dob", "").strip()
    phone = data.get("phone", "").strip()
    email = data.get("email", "").strip()
    membership_plan = data.get("membership_plan", "Standard Monthly")
    split_id = data.get("split_id")

    if not full_name:
        return jsonify({"error": "Full Name is required"}), 400
    if not dob:
        return jsonify({"error": "Date of Birth is required"}), 400

    username = format_username(full_name)
    plain_password = format_dob_password(dob)

    if not username:
        return jsonify({"error": "Invalid full name"}), 400
    if not plain_password:
        return jsonify({"error": "Invalid Date of Birth format. Please provide a valid date."}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
    if cursor.fetchone():
        conn.close()
        return jsonify({"error": f"Username '{username}' already exists. Please contact admin or verify your name."}), 400

    password_hash = generate_password_hash(plain_password)
    start_date = datetime.now().strftime("%Y-%m-%d")
    expiry_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")

    cursor.execute("""
        INSERT INTO users (username, password_hash, full_name, dob, phone, email, role,
                           membership_status, membership_plan, start_date, expiry_date)
        VALUES (?, ?, ?, ?, ?, ?, 'member', 'active', ?, ?, ?)
    """, (username, password_hash, full_name, dob, phone, email, membership_plan, start_date, expiry_date))
    new_user_id = cursor.lastrowid

    if split_id:
        cursor.execute("INSERT INTO member_splits (user_id, split_id) VALUES (?, ?)", (new_user_id, split_id))
    else:
        cursor.execute("SELECT id FROM workout_splits ORDER BY id ASC LIMIT 1")
        default_split = cursor.fetchone()
        if default_split:
            cursor.execute("INSERT INTO member_splits (user_id, split_id) VALUES (?, ?)", (new_user_id, default_split["id"]))

    conn.commit()
    conn.close()

    session["user_id"] = new_user_id
    session["role"] = "member"
    session["username"] = username

    return jsonify({
        "message": f"Welcome to Dharmanagar Iron Gym, {full_name}!",
        "user": {
            "id": new_user_id,
            "username": username,
            "full_name": full_name,
            "role": "member",
            "membership_status": "active"
        },
        "credentials": {
            "username": username,
            "password": plain_password
        }
    }), 201

@app.route("/api/auth/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify({"message": "Logged out successfully"})

@app.route("/api/auth/me", methods=["GET"])
def api_current_user():
    user = get_current_user()
    if not user:
        return jsonify({"user": None}), 200
    return jsonify({"user": user})

@app.route("/api/auth/switch", methods=["POST"])
def api_switch_user():
    """Helper to switch active user for testing/demo"""
    data = request.get_json() or {}
    username = data.get("username")
    role = data.get("role")

    conn = get_db()
    cursor = conn.cursor()
    if username:
        cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
    elif role:
        cursor.execute("SELECT * FROM users WHERE role = ? LIMIT 1", (role,))
    else:
        conn.close()
        return jsonify({"error": "Provide username or role"}), 400

    user = cursor.fetchone()
    conn.close()

    if not user:
        return jsonify({"error": "User not found"}), 404

    session["user_id"] = user["id"]
    session["role"] = user["role"]
    session["username"] = user["username"]

    return jsonify({
        "message": f"Switched to {user['full_name']} ({user['role']})",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "full_name": user["full_name"],
            "role": user["role"],
            "membership_status": user["membership_status"]
        }
    })

@app.route("/api/auth/demo-users", methods=["GET"])
def api_demo_users():
    """List available users for easy switching in demo"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, full_name, dob, role, membership_status, membership_plan FROM users ORDER BY role ASC, id ASC")
    users = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify({"users": users})

# ----------------- Admin: Member Management -----------------
@app.route("/api/admin/members", methods=["GET"])
@login_required(role="admin")
def api_admin_get_members(user):
    search = request.args.get("search", "").strip().lower()
    status = request.args.get("status", "").strip().lower()

    conn = get_db()
    cursor = conn.cursor()

    query = """
        SELECT u.id, u.username, u.full_name, u.dob, u.phone, u.email, u.role,
               u.membership_status, u.membership_plan, u.start_date, u.expiry_date,
               u.created_at, ms.split_id, ws.name as split_name,
               (SELECT COUNT(DISTINCT log_date) FROM exercise_logs WHERE user_id = u.id AND completed = 1) as workout_days_logged,
               (SELECT weight_kg FROM weight_logs WHERE user_id = u.id ORDER BY log_date DESC LIMIT 1) as latest_weight
        FROM users u
        LEFT JOIN member_splits ms ON u.id = ms.user_id
        LEFT JOIN workout_splits ws ON ms.split_id = ws.id
        WHERE u.role = 'member'
    """
    params = []

    if search:
        query += " AND (LOWER(u.full_name) LIKE ? OR LOWER(u.username) LIKE ? OR u.phone LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])

    if status and status != "all":
        query += " AND u.membership_status = ?"
        params.append(status)

    query += " ORDER BY u.id DESC"

    cursor.execute(query, params)
    members = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify({"members": members})

@app.route("/api/admin/members", methods=["POST"])
@login_required(role="admin")
def api_admin_create_member(user):
    data = request.get_json() or {}
    full_name = data.get("full_name", "").strip()
    dob = data.get("dob", "").strip()
    phone = data.get("phone", "").strip()
    email = data.get("email", "").strip()
    membership_status = data.get("membership_status", "active")
    membership_plan = data.get("membership_plan", "Standard Monthly")
    start_date = data.get("start_date") or datetime.now().strftime("%Y-%m-%d")
    expiry_date = data.get("expiry_date") or (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
    split_id = data.get("split_id")

    # When registering or creating members, require Full Name and Date of Birth fields
    if not full_name:
        return jsonify({"error": "Full Name is required"}), 400
    if not dob:
        return jsonify({"error": "Date of Birth is required"}), 400

    # Automatically generate and hash their login credentials following exact rule
    username = format_username(full_name)
    plain_password = format_dob_password(dob)

    if not username:
        return jsonify({"error": "Invalid full name"}), 400
    if not plain_password:
        return jsonify({"error": "Invalid Date of Birth format. Please provide a valid date."}), 400

    conn = get_db()
    cursor = conn.cursor()

    # Check username uniqueness
    cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
    if cursor.fetchone():
        conn.close()
        return jsonify({"error": f"Username '{username}' already exists. Please specify a unique full name."}), 400

    password_hash = generate_password_hash(plain_password)

    cursor.execute("""
        INSERT INTO users (username, password_hash, full_name, dob, phone, email, role, 
                           membership_status, membership_plan, start_date, expiry_date)
        VALUES (?, ?, ?, ?, ?, ?, 'member', ?, ?, ?, ?)
    """, (username, password_hash, full_name, dob, phone, email, membership_status, membership_plan, start_date, expiry_date))
    new_user_id = cursor.lastrowid

    # If workout split was selected, assign it
    if split_id:
        cursor.execute("INSERT INTO member_splits (user_id, split_id) VALUES (?, ?)", (new_user_id, split_id))

    conn.commit()
    conn.close()

    return jsonify({
        "message": f"Member '{full_name}' created successfully with username '{username}'",
        "member_id": new_user_id,
        "username": username,
        "credentials": {
            "username": username,
            "password": plain_password
        }
    }), 201

@app.route("/api/admin/members/<int:member_id>", methods=["GET"])
@login_required(role="admin")
def api_admin_get_member(user, member_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT u.id, u.username, u.full_name, u.dob, u.phone, u.email, u.role,
               u.membership_status, u.membership_plan, u.start_date, u.expiry_date,
               u.created_at, ms.split_id, ws.name as split_name
        FROM users u
        LEFT JOIN member_splits ms ON u.id = ms.user_id
        LEFT JOIN workout_splits ws ON ms.split_id = ws.id
        WHERE u.id = ? AND u.role = 'member'
    """, (member_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Member not found"}), 404

    member = dict(row)

    # Fetch recent weight logs
    cursor.execute("""
        SELECT id, log_date, weight_kg, notes 
        FROM weight_logs 
        WHERE user_id = ? 
        ORDER BY log_date DESC LIMIT 10
    """, (member_id,))
    member["recent_weights"] = [dict(w) for w in cursor.fetchall()]

    # Fetch workout count
    cursor.execute("""
        SELECT COUNT(DISTINCT log_date) as workout_days
        FROM exercise_logs
        WHERE user_id = ? AND completed = 1
    """, (member_id,))
    stats = cursor.fetchone()
    member["total_workout_days"] = stats["workout_days"] if stats else 0

    conn.close()
    return jsonify({"member": member})

@app.route("/api/admin/members/<int:member_id>", methods=["PUT"])
@login_required(role="admin")
def api_admin_update_member(user, member_id):
    data = request.get_json() or {}
    full_name = data.get("full_name", "").strip()
    dob = data.get("dob", "").strip() if data.get("dob") else None
    phone = data.get("phone", "").strip()
    email = data.get("email", "").strip()
    membership_status = data.get("membership_status", "active")
    membership_plan = data.get("membership_plan", "Standard Monthly")
    start_date = data.get("start_date")
    expiry_date = data.get("expiry_date")
    split_id = data.get("split_id")
    new_password = data.get("password")

    if not full_name:
        return jsonify({"error": "Full name is required"}), 400

    username = format_username(full_name)

    conn = get_db()
    cursor = conn.cursor()

    if new_password and new_password.strip():
        password_hash = generate_password_hash(new_password.strip())
        cursor.execute("""
            UPDATE users SET username = ?, full_name = ?, dob = ?, phone = ?, email = ?, membership_status = ?,
                             membership_plan = ?, start_date = ?, expiry_date = ?, password_hash = ?
            WHERE id = ? AND role = 'member'
        """, (username, full_name, dob, phone, email, membership_status, membership_plan, start_date, expiry_date, password_hash, member_id))
    elif dob:
        plain_password = format_dob_password(dob)
        password_hash = generate_password_hash(plain_password)
        cursor.execute("""
            UPDATE users SET username = ?, full_name = ?, dob = ?, phone = ?, email = ?, membership_status = ?,
                             membership_plan = ?, start_date = ?, expiry_date = ?, password_hash = ?
            WHERE id = ? AND role = 'member'
        """, (username, full_name, dob, phone, email, membership_status, membership_plan, start_date, expiry_date, password_hash, member_id))
    else:
        cursor.execute("""
            UPDATE users SET username = ?, full_name = ?, phone = ?, email = ?, membership_status = ?,
                             membership_plan = ?, start_date = ?, expiry_date = ?
            WHERE id = ? AND role = 'member'
        """, (username, full_name, phone, email, membership_status, membership_plan, start_date, expiry_date, member_id))

    # Update or remove split assignment
    if split_id:
        cursor.execute("""
            INSERT INTO member_splits (user_id, split_id) VALUES (?, ?)
            ON CONFLICT(user_id) DO UPDATE SET split_id = excluded.split_id, assigned_at = CURRENT_TIMESTAMP
        """, (member_id, split_id))
    elif split_id == 0 or split_id is None:
        cursor.execute("DELETE FROM member_splits WHERE user_id = ?", (member_id,))

    conn.commit()
    conn.close()
    return jsonify({"message": "Member updated successfully"})

@app.route("/api/admin/members/<int:member_id>", methods=["DELETE"])
@login_required(role="admin")
def api_admin_delete_member(user, member_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM users WHERE id = ? AND role = 'member'", (member_id,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Member deleted successfully"})

# ----------------- Admin: Workout Split Designer -----------------
@app.route("/api/admin/splits", methods=["GET"])
@login_required(role="admin")
def api_admin_get_splits(user):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT ws.id, ws.name, ws.description, ws.created_at,
               (SELECT COUNT(*) FROM member_splits ms WHERE ms.split_id = ws.id) as assigned_members_count,
               (SELECT COUNT(*) FROM workout_days wd WHERE wd.split_id = ws.id AND wd.is_rest_day = 0) as active_days_count,
               (SELECT COUNT(*) FROM exercises e JOIN workout_days wd ON e.workout_day_id = wd.id WHERE wd.split_id = ws.id) as total_exercises_count
        FROM workout_splits ws
        ORDER BY ws.id DESC
    """)
    splits = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify({"splits": splits})

@app.route("/api/admin/splits/<int:split_id>", methods=["GET"])
@login_required(role="admin")
def api_admin_get_split_detail(user, split_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, description, created_at FROM workout_splits WHERE id = ?", (split_id,))
    split_row = cursor.fetchone()
    if not split_row:
        conn.close()
        return jsonify({"error": "Workout split not found"}), 404

    split = dict(split_row)

    # Fetch 7 days (Monday=0 to Sunday=6)
    days = []
    for day_idx in range(7):
        cursor.execute("""
            SELECT id, day_of_week, target_muscle, is_rest_day
            FROM workout_days
            WHERE split_id = ? AND day_of_week = ?
        """, (split_id, day_idx))
        day_row = cursor.fetchone()
        if day_row:
            day_dict = dict(day_row)
            day_dict["day_name"] = DAY_NAMES[day_idx]
            # Fetch exercises for this day
            cursor.execute("""
                SELECT id, name, target_sets, target_reps, rest_seconds, notes, order_index
                FROM exercises
                WHERE workout_day_id = ?
                ORDER BY order_index ASC, id ASC
            """, (day_dict["id"],))
            day_dict["exercises"] = [dict(ex) for ex in cursor.fetchall()]
            days.append(day_dict)
        else:
            days.append({
                "id": None,
                "day_of_week": day_idx,
                "day_name": DAY_NAMES[day_idx],
                "target_muscle": "Rest Day",
                "is_rest_day": 1,
                "exercises": []
            })

    split["days"] = days

    # Fetch list of assigned members
    cursor.execute("""
        SELECT u.id, u.full_name, u.username 
        FROM users u
        JOIN member_splits ms ON u.id = ms.user_id
        WHERE ms.split_id = ?
    """, (split_id,))
    split["assigned_members"] = [dict(m) for m in cursor.fetchall()]

    conn.close()
    return jsonify({"split": split})

@app.route("/api/admin/splits", methods=["POST"])
@login_required(role="admin")
def api_admin_create_split(user):
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    description = data.get("description", "").strip()
    days = data.get("days", [])

    if not name:
        return jsonify({"error": "Split name is required"}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO workout_splits (name, description, created_by)
        VALUES (?, ?, ?)
    """, (name, description, user["id"]))
    split_id = cursor.lastrowid

    # Create 7 days
    # If client passed days array, use it; otherwise create 7 default days
    day_map = {d.get("day_of_week"): d for d in days if "day_of_week" in d}

    for day_idx in range(7):
        day_info = day_map.get(day_idx, {
            "day_of_week": day_idx,
            "target_muscle": "Rest Day" if day_idx == 6 else "General Conditioning",
            "is_rest_day": 1 if day_idx == 6 else 0,
            "exercises": []
        })

        target_muscle = day_info.get("target_muscle", "General Conditioning").strip()
        is_rest_day = 1 if day_info.get("is_rest_day") else 0

        cursor.execute("""
            INSERT INTO workout_days (split_id, day_of_week, target_muscle, is_rest_day)
            VALUES (?, ?, ?, ?)
        """, (split_id, day_idx, target_muscle, is_rest_day))
        workout_day_id = cursor.lastrowid

        exercises = day_info.get("exercises", [])
        for order_idx, ex in enumerate(exercises):
            ex_name = ex.get("name", "").strip()
            if not ex_name:
                continue
            cursor.execute("""
                INSERT INTO exercises (workout_day_id, name, target_sets, target_reps, rest_seconds, notes, order_index)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                workout_day_id,
                ex_name,
                int(ex.get("target_sets", 3)),
                str(ex.get("target_reps", "10-12")),
                int(ex.get("rest_seconds", 60)),
                ex.get("notes", ""),
                order_idx
            ))

    conn.commit()
    conn.close()

    return jsonify({
        "message": f"Workout Split '{name}' created successfully",
        "split_id": split_id
    }), 201

@app.route("/api/admin/splits/<int:split_id>", methods=["PUT"])
@login_required(role="admin")
def api_admin_update_split(user, split_id):
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    description = data.get("description", "").strip()
    days = data.get("days", [])

    if not name:
        return jsonify({"error": "Split name is required"}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("UPDATE workout_splits SET name = ?, description = ? WHERE id = ?", (name, description, split_id))

    # Update days
    for day_info in days:
        day_idx = day_info.get("day_of_week")
        if day_idx is None:
            continue
        target_muscle = day_info.get("target_muscle", "Rest Day").strip()
        is_rest_day = 1 if day_info.get("is_rest_day") else 0

        # Check if day exists
        cursor.execute("SELECT id FROM workout_days WHERE split_id = ? AND day_of_week = ?", (split_id, day_idx))
        existing_day = cursor.fetchone()

        if existing_day:
            workout_day_id = existing_day["id"]
            cursor.execute("""
                UPDATE workout_days SET target_muscle = ?, is_rest_day = ? WHERE id = ?
            """, (target_muscle, is_rest_day, workout_day_id))
        else:
            cursor.execute("""
                INSERT INTO workout_days (split_id, day_of_week, target_muscle, is_rest_day)
                VALUES (?, ?, ?, ?)
            """, (split_id, day_idx, target_muscle, is_rest_day))
            workout_day_id = cursor.lastrowid

        # Replace exercises for this day
        cursor.execute("DELETE FROM exercises WHERE workout_day_id = ?", (workout_day_id,))
        exercises = day_info.get("exercises", [])
        for order_idx, ex in enumerate(exercises):
            ex_name = ex.get("name", "").strip()
            if not ex_name:
                continue
            cursor.execute("""
                INSERT INTO exercises (workout_day_id, name, target_sets, target_reps, rest_seconds, notes, order_index)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                workout_day_id,
                ex_name,
                int(ex.get("target_sets", 3)),
                str(ex.get("target_reps", "10-12")),
                int(ex.get("rest_seconds", 60)),
                ex.get("notes", ""),
                order_idx
            ))

    conn.commit()
    conn.close()
    return jsonify({"message": "Workout split updated successfully"})

@app.route("/api/admin/splits/<int:split_id>", methods=["DELETE"])
@login_required(role="admin")
def api_admin_delete_split(user, split_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM workout_splits WHERE id = ?", (split_id,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Workout split deleted successfully"})

@app.route("/api/admin/splits/<int:split_id>/assign", methods=["POST"])
@login_required(role="admin")
def api_admin_assign_split(user, split_id):
    data = request.get_json() or {}
    member_ids = data.get("member_ids", [])

    if not member_ids:
        return jsonify({"error": "At least one member ID required"}), 400

    conn = get_db()
    cursor = conn.cursor()

    for m_id in member_ids:
        cursor.execute("""
            INSERT INTO member_splits (user_id, split_id)
            VALUES (?, ?)
            ON CONFLICT(user_id) DO UPDATE SET split_id = excluded.split_id, assigned_at = CURRENT_TIMESTAMP
        """, (m_id, split_id))

    conn.commit()
    conn.close()
    return jsonify({"message": f"Split assigned to {len(member_ids)} member(s) successfully"})

@app.route("/api/admin/dashboard-stats", methods=["GET"])
@login_required(role="admin")
def api_admin_stats(user):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) as total FROM users WHERE role = 'member'")
    total_members = cursor.fetchone()["total"]

    cursor.execute("SELECT COUNT(*) as active FROM users WHERE role = 'member' AND membership_status = 'active'")
    active_members = cursor.fetchone()["active"]

    cursor.execute("SELECT COUNT(*) as expired FROM users WHERE role = 'member' AND membership_status = 'expired'")
    expired_members = cursor.fetchone()["expired"]

    cursor.execute("SELECT COUNT(*) as total FROM workout_splits")
    total_splits = cursor.fetchone()["total"]

    today_str = datetime.now().strftime("%Y-%m-%d")
    cursor.execute("SELECT COUNT(DISTINCT user_id) as active_today FROM exercise_logs WHERE log_date = ? AND completed = 1", (today_str,))
    active_today = cursor.fetchone()["active_today"]

    conn.close()
    return jsonify({
        "total_members": total_members,
        "active_members": active_members,
        "expired_members": expired_members,
        "total_splits": total_splits,
        "active_today": active_today
    })

# ----------------- Member: Dashboard & Workout Execution -----------------
@app.route("/api/member/dashboard", methods=["GET"])
@login_required()
def api_member_dashboard(user):
    user_id = user["id"]
    now = datetime.now()
    today_dow = now.weekday()  # 0=Monday, 6=Sunday
    today_str = now.strftime("%Y-%m-%d")

    conn = get_db()
    cursor = conn.cursor()

    # 1. Get assigned split
    cursor.execute("""
        SELECT ws.id, ws.name, ws.description, ms.assigned_at
        FROM member_splits ms
        JOIN workout_splits ws ON ms.split_id = ws.id
        WHERE ms.user_id = ?
    """, (user_id,))
    split_row = cursor.fetchone()

    if not split_row:
        # Fallback to first available split in DB if member has no split explicitly assigned
        cursor.execute("SELECT id, name, description FROM workout_splits ORDER BY id ASC LIMIT 1")
        split_row = cursor.fetchone()
        if split_row:
            cursor.execute("INSERT OR IGNORE INTO member_splits (user_id, split_id) VALUES (?, ?)", (user_id, split_row["id"]))
            conn.commit()

    if not split_row:
        conn.close()
        return jsonify({
            "has_split": False,
            "message": "No workout split assigned yet. Please contact the Dharmanagar Gym trainer/admin."
        })

    split = dict(split_row)
    split_id = split["id"]

    # 2. Get Weekly Calendar (7 days)
    cursor.execute("""
        SELECT wd.id as day_id, wd.day_of_week, wd.target_muscle, wd.is_rest_day,
               (SELECT COUNT(*) FROM exercises e WHERE e.workout_day_id = wd.id) as total_exercises
        FROM workout_days wd
        WHERE wd.split_id = ?
        ORDER BY wd.day_of_week ASC
    """, (split_id,))
    days_rows = cursor.fetchall()

    weekly_calendar = []
    today_day_info = None

    for d in days_rows:
        day_dict = dict(d)
        dow = day_dict["day_of_week"]
        day_dict["day_name"] = DAY_NAMES[dow]
        day_dict["is_today"] = (dow == today_dow)

        # Count completed exercises for this day of week if logged today or recent matching day
        cursor.execute("""
            SELECT COUNT(DISTINCT el.exercise_id) as completed_count
            FROM exercise_logs el
            JOIN exercises e ON el.exercise_id = e.id
            WHERE el.user_id = ? AND e.workout_day_id = ? AND el.completed = 1 AND el.log_date = ?
        """, (user_id, day_dict["day_id"], today_str if day_dict["is_today"] else ""))
        day_dict["completed_today"] = cursor.fetchone()["completed_count"]

        weekly_calendar.append(day_dict)
        if dow == today_dow:
            today_day_info = day_dict

    # 3. Get Today's Exercises with completed state and logged values
    today_exercises = []
    if today_day_info:
        cursor.execute("""
            SELECT e.id, e.name, e.target_sets, e.target_reps, e.rest_seconds, e.notes, e.order_index,
                   COALESCE(el.completed, 0) as completed,
                   COALESCE(el.weight_used, 0) as logged_weight,
                   COALESCE(el.reps_done, 0) as logged_reps,
                   COALESCE(el.sets_done, 0) as logged_sets,
                   COALESCE(el.notes, '') as member_notes
            FROM exercises e
            LEFT JOIN exercise_logs el ON e.id = el.exercise_id AND el.user_id = ? AND el.log_date = ?
            WHERE e.workout_day_id = ?
            ORDER BY e.order_index ASC, e.id ASC
        """, (user_id, today_str, today_day_info["day_id"]))
        today_exercises = [dict(ex) for ex in cursor.fetchall()]

    # 4. Member streak & stats
    cursor.execute("""
        SELECT COUNT(DISTINCT log_date) as workout_days_count
        FROM exercise_logs
        WHERE user_id = ? AND completed = 1
    """, (user_id,))
    total_workouts = cursor.fetchone()["workout_days_count"]

    # Latest weight
    cursor.execute("""
        SELECT weight_kg, log_date FROM weight_logs
        WHERE user_id = ? ORDER BY log_date DESC LIMIT 1
    """, (user_id,))
    latest_weight_row = cursor.fetchone()
    latest_weight = dict(latest_weight_row) if latest_weight_row else None

    conn.close()

    total_ex = len(today_exercises)
    completed_ex = sum(1 for ex in today_exercises if ex.get("completed") == 1)

    return jsonify({
        "has_split": True,
        "split": split,
        "today": {
            "date": today_str,
            "day_name": DAY_NAMES[today_dow],
            "day_of_week": today_dow,
            "target_muscle": today_day_info["target_muscle"] if today_day_info else "Rest Day",
            "is_rest_day": bool(today_day_info["is_rest_day"]) if today_day_info else True,
            "total_exercises": total_ex,
            "completed_exercises": completed_ex,
            "percent_completed": int((completed_ex / total_ex * 100)) if total_ex > 0 else 0,
            "exercises": today_exercises
        },
        "weekly_calendar": weekly_calendar,
        "stats": {
            "total_workouts_logged": total_workouts,
            "latest_weight": latest_weight
        }
    })

@app.route("/api/member/day/<int:day_of_week>", methods=["GET"])
@login_required()
def api_member_view_day(user, day_of_week):
    """View exercises for any specific day of the week"""
    user_id = user["id"]
    if day_of_week < 0 or day_of_week > 6:
        return jsonify({"error": "Invalid day of week"}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT ms.split_id FROM member_splits ms WHERE ms.user_id = ?
    """, (user_id,))
    split_row = cursor.fetchone()
    if not split_row:
        cursor.execute("SELECT id FROM workout_splits ORDER BY id ASC LIMIT 1")
        split_row = cursor.fetchone()

    if not split_row:
        conn.close()
        return jsonify({"error": "No split assigned"}), 404

    split_id = split_row["split_id"] if "split_id" in split_row.keys() else split_row["id"]

    cursor.execute("""
        SELECT id, target_muscle, is_rest_day FROM workout_days
        WHERE split_id = ? AND day_of_week = ?
    """, (split_id, day_of_week))
    day_row = cursor.fetchone()

    if not day_row:
        conn.close()
        return jsonify({
            "day_name": DAY_NAMES[day_of_week],
            "target_muscle": "Rest Day",
            "is_rest_day": True,
            "exercises": []
        })

    day_info = dict(day_row)
    cursor.execute("""
        SELECT e.id, e.name, e.target_sets, e.target_reps, e.rest_seconds, e.notes, e.order_index
        FROM exercises e
        WHERE e.workout_day_id = ?
        ORDER BY e.order_index ASC, e.id ASC
    """, (day_info["id"],))
    exercises = [dict(ex) for ex in cursor.fetchall()]
    conn.close()

    return jsonify({
        "day_of_week": day_of_week,
        "day_name": DAY_NAMES[day_of_week],
        "target_muscle": day_info["target_muscle"],
        "is_rest_day": bool(day_info["is_rest_day"]),
        "exercises": exercises
    })

@app.route("/api/member/exercise/toggle", methods=["POST"])
@login_required()
def api_member_toggle_exercise(user):
    user_id = user["id"]
    data = request.get_json() or {}
    exercise_id = data.get("exercise_id")
    completed = 1 if data.get("completed", True) else 0
    weight_used = float(data.get("weight_used") or 0)
    reps_done = int(data.get("reps_done") or 0)
    sets_done = int(data.get("sets_done") or 0)
    notes = data.get("notes", "").strip()
    log_date = data.get("log_date") or datetime.now().strftime("%Y-%m-%d")

    if not exercise_id:
        return jsonify({"error": "Exercise ID is required"}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO exercise_logs (user_id, exercise_id, log_date, completed, weight_used, reps_done, sets_done, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, exercise_id, log_date) DO UPDATE SET
            completed = excluded.completed,
            weight_used = excluded.weight_used,
            reps_done = excluded.reps_done,
            sets_done = excluded.sets_done,
            notes = excluded.notes
    """, (user_id, exercise_id, log_date, completed, weight_used, reps_done, sets_done, notes))

    conn.commit()

    # Fetch updated completion count for today
    cursor.execute("""
        SELECT COUNT(*) as done_count 
        FROM exercise_logs el
        JOIN exercises e ON el.exercise_id = e.id
        WHERE el.user_id = ? AND el.log_date = ? AND el.completed = 1
    """, (user_id, log_date))
    done_count = cursor.fetchone()["done_count"]

    conn.close()

    return jsonify({
        "message": "Exercise completion saved",
        "exercise_id": exercise_id,
        "completed": completed,
        "today_completed_count": done_count
    })

# ----------------- Member: Weight & Progress Logs -----------------
@app.route("/api/member/weight-logs", methods=["GET"])
@login_required()
def api_member_get_weight_logs(user):
    user_id = user["id"]
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, log_date, weight_kg, body_fat_pct, notes, created_at
        FROM weight_logs
        WHERE user_id = ?
        ORDER BY log_date ASC
    """, (user_id,))
    logs = [dict(row) for row in cursor.fetchall()]
    conn.close()

    # Calculate summary metrics
    if logs:
        weights = [r["weight_kg"] for r in logs]
        start_wt = weights[0]
        curr_wt = weights[-1]
        diff_wt = round(curr_wt - start_wt, 2)
        min_wt = min(weights)
        max_wt = max(weights)
    else:
        start_wt = curr_wt = diff_wt = min_wt = max_wt = 0

    return jsonify({
        "logs": logs,
        "summary": {
            "current_weight": curr_wt,
            "start_weight": start_wt,
            "change_kg": diff_wt,
            "min_weight": min_wt,
            "max_weight": max_wt,
            "total_entries": len(logs)
        }
    })

@app.route("/api/member/weight-logs", methods=["POST"])
@login_required()
def api_member_add_weight_log(user):
    user_id = user["id"]
    data = request.get_json() or {}
    try:
        weight_kg = float(data.get("weight_kg", 0))
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid weight value"}), 400

    if weight_kg <= 0:
        return jsonify({"error": "Weight must be greater than 0"}), 400

    log_date = data.get("log_date") or datetime.now().strftime("%Y-%m-%d")
    body_fat_pct = float(data.get("body_fat_pct")) if data.get("body_fat_pct") else None
    notes = data.get("notes", "").strip()

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO weight_logs (user_id, log_date, weight_kg, body_fat_pct, notes)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, log_date) DO UPDATE SET
            weight_kg = excluded.weight_kg,
            body_fat_pct = excluded.body_fat_pct,
            notes = excluded.notes
    """, (user_id, log_date, weight_kg, body_fat_pct, notes))
    conn.commit()
    conn.close()

    return jsonify({"message": f"Weight of {weight_kg} kg logged for {log_date}"}), 201

@app.route("/api/member/weight-logs/<int:log_id>", methods=["DELETE"])
@login_required()
def api_member_delete_weight_log(user, log_id):
    user_id = user["id"]
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM weight_logs WHERE id = ? AND user_id = ?", (log_id, user_id))
    conn.commit()
    conn.close()
    return jsonify({"message": "Weight log deleted successfully"})

@app.route("/api/member/exercise-history/<int:exercise_id>", methods=["GET"])
@login_required()
def api_member_exercise_history(user, exercise_id):
    """View progression of weights & reps logged for a specific exercise"""
    user_id = user["id"]
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT el.log_date, el.weight_used, el.reps_done, el.sets_done, el.notes, e.name as exercise_name
        FROM exercise_logs el
        JOIN exercises e ON el.exercise_id = e.id
        WHERE el.user_id = ? AND el.exercise_id = ? AND el.completed = 1
        ORDER BY el.log_date ASC
    """, (user_id, exercise_id))
    history = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify({"history": history})

# ----------------- Start Application -----------------
if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5000))
    host = os.environ.get("HOST", "0.0.0.0")
    print(f"\n=======================================================")
    print(f"🏋️  DHARMANAGAR GYM MANAGEMENT SERVER RUNNING")
    print(f"📍 Local Access: http://localhost:{port}")
    print(f"📱 Mobile / LAN: http://<your-device-ip>:{port}")
    print(f"👑 Admin Account: admin / 01012000")
    print(f"🏃 Member Accounts: rahuldebnath / 15082000, sneharoy / 10051998")
    print(f"=======================================================\n")
    app.run(host=host, port=port, debug=True)
