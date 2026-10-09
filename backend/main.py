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
from fastapi import FastAPI, HTTPException, Query, status
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
    )
    from backend.models import (
        QuestionCreate,
        QuestionUpdate,
        QuestionResponse,
        ExamSubmitRequest,
        ExamSubmitResponse,
        CategoryResult,
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
    )
    from models import (
        QuestionCreate,
        QuestionUpdate,
        QuestionResponse,
        ExamSubmitRequest,
        ExamSubmitResponse,
        CategoryResult,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize DB and seed initial exam questions if empty
    init_db()
    yield
    # Shutdown logic if any

app = FastAPI(
    title="ระบบจัดการคลังข้อสอบ ก.พ. ภาค ก.",
    description="API สำหรับคลังข้อสอบ ก.พ. ภาค ก. พร้อมระบบจำลองการสอบ นาฬิกาจับเวลา และเฉลยละเอียด",
    version="1.0.0",
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

# ----------------- EXAM CRUD APIs -----------------

@app.get("/api/exams", response_model=List[QuestionResponse], summary="ดึงรายการข้อสอบทั้งหมด (พร้อมฟิลเตอร์)")
def list_questions(
    year: Optional[str] = Query(None, description="กรองตามปีข้อสอบ เช่น 2565, 2566, 2567"),
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

@app.post("/api/exams", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED, summary="เพิ่มข้อสอบใหม่")
def add_question(payload: QuestionCreate):
    # Validate correct_answer index is within options range
    if payload.correct_answer < 0 or payload.correct_answer >= len(payload.options):
        raise HTTPException(
            status_code=400,
            detail=f"ดัชนีคำตอบที่ถูกต้อง ({payload.correct_answer}) อยู่นอกช่วงของตัวเลือกที่มี (0 ถึง {len(payload.options)-1})"
        )
    created = create_question(payload.model_dump())
    return created

@app.put("/api/exams/{question_id}", response_model=QuestionResponse, summary="แก้ไขข้อสอบ")
def edit_question(question_id: int, payload: QuestionUpdate):
    existing = get_question_by_id(question_id)
    if not existing:
        raise HTTPException(status_code=404, detail="ไม่พบข้อสอบที่ต้องการแก้ไข")

    data = payload.model_dump(exclude_unset=True)
    
    # If options or correct_answer updated, validate
    new_options = data.get("options", existing["options"])
    new_ans = data.get("correct_answer", existing["correct_answer"])
    if new_ans < 0 or new_ans >= len(new_options):
        raise HTTPException(
            status_code=400,
            detail=f"ดัชนีคำตอบที่ถูกต้อง ({new_ans}) อยู่นอกช่วงตัวเลือก (0 ถึง {len(new_options)-1})"
        )

    updated = update_question(question_id, data)
    return updated

@app.delete("/api/exams/{question_id}", summary="ลบข้อสอบ")
def remove_question(question_id: int):
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
def submit_exam(submission: ExamSubmitRequest):
    answers_map = {item.question_id: item.selected_option for item in submission.answers}
    question_ids = list(answers_map.keys())

    # Passing thresholds according to OCSC criteria
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

    # Calculate category results & passing status
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

    return ExamSubmitResponse(
        total_questions=total_questions,
        correct_count=correct_count,
        score_percentage=round(score_pct, 1),
        time_spent_seconds=submission.time_spent_seconds or 0,
        overall_passed=all_categories_passed and (total_questions > 0),
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

