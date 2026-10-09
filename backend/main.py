import os
import sys

# เพิ่มโฟลเดอร์หลักของโปรเจกต์ลงใน sys.path อัตโนมัติ เพื่อให้ import ได้ทุกกรณี
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)
for p in [project_root, current_dir]:
    if p not in sys.path:
        sys.path.insert(0, p)

from contextlib import asynccontextmanager
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Query, Header, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

try:
    from backend.database import (
        init_db,
        get_questions,
        get_question_by_id,
        create_question,
        update_question,
        delete_question,
        get_distinct_years,
        get_distinct_categories,
        get_mock_questions,
        get_db_stats,
        create_user,
        authenticate_user,
        create_session,
        get_user_by_token,
        delete_session,
        record_exam_history,
        get_exam_history_by_user,
    )
    from backend.models import (
        QuestionCreate,
        QuestionUpdate,
        QuestionResponse,
        ExamSubmitRequest,
        ExamSubmitResponse,
        CategoryResult,
        UserRegister,
        UserLogin,
        UserResponse,
        LoginResponse,
        ExamHistoryItem,
    )
except ImportError:
    from database import (
        init_db,
        get_questions,
        get_question_by_id,
        create_question,
        update_question,
        delete_question,
        get_distinct_years,
        get_distinct_categories,
        get_mock_questions,
        get_db_stats,
        create_user,
        authenticate_user,
        create_session,
        get_user_by_token,
        delete_session,
        record_exam_history,
        get_exam_history_by_user,
    )
    from models import (
        QuestionCreate,
        QuestionUpdate,
        QuestionResponse,
        ExamSubmitRequest,
        ExamSubmitResponse,
        CategoryResult,
        UserRegister,
        UserLogin,
        UserResponse,
        LoginResponse,
        ExamHistoryItem,
    )

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize DB, seed questions, and default admin user if empty
    init_db()
    yield

app = FastAPI(
    title="ระบบจัดการคลังข้อสอบ ก.พ. ภาค ก.",
    description="API สำหรับคลังข้อสอบ ก.พ. ภาค ก. พร้อมระบบสมาชิก การจำลองสอบ และตรวจคะแนน",
    version="1.1.0",
    lifespan=lifespan
)

# Enable CORS for development flexibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- AUTHENTICATION HELPERS -----------------

def get_current_user_optional(authorization: Optional[str] = Header(None)) -> Optional[Dict[str, Any]]:
    if not authorization:
        return None
    token = authorization.replace("Bearer ", "").strip()
    return get_user_by_token(token)

def get_current_user_required(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not authorization:
        raise HTTPException(status_code=401, detail="กรุณาเข้าสู่ระบบก่อนทำรายการนี้")
    token = authorization.replace("Bearer ", "").strip()
    user = get_user_by_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง")
    return user

# ----------------- AUTHENTICATION APIs -----------------

@app.post("/api/auth/register", response_model=LoginResponse, summary="สมัครสมาชิกใหม่")
def register_user(payload: UserRegister):
    username = payload.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="กรุณากรอกชื่อผู้ใช้งาน")
    user = create_user(username, payload.password)
    if not user:
        raise HTTPException(status_code=400, detail="ชื่อผู้ใช้งานนี้มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น")
    token = create_session(user["id"], user["username"], user["role"])
    return LoginResponse(
        token=token,
        user=UserResponse(**user),
        message="สมัครสมาชิกและเข้าสู่ระบบสำเร็จ"
    )

@app.post("/api/auth/login", response_model=LoginResponse, summary="เข้าสู่ระบบ")
def login_user(payload: UserLogin):
    user = authenticate_user(payload.username.strip(), payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง")
    token = create_session(user["id"], user["username"], user["role"])
    return LoginResponse(
        token=token,
        user=UserResponse(**user),
        message="เข้าสู่ระบบสำเร็จ"
    )

@app.post("/api/auth/logout", summary="ออกจากระบบ")
def logout_user(authorization: Optional[str] = Header(None)):
    if authorization:
        token = authorization.replace("Bearer ", "").strip()
        delete_session(token)
    return {"message": "ออกจากระบบสำเร็จ"}

@app.get("/api/auth/me", response_model=UserResponse, summary="ดึงข้อมูลโปรไฟล์ผู้ใช้ปัจจุบัน")
def get_me(user: Dict[str, Any] = Depends(get_current_user_required)):
    return UserResponse(**user)

@app.get("/api/auth/history", response_model=List[ExamHistoryItem], summary="ดึงประวัติการสอบของผู้ใช้")
def get_history(user: Dict[str, Any] = Depends(get_current_user_required)):
    return get_exam_history_by_user(user["id"])

# ----------------- EXAM CRUD APIs -----------------

@app.get("/api/exams", response_model=List[QuestionResponse], summary="ดึงรายการข้อสอบทั้งหมด (พร้อมฟิลเตอร์)")
def list_questions(
    year: Optional[str] = Query(None, description="กรองตามปีข้อสอบ เช่น 2565, 2566, 2567, 2568, 2569"),
    category: Optional[str] = Query(None, description="กรองตามหมวดหมู่วิชา"),
    search: Optional[str] = Query(None, description="ค้นหาข้อความในโจทย์ แท็ก หรือคำอธิบาย")
):
    return get_questions(year=year, category=category, search=search)

@app.get("/api/exams/{question_id}", response_model=QuestionResponse, summary="ดึงข้อมูลข้อสอบรายข้อ")
def get_question(question_id: int):
    q = get_question_by_id(question_id)
    if not q:
        raise HTTPException(status_code=404, detail="ไม่พบข้อสอบที่ต้องการ")
    return q

@app.post("/api/exams", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED, summary="เพิ่มข้อสอบใหม่ (ต้องล็อกอิน)")
def add_question(payload: QuestionCreate, user: Dict[str, Any] = Depends(get_current_user_required)):
    if payload.correct_answer < 0 or payload.correct_answer >= len(payload.options):
        raise HTTPException(
            status_code=400,
            detail=f"ดัชนีคำตอบที่ถูกต้อง ({payload.correct_answer}) อยู่นอกช่วงของตัวเลือกที่มี (0 ถึง {len(payload.options)-1})"
        )
    created = create_question(payload.model_dump())
    return created

@app.put("/api/exams/{question_id}", response_model=QuestionResponse, summary="แก้ไขข้อสอบ (ต้องล็อกอิน)")
def edit_question(question_id: int, payload: QuestionUpdate, user: Dict[str, Any] = Depends(get_current_user_required)):
    existing = get_question_by_id(question_id)
    if not existing:
        raise HTTPException(status_code=404, detail="ไม่พบข้อสอบที่ต้องการแก้ไข")

    data = payload.model_dump(exclude_unset=True)
    new_options = data.get("options", existing["options"])
    new_ans = data.get("correct_answer", existing["correct_answer"])
    if new_ans < 0 or new_ans >= len(new_options):
        raise HTTPException(
            status_code=400,
            detail=f"ดัชนีคำตอบที่ถูกต้อง ({new_ans}) อยู่นอกช่วงตัวเลือก (0 ถึง {len(new_options)-1})"
        )

    updated = update_question(question_id, data)
    return updated

@app.delete("/api/exams/{question_id}", summary="ลบข้อสอบ (ต้องล็อกอิน)")
def remove_question(question_id: int, user: Dict[str, Any] = Depends(get_current_user_required)):
    success = delete_question(question_id)
    if not success:
        raise HTTPException(status_code=404, detail="ไม่พบข้อสอบที่ต้องการลบ")
    return {"message": "ลบข้อสอบสำเร็จ", "id": question_id}

# ----------------- METADATA & STATS APIs -----------------

@app.get("/api/exams/meta/years", summary="ดึงรายการปีของข้อสอบทั้งหมดที่มีในระบบ")
def get_years():
    return get_distinct_years()

@app.get("/api/exams/meta/categories", summary="ดึงรายการหมวดหมู่วิชาทั้งหมด")
def get_categories():
    return get_distinct_categories()

@app.get("/api/exams/meta/stats", summary="ดึงสถิติจำนวนข้อสอบ")
def get_stats():
    return get_db_stats()

# ----------------- MOCK EXAM & SUBMISSION -----------------

@app.get("/api/mock", response_model=List[QuestionResponse], summary="สุ่มข้อสอบสำหรับจำลองการสอบจริง")
def generate_mock_exam(
    count: int = Query(10, ge=1, le=100, description="จำนวนข้อที่ต้องการสุ่ม"),
    year: Optional[str] = Query(None, description="กรองเฉพาะปีที่กำหนด"),
    category: Optional[str] = Query(None, description="กรองเฉพาะวิชาที่กำหนด")
):
    questions = get_mock_questions(count=count, year=year, category=category)
    return questions

@app.post("/api/submit", response_model=ExamSubmitResponse, summary="ส่งคำตอบ ตรวจข้อสอบ และประเมินผลคะแนน")
def submit_exam(submission: ExamSubmitRequest, current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)):
    answers_map = {item.question_id: item.selected_option for item in submission.answers}
    question_ids = list(answers_map.keys())

    # เกณฑ์คะแนนขั้นต่ำของ ก.พ. แต่ละวิชา
    PASSING_THRESHOLDS = {
        "ความสามารถในการคิดวิเคราะห์": 60.0,
        "ภาษาไทย": 60.0,
        "ภาษาอังกฤษ": 50.0,
        "ความรู้และลักษณะการเป็นข้าราชการที่ดี": 60.0
    }
    DEFAULT_THRESHOLD = 60.0

    total_questions = len(question_ids)
    correct_count = 0
    categories_stat: Dict[str, Dict[str, Any]] = {}
    review_list = []

    for q_id in question_ids:
        q = get_question_by_id(q_id)
        if not q:
            continue

        selected = answers_map[q_id]
        is_correct = (selected is not None and selected == q["correct_answer"])
        if is_correct:
            correct_count += 1

        cat = q["category"]
        if cat not in categories_stat:
            categories_stat[cat] = {"total": 0, "correct": 0}
        categories_stat[cat]["total"] += 1
        if is_correct:
            categories_stat[cat]["correct"] += 1

        review_list.append({
            "id": q["id"],
            "year": q["year"],
            "category": q["category"],
            "tags": q["tags"],
            "question_text": q["question_text"],
            "options": q["options"],
            "selected_option": selected,
            "correct_answer": q["correct_answer"],
            "is_correct": is_correct,
            "explanation": q["explanation"]
        })

    categories_result: Dict[str, CategoryResult] = {}
    all_categories_passed = True

    for cat_name, stat in categories_stat.items():
        pct = (stat["correct"] / stat["total"] * 100.0) if stat["total"] > 0 else 0.0
        threshold = PASSING_THRESHOLDS.get(cat_name, DEFAULT_THRESHOLD)
        passed = pct >= threshold
        if not passed:
            all_categories_passed = False

        categories_result[cat_name] = CategoryResult(
            category=cat_name,
            total=stat["total"],
            correct=stat["correct"],
            percentage=round(pct, 1),
            passing_threshold=threshold,
            is_passed=passed
        )

    score_pct = (correct_count / total_questions * 100.0) if total_questions > 0 else 0.0
    overall_passed = all_categories_passed and (total_questions > 0)
    time_spent = submission.time_spent_seconds or 0

    # บันทึกประวัติการสอบลงฐานข้อมูลถ้าผู้ใช้ล็อกอินอยู่
    if current_user:
        record_exam_history(
            user_id=current_user["id"],
            username=current_user["username"],
            total=total_questions,
            correct=correct_count,
            percentage=round(score_pct, 1),
            passed=overall_passed,
            time_spent=time_spent
        )

    return ExamSubmitResponse(
        total_questions=total_questions,
        correct_count=correct_count,
        score_percentage=round(score_pct, 1),
        time_spent_seconds=time_spent,
        overall_passed=overall_passed,
        categories=categories_result,
        review=review_list
    )

# ----------------- STATIC FILES (FRONTEND) -----------------
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

    print("=================================================================")
    print("[SERVER] OCSC Exam Management System (FastAPI + SQLite)")
    print("[URL] Web Application: http://127.0.0.1:8000")
    print("[API] Swagger Docs:     http://127.0.0.1:8000/docs")
    print("=================================================================")
    uvicorn.run(app, host="127.0.0.1", port=8000)
