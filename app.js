// ===================== Music theory data =====================

const NOTE_NAMES_LETTER = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTE_NAMES_SOLFEGE = ['Đô','Đô#','Rê','Rê#','Mi','Fa','Fa#','Sol','Sol#','La','La#','Si'];

const SCALES = {
  major:        { label: 'Major (Trưởng)',        steps: [0,2,4,5,7,9,11] },
  natMinor:     { label: 'Natural Minor (Thứ tự nhiên)', steps: [0,2,3,5,7,8,10] },
  harMinor:     { label: 'Harmonic Minor (Thứ hòa âm)',  steps: [0,2,3,5,7,8,11] },
  melMinor:     { label: 'Melodic Minor (Thứ giai điệu)', steps: [0,2,3,5,7,9,11] },
  majPent:      { label: 'Major Pentatonic',       steps: [0,2,4,7,9] },
  minPent:      { label: 'Minor Pentatonic',        steps: [0,3,5,7,10] },
  blues:        { label: 'Blues',                   steps: [0,3,5,6,7,10] },
  dorian:       { label: 'Dorian',                  steps: [0,2,3,5,7,9,10] },
  phrygian:     { label: 'Phrygian',                 steps: [0,1,3,5,7,8,10] },
  lydian:       { label: 'Lydian',                   steps: [0,2,4,6,7,9,11] },
  mixolydian:   { label: 'Mixolydian',               steps: [0,2,4,5,7,9,10] },
  locrian:      { label: 'Locrian',                  steps: [0,1,3,5,6,8,10] },
  chromatic:    { label: 'Chromatic (Tất cả)',        steps: [0,1,2,3,4,5,6,7,8,9,10,11] },
};

// Written = Concert + semitoneShift (+ 12*octaveShift), for transposing instruments.
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

const MIDI_MIN = 48; // C3
const MIDI_MAX = 84; // C6

// ===================== State =====================

let state = {
  id: null,
  title: 'Bài hát mới',
  lines: [],           // [[{text, note: midiOrNull}]]
  scaleRoot: 0,
  scaleType: 'major',
  instrument: 'piano',
  naming: 'letter',
  songKey: 0,          // pitch class of the song's current/original key, persisted
};

let activeWordRef = null; // {line, word}
let baseOctaveNote = 60;  // C4, for computer-keyboard playing
let audioCtx = null;

// ===================== Audio =====================

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function playNote(midi) {
  const ctx = ensureAudio();
  const now = ctx.currentTime;
  const freq = midiToFreq(midi);
  const volume = parseFloat(document.getElementById('volume').value);

  const osc1 = ctx.createOscillator();
  osc1.type = 'triangle';
  osc1.frequency.value = freq;

  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = freq * 2;

  const gain = ctx.createGain();
  const gain2 = ctx.createGain();
  gain2.gain.value = 0.15;

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);

  osc1.connect(gain);
  osc2.connect(gain2);
  gain2.connect(gain);
  gain.connect(ctx.destination);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 1.15);
  osc2.stop(now + 1.15);
}

// ===================== Note naming / transposition =====================

function pitchClassName(pc, naming) {
  const arr = naming === 'solfege' ? NOTE_NAMES_SOLFEGE : NOTE_NAMES_LETTER;
  return arr[((pc % 12) + 12) % 12];
}

function midiOctave(midi) {
  return Math.floor(midi / 12) - 1;
}

function noteNameFromMidi(midi, naming) {
  const pc = midi % 12;
  return `${pitchClassName(pc, naming)}${midiOctave(midi)}`;
}

function transposeForInstrument(concertMidi, instrumentKey) {
  const inst = INSTRUMENTS[instrumentKey] || INSTRUMENTS.piano;
  return concertMidi + inst.semitoneShift + 12 * inst.octaveShift;
}

function displayNoteForMidi(concertMidi) {
  if (concertMidi === null || concertMidi === undefined) return null;
  const written = transposeForInstrument(concertMidi, state.instrument);
  return noteNameFromMidi(written, state.naming);
}

// ===================== Saxophone fingering chart =====================

const SAX_FAMILY = ['altoSax', 'bariSax', 'tenorSax', 'sopranoSax'];

function isSaxInstrument(instrumentKey) {
  return SAX_FAMILY.includes(instrumentKey);
}

let highlightedConcertMidi = null;

function updateFingeringDisplay(concertMidi) {
  highlightedConcertMidi = concertMidi === null || concertMidi === undefined ? null : concertMidi;
  applyFingeringHighlight();
}

function applyFingeringHighlight() {
  const itemsEl = document.getElementById('fingeringListItems');
  if (!itemsEl) return;
  itemsEl.querySelectorAll('.fingering-list-item.active').forEach(el => el.classList.remove('active'));

  if (!isSaxInstrument(state.instrument) || highlightedConcertMidi === null) return;

  const written = transposeForInstrument(highlightedConcertMidi, state.instrument);
  const el = itemsEl.querySelector(`.fingering-list-item[data-written="${written}"]`);
  if (el) el.classList.add('active');
}

function refreshFingeringForActiveWord() {
  if (!activeWordRef) { updateFingeringDisplay(null); return; }
  const word = state.lines[activeWordRef.line][activeWordRef.word];
  updateFingeringDisplay(word && word.note !== null && word.note !== undefined ? word.note : null);
}

function refreshFingeringList() {
  const panel = document.getElementById('fingeringListPanel');
  const itemsEl = document.getElementById('fingeringListItems');

  if (!isSaxInstrument(state.instrument)) {
    panel.hidden = true;
    return;
  }

  const concertNotes = new Set();
  state.lines.forEach(line => line.forEach(w => {
    if (w.note !== null && w.note !== undefined) concertNotes.add(w.note);
  }));

  if (concertNotes.size === 0) {
    panel.hidden = true;
    return;
  }

  const writtenNotes = [...new Set([...concertNotes].map(m => transposeForInstrument(m, state.instrument)))];
  writtenNotes.sort((a, b) => a - b);

  panel.hidden = false;
  itemsEl.innerHTML = '';
  writtenNotes.forEach(written => {
    const item = document.createElement('div');
    item.className = 'fingering-list-item';
    item.dataset.written = written;

    const label = document.createElement('div');
    label.className = 'fli-note';
    label.textContent = noteNameFromMidi(written, 'letter');
    item.appendChild(label);

    const idx = written - SAX_FINGERING_BASE_MIDI;
    if (idx < 0 || idx >= SAX_FINGERING_IMAGES.length) {
      const oor = document.createElement('div');
      oor.className = 'fli-oor';
      oor.textContent = 'ngoài phạm vi';
      item.appendChild(oor);
    } else {
      const img = document.createElement('img');
      img.src = SAX_FINGERING_IMAGES[idx];
      img.alt = noteNameFromMidi(written, 'letter');
      item.appendChild(img);
    }

    item.addEventListener('click', () => {
      const concertMidi = written - (INSTRUMENTS[state.instrument].semitoneShift + 12 * INSTRUMENTS[state.instrument].octaveShift);
      playNote(concertMidi);
      updateFingeringDisplay(concertMidi);
    });

    itemsEl.appendChild(item);
  });

  applyFingeringHighlight();
}

// ===================== Scale helpers =====================

function isInScale(midi) {
  const pc = ((midi % 12) + 12) % 12;
  const rel = ((pc - state.scaleRoot) + 12) % 12;
  return SCALES[state.scaleType].steps.includes(rel);
}

function isRoot(midi) {
  return ((midi % 12) + 12) % 12 === state.scaleRoot;
}

// ===================== Transpose (change key) =====================

function transposeSong(semitones) {
  state.lines.forEach(line => line.forEach(w => {
    if (w.note !== null && w.note !== undefined) w.note += semitones;
  }));
  state.scaleRoot = ((state.scaleRoot + semitones) % 12 + 12) % 12;
  state.songKey = ((state.songKey + semitones) % 12 + 12) % 12;

  populateSelects();
  renderAll();
}

// ===================== Lyrics model =====================

function parseLyricsText(text) {
  const rawLines = text.split('\n');
  return rawLines
    .filter(l => l.trim().length > 0 || rawLines.length === 1)
    .map(line => line.trim().split(/\s+/).filter(w => w.length > 0).map(w => ({ text: w, note: null })));
}

function lyricsToText() {
  return state.lines.map(line => line.map(w => w.text).join(' ')).join('\n');
}

function applyNewLyricsPreservingNotes(text) {
  const newLines = parseLyricsText(text);
  for (let li = 0; li < newLines.length; li++) {
    const oldLine = state.lines[li];
    if (!oldLine) continue;
    for (let wi = 0; wi < newLines[li].length; wi++) {
      const oldWord = oldLine[wi];
      if (oldWord && oldWord.text === newLines[li][wi].text) {
        newLines[li][wi].note = oldWord.note;
      }
    }
  }
  state.lines = newLines;
  activeWordRef = null;
}

// ===================== Rendering: Piano =====================

function isBlackKey(midi) {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}

const COMPUTER_KEY_OFFSETS = {
  'a': 0, 'w': 1, 's': 2, 'e': 3, 'd': 4, 'f': 5, 't': 6,
  'g': 7, 'y': 8, 'h': 9, 'u': 10, 'j': 11, 'k': 12,
  'o': 13, 'l': 14, 'p': 15, ';': 16,
};

function renderPiano() {
  const piano = document.getElementById('piano');
  piano.innerHTML = '';

  const whiteKeys = [];
  for (let midi = MIDI_MIN; midi <= MIDI_MAX; midi++) {
    if (!isBlackKey(midi)) whiteKeys.push(midi);
  }

  const WHITE_W = 40, BLACK_W = 26;

  whiteKeys.forEach((midi, idx) => {
    const key = document.createElement('div');
    key.className = 'key white';
    key.dataset.midi = midi;
    if (isInScale(midi)) key.classList.add('in-scale');
    if (isRoot(midi)) key.classList.add('root');
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = noteNameFromMidi(midi, state.naming);
    key.appendChild(label);
    key.style.left = (idx * WHITE_W) + 'px';
    attachKeyHandlers(key, midi);
    piano.appendChild(key);
  });
  piano.style.width = (whiteKeys.length * WHITE_W) + 'px';

  for (let midi = MIDI_MIN; midi <= MIDI_MAX; midi++) {
    if (!isBlackKey(midi)) continue;
    // position: count white keys before this midi
    let whiteBefore = 0;
    for (let m = MIDI_MIN; m < midi; m++) if (!isBlackKey(m)) whiteBefore++;
    const key = document.createElement('div');
    key.className = 'key black';
    key.dataset.midi = midi;
    if (isInScale(midi)) key.classList.add('in-scale');
    if (isRoot(midi)) key.classList.add('root');
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = noteNameFromMidi(midi, state.naming);
    key.appendChild(label);
    key.style.left = (whiteBefore * WHITE_W - BLACK_W / 2) + 'px';
    attachKeyHandlers(key, midi);
    piano.appendChild(key);
  }
}

function attachKeyHandlers(el, midi) {
  el.addEventListener('mousedown', () => onKeyPress(midi, el));
}

function onKeyPress(midi, el) {
  playNote(midi);
  flashKey(el);
  if (activeWordRef) {
    assignNoteToActiveWord(midi);
  }
  updateFingeringDisplay(midi);
}

function flashKey(el) {
  el.classList.add('pressed');
  setTimeout(() => el.classList.remove('pressed'), 150);
}

function flashKeyByMidi(midi) {
  const el = document.querySelector(`.key[data-midi="${midi}"]`);
  if (el) flashKey(el);
}

// ===================== Rendering: Lyrics =====================

function renderLyrics() {
  const view = document.getElementById('lyricsView');
  view.innerHTML = '';

  if (state.lines.length === 0) {
    view.innerHTML = '<p class="hint">Chưa có lời bài hát. Bấm "Sửa lời" để nhập.</p>';
    refreshFingeringForActiveWord();
    refreshFingeringList();
    return;
  }

  state.lines.forEach((line, li) => {
    const lineEl = document.createElement('div');
    lineEl.className = 'lyric-line';
    line.forEach((word, wi) => {
      const wordEl = document.createElement('div');
      wordEl.className = 'lyric-word';
      if (activeWordRef && activeWordRef.line === li && activeWordRef.word === wi) {
        wordEl.classList.add('active');
      }
      const textEl = document.createElement('div');
      textEl.className = 'word-text';
      textEl.textContent = word.text;

      const noteEl = document.createElement('div');
      const displayed = displayNoteForMidi(word.note);
      noteEl.className = 'word-note' + (displayed ? '' : ' empty');
      noteEl.textContent = displayed || '·';

      wordEl.appendChild(textEl);
      wordEl.appendChild(noteEl);
      wordEl.addEventListener('click', () => setActiveWord(li, wi));
      lineEl.appendChild(wordEl);
    });
    view.appendChild(lineEl);
  });

  updateActiveWordIndicator();
  refreshFingeringForActiveWord();
  refreshFingeringList();
}

function setActiveWord(li, wi) {
  activeWordRef = { line: li, word: wi };
  renderLyrics();
  playActiveWordNote();
}

function playActiveWordNote() {
  if (!activeWordRef) return;
  const word = state.lines[activeWordRef.line][activeWordRef.word];
  if (word && word.note !== null && word.note !== undefined) {
    playNote(word.note);
    flashKeyByMidi(word.note);
    updateFingeringDisplay(word.note);
  }
}

function updateActiveWordIndicator() {
  const indicator = document.getElementById('activeWordIndicator');
  if (activeWordRef) {
    const w = state.lines[activeWordRef.line][activeWordRef.word];
    indicator.textContent = `Đang chọn: "${w.text}" — bấm phím đàn để gán nốt`;
  } else {
    indicator.textContent = '';
  }
}

function assignNoteToActiveWord(concertMidi) {
  const { line, word } = activeWordRef;
  state.lines[line][word].note = concertMidi;
  advanceActiveWord();
  renderLyrics();
}

function advanceActiveWord() {
  const { line, word } = activeWordRef;
  if (word + 1 < state.lines[line].length) {
    activeWordRef = { line, word: word + 1 };
  } else if (line + 1 < state.lines.length && state.lines[line + 1].length > 0) {
    activeWordRef = { line: line + 1, word: 0 };
  } else {
    activeWordRef = null;
  }
}

function moveActiveWordHorizontal(dir) {
  if (!activeWordRef) {
    const li = dir > 0 ? state.lines.findIndex(l => l.length > 0) : findLastIndex(state.lines, l => l.length > 0);
    if (li === -1) return;
    activeWordRef = { line: li, word: dir > 0 ? 0 : state.lines[li].length - 1 };
    return;
  }
  const { line, word } = activeWordRef;
  if (dir > 0) {
    if (word + 1 < state.lines[line].length) {
      activeWordRef = { line, word: word + 1 };
      return;
    }
    for (let li = line + 1; li < state.lines.length; li++) {
      if (state.lines[li].length > 0) { activeWordRef = { line: li, word: 0 }; return; }
    }
  } else {
    if (word - 1 >= 0) {
      activeWordRef = { line, word: word - 1 };
      return;
    }
    for (let li = line - 1; li >= 0; li--) {
      if (state.lines[li].length > 0) { activeWordRef = { line: li, word: state.lines[li].length - 1 }; return; }
    }
  }
}

function moveActiveWordVertical(dir) {
  if (!activeWordRef) {
    const li = dir > 0 ? state.lines.findIndex(l => l.length > 0) : findLastIndex(state.lines, l => l.length > 0);
    if (li === -1) return;
    activeWordRef = { line: li, word: 0 };
    return;
  }
  const { line, word } = activeWordRef;
  for (let li = line + dir; li >= 0 && li < state.lines.length; li += dir) {
    if (state.lines[li].length > 0) {
      activeWordRef = { line: li, word: Math.min(word, state.lines[li].length - 1) };
      return;
    }
  }
}

function findLastIndex(arr, pred) {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return i;
  return -1;
}

function scrollActiveWordIntoView() {
  const el = document.querySelector('.lyric-word.active');
  if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// ===================== Toolbars / selects setup =====================

function populateSelects() {
  const scaleRootSel = document.getElementById('scaleRoot');
  scaleRootSel.innerHTML = '';
  for (let pc = 0; pc < 12; pc++) {
    const opt = document.createElement('option');
    opt.value = pc;
    opt.textContent = pitchClassName(pc, state.naming);
    scaleRootSel.appendChild(opt);
  }
  scaleRootSel.value = state.scaleRoot;

  const scaleTypeSel = document.getElementById('scaleType');
  scaleTypeSel.innerHTML = '';
  Object.entries(SCALES).forEach(([key, s]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = s.label;
    scaleTypeSel.appendChild(opt);
  });
  scaleTypeSel.value = state.scaleType;

  const instrumentSel = document.getElementById('instrument');
  instrumentSel.innerHTML = '';
  Object.entries(INSTRUMENTS).forEach(([key, inst]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = inst.label;
    instrumentSel.appendChild(opt);
  });
  instrumentSel.value = state.instrument;

  const songKeySel = document.getElementById('songKey');
  songKeySel.innerHTML = '';
  for (let pc = 0; pc < 12; pc++) {
    const opt = document.createElement('option');
    opt.value = pc;
    opt.textContent = pitchClassName(pc, state.naming);
    songKeySel.appendChild(opt);
  }
  songKeySel.value = state.songKey;

  document.getElementById('naming').value = state.naming;
}

// ===================== Songs: Supabase persistence =====================

const SUPABASE_URL = 'https://thvhoethafeeytxjktbp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XsSjB7Nw31OO5bB4TTBQ-Q_cUMiRk7c';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let cachedSongs = [];

function songToDbRow(song) {
  return {
    id: song.id,
    title: song.title,
    lines: song.lines,
    scale_root: song.scaleRoot,
    scale_type: song.scaleType,
    instrument: song.instrument,
    naming: song.naming,
    song_key: song.songKey,
    updated_at: new Date().toISOString(),
  };
}

function dbRowToSong(row) {
  return {
    id: row.id,
    title: row.title,
    lines: row.lines || [],
    scaleRoot: row.scale_root,
    scaleType: row.scale_type,
    instrument: row.instrument,
    naming: row.naming,
    songKey: row.song_key || 0,
  };
}

async function fetchAllSongs() {
  const { data, error } = await supabaseClient
    .from('songs')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) {
    console.error(error);
    alert('Không tải được danh sách bài hát từ Supabase: ' + error.message);
    return [];
  }
  return data.map(dbRowToSong);
}

async function refreshSongSelect() {
  const sel = document.getElementById('songSelect');
  sel.innerHTML = '<option value="">-- Đang tải... --</option>';
  cachedSongs = await fetchAllSongs();
  sel.innerHTML = '<option value="">-- Danh sách bài hát --</option>';
  cachedSongs.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.title;
    sel.appendChild(opt);
  });
  if (state.id) sel.value = state.id;
}

function serializeCurrentSong() {
  return {
    id: state.id || `song_${Date.now()}`,
    title: document.getElementById('songTitle').value || 'Bài hát mới',
    lines: state.lines,
    scaleRoot: state.scaleRoot,
    scaleType: state.scaleType,
    instrument: state.instrument,
    naming: state.naming,
    songKey: state.songKey,
  };
}

async function saveCurrentSong() {
  const serialized = serializeCurrentSong();
  state.id = serialized.id;
  const { error } = await supabaseClient.from('songs').upsert(songToDbRow(serialized));
  if (error) {
    alert('Lỗi khi lưu lên Supabase: ' + error.message);
    return;
  }
  await refreshSongSelect();
  alert('Đã lưu bài hát lên Supabase!');
}

async function loadSong(id) {
  let song = cachedSongs.find(s => s.id === id);
  if (!song) {
    const { data, error } = await supabaseClient.from('songs').select('*').eq('id', id).single();
    if (error || !data) {
      alert('Không tìm thấy bài hát trên Supabase.');
      return;
    }
    song = dbRowToSong(data);
  }
  state = {
    id: song.id,
    title: song.title,
    lines: song.lines,
    scaleRoot: song.scaleRoot,
    scaleType: song.scaleType,
    instrument: song.instrument,
    naming: song.naming,
    songKey: song.songKey || 0,
  };
  activeWordRef = null;
  document.getElementById('songTitle').value = state.title;
  document.getElementById('lyricsEditor').value = lyricsToText();
  populateSelects();
  renderAll();
}

function newSong() {
  state = {
    id: null,
    title: 'Bài hát mới',
    lines: [],
    scaleRoot: 0,
    scaleType: 'major',
    instrument: 'piano',
    naming: 'letter',
    songKey: 0,
  };
  activeWordRef = null;
  document.getElementById('songTitle').value = state.title;
  document.getElementById('lyricsEditor').value = '';
  document.getElementById('songSelect').value = '';
  populateSelects();
  renderAll();
}

async function deleteCurrentSong() {
  if (!state.id) return;
  if (!confirm('Xoá bài hát này khỏi Supabase?')) return;
  const { error } = await supabaseClient.from('songs').delete().eq('id', state.id);
  if (error) {
    alert('Lỗi khi xoá: ' + error.message);
    return;
  }
  newSong();
  await refreshSongSelect();
}

function exportSong() {
  const data = serializeCurrentSong();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.title.replace(/[^\w\-]+/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importSongFile(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const song = JSON.parse(reader.result);
      song.id = `song_${Date.now()}`;
      const { error } = await supabaseClient.from('songs').upsert(songToDbRow(song));
      if (error) throw error;
      await refreshSongSelect();
      await loadSong(song.id);
    } catch (e) {
      alert('File không hợp lệ hoặc lỗi khi nhập lên Supabase: ' + e.message);
    }
  };
  reader.readAsText(file);
}

// ===================== Wiring =====================

function renderAll() {
  renderPiano();
  renderLyrics();
}

async function initUI() {
  populateSelects();
  refreshSongSelect();
  document.getElementById('lyricsEditor').value = lyricsToText();
  renderAll();

  document.getElementById('btnToggleEdit').addEventListener('click', () => {
    const editor = document.getElementById('lyricsEditor');
    const view = document.getElementById('lyricsView');
    if (editor.hidden) {
      editor.value = lyricsToText();
      editor.hidden = false;
      view.hidden = true;
    } else {
      applyNewLyricsPreservingNotes(editor.value);
      editor.hidden = true;
      view.hidden = false;
      renderLyrics();
    }
  });

  document.getElementById('btnClearNotes').addEventListener('click', () => {
    if (!confirm('Xoá hết nốt đã gán cho lời bài hát này?')) return;
    state.lines.forEach(line => line.forEach(w => w.note = null));
    activeWordRef = null;
    renderLyrics();
  });

  document.getElementById('transposeDown').addEventListener('click', () => transposeSong(-1));
  document.getElementById('transposeUp').addEventListener('click', () => transposeSong(1));
  document.getElementById('songKey').addEventListener('change', e => {
    const newKey = parseInt(e.target.value, 10);
    let diff = newKey - state.songKey;
    if (diff > 6) diff -= 12;
    if (diff < -6) diff += 12;
    if (diff !== 0) transposeSong(diff);
  });

  document.getElementById('scaleRoot').addEventListener('change', e => {
    state.scaleRoot = parseInt(e.target.value, 10);
    renderPiano();
  });
  document.getElementById('scaleType').addEventListener('change', e => {
    state.scaleType = e.target.value;
    renderPiano();
  });
  document.getElementById('instrument').addEventListener('change', e => {
    state.instrument = e.target.value;
    renderLyrics();
  });
  document.getElementById('naming').addEventListener('change', e => {
    state.naming = e.target.value;
    populateSelects();
    renderAll();
  });

  document.getElementById('btnNew').addEventListener('click', newSong);
  document.getElementById('btnSave').addEventListener('click', saveCurrentSong);
  document.getElementById('btnDelete').addEventListener('click', deleteCurrentSong);
  document.getElementById('btnExport').addEventListener('click', exportSong);
  document.getElementById('songSelect').addEventListener('change', e => {
    if (e.target.value) loadSong(e.target.value);
  });
  document.getElementById('fileImport').addEventListener('change', e => {
    if (e.target.files[0]) importSongFile(e.target.files[0]);
    e.target.value = '';
  });

  document.getElementById('octaveDown').addEventListener('click', () => {
    baseOctaveNote = Math.max(MIDI_MIN, baseOctaveNote - 12);
    updateBaseOctaveLabel();
  });
  document.getElementById('octaveUp').addEventListener('click', () => {
    baseOctaveNote = Math.min(MIDI_MAX - 12, baseOctaveNote + 12);
    updateBaseOctaveLabel();
  });

  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const key = e.key.toLowerCase();

    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
      e.preventDefault();
      if (key === 'arrowright') moveActiveWordHorizontal(1);
      else if (key === 'arrowleft') moveActiveWordHorizontal(-1);
      else if (key === 'arrowdown') moveActiveWordVertical(1);
      else if (key === 'arrowup') moveActiveWordVertical(-1);
      renderLyrics();
      scrollActiveWordIntoView();
      playActiveWordNote();
      return;
    }

    if (key in COMPUTER_KEY_OFFSETS) {
      const midi = baseOctaveNote + COMPUTER_KEY_OFFSETS[key];
      if (midi >= MIDI_MIN && midi <= MIDI_MAX) {
        onKeyPress(midi, document.querySelector(`.key[data-midi="${midi}"]`));
      }
    }
  });

  updateBaseOctaveLabel();
}

function updateBaseOctaveLabel() {
  document.getElementById('baseOctaveLabel').textContent =
    `Bàn phím máy tính: bát độ gốc ${noteNameFromMidi(baseOctaveNote, 'letter')} (phím A)`;
}

document.addEventListener('DOMContentLoaded', initUI);
