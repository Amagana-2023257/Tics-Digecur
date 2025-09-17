import crypto from 'crypto';
import { Router } from 'express';
import { validateJWT } from '../middlewares/validate-jwt.js';
import { hasRoles } from '../middlewares/validate-roles.js';
import { ROLES } from '../user/user.model.js';

const router = Router();

/**
 * Monta la UI propietaria (tipo Swagger) en /audit, con CSP por respuesta (nonce).
 * - El HTML incluye login (usa /digecur/v1/auth/login) y sólo muestra la app a ADMIN/DIRECTOR.
 * - El JS consume la API de auditoría en /digecur/v1/audit/* (search, stats, export, purge, getOne).
 * - El JS y CSS son inline pero habilitados por 'nonce-<valor>' que se inyecta por respuesta.
 */
export const mountAuditUI = (app) => {
  app.get('/audit', (req, res) => {
    // Toma nonce generado por middleware; si no existe, créalo
    const nonce = res.locals.cspNonce || crypto.randomBytes(16).toString('base64');

    // Fija CSP específica para ESTA respuesta (coincidir con Helmet general y añadir nonces)
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}'`,
        `style-src 'self' 'nonce-${nonce}'`,
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self'",
      ].join('; ')
    );

    res.type('html').send(renderAuditHtml(nonce));
  });
};

// Variante protegida 100% por middleware (opcional)
router.get(
  '/secure',
  validateJWT,
  hasRoles(ROLES.ADMIN, ROLES.DIRECTOR),
  (req, res) => {
    const nonce = res.locals.cspNonce || crypto.randomBytes(16).toString('base64');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}'`,
        `style-src 'self' 'nonce-${nonce}'`,
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self'",
      ].join('; ')
    );
    res.type('html').send(renderAuditHtml(nonce));
  }
);

export default router;

/* ========================================================================== */
/* =============================== HTML INLINE ============================== */
/* ========================================================================== */

function renderAuditHtml(nonce) {
  const brandDark = '#192854';
  const brandCyan = '#24B2E3';
  const grayBg = '#f6f7fb';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Auditoría | DIGECUR</title>
<style nonce="${nonce}">
  :root{
    --brand-dark:${brandDark};
    --brand-cyan:${brandCyan};
    --bg:${grayBg};
    --text:#0f172a;
    --muted:#64748b;
    --border:#e2e8f0;
    --danger:#e11d48;
    --ok:#059669;
  }
  *{box-sizing:border-box}
  html,body{height:100%}
  body{
    margin:0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
    background:var(--bg); color:var(--text);
  }
  .topbar{
    position:sticky; top:0; z-index:50; display:flex; align-items:center; justify-content:space-between;
    padding:10px 16px; background:rgba(255,255,255,.92); backdrop-filter:saturate(150%) blur(8px);
    border-bottom:1px solid var(--border);
  }
  .brand{display:flex;align-items:center;gap:10px}
  .brand__logo{
    width:34px;height:34px;border-radius:8px;
    background:linear-gradient(135deg,var(--brand-dark), var(--brand-cyan));
    display:grid;place-items:center;color:#fff;font-weight:700; letter-spacing:.5px;
  }
  .brand__title{font-weight:700;color:var(--brand-dark)}
  .btn{
    border:1px solid var(--border); background:#fff; padding:8px 12px; border-radius:8px; cursor:pointer;
    transition:.15s ease; font-weight:600;
  }
  .btn:hover{filter:brightness(.97)}
  .btn--primary{background:var(--brand-cyan); color:#fff; border-color:transparent}
  .btn--danger{background:var(--danger); color:#fff; border-color:transparent}
  .btn--ghost{background:transparent}
  .container{max-width:1200px; margin:0 auto; padding:18px}
  .grid{display:grid; gap:16px}
  .card{
    background:#fff; border:1px solid var(--border); border-radius:14px; padding:16px;
    box-shadow:0 6px 18px rgba(25,40,84,.06);
  }
  .card__title{margin:0 0 6px 0; font-size:18px; color:var(--brand-dark)}
  .card__subtitle{margin:0; color:var(--muted); font-size:13px}
  .filters{display:grid; gap:10px}
  .filters__row{display:grid; gap:10px; grid-template-columns:repeat(4, minmax(0,1fr))}
  .field{display:grid; gap:6px}
  .field>span{font-size:12px; color:var(--muted)}
  input, select, textarea{
    width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:10px; outline:none;
  }
  input:focus,select:focus,textarea:focus{box-shadow:0 0 0 4px rgba(36,178,227,.15); border-color:var(--brand-cyan)}
  .toolbar-actions{display:flex; gap:8px; align-items:center}
  .grow{flex:1}
  table{width:100%; border-collapse:separate; border-spacing:0; border:1px solid var(--border); border-radius:12px; overflow:hidden}
  th, td{padding:10px 12px; border-bottom:1px solid var(--border); text-align:left; font-size:13px}
  th{background:#f9fafb; color:#334155; white-space:nowrap}
  tr:hover td{background:#fafcff}
  .status-ok{color:var(--ok);font-weight:700}
  .status-bad{color:var(--danger);font-weight:700}
  .pill{display:inline-block; padding:2px 8px; border-radius:999px; border:1px solid var(--border); font-size:11px; color:#0f172a; background:#f8fafc}
  .flex{display:flex; align-items:center; gap:8px}
  .right{justify-content:flex-end}
  .muted{color:var(--muted)}
  .mono{font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;}
  .jsonbox{
    background:#0b1024; color:#cfe2ff; padding:14px; border-radius:10px; overflow:auto; max-height:360px;
    border:1px solid rgba(255,255,255,.08)
  }
  .pagination{display:flex; align-items:center; gap:6px}
  .statbar{display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:12px}
  .stat{background:#fff; border:1px solid var(--border); border-radius:12px; padding:12px}
  .stat h3{margin:0; font-size:13px; color:var(--muted)}
  .stat strong{display:block; font-size:20px; color:var(--brand-dark)}
  /* Login */
  .center{min-height:calc(100dvh - 56px); display:grid; place-items:center}
  .max-sm{max-width:420px; width:100%}
  .mb8{margin-bottom:8px}
  .mb12{margin-bottom:12px}
  .hidden{display:none}
</style>
</head>
<body>
<header class="topbar">
  <div class="brand">
    <div class="brand__logo">GRG</div>
    <div class="brand__title">Auditoría</div>
  </div>
  <div class="toolbar-actions">
    <span id="userBadge" class="pill hidden"></span>
    <button id="btnLogout" class="btn btn--danger hidden">Cerrar sesión</button>
  </div>
</header>

<main id="viewLogin" class="center">
  <form id="formLogin" class="card max-sm">
    <h2 class="card__title">Iniciar sesión</h2>
    <p class="card__subtitle mb12">Solo usuarios con rol <b>ADMIN</b> o <b>DIRECTOR</b>.</p>
    <label class="field mb8">
      <span>Correo</span>
      <input type="email" name="email" placeholder="admin@digecur.local" required />
    </label>
    <label class="field mb12">
      <span>Contraseña</span>
      <input type="password" name="password" placeholder="********" required />
    </label>
    <button class="btn btn--primary" type="submit" id="btnLogin">Entrar</button>
    <div id="loginMsg" class="muted mb8"></div>
  </form>
</main>

<main id="viewApp" class="container hidden">
  <section class="grid">
    <div class="card">
      <h2 class="card__title">Filtros</h2>
      <p class="card__subtitle">Busca, pagina y ordena movimientos.</p>
      <form id="formFilters" class="filters">
        <div class="filters__row">
          <label class="field"><span>Texto</span><input name="q" placeholder="mensaje, error, path..."/></label>
          <label class="field"><span>Acción</span><input name="action" placeholder="USER_CREATE, CARDEX_VIEW..."/></label>
          <label class="field"><span>Entidad</span><input name="entity" placeholder="USER, CARDEX, INVENTORY"/></label>
          <label class="field"><span>ID Entidad</span><input name="entityId" placeholder="ObjectId"/></label>
        </div>
        <div class="filters__row">
          <label class="field"><span>Email</span><input name="email" placeholder="usuario@dominio"/></label>
          <label class="field"><span>Éxito</span>
            <select name="success"><option value="">Todos</option><option value="true">OK</option><option value="false">Error</option></select>
          </label>
          <label class="field"><span>Status</span><input type="number" name="statusCode" placeholder="200, 401..."/></label>
          <label class="field"><span>Tag</span><input name="tag" placeholder="inventario, cardex..."/></label>
        </div>
        <div class="filters__row">
          <label class="field"><span>Desde</span><input type="datetime-local" name="dateFrom"/></label>
          <label class="field"><span>Hasta</span><input type="datetime-local" name="dateTo"/></label>
          <label class="field"><span>Orden</span>
            <select name="sort"><option value="-createdAt">Recientes primero</option><option value="createdAt">Antiguos primero</option><option value="action">Acción (A-Z)</option><option value="-action">Acción (Z-A)</option></select>
          </label>
          <label class="field"><span>Por página</span>
            <select name="limit"><option>20</option><option>50</option><option>100</option><option>200</option></select>
          </label>
        </div>
        <div class="toolbar-actions">
          <button class="btn btn--primary" type="submit">Buscar</button>
          <button class="btn" type="button" id="btnClear">Limpiar</button>
          <div class="grow"></div>
          <button class="btn" type="button" id="btnExport">Exportar CSV</button>
          <label class="field" style="width:140px;">
            <span>Purgar (días)</span>
            <input type="number" id="purgeDays" min="1" placeholder="30"/>
          </label>
          <button class="btn btn--danger" type="button" id="btnPurge">Purgar</button>
        </div>
      </form>
    </div>

    <div class="statbar">
      <div class="stat"><h3>Total</h3><strong id="statTotal">—</strong></div>
      <div class="stat"><h3>Últimas 24h</h3><strong id="stat24h">—</strong></div>
      <div class="stat"><h3>OK</h3><strong id="statOk">—</strong></div>
      <div class="stat"><h3>Error</h3><strong id="statErr">—</strong></div>
    </div>

    <div class="card">
      <div class="flex right">
        <div class="pagination">
          <button class="btn" id="prevPage">◀</button>
          <span id="pageInfo" class="muted">pág. 1/1</span>
          <button class="btn" id="nextPage">▶</button>
        </div>
      </div>
      <div class="grid">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Usuario</th>
              <th>Acción</th>
              <th>Entidad</th>
              <th>Status</th>
              <th>Mensaje</th>
            </tr>
          </thead>
          <tbody id="logsBody"></tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h2 class="card__title">Detalle</h2>
      <pre id="detailBox" class="jsonbox mono">Selecciona un registro…</pre>
    </div>
  </section>
</main>

<script nonce="${nonce}">
(function(){
  const API = {
    login: '/digecur/v1/auth/login',
    me: '/digecur/v1/auth/me',
    search: '/digecur/v1/audit/search',
    stats: '/digecur/v1/audit/stats',
    exportCsv: '/digecur/v1/audit/export',
    purge: '/digecur/v1/audit/purge',
    getOne: (id)=> '/digecur/v1/audit/' + encodeURIComponent(id),
  };

  const $ = (id)=>document.getElementById(id);
  const qs = (sel,root=document)=>root.querySelector(sel);

  const viewLogin = $('viewLogin');
  const viewApp = $('viewApp');
  const loginMsg = $('loginMsg');
  const userBadge = $('userBadge');
  const btnLogout = $('btnLogout');

  const formLogin = $('formLogin');
  const formFilters = $('formFilters');
  const btnClear = $('btnClear');
  const btnExport = $('btnExport');
  const btnPurge = $('btnPurge');
  const purgeDays = $('purgeDays');

  const prevPage = $('prevPage');
  const nextPage = $('nextPage');
  const pageInfo = $('pageInfo');
  const logsBody = $('logsBody');
  const detailBox = $('detailBox');

  const statTotal = $('statTotal');
  const stat24h = $('stat24h');
  const statOk = $('statOk');
  const statErr = $('statErr');

  let token = localStorage.getItem('audit_token') || '';
  let page = 1; let pages = 1; let limit = 20; let currentParams = {};

  function setAuthHeader(h={}) {
    if (token) { h['Authorization'] = 'Bearer ' + token; h['x-token']=token; }
    return h;
  }

  function showLogin() {
    viewLogin.classList.remove('hidden');
    viewApp.classList.add('hidden');
    userBadge.classList.add('hidden');
    btnLogout.classList.add('hidden');
  }
  function showApp(profile) {
    viewLogin.classList.add('hidden');
    viewApp.classList.remove('hidden');
    userBadge.textContent = (profile?.email||'') + ' [' + (profile?.roles||[]).join('|') + ']';
    userBadge.classList.remove('hidden');
    btnLogout.classList.remove('hidden');
  }

  async function checkMe() {
    if (!token) return showLogin();
    const r = await fetch(API.me, { headers: setAuthHeader() });
    if (!r.ok) { token=''; localStorage.removeItem('audit_token'); return showLogin(); }
    const data = await r.json();
    const roles = (data?.user?.roles||[]).map(String);
    const isAllowed = roles.includes('ADMIN') || roles.includes('DIRECTOR');
    if (!isAllowed) { token=''; localStorage.removeItem('audit_token'); loginMsg.textContent='No autorizado'; return showLogin(); }
    showApp(data.user);
    await refreshStats();
    await runSearch(1);
  }

  formLogin.addEventListener('submit', async (e)=>{
    e.preventDefault();
    loginMsg.textContent = '';
    const fd = new FormData(formLogin);
    const payload = { email: fd.get('email'), password: fd.get('password') };
    try {
      const r = await fetch(API.login, {
        method:'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok || !data?.user?.token) {
        loginMsg.textContent = data?.message || 'Credenciales inválidas';
        return;
      }
      token = data.user.token;
      localStorage.setItem('audit_token', token);
      await checkMe();
    } catch (e) {
      loginMsg.textContent = e?.message || 'Error de red';
    }
  });

  btnLogout.addEventListener('click', ()=>{
    token=''; localStorage.removeItem('audit_token');
    showLogin();
  });

  btnClear.addEventListener('click', ()=>{ formFilters.reset(); });

  formFilters.addEventListener('submit', async (e)=>{
    e.preventDefault();
    await runSearch(1);
  });

  prevPage.addEventListener('click', async ()=>{ if (page>1) await runSearch(page-1); });
  nextPage.addEventListener('click', async ()=>{ if (page<pages) await runSearch(page+1); });

  btnExport.addEventListener('click', async ()=>{
    try{
      const url = API.exportCsv + buildQuery(currentParams);
      const r = await fetch(url, { headers: setAuthHeader() });
      if (!r.ok) { alert('No se pudo exportar'); return; }
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'audit.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    }catch(e){ alert(e?.message||'Error exportando');}
  });

  btnPurge.addEventListener('click', async ()=>{
    const days = Number(purgeDays.value||'0');
    if (!days || days<1) return alert('Ingresa días a purgar');
    if (!confirm('¿Purgar registros con más de '+days+' días?')) return;
    try{
      // Para compatibilidad (algunos controladores leen query), enviamos en query y en body:
      const url = API.purge + '?olderThanDays=' + encodeURIComponent(days);
      const r = await fetch(url, {
        method:'POST',
        headers: setAuthHeader({ 'Content-Type':'application/json' }),
        body: JSON.stringify({ olderThanDays: days }),
      });
      const data = await r.json();
      if (!r.ok) return alert(data?.message||'No se pudo purgar');
      alert(data?.message || 'Purgado ok');
      await refreshStats();
      await runSearch(1);
    }catch(e){ alert(e?.message||'Error purgando');}
  });

  function readFilters() {
    const fd = new FormData(formFilters);
    const obj = Object.fromEntries([...fd.entries()].filter(([k,v])=>v!=='' && v!=null));
    limit = Number(obj.limit || 20);
    return obj;
  }

  function buildQuery(obj) {
    const q = new URLSearchParams();
    for (const [k,v] of Object.entries(obj||{})) q.append(k, v);
    q.append('page', page);
    q.append('limit', String(limit));
    return '?' + q.toString();
  }

  async function runSearch(toPage=1) {
    page = toPage;
    currentParams = readFilters();
    const url = API.search + buildQuery(currentParams);
    const r = await fetch(url, { headers: setAuthHeader() });
    const data = await r.json();
    if (!r.ok){ alert(data?.message||'Error buscando'); return; }
    renderTable(data?.items||[]);
    const pg = data?.pagination || { page:1,pages:1,total:0 };
    page = pg.page; pages = pg.pages||1;
    pageInfo.textContent = 'pág. ' + page + '/' + pages + ' • ' + (pg.total||0) + ' resultados';
  }

  function renderTable(items){
    logsBody.innerHTML = '';
    items.forEach((it)=>{
      const tr = document.createElement('tr');
      const statusCls = it.response?.success ? 'status-ok' : 'status-bad';
      const userStr = (it.user?.email || it.user?.id || '—');
      tr.innerHTML = \`
        <td>\${ new Date(it.createdAt).toLocaleString('es-ES') }</td>
        <td>\${ esc(userStr) }</td>
        <td><span class="pill">\${ esc(it.action||'—') }</span></td>
        <td>\${ esc(it.entity||'—') }\${ it.entityId ? ' · ' + esc(it.entityId) : '' }</td>
        <td class="\${statusCls}">\${ it.response?.statusCode ?? '—' }</td>
        <td class="muted">\${ esc(it.response?.message||'') }</td>
      \`;
      tr.addEventListener('click', ()=> showDetail(it._id || it.id));
      logsBody.appendChild(tr);
    });
    detailBox.textContent = 'Selecciona un registro…';
  }

  async function showDetail(id){
    const r = await fetch(API.getOne(id), { headers: setAuthHeader() });
    const data = await r.json();
    if (!r.ok){ detailBox.textContent = data?.message||'Error obteniendo detalle'; return; }
    detailBox.textContent = JSON.stringify(data?.log || data?.movement || data, null, 2);
  }

  async function refreshStats(){
    const r = await fetch(API.stats, { headers: setAuthHeader() });
    const d = await r.json();
    if (!r.ok) return;
    // El endpoint /stats de audit.routes expone 'stats' agregadas y equivalentes
    const total = (d?.stats?.total ?? d?.stats?.byAction?.reduce?.((a,x)=>a+(x?.count||0),0) ?? '—');
    statTotal.textContent = total;
    // Derivados
    statOk.textContent = (d?.stats?.ok ?? (d?.stats?.bySuccess||[]).find(s=>s.success===true)?.count ?? '—');
    statErr.textContent = (d?.stats?.error ?? (d?.stats?.bySuccess||[]).find(s=>s.success===false)?.count ?? '—');
    stat24h.textContent = Array.isArray(d?.stats?.last24h) ? d.stats.last24h.reduce((a,x)=>a+(x?.count||0),0) : '—';
  }

  function esc(s){ return String(s??'').replace(/[<>&"']/g, m=>({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;' }[m])); }

  // Arranque
  checkMe();
})();
</script>
</body>
</html>`;
}
