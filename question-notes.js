(() => {
  const prefix = 'zsh-question-notes:v1:';
  const exclude = '[data-blank], #blank-picker, [data-notes-ignore]';
  const records = new Set();
  const owners = new Map();
  const cache = new Map();
  const lastKey = 'zsh-notes:last:' + location.pathname + location.search;
  let active, panel, controls, toolbar, picked, draft;

  const icons = {
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L4.842 15.173a2 2 0 0 0-.5.85l-1.321 4.308a.5.5 0 0 0 .624.624l4.31-1.32a2 2 0 0 0 .849-.5z"/><path d="m15 5 4 4"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    close: '<path d="m18 6-12 12M6 6l12 12"/>',
  };
  const icon = name => '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[name] + '</svg>';

  function read(key) {
    if (cache.has(key)) return cache.get(key);
    try {
      const data = JSON.parse(localStorage.getItem(prefix + key));
      if (data && typeof data.text === 'string' && Array.isArray(data.marks)) {
        return {
          text: data.text.slice(0, 3000),
          retry: Boolean(data.retry),
          marks: data.marks.filter(mark => mark && typeof mark.id === 'string' &&
            typeof mark.source === 'string' && typeof mark.note === 'string' &&
            typeof mark.quote === 'string' && mark.quote.length && Number.isInteger(mark.start)),
        };
      }
    } catch {}
    return { text: '', retry: false, marks: [] };
  }

  function updateBadge(record) {
    const { text, retry, marks } = record.state;
    record.toggle.classList.toggle('has-note', !!(text.trim() || retry || marks.length));
    record.toggle.classList.toggle('needs-retry', retry);
  }

  function syncInlineFields(key, text) {
    document.querySelectorAll('.inline-note-input textarea').forEach(input => {
      if (input.dataset.noteKey === key && input.value !== text) input.value = text;
    });
  }

  function persist(key, state) {
    cache.set(key, state);
    let saved = true;
    try {
      localStorage.setItem(prefix + key, JSON.stringify(state));
    } catch {
      saved = false;
    }
    for (const record of records) {
      if (record.key !== key) continue;
      record.state = state;
      updateBadge(record);
    }
    syncInlineFields(key, state.text);
    if (active?.key === key) {
      if (controls.input.value !== state.text) controls.input.value = state.text;
      controls.status.textContent = saved ? '已保存' : '未能保存，刷新会丢失';
    }
    return saved;
  }

  function save() {
    const { key, state } = active;
    persist(key, state);
  }

  function inlineField({ key, label }) {
    const wrapper = document.createElement('div');
    wrapper.className = 'inline-note-input';
    const input = document.createElement('textarea');
    input.rows = 1;
    input.maxLength = 3000;
    input.dataset.noteKey = key;
    input.setAttribute('aria-label', label + '笔记');
    input.placeholder = '本题笔记';
    input.value = read(key).text;
    input.addEventListener('input', () => {
      const state = active?.key === key ? active.state : read(key);
      state.text = input.value.slice(0, 3000);
      input.title = persist(key, state) ? '' : '未能保存，刷新会丢失';
    });
    wrapper.append(input);
    return wrapper;
  }

  function textNodes(source) {
    const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT, {
      acceptNode: node => node.parentElement?.closest(exclude) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function rangeText(range) {
    const fragment = range.cloneContents();
    fragment.querySelectorAll(exclude).forEach(element => element.remove());
    return fragment.textContent;
  }

  function position(mark) {
    const source = active.sources[mark.source];
    if (!source) return -1;
    const text = textNodes(source).map(node => node.data).join('');
    if (mark.start >= 0 && text.slice(mark.start, mark.start + mark.quote.length) === mark.quote) return mark.start;
    const found = text.indexOf(mark.quote);
    return found >= 0 && text.indexOf(mark.quote, found + 1) < 0 ? found : -1;
  }

  function clearMarks(record) {
    for (const source of Object.values(record.sources)) {
      for (const mark of source.querySelectorAll('mark.note-mark')) mark.replaceWith(...mark.childNodes);
      source.normalize();
    }
  }

  function drawMarks() {
    clearMarks(active);
    for (const mark of active.state.marks) {
      const start = position(mark);
      if (start < 0) continue;
      const end = start + mark.quote.length;
      let offset = 0, first = true;
      for (const node of textNodes(active.sources[mark.source])) {
        const next = offset + node.length;
        if (next > start && node.length) {
          const range = document.createRange();
          range.setStart(node, Math.max(0, start - offset));
          range.setEnd(node, Math.min(node.length, end - offset));
          const element = document.createElement('mark');
          element.className = 'note-mark';
          element.dataset.markId = mark.id;
          if (first) {
            element.tabIndex = node.parentElement.closest('button, a') ? -1 : 0;
            if (element.tabIndex === 0) element.setAttribute('role', 'button');
            element.setAttribute('aria-label', '查看批注：' + mark.quote);
          }
          range.surroundContents(element);
          first = false;
        }
        offset = next;
        if (offset >= end) break;
      }
    }
  }

  function locate(mark) {
    const source = active.sources[mark.source];
    const elements = [...(source?.querySelectorAll('.note-mark') || [])].filter(el => el.dataset.markId === mark.id);
    if (!elements.length) {
      controls.status.textContent = '这处文字暂时无法定位';
      return;
    }
    document.querySelectorAll('.note-mark.is-current').forEach(el => el.classList.remove('is-current'));
    elements.forEach(el => el.classList.add('is-current'));
    elements[0].scrollIntoView({ block: 'center' });
    elements[0].focus({ preventScroll: true });
  }

  function button(text, className, click) {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = text;
    el.className = className;
    if (click) el.addEventListener('click', click);
    return el;
  }

  function renderList() {
    controls.list.replaceChildren();
    const { marks } = active.state;
    controls.count.textContent = marks.length || '';
    if (!marks.length) {
      const empty = document.createElement('li');
      empty.className = 'note-empty';
      empty.textContent = '暂无批注';
      controls.list.append(empty);
    }
    for (const mark of marks) {
      const row = document.createElement('li');
      row.className = 'note-annotation';
      row.dataset.markId = mark.id;
      const quote = button(mark.quote, 'note-quote', () => locate(mark));
      quote.lang = 'en';
      quote.title = '定位原文';
      row.append(quote);
      if (mark.note) {
        const comment = document.createElement('p');
        comment.className = 'note-annotation-text';
        comment.textContent = mark.note;
        row.append(comment);
      }
      const actions = document.createElement('div');
      actions.className = 'note-annotation-actions';
      const edit = button(mark.note ? '编辑批注' : '加备注', 'note-edit', () => editMark(mark));
      const remove = button('删除', 'note-delete', () => {
        active.state.marks = active.state.marks.filter(item => item.id !== mark.id);
        if (draft?.id === mark.id) clearDraft();
        drawMarks();
        renderList();
        save();
        controls.input.focus();
      });
      remove.setAttribute('aria-label', '删除批注');
      actions.append(edit, remove);
      row.append(actions);
      controls.list.append(row);
    }
  }

  function clearDraft() {
    draft = null;
    controls.form.hidden = true;
  }

  function editMark(mark) {
    open(active);
    draft = { ...mark };
    controls.quote.textContent = mark.quote;
    controls.markInput.value = mark.note || '';
    controls.form.hidden = false;
    controls.markInput.focus();
  }

  function putMark(mark) {
    const index = active.state.marks.findIndex(existing => existing.id === mark.id);
    if (index < 0) active.state.marks.push(mark);
    else active.state.marks[index] = mark;
    drawMarks();
    renderList();
    save();
  }

  function ensurePanel() {
    if (panel) return;
    panel = document.createElement('aside');
    panel.id = 'practice-note-panel';
    panel.className = 'note-panel';
    panel.setAttribute('aria-labelledby', 'practice-note-title');
    panel.hidden = true;
    panel.innerHTML = `
      <header class="note-panel-header"><h4 id="practice-note-title"></h4>
        <button type="button" class="note-close" aria-label="收起笔记" title="收起笔记">${icon('close')}</button>
      </header>
      <p class="note-privacy">${icon('lock')}<span>仅此浏览器</span></p>
      <label for="practice-note-input" class="note-label">解题笔记</label>
      <textarea id="practice-note-input" class="note-input" rows="4" maxlength="3000" placeholder="我当时怎么判断的？"></textarea>
      <div class="note-panel-meta">
        <label class="note-retry"><input type="checkbox">标记重做</label>
        <span class="note-status" role="status"></span>
      </div>
      <form class="note-draft" hidden>
        <blockquote class="note-draft-quote" lang="en"></blockquote>
        <label for="practice-mark-input" class="note-label">批注</label>
        <textarea id="practice-mark-input" class="note-mark-input" rows="3" maxlength="600"></textarea>
        <div class="note-draft-actions"><button type="button" class="note-cancel">取消</button>
          <button type="submit" class="note-save">保存批注</button></div>
      </form>
      <section class="note-evidence" aria-labelledby="practice-note-evidence">
        <h5 id="practice-note-evidence">文字批注<span class="note-count"></span></h5>
        <ol class="note-annotations"></ol>
      </section>`;
    const find = selector => panel.querySelector(selector);
    controls = {
      title: find('h4'), input: find('.note-input'), retry: find('.note-retry input'),
      status: find('.note-status'), list: find('.note-annotations'), count: find('.note-count'),
      form: find('.note-draft'), quote: find('.note-draft-quote'), markInput: find('.note-mark-input'),
    };
    find('.note-close').addEventListener('click', () => {
      close(active);
      active.toggle.focus({ preventScroll: true });
    });
    controls.input.addEventListener('input', () => { active.state.text = controls.input.value; save(); });
    controls.retry.addEventListener('change', () => { active.state.retry = controls.retry.checked; save(); });
    controls.form.addEventListener('submit', event => {
      event.preventDefault();
      if (!draft) return;
      putMark({ ...draft, note: controls.markInput.value.trim() });
      clearDraft();
      controls.input.focus();
    });
    find('.note-cancel').addEventListener('click', () => { clearDraft(); controls.input.focus(); });
  }

  function close(record) {
    if (active !== record || !panel) return;
    panel.hidden = true;
    record.host.classList.remove('is-note-open');
    record.toggle.setAttribute('aria-expanded', 'false');
  }

  function activate(record) {
    if (active === record) return;
    ensurePanel();
    if (active) {
      close(active);
      clearMarks(active);
    }
    clearDraft();
    active = record;
    record.state = read(record.key);
    updateBadge(record);
    record.host.append(panel);
    controls.title.textContent = record.label + ' · 我的笔记';
    controls.input.value = record.state.text;
    controls.retry.checked = record.state.retry;
    controls.status.textContent = '';
    renderList();
    drawMarks();
    try { sessionStorage.setItem(lastKey, record.key); } catch {}
  }

  function open(record, { focus = false, scroll = false } = {}) {
    activate(record);
    panel.hidden = false;
    record.host.classList.add('is-note-open');
    record.toggle.setAttribute('aria-expanded', 'true');
    if (scroll) panel.scrollIntoView({ block: 'nearest' });
    if (focus) controls.input.focus({ preventScroll: !scroll });
  }

  function hideSelection() {
    picked = null;
    if (toolbar) toolbar.hidden = true;
  }

  function choose(action) {
    if (!picked) return;
    const { choices, source, start, quote } = picked;
    const record = choices[Number(toolbar.querySelector('select').value) || 0];
    const mark = { source: Object.keys(record.sources).find(key => record.sources[key] === source), start, quote, note: '' };
    hideSelection();
    window.getSelection()?.removeAllRanges();
    activate(record);
    const overlap = active.state.marks.find(item => {
      if (item.source !== mark.source) return false;
      const at = position(item);
      return at >= 0 && at < start + quote.length && start < at + item.quote.length;
    });
    if (overlap) {
      if (overlap.quote === quote && action === 'annotate') editMark(overlap);
      else showAnnotation(overlap.id);
    } else {
      mark.id = globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
      if (action === 'annotate') editMark(mark);
      else putMark(mark);
    }
  }

  function ensureToolbar() {
    if (toolbar) return;
    toolbar = document.createElement('div');
    toolbar.className = 'note-selection';
    toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', '所选文字');
    toolbar.hidden = true;
    toolbar.innerHTML = '<select aria-label="批注归属题目"></select><button type="button" data-note-action="mark">标记</button><button type="button" data-note-action="annotate">加批注</button>';
    toolbar.addEventListener('pointerdown', event => {
      if (event.target.closest('button')) event.preventDefault();
    });
    toolbar.addEventListener('click', event => {
      const action = event.target.closest('[data-note-action]')?.dataset.noteAction;
      if (action) choose(action);
    });
    toolbar.addEventListener('keydown', event => {
      if (event.key === 'Escape') hideSelection();
    });
  }

  function refreshSelection() {
    if (!records.size || toolbar?.contains(document.activeElement)) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return hideSelection();
    const range = selection.getRangeAt(0);
    if ([range.startContainer, range.endContainer].some(node =>
      (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)?.closest(exclude))) return hideSelection();
    const source = [...owners.keys()].find(node =>
      node.contains(range.startContainer) && node.contains(range.endContainer)
    );
    if (!source) return hideSelection();
    const choices = [...owners.get(source)].filter(record => record.host.isConnected && record.host.getClientRects().length);
    const raw = rangeText(range);
    const quote = raw.trim();
    if (!choices.length || !quote || quote.length > 600) return hideSelection();
    const before = document.createRange();
    before.selectNodeContents(source);
    before.setEnd(range.startContainer, range.startOffset);
    const start = rangeText(before).length + raw.length - raw.trimStart().length;
    const rect = range.getBoundingClientRect();
    if (!rect.width || rect.bottom < 0 || rect.top > window.innerHeight) return hideSelection();

    const unchanged = picked?.source === source && picked.start === start && picked.quote === quote
      && picked.choices.length === choices.length && picked.choices.every((record, index) => record === choices[index]);
    picked = { choices, source, start, quote };
    ensureToolbar();
    const parent = source.closest('dialog[open]') || document.body;
    if (toolbar.parentElement !== parent) parent.append(toolbar);
    const select = toolbar.querySelector('select');
    if (!unchanged) {
      select.hidden = choices.length === 1;
      select.replaceChildren(...choices.map((record, index) => new Option(record.label, String(index))));
      const index = choices.indexOf(active);
      if (choices.length > 1 && index < 0) {
        select.prepend(new Option('归到哪一题？', ''));
        select.value = '';
      } else {
        select.value = String(Math.max(index, 0));
      }
      const buttons = toolbar.querySelectorAll('button');
      const setAvailability = () => buttons.forEach(button => { button.disabled = !select.value; });
      select.onchange = setAvailability;
      setAvailability();
    }
    toolbar.hidden = false;
    const { offsetWidth: width, offsetHeight: height } = toolbar;
    toolbar.style.left = Math.max(8, Math.min(rect.left + (rect.width - width) / 2, window.innerWidth - width - 8)) + 'px';
    toolbar.style.top = (rect.top >= height + 12 ? rect.top - height - 8 : Math.min(rect.bottom + 8, window.innerHeight - height - 8)) + 'px';
  }

  function showAnnotation(id) {
    if (!active) return;
    const row = [...controls.list.children].find(item => item.dataset.markId === id);
    if (!row) return;
    open(active);
    row.querySelector('.note-quote').focus();
  }

  document.addEventListener('selectionchange', refreshSelection);
  window.addEventListener('scroll', refreshSelection, { passive: true });
  window.addEventListener('resize', refreshSelection);
  document.addEventListener('pointerdown', event => {
    if (toolbar && !toolbar.contains(event.target)) hideSelection();
  });
  document.addEventListener('click', event => {
    const mark = event.target.closest('.note-mark');
    if (mark && window.getSelection()?.isCollapsed) showAnnotation(mark.dataset.markId);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && picked) hideSelection();
    if (!['Enter', ' '].includes(event.key) || !event.target.matches('.note-mark')) return;
    event.preventDefault();
    showAnnotation(event.target.dataset.markId);
  });
  window.addEventListener('storage', event => {
    if (event.key !== null && !event.key.startsWith(prefix)) return;
    const key = event.key?.slice(prefix.length);
    if (key === undefined) cache.clear();
    else cache.delete(key);
    if (key !== undefined) syncInlineFields(key, read(key).text);
    else document.querySelectorAll('.inline-note-input textarea').forEach(input => { input.value = read(input.dataset.noteKey).text; });
    for (const record of records) {
      if (key !== undefined && key !== record.key) continue;
      record.state = read(record.key);
      updateBadge(record);
      if (record === active) {
        controls.input.value = record.state.text;
        controls.retry.checked = record.state.retry;
        renderList();
        drawMarks();
      }
    }
  });

  window.QuestionNotes = {
    inlineField,
    attach({ host, main, toolbar: slot, key, label, sources }) {
      const record = { host, key, label, sources: Object.fromEntries(Object.entries(sources).filter(([, node]) => node)), state: read(key) };
      record.toggle = button('笔记', 'note-toggle', () => {
        if (active === record && !panel.hidden) close(record);
        else open(record);
      });
      record.toggle.innerHTML = icon('pencil') + '<span>笔记</span>';
      record.toggle.setAttribute('aria-controls', 'practice-note-panel');
      record.toggle.setAttribute('aria-expanded', 'false');
      record.toggle.setAttribute('aria-label', label + '笔记');
      host.classList.add('question-note-demo');
      main.classList.add('note-question-main');
      slot.classList.add('note-question-toolbar');
      slot.append(record.toggle);
      updateBadge(record);
      records.add(record);
      for (const node of Object.values(record.sources)) {
        if (!owners.has(node)) owners.set(node, new Set());
        owners.get(node).add(record);
      }
      try {
        if (!active && sessionStorage.getItem(lastKey) === key) activate(record);
      } catch {}
      return {
        open: options => open(record, options),
        close: () => close(record),
        refresh: () => { if (active === record) drawMarks(); },
        destroy() {
          records.delete(record);
          for (const node of Object.values(record.sources)) {
            const set = owners.get(node);
            set?.delete(record);
            if (!set?.size) owners.delete(node);
          }
          if (active === record) {
            close(record);
            clearMarks(record);
            clearDraft();
            panel.remove();
            active = null;
            hideSelection();
          }
          record.toggle.remove();
        },
      };
    },
  };
})();
