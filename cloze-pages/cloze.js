(() => {
  'use strict';
  document.querySelectorAll('[data-history-back]').forEach(link => link.addEventListener('click', event => {
    if (window.history.length > 1) { event.preventDefault(); window.history.back(); }
  }));
  const get = id => document.getElementById(id);
  const stored = key => {
    try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
  };
  const persist = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  };
  const payload = get('cloze-page-data');
  if (payload) {
    const data = JSON.parse(payload.textContent);
    const storageKey = 'zhang-shihuan-cloze-' + data.id;
    const state = stored(storageKey);
    state.answers ||= {};
    state.checked ||= [];
    let filling = false;
    const choices = new Map(data.questions.map(question => [String(question.number), question]));
    const passage = get('cloze-passage');
    const picker = get('blank-picker');
    const blanks = new Map([...passage.querySelectorAll('[data-blank]')].map(blank => [blank.dataset.blank, blank]));
    const notePanels = new Map();
    if (window.QuestionNotes) {
      for (const number of choices.keys()) {
        const host = get('question-' + number);
        const main = host.querySelector('.note-question-main');
        notePanels.set(number, window.QuestionNotes.attach({
          host,
          main,
          toolbar: main.querySelector('.note-question-toolbar'),
          key: 'cloze:' + data.id + ':' + number,
          label: '第 ' + number + ' 空',
          sources: { passage, prompt: main.querySelector('.question-context'), options: main.querySelector('.options') },
        }));
      }
    }
    let activeBlank = null;
    const update = () => {
      let correct = 0;
      let checked = 0;
      for (const [number, question] of choices) {
        const selected = state.answers[number];
        const isChecked = state.checked.includes(number);
        const slot = document.querySelector('[data-answer-slot="' + number + '"]');
        slot.classList.toggle('selected', Boolean(selected));
        slot.classList.toggle('correct', isChecked && selected === question.answer);
        slot.classList.toggle('incorrect', isChecked && selected !== question.answer);
        slot.querySelector('strong').textContent = selected || '—';
        if (isChecked && selected) { checked++; if (selected === question.answer) correct++; }
        document.querySelectorAll('[data-question="' + number + '"]').forEach(button => {
          const label = button.dataset.option;
          button.setAttribute('aria-pressed', String(label === selected));
          button.classList.toggle('correct', isChecked && label === question.answer);
          button.classList.toggle('incorrect', isChecked && label === selected && selected !== question.answer);
        });
        const feedback = document.querySelector('[data-feedback="' + number + '"]');
        feedback.classList.toggle('wrong', isChecked && selected !== question.answer);
        feedback.textContent = isChecked ? (selected === question.answer ? '选对了。看看你找到的线索是否相同。' : '你选了 ' + selected + '。答案是 ' + question.answer + '，展开讲解核对依据。') : '';

        const blank = blanks.get(number);
        const text = question.options.find(option => option.label === (filling ? question.answer : selected))?.text;
        blank.querySelector('.blank-rule').textContent = text || '________';
        blank.classList.toggle('selected', !filling && Boolean(text));
        blank.classList.toggle('incorrect', !filling && isChecked && selected !== question.answer);
        blank.classList.toggle('filled', filling);
        const status = filling ? '参考答案' : isChecked && selected !== question.answer ? '选错' : '已选';
        blank.setAttribute('aria-label', '第 ' + number + ' 空' + (text ? '，' + status + '：' + text : ''));
      }
      get('score-summary').textContent = checked ? '已核对 ' + checked + ' 题，答对 ' + correct + ' 题。' : '先独立选择，再核对。';
      persist(storageKey, state);
    };
    function closePicker(restoreFocus = false) {
      if (!activeBlank) return;
      const blank = activeBlank;
      activeBlank = null;
      blank.setAttribute('aria-expanded', 'false');
      picker.hidden = true;
      if (restoreFocus) blank.focus({preventScroll: true});
    }

    function positionPicker() {
      if (!activeBlank) return;
      const rect = activeBlank.getBoundingClientRect();
      const {clientHeight: height, clientWidth: width} = document.documentElement;
      if (rect.bottom <= 0 || rect.top >= height) {
        closePicker(picker.contains(document.activeElement));
        return;
      }
      const gap = 5;
      const edge = 10;
      const below = height - rect.bottom - gap - edge;
      const above = rect.top - gap - edge;
      const openAbove = below < picker.scrollHeight && above > below;
      picker.style.maxHeight = Math.max(0, openAbove ? above : below) + 'px';
      picker.style.left = Math.max(edge, Math.min(rect.left, width - picker.offsetWidth - edge)) + 'px';
      picker.style.top = (openAbove ? rect.top - gap - picker.offsetHeight : rect.bottom + gap) + 'px';
    }

    function showReference(show) {
      filling = show;
      get('toggle-answers').setAttribute('aria-pressed', String(filling));
      get('toggle-answers').textContent = filling ? '收起参考答案' : '显示参考答案';
    }

    function openPicker(blank) {
      closePicker();
      if (filling) {
        showReference(false);
        update();
      }
      const number = blank.dataset.blank;
      const buttons = choices.get(number).options.map(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'blank-choice';
        button.dataset.inlineOption = option.label;
        button.setAttribute('aria-pressed', String(option.label === state.answers[number]));
        const letter = document.createElement('span');
        letter.className = 'option-letter';
        letter.textContent = option.label;
        const word = document.createElement('span');
        word.lang = 'en';
        word.textContent = option.text;
        button.append(letter, word);
        return button;
      });
      picker.replaceChildren(...buttons);
      if (notePanels.has(number)) {
        const note = document.createElement('button');
        note.type = 'button';
        note.className = 'blank-note-action';
        note.textContent = '本空笔记';
        note.addEventListener('click', () => {
          closePicker();
          notePanels.get(number).open({focus: true, scroll: true});
        });
        picker.append(note);
      }
      blank.after(picker);
      activeBlank = blank;
      blank.setAttribute('aria-expanded', 'true');
      picker.setAttribute('aria-label', '第 ' + number + ' 空');
      picker.hidden = false;
      positionPicker();
      (buttons.find(button => button.dataset.inlineOption === state.answers[number]) || buttons[0]).focus({preventScroll: true});
    }

    function selectAnswer(number, label) {
      if (state.answers[number] !== label) {
        state.answers[number] = label;
        state.checked = state.checked.filter(value => value !== number);
      }
      showReference(false);
      update();
    }

    document.addEventListener('click', event => {
      const blank = event.target.closest('[data-blank]');
      const inlineOption = event.target.closest('[data-inline-option]');
      if (blank) {
        if (blank === activeBlank) closePicker();
        else openPicker(blank);
      } else if (inlineOption && activeBlank) {
        const number = activeBlank.dataset.blank;
        closePicker(true);
        selectAnswer(number, inlineOption.dataset.inlineOption);
      } else {
        if (!picker.contains(event.target)) closePicker();
        const option = event.target.closest('[data-option]');
        if (option && !event.target.closest('mark.note-mark')) selectAnswer(option.dataset.question, option.dataset.option);
      }
    });
    document.addEventListener('focusin', event => {
      if (event.target !== activeBlank && !picker.contains(event.target)) closePicker();
    });
    document.addEventListener('keydown', event => {
      if (!activeBlank) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closePicker(true);
      } else if (picker.contains(event.target) && event.target.matches('[data-inline-option]') && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const buttons = [...picker.querySelectorAll('[data-inline-option]')];
        const step = event.key === 'ArrowUp' ? -1 : 1;
        const index = (buttons.indexOf(event.target) + step + buttons.length) % buttons.length;
        buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : index].focus();
      }
    });
    window.addEventListener('scroll', positionPicker, {passive: true});
    window.addEventListener('resize', positionPicker);
    get('check-all').addEventListener('click', () => {
      state.checked = Object.keys(state.answers).filter(number => choices.has(number));
      update();
      if (!state.checked.length) get('score-summary').textContent = '先选一个答案，再核对。';
    });
    get('toggle-answers').addEventListener('click', () => {
      showReference(!filling);
      update();
    });
    get('show-explanations').addEventListener('click', () => {
      const explanations = [...document.querySelectorAll('[data-explanation]')];
      const opening = explanations.some(element => !element.open);
      explanations.forEach(element => { element.open = opening; });
      get('show-explanations').textContent = opening ? '收起全部讲解' : '展开全部讲解';
    });
    get('reset-practice').addEventListener('click', () => {
      state.answers = {};
      state.checked = [];
      showReference(false);
      document.querySelectorAll('[data-explanation], .answer-key').forEach(detail => { detail.open = false; });
      get('show-explanations').textContent = '展开全部讲解';
      update();
    });
    get('font-size').addEventListener('input', event => {
      passage.style.setProperty('--reading-size', event.target.value + 'px');
    });
    update();
    return;
  }
  const cards = [...document.querySelectorAll('[data-cloze-card]')];
  if (!cards.length) return;
  const filters = [...document.querySelectorAll('[data-filter]')];
  let textById = new Map();
  const filterCards = () => {
    const query = get('cloze-query').value.trim().toLowerCase();
    let count = 0;
    cards.forEach(card => {
      const matching = filters.every(filter => !filter.value || card.dataset[filter.dataset.filter] === filter.value);
      const id = card.querySelector('[data-card-progress]').dataset.cardProgress;
      const text = textById.get(id) || card.textContent.toLowerCase();
      card.hidden = !(matching && (!query || text.includes(query)));
      if (!card.hidden) count++;
    });
    get('catalog-result').textContent = '找到 ' + count + ' 篇';
    get('catalog-empty').hidden = count > 0;
  };
  filters.forEach(filter => filter.addEventListener('change', filterCards));
  get('cloze-query').addEventListener('input', filterCards);
  cards.forEach(card => {
    const progress = card.querySelector('[data-card-progress]');
    const state = stored('zhang-shihuan-cloze-' + progress.dataset.cardProgress);
    const count = Object.keys(state.answers || {}).length;
    if (count) progress.textContent = '已选 ' + count + ' 空';
  });
  fetch('../cloze-content.json').then(response => {
    if (!response.ok) throw new Error('catalog unavailable');
    return response.json();
  }).then(data => {
    textById = new Map(data.cloze_pages.map(item => [item.id, [item.title, item.summary, item.theme, item.passage].join(' ').toLowerCase()]));
    filterCards();
  }).catch(() => {});
})();
