/* Presentation only: the quiz renderer retains ownership of progress text. */
(function () {
  'use strict';
  function setup() {
    const app = document.getElementById('app');
    const sidebar = document.getElementById('sidebar');
    const main = app.querySelector('.main');
    const brand = app.querySelector('.brand');
    const topbar = app.querySelector('.topbar');
    const progress = document.getElementById('progress');
    const subtitle = brand.querySelector('.brand-sub');
    const originalSubtitle = subtitle.textContent;
    const terminal = document.createElement('span');
    terminal.className = 'brand-terminal';
    terminal.textContent = 'TERMINAL / 01';
    brand.querySelector('.brand-text').append(terminal);
    const closeDirectory = document.createElement('button');
    closeDirectory.className = 'sidebar-close';
    closeDirectory.type = 'button';
    closeDirectory.textContent = '关闭';
    closeDirectory.setAttribute('aria-label', '关闭目录，返回题目');
    closeDirectory.addEventListener('click', () => document.getElementById('nav-toggle').click());
    brand.append(closeDirectory);

    const panel = document.createElement('div');
    panel.className = 'terminal-header';
    panel.setAttribute('role', 'banner');
    panel.setAttribute('aria-label', '工程光学学习终端');

    const meter = document.createElement('div');
    meter.className = 'question-meter';
    const label = document.createElement('span');
    label.className = 'question-meter-label';
    const value = document.createElement('span');
    value.className = 'question-meter-value';
    const current = document.createElement('span');
    current.className = 'question-meter-current';
    const total = document.createElement('span');
    total.className = 'question-meter-total';
    value.append(current, total);
    meter.append(label, value);
    progress.after(meter);

    function updateMeter() {
      const text = progress.textContent;
      const match = text.match(/第\s*(\d+)\s*题\s*\/\s*共\s*(\d+)\s*题/);
      meter.setAttribute('aria-label', text);
      meter.title = text;
      label.textContent = match || /^共\s*0\s*题/.test(text) ? 'QUESTION' : 'ARCHIVE';
      current.textContent = match ? match[1].padStart(3, '0') : /^共\s*0\s*题/.test(text) ? '000' : text;
      total.textContent = match ? ' / ' + match[2] : /^共\s*0\s*题/.test(text) ? ' / 0' : '';
      meter.classList.toggle('question-meter-summary', !match && !/^共\s*0\s*题/.test(text));
    }
    new MutationObserver(updateMeter).observe(progress, {childList:true, characterData:true, subtree:true});
    updateMeter();

    const compact = window.matchMedia('(max-width: 900px)');
    const chapterTitle = document.getElementById('crumb');
    const chapterHeading = chapterTitle.closest('.crumb-wrap');
    function openDirectoryFromTitle() {
      if (compact.matches && !app.classList.contains('nav-open')) document.getElementById('nav-toggle').click();
    }
    chapterHeading.addEventListener('click', openDirectoryFromTitle);
    chapterTitle.addEventListener('keydown', event => {
      if (compact.matches && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();event.stopPropagation();openDirectoryFromTitle();
      }
    });
    function syncTitleAccessibility() {
      if (compact.matches) {
        chapterTitle.setAttribute('role', 'button');chapterTitle.tabIndex=0;
        chapterTitle.setAttribute('aria-controls', 'sidebar');
        chapterTitle.setAttribute('aria-expanded', String(app.classList.contains('nav-open')));
        chapterTitle.title='打开章节目录';
      } else {
        ['role','tabindex','aria-controls','aria-expanded','title'].forEach(name=>chapterTitle.removeAttribute(name));
      }
    }
    new MutationObserver(syncTitleAccessibility).observe(app,{attributes:true,attributeFilter:['class']});
    function syncLayout() {
      syncTitleAccessibility();
      const enabled = document.documentElement.dataset.theme === 'lonetrail';
      if (enabled) {
        if (!panel.isConnected) app.prepend(panel);
        if (topbar.parentElement !== panel) panel.append(topbar);
        const brandParent = compact.matches ? sidebar : panel;
        if (brand.parentElement !== brandParent) brandParent.prepend(brand);
      } else if (!enabled && panel.isConnected) {
        sidebar.prepend(brand);
        main.prepend(topbar);
        panel.remove();
      }
      subtitle.textContent = enabled ? 'OPTICS / STUDY SYSTEM' : originalSubtitle;
    }
    compact.addEventListener('change', syncLayout);
    new MutationObserver(syncLayout).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
    syncLayout();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
