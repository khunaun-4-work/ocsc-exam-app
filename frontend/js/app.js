/**
 * ระบบจัดการคลังข้อสอบ ก.พ. ภาค ก. (Frontend Application Logic)
 */

// Global State
const state = {
  currentTab: 'tab-browse',
  questions: [],
  metaYears: [],
  metaCategories: [],
  mockSession: {
    active: false,
    questions: [],
    currentIndex: 0,
    answers: {}, // questionId: selectedIndex
    totalSeconds: 0,
    remainingSeconds: 0,
    timerInterval: null
  },
  deleteTargetId: null,
  authToken: localStorage.getItem('ocsc_token') || null,
  currentUser: null,
  authMode: 'login' // 'login' or 'register'
};

// Category Badge Helper
function getCategoryBadgeClass(category) {
  if (category.includes('คิดวิเคราะห์') || category.includes('คณิตศาสตร์')) return 'badge-cat-math';
  if (category.includes('ไทย')) return 'badge-cat-thai';
  if (category.includes('อังกฤษ')) return 'badge-cat-eng';
  if (category.includes('ข้าราชการ') || category.includes('กฎหมาย')) return 'badge-cat-law';
  return 'badge-info';
}

// Toast Notification
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  let icon = '✅';
  if (type === 'error') icon = '❌';
  if (type === 'info') icon = 'ℹ️';

  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Auth Headers Helper
function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (state.authToken) {
    headers['Authorization'] = `Bearer ${state.authToken}`;
  }
  return headers;
}

// ==========================================
// API Calls
// ==========================================
async function apiGetQuestions(params = {}) {
  const query = new URLSearchParams();
  if (params.year && params.year !== 'all') query.append('year', params.year);
  if (params.category && params.category !== 'all') query.append('category', params.category);
  if (params.search && params.search.trim()) query.append('search', params.search.trim());

  const res = await fetch(`/api/exams?${query.toString()}`);
  if (!res.ok) throw new Error('ไม่สามารถดึงข้อมูลข้อสอบได้');
  return await res.json();
}

async function apiGetYears() {
  const res = await fetch('/api/exams/meta/years');
  return await res.json();
}

async function apiGetQuestionById(id) {
  const res = await fetch(`/api/exams/${id}`);
  if (!res.ok) throw new Error('ไม่พบข้อมูลข้อสอบ');
  return await res.json();
}

async function apiCreateQuestion(payload) {
  const res = await fetch('/api/exams', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'เกิดข้อผิดพลาดในการเพิ่มข้อสอบ');
  }
  return await res.json();
}

async function apiUpdateQuestion(id, payload) {
  const res = await fetch(`/api/exams/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'เกิดข้อผิดพลาดในการแก้ไขข้อสอบ');
  }
  return await res.json();
}

async function apiDeleteQuestion(id) {
  const res = await fetch(`/api/exams/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'ไม่สามารถลบข้อสอบได้');
  }
  return await res.json();
}

async function apiGetMockExam(count, year, category) {
  const query = new URLSearchParams();
  query.append('count', count);
  if (year && year !== 'all') query.append('year', year);
  if (category && category !== 'all') query.append('category', category);

  const res = await fetch(`/api/mock?${query.toString()}`);
  if (!res.ok) throw new Error('ไม่สามารถสุ่มข้อสอบได้');
  return await res.json();
}

async function apiSubmitExam(answers, timeSpent) {
  const payload = {
    answers: answers,
    time_spent_seconds: timeSpent
  };
  const res = await fetch('/api/submit', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('ไม่สามารถประเมินผลคะแนนได้');
  return await res.json();
}

// Authentication API Calls
async function apiLogin(username, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }
  return await res.json();
}

async function apiRegister(username, password) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'สมัครสมาชิกไม่สำเร็จ');
  }
  return await res.json();
}

async function apiLogout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: getAuthHeaders()
    });
  } catch (e) {}
}

async function apiGetMe() {
  if (!state.authToken) return null;
  const res = await fetch('/api/auth/me', {
    headers: getAuthHeaders()
  });
  if (!res.ok) return null;
  return await res.json();
}

async function apiGetExamHistory() {
  const res = await fetch('/api/auth/history', {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('ไม่สามารถดึงประวัติการสอบได้');
  return await res.json();
}

// ==========================================
// Initialization & Navigation
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initNavigation();
  initAuthUI();
  initFormListeners();
  initFilterListeners();
  initMockControls();
  initModalListeners();

  await checkUserSession();
  await loadMetaFilters();
  await loadBrowseQuestions();
});

function initTheme() {
  const toggleBtn = document.getElementById('themeToggleBtn');
  const themeIcon = document.getElementById('themeIcon');
  if (!toggleBtn || !themeIcon) return;

  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);

  if (isDark) {
    document.body.classList.add('dark-mode');
    themeIcon.textContent = '☀️';
    toggleBtn.title = 'เปลี่ยนเป็นโหมดสว่าง (Light Mode)';
  } else {
    document.body.classList.remove('dark-mode');
    themeIcon.textContent = '🌙';
    toggleBtn.title = 'เปลี่ยนเป็นโหมดมืด (Dark Mode)';
  }

  toggleBtn.addEventListener('click', () => {
    const isNowDark = document.body.classList.toggle('dark-mode');
    if (isNowDark) {
      themeIcon.textContent = '☀️';
      toggleBtn.title = 'เปลี่ยนเป็นโหมดสว่าง (Light Mode)';
      localStorage.setItem('theme', 'dark');
      showToast('เปิดใช้งานโหมดมืด (Dark Mode)', 'info');
    } else {
      themeIcon.textContent = '🌙';
      toggleBtn.title = 'เปลี่ยนเป็นโหมดมืด (Dark Mode)';
      localStorage.setItem('theme', 'light');
      showToast('เปิดใช้งานโหมดสว่าง (Light Mode)', 'info');
    }
  });
}

function initNavigation() {
  const navButtons = document.querySelectorAll('.nav-btn');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });
}

function switchTab(tabId) {
  state.currentTab = tabId;
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
  });
  document.querySelectorAll('.tab-content').forEach(section => {
    section.classList.toggle('active', section.id === tabId);
  });

  if (tabId === 'tab-browse') {
    loadBrowseQuestions();
  } else if (tabId === 'tab-admin') {
    checkAdminAccess();
  }
}

// ==========================================
// Authentication UI Logic
// ==========================================
async function checkUserSession() {
  if (state.authToken) {
    try {
      const user = await apiGetMe();
      if (user) {
        state.currentUser = user;
        updateAuthHeaderUI();
      } else {
        // Token expired
        state.authToken = null;
        state.currentUser = null;
        localStorage.removeItem('ocsc_token');
        updateAuthHeaderUI();
      }
    } catch (e) {
      state.authToken = null;
      state.currentUser = null;
      localStorage.removeItem('ocsc_token');
      updateAuthHeaderUI();
    }
  } else {
    updateAuthHeaderUI();
  }
}

function updateAuthHeaderUI() {
  const btnLogin = document.getElementById('btnLoginModal');
  const badge = document.getElementById('userProfileBadge');
  const nameDisplay = document.getElementById('userNameDisplay');

  if (state.currentUser) {
    btnLogin.classList.add('hidden');
    badge.classList.remove('hidden');
    nameDisplay.textContent = state.currentUser.username;
  } else {
    btnLogin.classList.remove('hidden');
    badge.classList.add('hidden');
  }

  // If currently on admin tab, update access
  if (state.currentTab === 'tab-admin') {
    checkAdminAccess();
  }
}

function checkAdminAccess() {
  const lockedNotice = document.getElementById('adminLockedNotice');
  const contentArea = document.getElementById('adminContentArea');
  if (!lockedNotice || !contentArea) return;

  if (state.currentUser) {
    lockedNotice.classList.add('hidden');
    contentArea.classList.remove('hidden');
    loadAdminTable();
  } else {
    lockedNotice.classList.remove('hidden');
    contentArea.classList.add('hidden');
  }
}

function initAuthUI() {
  const btnLoginModal = document.getElementById('btnLoginModal');
  const btnLockLoginPrompt = document.getElementById('btnLockLoginPrompt');
  const authModal = document.getElementById('authModal');
  const btnCloseAuth = document.getElementById('btnCloseAuthModal');
  const btnCancelAuth = document.getElementById('btnCancelAuth');
  const tabLogin = document.getElementById('tabAuthLogin');
  const tabRegister = document.getElementById('tabAuthRegister');
  const authForm = document.getElementById('authForm');
  const btnSubmitAuth = document.getElementById('btnSubmitAuth');
  const demoHint = document.getElementById('authDemoHint');
  const btnLogout = document.getElementById('btnLogout');
  const btnHistory = document.getElementById('btnHistoryModal');
  const historyModal = document.getElementById('historyModal');
  const btnCloseHistory = document.getElementById('btnCloseHistoryModal');

  const openAuth = (mode = 'login') => {
    state.authMode = mode;
    authModal.classList.remove('hidden');
    tabLogin.classList.toggle('active', mode === 'login');
    tabRegister.classList.toggle('active', mode === 'register');
    btnSubmitAuth.textContent = mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก';
    demoHint.style.display = mode === 'login' ? 'block' : 'none';
  };

  const closeAuth = () => {
    authModal.classList.add('hidden');
    authForm.reset();
  };

  if (btnLoginModal) btnLoginModal.addEventListener('click', () => openAuth('login'));
  if (btnLockLoginPrompt) btnLockLoginPrompt.addEventListener('click', () => openAuth('login'));
  if (btnCloseAuth) btnCloseAuth.addEventListener('click', closeAuth);
  if (btnCancelAuth) btnCancelAuth.addEventListener('click', closeAuth);

  tabLogin.addEventListener('click', () => openAuth('login'));
  tabRegister.addEventListener('click', () => openAuth('register'));

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('authUsername').value.trim();
    const p = document.getElementById('authPassword').value.trim();

    try {
      let res;
      if (state.authMode === 'login') {
        res = await apiLogin(u, p);
        showToast(`ยินดีต้อนรับคุณ ${res.user.username}!`, 'success');
      } else {
        res = await apiRegister(u, p);
        showToast(`สมัครสมาชิกสำเร็จ! ยินดีต้อนรับคุณ ${res.user.username}`, 'success');
      }

      state.authToken = res.token;
      state.currentUser = res.user;
      localStorage.setItem('ocsc_token', res.token);
      updateAuthHeaderUI();
      closeAuth();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      await apiLogout();
      state.authToken = null;
      state.currentUser = null;
      localStorage.removeItem('ocsc_token');
      updateAuthHeaderUI();
      showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
    });
  }

  // History Modal handlers
  if (btnHistory) {
    btnHistory.addEventListener('click', async () => {
      await openHistoryModal();
    });
  }
  if (btnCloseHistory) {
    btnCloseHistory.addEventListener('click', () => {
      historyModal.classList.add('hidden');
    });
  }
}

async function openHistoryModal() {
  const modal = document.getElementById('historyModal');
  const container = document.getElementById('historyContainer');
  modal.classList.remove('hidden');

  try {
    const list = await apiGetExamHistory();
    if (!list || list.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 2.5rem 1rem;">
          <p style="font-size: 2.5rem; margin-bottom: 0.5rem;">📝</p>
          <p style="font-weight: 600;">ยังไม่มีประวัติการทำข้อสอบ</p>
          <p style="font-size: 0.85rem;">ลองไปที่แท็บ 'จำลองการสอบจริง' แล้วทำข้อสอบเพื่อบันทึกสถิติของคุณ!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = list.map(item => {
      const mins = Math.floor(item.time_spent_seconds / 60);
      const secs = item.time_spent_seconds % 60;
      const timeStr = `${mins} น. ${secs} ว.`;
      const badge = item.overall_passed 
        ? `<span class="history-badge-pass">✅ ผ่านเกณฑ์ ก.พ.</span>`
        : `<span class="history-badge-fail">❌ ยังไม่ผ่าน</span>`;

      return `
        <div class="history-item">
          <div class="history-item-left">
            <span class="history-date">📅 ${escapeHtml(item.created_at)}</span>
            <div class="history-stats">
              คะแนน: <strong>${item.correct_count}/${item.total_questions}</strong> ข้อ (${item.score_percentage}%)
            </div>
            <span style="font-size: 0.8rem; color: var(--text-muted);">⏱️ ใช้เวลา: ${timeStr}</span>
          </div>
          <div>
            ${badge}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Populate year dropdowns in filter and mock views
async function loadMetaFilters() {
  try {
    state.metaYears = await apiGetYears();
    const filterYear = document.getElementById('filterYear');
    const mockYear = document.getElementById('mockYearSelect');

    const renderYearOptions = (selectEl) => {
      const currentVal = selectEl.value;
      let html = '<option value="all">ทุกปีการสอบ</option>';
      state.metaYears.forEach(yr => {
        html += `<option value="${yr}">ข้อสอบปี ${yr}</option>`;
      });
      selectEl.innerHTML = html;
      selectEl.value = currentVal || 'all';
    };

    if (filterYear) renderYearOptions(filterYear);
    if (mockYear) renderYearOptions(mockYear);
  } catch (err) {
    console.error('Error loading years:', err);
  }
}

// ==========================================
// TAB 1: BROWSE & PRACTICE
// ==========================================
async function loadBrowseQuestions() {
  const year = document.getElementById('filterYear').value;
  const category = document.getElementById('filterCategory').value;
  const search = document.getElementById('filterSearch').value;

  try {
    const list = await apiGetQuestions({ year, category, search });
    state.questions = list;
    renderBrowseQuestions(list);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderBrowseQuestions(list) {
  const container = document.getElementById('questionList');
  const countBadge = document.getElementById('browseCountBadge');
  countBadge.textContent = `พบ ${list.length} ข้อ`;

  if (!list || list.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
        <p style="font-size: 2.5rem; margin-bottom: 0.5rem;">🔍</p>
        <p style="font-size: 1.1rem; font-weight: 600;">ไม่พบข้อสอบที่ตรงกับเงื่อนไข</p>
        <p style="font-size: 0.9rem;">ลองเปลี่ยนตัวกรอง หรือเพิ่มข้อสอบใหม่ในแท็บ 'จัดการข้อสอบ'</p>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map((q, idx) => {
    const catBadgeClass = getCategoryBadgeClass(q.category);
    const tagsHtml = q.tags ? q.tags.split(',').map(t => `<span class="badge badge-tag">#${t.trim()}</span>`).join(' ') : '';

    const optionsHtml = q.options.map((opt, optIdx) => `
      <div class="q-option-item" data-qid="${q.id}" data-optidx="${optIdx}" onclick="handlePracticeOptionClick(${q.id}, ${optIdx}, ${q.correct_answer})">
        <span class="opt-index">${optIdx + 1}</span>
        <span>${escapeHtml(opt)}</span>
      </div>
    `).join('');

    return `
      <div class="q-card" id="qcard-${q.id}">
        <div class="q-card-header">
          <div class="q-badges">
            <span class="q-num">#${idx + 1}</span>
            <span class="badge badge-year">ปี ${escapeHtml(q.year)}</span>
            <span class="badge ${catBadgeClass}">${escapeHtml(q.category)}</span>
            ${tagsHtml}
          </div>
          <div>
            <button class="btn btn-secondary btn-sm" onclick="toggleExplanation(${q.id})">
              💡 ดูเฉลยและวิธีคิด
            </button>
          </div>
        </div>

        <div class="q-text">${escapeHtml(q.question_text)}</div>

        <div class="q-options-list" id="opts-${q.id}">
          ${optionsHtml}
        </div>

        <div class="q-explanation-box hidden" id="exp-${q.id}">
          <strong>💡 เฉลยและขั้นตอนการวิเคราะห์ (คำตอบที่ถูกต้องคือ ข้อ ${q.correct_answer + 1}):</strong>
          <div>${escapeHtml(q.explanation)}</div>
        </div>
      </div>
    `;
  }).join('');
}

// Option selection in Practice mode
window.handlePracticeOptionClick = function(qid, selectedIdx, correctIdx) {
  const optContainer = document.getElementById(`opts-${qid}`);
  if (!optContainer) return;

  const items = optContainer.querySelectorAll('.q-option-item');
  items.forEach(it => it.classList.remove('selected'));

  const chosenItem = items[selectedIdx];
  if (chosenItem) chosenItem.classList.add('selected');
};

// Toggle Explanation in Practice mode
window.toggleExplanation = function(qid) {
  const expBox = document.getElementById(`exp-${qid}`);
  const optContainer = document.getElementById(`opts-${qid}`);
  if (!expBox) return;

  const isHidden = expBox.classList.contains('hidden');
  if (isHidden) {
    expBox.classList.remove('hidden');
    // Reveal correct option highlight
    const q = state.questions.find(item => item.id === qid);
    if (q && optContainer) {
      const items = optContainer.querySelectorAll('.q-option-item');
      items.forEach((it, idx) => {
        if (idx === q.correct_answer) {
          it.classList.add('revealed-correct');
        }
      });
    }
  } else {
    expBox.classList.add('hidden');
    // Remove highlights
    if (optContainer) {
      const items = optContainer.querySelectorAll('.q-option-item');
      items.forEach(it => it.classList.remove('revealed-correct'));
    }
  }
};

function initFilterListeners() {
  const filterYear = document.getElementById('filterYear');
  const filterCat = document.getElementById('filterCategory');
  const filterSearch = document.getElementById('filterSearch');
  const btnReset = document.getElementById('btnResetFilter');

  filterYear.addEventListener('change', loadBrowseQuestions);
  filterCat.addEventListener('change', loadBrowseQuestions);
  
  let debounceTimeout = null;
  filterSearch.addEventListener('input', () => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(loadBrowseQuestions, 300);
  });

  btnReset.addEventListener('click', () => {
    filterYear.value = 'all';
    filterCat.value = 'all';
    filterSearch.value = '';
    loadBrowseQuestions();
  });
}

// ==========================================
// TAB 2: MOCK EXAM & TIMER
// ==========================================
function initMockControls() {
  const btnStartMock = document.getElementById('btnStartMock');
  const btnPrev = document.getElementById('btnPrevQuestion');
  const btnNext = document.getElementById('btnNextQuestion');
  const btnSubmitMockTop = document.getElementById('btnSubmitMockTop');

  btnStartMock.addEventListener('click', startMockExam);
  btnPrev.addEventListener('click', () => navigateMockQuestion(-1));
  btnNext.addEventListener('click', () => navigateMockQuestion(1));
  btnSubmitMockTop.addEventListener('click', confirmSubmitMockExam);
}

async function startMockExam() {
  const year = document.getElementById('mockYearSelect').value;
  const category = document.getElementById('mockCategorySelect').value;
  const count = parseInt(document.getElementById('mockCountSelect').value, 10);
  const minutes = parseInt(document.getElementById('mockTimeSelect').value, 10);

  try {
    const questions = await apiGetMockExam(count, year, category);
    if (!questions || questions.length === 0) {
      showToast('ไม่พบข้อสอบตามเงื่อนไขที่เลือก กรุณาปรับเงื่อนไขใหม่', 'error');
      return;
    }

    // Initialize mock session
    state.mockSession.active = true;
    state.mockSession.questions = questions;
    state.mockSession.currentIndex = 0;
    state.mockSession.answers = {};
    state.mockSession.totalSeconds = minutes * 60;
    state.mockSession.remainingSeconds = minutes * 60;

    // View Switching
    document.getElementById('mockSetupView').classList.add('hidden');
    document.getElementById('mockResultView').classList.add('hidden');
    document.getElementById('mockActiveView').classList.remove('hidden');

    startTimer();
    renderMockQuestionDots();
    renderCurrentMockQuestion();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function startTimer() {
  if (state.mockSession.timerInterval) {
    clearInterval(state.mockSession.timerInterval);
  }

  updateTimerDisplay();

  state.mockSession.timerInterval = setInterval(() => {
    if (state.mockSession.remainingSeconds > 0) {
      state.mockSession.remainingSeconds -= 1;
      updateTimerDisplay();
    } else {
      clearInterval(state.mockSession.timerInterval);
      showToast('⏰ หมดเวลาการสอบแล้ว! ระบบกำลังส่งข้อสอบอัตโนมัติ...', 'info');
      finishMockExam();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const clock = document.getElementById('timerClock');
  const pBar = document.getElementById('timerProgressBar');
  const rem = state.mockSession.remainingSeconds;
  const tot = state.mockSession.totalSeconds;

  const mins = Math.floor(rem / 60);
  const secs = rem % 60;
  clock.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const pct = (rem / tot) * 100;
  pBar.style.width = `${pct}%`;

  // Warning when less than 2 minutes (or 20% remaining)
  if (rem <= 120 || pct <= 20) {
    clock.classList.add('warning');
    pBar.style.backgroundColor = 'var(--danger)';
  } else {
    clock.classList.remove('warning');
    pBar.style.backgroundColor = 'var(--primary)';
  }
}

function renderMockQuestionDots() {
  const grid = document.getElementById('qNavGrid');

  grid.innerHTML = state.mockSession.questions.map((q, idx) => {
    const isAnswered = state.mockSession.answers[q.id] !== undefined;
    const isActive = idx === state.mockSession.currentIndex;
    let cls = 'q-dot';
    if (isAnswered) cls += ' answered';
    if (isActive) cls += ' active';

    return `<div class="${cls}" onclick="jumpToMockQuestion(${idx})">${idx + 1}</div>`;
  }).join('');
}

window.jumpToMockQuestion = function(idx) {
  state.mockSession.currentIndex = idx;
  renderMockQuestionDots();
  renderCurrentMockQuestion();
};

function navigateMockQuestion(delta) {
  const newIndex = state.mockSession.currentIndex + delta;
  if (newIndex >= 0 && newIndex < state.mockSession.questions.length) {
    state.mockSession.currentIndex = newIndex;
    renderMockQuestionDots();
    renderCurrentMockQuestion();
  }
}

function renderCurrentMockQuestion() {
  const currentQ = state.mockSession.questions[state.mockSession.currentIndex];
  const area = document.getElementById('mockQuestionArea');
  const counter = document.getElementById('mockCurrentCounter');
  const btnPrev = document.getElementById('btnPrevQuestion');
  const btnNext = document.getElementById('btnNextQuestion');

  const total = state.mockSession.questions.length;
  const idx = state.mockSession.currentIndex;

  counter.textContent = `ข้อ ${idx + 1} จาก ${total}`;
  btnPrev.disabled = (idx === 0);
  btnNext.textContent = (idx === total - 1) ? 'ข้อถัดไป (ตรวจทาน) ➡️' : 'ข้อถัดไป ➡️';

  const catBadgeClass = getCategoryBadgeClass(currentQ.category);
  const selectedOption = state.mockSession.answers[currentQ.id];

  const optionsHtml = currentQ.options.map((opt, optIdx) => {
    const isSelected = selectedOption === optIdx;
    return `
      <div class="q-option-item ${isSelected ? 'selected' : ''}" onclick="selectMockAnswer(${currentQ.id}, ${optIdx})">
        <span class="opt-index">${optIdx + 1}</span>
        <span>${escapeHtml(opt)}</span>
      </div>
    `;
  }).join('');

  area.innerHTML = `
    <div class="q-card-header" style="margin-bottom: 1rem;">
      <div class="q-badges">
        <span class="q-num">ข้อที่ ${idx + 1}</span>
        <span class="badge badge-year">ปี ${escapeHtml(currentQ.year)}</span>
        <span class="badge ${catBadgeClass}">${escapeHtml(currentQ.category)}</span>
        ${currentQ.tags ? `<span class="badge badge-tag">#${escapeHtml(currentQ.tags)}</span>` : ''}
      </div>
    </div>
    <div class="q-text" style="font-size: 1.15rem; margin-bottom: 1.5rem;">${escapeHtml(currentQ.question_text)}</div>
    <div class="q-options-list">
      ${optionsHtml}
    </div>
  `;
}

window.selectMockAnswer = function(questionId, optionIdx) {
  state.mockSession.answers[questionId] = optionIdx;
  renderMockQuestionDots();
  renderCurrentMockQuestion();
};

function confirmSubmitMockExam() {
  const total = state.mockSession.questions.length;
  const answeredCount = Object.keys(state.mockSession.answers).length;
  const unansweredCount = total - answeredCount;

  let msg = `คุณตอบไปแล้ว ${answeredCount}/${total} ข้อ\n`;
  if (unansweredCount > 0) {
    msg += `⚠️ ยังมีข้อที่ยังไม่ได้ตอบอีก ${unansweredCount} ข้อ!\n`;
  }
  msg += `คุณต้องการส่งข้อสอบและดูผลการประเมินใช่หรือไม่?`;

  if (confirm(msg)) {
    finishMockExam();
  }
}

async function finishMockExam() {
  clearInterval(state.mockSession.timerInterval);

  const timeSpent = state.mockSession.totalSeconds - state.mockSession.remainingSeconds;
  const answersPayload = state.mockSession.questions.map(q => ({
    question_id: q.id,
    selected_option: state.mockSession.answers[q.id] !== undefined ? state.mockSession.answers[q.id] : null
  }));

  try {
    const result = await apiSubmitExam(answersPayload, timeSpent);
    renderPerformanceDashboard(result);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// Performance Dashboard Rendering
// ==========================================
function renderPerformanceDashboard(result) {
  document.getElementById('mockActiveView').classList.add('hidden');
  const resultView = document.getElementById('mockResultView');
  resultView.classList.remove('hidden');

  const mins = Math.floor(result.time_spent_seconds / 60);
  const secs = result.time_spent_seconds % 60;
  const timeFormatted = `${mins} นาที ${secs} วินาที`;

  // Categories breakdown cards
  const categoriesHtml = Object.values(result.categories).map(cat => {
    const barClass = cat.is_passed ? 'pass' : 'fail';
    const statusText = cat.is_passed 
      ? '<span style="color: var(--success); font-weight: 600;">✅ ผ่านเกณฑ์</span>' 
      : '<span style="color: var(--danger); font-weight: 600;">❌ ไม่ผ่านเกณฑ์</span>';

    return `
      <div class="cat-stat-card">
        <div class="cat-stat-header">
          <span class="cat-stat-title">${escapeHtml(cat.category)}</span>
          ${statusText}
        </div>
        <div class="cat-stat-progress-bg">
          <div class="cat-stat-progress-bar ${barClass}" style="width: ${cat.percentage}%"></div>
        </div>
        <div class="cat-stat-footer">
          <span>ได้ ${cat.correct}/${cat.total} ข้อ (${cat.percentage}%)</span>
          <span>เกณฑ์ขั้นต่ำ: ${cat.passing_threshold}%</span>
        </div>
      </div>
    `;
  }).join('');

  // Review list of all questions
  const reviewHtml = result.review.map((item, idx) => {
    const isCorrect = item.is_correct;
    const catClass = getCategoryBadgeClass(item.category);
    const resultBadge = isCorrect 
      ? '<span class="badge" style="background: var(--success-light); color: var(--success); border: 1px solid #86efac; font-weight: 600;">✅ ถูกต้อง</span>' 
      : '<span class="badge" style="background: var(--danger-light); color: var(--danger); border: 1px solid #fca5a5; font-weight: 600;">❌ ผิด</span>';

    const optionsHtml = item.options.map((opt, optIdx) => {
      let optClass = 'q-option-item';
      if (optIdx === item.correct_answer) {
        optClass += ' revealed-correct';
      } else if (optIdx === item.selected_option && !isCorrect) {
        optClass += ' revealed-wrong';
      }

      return `
        <div class="${optClass}" style="cursor: default;">
          <span class="opt-index">${optIdx + 1}</span>
          <span>${escapeHtml(opt)}</span>
          ${optIdx === item.correct_answer ? '<strong style="margin-left: auto; color: var(--success);">(เฉลย)</strong>' : ''}
          ${optIdx === item.selected_option ? '<strong style="margin-left: 0.5rem; color: #1e40af;">(ที่คุณเลือก)</strong>' : ''}
        </div>
      `;
    }).join('');

    return `
      <div class="q-card" style="margin-bottom: 1.5rem;">
        <div class="q-card-header">
          <div class="q-badges">
            <span class="q-num">ข้อ ${idx + 1}</span>
            <span class="badge badge-year">ปี ${escapeHtml(item.year)}</span>
            <span class="badge ${catClass}">${escapeHtml(item.category)}</span>
            ${item.tags ? `<span class="badge badge-tag">#${escapeHtml(item.tags)}</span>` : ''}
            ${resultBadge}
          </div>
        </div>
        <div class="q-text">${escapeHtml(item.question_text)}</div>
        <div class="q-options-list">
          ${optionsHtml}
        </div>
        <div class="q-explanation-box">
          <strong>💡 เฉลยละเอียดและวิธีคิด:</strong>
          <div>${escapeHtml(item.explanation)}</div>
        </div>
      </div>
    `;
  }).join('');

  resultView.innerHTML = `
    <div class="result-hero ${result.overall_passed ? 'passed' : 'failed'}">
      <div class="result-status-title">
        ${result.overall_passed ? '🎉 ยินดีด้วย! คุณผ่านเกณฑ์การสอบ ก.พ. ภาค ก.' : '📌 ยังไม่ผ่านเกณฑ์การสอบ ก.พ. (ฝึกฝนเพิ่มเติม)'}
      </div>
      <div class="result-score-number">
        ${result.correct_count} / ${result.total_questions}
      </div>
      <div class="result-score-sub">
        คิดเป็น ${result.score_percentage}% ของคะแนนทั้งหมด
      </div>
      <div class="result-meta-row">
        <div class="result-meta-item">⏱️ เวลาที่ใช้: <strong>${timeFormatted}</strong></div>
        <div class="result-meta-item">📝 จำนวนข้อที่ตอบ: <strong>${result.total_questions} ข้อ</strong></div>
      </div>
    </div>

    <h3 style="font-size: 1.2rem; font-weight: 700; margin-bottom: 1rem;">📊 สรุปผลคะแนนแยกตามหมวดหมู่วิชา</h3>
    <div class="category-breakdown-grid">
      ${categoriesHtml}
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; margin: 2rem 0 1rem;">
      <h3 class="review-section-title">🔍 ตรวจทานข้อสอบและเฉลยละเอียดทีละข้อ</h3>
      <button class="btn btn-primary" onclick="resetMockExamView()">🔄 เริ่มทำข้อสอบชุดใหม่</button>
    </div>

    <div class="review-list">
      ${reviewHtml}
    </div>
  `;
}

window.resetMockExamView = function() {
  document.getElementById('mockResultView').classList.add('hidden');
  document.getElementById('mockActiveView').classList.add('hidden');
  document.getElementById('mockSetupView').classList.remove('hidden');
};

// ==========================================
// TAB 3: ADMIN & CRUD (จัดการข้อสอบ)
// ==========================================
function initFormListeners() {
  const form = document.getElementById('questionForm');
  const btnCancel = document.getElementById('btnCancelEdit');

  if (form) form.addEventListener('submit', handleFormSubmit);
  if (btnCancel) btnCancel.addEventListener('click', resetAdminForm);
}

async function handleFormSubmit(e) {
  e.preventDefault();

  if (!state.currentUser) {
    showToast('กรุณาเข้าสู่ระบบก่อนบันทึกข้อสอบ', 'error');
    return;
  }

  const editId = document.getElementById('editQuestionId').value;
  const year = document.getElementById('formYear').value.trim();
  const category = document.getElementById('formCategory').value;
  const tags = document.getElementById('formTags').value.trim();
  const questionText = document.getElementById('formQuestionText').value.trim();
  const explanation = document.getElementById('formExplanation').value.trim();

  const options = [
    document.getElementById('opt0').value.trim(),
    document.getElementById('opt1').value.trim(),
    document.getElementById('opt2').value.trim(),
    document.getElementById('opt3').value.trim()
  ];

  const checkedRadio = document.querySelector('input[name="correctOptionRadio"]:checked');
  const correctAnswer = checkedRadio ? parseInt(checkedRadio.value, 10) : 0;

  const payload = {
    year: year,
    category: category,
    tags: tags,
    question_text: questionText,
    options: options,
    correct_answer: correctAnswer,
    explanation: explanation
  };

  try {
    if (editId) {
      await apiUpdateQuestion(editId, payload);
      showToast('แก้ไขข้อสอบเรียบร้อยแล้ว!', 'success');
    } else {
      await apiCreateQuestion(payload);
      showToast('เพิ่มข้อสอบใหม่เข้าสู่ระบบสำเร็จ!', 'success');
    }

    resetAdminForm();
    await loadAdminTable();
    await loadMetaFilters();
    await loadBrowseQuestions();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function resetAdminForm() {
  document.getElementById('questionForm').reset();
  document.getElementById('editQuestionId').value = '';
  document.getElementById('formHeaderTitle').textContent = '➕ เพิ่มข้อสอบใหม่เข้าสู่ระบบ';
  document.getElementById('btnSubmitForm').textContent = '💾 บันทึกข้อสอบ';
  document.getElementById('btnCancelEdit').classList.add('hidden');
  document.getElementById('radioOpt0').checked = true;
}

async function loadAdminTable() {
  try {
    const list = await apiGetQuestions();
    const tbody = document.getElementById('adminTableBody');
    const totalCount = document.getElementById('adminTotalCount');

    totalCount.textContent = list.length;

    if (!list || list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">ยังไม่มีข้อสอบในระบบ</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(q => {
      const catClass = getCategoryBadgeClass(q.category);
      const snippet = q.question_text.length > 70 ? q.question_text.substring(0, 70) + '...' : q.question_text;

      return `
        <tr>
          <td><strong>#${q.id}</strong></td>
          <td><span class="badge badge-year">${escapeHtml(q.year)}</span></td>
          <td><span class="badge ${catClass}">${escapeHtml(q.category)}</span></td>
          <td>${escapeHtml(snippet)}</td>
          <td>
            <div class="table-actions">
              <button class="btn btn-secondary btn-sm" onclick="startEditQuestion(${q.id})">✏️ แก้ไข</button>
              <button class="btn btn-danger btn-sm" onclick="promptDeleteQuestion(${q.id})">🗑️ ลบ</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

window.startEditQuestion = async function(id) {
  try {
    const q = await apiGetQuestionById(id);
    document.getElementById('editQuestionId').value = q.id;
    document.getElementById('formYear').value = q.year;
    document.getElementById('formCategory').value = q.category;
    document.getElementById('formTags').value = q.tags || '';
    document.getElementById('formQuestionText').value = q.question_text;
    document.getElementById('formExplanation').value = q.explanation;

    if (q.options && q.options.length >= 4) {
      document.getElementById('opt0').value = q.options[0] || '';
      document.getElementById('opt1').value = q.options[1] || '';
      document.getElementById('opt2').value = q.options[2] || '';
      document.getElementById('opt3').value = q.options[3] || '';
    }

    const targetRadio = document.querySelector(`input[name="correctOptionRadio"][value="${q.correct_answer}"]`);
    if (targetRadio) targetRadio.checked = true;

    document.getElementById('formHeaderTitle').textContent = `✏️ กำลังแก้ไขข้อสอบ ID: #${q.id}`;
    document.getElementById('btnSubmitForm').textContent = '💾 บันทึกการแก้ไข';
    document.getElementById('btnCancelEdit').classList.remove('hidden');

    // Scroll smoothly to form
    document.querySelector('.admin-form-card').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// Delete Modal Handling
function initModalListeners() {
  const modal = document.getElementById('deleteModal');
  const btnCancel = document.getElementById('btnCancelDelete');
  const btnConfirm = document.getElementById('btnConfirmDelete');

  btnCancel.addEventListener('click', () => {
    modal.classList.add('hidden');
    state.deleteTargetId = null;
  });

  btnConfirm.addEventListener('click', async () => {
    if (!state.deleteTargetId) return;
    try {
      await apiDeleteQuestion(state.deleteTargetId);
      showToast('ลบข้อสอบสำเร็จแล้ว', 'success');
      modal.classList.add('hidden');
      state.deleteTargetId = null;
      await loadAdminTable();
      await loadMetaFilters();
      await loadBrowseQuestions();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

window.promptDeleteQuestion = function(id) {
  if (!state.currentUser) {
    showToast('กรุณาเข้าสู่ระบบก่อนลบข้อสอบ', 'error');
    return;
  }
  state.deleteTargetId = id;
  const modal = document.getElementById('deleteModal');
  const msg = document.getElementById('deleteModalMsg');
  msg.textContent = `คุณแน่ใจหรือไม่ว่าต้องการลบข้อสอบ ID: #${id}? การกระทำนี้ไม่สามารถย้อนกลับได้`;
  modal.classList.remove('hidden');
};

// Utility function to escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
