console.log('JobWizard JS loaded');
add jobs.js
/* =========================================================
   JobWizard — Jobs Page Logic
   功能：
   1) 取 Webhook 数据 → 渲染卡片（含 Posted at、地点/级别/类型/薪资 chips）
   2) 左侧筛选：关键词、时间、级别、地点（可展开更多）
   3) 分页：每页 20 个
   4) Location 彻底清洗（自动加空格/逗号，去重复，去掉“US, US”）
   ========================================================= */

(() => {
  // ⬇️ 改成你的 Make Webhook
  const WEBHOOK = "https://hook.us2.make.com/57hb79ks3rp4hz4oi6fl2z7x3ip8ypj5";
  const PAGE_SIZE = 20;

  // 列表 & 分页
  const $list = document.getElementById('job-list');
  const $pagi = document.getElementById('jobs-pagination');

  // 筛选元素
  const $kw = document.getElementById('kw');
  const $dateRadios = () => [...document.querySelectorAll('input[name="date"]')];
  const $levelChecks = () => [...document.querySelectorAll('.level-checkbox')];
  const $locGroup = document.getElementById('loc-group');
  const $locToggle = document.getElementById('loc-toggle');

  // 状态
  const state = {
    all: [],         // 全量数据
    filtered: [],    // 筛选结果
    page: 1,
    locShowAll: false,  // 地点展开/收起
    locOptions: []      // 地点 facet [{name, count}]
  };

  /* ========== 工具函数 ========== */

  // 相对时间 / 绝对日期
  const relTime = iso => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    const diff = (Date.now() - d.getTime())/1000;
    if (diff < 60)   return "just now";
    if (diff < 3600) return Math.floor(diff/60)   + "m ago";
    if (diff < 86400) return Math.floor(diff/3600) + "h ago";
    const days = Math.floor(diff/86400);
    if (days < 7) return days + "d ago";
    return d.toISOString().slice(0,10);
  };

  // 货币
  const money = (n, cur='USD') => {
    if (n == null || n === "") return "";
    const num = Number(n);
    if (Number.isNaN(num)) return String(n);
    return new Intl.NumberFormat('en-US', { style:'currency', currency:cur, maximumFractionDigits:0 }).format(num);
  };

  // MID_SENIOR → Mid Senior
  const toTitle = (str='') =>
    str.toString().replace(/_/g,' ').toLowerCase().replace(/\b\w/g, s=>s.toUpperCase());

  // 🔧 统一清洗地点：
  //  - SanJose → San Jose；BangaloreKA/BostonMA → Bangalore, KA/Boston, MA
  //  - 规范 US/USA；去重复词；去重复逗号；去尾逗号
  //  - “US, US” 或仅 “US” → return ""（不参与 facet、不显示 chip）
  const cleanLocation = (s = "") => {
    let t = String(s || "").trim();

    // SanJose → San Jose
    t = t.replace(/([a-z])([A-Z])/g, "$1 $2");

    // BangaloreKA / BostonMA → Bangalore, KA / Boston, MA
    t = t.replace(/([A-Za-z])([A-Z]{2})(?=$|[^a-zA-Z])/g, "$1, $2");

    // 统一 US
    t = t.replace(/\bUSA?\b/gi, "US");

    // 去重复词（California California）
    t = t.replace(/\b([A-Za-z]+)\s*,?\s*\1\b/gi, "$1");

    // 去重复逗号、空格与末尾逗号
    t = t.replace(/\s*,\s*,/g, ", ")
         .replace(/\s{2,}/g, " ")
         .replace(/\s*,\s*$/, "");

    // “US” 或 “US, US” 直接过滤掉
    if (/^US(,\s*US)?$/i.test(t)) return "";

    return t;
  };

  const chip = (emoji, text) => text ? `<span class="pill">${emoji} ${text}</span>` : "";

  /* ========== 渲染卡片 ========== */
  function renderCards(dataPage) {
    if (!dataPage.length) {
      $list.innerHTML = '<div class="error">No jobs for this page.</div>';
      return;
    }
    const html = dataPage.map(job => {
      const title    = job.Title || "Untitled";
      const company  = job.CompanyName || "";
      const location = cleanLocation(job.Location || "Remote");
      const type     = job.EmploymentType || "";
      const level    = job.JobLevel ? toTitle(job.JobLevel) : "";
      const posted   = job.PostedAt ? relTime(job.PostedAt) : "";
      const url      = job.JobUrl || "#";

      let salaryTxt = "";
      if (job.SalaryMin && job.SalaryMax) {
        salaryTxt = `${money(job.SalaryMin, job.SalaryCurrency)} - ${money(job.SalaryMax, job.SalaryCurrency)}`;
      } else if (job.SalaryRange) {
        salaryTxt = job.SalaryRange;
      }

      return `
        <div class="job-card">
          <div class="job-main">
            <div class="job-meta-row">
              <div class="job-company">${company}</div>
              ${posted ? `<div class="posted-at">Posted at <span class="posted-pill">${posted}</span></div>` : ``}
            </div>
            <div class="job-title">${title}</div>
            <div class="chip-row">
              ${chip('📍',  location)}
              ${chip('⏱️',  type)}
              ${chip('💰',  salaryTxt)}
              ${chip('📊',  level)}
            </div>
          </div>
          <div class="job-cta">
            <a class="apply-btn" href="${url}" target="_blank" rel="nofollow noopener">Apply</a>
          </div>
        </div>
      `;
    }).join('');
    $list.innerHTML = html;
  }

  /* ========== 分页 ========== */
  function renderPagination() {
    const total = state.filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;

    const btn = (label, page, disabled=false, active=false) =>
      `<button class="page-btn ${active?'active':''}" ${disabled?'disabled':''} data-page="${page}">${label}</button>`;

    const maxBtns = 7;
    let start = Math.max(1, state.page - Math.floor(maxBtns/2));
    let end   = Math.min(totalPages, start + maxBtns - 1);
    if (end - start + 1 < maxBtns) start = Math.max(1, end - maxBtns + 1);

    let numbers = '';
    for (let p = start; p <= end; p++) numbers += btn(p, p, false, p === state.page);

    $pagi.innerHTML = [
      btn('Prev', state.page - 1, state.page === 1),
      numbers,
      btn('Next', state.page + 1, state.page === totalPages)
    ].join('');

    $pagi.querySelectorAll('.page-btn[data-page]').forEach(el => {
      el.onclick = () => {
        const target = Number(el.dataset.page);
        const totalPages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
        if (!Number.isNaN(target) && target >=1 && target <= totalPages) {
          state.page = target;
          draw();
          window.scrollTo({ top: $list.offsetTop - 12, behavior:'smooth' });
        }
      };
    });
  }

  function draw() {
    const start = (state.page - 1) * PAGE_SIZE;
    renderCards(state.filtered.slice(start, start + PAGE_SIZE));
    renderPagination();
  }

  /* ========== 地点 facet ========== */
  function buildLocationFacet() {
    const counts = new Map();
    for (const j of state.all) {
      const loc = cleanLocation(j.Location || 'Remote');
      if (!loc) continue; // 去掉空（含“US, US”/“US”）
      counts.set(loc, (counts.get(loc) || 0) + 1);
    }
    const arr = [...counts.entries()].map(([name, count]) => ({name, count}))
      .sort((a,b)=> b.count - a.count || a.name.localeCompare(b.name));
    state.locOptions = arr;
    renderLocationFacet();
  }

  function renderLocationFacet() {
    const showMax = 12; // 默认显示 12 个
    const list = state.locShowAll ? state.locOptions : state.locOptions.slice(0, showMax);

    $locGroup.innerHTML = list.map(opt => `
      <label class="loc-pill">
        <input type="checkbox" class="loc-checkbox" value="${opt.name}">
        <span>${opt.name}</span>
      </label>
    `).join('');

    $locToggle.style.display = state.locOptions.length > showMax ? 'inline-block' : 'none';
    $locToggle.textContent = state.locShowAll ? 'Show less' : 'Show more';

    $locGroup.querySelectorAll('.loc-checkbox').forEach(el => {
      el.addEventListener('change', onFilterChange);
    });
  }

  /* ========== 过滤 ========== */
  function applyFilters() {
    const kw = $kw.value.trim().toLowerCase();
    const dateVal = ($dateRadios().find(r=>r.checked)?.value) || 'all';

    const levelSet = new Set($levelChecks().filter(c=>c.checked).map(c=>c.value));
    const locSet   = new Set([...document.querySelectorAll('.loc-checkbox:checked')].map(c=>c.value));

    // 时间阈值（秒）
    let threshold = 0;
    if (dateVal === '6h') threshold = 6 * 3600;
    else if (dateVal === '24h') threshold = 24 * 3600;
    else if (dateVal === '3d') threshold = 3 * 86400;
    else if (dateVal === '7d') threshold = 7 * 86400;

    const now = Date.now();

    const result = state.all.filter(j => {
      // 关键词
      if (kw) {
        const hay = (`${j.Title||''} ${j.CompanyName||''}`).toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      // 时间
      if (threshold > 0 && j.PostedAt) {
        const d = new Date(j.PostedAt);
        if (!isNaN(d)) {
          const diff = (now - d.getTime()) / 1000;
          if (diff > threshold) return false;
        }
      }
      // 级别
      if (levelSet.size) {
        const lv = j.JobLevel ? toTitle(j.JobLevel) : '';
        if (!levelSet.has(lv)) return false;
      }
      // 地点
      if (locSet.size) {
        const loc = cleanLocation(j.Location || 'Remote');
        if (!locSet.has(loc)) return false;
      }
      return true;
    });

    state.filtered = result;
    state.page = 1;
    draw();
  }

  // Debounce，减少频繁筛选触发
  const debounce = (fn, ms=300) => {
    let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
  };
  const onFilterChange = debounce(applyFilters, 100);

  /* ========== 初始化 ========== */
  async function boot() {
    try {
      // 拉取 Webhook 数据
      const res = await fetch(WEBHOOK, { method:'GET', cache:'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);

      const data = await res.json();
      const arr = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      state.all = arr;
      state.filtered = [...state.all];

      // 构建地点 facet
      buildLocationFacet();

      // 绑定事件
      $kw.addEventListener('input', onFilterChange);
      $dateRadios().forEach(r => r.addEventListener('change', onFilterChange));
      $levelChecks().forEach(c => c.addEventListener('change', onFilterChange));
      $locToggle.addEventListener('click', () => {
        state.locShowAll = !state.locShowAll;
        renderLocationFacet();
        onFilterChange();
      });

      draw();
    } catch (e) {
      console.error(e);
      $list.innerHTML = '<div class="error">Failed to load jobs. Please try again later.</div>';
      $pagi.innerHTML = '';
    }
  }

  boot();
})();
