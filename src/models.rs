use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Question {
    pub id: i64,
    pub year: String,
    pub category: String,
    pub tags: String,
    pub question_text: String,
    pub options: Vec<String>,
    pub correct_answer: i64,
    pub explanation: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionCreate {
    pub year: String,
    pub category: String,
    #[serde(default)]
    pub tags: String,
    pub question_text: String,
    pub options: Vec<String>,
    pub correct_answer: i64,
    pub explanation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionUpdate {
    pub year: Option<String>,
    pub category: Option<String>,
    pub tags: Option<String>,
    pub question_text: Option<String>,
    pub options: Option<Vec<String>>,
    pub correct_answer: Option<i64>,
    pub explanation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: i64,
    pub username: String,
    pub role: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UserAuthPayload {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub user: User,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExamHistoryItem {
    pub id: i64,
    pub username: String,
    pub total_questions: i64,
    pub correct_count: i64,
    pub score_percentage: f64,
    pub overall_passed: bool,
    pub time_spent_seconds: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnswerSubmission {
    pub question_id: i64,
    pub selected_option: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExamSubmitRequest {
    pub answers: Vec<AnswerSubmission>,
    pub time_spent_seconds: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryResult {
    pub category: String,
    pub total: i64,
    pub correct: i64,
    pub percentage: f64,
    pub passing_threshold: f64,
    pub is_passed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewItem {
    pub id: i64,
    pub year: String,
    pub category: String,
    pub tags: String,
    pub question_text: String,
    pub options: Vec<String>,
    pub selected_option: Option<i64>,
    pub correct_answer: i64,
    pub is_correct: bool,
    pub explanation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExamSubmitResponse {
    pub total_questions: usize,
    pub correct_count: usize,
    pub score_percentage: f64,
    pub time_spent_seconds: i64,
    pub overall_passed: bool,
    pub categories: HashMap<String, CategoryResult>,
    pub review: Vec<ReviewItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbStats {
    pub total_questions: i64,
    pub by_year: HashMap<String, i64>,
    pub by_category: HashMap<String, i64>,
}


