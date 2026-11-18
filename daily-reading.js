(() => {
  const reader = document.querySelector('#daily-reading');
  const { start_date, time_zone = 'Asia/Shanghai', days, next_source } = JSON.parse(document.querySelector('#daily-reading-data').textContent);
  const dayMs = 86400000;
  const formatter = new Intl.DateTimeFormat('zh-CN', { timeZone: time_zone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const civil = Object.fromEntries(formatter.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  const origin = Date.parse(start_date + 'T00:00:00Z');
  const today = Math.floor((Date.UTC(Number(civil.year), Number(civil.month) - 1, Number(civil.day)) - origin) / dayMs);
  const latest = Math.min(today, days.length - 1);
  const params = new URLSearchParams(location.search);
  const requested = Number(params.get('day')) - 1;
  const active = Number.isInteger(requested) && requested >= 0 && requested <= latest ? requested : latest;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function link(href, label, className) {
    const node = el('a', className, label);
    node.href = href;
    return node;
  }

  function date(index, includeYear = false) {
    const day = new Date(origin + index * dayMs);
    const dayFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'UTC', year: includeYear ? 'numeric' : undefined, month: 'long', day: 'numeric' });
    const node = el('time', '', dayFormat.format(day));
    node.dateTime = day.toISOString().slice(0, 10);
    return node;
  }

  function editionUrl(index) {
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    if (index != null) url.searchParams.set('day', index + 1);
    return url.href;
  }

  function issueHeader() {
    const head = el('header', 'issue-bar');
    const stamp = el('div', 'issue-date');
    stamp.append(el('span', 'issue-label', '每日外刊'), el('span', 'issue-number', `第 ${active + 1} 期`), date(active, true));
    const pager = el('nav', 'issue-stops');
    pager.setAttribute('aria-label', '期次导航');
    if (active > 0) pager.append(link(editionUrl(active - 1), '上一期', 'previous'));
    if (active < latest) {
      pager.append(link(editionUrl(), today < days.length ? '回到今日' : '最近一期'));
      pager.append(link(editionUrl(active + 1), '下一期', 'next'));
    }
    if (active === latest) pager.append(el('span', 'current-issue', today < days.length ? '今日' : '最近一期'));
    if (latest > 0) {
      const archive = el('details', 'issues');
      const entries = el('ol', 'archive-list');
      for (let index = latest - 1; index >= 0; index -= 1) {
        const entry = el('li');
        const anchor = link(editionUrl(index), '');
        if (active === index) anchor.setAttribute('aria-current', 'page');
        anchor.append(date(index), el('span', '', days[index].source), el('strong', '', days[index].title));
        entry.append(anchor);
        entries.append(entry);
      }
      archive.append(el('summary', '', '往期'), entries);
      archive.addEventListener('keydown', event => {
        if (event.key === 'Escape' && archive.open) {
          archive.open = false;
          archive.querySelector('summary').focus();
        }
      });
      pager.append(archive);
    }
    head.append(stamp, pager);
    if (today > latest && active === latest && next_source) {
      head.append(el('p', 'next-source', '下一篇待配读：' + next_source));
    }
    return head;
  }

  function section(id, className, title) {
    const node = el('section', className);
    node.id = id;
    const heading = el('h2', 'section-title', title);
    heading.id = id + '-title';
    node.setAttribute('aria-labelledby', heading.id);
    node.append(heading);
    return node;
  }

  function plain(tag, className, text, lang = 'en') {
    const node = el(tag, className, text);
    node.lang = lang;
    return node;
  }

  function reading(day) {
    const article = el('article', 'exam');
    article.id = 'exam';
    const heading = el('h1', 'reading-title', day.title);
    if (!/\p{Script=Han}/u.test(day.title)) heading.lang = 'en';
    article.append(el('p', 'source-label', day.source), heading);
    const text = el('div', 'passage english exam-passage');
    text.lang = 'en';
    if (day.passage_html) text.innerHTML = day.passage_html;
    else day.passage.forEach(paragraph => text.append(el('p', '', paragraph)));
    article.append(text);
    return article;
  }

  function questions(day) {
    const area = section('questions', 'reading-section', '原题与解析');
    const list = el('div', 'questions');
    day.questions.forEach((item, index) => {
      const card = el('article', 'question');
      const heading = el('h3', 'question-stem');
      const number = item.number || index + 1;
      card.dataset.noteKey = day.id + ':' + number;
      const main = el('div', 'note-question-main');
      const tools = el('div', 'note-question-toolbar');
      heading.append(el('span', 'question-number', number), plain('span', 'english', item.prompt));
      const choices = plain('ol', 'choices english');
      choices.type = 'A';
      (item.options || []).forEach((option, position) => {
        const choice = el('li');
        const marker = el('span', '', String.fromCharCode(65 + position) + '.');
        marker.hidden = true;
        choice.append(marker, typeof option === 'string' ? option : option.text);
        choices.append(choice);
      });
      tools.append(heading);
      main.append(tools, choices);
      if (item.answer || item.analysis) {
        const disclosure = el('details', 'answer');
        const body = el('div', 'answer-body');
        if (item.answer) body.append(el('p', 'answer-key', '答案：' + item.answer));
        if (item.analysis) body.append(el('p', 'answer-copy', item.analysis));
        disclosure.append(el('summary', '', '查看答案与解析'), body);
        main.append(disclosure);
      }
      card.append(main);
      list.append(card);
    });
    area.append(list);
    return area;
  }

  function externalArticle(article) {
    const area = section('external', 'external', '同话题外刊');
    if (!article || article.unavailable) {
      area.append(el('p', 'unavailable', '本期暂无匹配的外刊。'));
      return area;
    }
    const title = el('h3', 'external-title', article.title);
    if (!/\p{Script=Han}/u.test(article.title)) title.lang = 'en';
    area.append(title);
    const difficulty = article.level ? '阅读难度参考：CSE ' + article.level : '';
    const source = [article.source, difficulty].filter(Boolean).join('　');
    if (source) area.append(el('p', 'source-label', source));
    const passage = el('div', 'passage');
    passage.id = 'external-text';
    const translated = [];
    article.blocks.forEach(block => {
      const paragraph = el('div', 'external-paragraph');
      if (block.english) paragraph.append(plain('p', 'english', block.english));
      if (block.chinese) {
        const translation = el('p', 'translation', block.chinese);
        translation.hidden = true;
        paragraph.append(translation);
        translated.push(translation);
      }
      passage.append(paragraph);
    });
    if (translated.length) {
      const toggle = el('button', 'translation-toggle', '中文对照');
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', passage.id);
      toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') === 'false';
        toggle.setAttribute('aria-expanded', String(open));
        toggle.textContent = open ? '收起中文对照' : '中文对照';
        translated.forEach(node => { node.hidden = !open; });
      });
      area.append(toggle);
    }
    area.append(passage);
    return area;
  }

  function noteBlock(title, content) {
    const block = el('div', 'note-block');
    block.append(el('h3', '', title));
    (Array.isArray(content) ? content : [content]).forEach(paragraph => {
      if (paragraph) block.append(el('p', '', paragraph));
    });
    return block;
  }

  function notes(lesson = {}, words) {
    const area = section('notes', 'reading-section notes', '外刊精讲');
    if (lesson.background) area.append(noteBlock('背景与文化', lesson.background));
    if (lesson.sentence) {
      const block = el('div', 'note-block sentence-note');
      const sentence = lesson.sentence;
      block.append(el('h3', '', '长难句'), plain('blockquote', 'english', sentence.english));
      if (sentence.parts?.length) block.append(plain('p', 'english sentence-parts', sentence.parts.join(' / ')));
      if (sentence.explanation) block.append(el('p', '', sentence.explanation));
      area.append(block);
    }
    if (lesson.expression) area.append(noteBlock('表达', lesson.expression));
    const vocabulary = lesson.vocabulary || words;
    if (vocabulary?.length) {
      const block = el('div', 'note-block');
      const list = el('dl', 'vocabulary');
      vocabulary.forEach(item => {
        const pair = el('div', 'word');
        const definition = el('dd', '', item.meaning);
        if (item.context) definition.append(plain('span', 'word-context', item.context));
        pair.append(plain('dt', 'english', item.term), definition);
        list.append(pair);
      });
      block.append(el('h3', '', '外刊词汇'), list);
      area.append(block);
    }
    return area.children.length > 1 ? area : null;
  }

  function contents(day, hasNotes) {
    const nav = el('nav', 'contents');
    nav.setAttribute('aria-label', '本期目录');
    const list = el('ol');
    const sections = [['exam', '高考阅读原文']];
    if (day.questions?.length) sections.push(['questions', '原题与解析']);
    sections.push(['external', '同话题外刊']);
    if (hasNotes) sections.push(['notes', '外刊精讲']);
    sections.forEach(([id, label]) => {
      const item = el('li');
      const href = new URL(location.href);
      href.hash = id;
      item.append(link(href, label));
      list.append(item);
    });
    nav.append(el('p', 'contents-label', '本期目录'), list);
    return nav;
  }

  const day = days[active];
  if (!day) {
    const empty = el('section', 'empty');
    empty.append(el('h1', '', '每日外刊'));
    if (days.length) {
      const intro = el('p', '', '首期开放日期：');
      intro.append(date(0, true));
      empty.append(intro);
    } else {
      empty.append(el('p', '', '暂无已发布的篇目。'));
    }
    reader.append(empty);
    return;
  }
  reader.dataset.dayIndex = String(active + 1);
  reader.dataset.readingId = day.id;
  document.title = day.title + ' · ' + document.title;
  const layout = el('div', 'issue-layout');
  const body = el('div', 'issue-body');
  const edition = el('div', 'external-edition');
  const lesson = notes(day.notes, day.external?.vocabulary);
  body.append(reading(day));
  if (day.questions?.length) body.append(questions(day));
  edition.append(externalArticle(day.external));
  if (lesson) edition.append(lesson);
  body.append(edition);
  layout.append(contents(day, Boolean(lesson)), body);
  reader.append(issueHeader(), layout);
})();
