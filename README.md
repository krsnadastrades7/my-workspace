# 🏋️ Dharmanagar Iron Gym - Management Web Application

A full-stack, mobile-first gym management web application built for **Dharmanagar Iron Gym** (located in Dharmanagar, North Tripura). The platform supports two distinct roles: **Admin / Head Coach** and **Gym Members**.

---

## 🌟 Key Features

### 👑 1. Admin Panel
- **Member Management**:
  - View overall member list with quick search and filter by status (`Active`, `Expired`, `Inactive`).
  - Add new members with username, password, full name, phone number, email, membership plan, and validity dates.
  - Edit member information, reset passwords, change membership status, and reassign workout splits.
  - Delete member accounts with cascading cleanup of associated logs.
- **Weekly Workout Split Designer**:
  - Design complete 7-day training splits (Monday through Sunday).
  - Specify target body parts / muscle groups for each day (e.g. *Chest & Triceps*, *Back & Biceps*, *Legs & Calves*, *Shoulders & Core*).
  - Configure rest days with a single toggle.
  - Add, edit, reorder, and remove individual exercises per day with:
    - Exercise name
    - Target sets (e.g. 4)
    - Target reps (e.g. 8-10)
    - Recommended rest timer (seconds)
    - Coaching notes & technique cues
  - Assign workout splits to individual members or batch-assign to multiple members.
- **Gym Performance & Analytics**:
  - Live KPIs: Total members, Active members, Expired memberships, Total split routines, Members active on the floor today.

### 🏃 2. Member Dashboard
- **Today's Workout Command Center**:
  - Hero card displaying today's targeted muscle group (e.g., **CHEST & TRICEPS**) and active routine name.
  - Real-time progress bar and radial completion counter (e.g., `3 of 5 completed • 60%`).
  - Interactive exercise checklist: check off completed exercises with instant visual feedback.
  - Set & rep logging: record actual weight lifted (kg) and actual reps completed directly into the SQLite database.
  - **Interactive Rest Timer**: built-in modal timer (30s, 60s, 90s, 2m) with animated pulsing ring and audio/vibrational cues between sets.
  - Rest Day screen with recovery guidance (hydration, protein targets, sleep).
- **Weekly Workout Split Calendar**:
  - 7-day interactive schedule (Mon–Sun) highlighting "Today".
  - Tap any day to inspect the exercises, sets, reps, and notes planned for that specific day.
- **Weight & Body Composition Progress Tracker**:
  - Log daily body weight (kg), optional body fat %, date, and notes.
  - Summary metrics: Current Weight, Starting Weight, Net Change (+/- kg), and Total Weigh-in count.
  - **Custom Canvas Progress Chart**: High-resolution, retina-scaled line chart displaying weight trends over time with gradient fill and data points.
  - Log history table with deletion support.
- **Member Profile**:
  - Membership tier, validity/expiry date, active routine, and total completed workout sessions.

---

## 🛠️ Tech Stack

- **Backend**: Python (Flask) with RESTful API architecture.
- **Database**: SQLite (`gym.db`) using Python's native `sqlite3` engine with foreign key cascades and seed data.
- **Frontend**: Clean, mobile-first responsive vanilla HTML5, modern CSS3 (custom CSS variables, dark athletic theme, glassmorphism, responsive grid/flexbox), and modular JavaScript.
- **Zero Heavy Frontend Dependencies**: Fast, lightweight, and works seamlessly in mobile browsers on the gym floor.

---

## 📁 File Structure

```
workspace/
├── server.py              # Flask backend, REST API endpoints, auth decorators
├── database.py            # SQLite schema, tables, relations, and Dharmanagar seed data
├── start.sh               # Executable startup script (checks environment & launches server)
├── requirements.txt       # Python dependencies (Flask, Werkzeug)
├── README.md              # Project documentation
├── templates/
│   └── index.html         # Responsive single-page web application container
└── static/
    ├── css/
    │   └── style.css      # Mobile-first modern CSS (dark athletic gym theme)
    └── js/
        ├── app.js         # Router, auth state, quick-switcher, modals, rest timer
        ├── admin.js       # Admin panel: member CRUD, 7-day split designer, assignments
        └── member.js      # Member dashboard: today's workout, calendar, weight chart
```

---

## 🔑 Demo & Test Accounts & Login Logic

The authentication system uses a standardized credential generation rule:
- **Username format**: The user's full name converted to all lowercase with no spaces (e.g., `Rahul Debnath` &rarr; `rahuldebnath`).
- **Password format**: Date of birth numbers only, without any spaces, hyphens, slashes, or gaps in **DDMMYYYY** format (e.g., 15 August 2000 &rarr; `15082000`).

The database comes pre-seeded with realistic data for Dharmanagar Iron Gym:

| Role | Name | Username | Password | Date of Birth | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Admin** | Coach Ratan Sharma | `admin` | `01012000` | 01/01/2000 | Default Admin account |
| **Member** | Rahul Debnath | `rahuldebnath` | `15082000` | 15/08/2000 | 5-Day Hypertrophy Split, active logs |
| **Member** | Sneha Roy | `sneharoy` | `10051998` | 10/05/1998 | Push-Pull-Legs (PPL) Split |
| **Member** | Bikram Das | `bikramdas` | `25121995` | 25/12/1995 | Monthly Standard Plan |
| **Member** | Priya Singha | `priyasingha` | `05032001` | 05/03/2001 | Expired Membership (test state) |

> 💡 **Quick Switcher**: In the top navigation bar, click **"⇄ Switch User"** to instantly test between the Admin and various Member views with one click!

---

## 🚀 How to Run the Server

Run the startup script:

```bash
./start.sh
```

Or manually with Python:

```bash
python3 database.py  # Initializes database with seed data if not already present
python3 server.py    # Starts web server on port 5000
```

Once running:
- **Local Access**: Open [http://localhost:5000](http://localhost:5000) in your browser.
- **Mobile Access**: Connect your mobile phone to the same local Wi-Fi network and open `http://<your-device-ip>:5000`.

---

## 📡 Key REST API Endpoints

### Authentication
- `POST /api/auth/login` - Sign in with username & password.
- `POST /api/auth/logout` - Clear session.
- `GET /api/auth/me` - Get current logged-in user profile & assigned split.
- `POST /api/auth/switch` - One-click account switcher for testing.
- `GET /api/auth/demo-users` - List demo accounts.

### Admin APIs
- `GET /api/admin/members` - List members (supports `?search=` and `?status=`).
- `POST /api/admin/members` - Create a member account.
- `PUT /api/admin/members/<id>` - Update member profile, status, password, or split.
- `DELETE /api/admin/members/<id>` - Remove a member.
- `GET /api/admin/splits` - List all workout split routines.
- `GET /api/admin/splits/<id>` - Fetch full 7-day schedule with exercises.
- `POST /api/admin/splits` - Create new weekly workout split.
- `PUT /api/admin/splits/<id>` - Update split schedule.
- `DELETE /api/admin/splits/<id>` - Delete split.
- `POST /api/admin/splits/<id>/assign` - Assign split to one or more members.
- `GET /api/admin/dashboard-stats` - Summary gym metrics.

### Member APIs
- `GET /api/member/dashboard` - Get active split, today's workout, and weekly summary.
- `GET /api/member/day/<dow>` - Preview exercises for any day of the week (0=Mon...6=Sun).
- `POST /api/member/exercise/toggle` - Check off an exercise and record weight lifted/reps done.
- `GET /api/member/weight-logs` - Get historical weight logs and trend summary.
- `POST /api/member/weight-logs` - Record daily weight (kg) and notes.
- `DELETE /api/member/weight-logs/<id>` - Delete a weight entry.
