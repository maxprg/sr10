/* ============================================================
   SR10 – app.js  –  Utilitaires partagés
   ============================================================ */

/* ── Auth ────────────────────────────────────────────────────── */
const Auth = {
  TOKEN_KEY: 'sr10_token',
  USER_KEY:  'sr10_user',

  getToken()  { return localStorage.getItem(this.TOKEN_KEY); },
  getUser()   {
    try { return JSON.parse(localStorage.getItem(this.USER_KEY)); }
    catch { return null; }
  },
  isLoggedIn() { return !!this.getToken(); },

  save(token, user) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  },
  logout() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    window.location.href = '/index.html';
  },

  requireAuth(role) {
    if (!this.isLoggedIn()) { window.location.href = '/index.html'; return false; }
    if (role) {
      const u = this.getUser();
      const roles = Array.isArray(role) ? role : [role];
      if (!roles.includes(u?.role)) { window.location.href = '/index.html'; return false; }
    }
    return true;
  }
};

/* ── API wrapper ─────────────────────────────────────────────── */
const API = {
  base: '',   // même origine que le serveur Express

  async request(method, path, body = null, auth = false) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      const token = Auth.getToken();
      if (token) headers['Authorization'] = 'Bearer ' + token;
    }
    const opts = { method, headers };
    if (body !== null) opts.body = JSON.stringify(body);

    const res = await fetch(this.base + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: res.status, message: data.error || 'Erreur serveur' };
    return data;
  },

  get(path, auth = false)        { return this.request('GET',    path, null, auth); },
  post(path, body, auth = false) { return this.request('POST',   path, body, auth); },
  put(path, body, auth = true)   { return this.request('PUT',    path, body, auth); },
  del(path, auth = true)         { return this.request('DELETE', path, null, auth); },
};

/* ── Password validation (CNIL) ──────────────────────────────── */
function validatePassword(pwd) {
  const errors = [];
  if (pwd.length < 12)                      errors.push('Au moins 12 caractères');
  if (!/[A-Z]/.test(pwd))                   errors.push('Une majuscule');
  if (!/[a-z]/.test(pwd))                   errors.push('Une minuscule');
  if (!/\d/.test(pwd))                      errors.push('Un chiffre');
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd)) errors.push('Un caractère spécial');
  return errors;
}

function passwordStrength(pwd) {
  let score = 0;
  if (pwd.length >= 12) score++;
  if (pwd.length >= 16) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd)) score++;
  return score; // 0-6
}

/* ── UI Utilities ────────────────────────────────────────────── */

/**
 * Affiche une alerte dans un conteneur.
 * @param {string} containerId - ID de l'élément conteneur
 * @param {string} message     - Message à afficher
 * @param {string} type        - 'success' | 'danger' | 'warning' | 'info'
 */
function showAlert(containerId, message, type = 'danger') {
  const icons = { success: '✓', danger: '✕', warning: '⚠', info: 'ℹ' };
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div class="alert alert-${type}" role="alert">
      <span class="alert-icon">${icons[type] || 'ℹ'}</span>
      <span>${message}</span>
    </div>`;
}

function clearAlert(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = '';
}

/**
 * Ouvre un modal en ajoutant la classe "open".
 * @param {string} overlayId - ID de .modal-overlay
 */
function showModal(overlayId) {
  const el = document.getElementById(overlayId);
  if (el) el.classList.add('open');
}

/**
 * Ferme un modal.
 */
function hideModal(overlayId) {
  const el = document.getElementById(overlayId);
  if (el) el.classList.remove('open');
}

/**
 * Ferme tous les modals ouverts.
 */
function hideAllModals() {
  document.querySelectorAll('.modal-overlay.open').forEach(el => el.classList.remove('open'));
}

/**
 * Formate une date ISO en date française.
 * @param {string} dateStr
 * @returns {string}
 */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(dateStr));
  } catch { return dateStr; }
}

/**
 * Formate un salaire en euros.
 * @param {number} min
 * @param {number} max
 * @returns {string}
 */
function formatSalaire(min, max) {
  if (!min && !max) return 'Non précisé';
  const fmt = n => new Intl.NumberFormat('fr-FR').format(n) + ' €';
  if (min && max && min !== max) return `${fmt(min)} – ${fmt(max)}`;
  return fmt(min || max);
}

/**
 * Renvoie le label HTML d'un badge de statut de candidature.
 */
function statutCandidatureBadge(statut) {
  const map = {
    soumise:    ['badge-info',    'Soumise'],
    en_cours:   ['badge-warning', 'En cours'],
    acceptee:   ['badge-success', 'Acceptée'],
    refusee:    ['badge-danger',  'Refusée'],
  };
  const [cls, label] = map[statut] || ['badge-gray', statut];
  return `<span class="badge ${cls}">${label}</span>`;
}

/**
 * Renvoie le label HTML d'un badge d'état d'offre.
 */
function etatOffreBadge(etat) {
  const map = {
    publiee:     ['badge-success', 'Publiée'],
    non_publiee: ['badge-gray',    'Non publiée'],
    expiree:     ['badge-danger',  'Expirée'],
  };
  const [cls, label] = map[etat] || ['badge-gray', etat];
  return `<span class="badge ${cls}">${label}</span>`;
}

/**
 * Renvoie le label HTML d'un badge de statut d'organisation.
 */
function statutOrgBadge(statut) {
  const map = {
    validee:    ['badge-success', 'Validée'],
    en_attente: ['badge-warning', 'En attente'],
    refusee:    ['badge-danger',  'Refusée'],
  };
  const [cls, label] = map[statut] || ['badge-gray', statut];
  return `<span class="badge ${cls}">${label}</span>`;
}

/**
 * Renvoie le label HTML d'un badge de rôle utilisateur.
 */
function roleBadge(role) {
  const map = {
    admin:      ['role-badge role-admin',     'Admin'],
    recruteur:  ['role-badge role-recruteur', 'Recruteur'],
    candidat:   ['role-badge role-candidat',  'Candidat'],
  };
  const [cls, label] = map[role] || ['badge-gray', role];
  return `<span class="${cls}">${label}</span>`;
}

/**
 * Génère la pagination.
 * @param {number} current     - Page courante (1-based)
 * @param {number} total       - Nombre total de pages
 * @param {Function} onPage    - Callback(page)
 * @returns {HTMLElement}
 */
function renderPagination(current, total, onPage) {
  const nav = document.createElement('nav');
  nav.className = 'pagination';
  if (total <= 1) return nav;

  const mkBtn = (label, page, disabled = false, active = false) => {
    const btn = document.createElement('button');
    btn.className = 'page-btn' + (active ? ' active' : '');
    btn.innerHTML = label;
    btn.disabled = disabled;
    if (!disabled && !active) btn.addEventListener('click', () => onPage(page));
    return btn;
  };

  nav.appendChild(mkBtn('‹', current - 1, current === 1));

  // Calcul des pages à afficher
  let pages = [];
  if (total <= 7) {
    pages = Array.from({ length: total }, (_, i) => i + 1);
  } else {
    pages = [1];
    if (current > 3) pages.push('…');
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
    if (current < total - 2) pages.push('…');
    pages.push(total);
  }

  pages.forEach(p => {
    if (p === '…') {
      const span = document.createElement('span');
      span.className = 'page-btn';
      span.textContent = '…';
      span.style.cursor = 'default';
      nav.appendChild(span);
    } else {
      nav.appendChild(mkBtn(p, p, false, p === current));
    }
  });

  nav.appendChild(mkBtn('›', current + 1, current === total));
  return nav;
}

/* ── Navbar renderer ─────────────────────────────────────────── */
function renderNavbar(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const user = Auth.getUser();
  const isLogged = Auth.isLoggedIn() && user;

  const navLinks = {
    candidat:  [
      { href: '/pages/offres.html',            label: 'Offres d\'emploi' },
      { href: '/pages/candidat.html',          label: 'Mes candidatures' },
      { href: '/pages/devenir-recruteur.html', label: 'Devenir recruteur' },
    ],
    recruteur: [
      { href: '/pages/offres.html',    label: 'Offres d\'emploi' },
      { href: '/pages/recruteur.html', label: 'Mes offres' },
    ],
    admin: [
      { href: '/pages/offres.html', label: 'Offres' },
      { href: '/pages/admin.html',  label: 'Administration' },
    ],
  };

  const links = isLogged ? (navLinks[user.role] || []) : [];
  const currentPath = window.location.pathname;

  const linksHtml = links.map(l =>
    `<a href="${l.href}" class="nav-link${currentPath.endsWith(l.href.replace('/','')) || currentPath === l.href ? ' active' : ''}">${l.label}</a>`
  ).join('');

  const userHtml = isLogged ? `
    <div class="navbar-user">
      <div class="user-avatar">${user.prenom?.[0] || ''}${user.nom?.[0] || ''}</div>
      <div>
        <div class="user-name">${user.prenom} ${user.nom}</div>
        ${roleBadge(user.role)}
      </div>
      <button class="btn btn-ghost btn-sm" onclick="Auth.logout()">Déconnexion</button>
    </div>` : `<a href="/index.html" class="btn btn-primary btn-sm">Connexion</a>`;

  container.innerHTML = `
    <nav class="navbar">
      <a href="${isLogged && user.role === 'admin' ? '/pages/admin.html' : isLogged && user.role === 'recruteur' ? '/pages/recruteur.html' : '/pages/offres.html'}" class="navbar-brand">
        SR10 <span>RecrutePro</span>
      </a>
      <div class="navbar-nav">${linksHtml}</div>
      ${userHtml}
    </nav>`;
}

/* ── Close modal on overlay click ────────────────────────────── */
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

/* ── Close modal on Escape key ───────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') hideAllModals();
});
