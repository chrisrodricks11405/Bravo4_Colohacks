/** SQL statements to initialize the local SQLite database */

export const CREATE_TABLES_SQL = [
  `CREATE TABLE IF NOT EXISTS active_session (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL,
    join_code TEXT NOT NULL,
    qr_payload TEXT NOT NULL,
    session_access_token TEXT,
    session_access_token_hash TEXT,
    subject TEXT NOT NULL,
    topic TEXT NOT NULL,
    grade_class TEXT NOT NULL,
    language TEXT NOT NULL,
    lost_threshold REAL NOT NULL DEFAULT 40,
    mode TEXT NOT NULL DEFAULT 'online',
    lesson_plan_seed TEXT,
    status TEXT NOT NULL DEFAULT 'lobby',
    participant_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    started_at TEXT,
    ended_at TEXT,
    locked_at TEXT
  );`,

  `CREATE TABLE IF NOT EXISTS pending_sync_jobs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    session_id TEXT,
    job_key TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    last_attempt_at TEXT,
    next_attempt_at TEXT,
    completed_at TEXT,
    error TEXT
  );`,

  `CREATE TABLE IF NOT EXISTS local_pulse_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    anonymous_id TEXT NOT NULL,
    pulse TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'local_hotspot',
    synced INTEGER NOT NULL DEFAULT 0,
    synced_at TEXT
  );`,

  `CREATE TABLE IF NOT EXISTS local_pulse_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    got_it_count INTEGER NOT NULL DEFAULT 0,
    sort_of_count INTEGER NOT NULL DEFAULT 0,
    lost_count INTEGER NOT NULL DEFAULT 0,
    total_active INTEGER NOT NULL DEFAULT 0,
    disconnected_count INTEGER NOT NULL DEFAULT 0,
    confusion_index REAL NOT NULL DEFAULT 0
  );`,

  `CREATE TABLE IF NOT EXISTS lesson_markers (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    type TEXT NOT NULL,
    label TEXT,
    timestamp TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0,
    synced_at TEXT
  );`,

  `CREATE TABLE IF NOT EXISTS intervention_history (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    type TEXT NOT NULL,
    cluster_id TEXT,
    lesson_marker_id TEXT,
    timestamp TEXT NOT NULL,
    confusion_before REAL NOT NULL,
    confusion_after REAL,
    recovery_score REAL,
    recovery_window_seconds INTEGER NOT NULL DEFAULT 60,
    duration_seconds INTEGER,
    notes TEXT,
    synced INTEGER NOT NULL DEFAULT 0,
    synced_at TEXT
  );`,

  `CREATE TABLE IF NOT EXISTS cluster_cache (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    affected_count INTEGER NOT NULL DEFAULT 0,
    representative_question TEXT NOT NULL,
    reason_chip TEXT NOT NULL DEFAULT 'other',
    lesson_marker_id TEXT,
    translation TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    suggested_interventions TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS question_cache (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    anonymous_id TEXT NOT NULL,
    text TEXT NOT NULL,
    language TEXT,
    lesson_marker_id TEXT,
    timestamp TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0,
    synced_at TEXT
  );`,

  `CREATE TABLE IF NOT EXISTS poll_cache (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    question TEXT NOT NULL,
    options_json TEXT NOT NULL,
    correct_option_index INTEGER,
    source TEXT NOT NULL DEFAULT 'manual',
    cluster_id TEXT,
    cluster_title TEXT,
    rationale TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    pushed_at TEXT,
    closed_at TEXT,
    synced INTEGER NOT NULL DEFAULT 0,
    synced_at TEXT
  );`,

  `CREATE TABLE IF NOT EXISTS poll_response_cache (
    id TEXT PRIMARY KEY,
    poll_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    anonymous_id TEXT NOT NULL,
    option_index INTEGER NOT NULL,
    submitted_at TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0,
    synced_at TEXT
  );`,

  `CREATE TABLE IF NOT EXISTS summary_drafts (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL UNIQUE,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS session_summaries (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL UNIQUE,
    teacher_id TEXT,
    subject TEXT NOT NULL,
    topic TEXT NOT NULL,
    grade_class TEXT NOT NULL,
    duration INTEGER NOT NULL DEFAULT 0,
    participant_count INTEGER NOT NULL DEFAULT 0,
    recovery_score REAL NOT NULL DEFAULT 0,
    summary_source TEXT NOT NULL DEFAULT 'fallback',
    ai_narrative_summary TEXT,
    suggested_next_activity TEXT,
    voice_reflection_uri TEXT,
    voice_reflection_transcript TEXT,
    search_index TEXT,
    payload TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS weekly_insight_cache (
    cache_key TEXT PRIMARY KEY,
    teacher_id TEXT,
    range_preset TEXT NOT NULL DEFAULT 'custom',
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    summary_count INTEGER NOT NULL DEFAULT 0,
    source_updated_at TEXT,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS teacher_preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS voice_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS recent_sessions (
    id TEXT PRIMARY KEY,
    subject TEXT NOT NULL,
    topic TEXT NOT NULL,
    grade_class TEXT NOT NULL,
    status TEXT NOT NULL,
    participant_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    ended_at TEXT,
    confusion_index_avg REAL,
    synced INTEGER NOT NULL DEFAULT 0
  );`,

  // Indexes for common queries
  `CREATE INDEX IF NOT EXISTS idx_pulse_cache_session ON local_pulse_cache(session_id);`,
  `CREATE INDEX IF NOT EXISTS idx_pulse_events_session ON local_pulse_events(session_id);`,
  `CREATE INDEX IF NOT EXISTS idx_pulse_events_synced ON local_pulse_events(synced, session_id);`,
  `CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON pending_sync_jobs(status);`,
  `CREATE INDEX IF NOT EXISTS idx_sync_jobs_due ON pending_sync_jobs(status, next_attempt_at, created_at);`,
  `CREATE INDEX IF NOT EXISTS idx_sync_jobs_job_key ON pending_sync_jobs(job_key);`,
  `CREATE INDEX IF NOT EXISTS idx_lesson_markers_session ON lesson_markers(session_id);`,
  `CREATE INDEX IF NOT EXISTS idx_intervention_session ON intervention_history(session_id);`,
  `CREATE INDEX IF NOT EXISTS idx_cluster_session ON cluster_cache(session_id);`,
  `CREATE INDEX IF NOT EXISTS idx_question_session ON question_cache(session_id);`,
  `CREATE INDEX IF NOT EXISTS idx_poll_session ON poll_cache(session_id);`,
  `CREATE INDEX IF NOT EXISTS idx_poll_status ON poll_cache(status);`,
  `CREATE INDEX IF NOT EXISTS idx_poll_response_poll ON poll_response_cache(poll_id);`,
  `CREATE INDEX IF NOT EXISTS idx_poll_response_session ON poll_response_cache(session_id);`,
  `CREATE INDEX IF NOT EXISTS idx_session_summaries_created ON session_summaries(created_at);`,
  `CREATE INDEX IF NOT EXISTS idx_session_summaries_topic ON session_summaries(topic);`,
  `CREATE INDEX IF NOT EXISTS idx_recent_sessions_date ON recent_sessions(created_at);`,
  `CREATE INDEX IF NOT EXISTS idx_weekly_insight_cache_range ON weekly_insight_cache(start_date, end_date);`,
  `CREATE INDEX IF NOT EXISTS idx_weekly_insight_cache_teacher ON weekly_insight_cache(teacher_id);`,
];
