const ART_BASE = "./assets/art/";

console.log("Check script.js loaded");

const statusE1 = document.getElementById("status");
if (statusE1){
    statusE1.textContent = "JS connected and running.";
}

const yearEl = document.getElementById("year");
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}


// Smooth-scroll for links
(function () {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const anchors = document.querySelectorAll('a[href^="#"]');

  anchors.forEach(a => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (!id || id === "#") return;
      const target = document.querySelector(id);
      if (!target) return;

      e.preventDefault();
      target.scrollIntoView({
        behavior: prefersReduced ? "auto" : "smooth",
        block: "start"
      });

      if (history.pushState) {
        history.pushState(null, "", id);
      } else {
        location.hash = id;
      }
    });
  });
})();



function normalizeArtPath(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  if (v.startsWith("http://") || v.startsWith("https://") || v.includes("/")) return v;
  return ART_BASE + v; // prepend base for bare filenames
}


function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
}

// === Carousel + Data Wiring ===
(function () {
  // DOM
  const catToggleMount = document.getElementById('tagCategoryToggle') || document.querySelector('.segmented');
  const codingEls = {
    track: document.getElementById('codingTrack'),
    prev:  document.getElementById('codingPrev'),
    next:  document.getElementById('codingNext')
  };
  const artEls = {
    track: document.getElementById('artTrack'),
    prev:  document.getElementById('artPrev'),
    next:  document.getElementById('artNext')
  };

  if (!codingEls.track || !artEls.track) return;

  const TagCategory = (() => {
    let value = 'content';
    let container = null;

    function render(containerEl, cats, defaultValue) {
      container = containerEl;
      value = defaultValue || cats[0] || 'content';

      if (!container) return;

      // build a segmented control from categories
      container.innerHTML = `
        <div class="segmented" role="group" aria-label="Tag category">
          ${cats.map(c => `
            <button type="button" class="segmented-btn${c === value ? ' is-active' : ''}"
                    data-value="${escAttr(c)}" aria-pressed="${c === value}">
              ${escHtml(c)}
            </button>`).join('')}
        </div>
      `;

      // wire click -> set()
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('.segmented-btn');
        if (!btn) return;
        set(btn.dataset.value);
      });
    }

    function set(newValue) {
      if (!newValue || newValue === value) return;
      value = newValue;
      // update UI
      if (container) {
        const btns = container.querySelectorAll('.segmented-btn');
        btns.forEach(b => {
          const active = b.dataset.value === value;
          b.classList.toggle('is-active', active);
          b.setAttribute('aria-pressed', String(active));
        });
      }
      // notify listeners (drop-in replacement for old select 'change')
      document.dispatchEvent(new CustomEvent('tagCategoryChange', { detail: { value } }));
    }

    function get() { return value; }

    return { render, set, get };
  })();

  // Load metadata once
  fetch('metadata.json')
    .then(r => r.json())
    .then(raw => {
      // Normalize tags for coding to allow both shapes
      const coding = (raw.coding || []).map(item => ({
        ...item,
        tags: normalizeTags(item.tags)
      }));

      const art = (raw.art || []).slice(); // assume array of artworks

      // Build categories for the toggle (no select)
      const categories = getAllCategories(coding);
      const defaultCat = categories.includes('content') ? 'content' : (categories[0] || '');
      // Render segmented control into the mount
      TagCategory.render(catToggleMount, categories, defaultCat);


      // Create carousels
      const codingCarousel = makeCarousel({
        items: coding,
        trackEl: codingEls.track,
        prevEl: codingEls.prev,
        nextEl: codingEls.next,
        renderCard: (item) => renderCodingCard(item, TagCategory.get()),
      });


      const artCarousel = makeCarousel({
        items: art,
        trackEl: artEls.track,
        prevEl: artEls.prev,
        nextEl: artEls.next,
        renderCard: renderArtCard,
      });

      // Initial render
      codingCarousel.render();
      artCarousel.render();

      // Re-render coding when the segmented toggle changes
      document.addEventListener('tagCategoryChange', () => {
        codingCarousel.render(); // renderCard uses TagCategory.get()
      });


      // Re-render both on responsive changes
      window.addEventListener('resize', debounce(() => {
        codingCarousel.render(true); // true = keep first index, just change visible count
        artCarousel.render(true);
      }, 120));
    })
    .catch(console.error);

  // ===== helpers =====

  function normalizeTags(tags) {
    if (!tags) return {};
    if (Array.isArray(tags)) {
      const out = {};
      tags.forEach(obj => {
        Object.entries(obj).forEach(([cat, arr]) => {
          if (!out[cat]) out[cat] = [];
          out[cat] = out[cat].concat(arr || []);
        });
      });
      return out;
    }
    if (typeof tags === 'object') return tags;
    return {};
  }

  function getAllCategories(items) {
    const set = new Set();
    items.forEach(it => Object.keys(it.tags || {}).forEach(c => set.add(c)));
    return [...set].sort();
  }

  function computeVisibleCount() {
    const w = window.innerWidth || document.documentElement.clientWidth;
    if (w < 640) return 1;
    if (w < 1024) return 2;
    return 3;
  }

  function makeCarousel({ items, trackEl, prevEl, nextEl, renderCard }) {
    let firstIndex = 0; // index of first visible item
    let lastVisibleCount = computeVisibleCount();

    function clampIndex(i) {
      const n = items.length;
      if (n === 0) return 0;
      // wrap-around carousel
      return ((i % n) + n) % n;
    }

  function render(keepIndex = false) {
    const n = items.length;
    if (!keepIndex) firstIndex = clampIndex(firstIndex);
    const count = computeVisibleCount();

    // NEW: expose visible count to CSS so cards share the row equally
    trackEl.style.setProperty('--visible', String(Math.min(count, n || 0)));

    // Build slice with wrap-around
    const slice = [];
    for (let k = 0; k < Math.min(count, n || 0); k++) {
      slice.push(items[clampIndex(firstIndex + k)]);
    }

    // Render
    trackEl.innerHTML = slice.map(renderCard).join('');

    // Buttons enabled/disabled if there’s nothing to scroll
    const disable = n <= count;
    prevEl.disabled = disable;
    nextEl.disabled = disable;
  }


    function next() {
      firstIndex = clampIndex(firstIndex + 1);
      render(true);
    }
    function prev() {
      firstIndex = clampIndex(firstIndex - 1);
      render(true);
    }

    prevEl.addEventListener('click', prev);
    nextEl.addEventListener('click', next);

    return { render, next, prev };
  }

  // --- Card renderers ---

  function renderCodingCard(item, category) {
    const tags = ((item.tags && item.tags[category]) || []).map(t => t.tag).filter(Boolean);
    const tagsHtml = tags.map(t => `<span class="tag">${escHtml(t)}</span>`).join('');
    return `
      <article class="project-card">
        <h4><u>${escHtml(item.project_name || item.title || '')}</u></h4>
        <p class="desc">${escHtml(item.description || '')}</p>
        <div class="tags">${tagsHtml}</div>
        ${item.link ? `<p class="actions"><a class="btn" href="${escAttr(item.link)}" target="_blank" rel="noopener">View Project →</a></p>` : ''}
      </article>
    `;
  }

  
  // Replace your existing renderArtCard with this STRING-returning version
  function renderArtCard(item) {
    const esc = (s) =>
      String(s ?? "").replace(/[&<>"']/g, (m) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
      );

    return `
  <article class="art-card tile">
    <div class="thumb">
      <img src="./assets/art/${esc(item.image)}" alt="${esc(item.title)}" loading="lazy" decoding="async">
      <div class="text">
        <h1>${esc(item.title)}</h1>
        <p class="animate-text">${esc(item.description)}</p>
      </div>
    </div>
  </article>`;
  }


  // --- utils ---
  function escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }
  function escAttr(s) { return escHtml(s); }
  function debounce(fn, ms) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }
})();


// ===== Lightbox for ART projects =====
(() => {
  const track = document.getElementById('artTrack');
  if (!track) return;

  const lb        = document.getElementById('lightbox');
  const lbImg     = document.getElementById('lbImg');
  const lbTitle   = document.getElementById('lbTitle');
  const lbDesc    = document.getElementById('lbDesc');
  const btnPrev   = document.getElementById('lbPrev');
  const btnNext   = document.getElementById('lbNext');
  const btnClose  = document.getElementById('lbClose');

  let slides = [];
  let i = 0;

  function collectSlides() {
    slides = Array.from(track.querySelectorAll('.art-card.tile, .art-card'));
  }

  function readSlideData(card) {
    const img  = card.querySelector('.thumb img') || card.querySelector('img');
    const ttl  = card.querySelector('h1, h3, .title');
    const desc = card.querySelector('p, .desc');
    return {
      src:  img?.getAttribute('src') || '',
      alt:  img?.getAttribute('alt') || (ttl?.textContent?.trim() || 'Artwork'),
      title: (ttl?.textContent || '').trim(),
      desc:  (desc?.textContent || '').trim()
    };
  }

  function update(index) {
    if (!slides.length) collectSlides();
    i = (index + slides.length) % slides.length; // wrap
    const data = readSlideData(slides[i]);
    lbImg.src = data.src;
    lbImg.alt = data.alt;
    lbTitle.textContent = data.title;
    lbDesc.textContent = data.desc;

    // Preload neighbors for snappier nav
    const prevImg = readSlideData(slides[(i - 1 + slides.length) % slides.length]).src;
    const nextImg = readSlideData(slides[(i + 1) % slides.length]).src;
    [prevImg, nextImg].forEach(src => { const im = new Image(); im.src = src; });
  }

  function openAt(index) {
    collectSlides();
    if (!slides.length) return;
    update(index);
    lb.classList.add('is-open');
    document.body.classList.add('modal-open');
    btnClose.focus();
    lb.setAttribute('aria-hidden', 'false');
    window.addEventListener('keydown', onKey);
  }

  function close() {
    lb.classList.remove('is-open');
    document.body.classList.remove('modal-open');
    lb.setAttribute('aria-hidden', 'true');
    window.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft')  update(i - 1);
    else if (e.key === 'ArrowRight') update(i + 1);
  }

  // Click on art card -> open lightbox at that index
  track.addEventListener('click', (e) => {
    const card = e.target.closest('.art-card');
    if (!card) return;

    // If your card contains links, avoid navigating:
    const link = e.target.closest('a');
    if (link) e.preventDefault();

    collectSlides();
    const idx = slides.indexOf(card);
    if (idx !== -1) openAt(idx);
  });

  // Nav + close
  btnPrev.addEventListener('click', () => update(i - 1));
  btnNext.addEventListener('click', () => update(i + 1));
  btnClose.addEventListener('click', close);

  // Click outside the figure closes
  lb.addEventListener('click', (e) => {
    const fig = e.target.closest('.lightbox__figure');
    const isButton = e.target.closest('.lightbox__nav, .lightbox__close');
    if (!fig && !isButton) close();
  });
})();
