// Read-only viewer for published songs.
//   /view/            -> list of published songs
//   /view/?id=<songId> -> song detail

const SUPABASE_URL = 'https://thvhoethafeeytxjktbp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XsSjB7Nw31OO5bB4TTBQ-Q_cUMiRk7c';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===================== Music data (keep in sync with app.js) =====================

const NOTE_NAMES_LETTER = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTE_NAMES_SOLFEGE = ['Đô','Đô#','Rê','Rê#','Mi','Fa','Fa#','Sol','Sol#','La','La#','Si'];

const INSTRUMENTS = {
  piano:      { label: 'Piano / Concert Pitch',        semitoneShift: 0,  octaveShift: 0 },
  altoSax:    { label: 'Alto Saxophone (Eb)',           semitoneShift: 9,  octaveShift: 0 },
  bariSax:    { label: 'Baritone Saxophone (Eb)',       semitoneShift: 9,  octaveShift: 1 },
  tenorSax:   { label: 'Tenor Saxophone (Bb)',          semitoneShift: 2,  octaveShift: 1 },
  sopranoSax: { label: 'Soprano Saxophone (Bb)',        semitoneShift: 2,  octaveShift: 0 },
  trumpet:    { label: 'Trumpet / Cornet (Bb)',         semitoneShift: 2,  octaveShift: 0 },
  clarinetBb: { label: 'Clarinet (Bb)',                 semitoneShift: 2,  octaveShift: 0 },
  frenchHorn: { label: 'French Horn (F)',                semitoneShift: 7,  octaveShift: 0 },
};

const SAX_FAMILY = ['altoSax', 'bariSax', 'tenorSax', 'sopranoSax'];

function pitchClassName(pc, naming) {
  const arr = naming === 'solfege' ? NOTE_NAMES_SOLFEGE : NOTE_NAMES_LETTER;
  return arr[((pc % 12) + 12) % 12];
}

function noteNameFromMidi(midi, naming) {
  return `${pitchClassName(midi % 12, naming)}${Math.floor(midi / 12) - 1}`;
}

function transposeForInstrument(concertMidi, instrumentKey) {
  const inst = INSTRUMENTS[instrumentKey] || INSTRUMENTS.piano;
  return concertMidi + inst.semitoneShift + 12 * inst.octaveShift;
}

function hasNote(word) {
  return word.note !== null && word.note !== undefined;
}

// ===================== Data =====================

async function fetchPublishedSongs() {
  const { data, error } = await supabaseClient
    .from('songs')
    // Only the first two lyric lines are needed for the card preview; don't download whole songs.
    .select('id,title,singer,instrument,song_key,updated_at,first:lines->0,second:lines->1')
    .eq('published', true)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data.map(row => ({ ...row, lines: [row.first, row.second].filter(Boolean) }));
}

async function fetchPublishedSong(id) {
  const { data, error } = await supabaseClient
    .from('songs')
    .select('*')
    .eq('id', id)
    .eq('published', true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ===================== Helpers =====================

const app = document.getElementById('app');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showMessage(text) {
  app.replaceChildren(el('p', 'status-msg', text));
}

function backLink() {
  const a = el('a', 'back-link', '← Danh sách ký âm');
  a.href = './';
  return a;
}

function optionList(select, entries, selected) {
  entries.forEach(([value, label]) => {
    const opt = el('option', '', label);
    opt.value = value;
    select.appendChild(opt);
  });
  select.value = selected;
}

function controlGroup(labelText, control) {
  const group = el('div', 'control-group');
  group.append(el('label', '', labelText), control);
  return group;
}

// ===================== List page =====================

function lyricPreview(lines) {
  const text = (lines || []).map(line => line.map(w => w.text).join(' ')).filter(Boolean).slice(0, 2).join(' / ');
  return text;
}

// Pitch class of the song's tone as written for an instrument (concert key + its transposition).
function toneFor(song, instrumentKey) {
  return ((song.song_key || 0) + INSTRUMENTS[instrumentKey].semitoneShift) % 12;
}

const TONE_FILTERS = [
  { label: 'Tone gốc', instrument: 'piano' },
  { label: 'Tone kèn alto', instrument: 'altoSax' },
  { label: 'Tone kèn soprano', instrument: 'sopranoSax' },
];

function songMetaText(song) {
  return [
    `Gốc ${pitchClassName(toneFor(song, 'piano'), 'letter')}`,
    `Alto ${pitchClassName(toneFor(song, 'altoSax'), 'letter')}`,
    `Soprano ${pitchClassName(toneFor(song, 'sopranoSax'), 'letter')}`,
  ].join(' · ');
}

// Lowercase, strip Vietnamese diacritics so "hong" finds "Hồng".
function normalizeText(text) {
  return (text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').toLowerCase();
}

function toneSelect() {
  const sel = el('select');
  const all = el('option', '', 'Tất cả');
  all.value = '';
  sel.appendChild(all);
  for (let pc = 0; pc < 12; pc++) {
    const opt = el('option', '', `${pitchClassName(pc, 'letter')} / ${pitchClassName(pc, 'solfege')}`);
    opt.value = pc;
    sel.appendChild(opt);
  }
  return sel;
}

function renderList(songs) {
  const search = el('input');
  search.type = 'text';
  search.placeholder = 'Tên bài hát hoặc ca sĩ...';
  const toneSels = TONE_FILTERS.map(() => toneSelect());

  const filters = el('section', 'list-filters');
  filters.append(
    controlGroup('Tìm theo tên bài / ca sĩ', search),
    ...TONE_FILTERS.map((f, i) => controlGroup(f.label, toneSels[i])),
  );

  const grid = el('div', 'song-grid');
  const empty = el('p', 'status-msg');

  function matches(song, tokens) {
    const haystack = normalizeText(`${song.title} ${song.singer || ''}`);
    if (!tokens.every(t => haystack.includes(t))) return false;
    return TONE_FILTERS.every((f, i) => toneSels[i].value === '' || toneFor(song, f.instrument) === Number(toneSels[i].value));
  }

  function draw() {
    const tokens = normalizeText(search.value).split(/\s+/).filter(Boolean);
    const shown = songs.filter(s => matches(s, tokens));
    grid.replaceChildren(...shown.map(song => {
      const card = el('a', 'song-card');
      card.href = `?id=${encodeURIComponent(song.id)}`;
      card.append(el('h3', '', song.title));
      if (song.singer) card.append(el('div', 'singer', song.singer));
      card.append(
        el('div', 'preview', lyricPreview(song.lines)),
        el('div', 'meta', songMetaText(song)),
      );
      return card;
    }));
    empty.textContent = shown.length ? '' : (songs.length ? 'Không tìm thấy bài hát nào.' : 'Chưa có ký âm nào được xuất bản.');
    empty.hidden = shown.length > 0;
  }

  search.addEventListener('input', draw);
  toneSels.forEach(sel => sel.addEventListener('change', draw));
  app.replaceChildren(el('h1', 'list-title', 'Ký âm đã xuất bản'), filters, grid, empty);
  document.title = 'Ký âm đã xuất bản';
  draw();
}

// ===================== Detail page =====================

let saxScriptPromise = null;
function loadSaxFingerings() {
  if (!saxScriptPromise) {
    saxScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '../sax-fingerings.js'; // large (~700 KB): only fetched for sax players
      script.onload = resolve;
      script.onerror = () => { saxScriptPromise = null; reject(new Error('sax-fingerings.js')); };
      document.head.appendChild(script);
    });
  }
  return saxScriptPromise;
}

function renderSong(song) {
  const view = { instrument: song.instrument, naming: song.naming, temp: 0 };

  const back = backLink();
  const meta = el('div', 'song-meta', songMetaText(song));
  const head = el('div', 'song-head');
  head.append(el('h1', '', song.title));
  if (song.singer) head.append(el('div', 'singer', `Ca sĩ: ${song.singer}`));
  head.append(meta);

  const instrumentSel = el('select');
  optionList(instrumentSel, Object.entries(INSTRUMENTS).map(([k, v]) => [k, v.label]), view.instrument);
  const namingSel = el('select');
  optionList(namingSel, [['letter', 'Chữ (C, D, E...)'], ['solfege', 'Do Re Mi (Đô Rê Mi...)']], view.naming);

  const tempLabel = el('span', 'temp-transpose-label', '0');
  const down = el('button', '', '♭');
  const up = el('button', '', '♯');
  down.title = 'Giáng 1 nửa cung (chỉ xem)';
  up.title = 'Thăng 1 nửa cung (chỉ xem)';
  const tempRow = el('div', 'control-row tone-root-row');
  tempRow.append(down, tempLabel, up);

  const controls = el('section', 'view-controls');
  controls.append(
    controlGroup('Nhạc cụ', instrumentSel),
    controlGroup('Tên nốt', namingSel),
    controlGroup('Thăng/giáng tạm thời (chỉ xem)', tempRow),
  );

  const lyricsBox = el('div', 'view-lyrics');
  const lyricsSection = el('section');
  lyricsSection.appendChild(lyricsBox);

  const fingeringItems = el('div', 'fingering-list-items');
  const fingeringSection = el('section', 'fingering-section');
  fingeringSection.hidden = true;
  fingeringSection.append(el('h2', '', 'Các thế bấm dùng trong bài'), fingeringItems);

  const displayNote = midi => noteNameFromMidi(
    transposeForInstrument(midi + view.temp, view.instrument), view.naming);

  function drawLyrics() {
    lyricsBox.replaceChildren(...song.lines.map(line => {
      const lineEl = el('div', 'lyric-line');
      line.forEach(word => {
        const wordEl = el('div', 'lyric-word');
        wordEl.append(
          el('div', 'word-note' + (hasNote(word) ? '' : ' empty'), hasNote(word) ? displayNote(word.note) : ''),
          el('div', 'word-text', word.text),
        );
        lineEl.appendChild(wordEl);
      });
      return lineEl;
    }));
  }

  // Written pitches (ascending) used by the song for the current view, or null when
  // fingering charts don't apply (non-sax instrument / no notes assigned).
  function usedWrittenNotes() {
    if (!SAX_FAMILY.includes(view.instrument)) return null;
    const written = new Set();
    song.lines.forEach(line => line.forEach(w => {
      if (hasNote(w)) written.add(transposeForInstrument(w.note + view.temp, view.instrument));
    }));
    return written.size ? [...written].sort((a, b) => a - b) : null;
  }

  async function drawFingerings() {
    if (!usedWrittenNotes()) { fingeringSection.hidden = true; return; }
    try {
      await loadSaxFingerings();
    } catch (e) {
      fingeringSection.hidden = true;
      return;
    }
    const notes = usedWrittenNotes(); // view may have changed while the script loaded
    if (!notes) { fingeringSection.hidden = true; return; }

    fingeringItems.replaceChildren(...notes.map(written => {
      const item = el('div', 'fingering-list-item');
      item.appendChild(el('div', 'fli-note', noteNameFromMidi(written, 'letter')));
      const idx = written - SAX_FINGERING_BASE_MIDI;
      if (idx < 0 || idx >= SAX_FINGERING_IMAGES.length) {
        item.appendChild(el('div', 'fli-oor', 'ngoài phạm vi'));
      } else {
        const img = el('img');
        img.src = SAX_FINGERING_IMAGES[idx];
        img.alt = noteNameFromMidi(written, 'letter');
        item.appendChild(img);
      }
      return item;
    }));
    fingeringSection.hidden = false;
  }

  function redraw() {
    drawLyrics();
    drawFingerings();
  }

  instrumentSel.addEventListener('change', () => { view.instrument = instrumentSel.value; redraw(); });
  namingSel.addEventListener('change', () => { view.naming = namingSel.value; redraw(); });
  [[down, -1], [up, 1]].forEach(([btn, delta]) => btn.addEventListener('click', () => {
    view.temp += delta;
    tempLabel.textContent = view.temp > 0 ? `+${view.temp}` : `${view.temp}`;
    redraw();
  }));

  document.title = `${song.title} - Ký âm`;
  app.replaceChildren(back, head, controls, lyricsSection, fingeringSection);
  redraw();
}

// ===================== Router =====================

async function main() {
  const id = new URLSearchParams(location.search).get('id');
  try {
    if (id) {
      const row = await fetchPublishedSong(id);
      if (!row) {
        app.replaceChildren(backLink(), el('p', 'status-msg', 'Không tìm thấy ký âm này (có thể chưa được xuất bản).'));
        return;
      }
      renderSong({
        title: row.title,
        singer: row.singer || '',
        lines: row.lines || [],
        instrument: row.instrument,
        naming: row.naming,
        song_key: row.song_key,
      });
    } else {
      renderList(await fetchPublishedSongs());
    }
  } catch (e) {
    console.error(e);
    showMessage('Không tải được dữ liệu: ' + e.message);
  }
}

main();
