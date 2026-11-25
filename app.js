const $ = (selector) => document.querySelector(selector);
const editor = $('#editor-form');
const paper = $('#paper');
const details = $('#film-detail');
const filmById = new Map(films.map((film) => [film.id, film]));
const fieldNames = ['title', 'goal', 'before', 'during', 'after'];
const phases = [
  ['before', '감상 전'],
  ['during', '감상 중'],
  ['after', '감상 후'],
];
const filterInputs = ['#search', '#group-filter', '#platform-filter', '#subject-filter', '#duration-filter'].map($);
const storageKey = 'classroom-cinema-v1';
let storageAvailable = true;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    const playlist = Array.isArray(saved?.playlist) ? saved.playlist.filter((id) => filmById.has(id)) : [];
    const drafts = saved?.drafts && typeof saved.drafts === 'object' ? saved.drafts : {};
    return { playlist: [...new Set(playlist)], drafts };
  } catch {
    return { playlist: [], drafts: {} };
  }
}

const state = loadState();
let selectedGrade = '';
let worksheetFilm = films[0];
let paperMode = 'student';
let currentView = 'browse';
let localPdfBundle;

function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    storageAvailable = false;
    $('#draft-status').textContent = '브라우저 저장을 사용할 수 없어요. 수정한 학습지는 파일로 저장하세요.';
  }
}

function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, (char) => entities[char]);
}

function externalLink(url, label, classes = 'text-link') {
  return `<a class="${classes}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} <span aria-hidden="true">↗</span></a>`;
}

function option(value, name) {
  return new Option(name, value);
}

function createFilters() {
  $('#curriculum-link').href = curriculumSource;
  groups.forEach((group, index) => $('#group-filter').add(option(index, group)));
  for (const [key, platform] of Object.entries(platforms)) {
    $('#platform-filter').add(option(key, platform.short));
  }
  for (const subject of new Set(Object.values(standards).map((standard) => standard.subject))) {
    $('#subject-filter').add(option(subject, subject));
  }
  const gradeFilters = $('#grade-filters');
  const grades = [
    ['', '전체'],
    ...Array.from({ length: 6 }, (_, i) => [String(i + 1), `초${i + 1}`]),
  ];
  gradeFilters.innerHTML = grades.map(([value, label]) => {
    const name = /^\d$/.test(value) ? `초등 ${value}학년` : label;
    return `<button type="button" data-grade="${value}" aria-label="${name}" aria-pressed="${value === ''}">${label}</button>`;
  }).join('');
  gradeFilters.addEventListener('click', (event) => {
    const button = event.target.closest('[data-grade]');
    if (!button) return;
    selectedGrade = button.dataset.grade;
    renderCatalog();
  });
  for (const field of filterInputs) {
    field.addEventListener(field.type === 'search' ? 'input' : 'change', renderCatalog);
  }
}

function playlistButton(film, style = 'bookmark') {
  const saved = state.playlist.includes(film.id);
  const action = saved ? '빼기' : '담기';
  const label = style === 'bookmark' ? '<span aria-hidden="true"></span>' : `플레이리스트 ${action}`;
  return `<button type="button" class="${style}" data-save="${film.id}" aria-pressed="${saved}" aria-label="${escapeHtml(film.title)} ${action}" title="${action}">${label}</button>`;
}

function filmCard(film, inShelf = false) {
  const heading = inShelf ? 'h4' : 'h3';
  return `<article class="film-card">
    <div class="film-cover">
      <button type="button" class="cover-button" data-detail="${film.id}" aria-label="${escapeHtml(film.title)} 수업 정보">
        <img src="assets/${film.id}.webp" width="640" height="360" alt="" loading="lazy">
      </button>
      ${playlistButton(film)}
    </div>
    <div class="film-body">
      <${heading}><button type="button" class="title-button" data-detail="${film.id}">${escapeHtml(film.title)}</button></${heading}>
      <p class="film-meta"><span>${escapeHtml(film.gradeLabel)}</span><span>${escapeHtml(platforms[film.platform].short)}</span></p>
      <p class="film-topic">${escapeHtml(film.topic)}</p>
    </div>
  </article>`;
}

function normalizeSearch(value) {
  return value.normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g, '');
}

function filmShelf(group, index, results) {
  return `<section class="shelf" aria-labelledby="shelf-label-${index}">
    <div class="shelf-heading">
      <h3 id="shelf-label-${index}">${escapeHtml(group)}</h3>
      <div class="shelf-actions">
        <button type="button" data-step="-1" aria-label="${escapeHtml(group)} 이전 작품" aria-controls="shelf-${index}">‹</button>
        <button type="button" data-step="1" aria-label="${escapeHtml(group)} 다음 작품" aria-controls="shelf-${index}">›</button>
      </div>
    </div>
    <div class="shelf-track" id="shelf-${index}">${results.map((film) => filmCard(film, true)).join('')}</div>
  </section>`;
}

function updateShelfControls(track) {
  const actions = track.closest('.shelf').querySelector('.shelf-actions');
  const max = track.scrollWidth - track.clientWidth;
  actions.hidden = max < 3;
  actions.children[0].disabled = track.scrollLeft < 2;
  actions.children[1].disabled = track.scrollLeft > max - 2;
}

function renderCatalog() {
  const [search, group, platform, subject, duration] = filterInputs.map((input) => input.value.trim());
  const query = normalizeSearch(search);
  const results = films.filter((film) => {
    const subjects = film.codes.map((code) => standards[code].subject);
    const keywords = [film.title, film.original, film.source || '', film.topic, film.description, film.education, film.gradeLabel, groups[film.group], worksheetActivities[film.id].output, ...subjects, ...film.codes];
    return (!selectedGrade || film.grades.includes(selectedGrade))
      && (group === '' || film.group === Number(group))
      && (!platform || film.platform === platform)
      && (!subject || subjects.includes(subject))
      && (!duration || (film.minutes == null ? film.durationBand : film.minutes <= 15 ? 'short' : 'long') === duration)
      && (!query || normalizeSearch(keywords.join(' ')).includes(query));
  });
  for (const button of $('#grade-filters').children) {
    button.setAttribute('aria-pressed', String(button.dataset.grade === selectedGrade));
  }
  $('#results-count').textContent = `작품 ${results.length}편`;
  $('#clear-filters').hidden = !(selectedGrade || search || group || platform || subject || duration);
  const shelves = groups.map((name, index) => {
    const category = results.filter((film) => film.group === index);
    return category.length ? filmShelf(name, index, category) : '';
  });
  $('#catalog').innerHTML = results.length ? shelves.join('') : `
    <div class="empty panel">
      <p>조건에 맞는 작품이 없어요.</p>
      <span>다른 학년을 고르거나 검색 조건을 초기화해 보세요.</span>
    </div>`;
  for (const track of document.querySelectorAll('.shelf-track')) {
    track.addEventListener('scroll', () => updateShelfControls(track), { passive: true });
    updateShelfControls(track);
  }
}

function renderPlaylist() {
  $('#saved-count').textContent = state.playlist.length;
  $('#playlist-count').textContent = `담은 작품 ${state.playlist.length}편`;
  $('#playlist').innerHTML = state.playlist.length ? state.playlist.map((id) => filmCard(filmById.get(id))).join('') : `
    <div class="empty panel">
      <p>담은 작품이 없어요.</p>
      <span>작품 카드 위의 책갈피 버튼을 눌러 담을 수 있어요.</span>
      <button class="button primary" type="button" data-view="browse">작품 둘러보기</button>
    </div>`;
}

function standardBlock(film) {
  return film.codes.map((code) => {
    const standard = standards[code];
    return `<div class="standard-entry">
      <p class="standard-tag">${standard.subject} ${code}</p>
      <p>${escapeHtml(standard.summary)}</p>
      ${externalLink(curriculumSource, `${standard.band} · 별책 ${standard.book}`)}
    </div>`;
  }).join('');
}

function pdfLink(film, label = '학습지 PDF 다운로드') {
  const filename = `${film.title} 감상 활동지.pdf`.replace(/[<>:"/\\|?*]/g, '');
  return `<a class="button primary pdf-link" href="assets/worksheets/${film.id}.pdf" data-pdf="${film.id}" download="${escapeHtml(filename)}">${label}</a>`;
}

function openDetails(film) {
  const platform = platforms[film.platform];
  const activity = worksheetActivities[film.id];
  const meta = film.platform === 'youtube'
    ? film.meta.split(' · ').slice(1).join(' · ')
    : [platform.short, film.rating, film.duration].filter(Boolean).join(' · ');
  $('#detail-content').innerHTML = `
    <header class="detail-header">
      <img class="detail-image" src="assets/${film.id}.webp" width="640" height="360" alt="">
      <div class="detail-title">
        <p>${escapeHtml(film.gradeLabel)} 추천</p>
        <h2 id="detail-title">${escapeHtml(film.title)}</h2>
        <p class="detail-meta">${escapeHtml(meta)}</p>
      </div>
    </header>
    <div class="detail-grid">
      <div class="detail-copy">
        <div class="detail-actions">
          ${externalLink(filmUrl(film), film.route, 'button secondary')}
          ${playlistButton(film, 'button soft')}
          <span class="mobile-download"><button type="button" class="button secondary" data-worksheet-preview>학습지 미리보기</button></span>
        </div>
        <section><h3>줄거리</h3><p>${escapeHtml(film.description)}</p></section>
        <section><h3>교육 포인트</h3><p>${escapeHtml(film.education)}</p></section>
        <section><h3>성취기준</h3><div class="alignment">${standardBlock(film)}</div></section>
        ${film.note ? `<section><h3>수업 전 확인</h3><p>${escapeHtml(film.note)}</p></section>` : ''}
        <div class="detail-links">
          ${film.extraLinks.map(({ url, label }) => externalLink(url, label)).join('')}
          ${platform.terms ? externalLink(platform.terms, '상영과 이용 조건') : ''}
        </div>
      </div>
      <aside class="worksheet-card" aria-labelledby="detail-worksheet-heading">
        <p class="worksheet-format">학습지 PDF 미리보기 · A4 한 장</p>
        <h3 id="detail-worksheet-heading" tabindex="-1">${escapeHtml(activity.output)}</h3>
        <p class="worksheet-value">핵심 가치 <strong>${escapeHtml(activity.value)}</strong></p>
        <a class="worksheet-page" href="assets/worksheets/${film.id}.pdf" target="_blank" rel="noopener noreferrer">
          <img src="assets/${film.id}-worksheet-preview.webp" width="893" height="1263" alt="${escapeHtml(film.title)} 감상 활동지 1페이지">
          <span>PDF 새 탭에서 크게 보기 <span aria-hidden="true">↗</span></span>
        </a>
        <div class="worksheet-actions">
          ${pdfLink(film)}
          <button type="button" class="button secondary" data-worksheet="${film.id}">미리 보고 편집하기</button>
        </div>
      </aside>
    </div>`;
  details.showModal();
}

function togglePlaylist(id, trigger) {
  const saved = state.playlist.includes(id);
  state.playlist = saved ? state.playlist.filter((entry) => entry !== id) : [...state.playlist, id];
  persist();
  for (const bookmark of $('#catalog').querySelectorAll(`[data-save="${id}"]`)) {
    const added = !saved;
    const action = added ? '빼기' : '담기';
    bookmark.setAttribute('aria-pressed', String(added));
    bookmark.setAttribute('aria-label', `${filmById.get(id).title} ${action}`);
    bookmark.title = action;
  }
  renderPlaylist();
  const film = filmById.get(id);
  if (details.open) {
    const container = document.createElement('div');
    container.innerHTML = playlistButton(film, 'button soft');
    const replacement = container.firstElementChild;
    trigger.replaceWith(replacement);
    replacement.focus();
  } else {
    const container = currentView === 'browse' ? $('#catalog') : $('#playlist');
    const nextFocus = container.querySelector(`[data-save="${id}"]`)
      ?? container.querySelector('[data-save], [data-view]') ?? $('#playlist-heading');
    nextFocus.focus({ preventScroll: true });
  }
  const message = saved ? '플레이리스트에서 뺐어요.' : '플레이리스트에 담았어요.';
  $('#notice').textContent = `${film.title} ${message}${storageAvailable ? '' : ' 브라우저를 닫기 전까지 적용됩니다.'}`;
}

function defaultSheet(film) {
  const { opening, observe, create } = worksheetActivities[film.id];
  return { title: `${film.title} 감상 활동지`, goal: film.goal, before: opening, during: observe, after: create };
}

function loadWorksheet(film) {
  worksheetFilm = film;
  $('#worksheet-film').value = film.id;
  $('#worksheet-standard').innerHTML = standardBlock(film);
  $('#worksheet-default-pdf').innerHTML = pdfLink(film, '기본 PDF 다운로드');
  const defaults = defaultSheet(film);
  const draft = state.drafts[film.id];
  for (const name of fieldNames) {
    const field = editor.elements.namedItem(name);
    const saved = draft?.[name];
    field.value = typeof saved === 'string' ? saved.slice(0, field.maxLength) : defaults[name];
  }
  $('#draft-status').textContent = storageAvailable
    ? draft ? '이 브라우저에 저장한 학습지를 불러왔습니다.' : '수정한 내용은 이 브라우저에 저장됩니다.'
    : '브라우저 저장을 사용할 수 없어요. 수정한 학습지는 파일로 저장하세요.';
  renderPaper();
}

function readEditor() {
  return Object.fromEntries(fieldNames.map((name) => [name, editor.elements.namedItem(name).value]));
}

function sheetContent() {
  const draft = readEditor();
  const defaults = defaultSheet(worksheetFilm);
  return Object.fromEntries(fieldNames.map((name) => [name, draft[name].trim() || defaults[name]]));
}

function teacherNotes(film) {
  const platform = platforms[film.platform];
  const activity = worksheetActivities[film.id];
  return [
    ['수업에서 볼 장면', film.scene],
    ['수업 전 확인', film.note],
    ['관찰 기준', film.observation],
    ['장면 해석 예시', film.example],
    ['활동 결과 확인', activity.check],
    ['수업 운영', film.grades.some((grade) => grade === '1' || grade === '2')
      ? '예시를 읽어 주고, 학생이 그림·짧은 말·몸짓으로 설명할 수 있게 해 주세요.'
      : '근거가 드러나는 응답을 함께 살펴보고, 같은 근거로도 가능한 다른 해석을 이야기해요.'],
    ['시청과 상영', `${[platform.name, film.duration, film.rating].filter(Boolean).join(' · ')}. 수업 전 재생, 자막, 상영 조건을 확인하세요.`],
  ].filter(([, value]) => value);
}

function renderPaper() {
  const film = worksheetFilm;
  const activity = worksheetActivities[film.id];
  const standard = standards[film.code];
  const sheet = sheetContent();
  const teacher = paperMode === 'teacher';
  paper.classList.toggle('teacher-paper', teacher);
  paper.innerHTML = `
    <header class="paper-heading">
      <p class="paper-type">${teacher ? '교사용 지도안' : '학생용 학습지'} <span>${escapeHtml(film.gradeLabel)} · ${standard.subject}</span></p>
      <h2>${escapeHtml(teacher ? `${film.title} 수업 지도안` : sheet.title)}</h2>
      ${teacher ? '' : '<p class="student-information">날짜 ______________ &nbsp;&nbsp; 반 ______ &nbsp;&nbsp; 이름 ______________</p>'}
    </header>
    <p class="paper-focus"><strong>${escapeHtml(activity.output)}</strong> · ${escapeHtml(activity.value)}</p>
    <p class="paper-goal"><strong>배움 목표</strong> <span>${escapeHtml(sheet.goal)}</span></p>
    ${phases.map(([key, label]) => `
      <section class="paper-activity">
        <h3>${label}</h3>
        <p>${escapeHtml(sheet[key])}</p>
        ${teacher ? '' : key === 'after' ? `
          <div class="activity-layout ${activity.format}">
            ${activity.labels.map((field) => `<div class="activity-slot">${escapeHtml(field)}</div>`).join('')}
          </div>
          <p class="activity-check"><strong>스스로 확인</strong> ${escapeHtml(activity.check)}</p>`
          : `<div class="response-area ${key} ${film.grades.some((grade) => grade === '1' || grade === '2') ? 'draw' : ''}" aria-hidden="true"></div>`}
      </section>`).join('')}
    ${teacher ? `<div class="teacher-notes">
      ${teacherNotes(film).map(([label, value]) => `<section><h3>${label}</h3><p>${escapeHtml(value)}</p></section>`).join('')}
      <p class="teacher-reminder">문항을 수정했다면 관찰 기준과 활동 결과 확인 질문도 함께 조정해 주세요.</p>
    </div>` : ''}
    <footer class="paper-footer">
      <p>${escapeHtml(film.title)} · ${film.codes.join(' · ')}${teacher ? ' · 2022 개정 교육과정' : ''}</p>
      ${teacher ? `<p>${externalLink(curriculumSource, '교육과정 원문')} ${externalLink(filmUrl(film), '작품 공식 페이지')} ${platforms[film.platform].terms ? externalLink(platforms[film.platform].terms, '상영 조건') : ''}</p>` : ''}
    </footer>`;
}

function downloadMarkdown() {
  const film = worksheetFilm;
  const activity = worksheetActivities[film.id];
  const standard = standards[film.code];
  const sheet = sheetContent();
  const teacher = paperMode === 'teacher';
  const output = [
    `# ${teacher ? `${film.title} 수업 지도안` : sheet.title}`,
    '',
    `${film.gradeLabel} · ${standard.subject} · ${film.codes.join(' · ')}`,
    '',
    teacher ? `성취기준 요약 | ${standard.summary}` : '날짜 __________　반 ______　이름 __________',
    '',
    `활동 · ${activity.output} / 핵심 가치 · ${activity.value}`,
    '',
    '## 배움 목표', '', sheet.goal, '',
  ];
  for (const [key, label] of phases) {
    output.push(`## ${label}`, '', sheet[key], '');
    if (!teacher && key === 'after') {
      for (const field of activity.labels) output.push(`- ${field}  ________________________________________`, '');
      output.push(`스스로 확인 · ${activity.check}`, '');
    } else if (!teacher) {
      output.push('________________________________________', '', '________________________________________', '');
    }
  }
  if (teacher) {
    for (const [label, value] of teacherNotes(film)) output.push(`## ${label}`, '', value, '');
    output.push('문항을 수정했다면 관찰 기준과 활동 결과 확인 질문도 함께 조정해 주세요.', '');
    output.push(`[교육과정 원문](${curriculumSource}) · [작품 공식 페이지](${filmUrl(film)})`);
    if (platforms[film.platform].terms) output.push(`[상영 조건](${platforms[film.platform].terms})`);
  }
  const blob = new Blob([output.join('\n') + '\n'], { type: 'text/markdown;charset=utf-8' });
  const filename = `${film.title} ${teacher ? '지도안' : '학습지'}.md`.replace(/[<>:"/\\|?*]/g, '');
  downloadBlob(blob, filename);
}

function downloadBlob(blob, filename) {
  const file = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = file;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(file), 1000);
}

function downloadLocalPdf(link) {
  localPdfBundle ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'assets/worksheets/pdfs.js';
    script.addEventListener('load', () => {
      script.remove();
      resolve(globalThis.classroomWorksheetPdfs);
    }, { once: true });
    script.addEventListener('error', () => {
      script.remove();
      reject(new Error('Worksheet bundle could not be loaded.'));
    }, { once: true });
    document.head.append(script);
  });
  localPdfBundle.then((pdfs) => {
    const bytes = Uint8Array.from(atob(pdfs[link.dataset.pdf]), (character) => character.charCodeAt(0));
    downloadBlob(new Blob([bytes], { type: 'application/pdf' }), link.download);
  }).catch(() => {
    localPdfBundle = undefined;
    location.assign(link.href);
  });
}

const views = { browse: '#browse-view', 'my-playlist': '#playlist-view', worksheet: '#worksheet-view' };
const headings = { browse: '#hero-title', 'my-playlist': '#playlist-heading', worksheet: '#worksheet-heading' };

function showView(focusHeading = false) {
  const [view, id] = location.hash.slice(1).split('/');
  if (view === 'main') return;
  currentView = Object.hasOwn(views, view) ? view : 'browse';
  for (const [name, selector] of Object.entries(views)) $(selector).hidden = name !== currentView;
  for (const button of document.querySelectorAll('.main-nav [data-view]')) {
    if (button.dataset.view === currentView) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  if (currentView === 'worksheet') loadWorksheet(filmById.get(id) ?? worksheetFilm);
  if (currentView === 'browse') document.querySelectorAll('.shelf-track').forEach(updateShelfControls);
  if (focusHeading) {
    window.scrollTo(0, 0);
    $(headings[currentView]).focus({ preventScroll: true });
  }
}

function navigate(view, id) {
  const hash = id ? `#${view}/${id}` : `#${view}`;
  if (location.hash === hash) showView(true);
  else location.hash = hash;
}

createFilters();
groups.forEach((label, index) => {
  const group = document.createElement('optgroup');
  group.label = label;
  group.append(...films.filter((film) => film.group === index).map((film) => option(film.id, film.title)));
  $('#worksheet-film').append(group);
});

$('#clear-filters').addEventListener('click', () => {
  selectedGrade = '';
  for (const field of filterInputs) field.value = '';
  renderCatalog();
  $('#search').focus();
});

document.addEventListener('click', (event) => {
  const pdf = event.target.closest('a[data-pdf]');
  if (pdf && location.protocol === 'file:') {
    event.preventDefault();
    downloadLocalPdf(pdf);
    return;
  }
  const button = event.target.closest('button');
  if (!button) return;
  const { detail, save, worksheet, view, paper: mode } = button.dataset;
  if (button.dataset.step) {
    const track = document.getElementById(button.getAttribute('aria-controls'));
    const motion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.scrollBy({ left: Number(button.dataset.step) * track.clientWidth, behavior: motion ? 'instant' : 'smooth' });
  }
  if (detail) openDetails(filmById.get(detail));
  if (save) togglePlaylist(save, button);
  if (button.hasAttribute('data-worksheet-preview')) {
    const heading = $('#detail-worksheet-heading');
    heading.scrollIntoView({ block: 'start' });
    heading.focus({ preventScroll: true });
  }
  if (worksheet) {
    if (details.open) details.close();
    paperMode = 'student';
    updatePaperButtons();
    navigate('worksheet', worksheet);
  }
  if (view) navigate(view, view === 'worksheet' ? worksheetFilm.id : undefined);
  if (mode) {
    paperMode = mode;
    updatePaperButtons();
    renderPaper();
  }
});

function updatePaperButtons() {
  for (const button of document.querySelectorAll('[data-paper]')) {
    button.setAttribute('aria-pressed', String(button.dataset.paper === paperMode));
  }
}

$('.close-button').addEventListener('click', () => details.close());
details.addEventListener('click', (event) => {
  if (event.target === details) details.close();
});
$('.skip-link').addEventListener('click', (event) => {
  event.preventDefault();
  $('#main').focus();
});
$('#worksheet-film').addEventListener('change', (event) => {
  const id = event.target.value;
  history.replaceState(null, '', `#worksheet/${id}`);
  loadWorksheet(filmById.get(id));
});
editor.addEventListener('input', () => {
  state.drafts[worksheetFilm.id] = readEditor();
  persist();
  if (storageAvailable) $('#draft-status').textContent = '수정한 내용을 이 브라우저에 저장했습니다.';
  renderPaper();
});
editor.addEventListener('submit', (event) => event.preventDefault());
$('#download').addEventListener('click', downloadMarkdown);
$('#print').addEventListener('click', () => window.print());
window.addEventListener('hashchange', () => showView(true));
window.addEventListener('resize', () => document.querySelectorAll('.shelf-track').forEach(updateShelfControls));

$('#screening-guide ~ p time').textContent = checkedOn;
renderCatalog();
renderPlaylist();
showView();
