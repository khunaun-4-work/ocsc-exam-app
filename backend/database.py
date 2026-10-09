import sqlite3
import json
import os
from datetime import datetime
from typing import List, Optional, Dict, Any

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "exams.db")
SEED_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed_data.json")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
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
    )
    """)
    conn.commit()

    # Check if empty, seed initial data
    cursor.execute("SELECT COUNT(*) FROM questions")
    count = cursor.fetchone()[0]
    if count == 0 and os.path.exists(SEED_PATH):
        try:
            with open(SEED_PATH, "r", encoding="utf-8") as f:
                seed_data = json.load(f)
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            for q in seed_data:
                cursor.execute("""
                INSERT INTO questions (year, category, tags, question_text, options, correct_answer, explanation, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    str(q["year"]),
                    q["category"],
                    q.get("tags", ""),
                    q["question_text"],
                    json.dumps(q["options"], ensure_ascii=False),
                    q["correct_answer"],
                    q["explanation"],
                    now
                ))
            conn.commit()
            print(f"[Database] Seeded {len(seed_data)} initial questions.")
        except Exception as e:
            print(f"[Database] Failed to seed initial data: {e}")

    conn.close()

def row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "year": str(row["year"]),
        "category": row["category"],
        "tags": row["tags"] or "",
        "question_text": row["question_text"],
        "options": json.loads(row["options"]),
        "correct_answer": row["correct_answer"],
        "explanation": row["explanation"],
        "created_at": row["created_at"]
    }

def get_questions(year: Optional[str] = None, category: Optional[str] = None, search: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    
    query = "SELECT * FROM questions WHERE 1=1"
    params = []

    if year and year.strip() and year != "all":
        query += " AND year = ?"
        params.append(year.strip())

    if category and category.strip() and category != "all":
        query += " AND category = ?"
        params.append(category.strip())

    if search and search.strip():
        query += " AND (question_text LIKE ? OR tags LIKE ? OR explanation LIKE ?)"
        term = f"%{search.strip()}%"
        params.extend([term, term, term])

    query += " ORDER BY id DESC"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [row_to_dict(r) for r in rows]

def get_question_by_id(question_id: int) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM questions WHERE id = ?", (question_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return row_to_dict(row)
    return None

def create_question(data: Dict[str, Any]) -> Dict[str, Any]:
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute("""
    INSERT INTO questions (year, category, tags, question_text, options, correct_answer, explanation, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        str(data["year"]),
        data["category"],
        data.get("tags", ""),
        data["question_text"],
        json.dumps(data["options"], ensure_ascii=False),
        data["correct_answer"],
        data["explanation"],
        now
    ))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return get_question_by_id(new_id)

def update_question(question_id: int, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    existing = get_question_by_id(question_id)
    if not existing:
        return None

    conn = get_connection()
    cursor = conn.cursor()

    fields = []
    params = []

    if "year" in data and data["year"] is not None:
        fields.append("year = ?")
        params.append(str(data["year"]))

    if "category" in data and data["category"] is not None:
        fields.append("category = ?")
        params.append(data["category"])

    if "tags" in data and data["tags"] is not None:
        fields.append("tags = ?")
        params.append(data["tags"])

    if "question_text" in data and data["question_text"] is not None:
        fields.append("question_text = ?")
        params.append(data["question_text"])

    if "options" in data and data["options"] is not None:
        fields.append("options = ?")
        params.append(json.dumps(data["options"], ensure_ascii=False))

    if "correct_answer" in data and data["correct_answer"] is not None:
        fields.append("correct_answer = ?")
        params.append(data["correct_answer"])

    if "explanation" in data and data["explanation"] is not None:
        fields.append("explanation = ?")
        params.append(data["explanation"])

    if not fields:
        conn.close()
        return existing

    params.append(question_id)
    sql = f"UPDATE questions SET {', '.join(fields)} WHERE id = ?"
    cursor.execute(sql, params)
    conn.commit()
    conn.close()

    return get_question_by_id(question_id)

def delete_question(question_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM questions WHERE id = ?", (question_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted

def get_distinct_years() -> List[str]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT year FROM questions ORDER BY year DESC")
    years = [str(r[0]) for r in cursor.fetchall() if r[0]]
    conn.close()
    return years

def get_distinct_categories() -> List[str]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT category FROM questions ORDER BY category ASC")
    cats = [str(r[0]) for r in cursor.fetchall() if r[0]]
    conn.close()
    return cats

def get_mock_questions(count: int = 10, year: Optional[str] = None, category: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    query = "SELECT * FROM questions WHERE 1=1"
    params = []
    if year and year != "all":
        query += " AND year = ?"
        params.append(year)
    if category and category != "all":
        query += " AND category = ?"
        params.append(category)

    query += " ORDER BY RANDOM() LIMIT ?"
    params.append(count)

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [row_to_dict(r) for r in rows]

def get_db_stats() -> Dict[str, Any]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM questions")
    total = cursor.fetchone()[0]

    cursor.execute("SELECT year, COUNT(*) FROM questions GROUP BY year ORDER BY year DESC")
    by_year = {str(r[0]): r[1] for r in cursor.fetchall()}

    cursor.execute("SELECT category, COUNT(*) FROM questions GROUP BY category ORDER BY COUNT(*) DESC")
    by_category = {str(r[0]): r[1] for r in cursor.fetchall()}

    conn.close()
    return {
        "total_questions": total,
        "by_year": by_year,
        "by_category": by_category
    }
