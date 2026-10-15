use crate::models::*;
use chrono::{Duration, Local};
use pbkdf2::pbkdf2_hmac;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rand::RngCore;
use rusqlite::{params, OptionalExtension, Row};
use sha2::Sha256;
use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::Path;

pub type DbPool = Pool<SqliteConnectionManager>;

pub fn init_pool(db_path: &str) -> DbPool {
    let manager = SqliteConnectionManager::file(db_path);
    Pool::builder()
        .max_size(16)
        .build(manager)
        .expect("Failed to create SQLite connection pool")
}

pub fn hash_password(password: &str, salt: Option<&str>) -> (String, String) {
    let salt_str = salt.map(|s| s.to_string()).unwrap_or_else(|| {
        let mut bytes = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut bytes);
        hex::encode(bytes)
    });
    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), salt_str.as_bytes(), 100_000, &mut key);
    (hex::encode(key), salt_str)
}

pub fn verify_password(password: &str, stored_hash: &str, salt: &str) -> bool {
    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), salt.as_bytes(), 100_000, &mut key);
    hex::encode(key) == stored_hash
}

pub fn init_db(pool: &DbPool, seed_path: &str) {
    let conn = pool.get().expect("Failed to get DB connection from pool");

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            year TEXT NOT NULL,
            category TEXT NOT NULL,
            tags TEXT DEFAULT '',
            question_text TEXT NOT NULL,
            options TEXT NOT NULL,
            correct_answer INTEGER NOT NULL,
            explanation TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            role TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        );

        CREATE TABLE IF NOT EXISTS exam_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            total_questions INTEGER NOT NULL,
            correct_count INTEGER NOT NULL,
            score_percentage REAL NOT NULL,
            overall_passed INTEGER NOT NULL,
            time_spent_seconds INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        );
        "#,
    )
    .expect("Failed to initialize database tables");

    // Seed questions if empty
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM questions", [], |r| r.get(0))
        .unwrap_or(0);

    if count == 0 && Path::new(seed_path).exists() {
        if let Ok(mut f) = File::open(seed_path) {
            let mut content = String::new();
            if f.read_to_string(&mut content).is_ok() {
                if let Ok(seeds) = serde_json::from_str::<Vec<QuestionCreate>>(&content) {
                    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
                    for q in &seeds {
                        let options_json =
                            serde_json::to_string(&q.options).unwrap_or_else(|_| "[]".to_string());
                        let _ = conn.execute(
                            "INSERT INTO questions (year, category, tags, question_text, options, correct_answer, explanation, created_at)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                            params![
                                q.year,
                                q.category,
                                q.tags,
                                q.question_text,
                                options_json,
                                q.correct_answer,
                                q.explanation,
                                now
                            ],
                        );
                    }
                    println!("[Database] Seeded {} initial questions.", seeds.len());
                }
            }
        }
    }

    // Ensure default admin user
    let admin_exists: bool = conn
        .query_row(
            "SELECT 1 FROM users WHERE username = 'admin'",
            [],
            |_| Ok(true),
        )
        .optional()
        .unwrap_or(None)
        .unwrap_or(false);

    let (pwd_hash, salt) = hash_password("0000", None);
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    if !admin_exists {
        let _ = conn.execute(
            "INSERT INTO users (username, password_hash, salt, role, created_at) VALUES (?1, ?2, ?3, 'admin', ?4)",
            params!["admin", pwd_hash, salt, now],
        );
        println!("[Database] Created default admin user (username: admin / password: 0000)");
    } else {
        let _ = conn.execute(
            "UPDATE users SET password_hash = ?1, salt = ?2, role = 'admin' WHERE username = 'admin'",
            params![pwd_hash, salt],
        );
        println!("[Database] Verified default admin user password.");
    }
}

// Helper: map row to Question
fn map_question_row(row: &Row) -> Result<Question, rusqlite::Error> {
    let id: i64 = row.get(0)?;
    let year: String = row.get(1)?;
    let category: String = row.get(2)?;
    let tags: String = row.get::<_, Option<String>>(3)?.unwrap_or_default();
    let question_text: String = row.get(4)?;
    let options_str: String = row.get(5)?;
    let correct_answer: i64 = row.get(6)?;
    let explanation: String = row.get(7)?;
    let created_at: String = row.get(8)?;

    let options: Vec<String> = serde_json::from_str(&options_str).unwrap_or_default();

    Ok(Question {
        id,
        year,
        category,
        tags,
        question_text,
        options,
        correct_answer,
        explanation,
        created_at,
    })
}

pub fn get_questions(
    pool: &DbPool,
    year: Option<&str>,
    category: Option<&str>,
    search: Option<&str>,
) -> Vec<Question> {
    let conn = pool.get().expect("DB connection");
    let mut sql = "SELECT id, year, category, tags, question_text, options, correct_answer, explanation, created_at FROM questions WHERE 1=1".to_string();

    if let Some(y) = year {
        if !y.is_empty() && y != "all" {
            sql.push_str(&format!(" AND year = '{}'", y.replace('\'', "''")));
        }
    }
    if let Some(c) = category {
        if !c.is_empty() && c != "all" {
            sql.push_str(&format!(" AND category = '{}'", c.replace('\'', "''")));
        }
    }
    if let Some(s) = search {
        if !s.trim().is_empty() {
            let escaped = s.trim().replace('\'', "''");
            sql.push_str(&format!(
                " AND (question_text LIKE '%{}%' OR tags LIKE '%{}%' OR explanation LIKE '%{}%')",
                escaped, escaped, escaped
            ));
        }
    }
    sql.push_str(" ORDER BY id DESC");

    let mut stmt = conn.prepare(&sql).expect("Prepare query");
    let rows = stmt.query_map([], map_question_row).expect("Query map");

    rows.filter_map(|r| r.ok()).collect()
}

pub fn get_question_by_id(pool: &DbPool, question_id: i64) -> Option<Question> {
    let conn = pool.get().ok()?;
    conn.query_row(
        "SELECT id, year, category, tags, question_text, options, correct_answer, explanation, created_at FROM questions WHERE id = ?1",
        params![question_id],
        map_question_row,
    )
    .optional()
    .unwrap_or(None)
}

pub fn create_question(pool: &DbPool, data: &QuestionCreate) -> Result<Question, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let options_json = serde_json::to_string(&data.options).unwrap_or_else(|_| "[]".to_string());

    conn.execute(
        "INSERT INTO questions (year, category, tags, question_text, options, correct_answer, explanation, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            data.year,
            data.category,
            data.tags,
            data.question_text,
            options_json,
            data.correct_answer,
            data.explanation,
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    let last_id = conn.last_insert_rowid();
    get_question_by_id(pool, last_id).ok_or_else(|| "Failed to retrieve created question".to_string())
}

pub fn update_question(
    pool: &DbPool,
    question_id: i64,
    data: &QuestionUpdate,
) -> Result<Question, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let existing =
        get_question_by_id(pool, question_id).ok_or_else(|| "Question not found".to_string())?;

    let new_year = data.year.as_ref().unwrap_or(&existing.year);
    let new_category = data.category.as_ref().unwrap_or(&existing.category);
    let new_tags = data.tags.as_ref().unwrap_or(&existing.tags);
    let new_text = data.question_text.as_ref().unwrap_or(&existing.question_text);
    let new_options = data.options.as_ref().unwrap_or(&existing.options);
    let new_ans = data.correct_answer.unwrap_or(existing.correct_answer);
    let new_exp = data.explanation.as_ref().unwrap_or(&existing.explanation);

    let options_json = serde_json::to_string(new_options).unwrap_or_else(|_| "[]".to_string());

    conn.execute(
        "UPDATE questions SET year = ?1, category = ?2, tags = ?3, question_text = ?4, options = ?5, correct_answer = ?6, explanation = ?7 WHERE id = ?8",
        params![
            new_year,
            new_category,
            new_tags,
            new_text,
            options_json,
            new_ans,
            new_exp,
            question_id
        ],
    )
    .map_err(|e| e.to_string())?;

    get_question_by_id(pool, question_id).ok_or_else(|| "Failed to retrieve updated question".to_string())
}

pub fn delete_question(pool: &DbPool, question_id: i64) -> bool {
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return false,
    };
    let rows = conn
        .execute("DELETE FROM questions WHERE id = ?1", params![question_id])
        .unwrap_or(0);
    rows > 0
}

pub fn get_distinct_years(pool: &DbPool) -> Vec<String> {
    let conn = pool.get().expect("DB connection");
    let mut stmt = conn
        .prepare("SELECT DISTINCT year FROM questions ORDER BY year DESC")
        .expect("Prepare");
    let rows = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .expect("Query map");
    rows.filter_map(|r| r.ok()).collect()
}

pub fn get_distinct_categories(pool: &DbPool) -> Vec<String> {
    let conn = pool.get().expect("DB connection");
    let mut stmt = conn
        .prepare("SELECT DISTINCT category FROM questions ORDER BY category ASC")
        .expect("Prepare");
    let rows = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .expect("Query map");
    rows.filter_map(|r| r.ok()).collect()
}

pub fn get_mock_questions(
    pool: &DbPool,
    count: usize,
    year: Option<&str>,
    category: Option<&str>,
) -> Vec<Question> {
    let conn = pool.get().expect("DB connection");
    let mut sql = "SELECT id, year, category, tags, question_text, options, correct_answer, explanation, created_at FROM questions WHERE 1=1".to_string();

    if let Some(y) = year {
        if !y.is_empty() && y != "all" {
            sql.push_str(&format!(" AND year = '{}'", y.replace('\'', "''")));
        }
    }
    if let Some(c) = category {
        if !c.is_empty() && c != "all" {
            sql.push_str(&format!(" AND category = '{}'", c.replace('\'', "''")));
        }
    }
    sql.push_str(&format!(" ORDER BY RANDOM() LIMIT {}", count));

    let mut stmt = conn.prepare(&sql).expect("Prepare query");
    let rows = stmt.query_map([], map_question_row).expect("Query map");

    rows.filter_map(|r| r.ok()).collect()
}

pub fn get_db_stats(pool: &DbPool) -> DbStats {
    let conn = pool.get().expect("DB connection");
    let total_questions: i64 = conn
        .query_row("SELECT COUNT(*) FROM questions", [], |r| r.get(0))
        .unwrap_or(0);

    let mut by_year = HashMap::new();
    let mut stmt_year = conn
        .prepare("SELECT year, COUNT(*) FROM questions GROUP BY year ORDER BY year DESC")
        .expect("Prepare");
    let year_rows = stmt_year
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
        .expect("Query");
    for r in year_rows.flatten() {
        by_year.insert(r.0, r.1);
    }

    let mut by_category = HashMap::new();
    let mut stmt_cat = conn
        .prepare("SELECT category, COUNT(*) FROM questions GROUP BY category ORDER BY COUNT(*) DESC")
        .expect("Prepare");
    let cat_rows = stmt_cat
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
        .expect("Query");
    for r in cat_rows.flatten() {
        by_category.insert(r.0, r.1);
    }

    DbStats {
        total_questions,
        by_year,
        by_category,
    }
}

// User & Auth Operations
pub fn create_user(pool: &DbPool, username: &str, password: &str) -> Option<User> {
    let conn = pool.get().ok()?;
    let (pwd_hash, salt) = hash_password(password, None);
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let res = conn.execute(
        "INSERT INTO users (username, password_hash, salt, role, created_at) VALUES (?1, ?2, ?3, 'user', ?4)",
        params![username, pwd_hash, salt, now],
    );

    if res.is_ok() {
        let id = conn.last_insert_rowid();
        Some(User {
            id,
            username: username.to_string(),
            role: "user".to_string(),
            created_at: now,
        })
    } else {
        None
    }
}

pub fn authenticate_user(pool: &DbPool, username: &str, password: &str) -> Option<User> {
    let conn = pool.get().ok()?;
    let row = conn
        .query_row(
            "SELECT id, username, password_hash, salt, role, created_at FROM users WHERE username = ?1",
            params![username],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, String>(5)?,
                ))
            },
        )
        .optional()
        .ok()?;

    if let Some((id, uname, stored_hash, salt, role, created_at)) = row {
        if verify_password(password, &stored_hash, &salt) {
            return Some(User {
                id,
                username: uname,
                role,
                created_at,
            });
        }
    }
    None
}

pub fn create_session(pool: &DbPool, user_id: i64, username: &str, role: &str) -> String {
    let conn = pool.get().expect("DB connection");
    let mut token_bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut token_bytes);
    let token = hex::encode(token_bytes);

    let expires_at = (Local::now() + Duration::days(7))
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();

    let _ = conn.execute(
        "INSERT INTO sessions (token, user_id, username, role, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![token, user_id, username, role, expires_at],
    );

    token
}

pub fn get_user_by_token(pool: &DbPool, token: &str) -> Option<User> {
    if token.is_empty() {
        return None;
    }
    let conn = pool.get().ok()?;
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    conn.query_row(
        "SELECT u.id, u.username, u.role, u.created_at
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.token = ?1 AND s.expires_at > ?2",
        params![token, now],
        |r| {
            Ok(User {
                id: r.get(0)?,
                username: r.get(1)?,
                role: r.get(2)?,
                created_at: r.get(3)?,
            })
        },
    )
    .optional()
    .unwrap_or(None)
}

pub fn delete_session(pool: &DbPool, token: &str) -> bool {
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return false,
    };
    let rows = conn
        .execute("DELETE FROM sessions WHERE token = ?1", params![token])
        .unwrap_or(0);
    rows > 0
}

pub fn record_exam_history(
    pool: &DbPool,
    user_id: i64,
    username: &str,
    total: i64,
    correct: i64,
    percentage: f64,
    passed: bool,
    time_spent: i64,
) {
    if let Ok(conn) = pool.get() {
        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let _ = conn.execute(
            "INSERT INTO exam_history (user_id, username, total_questions, correct_count, score_percentage, overall_passed, time_spent_seconds, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![user_id, username, total, correct, percentage, if passed { 1 } else { 0 }, time_spent, now],
        );
    }
}

pub fn get_exam_history_by_user(pool: &DbPool, user_id: i64) -> Vec<ExamHistoryItem> {
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    let mut stmt = match conn.prepare(
        "SELECT id, username, total_questions, correct_count, score_percentage, overall_passed, time_spent_seconds, created_at
         FROM exam_history WHERE user_id = ?1 ORDER BY id DESC LIMIT 20",
    ) {
        Ok(s) => s,
        Err(_) => return vec![],
    };

    let rows = stmt
        .query_map(params![user_id], |r| {
            Ok(ExamHistoryItem {
                id: r.get(0)?,
                username: r.get(1)?,
                total_questions: r.get(2)?,
                correct_count: r.get(3)?,
                score_percentage: r.get(4)?,
                overall_passed: r.get::<_, i64>(5)? == 1,
                time_spent_seconds: r.get(6)?,
                created_at: r.get(7)?,
            })
        })
        .ok();

    match rows {
        Some(iter) => iter.filter_map(|r| r.ok()).collect(),
        None => vec![],
    }
}
