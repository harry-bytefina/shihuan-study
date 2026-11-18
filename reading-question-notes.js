(() => {
  if (!window.QuestionNotes) return;
  const passage = document.querySelector('.exam-passage');
  for (const host of document.querySelectorAll('.question[data-note-key]')) {
    const main = host.querySelector('.note-question-main');
    const toolbar = main.querySelector('.note-question-toolbar');
    const note = window.QuestionNotes.attach({
      host,
      main,
      toolbar,
      key: host.dataset.noteKey,
      label: '第 ' + toolbar.querySelector('.question-number').textContent + ' 题',
      sources: {
        passage,
        prompt: toolbar.querySelector('[lang="en"]'),
        options: main.querySelector('.option-list, .choices'),
      },
    });
    if (host.id !== 'practice-question-note') continue;
    document.querySelector('.note-entry-link')?.addEventListener('click', event => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      note.open();
    });
    if (location.hash === '#practice-question-note') note.open({ scroll: true });
  }
})();
