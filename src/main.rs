mod db;
mod models;

use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use db::DbPool;
use models::*;
use serde::Deserialize;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;

struct AppState {
    pool: DbPool,
}

type SharedState = Arc<AppState>;

#[derive(Debug, Deserialize)]
struct ExamFilterParams {
    year: Option<String>,
    category: Option<String>,
    search: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MockExamParams {
    count: Option<usize>,
    year: Option<String>,
    category: Option<String>,
}

// Auth Helper
fn extract_user(
    headers: &HeaderMap,
    pool: &DbPool,
) -> Result<User, (StatusCode, Json<serde_json::Value>)> {
    let auth_header = headers
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({ "detail": "กรุณาเข้าสู่ระบบก่อนทำรายการนี้" })),
            )
        })?;

    let token = auth_header.trim_start_matches("Bearer ").trim();
    db::get_user_by_token(pool, token).ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "detail": "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง" })),
        )
    })
}

fn require_admin(user: &User) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    if user.role != "admin" {
        return Err((
            StatusCode::FORBIDDEN,
            Json(
                serde_json::json!({ "detail": "เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถจัดการข้อสอบได้" }),
            ),
        ));
    }
    Ok(())
}

// --- Auth Endpoints ---
async fn register_handler(
    State(state): State<SharedState>,
    Json(payload): Json<UserAuthPayload>,
) -> Result<Json<LoginResponse>, (StatusCode, Json<serde_json::Value>)> {
    let username = payload.username.trim();
    if username.len() < 3 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "detail": "ชื่อผู้ใช้งานต้องมีอย่างน้อย 3 ตัวอักษร" })),
        ));
    }
    if payload.password.len() < 4 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "detail": "รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร" })),
        ));
    }

    let user = db::create_user(&state.pool, username, &payload.password).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "detail": "ชื่อผู้ใช้งานนี้มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น" })),
        )
    })?;

    let token = db::create_session(&state.pool, user.id, &user.username, &user.role);

    Ok(Json(LoginResponse {
        token,
        user,
        message: "สมัครสมาชิกและเข้าสู่ระบบสำเร็จ".to_string(),
    }))
}

async fn login_handler(
    State(state): State<SharedState>,
    Json(payload): Json<UserAuthPayload>,
) -> Result<Json<LoginResponse>, (StatusCode, Json<serde_json::Value>)> {
    let user = db::authenticate_user(&state.pool, payload.username.trim(), &payload.password)
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({ "detail": "ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง" })),
            )
        })?;

    let token = db::create_session(&state.pool, user.id, &user.username, &user.role);

    Ok(Json(LoginResponse {
        token,
        user,
        message: "เข้าสู่ระบบสำเร็จ".to_string(),
    }))
}

async fn logout_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Json<serde_json::Value> {
    if let Some(auth) = headers.get("authorization").and_then(|h| h.to_str().ok()) {
        let token = auth.trim_start_matches("Bearer ").trim();
        db::delete_session(&state.pool, token);
    }
    Json(serde_json::json!({ "message": "ออกจากระบบสำเร็จ" }))
}

async fn me_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<User>, (StatusCode, Json<serde_json::Value>)> {
    let user = extract_user(&headers, &state.pool)?;
    Ok(Json(user))
}

async fn history_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Vec<ExamHistoryItem>>, (StatusCode, Json<serde_json::Value>)> {
    let user = extract_user(&headers, &state.pool)?;
    let history = db::get_exam_history_by_user(&state.pool, user.id);
    Ok(Json(history))
}

// --- Exam CRUD Endpoints ---
async fn list_questions_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(params): Query<ExamFilterParams>,
) -> Result<Json<Vec<Question>>, (StatusCode, Json<serde_json::Value>)> {
    let _ = extract_user(&headers, &state.pool)?;
    let questions = db::get_questions(
        &state.pool,
        params.year.as_deref(),
        params.category.as_deref(),
        params.search.as_deref(),
    );
    Ok(Json(questions))
}

async fn get_question_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<Question>, (StatusCode, Json<serde_json::Value>)> {
    let _ = extract_user(&headers, &state.pool)?;
    let q = db::get_question_by_id(&state.pool, id).ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "detail": "ไม่พบข้อสอบที่ต้องการ" })),
        )
    })?;
    Ok(Json(q))
}

async fn add_question_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<QuestionCreate>,
) -> Result<(StatusCode, Json<Question>), (StatusCode, Json<serde_json::Value>)> {
    let user = extract_user(&headers, &state.pool)?;
    require_admin(&user)?;

    if payload.correct_answer < 0 || payload.correct_answer >= payload.options.len() as i64 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "detail": format!("ดัชนีคำตอบที่ถูกต้อง ({}) อยู่นอกช่วงตัวเลือก (0 ถึง {})", payload.correct_answer, payload.options.len() - 1)
            })),
        ));
    }

    let created = db::create_question(&state.pool, &payload).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "detail": e })),
        )
    })?;

    Ok((StatusCode::CREATED, Json(created)))
}

async fn edit_question_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<QuestionUpdate>,
) -> Result<Json<Question>, (StatusCode, Json<serde_json::Value>)> {
    let user = extract_user(&headers, &state.pool)?;
    require_admin(&user)?;

    let existing = db::get_question_by_id(&state.pool, id).ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "detail": "ไม่พบข้อสอบที่ต้องการแก้ไข" })),
        )
    })?;

    let effective_options = payload.options.as_ref().unwrap_or(&existing.options);
    let effective_ans = payload.correct_answer.unwrap_or(existing.correct_answer);

    if effective_ans < 0 || effective_ans >= effective_options.len() as i64 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "detail": format!("ดัชนีคำตอบที่ถูกต้อง ({}) อยู่นอกช่วงตัวเลือก (0 ถึง {})", effective_ans, effective_options.len() - 1)
            })),
        ));
    }

    let updated = db::update_question(&state.pool, id, &payload).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "detail": e })),
        )
    })?;

    Ok(Json(updated))
}

async fn delete_question_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let user = extract_user(&headers, &state.pool)?;
    require_admin(&user)?;

    let deleted = db::delete_question(&state.pool, id);
    if !deleted {
        return Err((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "detail": "ไม่พบข้อสอบที่ต้องการลบ" })),
        ));
    }

    Ok(Json(serde_json::json!({
        "message": "ลบข้อสอบสำเร็จ",
        "id": id
    })))
}

// --- Metadata Endpoints ---
async fn meta_years_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Vec<String>>, (StatusCode, Json<serde_json::Value>)> {
    let _ = extract_user(&headers, &state.pool)?;
    Ok(Json(db::get_distinct_years(&state.pool)))
}

async fn meta_categories_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Vec<String>>, (StatusCode, Json<serde_json::Value>)> {
    let _ = extract_user(&headers, &state.pool)?;
    Ok(Json(db::get_distinct_categories(&state.pool)))
}

async fn meta_stats_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<DbStats>, (StatusCode, Json<serde_json::Value>)> {
    let _ = extract_user(&headers, &state.pool)?;
    Ok(Json(db::get_db_stats(&state.pool)))
}

// --- Mock Exam & Scoring ---
async fn mock_exam_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(params): Query<MockExamParams>,
) -> Result<Json<Vec<Question>>, (StatusCode, Json<serde_json::Value>)> {
    let _ = extract_user(&headers, &state.pool)?;
    let count = params.count.unwrap_or(10).clamp(1, 100);
    let questions = db::get_mock_questions(
        &state.pool,
        count,
        params.year.as_deref(),
        params.category.as_deref(),
    );
    Ok(Json(questions))
}

async fn submit_exam_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<ExamSubmitRequest>,
) -> Result<Json<ExamSubmitResponse>, (StatusCode, Json<serde_json::Value>)> {
    let user = extract_user(&headers, &state.pool)?;

    let mut thresholds: HashMap<&str, f64> = HashMap::new();
    thresholds.insert("ความสามารถในการคิดวิเคราะห์", 60.0);
    thresholds.insert("ภาษาไทย", 60.0);
    thresholds.insert("ภาษาอังกฤษ", 50.0);
    thresholds.insert("ความรู้และลักษณะการเป็นข้าราชการที่ดี", 60.0);
    let default_threshold = 60.0;

    let mut answers_map: HashMap<i64, Option<i64>> = HashMap::new();
    for a in &payload.answers {
        answers_map.insert(a.question_id, a.selected_option);
    }

    let mut correct_count = 0;
    let mut cat_stats: HashMap<String, (i64, i64)> = HashMap::new(); // total, correct
    let mut review_list: Vec<ReviewItem> = Vec::new();

    for a in &payload.answers {
        if let Some(q) = db::get_question_by_id(&state.pool, a.question_id) {
            let is_correct = match a.selected_option {
                Some(sel) => sel == q.correct_answer,
                None => false,
            };
            if is_correct {
                correct_count += 1;
            }

            let entry = cat_stats.entry(q.category.clone()).or_insert((0, 0));
            entry.0 += 1;
            if is_correct {
                entry.1 += 1;
            }

            review_list.push(ReviewItem {
                id: q.id,
                year: q.year,
                category: q.category,
                tags: q.tags,
                question_text: q.question_text,
                options: q.options,
                selected_option: a.selected_option,
                correct_answer: q.correct_answer,
                is_correct,
                explanation: q.explanation,
            });
        }
    }

    let total_questions = review_list.len();
    let mut all_categories_passed = true;
    let mut categories_result: HashMap<String, CategoryResult> = HashMap::new();

    for (cat_name, (tot, corr)) in cat_stats {
        let pct = if tot > 0 {
            (corr as f64 / tot as f64) * 100.0
        } else {
            0.0
        };
        let threshold = *thresholds.get(cat_name.as_str()).unwrap_or(&default_threshold);
        let passed = pct >= threshold;
        if !passed {
            all_categories_passed = false;
        }

        categories_result.insert(
            cat_name.clone(),
            CategoryResult {
                category: cat_name,
                total: tot,
                correct: corr,
                percentage: (pct * 10.0).round() / 10.0,
                passing_threshold: threshold,
                is_passed: passed,
            },
        );
    }

    let score_percentage = if total_questions > 0 {
        ((correct_count as f64 / total_questions as f64) * 100.0 * 10.0).round() / 10.0
    } else {
        0.0
    };
    let overall_passed = all_categories_passed && (total_questions > 0);
    let time_spent = payload.time_spent_seconds.unwrap_or(0);

    db::record_exam_history(
        &state.pool,
        user.id,
        &user.username,
        total_questions as i64,
        correct_count as i64,
        score_percentage,
        overall_passed,
        time_spent,
    );

    Ok(Json(ExamSubmitResponse {
        total_questions,
        correct_count,
        score_percentage,
        time_spent_seconds: time_spent,
        overall_passed,
        categories: categories_result,
        review: review_list,
    }))
}

#[tokio::main]
async fn main() {
    let exe_dir = std::env::current_dir().expect("Failed to get current directory");
    let db_path = exe_dir.join("exams.db");
    let seed_path = exe_dir.join("seed_data.json");
    let frontend_dir = exe_dir.join("frontend");

    println!("=================================================================");
    println!("[SERVER] OCSC Exam Management System (Rust + Axum + SQLite)");
    println!("[DB] Path: {:?}", db_path);
    println!("[FRONTEND] Directory: {:?}", frontend_dir);

    let pool = db::init_pool(db_path.to_str().unwrap());
    db::init_db(&pool, seed_path.to_str().unwrap());

    let shared_state = Arc::new(AppState { pool });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let api_router = Router::new()
        .route("/api/auth/register", post(register_handler))
        .route("/api/auth/login", post(login_handler))
        .route("/api/auth/logout", post(logout_handler))
        .route("/api/auth/me", get(me_handler))
        .route("/api/auth/history", get(history_handler))
        .route("/api/exams", get(list_questions_handler).post(add_question_handler))
        .route(
            "/api/exams/{id}",
            get(get_question_handler)
                .put(edit_question_handler)
                .delete(delete_question_handler),
        )
        .route("/api/exams/meta/years", get(meta_years_handler))
        .route("/api/exams/meta/categories", get(meta_categories_handler))
        .route("/api/exams/meta/stats", get(meta_stats_handler))
        .route("/api/mock", get(mock_exam_handler))
        .route("/api/submit", post(submit_exam_handler))
        .with_state(shared_state);

    let app = api_router
        .fallback_service(ServeDir::new(frontend_dir))
        .layer(cors);

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8000);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("[URL] Web Application: http://0.0.0.0:{} (or http://localhost:{})", port, port);
    println!("=================================================================");

    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("\n❌ [ERROR] ไม่สามารถเปิดพอร์ต {} ได้ ({})", port, e);
            eprintln!("💡 สาเหตุ: พอร์ต {} กำลังถูกใช้งานโดยโปรแกรมอื่นอยู่แล้ว (เช่น เซิร์ฟเวอร์เดิมที่ยังเปิดค้างไว้)", port);
            eprintln!("👉 วิธีแก้ปัญหา:");
            eprintln!("   1. ปิดโปรแกรมหรือหน้าต่าง CMD อื่นที่กำลังรันเซิร์ฟเวอร์อยู่");
            eprintln!("   2. หรือเปลี่ยนไปใช้พอร์ตอื่น เช่น: set PORT=8080 && cargo run\n");
            std::process::exit(1);
        }
    };

    if let Err(e) = axum::serve(listener, app).await {
        eprintln!("❌ [Server Error] {}", e);
    }
}
