"""
database.py - SQLite Database manager and schema initialization for Dharmanagar Gym Management
"""

import sqlite3
import os
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gym.db")

def format_username(full_name):
    """
    Username format: The user's full name converted to all lowercase with no spaces
    (e.g., rahul das becomes rahuldas).
    """
    if not full_name:
        return ""
    return "".join(full_name.lower().split())

def format_dob_password(dob_str):
    """
    Password format: Their date of birth numbers only, without any spaces, hyphens, slashes, or gaps
    (e.g., DDMMYYYY format like 15082000).
    """
    if not dob_str:
        return ""
    dob_str = str(dob_str).strip()

    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y", "%Y.%m.%d", "%d%m%Y"):
        try:
            dt = datetime.strptime(dob_str, fmt)
            return dt.strftime("%d%m%Y")
        except ValueError:
            pass

    digits = "".join(c for c in dob_str if c.isdigit())
    if len(digits) == 8:
        try:
            year_candidate = int(digits[:4])
            if 1900 <= year_candidate <= 2100:
                return f"{digits[6:8]}{digits[4:6]}{digits[:4]}"
        except ValueError:
            pass
        return digits
    return digits

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # 1. Users table (Admin & Members)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        dob TEXT,
        phone TEXT,
        email TEXT,
        role TEXT NOT NULL CHECK(role IN ('admin', 'member')),
        membership_status TEXT DEFAULT 'active' CHECK(membership_status IN ('active', 'inactive', 'expired')),
        membership_plan TEXT DEFAULT 'Standard Monthly',
        start_date TEXT,
        expiry_date TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Ensure dob column exists for existing databases
    cursor.execute("PRAGMA table_info(users)")
    cols = [col[1] for col in cursor.fetchall()]
    if "dob" not in cols:
        cursor.execute("ALTER TABLE users ADD COLUMN dob TEXT")

    # 2. Workout Splits table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS workout_splits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        created_by INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
    """)

    # 3. Workout Days table (0 = Monday, 1 = Tuesday, ..., 6 = Sunday)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS workout_days (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        split_id INTEGER NOT NULL,
        day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
        target_muscle TEXT NOT NULL,
        is_rest_day INTEGER DEFAULT 0,
        FOREIGN KEY (split_id) REFERENCES workout_splits(id) ON DELETE CASCADE,
        UNIQUE(split_id, day_of_week)
    )
    """)

    # 4. Exercises table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS exercises (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workout_day_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        target_sets INTEGER NOT NULL DEFAULT 3,
        target_reps TEXT NOT NULL DEFAULT '10-12',
        rest_seconds INTEGER DEFAULT 60,
        notes TEXT,
        order_index INTEGER DEFAULT 0,
        FOREIGN KEY (workout_day_id) REFERENCES workout_days(id) ON DELETE CASCADE
    )
    """)

    # 5. Member Split Assignment table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS member_splits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        split_id INTEGER NOT NULL,
        assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (split_id) REFERENCES workout_splits(id) ON DELETE CASCADE
    )
    """)

    # 6. Exercise Completions table (Tracking daily exercises completed by members)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS exercise_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        exercise_id INTEGER NOT NULL,
        log_date TEXT NOT NULL,
        completed INTEGER DEFAULT 1,
        weight_used REAL DEFAULT 0,
        reps_done INTEGER DEFAULT 0,
        sets_done INTEGER DEFAULT 0,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
        UNIQUE(user_id, exercise_id, log_date)
    )
    """)

    # 7. Member Weight and Body Metric Logs
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS weight_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        log_date TEXT NOT NULL,
        weight_kg REAL NOT NULL,
        body_fat_pct REAL,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, log_date)
    )
    """)

    conn.commit()

    # Check if seed data is needed
    cursor.execute("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'")
    if cursor.fetchone()['cnt'] == 0:
        seed_data(conn)

    conn.close()

def seed_data(conn):
    cursor = conn.cursor()
    today = datetime.now()
    today_str = today.strftime("%Y-%m-%d")
    expiry_str = (today + timedelta(days=90)).strftime("%Y-%m-%d")

    # 1. Admin Account (Username: admin, Password: 01012000)
    admin_dob = "2000-01-01"
    admin_pass = format_dob_password(admin_dob)  # "01012000"
    admin_hash = generate_password_hash(admin_pass)
    cursor.execute("""
    INSERT INTO users (username, password_hash, full_name, dob, phone, email, role, membership_status, membership_plan, start_date, expiry_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, ("admin", admin_hash, "Coach Ratan Sharma", admin_dob, "+91 94361 22001", "ratan.coach@dharmanagargym.in", "admin", "active", "Trainer/Admin", today_str, (today + timedelta(days=365)).strftime("%Y-%m-%d")))
    admin_id = cursor.lastrowid

    # 2. Sample Members from Dharmanagar
    # Username: Full name lowercase with no spaces (e.g. rahul das -> rahuldas)
    # Password: DOB numbers only in DDMMYYYY format (e.g. 15082000)
    members_raw = [
        ("Rahul Debnath", "2000-08-15", "+91 98620 44551", "rahul.deb@gmail.com", "active", "Quarterly Hypertrophy", (today - timedelta(days=20)).strftime("%Y-%m-%d"), expiry_str),
        ("Sneha Roy", "1998-05-10", "+91 97741 88223", "sneha.roy@yahoo.com", "active", "Annual Strength & Conditioning", (today - timedelta(days=45)).strftime("%Y-%m-%d"), (today + timedelta(days=320)).strftime("%Y-%m-%d")),
        ("Bikram Das", "1995-12-25", "+91 94365 77114", "bikram.das@outlook.com", "active", "Monthly Standard", (today - timedelta(days=10)).strftime("%Y-%m-%d"), (today + timedelta(days=20)).strftime("%Y-%m-%d")),
        ("Priya Singha", "2001-03-05", "+91 98622 33445", "priya.singha@gmail.com", "expired", "Monthly Beginner", (today - timedelta(days=60)).strftime("%Y-%m-%d"), (today - timedelta(days=5)).strftime("%Y-%m-%d"))
    ]

    member_ids = {}
    for full_name, dob, phone, email, status, plan, start_d, expiry_d in members_raw:
        uname = format_username(full_name)
        pwd = format_dob_password(dob)
        pwd_hash = generate_password_hash(pwd)
        cursor.execute("""
        INSERT INTO users (username, password_hash, full_name, dob, phone, email, role, membership_status, membership_plan, start_date, expiry_date)
        VALUES (?, ?, ?, ?, ?, ?, 'member', ?, ?, ?, ?)
        """, (uname, pwd_hash, full_name, dob, phone, email, status, plan, start_d, expiry_d))
        member_ids[uname] = cursor.lastrowid

    # 3. Pre-designed Workout Splits
    # Split 1: Dharmanagar 5-Day Power & Hypertrophy Split
    cursor.execute("""
    INSERT INTO workout_splits (name, description, created_by)
    VALUES (?, ?, ?)
    """, (
        "Dharmanagar 5-Day Power & Hypertrophy",
        "Comprehensive split designed for building strength and lean muscle mass. Covers Chest/Triceps, Back/Biceps, Shoulders/Abs, Legs/Calves, and Arms/Conditioning.",
        admin_id
    ))
    split_id_1 = cursor.lastrowid

    # Days and exercises for Split 1
    days_data_1 = [
        # Monday (0): Chest & Triceps
        (0, "Chest & Triceps", 0, [
            ("Incline Barbell Bench Press", 4, "8-10", 90, "Focus on upper chest contraction, 2-second negative"),
            ("Flat Dumbbell Bench Press", 3, "10-12", 60, "Deep stretch at bottom, explosive press"),
            ("Cable Pec Flyes", 3, "12-15", 60, "Hold peak contraction for 1 sec"),
            ("Tricep Rope Pushdown", 4, "12-15", 45, "Flare rope at bottom, isolate triceps"),
            ("Overhead Dumbbell Tricep Extension", 3, "10-12", 60, "Full tricep long-head stretch")
        ]),
        # Tuesday (1): Back & Biceps
        (1, "Back & Biceps", 0, [
            ("Lat Pulldown (Wide Grip)", 4, "8-10", 90, "Drive elbows down towards hips"),
            ("Barbell Bent-Over Row", 4, "8-10", 90, "Keep spine neutral, pull to lower ribcage"),
            ("Seated Cable Row", 3, "10-12", 60, "Squeeze scapulae together"),
            ("Barbell Bicep Curls", 3, "10-12", 60, "Strict form, avoid shoulder swing"),
            ("Incline Dumbbell Hammer Curls", 3, "12-15", 45, "Targets brachialis and forearms")
        ]),
        # Wednesday (2): Rest & Mobility
        (2, "Rest & Active Recovery", 1, [
            ("Dynamic Stretching & Foam Rolling", 1, "15-20 mins", 0, "Lower back, hamstrings, shoulder mobility"),
            ("Light Incline Treadmill Walk", 1, "20 mins", 0, "Gentle zone 2 cardiovascular flush")
        ]),
        # Thursday (3): Shoulders & Core
        (3, "Shoulders & Core", 0, [
            ("Seated Dumbbell Shoulder Press", 4, "8-10", 90, "Press overhead with controlled descent"),
            ("Standing Dumbbell Lateral Raises", 4, "12-15", 45, "Slight forward lean, raise to eye level"),
            ("Face Pulls (Rear Delts)", 4, "15-20", 45, "Pull towards forehead, external rotation"),
            ("Hanging Leg Raises", 3, "12-15", 60, "Bring knees or toes up, control swing"),
            ("Plank with Shoulder Taps", 3, "45-60 sec", 45, "Anti-rotational core stabilization")
        ]),
        # Friday (4): Legs & Calves
        (4, "Legs & Calves", 0, [
            ("Barbell Back Squats", 4, "6-8", 120, "Hit depth below parallel, knees tracking toes"),
            ("Romanian Deadlifts (RDL)", 3, "8-10", 90, "Hinge at hips, stretch hamstrings"),
            ("Leg Press", 3, "10-12", 90, "Shoulder-width stance, full range"),
            ("Leg Extensions & Curls Superset", 3, "12-15", 60, "Controlled burn on quads and hamstrings"),
            ("Standing Calf Raises", 4, "15-20", 45, "Full stretch at bottom, squeeze on toes")
        ]),
        # Saturday (5): Arms & Conditioning
        (5, "Arms & Conditioning", 0, [
            ("Close-Grip Barbell Bench Press", 3, "8-10", 90, "Hands shoulder-width apart for triceps"),
            ("EZ-Bar Preacher Curls", 3, "10-12", 60, "Peak bicep isolation"),
            ("Dips (Parallel Bars)", 3, "10-12", 60, "Keep torso upright for triceps"),
            ("Incline Dumbbell Curls", 3, "10-12", 60, "Full long head stretch"),
            ("HIIT Sprints / Assault Bike", 8, "30s on / 30s off", 60, "Finish with high metabolic rate")
        ]),
        # Sunday (6): Full Rest Day
        (6, "Full Rest Day", 1, [
            ("Rest & Muscle Recovery", 1, "Full Day", 0, "Hydrate, sleep 8 hours, meet protein intake")
        ])
    ]

    split_1_day_ids = {}
    for day_num, muscle, is_rest, exercises in days_data_1:
        cursor.execute("""
        INSERT INTO workout_days (split_id, day_of_week, target_muscle, is_rest_day)
        VALUES (?, ?, ?, ?)
        """, (split_id_1, day_num, muscle, is_rest))
        day_id = cursor.lastrowid
        split_1_day_ids[day_num] = day_id
        for idx, (ex_name, sets, reps, rest, notes) in enumerate(exercises):
            cursor.execute("""
            INSERT INTO exercises (workout_day_id, name, target_sets, target_reps, rest_seconds, notes, order_index)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (day_id, ex_name, sets, reps, rest, notes, idx))

    # Split 2: Push / Pull / Legs (PPL) Split
    cursor.execute("""
    INSERT INTO workout_splits (name, description, created_by)
    VALUES (?, ?, ?)
    """, (
        "Push - Pull - Legs (PPL) 6-Day",
        "Popular, high-frequency muscle building routine alternating Push, Pull, and Leg workouts with Sunday as rest.",
        admin_id
    ))
    split_id_2 = cursor.lastrowid
    days_data_2 = [
        (0, "Push (Chest, Shoulders, Triceps)", 0, [
            ("Flat Barbell Bench Press", 4, "6-8", 120, "Primary compound movement"),
            ("Overhead Dumbbell Press", 3, "8-10", 90, "Shoulder vertical press"),
            ("Incline Dumbbell Flyes", 3, "10-12", 60, "Upper chest isolation"),
            ("Lateral Raises", 4, "12-15", 45, "Side deltoid width"),
            ("Skull Crushers", 3, "10-12", 60, "Tricep mass builder")
        ]),
        (1, "Pull (Back, Rear Delts, Biceps)", 0, [
            ("Conventional Deadlift", 4, "5", 150, "Heavy compound pull"),
            ("Neutral Grip Pull-Ups", 3, "8-10", 90, "Full lat engagement"),
            ("Chest Supported T-Bar Row", 3, "10-12", 60, "Mid-back thickness"),
            ("Rear Delt Cable Flyes", 3, "15", 45, "Rear delt flyes"),
            ("Dumbbell Incline Curls", 3, "10-12", 60, "Bicep peak development")
        ]),
        (2, "Legs & Calves", 0, [
            ("Barbell Back Squat", 4, "6-8", 120, "Deep squats"),
            ("Romanian Deadlift", 3, "8-10", 90, "Hamstring builder"),
            ("Walking Dumbbell Lunges", 3, "12 steps/leg", 60, "Unilateral strength"),
            ("Seated Calf Raises", 4, "15-20", 45, "Calf development")
        ]),
        (3, "Push (Chest & Triceps Emphasis)", 0, [
            ("Incline Barbell Press", 4, "8-10", 90, "Upper chest focus"),
            ("Dips (Weighted)", 3, "8-10", 90, "Lower chest & tricep"),
            ("Cable Crossovers", 3, "12-15", 60, "Peak chest contraction"),
            ("Tricep Overhead Cable Extension", 4, "12-15", 45, "Long head focus")
        ]),
        (4, "Pull (Lats & Biceps Emphasis)", 0, [
            ("Weighted Chin-Ups", 3, "6-8", 90, "Biceps and lower lats"),
            ("Barbell Pendlay Rows", 4, "8-10", 90, "Explosive rowing"),
            ("Single-Arm Dumbbell Row", 3, "10-12", 60, "Unilateral lat pull"),
            ("Hammer Curls with Rope", 4, "12-15", 45, "Brachialis isolation")
        ]),
        (5, "Legs & Core", 0, [
            ("Front Squat or Hack Squat", 4, "8-10", 90, "Quad emphasis"),
            ("Hamstring Lying Curls", 3, "10-12", 60, "Knee flexion hamstring focus"),
            ("Bulgarian Split Squats", 3, "10 reps/leg", 60, "Glute & quad strength"),
            ("Hanging Knee Raises", 3, "15-20", 45, "Lower abdominals")
        ]),
        (6, "Rest & Reset", 1, [
            ("Full Body Recovery", 1, "Rest", 0, "Active walk and recovery meal")
        ])
    ]
    for day_num, muscle, is_rest, exercises in days_data_2:
        cursor.execute("""
        INSERT INTO workout_days (split_id, day_of_week, target_muscle, is_rest_day)
        VALUES (?, ?, ?, ?)
        """, (split_id_2, day_num, muscle, is_rest))
        d_id = cursor.lastrowid
        for idx, (ex_name, sets, reps, rest, notes) in enumerate(exercises):
            cursor.execute("""
            INSERT INTO exercises (workout_day_id, name, target_sets, target_reps, rest_seconds, notes, order_index)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (d_id, ex_name, sets, reps, rest, notes, idx))

    # 4. Assign Workout Splits to Sample Members
    cursor.execute("INSERT INTO member_splits (user_id, split_id) VALUES (?, ?)", (member_ids["rahuldebnath"], split_id_1))
    cursor.execute("INSERT INTO member_splits (user_id, split_id) VALUES (?, ?)", (member_ids["sneharoy"], split_id_2))
    cursor.execute("INSERT INTO member_splits (user_id, split_id) VALUES (?, ?)", (member_ids["bikramdas"], split_id_1))

    # 5. Add Initial Weight Logs for Rahul (shows realistic progress trend)
    rahul_id = member_ids["rahuldebnath"]
    weight_samples = [
        ((today - timedelta(days=21)).strftime("%Y-%m-%d"), 78.5, "Starting transformation in Dharmanagar"),
        ((today - timedelta(days=18)).strftime("%Y-%m-%d"), 78.1, "Good hydration, diet on track"),
        ((today - timedelta(days=14)).strftime("%Y-%m-%d"), 77.6, "Feeling stronger on bench press"),
        ((today - timedelta(days=10)).strftime("%Y-%m-%d"), 77.2, "Energy high, recovery solid"),
        ((today - timedelta(days=7)).strftime("%Y-%m-%d"), 76.9, "Consistent workout week"),
        ((today - timedelta(days=3)).strftime("%Y-%m-%d"), 76.4, "Waist feeling leaner"),
        (today_str, 76.0, "Hit personal best weigh-in!")
    ]
    for log_date, wt, note in weight_samples:
        cursor.execute("""
        INSERT INTO weight_logs (user_id, log_date, weight_kg, notes)
        VALUES (?, ?, ?, ?)
        """, (rahul_id, log_date, wt, note))

    # Also add sample weight log for Sneha
    sneha_id = member_ids["sneharoy"]
    cursor.execute("""
    INSERT INTO weight_logs (user_id, log_date, weight_kg, notes)
    VALUES (?, ?, ?, ?)
    """, (sneha_id, today_str, 58.5, "Targeting strength progression"))

    # 6. Sample completed exercise logs for Rahul for today (first 2 exercises completed)
    # Find exercises for today's day of week in split 1
    current_dow = today.weekday() # 0 = Monday, 6 = Sunday
    cursor.execute("""
    SELECT e.id, e.name, e.target_sets, e.target_reps 
    FROM exercises e
    JOIN workout_days wd ON e.workout_day_id = wd.id
    WHERE wd.split_id = ? AND wd.day_of_week = ?
    ORDER BY e.order_index
    """, (split_id_1, current_dow))
    today_exercises = cursor.fetchall()
    
    # Mark first 2 completed if available
    for i, ex in enumerate(today_exercises[:2]):
        cursor.execute("""
        INSERT INTO exercise_logs (user_id, exercise_id, log_date, completed, weight_used, reps_done, sets_done, notes)
        VALUES (?, ?, ?, 1, ?, ?, ?, ?)
        """, (rahul_id, ex['id'], today_str, 65.0 + (i * 10), 10, ex['target_sets'], "Felt good, solid form"))

    conn.commit()
    print("Gym Database successfully initialized with Dharmanagar seed data!")

if __name__ == "__main__":
    init_db()
