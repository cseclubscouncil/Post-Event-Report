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
  const box = (on) => (on ? '☑' : '☐');
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
  const nameCase = (s) => s.toLowerCase().replace(/(^|[\s.\-'(])([a-z])/g, (m, a, b) => a + b.toUpperCase());
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

    const footer = `
      <div class="foot-left">CSE Clubs Council &nbsp;–&nbsp; ${clubLine}</div>
      <div class="foot-right">Post Event Report${eventName ? ' &nbsp;|&nbsp; ' + esc(eventName) : ''}</div>`;

    /* cover */
    const cover = `
      <div class="logos">
        <img class="vt" src="assets/veltech-logo.png" alt="Vel Tech University">
        <img class="ccc" src="assets/ccc-logo.png" alt="CSE Clubs Council">
      </div>
      <h1>POST EVENT REPORT</h1>
      <div class="details">
        <p><b>Club Name:</b> ${val(d.clubName)}</p>
        <p><b>Event Name:</b> ${val(eventName)}</p>
        <p><b>Event Type:</b> ${val(type)}</p>
        <p><b>Event Category:</b> ${val(d.eventCategory)}</p>
        <p><b>Event Date:</b> ${val(fmtDate(d.eventDate))}</p>
        <p><b>Time of Conduct:</b> ${val(time)}</p>
        <p><b>Mode of Event:</b> ${val(d.mode)}</p>
        <p><b>Venue:</b> ${val(d.venue)}</p>
      </div>`;

    /* content blocks */
    const item = (html) => ({ html: `<ul><li>${html}</li></ul>` });
    const heading = (html) => ({ html: `<h2>${html}</h2>`, keepWithNext: true });
    const note = (html) => ({ html: `<p class="note">${html}</p>` });
    // long text can break across pages, word by word
    const textItem = (label, text) => (text
      ? {
          units: text.split(/(\s+)/),
          minUnits: 12,
          render: (u, first) => (first
            ? `<ul><li>${label}<div class="para">${esc(u.join(''))}</div></li></ul>`
            : `<ul class="cont"><li><div class="para">${esc(u.join('').replace(/^\s+/, ''))}</div></li></ul>`),
        }
      : item(`${label}${para('')}`));

    const winnerRows = d.noWinners.length ? [] : d.winners.map((w) => `<tr>
      <td>${esc(w.position)}</td><td>${esc(withPrefix(w.vtu, 'VTU'))}</td>
      <td>${esc(nameCase(w.name))}</td><td>${esc(w.dept.toUpperCase())}</td><td>${esc(w.year)}</td></tr>`);
    const winnersBlock = winnerRows.length
      ? {
          units: winnerRows.map((r, i) => r.replace('<tr>', `<tr><td>${i + 1}</td>`)),
          minUnits: 1,
          render: (rows, first) => `<ul${first ? '' : ' class="cont"'}><li>${first ? 'Winners / Awardees Details:' : ''}
            <table class="winners-table">
              <thead><tr><th>S.No</th><th>Position / Award</th><th>VTU No.</th><th>Name</th><th>Dept.</th><th>Year</th></tr></thead>
              <tbody>${rows.join('')}</tbody>
            </table></li></ul>`,
        }
      : item('Winners / Awardees Details: Nil');

    const links = [
      ['Drive', d.linkDrive], ['Instagram', d.linkInstagram],
      ['LinkedIn', d.linkLinkedIn], ['Website', d.linkWebsite],
    ].filter(([, u]) => u);
    const linksHtml = links.length
      ? `<ul class="links">${links.map(([k, u]) => `<li><b>${k}:</b> ${esc(u)}</li>`).join('')}</ul>`
      : ' <span class="blank"></span>';

    const blocks = [
      heading('1.&nbsp;&nbsp;PARTICIPATION DETAILS'),
      item(`Registered Participants: ${val(d.registered)}`),
      item(`Actual Participants Attended: ${val(d.attended)}`),
      note('Attendance Sheet: Hard copy attached'),
      winnersBlock,

      heading('2.&nbsp;&nbsp;EVENT EXECUTION'),
      textItem('Brief Report of What Happened:', d.briefReport),
      textItem('Any Deviation from Proposed Agenda:', d.deviation),

      heading('3.&nbsp;&nbsp;FINANCIAL STATEMENT'),
      item(`Proposed Amount: ${val(fmtMoney(d.proposedAmount))}`),
      item(`Actual Amount: ${val(fmtMoney(d.actualAmount))}`),

      heading('4.&nbsp;&nbsp;OUTCOMES &amp; PROOF'),
      textItem('Key Outcomes Achieved:', d.outcomes),
      item(`Feedback Rating From Participants (Out of 5): ${d.feedbackRating ? esc(d.feedbackRating) + ' / 5' : val('')}`),
      note('Feedback Report (from CCC website): Hard copy attached'),
      item(`Event Photos Drive, Instagram, LinkedIn, Website Link:${linksHtml}`),
      item(`Media Coverage: ${box(media.includes('Instagram'))} Instagram&nbsp;&nbsp; ${box(media.includes('LinkedIn'))} LinkedIn&nbsp;&nbsp; ${box(media.includes('Website'))} Website`),
      item(`Certificates Distributed: ${box(d.certificates === 'Yes')} Yes&nbsp;&nbsp; ${box(d.certificates === 'No')} No`),

      heading('5.&nbsp;&nbsp;LEARNINGS &amp; SUGGESTIONS'),
      textItem('Challenges Faced:', d.challenges),
      textItem('Suggestions for Next Time:', d.suggestions),
    ];

    /* signatures */
    const person = (name, lines, id, idPh) => `
      <div class="person">
        <p><b>${ph(name, 'Name')}</b></p>
        ${lines.map((l) => `<p>${l}</p>`).join('')}
        <p>${ph(id, idPh)}</p>
        <p>Date:</p>
      </div>`;
    const vtu = (id) => id && withPrefix(id, 'VTU');
    const submitters = [
      person(nameCase(d.headName), ['Club Head', clubLine], vtu(d.headVtu), 'VTU*****'),
      ...d.viceHeads.map((v) => person(nameCase(v.name), ['Club Vice-Head', clubLine], vtu(v.vtu), 'VTU*****')),
      person(nameCase(d.facultyName),
        [ph(titleCase(d.facultyDesignation), 'Faculty Designation'), 'Faculty Coordinator', clubLine],
        d.facultyTts && withPrefix(d.facultyTts, 'TTS'), 'TTS****'),
    ];
    const compact = submitters.length > 4 ? ' compact' : ''; // a third row of signatures: tighten spacing

    const signs = [
      { html: `<div class="sig-block">
        <h3>SUBMITTED BY:</h3>
        <div class="grid${compact}">${submitters.join('')}</div>
      </div>` },
      { html: `<div class="sig-block">
        <hr>
        <h3>VERIFIED BY:</h3>
        <div class="grid${compact}">
          ${person('Suja Suresh', ['Events Head', 'CSE Clubs Council'], 'VTU32424')}
          ${person('Cheedella Venkata Sai Charan', ['President', 'CSE Clubs Council'], 'VTU24996')}
        </div>
      </div>` },
      { html: `<div class="sig-block">
        <hr>
        <h3>REVIEWED BY:</h3>
        <div class="grid${compact}">
          <div class="person"><p><b>Dr. M. Kavitha</b></p><p>Professor &amp; Head of the Department - CSE</p><p>Date:</p></div>
          <div class="person"><p><b>Dr. S.P. Chokkalingam</b></p><p>Professor &amp; Dean-SoC</p><p>Date:</p></div>
        </div>
      </div>` },
    ];

    return { footer, cover, blocks, signs };
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

  function paginate({ footer, cover, blocks, signs }) {
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
        while (body.children.length > 1 && body.lastElementChild.tagName === 'H2') {
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
    pour(signs, 'signs');

    report.replaceChildren(...measure.children);
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
  function download() {
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
    const d = readForm();
    const n = words(d.briefReport);
    if ((n < 250 || n > 400) && !confirm(`The brief report has ${n} words; 250–400 is expected.\n\nDownload anyway?`)) return;

    const prevTitle = document.title;
    document.title = `Post Event Report - ${d.clubName} - ${titleCase(d.eventName)}`.replace(/[\\/:*?"<>|]/g, '');
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
  // re-measure pages once the bundled report font has loaded
  if (document.fonts) document.fonts.ready.then(update);
})();
