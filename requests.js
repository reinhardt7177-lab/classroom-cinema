'use strict';

const endpoint = 'https://zxcobnsabdaodnvdmtry.supabase.co/rest/v1/cinema_requests';
const headers = { apikey: 'sb_publishable_6dg1SnuKvbP9ZSeYNRE7hA_-ffxh_MK' };
const form = document.querySelector('#request-form');
const list = document.querySelector('#requests');
const more = document.querySelector('#more');
const listStatus = document.querySelector('#list-status');
const feedback = document.querySelector('#feedback');
const batch = 20;
let generation = 0;

form.elements.title.value = (new URLSearchParams(location.search).get('title') || '').slice(0, 100);

async function showRequests(reset = false) {
  const current = ++generation;
  const offset = reset ? 0 : list.children.length;
  more.disabled = true;
  listStatus.textContent = '신청 목록을 불러오는 중이에요.';
  try {
    const params = new URLSearchParams({
      select: 'title,grade,suggestion,status,created_at', order: 'created_at.desc',
      limit: String(batch + 1), offset: String(offset)
    });
    const response = await fetch(endpoint + '?' + params, { headers, cache: 'no-store' });
    if (!response.ok) throw new Error();
    const rows = await response.json();
    if (current !== generation) return;
    if (reset) list.replaceChildren();
    for (const row of rows.slice(0, batch)) {
      const item = document.createElement('li');
      item.className = 'panel';
      const title = document.createElement('strong');
      title.textContent = row.title;
      const meta = document.createElement('p');
      meta.textContent = '초등 ' + row.grade + '학년 · ' + row.status;
      item.append(title, meta);
      if (row.suggestion) {
        const note = document.createElement('p');
        note.textContent = row.suggestion;
        item.append(note);
      }
      list.append(item);
    }
    more.hidden = rows.length <= batch;
    more.textContent = '더 보기';
    listStatus.textContent = list.children.length ? '' : '아직 신청한 작품이 없어요.';
  } catch {
    if (current !== generation) return;
    listStatus.textContent = '목록을 불러오지 못했어요.';
    more.hidden = false;
    more.textContent = '다시 불러오기';
    more.dataset.reset = reset ? 'yes' : '';
    return;
  } finally {
    if (current === generation) more.disabled = false;
  }
  delete more.dataset.reset;
}

more.addEventListener('click', () => showRequests(more.dataset.reset === 'yes'));
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = form.querySelector('button');
  if (submit.disabled) return;
  const title = form.elements.title.value.trim();
  if (!title) {
    feedback.textContent = '영화 제목을 입력해 주세요.';
    form.elements.title.focus();
    return;
  }
  submit.disabled = true;
  feedback.textContent = '신청을 보내고 있어요.';
  try {
    const response = await fetch(endpoint, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ title, grade: Number(form.elements.grade.value), suggestion: form.elements.suggestion.value.trim() })
    });
    if (!response.ok) throw new Error();
    form.reset();
    feedback.textContent = '신청했어요. 공개 목록에서 확인해 주세요.';
    await showRequests(true);
  } catch {
    feedback.textContent = '접수 여부를 확인하지 못했어요. 목록을 확인한 뒤 다시 시도해 주세요.';
  } finally {
    submit.disabled = false;
  }
});
showRequests(true);
