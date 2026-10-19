(() => {
  const STORAGE_KEY = 'post-event-report-v1';
  const $ = (s) => document.querySelector(s);

  const form = $('#form');
  const report = $('#report');
  const winnersBox = $('#winners');
  const winnerTpl = $('#winnerRow');
  const viceBox = $('#viceHeads');
  const viceTpl = $('#viceRow');
  const addViceBtn = $('#addVice');
  const MAX_VICE = 3;
  let winners = [];
  let viceHeads = [{ name: '', vtu: '' }];

  /* ---------- helpers ---------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const val = (s) => (s ? esc(s) : '<span class="blank"></span>');
  const para = (s) => (s ? `<div class="para">${esc(s)}</div>` : '<div class="blank-lines"></div>');
  const words = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);

  const fmtDate = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };
  const fmtTime = (t) => {
    if (!t) return '';
    let [h, m] = t.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ap}`;
  };
  // "24996" -> "VTU24996"; leaves already-prefixed values alone
  const withPrefix = (id, prefix) => (/^\d+$/.test(id) ? prefix + id : id.toUpperCase());
  // People's names: "R.JAYASURYA" -> "R.Jayasurya", "dr. s.p. kumar" -> "Dr. S.P. Kumar"
  const nameCase = (s) => s.toLowerCase()
    .replace(/^(dr|prof|mr|mrs|ms)\.(?=\S)/, '$1. ') // "DR.THILAGAM" -> "dr. thilagam"
    .replace(/(^|[\s.\-'(])([a-z])/g, (m, a, b) => a + b.toUpperCase());
  // Titles: "AI FORGE EXPO" -> "AI Forge Expo". Known acronyms stay in capitals, and
  // deliberate mixed case ("GitHub", "iOS") is kept when the title isn't typed in all caps/lowercase.
  const ACRONYMS = new Set(['AI', 'ML', 'AIML', 'DL', 'DS', 'NLP', 'LLM', 'GPT', 'CV', 'IOT', 'CSE', 'ECE', 'EEE', 'IT',
    'UI', 'UX', 'AR', 'VR', 'XR', 'API', 'DSA', 'SQL', 'AWS', 'HTML', 'CSS', 'JS', 'GDG', 'IEEE', 'ACM', 'CSI', 'CTF',
    'R&D', '2D', '3D', 'NSS', 'NCC', 'SDG', 'DIY', 'QA', 'HR', 'PPT', 'MCQ', 'CCC', 'VTU']);
  const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'vs', 'via', 'with']);
  const titleCase = (s) => {
    const uniform = s === s.toUpperCase() || s === s.toLowerCase();
    let first = true;
    return s.split(/(\s+)/).map((w) => {
      if (!w.trim()) return w;
      const isFirst = first;
      first = false;
      if (ACRONYMS.has(w.replace(/[^A-Za-z0-9&]/g, '').toUpperCase())) return w.toUpperCase();
      if (!uniform && /[A-Z]/.test(w.slice(1))) return w;
      const lw = w.toLowerCase();
      if (!isFirst && SMALL.has(lw)) return lw;
      return lw.replace(/(^|[\-.'(/])([a-z])/g, (m, a, b) => a + b.toUpperCase());
    }).join('');
  };
  const fmtMoney = (n) => (n === '' ? '' : '₹ ' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }));

  /* ---------- form <-> data ---------- */
  function readForm() {
    const d = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'radio') {
        if (el.checked) d[el.name] = el.value;
        else if (!(el.name in d)) d[el.name] = '';
      } else if (el.type === 'checkbox') {
        (d[el.name] ||= []);
        if (el.checked) d[el.name].push(el.value);
      } else {
        d[el.name] = el.value.trim();
      }
    }
    d.winners = winners.filter((w) => Object.values(w).some(Boolean));
    d.viceHeads = viceHeads.map((v) => ({ ...v }));
    return d;
  }

  function writeForm(d) {
    for (const el of form.elements) {
      if (!el.name || !(el.name in d)) continue;
      if (el.type === 'radio') el.checked = d[el.name] === el.value;
      else if (el.type === 'checkbox') el.checked = (d[el.name] || []).includes(el.value);
      else el.value = d[el.name];
    }
    winners = Array.isArray(d.winners) ? d.winners : [];
    if (Array.isArray(d.viceHeads) && d.viceHeads.length) viceHeads = d.viceHeads.slice(0, MAX_VICE);
    else if (d.viceName || d.viceVtu) viceHeads = [{ name: d.viceName || '', vtu: d.viceVtu || '' }]; // older saves
  }

  /* ---------- winners ---------- */
  function renderWinners() {
    winnersBox.innerHTML = '';
    winners.forEach((w, i) => {
      const row = winnerTpl.content.firstElementChild.cloneNode(true);
      row.querySelectorAll('[data-k]').forEach((inp) => {
        inp.value = w[inp.dataset.k] || '';
        inp.addEventListener('input', () => { w[inp.dataset.k] = inp.value.trim(); update(); });
      });
      row.querySelector('.remove').addEventListener('click', () => {
        winners.splice(i, 1);
        renderWinners();
        update();
      });
      winnersBox.appendChild(row);
    });
  }

  $('#addWinner').addEventListener('click', () => {
    winners.push({ position: '', vtu: '', name: '', dept: '', year: '' });
    renderWinners();
    winnersBox.lastElementChild.querySelector('input').focus();
  });

  /* ---------- vice heads ---------- */
  function renderVices() {
    viceBox.innerHTML = '';
    viceHeads.forEach((v, i) => {
      const row = viceTpl.content.firstElementChild.cloneNode(true);
      row.querySelectorAll('[data-k]').forEach((inp) => {
        inp.value = v[inp.dataset.k] || '';
        inp.addEventListener('input', () => { v[inp.dataset.k] = inp.value.trim(); update(); });
      });
      const rm = row.querySelector('.remove');
      if (i === 0) rm.style.visibility = 'hidden'; // at least one vice head is required
      rm.addEventListener('click', () => {
        viceHeads.splice(i, 1);
        renderVices();
        update();
      });
      viceBox.appendChild(row);
    });
    addViceBtn.hidden = viceHeads.length >= MAX_VICE;
  }

  addViceBtn.addEventListener('click', () => {
    viceHeads.push({ name: '', vtu: '' });
    renderVices();
    update();
    viceBox.lastElementChild.querySelector('input').focus();
  });

  /* ---------- uploads: annexures & event photos ---------- */
  // Photos are downscaled and PDFs split into page images right here in the browser, then
  // kept in IndexedDB so a refresh doesn't lose them. Nothing is sent to any server.
  const SECTIONS = { attendance: 'Attendance Sheet', feedback: 'Participant Feedback Report', jury: 'Jury Evaluation Sheets' };
  const files = { attendance: [], feedback: [], jury: [] };
  const photos = [null, null, null];
  const MAX_SIDE = 2000; // px on the long side: ~300 dpi across the printed area
  const MAX_PAGES = 30;  // per annexure
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  let busy = 0;
  let seq = Date.now();

  const idb = (() => {
    let dbp;
    const open = () => (dbp ||= new Promise((res, rej) => {
      const r = indexedDB.open('event-report', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const tx = async (mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction('files', mode);
        const req = fn(t.objectStore('files'));
        t.oncomplete = () => res(req.result);
        t.onerror = () => rej(t.error);
      });
    };
    const safe = (p) => p.catch(() => undefined); // storage is a convenience; never block the form on it
    return {
      put: (rec) => safe(tx('readwrite', (st) => st.put(rec))),
      del: (id) => safe(tx('readwrite', (st) => st.delete(id))),
      all: () => safe(tx('readonly', (st) => st.getAll())),
      clear: () => safe(tx('readwrite', (st) => st.clear())),
    };
  })();

  const toJpeg = (canvas) => new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', 0.88));

  function whiteCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.round(w);
    c.height = Math.round(h);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; // transparent PNGs and PDFs print on white
    g.fillRect(0, 0, c.width, c.height);
    return [c, g];
  }

  async function imageToBlob(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const [c, g] = whiteCanvas(img.naturalWidth * k, img.naturalHeight * k);
      g.drawImage(img, 0, 0, c.width, c.height);
      return await toJpeg(c);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  let pdfjsReady;
  const loadPdfJs = () => (pdfjsReady ||= new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = PDFJS + 'pdf.min.js';
    sc.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
      res(window.pdfjsLib);
    };
    sc.onerror = () => { pdfjsReady = null; rej(new Error('PDF reader could not load')); };
    document.head.appendChild(sc);
  }));

  async function pdfToBlobs(file) {
    const pdfjs = await loadPdfJs();
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const out = [];
    for (let i = 1; i <= Math.min(doc.numPages, MAX_PAGES); i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: MAX_SIDE / Math.max(base.width, base.height) });
      const [c, g] = whiteCanvas(vp.width, vp.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      out.push(await toJpeg(c));
    }
    doc.destroy();
    return out;
  }

  const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
  const blockFor = (section) => document.querySelector(`.upload-block[data-section="${section}"]`);

  function setStatus(section, msg, isError) {
    const el = blockFor(section).querySelector('.upload-status');
    el.hidden = !msg;
    el.textContent = msg;
    el.classList.toggle('error', !!isError);
  }

  async function addFiles(section, list) {
    list = [...list];
    if (!list.length) return;
    busy++;
    setStatus(section, `Processing ${list.length} file${list.length > 1 ? 's' : ''}…`);
    const failed = [];
    for (const f of list) {
      try {
        const blobs = isPdf(f) ? await pdfToBlobs(f) : [await imageToBlob(f)];
        for (const [i, blob] of blobs.entries()) {
          if (files[section].length >= MAX_PAGES) break;
          const rec = { id: 'f' + (seq++).toString(36), section, order: seq, name: blobs.length > 1 ? `${f.name} · page ${i + 1}` : f.name, blob };
          idb.put(rec);
          files[section].push({ ...rec, url: URL.createObjectURL(blob) });
        }
      } catch (e) {
        failed.push(f.name);
      }
    }
    busy--;
    setStatus(section, failed.length ? `Couldn't read ${failed.join(', ')}. Please upload JPG, PNG or PDF files.` : '', true);
    renderThumbs(section);
    update();
  }

  function removeFile(section, id) {
    const i = files[section].findIndex((f) => f.id === id);
    if (i < 0) return;
    URL.revokeObjectURL(files[section][i].url);
    files[section].splice(i, 1);
    idb.del(id);
    renderThumbs(section);
    update();
  }

  function renderThumbs(section) {
    blockFor(section).querySelector('.thumbs').replaceChildren(...files[section].map((f, i) => {
      const el = document.createElement('div');
      el.className = 'thumb';
      el.title = f.name;
      el.innerHTML = '<img alt=""><span class="thumb-no"></span><button type="button" class="thumb-remove" aria-label="Remove page">×</button>';
      el.querySelector('img').src = f.url;
      el.querySelector('.thumb-no').textContent = i + 1;
      el.querySelector('.thumb-remove').addEventListener('click', () => removeFile(section, f.id));
      return el;
    }));
  }

  const filePicker = $('#filePicker');
  let pickTarget = null;
  document.querySelectorAll('.upload-block').forEach((b) => {
    b.querySelector('.upload-add').addEventListener('click', () => {
      pickTarget = b.dataset.section;
      filePicker.value = '';
      filePicker.click();
    });
    // desktop: drop files straight onto a section
    b.addEventListener('dragover', (e) => { e.preventDefault(); b.classList.add('drag'); });
    b.addEventListener('dragleave', () => b.classList.remove('drag'));
    b.addEventListener('drop', (e) => {
      e.preventDefault();
      b.classList.remove('drag');
      addFiles(b.dataset.section, e.dataTransfer.files);
    });
  });
  filePicker.addEventListener('change', () => { if (pickTarget) addFiles(pickTarget, filePicker.files); });

  /* event photos: exactly three, one per slot */
  const photoPicker = $('#photoPicker');
  const photosError = $('#photosError');
  let photoTarget = 0;
  document.querySelectorAll('.photo-slot').forEach((slot) => {
    slot.querySelector('.photo-pick').addEventListener('click', () => {
      photoTarget = +slot.dataset.slot;
      photoPicker.value = '';
      photoPicker.click();
    });
  });
  photoPicker.addEventListener('change', async () => {
    const f = photoPicker.files[0];
    const slot = photoTarget;
    if (!f) return;
    busy++;
    photosError.hidden = false;
    photosError.classList.remove('error');
    photosError.textContent = 'Processing photo…';
    try {
      const blob = await imageToBlob(f);
      if (photos[slot]) URL.revokeObjectURL(photos[slot].url);
      const rec = { id: 'photo' + slot, section: 'photo', slot, name: f.name, blob };
      idb.put(rec);
      photos[slot] = { ...rec, url: URL.createObjectURL(blob) };
      photosError.hidden = true;
      photosError.textContent = '';
    } catch (e) {
      photosError.classList.add('error');
      photosError.textContent = `Couldn't read ${f.name}. Please choose a JPG or PNG photo.`;
    }
    busy--;
    renderPhotos();
    update();
  });

  function renderPhotos() {
    document.querySelectorAll('.photo-slot').forEach((slot) => {
      const i = +slot.dataset.slot;
      const btn = slot.querySelector('.photo-pick');
      btn.classList.toggle('has', !!photos[i]);
      btn.style.backgroundImage = photos[i] ? `url("${photos[i].url}")` : '';
      btn.querySelector('span').textContent = photos[i] ? 'Change photo' : `+ Photo ${i + 1}`;
    });
  }

  async function restoreUploads() {
    const recs = (await idb.all()) || [];
    recs.sort((a, b) => (a.order || 0) - (b.order || 0));
    for (const r of recs) {
      const item = { ...r, url: URL.createObjectURL(r.blob) };
      if (r.section === 'photo') photos[r.slot] = item;
      else if (files[r.section]) files[r.section].push(item);
    }
    Object.keys(files).forEach(renderThumbs);
    renderPhotos();
    update();
  }

  function clearUploads() {
    Object.values(files).forEach((list) => { list.forEach((f) => URL.revokeObjectURL(f.url)); list.length = 0; });
    photos.forEach((p, i) => { if (p) URL.revokeObjectURL(p.url); photos[i] = null; });
    idb.clear();
    Object.keys(files).forEach((sct) => { renderThumbs(sct); setStatus(sct, ''); });
    renderPhotos();
    photosError.hidden = true;
  }

  // the first required upload that's missing, as [element to show, message]
  function uploadProblem(d) {
    if (!files.attendance.length) return [blockFor('attendance'), 'Upload the attendance sheet (photos or PDF).'];
    if (!files.feedback.length) return [blockFor('feedback'), 'Upload the participant feedback report PDF.'];
    if (!d.juryNA.length && !files.jury.length) return [blockFor('jury'), 'Upload the jury evaluation sheets, or tick "Not applicable".'];
    const missing = photos.findIndex((p) => !p);
    if (missing >= 0) return [$('#photosCard'), `Add all 3 event photos (photo ${missing + 1} is missing).`];
    return null;
  }

  function markUploads(d) {
    const checked = form.classList.contains('checked');
    const na = !!d.juryNA.length;
    Object.keys(files).forEach((sct) => {
      const block = blockFor(sct);
      const off = sct === 'jury' && na;
      block.classList.toggle('na', off);
      block.classList.toggle('invalid', checked && !off && !files[sct].length);
    });
    document.querySelectorAll('.photo-slot').forEach((slot) => {
      slot.classList.toggle('invalid', checked && !photos[+slot.dataset.slot]);
    });
  }

  // report pages reuse one <img> per upload, so re-rendering on every keystroke doesn't re-decode images
  function imgFor(id) {
    const item = photos.find((p) => p && p.id === id) || Object.values(files).flat().find((f) => f.id === id);
    if (!item) return document.createElement('span');
    if (!item.el || item.el.src !== item.url) {
      item.el = new Image();
      item.el.alt = '';
      item.el.src = item.url;
    }
    return item.el;
  }

  /* ---------- report ---------- */
  // The report is built as a list of blocks, then poured into fixed A4 sheets
  // (see paginate) so the preview shows exactly the pages that will print.
  function buildReport(d) {
    const type = d.eventType === 'Other' && d.eventTypeOther ? d.eventTypeOther : d.eventType;
    const time = d.timeFrom || d.timeTo ? `${fmtTime(d.timeFrom)} – ${fmtTime(d.timeTo)}` : '';
    const media = d.media || [];
    const ph = (v, text) => (v ? esc(v) : `<span class="placeholder">${text}</span>`);
    const clubLine = ph(d.clubName, 'Club Name');
    const eventName = titleCase(d.eventName);
    const vtu = (id) => id && withPrefix(id, 'VTU');
    const tts = (id) => id && withPrefix(id, 'TTS');
    const check = (on, label) => `<span class="cb${on ? ' on' : ''}"></span>${label}`;

    // page numbers are filled in after pagination
    const footer = `
      <div class="foot-left">CSE Clubs Council &nbsp;·&nbsp; ${clubLine}</div>
      <div class="foot-right">${eventName ? esc(eventName) + ' &nbsp;·&nbsp; ' : ''}Page <span class="pg-no"></span> of <span class="pg-total"></span></div>`;

    /* ----- cover ----- */
    const coverSign = (name, role, id, idPh) => `
      <div class="sig">
        <div class="sig-line"></div>
        <p class="sig-name">${ph(name, 'Name')}</p>
        <p>${role}</p>
        <p class="sig-id">${ph(id, idPh)}</p>
      </div>`;
    const coverSigners = [
      coverSign(nameCase(d.headName), 'Club Head', vtu(d.headVtu), 'VTU*****'),
      ...d.viceHeads.map((v) => coverSign(nameCase(v.name), 'Club Vice-Head', vtu(v.vtu), 'VTU*****')),
      coverSign(nameCase(d.facultyName), 'Faculty Coordinator', tts(d.facultyTts), 'TTS****'),
    ];
    const kv = (rows) => `<table class="kv">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>`;

    const dense = coverSigners.length > 3 ? ' dense' : ''; // second row of signatures: tighten spacing
    const cover = `
      <div class="cover-inner${dense}">
      <div class="logos">
        <img class="vt" src="assets/veltech-logo.png" alt="Vel Tech University">
        <img class="ccc" src="assets/ccc-logo.png" alt="CSE Clubs Council">
      </div>
      <div class="school">
        <p class="school-name">School of Computing</p>
        <p class="dept-name">Department of Computer Science and Engineering</p>
      </div>
      <div class="title-block">
        <h1>EVENT REPORT</h1>
        <div class="ornament"></div>
        <p class="club-title">${clubLine}</p>
      </div>
      <h2 class="cap">Event Details</h2>
      ${kv([
        ['Club Name', val(d.clubName)],
        ['Event Name', val(eventName)],
        ['Event Type', val(type)],
        ['Event Category', val(d.eventCategory)],
        ['Event Date', val(fmtDate(d.eventDate))],
        ['Time of Conduct', val(time)],
        ['Mode of Event', val(d.mode)],
        ['Venue', val(d.venue)],
      ])}
      <div class="cover-signs">${coverSigners.join('')}</div>
      </div>`;

    /* ----- annexures (numbered in order, jury only when applicable) ----- */
    const roman = ['I', 'II', 'III'];
    const annexes = Object.keys(SECTIONS)
      .filter((sct) => sct !== 'jury' || !d.juryNA.length)
      .map((sct, i) => ({ section: sct, numeral: roman[i], title: SECTIONS[sct], items: files[sct] }));
    const ref = (sct) => annexes.find((a) => a.section === sct)?.numeral;
    const annexPages = annexes.flatMap((a) => {
      const pages = a.items.length ? a.items : [null];
      return pages.map((f, i) => `
        <div class="annex-head">
          <div>
            <p class="label">Annexure ${a.numeral}</p>
            <p class="annex-title">${a.title}</p>
          </div>
          <p class="annex-page">${pages.length > 1 ? `Page ${i + 1} of ${pages.length}` : ''}</p>
        </div>
        <div class="annex-frame">${f ? `<img data-ref="${f.id}" alt="">` : '<span class="placeholder">Not uploaded yet</span>'}</div>`);
    });

    /* ----- event photographs: one page, three figures ----- */
    const fig = (i) => {
      const p = photos[i];
      const desc = d[`photoDesc${i + 1}`];
      return `<figure class="fig">
        <div class="fig-frame">${p ? `<img data-ref="${p.id}" alt="">` : `<span class="placeholder">Photo ${i + 1}</span>`}</div>
        <figcaption><b>Figure ${i + 1}.</b> ${desc ? esc(desc.charAt(0).toUpperCase() + desc.slice(1)) : '<span class="placeholder">Description</span>'}</figcaption>
      </figure>`;
    };
    const photosPage = `
      <h2 class="section"><span class="num">6.</span>Event Photographs</h2>
      <div class="figs">${fig(0)}<div class="fig-row">${fig(1)}${fig(2)}</div></div>`;

    /* ----- content blocks ----- */
    const section = (n, title) => ({ html: `<h2 class="section" data-keep><span class="num">${n}.</span>${title}</h2>` });
    const sub = (title) => ({ html: `<h3 class="subhead" data-keep>${title}</h3>` });
    const facts = (rows) => ({ html: kv(rows) });
    const enclosure = (text) => ({ html: `<p class="enclosure"><b>Enclosure:</b> ${text}</p>` });
    // long text can break across pages, word by word
    const textField = (label, text) => (text
      ? {
          units: text.split(/(\s+)/),
          minUnits: 12,
          render: (u, first) => (first
            ? `<div class="rfield"><h3 class="subhead">${label}</h3><div class="para">${esc(u.join(''))}</div></div>`
            : `<div class="rfield"><div class="para">${esc(u.join('').replace(/^\s+/, ''))}</div></div>`),
        }
      : { html: `<div class="rfield"><h3 class="subhead">${label}</h3>${para('')}</div>` });

    const winnerRows = d.noWinners.length ? [] : d.winners.map((w, i) => `<tr>
      <td>${i + 1}</td><td>${esc(w.position)}</td><td>${esc(withPrefix(w.vtu, 'VTU'))}</td>
      <td>${esc(nameCase(w.name))}</td><td>${esc(w.dept.toUpperCase())}</td><td>${esc(w.year)}</td></tr>`);
    const winnersBlock = winnerRows.length
      ? {
          units: winnerRows,
          minUnits: 1,
          render: (rows, first) => `<div class="rfield">${first ? '<h3 class="subhead">Winners and Awardees</h3>' : ''}
            <table class="data">
              <thead><tr><th>S.No</th><th>Position / Award</th><th>VTU No.</th><th>Name</th><th>Dept.</th><th>Year</th></tr></thead>
              <tbody>${rows.join('')}</tbody>
            </table></div>`,
        }
      : facts([['Winners / Awardees', 'Nil']]);

    const links = [
      ['Drive', d.linkDrive], ['Instagram', d.linkInstagram],
      ['LinkedIn', d.linkLinkedIn], ['CCC Website', d.linkWebsite],
    ];

    const blocks = [
      section(1, 'Participation Details'),
      facts([
        ['Registered Participants', val(d.registered)],
        ['Participants Attended', val(d.attended)],
      ]),
      enclosure(`Attendance sheet — Annexure ${ref('attendance')}`),
      winnersBlock,
      ...(ref('jury') ? [enclosure(`Jury evaluation sheets — Annexure ${ref('jury')}`)] : []),

      section(2, 'Event Execution'),
      textField('Event Summary', d.briefReport),
      textField('Deviations from the Proposed Agenda', d.deviation),

      section(3, 'Financial Statement'),
      facts([
        ['Proposed Amount', val(fmtMoney(d.proposedAmount))],
        ['Actual Amount', val(fmtMoney(d.actualAmount))],
      ]),

      section(4, 'Outcomes &amp; Proof'),
      textField('Key Outcomes', d.outcomes),
      facts([['Average Feedback Rating', d.feedbackRating ? esc(d.feedbackRating) + ' / 5' : val('')]]),
      enclosure(`Participant feedback report from the CCC website — Annexure ${ref('feedback')}`),
      sub('Event Media Links'),
      { html: `<table class="kv links">${links.map(([k, u]) => `<tr><th>${k}</th><td>${u ? esc(u) : val('')}</td></tr>`).join('')}</table>` },
      facts([
        ['Media Coverage', `${check(media.includes('Instagram'), 'Instagram')}${check(media.includes('LinkedIn'), 'LinkedIn')}${check(media.includes('Website'), 'Website')}`],
        ['Certificates Distributed', `${check(d.certificates === 'Yes', 'Yes')}${check(d.certificates === 'No', 'No')}`],
      ]),

      section(5, 'Learnings &amp; Suggestions'),
      textField('Challenges Encountered', d.challenges),
      textField('Recommendations for Future Events', d.suggestions),
    ];

    /* ----- signatures ----- */
    const person = (name, lines, id) => `
      <div class="person">
        <p class="sig-name">${ph(name, 'Name')}</p>
        ${lines.map((l) => `<p>${l}</p>`).join('')}
        ${id ? `<p class="sig-id">${id}</p>` : ''}
        <p class="sig-date">Date:</p>
      </div>`;
    const submitters = [
      person(nameCase(d.headName), ['Club Head', clubLine], ph(vtu(d.headVtu), 'VTU*****')),
      ...d.viceHeads.map((v) => person(nameCase(v.name), ['Club Vice-Head', clubLine], ph(vtu(v.vtu), 'VTU*****'))),
      person(nameCase(d.facultyName),
        [ph(titleCase(d.facultyDesignation), 'Faculty Designation'), 'Faculty Coordinator', clubLine],
        ph(tts(d.facultyTts), 'TTS****')),
    ];
    const compact = submitters.length > 3 ? ' compact' : ''; // a second row of signers: tighten spacing

    const signs = [
      { html: `<div class="sig-block${compact}">
        <h2 class="section">Submitted By</h2>
        <div class="grid three${compact}">${submitters.join('')}</div>
      </div>` },
      { html: `<div class="sig-block${compact}">
        <h2 class="section">Verified By</h2>
        <div class="grid">
          ${person('Suja Suresh', ['Events Head', 'CSE Clubs Council'], 'VTU32424')}
          ${person('Cheedella Venkata Sai Charan', ['President', 'CSE Clubs Council'], 'VTU24996')}
        </div>
      </div>` },
      { html: `<div class="sig-block${compact}">
        <h2 class="section">Reviewed By</h2>
        <div class="grid">
          ${person('Dr. M. Kavitha', ['Professor &amp; Head of the Department', 'Computer Science and Engineering'])}
          ${person('Dr. S.P. Chokkalingam', ['Professor &amp; Dean', 'School of Computing'])}
        </div>
      </div>` },
    ];

    return { footer, cover, blocks, photosPage, signs, annexPages };
  }

  /* ---------- pagination ---------- */
  // Measured off-screen at real size, so it works even when the preview is hidden (mobile).
  const measure = document.createElement('div');
  measure.className = 'report measure';
  document.body.appendChild(measure);

  const toNode = (html) => {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };

  function paginate({ footer, cover, blocks, photosPage, signs, annexPages }) {
    measure.innerHTML = '';
    const newSheet = (cls) => {
      const sheet = toNode(`<section class="sheet ${cls}"><div class="sheet-body"></div><footer class="sheet-foot">${footer}</footer></section>`);
      measure.appendChild(sheet);
      return sheet.firstElementChild;
    };
    const fits = (body) => body.scrollHeight <= body.clientHeight + 1;

    // pour blocks into as many sheets of this kind as needed
    const pour = (list, cls) => {
      let body = newSheet(cls);
      const queue = list.map((b) => ({ ...b, first: true }));
      while (queue.length) {
        const b = queue.shift();
        const node = toNode(b.html ?? b.render(b.units, b.first));
        body.appendChild(node);
        if (fits(body)) continue;
        node.remove();

        // split long text / tables: largest piece that still fits on this page
        if (b.units) {
          let lo = b.minUnits, hi = b.units.length - 1, best = 0;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const trial = toNode(b.render(b.units.slice(0, mid), b.first));
            body.appendChild(trial);
            if (fits(body)) { best = mid; lo = mid + 1; } else hi = mid - 1;
            trial.remove();
          }
          if (best) {
            body.appendChild(toNode(b.render(b.units.slice(0, best), b.first)));
            queue.unshift({ ...b, units: b.units.slice(best), first: false });
            body = newSheet(cls);
            continue;
          }
        }

        if (!body.children.length) { body.appendChild(node); body = newSheet(cls); continue; } // too tall for any page
        // don't leave a heading stranded at the bottom of a page
        const carried = [];
        while (body.children.length > 1 && body.lastElementChild.hasAttribute('data-keep')) {
          const h = body.lastElementChild;
          h.remove();
          carried.unshift(h);
        }
        body = newSheet(cls);
        carried.forEach((n) => body.appendChild(n));
        queue.unshift(b);
      }
      if (!body.children.length) body.closest('.sheet').remove();
    };

    newSheet('cover').innerHTML = cover;
    pour(blocks, 'content');
    newSheet('photos').innerHTML = photosPage;
    annexPages.forEach((html) => { newSheet('annex').innerHTML = html; });
    pour(signs, 'signs'); // signatures close the document
    measure.querySelectorAll('img[data-ref]').forEach((ph) => ph.replaceWith(imgFor(ph.dataset.ref)));

    const sheets = [...measure.children];
    sheets.forEach((sh, i) => {
      sh.querySelector('.pg-no').textContent = i + 1;
      sh.querySelector('.pg-total').textContent = sheets.length;
    });
    report.replaceChildren(...sheets);
  }

  /* ---------- live update ---------- */
  const wordCount = $('#wordCount');
  const otherInput = $('#eventTypeOther');
  const venueInput = $('#venue');
  const noWinners = $('#noWinners');
  const mediaFirst = $('#mediaFirst');
  const addWinnerBtn = $('#addWinner');
  const timeTo = form.elements.timeTo;

  function update() {
    const d = readForm();

    otherInput.hidden = d.eventType !== 'Other';
    otherInput.required = d.eventType === 'Other';
    venueInput.placeholder = d.mode === 'Online' ? 'e.g. Google Meet / Zoom' : 'e.g. Seminar Hall, Block 4';

    // winners: either list them or explicitly say there were none
    winnersBox.hidden = addWinnerBtn.hidden = !!d.noWinners.length;
    noWinners.closest('label').hidden = winners.length > 0;
    noWinners.setCustomValidity(winners.length || d.noWinners.length ? '' : 'Add at least one winner, or tick "No winners".');
    timeTo.setCustomValidity(d.timeFrom && d.timeTo && d.timeTo <= d.timeFrom ? 'End time must be after the start time.' : '');
    mediaFirst.setCustomValidity(d.media.length ? '' : 'Tick at least one media coverage option.');

    const n = words(d.briefReport);
    wordCount.textContent = `${n} words · aim for 250–400`;
    wordCount.className = 'counter ' + (n === 0 ? '' : n >= 250 && n <= 400 ? 'ok' : 'warn');

    markUploads(d);
    paginate(buildReport(d));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch (e) { /* storage unavailable */ }
  }

  function fitPreview() {
    const scroll = report.parentElement;
    const sheetPx = 794; // 210mm at 96dpi
    const avail = scroll.clientWidth - 28; // minus side padding
    report.style.zoom = Math.min(1, avail / sheetPx);
  }

  form.addEventListener('input', update);
  form.addEventListener('change', update);
  window.addEventListener('resize', fitPreview);

  /* ---------- actions ---------- */
  async function download() {
    form.classList.add('checked');
    if (noWinners.checked) { winners = []; renderWinners(); update(); }
    if (!form.checkValidity()) {
      const first = form.querySelector(':invalid');
      document.body.classList.remove('show-preview');
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => first.focus({ preventScroll: true }), 300);
      alert('Please fill all required fields (marked in red) before downloading.');
      return;
    }
    if (busy) {
      alert('Your files are still being processed. Please wait a moment and try again.');
      return;
    }
    const d = readForm();
    update();
    const problem = uploadProblem(d);
    if (problem) {
      document.body.classList.remove('show-preview');
      problem[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      alert(problem[1]);
      return;
    }
    const n = words(d.briefReport);
    if ((n < 250 || n > 400) && !confirm(`The brief report has ${n} words; 250–400 is expected.\n\nDownload anyway?`)) return;

    const prevTitle = document.title;
    document.title = `Event Report - ${d.clubName} - ${titleCase(d.eventName)}`.replace(/[\\/:*?"<>|]/g, '');
    // make sure every photo and scanned page is decoded before the print snapshot
    await Promise.all([...report.querySelectorAll('img')].map((img) => img.decode().catch(() => {})));
    window.print();
    document.title = prevTitle;
  }

  $('#printBtn').addEventListener('click', download);
  $('#printBtn2').addEventListener('click', download);

  $('#resetBtn').addEventListener('click', () => {
    if (!confirm('Clear everything you have entered? This cannot be undone.')) return;
    form.reset();
    form.classList.remove('checked');
    winners = [];
    viceHeads = [{ name: '', vtu: '' }];
    renderWinners();
    renderVices();
    clearUploads();
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    update();
  });

  $('#previewBtn').addEventListener('click', () => {
    document.body.classList.add('show-preview');
    fitPreview();
  });
  $('#closePreview').addEventListener('click', () => document.body.classList.remove('show-preview'));

  /* ---------- init ---------- */
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved) writeForm(saved);
  } catch (e) { /* ignore bad or missing storage */ }
  renderWinners();
  renderVices();
  update();
  fitPreview();
  restoreUploads();
  // re-measure pages once the bundled report font has loaded
  if (document.fonts) document.fonts.ready.then(update);
})();
