// ── Theme ────────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.textContent = saved === 'dark' ? '☀️' : '🌙';
    btn.setAttribute('aria-label', saved === 'dark' ? '切换亮色模式' : '切换暗色模式');
    btn.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      document.querySelectorAll('.theme-toggle').forEach(b => {
        b.textContent = next === 'dark' ? '☀️' : '🌙';
      });
    });
  });
}

// ── Particle Canvas ──────────────────────────────────────────────
class ParticleCanvas {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.mouse = { x: null, y: null };
    this.resize();
    this.init();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('mousemove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    this.animate();
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  init() {
    const count = Math.floor((this.canvas.width * this.canvas.height) / 12000);
    this.particles = Array.from({ length: count }, () => ({
      x: Math.random() * this.canvas.width,
      y: Math.random() * this.canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.5 + 0.5,
    }));
  }

  animate() {
    const { ctx, canvas, particles, mouse } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(201,100,66,0.5)';
      ctx.fill();
    });

    // Draw lines between nearby particles and mouse
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 100) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(201,100,66,${0.12 * (1 - dist / 100)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
      if (mouse.x) {
        const dx = particles[i].x - mouse.x;
        const dy = particles[i].y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.strokeStyle = `rgba(139,94,60,${0.25 * (1 - dist / 150)})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(() => this.animate());
  }
}

// ── Scroll Reveal ────────────────────────────────────────────────
function initScrollReveal() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// ── Typing Effect ────────────────────────────────────────────────
function typeWriter(el, text, speed = 60) {
  let i = 0;
  el.textContent = '';
  const timer = setInterval(() => {
    el.textContent += text[i++];
    if (i >= text.length) clearInterval(timer);
  }, speed);
}

// ── Navbar scroll ────────────────────────────────────────────────
function initNavbar() {
  const nav = document.querySelector('.navbar');
  if (!nav) return;
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 50);
  });
}

// ── Mobile menu ──────────────────────────────────────────────────
function initMobileMenu() {
  const btn = document.querySelector('.menu-toggle');
  const menu = document.querySelector('.nav-links');
  if (!btn || !menu) return;
  btn.addEventListener('click', () => {
    menu.classList.toggle('open');
    btn.classList.toggle('active');
  });
}

// ── Render post cards ────────────────────────────────────────────
function renderPosts(list, container) {
  if (!container) return;
  container.innerHTML = list.map((p, i) => {
    const href = p.url || `post.html?id=${p.id}`;
    const isFeature = list.length <= 2;
    return `
    <article class="post-card${isFeature ? ' post-card--feature' : ''} reveal" style="--delay:${i * 0.08}s">
      <a href="${href}" class="card-img-wrap">
        <img src="${p.cover}" alt="${p.title}" loading="lazy">
        <span class="card-category">${p.category}</span>
      </a>
      <div class="card-body">
        <h3><a href="${href}">${p.title}</a></h3>
        <p>${p.summary}</p>
        <div class="card-meta">
          <span class="date">📅 ${p.date}</span>
          <span class="read-time">⏱ ${p.readTime} min</span>
        </div>
        <div class="card-tags">${p.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
      </div>
    </article>
  `}).join('');
}

// ── Filter ───────────────────────────────────────────────────────
function initFilter() {
  const btns = document.querySelectorAll('.filter-btn');
  const grid = document.getElementById('posts-grid');
  if (!btns.length || !grid) return;
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cat = btn.dataset.cat;
      const filtered = cat === 'all' ? posts : posts.filter(p => p.category === cat || p.tags.includes(cat));
      renderPosts(filtered, grid);
      initScrollReveal();
    });
  });
}

// ── Post detail page ─────────────────────────────────────────────
function renderPostDetail() {
  const id = parseInt(new URLSearchParams(location.search).get('id'));
  const post = posts.find(p => p.id === id);
  if (!post) return;

  document.title = post.title + ' | OpsLife';
  const el = document.getElementById('post-content');
  if (!el) return;

  el.innerHTML = `
    <div class="post-hero" style="background-image:url(${post.cover})">
      <div class="post-hero-overlay">
        <span class="card-category">${post.category}</span>
        <h1>${post.title}</h1>
        <div class="post-meta">
          <span>${post.date}</span>
          <span>⏱ ${post.readTime} min read</span>
        </div>
      </div>
    </div>
    <div class="post-body">
      <p>${post.summary}</p>
      <blockquote>本文为示例内容，完整文章正在撰写中……</blockquote>
      <h2>背景</h2>
      <p>作为一名从业15年的运维工程师，在日常工作中积累了大量实战经验。本文将系统梳理相关知识点，希望对同行有所帮助。</p>
      <h2>核心要点</h2>
      <ul>
        ${post.tags.map(t => `<li><strong>${t}</strong>：相关内容详解</li>`).join('')}
      </ul>
      <h2>总结</h2>
      <p>技术在不断演进，保持学习的热情和对细节的敬畏，是运维工程师最重要的品质。</p>
    </div>
  `;
}

// ── Init ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  const canvas = document.getElementById('particle-canvas');
  if (canvas) new ParticleCanvas(canvas);

  initNavbar();
  initMobileMenu();
  initScrollReveal();

  const typeEl = document.getElementById('hero-type');
  if (typeEl) {
    setTimeout(() => typeWriter(typeEl, typeEl.dataset.text || typeEl.textContent), 400);
  }

  const grid = document.getElementById('posts-grid');
  if (grid && typeof posts !== 'undefined') {
    renderPosts(posts, grid);
    initFilter();
    setTimeout(initScrollReveal, 100);
  }

  if (document.getElementById('post-content')) renderPostDetail();
});
