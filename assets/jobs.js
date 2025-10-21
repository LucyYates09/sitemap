/* jobs.js — JobWizard job-post page script
   - 解决：
     1) “US, US” 这种位置项过滤掉
     2) Location 自动加空格/逗号（SanJoseCA -> San Jose, CA）
     3) 货币为空不报错
     4) 分页可展示全部数据；默认 Date=All
*/

(() => {
  // === 你的 Make Webhook ===
  const WEBHOOK = "https://hook.us2.make.com/57hb79ks3rp4hz4oi6fl2z7x3ip8ypj5";
  const PAGE_SIZE = 20; // 每页 20 条；会自动根据数据量生成所有页码

  // === DOM ===
  const $list = document.getElementById('job-list');
  const $pagi = document.getElementById('jobs-pagination');

  // 左侧筛选
  const $kw = document.getElementById('kw');
  const $dateRadios = () => [...document.querySelectorAll('input[name="date"]')];
  const $levelChecks = () => [...document.querySelectorAll('.level-checkbox')];
  const $locGroup = document.getElementById('loc-group');
  const $locToggle = document.getElementById('loc-toggle');

  const state = {
    all: [],
    filtered: [],
    page: 1,
    locShowAll: false,
    locOptions: [] // [{name, count}]
  };

  // === 工具 ===
  const relTime = iso => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return Math.floor(diff / 60) + "m ago";
    if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
    const days = Math.floor(diff / 86400);
    if (days < 7) return days + "d ago";
    return d.toISOString().slice(0,10);
  };

  // 货币兜底：没有币种时按普通数字格式化
  const money = (n, cur) => {
    if (n == null || n === "") return "";
    const num = Number(n);
    if (Number.isNaN(num)) return String(n);
    try {
      if (cur) {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(num);
      }
      // 无 currency 时走纯数字
      return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(num);
    } catch {
      return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(num);
    }
  };

  const toTitle = (str='') => str.toString().replace(/_/g,' ').toLowerCase().replace(/\b\w/g, s=>s.toUpperCase());

  // 清洗 Location：自动空格/逗号、去重复、去 “US, US”
  const cleanLocation = (s = "") => {
    let t = String(s || "").trim();
    // SanJose -> San Jose
    t = t.replace(/([a-z])([A-Z])/g, "$1 $2");
    // BangaloreKA / BostonMA -> Bangalore, KA / Boston, MA
    t = t.replace(/([A-Za-z])([A-Z]{2})(?=$|[^a-zA-Z])/g, "$1, $2");
    // USA -> US
    t = t.replace(/\bUSA?\b/gi, "US");
    // 去重复词、重复逗号和尾逗号
    t = t.replace(/\b([A-Za-z]+)\s*,?\s*\1\b/gi, "$1")
         .replace(/\s*,\s*,/g, ", ")
         .replace(/\s{2,}/g, " ")
         .replace(/\s*,\s*$/, "");
    // 只有 US 或 US, US 的不要
    if (/^US(,\s*US)?$/i.test(t)) return "";
    return t;
  };

  const chip = (emoji, text) => text ? `<span class="pill">${emoji} ${text}</span>` : "";

  // === 卡片渲染 ===
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

  // === 分页 ===
  function renderPagination() {
    const total = state.filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;

    const btn = (label, page, disabled=false, active=false) =>
      `<button class="page-btn ${active?'active':''}" ${disabled?'disabled':''} data-page="${page}">${label}</button>`;

    // 最多显示 7 个页码，自动滑窗
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
        if (!Number.isNaN(target)) {
          const totalPages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
          if (target >=1 && target <= totalPages) {
            state.page = target; draw();
            window.scrollTo({top: $list.offsetTop - 12, behavior:'smooth'});
          }
        }
      };
    });
  }

  function draw() {
    const start = (state.page - 1) * PAGE_SIZE;
    renderCards(state.filtered.slice(start, start + PAGE_SIZE));
    renderPagination();
  }

  // === 位置 Facet ===
  function buildLocationFacet() {
    const counts = new Map();
    for (const j of state.all) {
      const loc = cleanLocation(j.Location || 'Remote');
      if (!loc) continue;
      counts.set(loc, (counts.get(loc) || 0) + 1);
    }
    const arr = [...counts.entries()].map(([name, count]) => ({name, count}))
      .sort((a,b)=> b.count - a.count || a.name.localeCompare(b.name));
    state.locOptions = arr;
    renderLocationFacet();
  }

  function renderLocationFacet() {
    const showMax = 12;
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

  // === 过滤 ===
  function applyFilters() {
    const kw = $kw.value.trim().toLowerCase();
    const dateVal = ($dateRadios().find(r=>r.checked)?.value) || 'all'; // 默认 all
    const levelSet = new Set($levelChecks().filter(c=>c.checked).map(c=>c.value));
    const locSet   = new Set([...document.querySelectorAll('.loc-checkbox:checked')].map(c=>c.value));

    let threshold = 0;
    if (dateVal === '6h') threshold = 6 * 3600;
    else if (dateVal === '24h') threshold = 24 * 3600;
    else if (dateVal === '3d') threshold = 3 * 86400;
    else if (dateVal === '7d') threshold = 7 * 86400;

    const now = Date.now();
    const result = state.all.filter(j => {
      // keyword
      if (kw) {
        const hay = (`${j.Title||''} ${j.CompanyName||''}`).toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      // date
      if (threshold > 0 && j.PostedAt) {
        const d = new Date(j.PostedAt);
        if (!isNaN(d)) {
          const diff = (now - d.getTime()) / 1000;
          if (diff > threshold) return false;
        }
      }
      // level
      if (levelSet.size) {
        const lv = j.JobLevel ? toTitle(j.JobLevel) : '';
        if (!levelSet.has(lv)) return false;
      }
      // location
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

  const debounce = (fn, ms=250) => {
    let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
  };
  const onFilterChange = debounce(applyFilters, 120);

  // === Boot ===
  async function boot() {
    try {
      const res = await fetch(WEBHOOK, { method:'GET', cache:'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      state.all = arr;
      state.filtered = [...state.all];

      // 默认 Date=All（如果页面把 All 选中，就保持不动）
      const allRadio = document.querySelector('input[name="date"][value="all"]');
      if (allRadio) allRadio.checked = true;

      buildLocationFacet();

      // 绑定交互
      $kw.addEventListener('input', onFilterChange);
      $dateRadios().forEach(r => r.addEventListener('change', onFilterChange));
      $levelChecks().forEach(c => c.addEventListener('change', onFilterChange));
      $locToggle.addEventListener('click', () => {
        state.locShowAll = !state.locShowAll; renderLocationFacet(); onFilterChange();
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
