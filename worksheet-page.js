const selectedFilm = films.find(film => film.id === new URLSearchParams(location.search).get('film'));
if (selectedFilm) {
  document.title = selectedFilm.title + ' 감상 활동지';
  document.querySelector('#sheet').innerHTML = studentSheet(selectedFilm);
} else {
  document.querySelector('#sheet').textContent = '교실극장에서 작품을 선택해 주세요.';
  document.querySelector('nav button').hidden = true;
}
