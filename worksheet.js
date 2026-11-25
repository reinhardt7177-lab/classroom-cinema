const sheetKinds = {
  compare: '두 생각 비교하기', storyboard: '장면 그리기', map: '관계 연결하기',
  choice: '선택하고 말하기', design: '아이디어 설계하기', evidence: '단서 모으기'
};

function sheetText(value) {
  return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[ch]));
}

function studentSheet(film, edits = {}) {
  const a = worksheetActivities[film.id];
  const safe = sheetText;
  const young = film.grades.some(g => g === '1' || g === '2');
  const subjects = [...new Set(film.codes.map(code => standards[code].subject))].join(' · ');
  const title = edits.title === film.title + ' 감상 활동지' ? film.title : edits.title || film.title;
  const phase = (label, question) => `<section class="ws-question"><h3>${label}</h3><p>${safe(question)}</p><div class="ws-answer" aria-hidden="true"></div></section>`;
  return `<div class="ws ws-${a.format}${young ? ' ws-young' : ''}">
    <header class="ws-ticket"><div class="ws-heading"><p class="ws-edition">교실극장 <span>감상 활동지</span></p><h1>${safe(title)}</h1><p class="ws-meta">${safe(film.gradeLabel)} · ${safe(subjects)}</p></div>
    <div class="ws-still"><img src="assets/${safe(film.id)}.webp" alt=""></div></header>
    <div class="ws-name"><span>날짜</span><i></i><span>반</span><i></i><span>이름</span><i></i></div>
    <div class="ws-goal"><b>배움 목표</b><p>${safe(edits.goal || film.goal)}</p></div>
    <div class="ws-pair">${phase('감상 전', edits.before || a.opening)}${phase('감상 중', edits.during || a.observe)}</div>
    <section class="ws-project"><div class="ws-project-head"><span>감상 후</span><b>${safe(sheetKinds[a.format])}</b></div>
    <h2>${safe(a.output)}</h2><p>${safe(edits.after || a.create)}</p>
    <div class="ws-slots">${a.labels.map((label,i) => `<div class="ws-slot"><b><em>${i+1}</em>${safe(label)}</b></div>`).join('')}</div></section>
    <div class="ws-check"><b>□ 스스로 확인</b><p>${safe(a.check)}</p></div>
    <footer class="ws-foot"><strong>${safe(a.value)}</strong><span>2022 개정 · ${safe(film.codes.join(' · '))}</span></footer></div>`;
}
