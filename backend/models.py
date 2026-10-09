from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class QuestionBase(BaseModel):
    year: str = Field(..., description="ปีของข้อสอบ เช่น 2565, 2566, 2567, 2568, 2569")
    category: str = Field(..., description="หมวดหมู่วิชา เช่น ความสามารถในการคิดวิเคราะห์, ภาษาไทย, ภาษาอังกฤษ, ความรู้และลักษณะการเป็นข้าราชการที่ดี")
    tags: Optional[str] = Field("", description="แท็กหรือเรื่องย่อย เช่น อนุกรม, เงื่อนไขสัญลักษณ์, บทความ")
    question_text: str = Field(..., description="โจทย์ข้อสอบ")
    options: List[str] = Field(..., min_length=2, description="รายการตัวเลือกคำตอบ เช่น 4 ตัวเลือก")
    correct_answer: int = Field(..., ge=0, description="ดัชนีของคำตอบที่ถูกต้อง (0-indexed เช่น 0, 1, 2, 3)")
    explanation: str = Field(..., description="เฉลยและวิธีคิดอย่างละเอียดทีละขั้นตอน")

class QuestionCreate(QuestionBase):
    pass

class QuestionUpdate(BaseModel):
    year: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[str] = None
    question_text: Optional[str] = None
    options: Optional[List[str]] = None
    correct_answer: Optional[int] = None
    explanation: Optional[str] = None

class QuestionResponse(QuestionBase):
    id: int
    created_at: str

class AnswerSubmission(BaseModel):
    question_id: int
    selected_option: Optional[int] = None  # None if skipped

class ExamSubmitRequest(BaseModel):
    answers: List[AnswerSubmission]
    time_spent_seconds: Optional[int] = 0

class CategoryResult(BaseModel):
    category: str
    total: int
    correct: int
    percentage: float
    passing_threshold: float
    is_passed: bool

class ExamSubmitResponse(BaseModel):
    total_questions: int
    correct_count: int
    score_percentage: float
    time_spent_seconds: int
    overall_passed: bool
    categories: Dict[str, CategoryResult]
    review: List[Dict[str, Any]]

# --- User & Authentication Models ---
class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=30, description="ชื่อผู้ใช้งาน (3-30 ตัวอักษร)")
    password: str = Field(..., min_length=4, description="รหัสผ่านอย่างน้อย 4 ตัวอักษร")

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    created_at: str

class LoginResponse(BaseModel):
    token: str
    user: UserResponse
    message: str = "เข้าสู่ระบบสำเร็จ"

class ExamHistoryItem(BaseModel):
    id: int
    username: str
    total_questions: int
    correct_count: int
    score_percentage: float
    overall_passed: bool
    time_spent_seconds: int
    created_at: str
