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


function renderCodingCard(item) {
  const name = escapeHTML(item.project_name || "Untitled");
  const link = typeof item.link === "string" ? item.link : "#";
  const desc = escapeHTML(item.description || "");
  const tags = Array.isArray(item.tags) ? item.tags : [];

  const tagsHTML = tags.map(t => {
    const label = escapeHTML(String(t.tag || "").trim());
    return `<span class="tag">${label}</span>`;
  }).join("");

  return `
    <article class="project-card">
      <h4>${name}</h4>
      <p class="desc">${desc}</p>
      ${tagsHTML ? `<div class="tags">${tagsHTML}</div>` : `<div class="tags"></div>`}
      <div class="actions">
        <a href="${encodeURI(link)}" target="_blank" rel="noopener">View project →</a>
      </div>
    </article>
  `;
}


function renderArtCard(item) {
  const title = escapeHTML(item.title || "Untitled");
  const desc  = escapeHTML(item.description || "");

  const img = normalizeArtPath(item.image || "");
  const hasImg = Boolean(img);

  // If there is no image value at all, render the card already in error state
  const cardClass = hasImg ? "art-card" : "art-card error";

  // The thumb area keeps size uniform; onerror flips the card to error state
  const imgHTML = hasImg
    ? `<img src="${encodeURI(img)}" alt="${title}" onerror="this.closest('article').classList.add('error')" />`
    : "";

  return `
    <article class="${cardClass}">
      <a href="${hasImg ? encodeURI(img) : '#'}" ${hasImg ? 'target="_blank" rel="noopener"' : ''}>
        <div class="thumb">
          ${imgHTML}
          <div class="thumb-fallback">Image not found</div>
        </div>
        <div class="art-body">
          <div class="title">${title}</div>
          <p class="desc">${desc}</p>
        </div>
      </a>
    </article>
  `;
}



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
  const catSelect = document.getElementById('tagCategory');
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

  if (!catSelect || !codingEls.track || !artEls.track) return;

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

      // Build categories for coding select
      const categories = getAllCategories(coding);
      const defaultCat = categories.includes('content') ? 'content' : (categories[0] || '');
      renderCategorySelect(catSelect, categories, defaultCat);

      // Create carousels
      const codingCarousel = makeCarousel({
        items: coding,
        trackEl: codingEls.track,
        prevEl: codingEls.prev,
        nextEl: codingEls.next,
        renderCard: (item) => renderCodingCard(item, catSelect.value),
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

      // Re-render coding when category changes
      catSelect.addEventListener('change', () => {
        codingCarousel.render(); // renderCard uses current catSelect.value
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

  function renderCategorySelect(selectEl, cats, value) {
    selectEl.innerHTML = cats.map(c => `<option value="${escAttr(c)}">${escHtml(c)}</option>`).join('');
    if (value) selectEl.value = value; // default 'content' if available
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
        <h4>${escHtml(item.project_name || item.title || '')}</h4>
        <p class="desc">${escHtml(item.description || '')}</p>
        <div class="tags">${tagsHtml}</div>
        ${item.link ? `<p class="actions"><a class="btn" href="${escAttr(item.link)}" target="_blank" rel="noopener">View ↗</a></p>` : ''}
      </article>
    `;
  }

  function renderArtCard(item) {
    // Try to be forgiving about field names
    const title = item.title || item.name || '';
    const desc  = item.description || '';
    let imgSrc  = item.image || item.file || item.src || '';
    if (imgSrc && !/^\.\.?\//.test(imgSrc) && !/^https?:\/\//i.test(imgSrc)) {
      // If it's just a filename, assume ./assets/art/
      imgSrc = `./assets/art/${imgSrc}`;
    }
    return `
      <article class="art-card">
        ${imgSrc ? `<img src="${escAttr(imgSrc)}" alt="${escAttr(title || 'Artwork')}" style="width:100%;height:auto;border-radius:8px;">` : ''}
        <h4>${escHtml(title)}</h4>
        ${desc ? `<p class="desc">${escHtml(desc)}</p>` : ''}
      </article>
    `;
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
