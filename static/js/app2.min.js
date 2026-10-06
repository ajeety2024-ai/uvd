/**
 * ============================================================================
 * UVD (Universal Video Downloader) - Core Application Frontend Engine
 * Copyright (c) 2026 Ajeet Yadav. All Rights Reserved.
 * Author: Ajeet Yadav
 * Proprietary and Confidential. Unauthorized copying, distribution, modification,
 * or reverse engineering of this software is strictly prohibited by copyright law.
 * ============================================================================
 */

window._UVD_AUTHOR_SIGNATURE = Object.freeze({
  software: "UVD - Universal Video Downloader",
  author: "Ajeet Yadav",
  copyright: "(c) 2026 Ajeet Yadav",
  token: "uvd_sec_token_98432a_ajeet_yadav"
});

// Bulletproof Safe Storage Wrapper (Prevents "localStorage access is denied" SecurityError in Android Chrome/WebAPK/Private Mode)
let _isLocalStorageWorking = false;
try {
  if (typeof window !== 'undefined' && 'localStorage' in window) {
    window.localStorage.setItem('__uvd_test__', '1');
    window.localStorage.removeItem('__uvd_test__');
    _isLocalStorageWorking = true;
  }
} catch (e) {
  _isLocalStorageWorking = false;
}

const safeStorage = {
  _mem: {},
  getItem(key) {
    if (_isLocalStorageWorking) {
      try { return window.localStorage.getItem(key); } catch (e) {}
    }
    return this._mem[key] !== undefined ? this._mem[key] : null;
  },
  setItem(key, value) {
    if (_isLocalStorageWorking) {
      try { window.localStorage.setItem(key, value); return; } catch (e) {}
    }
    this._mem[key] = String(value);
  },
  removeItem(key) {
    if (_isLocalStorageWorking) {
      try { window.localStorage.removeItem(key); return; } catch (e) {}
    }
    delete this._mem[key];
  }
};

// Polyfill window.localStorage if inaccessible so external code never throws
if (!_isLocalStorageWorking && typeof window !== 'undefined') {
  try {
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (k) => safeStorage.getItem(k),
        setItem: (k, v) => safeStorage.setItem(k, v),
        removeItem: (k) => safeStorage.removeItem(k),
        clear: () => { safeStorage._mem = {}; }
      },
      configurable: true,
      writable: true
    });
  } catch (e) {}
}

// UVD Safe Icon Renderer
function safeCreateIcons() {
  try {
    if (typeof lucide !== 'undefined' && lucide && typeof lucide.createIcons === 'function') {
      lucide.createIcons();
    }
  } catch (e) {
    console.warn('Lucide icon error:', e);
  }
}

// UVD Core Frontend Controller with Full Thumbnails, Themes, and Priority Queue

let currentMediaData = null;
let currentPlaylistData = null;
let deferredPrompt = null;
let activePollInterval = null;

// Playlist & Queue Manager State
let activeQueue = [];
let currentActiveItem = null;
let currentActiveTaskId = null;
let isQueueRunning = false;
let isCurrentItemPaused = false;

/* ==========================================================================
   CUSTOM CONFIRMATION MODAL & ALERT TOAST (No 127.0.0.1 browser popups)
   ========================================================================== */
window.openSettings = function() {
  const m = document.getElementById('settingsModal');
  if (m) {
    m.classList.remove('hidden');
    m.classList.add('open');
    m.style.setProperty('display', 'flex', 'important');
    m.style.setProperty('visibility', 'visible', 'important');
    m.style.setProperty('opacity', '1', 'important');
    m.style.setProperty('pointer-events', 'auto', 'important');
  }
  if (typeof initSettings === 'function') {
    initSettings();
  }
  safeCreateIcons();
};

window.closeSettings = function() {
  const m = document.getElementById('settingsModal');
  if (m) {
    m.classList.add('hidden');
    m.classList.remove('open');
    m.style.setProperty('display', 'none', 'important');
    m.style.setProperty('visibility', 'hidden', 'important');
    m.style.setProperty('pointer-events', 'none', 'important');
  }
};

/* ==========================================================================
   AUTH & 7-DAY TRIAL CONTROLLER
   ========================================================================== */
let authState = {
  is_logged_in: false,
  user: null,
  is_trial_active: true,
  days_left: 7,
  can_download: true,
  trial_end_str: ''
};

window.openAuthModal = function(defaultTab = 'register') {
  const m = document.getElementById('authModal');
  if (m) {
    m.classList.remove('hidden');
    m.classList.add('open');
    m.style.setProperty('display', 'flex', 'important');
    m.style.setProperty('visibility', 'visible', 'important');
    m.style.setProperty('opacity', '1', 'important');
    m.style.setProperty('pointer-events', 'auto', 'important');
  }
  switchAuthTab(defaultTab);
  updateAuthUI();
  safeCreateIcons();
};

window.closeAuthModal = function() {
  const m = document.getElementById('authModal');
  if (m) {
    m.classList.add('hidden');
    m.classList.remove('open');
    m.style.setProperty('display', 'none', 'important');
    m.style.setProperty('visibility', 'hidden', 'important');
    m.style.setProperty('pointer-events', 'none', 'important');
  }
};

function switchAuthTab(tab) {
  const tabReg = document.getElementById('tabRegisterBtn');
  const tabLog = document.getElementById('tabLoginBtn');
  const fReg = document.getElementById('registerForm');
  const fLog = document.getElementById('loginForm');

  if (tab === 'register') {
    if (tabReg) tabReg.className = 'flex-1 py-1.5 text-xs font-bold rounded-lg text-white bg-indigo-600 transition-all cursor-pointer';
    if (tabLog) tabLog.className = 'flex-1 py-1.5 text-xs font-bold rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer';
    if (fReg) fReg.classList.remove('hidden');
    if (fLog) fLog.classList.add('hidden');
  } else {
    if (tabReg) tabReg.className = 'flex-1 py-1.5 text-xs font-bold rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer';
    if (tabLog) tabLog.className = 'flex-1 py-1.5 text-xs font-bold rounded-lg text-white bg-indigo-600 transition-all cursor-pointer';
    if (fReg) fReg.classList.add('hidden');
    if (fLog) fLog.classList.remove('hidden');
  }
}

async function fetchAuthStatus() {
  try {
    const res = await fetch('/api/auth/status');
    if (res.ok) {
      authState = await res.json();
      updateAuthUI();
    }
  } catch (err) {
    console.error('Failed to fetch auth status:', err);
  }
}

function updateAuthUI() {
  const dot = document.getElementById('authNavDot');
  const text = document.getElementById('authNavText');
  const upgradeTag = document.getElementById('authNavUpgradeTag');
  const banner = document.getElementById('trialExpiredBanner');

  const modalTitle = document.getElementById('authModalTitle');
  const modalSub = document.getElementById('authModalSubtitle');
  const card = document.getElementById('authTrialStatusCard');
  const icon = document.getElementById('authTrialStatusIcon');
  const headline = document.getElementById('authTrialStatusHeadline');
  const sub = document.getElementById('authTrialStatusSub');

  const loggedOutView = document.getElementById('authLoggedOutView');
  const loggedInView = document.getElementById('authLoggedInView');
  const uName = document.getElementById('userProfileName');
  const uEmail = document.getElementById('userProfileEmail');
  const uAvatar = document.getElementById('userAvatarText');

  if (authState.is_logged_in && authState.user) {
    // Logged In - No Trial Messages or Ribbons
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-400';
    if (text) text.textContent = authState.user.name ? authState.user.name.split(' ')[0] : 'Account';
    if (upgradeTag) {
      upgradeTag.textContent = 'PRO';
      upgradeTag.className = 'px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    }
    if (banner) banner.classList.add('hidden');

    if (modalTitle) modalTitle.textContent = 'User Profile';
    if (modalSub) modalSub.textContent = 'PRO Member • Permanent Unlimited Downloads';

    // Completely hide the trial status ribbon when user is logged in
    if (card) card.classList.add('hidden');

    if (loggedOutView) loggedOutView.classList.add('hidden');
    if (loggedInView) loggedInView.classList.remove('hidden');
    if (uName) uName.textContent = authState.user.name || 'User';
    if (uEmail) uEmail.textContent = authState.user.email || '';
    if (uAvatar) uAvatar.textContent = (authState.user.name || 'U').charAt(0).toUpperCase();

  } else if (authState.is_trial_active) {
    // Trial Active (Only when NOT logged in)
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-400';
    if (text) text.textContent = `Trial: ${authState.days_left}d left`;
    if (upgradeTag) {
      upgradeTag.textContent = 'Upgrade';
      upgradeTag.className = 'px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white shadow-sm';
    }
    if (banner) banner.classList.add('hidden');

    if (modalTitle) modalTitle.textContent = 'UVD Account & Trial';
    if (modalSub) modalSub.textContent = `Free Trial Active • ${authState.days_left} Days Left`;

    if (card) {
      card.classList.remove('hidden');
      card.className = 'm-4 p-3 rounded-2xl border border-indigo-500/30 bg-indigo-950/40 text-indigo-200 flex items-center space-x-3 text-xs';
    }
    if (icon) icon.innerHTML = `<svg class="w-5 h-5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
    if (headline) headline.textContent = `7-Day Free Trial Active (${authState.days_left} Days Left)`;
    if (sub) sub.textContent = `Enjoy unrestricted video and playlist downloads during your trial period until ${authState.trial_end_str || '1 week'}.`;

    if (loggedOutView) loggedOutView.classList.remove('hidden');
    if (loggedInView) loggedInView.classList.add('hidden');

  } else {
    // Trial Expired (Only when NOT logged in)
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-rose-500';
    if (text) text.textContent = 'Trial Expired';
    if (upgradeTag) {
      upgradeTag.textContent = 'Sign In';
      upgradeTag.className = 'px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-600 text-white shadow-sm';
    }
    if (banner) banner.classList.remove('hidden');

    if (modalTitle) modalTitle.textContent = 'Trial Expired';
    if (modalSub) modalSub.textContent = 'Sign in or create an account to continue downloading';

    if (card) {
      card.classList.remove('hidden');
      card.className = 'm-4 p-3 rounded-2xl border border-red-500/40 bg-red-950/60 text-red-200 flex items-center space-x-3 text-xs';
    }
    if (icon) icon.innerHTML = `<svg class="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    if (headline) headline.textContent = 'Free Trial Expired (7 Days Completed)';
    if (sub) sub.textContent = 'Please create a free account or sign in below to continue downloading.';

    if (loggedOutView) loggedOutView.classList.remove('hidden');
    if (loggedInView) loggedInView.classList.add('hidden');
  }
  safeCreateIcons();
}

function ensureDownloadAllowed() {
  if (!authState.can_download) {
    window.openAuthModal('register');
    showAppToast("Your 7-day free trial has expired. Please create an account or sign in to continue downloading.", "Account Required", "error");
    return false;
  }
  return true;
}

function showConfirmModal({ title = 'Confirm Action', message = 'Are you sure?', confirmText = 'Delete', isDanger = true }) {
  return new Promise((resolve) => {
    const modal = document.getElementById('customConfirmModal');
    const titleEl = document.getElementById('confirmModalTitle');
    const msgEl = document.getElementById('confirmModalMessage');
    const okBtn = document.getElementById('confirmModalOkBtn');
    const cancelBtn = document.getElementById('confirmModalCancelBtn');
    const okTextEl = document.getElementById('confirmModalOkText');
    const iconBg = document.getElementById('confirmModalIconBg');

    if (!modal) {
      resolve(confirm(message));
      return;
    }

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (okTextEl) okTextEl.textContent = confirmText;

    if (isDanger) {
      if (okBtn) okBtn.className = "px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shadow-lg transition-all flex items-center space-x-1 cursor-pointer";
      if (iconBg) iconBg.className = "w-10 h-10 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center flex-shrink-0";
    } else {
      if (okBtn) okBtn.className = "px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg transition-all flex items-center space-x-1 cursor-pointer";
      if (iconBg) iconBg.className = "w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0";
    }

    modal.classList.remove('hidden');
    modal.classList.add('open');
    modal.style.setProperty('display', 'flex', 'important');
    modal.style.setProperty('visibility', 'visible', 'important');
    modal.style.setProperty('opacity', '1', 'important');
    modal.style.setProperty('pointer-events', 'auto', 'important');
    safeCreateIcons();

    let isDone = false;

    const cleanup = () => {
      modal.classList.add('hidden');
      modal.classList.remove('open');
      modal.style.setProperty('display', 'none', 'important');
      modal.style.setProperty('visibility', 'hidden', 'important');
      modal.style.setProperty('pointer-events', 'none', 'important');
      if (okBtn) okBtn.removeEventListener('click', handleOk);
      if (cancelBtn) cancelBtn.removeEventListener('click', handleCancel);
      window.removeEventListener('keydown', handleKeydown);
    };

    const handleOk = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (isDone) return;
      isDone = true;
      cleanup();
      resolve(true);
    };

    const handleCancel = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (isDone) return;
      isDone = true;
      cleanup();
      resolve(false);
    };

    const handleKeydown = (e) => {
      if (e.key === 'Escape') {
        if (isDone) return;
        isDone = true;
        cleanup();
        resolve(false);
      }
    };

    if (okBtn) okBtn.addEventListener('click', handleOk, { once: true });
    if (cancelBtn) cancelBtn.addEventListener('click', handleCancel, { once: true });
    window.addEventListener('keydown', handleKeydown, { once: true });
  });
}
window.showConfirmModal = showConfirmModal;

function showAppToast(message, title = 'Notice', type = 'info') {
  const toast = document.getElementById('customAlertToast');
  const titleEl = document.getElementById('alertToastTitle');
  const msgEl = document.getElementById('alertToastMessage');
  const closeBtn = document.getElementById('alertToastCloseBtn');
  const iconBg = document.getElementById('alertToastIconBg');

  if (!toast) {
    alert(message);
    return;
  }

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;

  if (iconBg) {
    if (type === 'success') {
      iconBg.className = 'w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center flex-shrink-0';
      iconBg.innerHTML = `<svg class="w-5 h-5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    } else if (type === 'error') {
      iconBg.className = 'w-9 h-9 rounded-xl bg-red-500/20 text-red-500 flex items-center justify-center flex-shrink-0';
      iconBg.innerHTML = `<svg class="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else {
      iconBg.className = 'w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-500 flex items-center justify-center flex-shrink-0';
      iconBg.innerHTML = `<svg class="w-5 h-5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }
  }

  toast.classList.remove('hidden');

  if (window._toastTimer) clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 4000);

  if (closeBtn) {
    closeBtn.onclick = () => {
      if (window._toastTimer) clearTimeout(window._toastTimer);
      toast.classList.add('hidden');
    };
  }
}

// DOM Elements
const urlInput = document.getElementById('urlInput');
const fetchBtn = document.getElementById('fetchBtn');
const pasteBtn = document.getElementById('pasteBtn');
const clearBtn = document.getElementById('clearBtn');
const resultSection = document.getElementById('resultSection');
const playlistSection = document.getElementById('playlistSection');
const loadingSection = document.getElementById('loadingSection');
const errorSection = document.getElementById('errorSection');
const errorMessage = document.getElementById('errorMessage');

// Theme Switcher Elements
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIcon = document.getElementById('themeIcon');
const themeLabel = document.getElementById('themeLabel');

// Single Preview Elements
const mediaThumbnail = document.getElementById('mediaThumbnail');
const mediaTitle = document.getElementById('mediaTitle');
const mediaUploader = document.getElementById('mediaUploader');
const mediaDuration = document.getElementById('mediaDuration');
const platformBadge = document.getElementById('platformBadge');
const videoFormatsList = document.getElementById('videoFormatsList');
const audioFormatsList = document.getElementById('audioFormatsList');
const downloadActionBtn = document.getElementById('downloadActionBtn');
const dismissResultBtn = document.getElementById('dismissResultBtn');
const closeResultSectionBtn = document.getElementById('closeResultSectionBtn');

// Playlist Elements
const playlistTitle = document.getElementById('playlistTitle');
const playlistUploader = document.getElementById('playlistUploader');
const playlistCount = document.getElementById('playlistCount');
const playlistDownloadedCount = document.getElementById('playlistDownloadedCount');
const playlistItemsList = document.getElementById('playlistItemsList');
const playlistDownloadAllBtn = document.getElementById('playlistDownloadAllBtn');
const selectAllCheckbox = document.getElementById('selectAllCheckbox');
const playlistFormatSelect = document.getElementById('playlistFormatSelect');
const closePlaylistSectionBtn = document.getElementById('closePlaylistSectionBtn');
const playlistDismissBtn = document.getElementById('playlistDismissBtn');

// History & Saved Playlists Elements
const downloadedLibrarySection = document.getElementById('downloadedLibrarySection');
const historyList = document.getElementById('historyList');
const savedPlaylistsList = document.getElementById('savedPlaylistsList');
const openFolderBtn = document.getElementById('openFolderBtn');
const pwaInstallBanner = document.getElementById('pwaInstallBanner');
const pwaInstallBtn = document.getElementById('pwaInstallBtn');
const navOpenManagerBtn = document.getElementById('navOpenManagerBtn');

// Download Manager Modal Elements
const downloadManagerModal = document.getElementById('downloadManagerModal');
const modalQueueBadge = document.getElementById('modalQueueBadge');
const modalStatusSub = document.getElementById('modalStatusSub');
const modalMinimizeBtn = document.getElementById('modalMinimizeBtn');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const modalDoneBtn = document.getElementById('modalDoneBtn');

// Modal Spotlight Elements
const activeSpotlightThumb = document.getElementById('activeSpotlightThumb');
const activeSpotlightIndex = document.getElementById('activeSpotlightIndex');
const activeSpotlightTitle = document.getElementById('activeSpotlightTitle');
const activeSpotlightFormatBadge = document.getElementById('activeSpotlightFormatBadge');
const activeSpotlightStatusMessage = document.getElementById('activeSpotlightStatusMessage');
const activeProgressPercent = document.getElementById('activeProgressPercent');
const activeProgressBarFill = document.getElementById('activeProgressBarFill');
const activeProgressBytes = document.getElementById('activeProgressBytes');
const activeProgressSpeed = document.getElementById('activeProgressSpeed');
const activeProgressEta = document.getElementById('activeProgressEta');
const activePauseResumeBtn = document.getElementById('activePauseResumeBtn');
const activeCancelCurrentBtn = document.getElementById('activeCancelCurrentBtn');
const activeSkipNextBtn = document.getElementById('activeSkipNextBtn');
const modalQueueItemsList = document.getElementById('modalQueueItemsList');

// Settings & New Options Elements
const openSettingsBtn = document.getElementById('openSettingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const settingDownloadDir = document.getElementById('settingDownloadDir');
const browseFolderBtn = document.getElementById('browseFolderBtn');
const settingAutoClipboard = document.getElementById('settingAutoClipboard');
const settingAutoSubtitles = document.getElementById('settingAutoSubtitles');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const settingAutoCheckUpdates = document.getElementById('settingAutoCheckUpdates');
const settingUpdateUrl = document.getElementById('settingUpdateUrl');
const manualCheckUpdateBtn = document.getElementById('manualCheckUpdateBtn');
const settingsCurrentVerBadge = document.getElementById('settingsCurrentVerBadge');
const settingsUpdateStatusText = document.getElementById('settingsUpdateStatusText');
const checkUpdateSpinner = document.getElementById('checkUpdateSpinner');

// App Version & Update Elements
const navUpdateBadge = document.getElementById('navUpdateBadge');
const navUpdateVersionTag = document.getElementById('navUpdateVersionTag');
const updateModal = document.getElementById('updateModal');
const closeUpdateModalBtn = document.getElementById('closeUpdateModalBtn');
const updateLaterBtn = document.getElementById('updateLaterBtn');
const updateDownloadNowBtn = document.getElementById('updateDownloadNowBtn');
const modalUpdateNewVerTag = document.getElementById('modalUpdateNewVerTag');
const modalUpdateReleaseName = document.getElementById('modalUpdateReleaseName');
const modalCurrentVersion = document.getElementById('modalCurrentVersion');
const modalLatestVersion = document.getElementById('modalLatestVersion');
const modalUpdateChangelogList = document.getElementById('modalUpdateChangelogList');

// Trimming & Options
const toggleTrimOptionsBtn = document.getElementById('toggleTrimOptionsBtn');
const trimOptionsContainer = document.getElementById('trimOptionsContainer');
const trimStartTime = document.getElementById('trimStartTime');
const trimEndTime = document.getElementById('trimEndTime');
const optionSubtitles = document.getElementById('optionSubtitles');

// Speed Wave Graph
const speedGraphCanvas = document.getElementById('speedGraphCanvas');
const speedGraphLabel = document.getElementById('speedGraphLabel');

// Clipboard Toast
const clipboardToast = document.getElementById('clipboardToast');
const clipboardUrlText = document.getElementById('clipboardUrlText');
const clipboardFetchBtn = document.getElementById('clipboardFetchBtn');
const clipboardCloseBtn = document.getElementById('clipboardCloseBtn');

// Floating Minimized Bar Elements
const floatingDownloadPill = document.getElementById('floatingDownloadPill');
const floatingTitle = document.getElementById('floatingTitle');
const floatingPercent = document.getElementById('floatingPercent');
const floatingSpeed = document.getElementById('floatingSpeed');

async function loadActiveQueueTasks() {
  try {
    const res = await fetch('/api/tasks/active');
    if (!res.ok) return;
    const data = await res.json();
    if (data.tasks && Array.isArray(data.tasks) && data.tasks.length > 0) {
      activeQueue = data.tasks.map((t, idx) => ({
        id: t.task_id,
        task_id: t.task_id,
        index: idx + 1,
        title: t.title || 'Incomplete Download',
        url: t.url,
        thumbnail: t.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
        duration: t.duration || '--:--',
        uploader: t.uploader || 'Creator',
        format_id: t.format_id || 'best',
        is_audio: !!t.is_audio,
        quality_label: t.quality_label || (t.is_audio ? 'MP3 Audio' : 'HD Video'),
        start_time: t.start_time || null,
        end_time: t.end_time || null,
        download_subtitles: !!t.download_subtitles,
        status: 'paused',
        progress: t.percent || 0,
        percent: t.percent || 0,
        speed: 'Paused / Incomplete',
        size: `${t.downloaded_bytes_str || '0 MB'} / ${t.total_bytes_str || 'Calculating...'}`
      }));
      renderPanelActiveTasks();
      renderModalQueueList();
      updateModalHeader();
    } else {
      updateDashboardEmptyState();
    }
  } catch (e) {
    console.error("Failed to load active tasks:", e);
  }
}

/* ==========================================================================
   MOBILE NATIVE BOTTOM NAVIGATION BAR (Android & Mobile Devices Only)
   ========================================================================== */
function initMobileBottomNav() {
  const homeBtn = document.getElementById('mobileNavHomeBtn');
  const queueBtn = document.getElementById('mobileNavQueueBtn');
  const libraryBtn = document.getElementById('mobileNavLibraryBtn');
  const settingsBtn = document.getElementById('mobileNavSettingsBtn');

  function setActiveTab(activeBtn) {
    [homeBtn, queueBtn, libraryBtn, settingsBtn].forEach(btn => {
      if (!btn) return;
      if (btn === activeBtn) {
        btn.classList.add('active', 'text-indigo-400');
        btn.classList.remove('text-slate-400');
        const span = btn.querySelector('span');
        if (span) { span.classList.remove('font-medium'); span.classList.add('font-bold'); }
      } else {
        btn.classList.remove('active', 'text-indigo-400');
        btn.classList.add('text-slate-400');
        const span = btn.querySelector('span');
        if (span) { span.classList.remove('font-bold'); span.classList.add('font-medium'); }
      }
    });
  }

  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      setActiveTab(homeBtn);
      updateDashboardEmptyState();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const input = document.getElementById('urlInput');
      if (input) input.focus();
    });
  }

  if (queueBtn) {
    queueBtn.addEventListener('click', () => {
      setActiveTab(queueBtn);
      openDownloadManagerModal();
    });
  }

  if (libraryBtn) {
    libraryBtn.addEventListener('click', () => {
      setActiveTab(libraryBtn);
      const panel = document.getElementById('downloadsPanel');
      if (panel) {
        panel.classList.remove('hidden');
        panel.style.removeProperty('display');
        panel.scrollIntoView({ behavior: 'smooth' });
      } else {
        openDownloadManagerModal();
      }
    });
  }

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      setActiveTab(settingsBtn);
      if (window.openSettings) {
        window.openSettings();
      }
    });
  }
}

async function bootApp() {
  try { setupEventListeners(); } catch (e) { console.error('setupEventListeners error:', e); }
  try { initTheme(); } catch (e) { console.error('initTheme error:', e); }
  try { initMobileBottomNav(); } catch (e) { console.error('initMobileBottomNav error:', e); }
  try { initHistoryControls(); } catch (e) { console.error('initHistoryControls error:', e); }

  // Parallel asynchronous data loading so initial UI opens with 0ms delay
  Promise.allSettled([
    loadDownloadsHistory(),
    loadSavedPlaylists(),
    loadActiveQueueTasks(),
    fetchAuthStatus()
  ]).then(() => {
    if (authState && !authState.can_download) {
      window.openAuthModal('register');
    }
  }).catch(() => {});

  try { registerPWA(); } catch (e) { console.error('registerPWA error:', e); }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootApp);
} else {
  bootApp();
}

/* ==========================================================================
   THEME SWITCHER (Light & Dark Mode)
   ========================================================================== */
function initTheme() {
  const savedTheme = safeStorage.getItem('uvd_theme') || safeStorage.getItem('omni_theme') || 'dark';
  applyTheme(savedTheme);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const currentTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      applyTheme(newTheme);
      safeStorage.setItem('uvd_theme', newTheme);
    });
  }
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.body.classList.add('light-theme');
    if (themeIcon) themeIcon.setAttribute('data-lucide', 'moon');
    if (themeLabel) themeLabel.textContent = 'Dark';
  } else {
    document.body.classList.remove('light-theme');
    if (themeIcon) themeIcon.setAttribute('data-lucide', 'sun');
    if (themeLabel) themeLabel.textContent = 'Light';
  }
  safeCreateIcons();
}

function dismissPlaylistView() {
  if (playlistSection) {
    playlistSection.classList.add('hidden');
  }
  const quickFormatContainer = document.getElementById('quickFormatContainer');
  if (quickFormatContainer) quickFormatContainer.classList.add('hidden');
  currentPlaylistData = null;
  if (playlistItemsList) {
    playlistItemsList.innerHTML = '';
  }
  if (urlInput) {
    urlInput.value = '';
    urlInput.placeholder = 'Paste any video or playlist link (YouTube, Instagram, Reels, Twitter, FB, TikTok, etc.)...';
  }
  showAppToast('Playlist view removed.', 'Dismissed', 'info');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function dismissResultView() {
  if (resultSection) {
    resultSection.classList.add('hidden');
  }
  const quickFormatContainer = document.getElementById('quickFormatContainer');
  if (quickFormatContainer) quickFormatContainer.classList.add('hidden');
  currentMediaData = null;
  if (videoFormatsList) videoFormatsList.innerHTML = '';
  if (audioFormatsList) audioFormatsList.innerHTML = '';
  if (urlInput) {
    urlInput.value = '';
    urlInput.placeholder = 'Paste any video or playlist link (YouTube, Instagram, Reels, Twitter, FB, TikTok, etc.)...';
  }
  showAppToast('Video preview closed.', 'Dismissed', 'info');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setupEventListeners() {
  fetchBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (url) fetchMediaInfo(url);
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const url = urlInput.value.trim();
      if (url) fetchMediaInfo(url);
    }
  });

  pasteBtn.addEventListener('click', async () => {
    try {
      let text = '';
      try {
        const res = await fetch('/api/clipboard');
        if (res.ok) {
          const data = await res.json();
          text = data.text || '';
        }
      } catch (e) {}

      if (text && text.trim()) {
        urlInput.value = text.trim();
        fetchMediaInfo(text.trim());
      } else {
        urlInput.focus();
      }
    } catch (err) {
      urlInput.focus();
    }
  });

  clearBtn.addEventListener('click', () => {
    urlInput.value = '';
    resultSection.classList.add('hidden');
    playlistSection.classList.add('hidden');
    errorSection.classList.add('hidden');
    const quickFormatContainer = document.getElementById('quickFormatContainer');
    if (quickFormatContainer) quickFormatContainer.classList.add('hidden');
    currentPlaylistData = null;
    currentMediaData = null;
    urlInput.focus();
  });

  if (closePlaylistSectionBtn) {
    closePlaylistSectionBtn.addEventListener('click', dismissPlaylistView);
  }
  if (playlistDismissBtn) {
    playlistDismissBtn.addEventListener('click', dismissPlaylistView);
  }
  if (closeResultSectionBtn) {
    closeResultSectionBtn.addEventListener('click', dismissResultView);
  }
  if (dismissResultBtn) {
    dismissResultBtn.addEventListener('click', dismissResultView);
  }

  downloadActionBtn.addEventListener('click', startSingleDownload);

  if (playlistDownloadAllBtn) {
    playlistDownloadAllBtn.addEventListener('click', startPlaylistBatchQueue);
  }

  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      document.querySelectorAll('.playlist-item-checkbox').forEach(cb => {
        cb.checked = isChecked;
      });
    });
  }

  if (openFolderBtn) {
    openFolderBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/open-folder', { method: 'POST' });
      } catch (e) {
        console.error("Failed to open folder", e);
      }
    });
  }

  if (navOpenManagerBtn) {
    navOpenManagerBtn.addEventListener('click', openDownloadManagerModal);
  }

  const unifiedDownloadsNavBtn = document.getElementById('unifiedDownloadsNavBtn');
  if (unifiedDownloadsNavBtn) {
    unifiedDownloadsNavBtn.addEventListener('click', () => {
      const hasActive = activeQueue.some(i => i.status === 'downloading' || i.status === 'pending' || i.status === 'paused');
      if (hasActive) {
        openDownloadManagerModal();
      } else {
        const panel = document.getElementById('downloadsPanel');
        if (panel) {
          panel.scrollIntoView({ behavior: 'smooth' });
        } else {
          openDownloadManagerModal();
        }
      }
    });
  }

  const panelOpenManagerBtn = document.getElementById('panelOpenManagerBtn');
  if (panelOpenManagerBtn) {
    panelOpenManagerBtn.addEventListener('click', openDownloadManagerModal);
  }

  const panelOpenFolderBtn = document.getElementById('panelOpenFolderBtn');
  if (panelOpenFolderBtn) {
    panelOpenFolderBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/open-folder', { method: 'POST' });
      } catch (e) {
        console.error("Failed to open folder", e);
      }
    });
  }

  // Quick Format Switcher Buttons (MP4 Video / MP3 Audio)
  // Quick Format Switcher Buttons (MP4 Video / MP3 Audio) & Tabs
  const quickFormatVideoBtn = document.getElementById('quickFormatVideoBtn');
  const quickFormatAudioBtn = document.getElementById('quickFormatAudioBtn');
  const tabFormatVideoBtn = document.getElementById('tabFormatVideoBtn');
  const tabFormatAudioBtn = document.getElementById('tabFormatAudioBtn');
  const videoFormatsContainer = document.getElementById('videoFormatsContainer');
  const audioFormatsContainer = document.getElementById('audioFormatsContainer');
  const formatCategorySubtitle = document.getElementById('formatCategorySubtitle');
  
  function applyQuickFormatPreference(fmt) {
    const chosen = (fmt === 'audio') ? 'audio' : 'video';
    safeStorage.setItem('uvd_default_format', chosen);

    if (chosen === 'audio') {
      if (quickFormatAudioBtn) {
        quickFormatAudioBtn.className = 'px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-md cursor-pointer';
      }
      if (quickFormatVideoBtn) {
        quickFormatVideoBtn.className = 'px-4 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center space-x-1.5 text-slate-400 hover:text-slate-200 cursor-pointer';
      }
      if (tabFormatAudioBtn) {
        tabFormatAudioBtn.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow cursor-pointer';
      }
      if (tabFormatVideoBtn) {
        tabFormatVideoBtn.className = 'px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 text-slate-400 hover:text-slate-200 cursor-pointer';
      }
      if (videoFormatsContainer) videoFormatsContainer.classList.add('hidden');
      if (audioFormatsContainer) audioFormatsContainer.classList.remove('hidden');
      if (formatCategorySubtitle) formatCategorySubtitle.textContent = 'MP3 Audio Only (HQ 320kbps)';
      if (playlistFormatSelect) playlistFormatSelect.value = 'audio';

      // Check first audio format if none checked
      const checkedAudio = document.querySelector('#audioFormatsList input[name="selectedFormat"]:checked');
      if (!checkedAudio) {
        const firstAudio = document.querySelector('#audioFormatsList input[name="selectedFormat"]');
        if (firstAudio) firstAudio.checked = true;
      }
      // Uncheck video formats to avoid ambiguity
      document.querySelectorAll('#videoFormatsList input[name="selectedFormat"]').forEach(inp => inp.checked = false);

    } else {
      if (quickFormatVideoBtn) {
        quickFormatVideoBtn.className = 'px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md cursor-pointer';
      }
      if (quickFormatAudioBtn) {
        quickFormatAudioBtn.className = 'px-4 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center space-x-1.5 text-slate-400 hover:text-slate-200 cursor-pointer';
      }
      if (tabFormatVideoBtn) {
        tabFormatVideoBtn.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow cursor-pointer';
      }
      if (tabFormatAudioBtn) {
        tabFormatAudioBtn.className = 'px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 text-slate-400 hover:text-slate-200 cursor-pointer';
      }
      if (videoFormatsContainer) videoFormatsContainer.classList.remove('hidden');
      if (audioFormatsContainer) audioFormatsContainer.classList.add('hidden');
      if (formatCategorySubtitle) formatCategorySubtitle.textContent = 'Video + Audio (Merged)';
      if (playlistFormatSelect) playlistFormatSelect.value = 'video';

      // Check first video format if none checked
      const checkedVideo = document.querySelector('#videoFormatsList input[name="selectedFormat"]:checked');
      if (!checkedVideo) {
        const firstVideo = document.querySelector('#videoFormatsList input[name="selectedFormat"]');
        if (firstVideo) firstVideo.checked = true;
      }
      // Uncheck audio formats to avoid ambiguity
      document.querySelectorAll('#audioFormatsList input[name="selectedFormat"]').forEach(inp => inp.checked = false);
    }
    safeCreateIcons();
  }
  window.applyQuickFormatPreference = applyQuickFormatPreference;

  if (quickFormatVideoBtn) {
    quickFormatVideoBtn.addEventListener('click', () => applyQuickFormatPreference('video'));
  }
  if (quickFormatAudioBtn) {
    quickFormatAudioBtn.addEventListener('click', () => applyQuickFormatPreference('audio'));
  }
  if (tabFormatVideoBtn) {
    tabFormatVideoBtn.addEventListener('click', () => applyQuickFormatPreference('video'));
  }
  if (tabFormatAudioBtn) {
    tabFormatAudioBtn.addEventListener('click', () => applyQuickFormatPreference('audio'));
  }
  applyQuickFormatPreference(safeStorage.getItem('uvd_default_format') || 'video');

  if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.openSettings();
    });
  }

  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.closeSettings();
    });
  }

  // Modal Controls
  if (modalMinimizeBtn) modalMinimizeBtn.addEventListener('click', minimizeDownloadManagerModal);
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', minimizeDownloadManagerModal);
  if (modalDoneBtn) modalDoneBtn.addEventListener('click', minimizeDownloadManagerModal);
  if (floatingDownloadPill) floatingDownloadPill.addEventListener('click', openDownloadManagerModal);
  if (downloadManagerModal) {
    downloadManagerModal.addEventListener('click', (e) => {
      if (e.target === downloadManagerModal) {
        minimizeDownloadManagerModal();
      }
    });
  }

  // Spotlight Actions
  if (activePauseResumeBtn) activePauseResumeBtn.addEventListener('click', toggleCurrentDownloadPause);
  if (activeCancelCurrentBtn) {
    activeCancelCurrentBtn.addEventListener('click', () => {
      if (currentActiveItem) {
        removeFromQueue(currentActiveItem.id);
      }
    });
  }
  if (activeSkipNextBtn) activeSkipNextBtn.addEventListener('click', skipToNextInQueue);

  // Update Notification & Modal Listeners
  if (navUpdateBadge) {
    navUpdateBadge.addEventListener('click', () => {
      if (window._latestUpdateData) {
        showUpdateModal(window._latestUpdateData);
      } else {
        checkAppUpdates(true);
      }
    });
  }
  if (closeUpdateModalBtn) closeUpdateModalBtn.addEventListener('click', closeUpdateModal);
  if (updateLaterBtn) updateLaterBtn.addEventListener('click', closeUpdateModal);
  if (manualCheckUpdateBtn) {
    manualCheckUpdateBtn.addEventListener('click', () => checkAppUpdates(true));
  }

  const supportedPlatformsContainer = document.getElementById('supportedPlatformsContainer');
  if (supportedPlatformsContainer) {
    // Completely hide platform chips on mobile devices (only show on desktop/laptop)
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768) {
      supportedPlatformsContainer.classList.add('hidden');
      supportedPlatformsContainer.classList.remove('flex', 'md:flex');
      supportedPlatformsContainer.style.setProperty('display', 'none', 'important');
    }
  }

  // Ensure mobile downloadsPanel visibility is synchronized on setup
  updateDashboardEmptyState();

  document.querySelectorAll('.platform-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const hint = btn.getAttribute('data-hint');
      urlInput.placeholder = `Paste ${hint} link here...`;
      urlInput.focus();
    });
  });

  // Auth & Trial Listeners
  const authNavBtn = document.getElementById('authNavBtn');
  const trialBannerCreateBtn = document.getElementById('trialBannerCreateBtn');
  const closeAuthModalBtn = document.getElementById('closeAuthModalBtn');
  const tabRegisterBtn = document.getElementById('tabRegisterBtn');
  const tabLoginBtn = document.getElementById('tabLoginBtn');
  const registerForm = document.getElementById('registerForm');
  const loginForm = document.getElementById('loginForm');
  const logoutBtn = document.getElementById('logoutBtn');

  if (authNavBtn) authNavBtn.addEventListener('click', () => window.openAuthModal());
  if (trialBannerCreateBtn) trialBannerCreateBtn.addEventListener('click', () => window.openAuthModal('register'));
  if (closeAuthModalBtn) closeAuthModalBtn.addEventListener('click', window.closeAuthModal);
  if (tabRegisterBtn) tabRegisterBtn.addEventListener('click', () => switchAuthTab('register'));
  if (tabLoginBtn) tabLoginBtn.addEventListener('click', () => switchAuthTab('login'));

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('regName') ? document.getElementById('regName').value.trim() : '';
      const email = document.getElementById('regEmail') ? document.getElementById('regEmail').value.trim() : '';
      const password = document.getElementById('regPassword') ? document.getElementById('regPassword').value.trim() : '';

      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showAppToast(data.detail || data.message || "Registration failed", "Error", "error");
          return;
        }
        showAppToast(data.message || "Account created successfully!", "Success", "success");
        await fetchAuthStatus();
        window.closeAuthModal();
      } catch (err) {
        showAppToast("Network error during registration.", "Error", "error");
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail') ? document.getElementById('loginEmail').value.trim() : '';
      const password = document.getElementById('loginPassword') ? document.getElementById('loginPassword').value.trim() : '';

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showAppToast(data.detail || data.message || "Login failed", "Error", "error");
          return;
        }
        showAppToast(data.message || "Logged in successfully!", "Success", "success");
        await fetchAuthStatus();
        window.closeAuthModal();
      } catch (err) {
        showAppToast("Network error during login.", "Error", "error");
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
        showAppToast("You have been signed out.", "Signed Out", "info");
        await fetchAuthStatus();
      } catch (err) {
        console.error("Logout error", err);
      }
    });
  }
}

function registerPWA() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      console.log('UVD ServiceWorker active:', reg.scope);
    }).catch((err) => {
      console.log('UVD ServiceWorker note:', err);
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (pwaInstallBanner) pwaInstallBanner.classList.remove('hidden');
  });

  if (pwaInstallBtn) {
    pwaInstallBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          if (pwaInstallBanner) pwaInstallBanner.classList.add('hidden');
        }
        deferredPrompt = null;
      }
    });
  }
}

/* ==========================================================================
   Media Extraction (Single Video / Playlist)
   ========================================================================== */
async function fetchMediaInfo(url) {
  hideAllSections();
  loadingSection.classList.remove('hidden');
  fetchBtn.disabled = true;
  fetchBtn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span> Analyzing...`;

  try {
    const response = await fetch('/api/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.detail || 'Unable to fetch media. Please check the link.');
    }

    loadingSection.classList.add('hidden');

    // Show quick format switcher (MP4 Video / MP3 Audio) ONLY after media is successfully fetched
    const quickFormatContainer = document.getElementById('quickFormatContainer');
    if (quickFormatContainer) {
      quickFormatContainer.classList.remove('hidden');
    }

    if (data.is_playlist) {
      currentPlaylistData = data;
      renderPlaylistView(data);
      playlistSection.classList.remove('hidden');
      saveCurrentPlaylistState();
      loadSavedPlaylists();
      if (window.innerWidth < 768) {
        playlistSection.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      currentMediaData = data;
      renderSingleMediaInfo(data);
      resultSection.classList.remove('hidden');
      if (window.innerWidth < 768) {
        resultSection.scrollIntoView({ behavior: 'smooth' });
      }
    }

  } catch (err) {
    loadingSection.classList.add('hidden');
    const quickFormatContainer = document.getElementById('quickFormatContainer');
    if (quickFormatContainer) {
      quickFormatContainer.classList.add('hidden');
    }
    errorSection.classList.remove('hidden');
    errorMessage.textContent = err.message || 'Something went wrong while processing the link.';
  } finally {
    fetchBtn.disabled = false;
    fetchBtn.innerHTML = `<i data-lucide="sparkles" class="w-5 h-5 mr-1.5 inline"></i> Fetch Media`;
    safeCreateIcons();
  }
}

function renderSingleMediaInfo(data) {
  mediaThumbnail.src = data.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80';
  mediaTitle.textContent = data.title;
  mediaUploader.textContent = data.uploader || 'Creator';
  mediaDuration.textContent = data.duration || '--:--';

  const p = data.platform || { name: 'Video', color: '#6366F1' };
  platformBadge.textContent = p.name;
  platformBadge.style.backgroundColor = `${p.color}22`;
  platformBadge.style.color = p.color;
  platformBadge.style.borderColor = `${p.color}55`;

  // Already Downloaded Banner Handling
  const alreadyDownloadedBanner = document.getElementById('alreadyDownloadedBanner');
  const alreadyDownloadedSizeTag = document.getElementById('alreadyDownloadedSizeTag');
  const alreadyDownloadedSub = document.getElementById('alreadyDownloadedSub');
  const alreadyDownloadedPlayBtn = document.getElementById('alreadyDownloadedPlayBtn');
  const alreadyDownloadedFolderBtn = document.getElementById('alreadyDownloadedFolderBtn');

  if (data.already_downloaded && data.existing_file) {
    const ef = data.existing_file;
    if (alreadyDownloadedBanner) alreadyDownloadedBanner.classList.remove('hidden');
    if (alreadyDownloadedSizeTag) alreadyDownloadedSizeTag.textContent = ef.size || '';
    if (alreadyDownloadedSub) alreadyDownloadedSub.textContent = `"${ef.filename}" is already saved on your PC`;
    if (alreadyDownloadedPlayBtn) {
      alreadyDownloadedPlayBtn.onclick = () => window.playSavedFile(ef.filename);
    }
    if (alreadyDownloadedFolderBtn) {
      alreadyDownloadedFolderBtn.onclick = () => window.showFileInFolder(ef.filename);
    }
  } else {
    if (alreadyDownloadedBanner) alreadyDownloadedBanner.classList.add('hidden');
  }

  const defaultFormat = safeStorage.getItem('uvd_default_format') || 'video';

  if (videoFormatsList) {
    videoFormatsList.innerHTML = '';
    if (data.video_options && data.video_options.length > 0) {
      data.video_options.forEach((opt, idx) => {
        const isSelected = (defaultFormat !== 'audio' && idx === 0);
        const card = document.createElement('div');
        card.className = `format-card relative cursor-pointer block select-none ${isSelected ? 'selected' : ''}`;
        card.innerHTML = `
          <input type="radio" name="selectedFormat" value="${opt.format_id}" data-is-audio="false" data-quality="${opt.quality}" data-size="${opt.size}" class="sr-only" ${isSelected ? 'checked' : ''}>
          <div class="format-content p-3 rounded-xl border border-slate-700/60 bg-slate-800/40 hover:bg-slate-800/80 transition-all flex items-center justify-between pointer-events-none">
            <div class="flex items-center space-x-3">
              <div class="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs">
                ${opt.height ? opt.height + 'p' : 'HD'}
              </div>
              <div>
                <div class="font-semibold text-sm text-slate-100">${opt.quality}</div>
                <div class="text-[11px] text-slate-400 uppercase font-mono">${opt.ext} • Video + Audio</div>
              </div>
            </div>
            <div class="text-right">
              <span class="text-xs font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-1 rounded-md shadow-sm">
                ${opt.size}
              </span>
            </div>
          </div>
        `;
        card.addEventListener('click', (e) => {
          e.preventDefault();
          // Deselect all other formats
          document.querySelectorAll('.format-card').forEach(c => c.classList.remove('selected'));
          document.querySelectorAll('input[name="selectedFormat"]').forEach(r => r.checked = false);
          
          card.classList.add('selected');
          const radio = card.querySelector('input[type="radio"]');
          if (radio) radio.checked = true;
        });
        videoFormatsList.appendChild(card);
      });
    }
  }

  if (audioFormatsList) {
    audioFormatsList.innerHTML = '';
    if (data.audio_options && data.audio_options.length > 0) {
      data.audio_options.forEach((opt, idx) => {
        const isSelected = (defaultFormat === 'audio' && idx === 0);
        const card = document.createElement('div');
        card.className = `format-card relative cursor-pointer block select-none ${isSelected ? 'selected' : ''}`;
        card.innerHTML = `
          <input type="radio" name="selectedFormat" value="${opt.format_id}" data-is-audio="true" data-quality="${opt.quality}" data-size="${opt.size}" class="sr-only" ${isSelected ? 'checked' : ''}>
          <div class="format-content p-3 rounded-xl border border-slate-700/60 bg-slate-800/40 hover:bg-slate-800/80 transition-all flex items-center justify-between pointer-events-none">
            <div class="flex items-center space-x-3">
              <div class="w-8 h-8 rounded-lg bg-pink-500/20 text-pink-400 flex items-center justify-center font-bold text-xs">
                MP3
              </div>
              <div>
                <div class="font-semibold text-sm text-slate-100">${opt.quality}</div>
                <div class="text-[11px] text-slate-400 uppercase font-mono">${opt.ext} • Audio Only</div>
              </div>
            </div>
            <div class="text-right">
              <span class="text-xs font-bold text-pink-400 bg-pink-950/60 border border-pink-500/30 px-2.5 py-1 rounded-md shadow-sm">
                ${opt.size}
              </span>
            </div>
          </div>
        `;
        card.addEventListener('click', (e) => {
          e.preventDefault();
          // Deselect all other formats
          document.querySelectorAll('.format-card').forEach(c => c.classList.remove('selected'));
          document.querySelectorAll('input[name="selectedFormat"]').forEach(r => r.checked = false);
          
          card.classList.add('selected');
          const radio = card.querySelector('input[type="radio"]');
          if (radio) radio.checked = true;
        });
        audioFormatsList.appendChild(card);
      });
    }
  }

  // Ensure mutually exclusive selection between video and audio
  document.querySelectorAll('#videoFormatsList input[name="selectedFormat"]').forEach(inp => {
    inp.addEventListener('change', () => {
      if (inp.checked) {
        document.querySelectorAll('#audioFormatsList input[name="selectedFormat"]').forEach(a => {
          a.checked = false;
          a.closest('.format-card')?.classList.remove('selected');
        });
      }
    });
  });

  document.querySelectorAll('#audioFormatsList input[name="selectedFormat"]').forEach(inp => {
    inp.addEventListener('change', () => {
      if (inp.checked) {
        document.querySelectorAll('#videoFormatsList input[name="selectedFormat"]').forEach(v => {
          v.checked = false;
          v.closest('.format-card')?.classList.remove('selected');
        });
      }
    });
  });

  // Apply preference so ONLY the selected format container (Video OR Audio) is shown
  applyQuickFormatPreference(defaultFormat);
  safeCreateIcons();
}

/* ==========================================================================
   DOWNLOAD QUEUE & SPOTLIGHT
   ========================================================================== */

async function startSingleDownload() {
  if (!ensureDownloadAllowed()) return;
  if (!currentMediaData) {
    showAppToast("Please paste a link and click 'Fetch Media' first.", "No Media", "info");
    return;
  }

  // Prevent duplicate downloads if already in active queue
  const alreadyInQueue = activeQueue.find(q => q.url === currentMediaData.url && (q.status === 'downloading' || q.status === 'pending' || q.status === 'paused'));
  if (alreadyInQueue) {
    showAppToast("This video is already in your download queue / active tasks.", "Already In Queue", "info");
    openDownloadManagerModal();
    return;
  }

  // Check if file is already completely downloaded in local library
  if (currentMediaData.already_downloaded && currentMediaData.existing_file) {
    const ef = currentMediaData.existing_file;
    const confirmed = await showConfirmModal({
      title: "File Already Downloaded",
      message: `"${currentMediaData.title}" is already in your library (${ef.filename} • ${ef.size}). Do you want to download a duplicate copy or play the existing file?`,
      confirmText: "Download Duplicate",
      cancelText: "Play Existing File"
    });
    if (!confirmed) {
      window.playSavedFile(ef.filename);
      showAppToast("Opening already downloaded file...", "Playing", "success");
      return;
    }
  }

  let selectedInput = document.querySelector('input[name="selectedFormat"]:checked');
  if (!selectedInput) {
    const isAudioActive = audioFormatsContainer && !audioFormatsContainer.classList.contains('hidden');
    if (isAudioActive) {
      selectedInput = document.querySelector('#audioFormatsList input[name="selectedFormat"]');
    } else {
      selectedInput = document.querySelector('#videoFormatsList input[name="selectedFormat"]');
    }
    if (!selectedInput) {
      selectedInput = document.querySelector('input[name="selectedFormat"]');
    }
    if (selectedInput) selectedInput.checked = true;
  }
  if (!selectedInput) {
    showAppToast("Please select a video or audio format first.", "Format Required", "warning");
    return;
  }

  const formatId = selectedInput.value;
  const isAudio = selectedInput.getAttribute('data-is-audio') === 'true';
  const quality = selectedInput.getAttribute('data-quality') || 'Best';
  const startTimeVal = trimStartTime ? trimStartTime.value.trim() : '';
  const endTimeVal = trimEndTime ? trimEndTime.value.trim() : '';
  const isSubtitles = optionSubtitles ? optionSubtitles.checked : false;

  const item = {
    id: 'single_' + Date.now(),
    index: 1,
    title: currentMediaData.title,
    url: currentMediaData.url,
    thumbnail: currentMediaData.thumbnail,
    duration: currentMediaData.duration,
    uploader: currentMediaData.uploader,
    format_id: formatId,
    is_audio: isAudio,
    quality_label: quality,
    start_time: startTimeVal || null,
    end_time: endTimeVal || null,
    download_subtitles: isSubtitles,
    status: 'pending'
  };

  activeQueue = [item];
  renderPanelActiveTasks();
  openDownloadManagerModal();
  startNextQueueItem();

  // Hide result card and clear URL input after initiating download
  if (resultSection) resultSection.classList.add('hidden');
  const quickFormatContainer = document.getElementById('quickFormatContainer');
  if (quickFormatContainer) quickFormatContainer.classList.add('hidden');
  if (urlInput) urlInput.value = '';
  currentMediaData = null;
}

function startPlaylistBatchQueue() {
  if (!ensureDownloadAllowed()) return;
  if (!currentPlaylistData || !currentPlaylistData.items) return;

  const checkedBoxes = Array.from(document.querySelectorAll('.playlist-item-checkbox:checked'));
  const targetIds = checkedBoxes.map(cb => cb.getAttribute('data-id'));
  const isAudio = playlistFormatSelect.value === 'audio';

  const selectedItems = currentPlaylistData.items
    .filter(i => targetIds.includes(i.id) && i.status !== 'completed')
    .map(i => ({
      ...i,
      format_id: isAudio ? 'bestaudio/best' : 'best',
      is_audio: isAudio,
      quality_label: isAudio ? 'MP3 Audio' : 'HD Video'
    }));

  if (selectedItems.length === 0) {
    showAppToast("No pending items selected in playlist.", "Selection Required", "warning");
    return;
  }

  activeQueue = selectedItems;
  const quickFormatContainer = document.getElementById('quickFormatContainer');
  if (quickFormatContainer) quickFormatContainer.classList.add('hidden');
  renderPanelActiveTasks();
  openDownloadManagerModal();
  startNextQueueItem();
}

window.downloadSinglePlaylistItem = function(itemId) {
  if (!ensureDownloadAllowed()) return;
  if (!currentPlaylistData) return;
  const item = currentPlaylistData.items.find(i => i.id === itemId);
  if (!item) return;

  const isAudio = playlistFormatSelect ? playlistFormatSelect.value === 'audio' : false;
  const queueItem = {
    ...item,
    format_id: isAudio ? 'bestaudio/best' : 'best',
    is_audio: isAudio,
    quality_label: isAudio ? 'MP3 Audio' : 'HD Video'
  };

  activeQueue = [queueItem, ...activeQueue.filter(q => q.id !== itemId)];
  renderPanelActiveTasks();
  openDownloadManagerModal();
  startNextQueueItem();
};

window.switchAndDownloadNow = function(itemId) {
  const targetItem = activeQueue.find(i => String(i.id) === String(itemId) || String(i.task_id) === String(itemId));
  if (!targetItem) return;

  targetItem.status = 'pending';
  targetItem.error = null;
  
  // Bring to the front of the queue
  activeQueue = [targetItem, ...activeQueue.filter(i => String(i.id) !== String(itemId) && String(i.task_id) !== String(itemId))];
  
  if (currentActiveTaskId) {
    if (activePollInterval) clearInterval(activePollInterval);
    if (currentActiveItem && currentActiveItem !== targetItem) currentActiveItem.status = 'paused';
  }

  isQueueRunning = false;
  renderPanelActiveTasks();
  renderModalQueueList();
  openDownloadManagerModal();
  startNextQueueItem();
};

window.removeFromQueue = async function(itemId) {
  const targetItem = activeQueue.find(i => String(i.id) === String(itemId) || String(i.task_id) === String(itemId));
  const isDownloading = targetItem && (targetItem.status === 'downloading' || targetItem.status === 'pending');
  const itemTitle = targetItem ? targetItem.title : 'this download';

  const confirmed = await showConfirmModal({
    title: "Cancel Download?",
    message: `Are you sure you want to cancel and remove "${itemTitle}"? ${isDownloading ? 'Current download progress will be stopped.' : ''}`,
    confirmText: "Yes, Cancel Download",
    isDanger: true
  });

  if (!confirmed) return;

  const isCurrent = currentActiveItem && (String(currentActiveItem.id) === String(itemId) || String(currentActiveItem.task_id) === String(itemId));
  activeQueue = activeQueue.filter(i => String(i.id) !== String(itemId) && String(i.task_id) !== String(itemId));
  try {
    await fetch(`/api/tasks/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
  } catch (e) {}

  showAppToast(`"${itemTitle}" was cancelled.`, "Download Cancelled", "info");

  if (isCurrent) {
    if (activePollInterval) clearInterval(activePollInterval);
    currentActiveItem = null;
    currentActiveTaskId = null;
    renderSpotlightCard(null);
    startNextQueueItem();
  } else {
    renderModalQueueList();
    renderPanelActiveTasks();
    updateModalHeader();
  }
};
window.cancelAndRemoveDownload = window.removeFromQueue;

window.cancelAllDownloads = async function() {
  const activeItems = activeQueue.filter(i => i.status === 'downloading' || i.status === 'pending' || i.status === 'paused' || i.status === 'error');
  if (activeItems.length === 0) {
    showAppToast("No active downloads in queue.", "Queue Empty", "info");
    return;
  }

  const count = activeItems.length;
  const confirmed = await showConfirmModal({
    title: "Cancel All Downloads?",
    message: `Are you sure you want to cancel and remove all ${count} video${count > 1 ? 's' : ''} from the download queue? All background download progress will be stopped immediately.`,
    confirmText: `Yes, Cancel All (${count})`,
    isDanger: true
  });

  if (!confirmed) return;

  if (activePollInterval) {
    clearInterval(activePollInterval);
    activePollInterval = null;
  }

  const itemIds = activeItems.map(i => i.id || i.task_id).filter(Boolean);

  isQueueRunning = false;
  currentActiveItem = null;
  currentActiveTaskId = null;
  activeQueue = [];

  try {
    await fetch('/api/tasks/cancel-all', { method: 'POST' });
  } catch (e) {
    itemIds.forEach(id => {
      fetch(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
    });
  }

  renderSpotlightCard(null);
  renderModalQueueList();
  renderPanelActiveTasks();
  updateModalHeader();
  updateDashboardEmptyState();

  minimizeDownloadManagerModal();

  showAppToast(`All ${count} downloads have been cancelled and removed.`, "All Downloads Cancelled", "info");
};

async function startNextQueueItem() {
  if (activePollInterval) clearInterval(activePollInterval);

  const nextItem = activeQueue.find(i => i.status === 'pending' || i.status === 'paused');
  if (!nextItem) {
    isQueueRunning = false;
    currentActiveItem = null;
    currentActiveTaskId = null;
    activeQueue = activeQueue.filter(i => i.status !== 'completed');
    renderSpotlightCard(null);
    renderModalQueueList();
    renderPanelActiveTasks();
    updateModalHeader();

    // Immediately close and hide popup modal so it never lingers after completion
    minimizeDownloadManagerModal();

    // Auto Shutdown PC if enabled in settings
    if (appSettings.auto_shutdown) {
      fetch('/api/system/shutdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancel: false })
      });
      showAppToast("All queue downloads completed! PC will shut down in 60 seconds.", "Auto Shutdown", "warning");
    }
    return;
  }

  isQueueRunning = true;
  isCurrentItemPaused = false;
  currentActiveItem = nextItem;
  nextItem.status = 'downloading';

  renderSpotlightCard(nextItem);
  renderModalQueueList();
  renderPanelActiveTasks();
  updateModalHeader();

  try {
    const res = await fetch('/api/start-download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: nextItem.task_id || nextItem.id,
        url: nextItem.url,
        format_id: nextItem.format_id || 'best',
        is_audio: nextItem.is_audio || false,
        title: nextItem.title,
        quality_label: nextItem.quality_label || 'HD Video',
        thumbnail: nextItem.thumbnail || '',
        duration: nextItem.duration || '',
        uploader: nextItem.uploader || '',
        start_time: nextItem.start_time || null,
        end_time: nextItem.end_time || null,
        download_subtitles: nextItem.download_subtitles || false
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      if (res.status === 403) {
        window.openAuthModal('register');
        showAppToast(data.detail || "Trial expired. Account required.", "Account Required", "error");
      }
      throw new Error(data.detail || 'Could not start stream');
    }

    currentActiveTaskId = data.task_id;
    nextItem.task_id = data.task_id;
    pollActiveDownload(currentActiveTaskId, nextItem);

  } catch (err) {
    nextItem.status = 'error';
    nextItem.error = err.message || 'Stream connection error';
    renderSpotlightCard(nextItem);
    renderModalQueueList();
    renderPanelActiveTasks();
    showAppToast(`Download error: ${nextItem.error}`, "Download Error", "error");
  }
}

function pollActiveDownload(taskId, item) {
  activePollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/progress/${taskId}`);
      if (!res.ok) return;

      const data = await res.json();
      
      const percent = data.percent || 0;
      activeProgressBarFill.style.width = `${Math.max(percent, 2)}%`;
      activeProgressPercent.textContent = `${percent}%`;
      activeProgressBytes.textContent = `${data.downloaded_bytes_str || '0 MB'} / ${data.total_bytes_str || 'Calculating...'}`;
      activeProgressSpeed.textContent = data.speed_str || '-- MB/s';
      activeProgressEta.textContent = data.eta_str ? `Time Left: ${data.eta_str}` : 'Time Left: --:--';

      floatingTitle.textContent = item.title;
      floatingPercent.textContent = `${percent}%`;
      floatingSpeed.textContent = data.speed_str || '-- MB/s';

      // Sync active state for Dashboard panel
      item.progress = percent;
      item.speed = data.speed_str || '-- MB/s';
      item.eta = data.eta_str || '';
      item.size = `${data.downloaded_bytes_str || '0 MB'} / ${data.total_bytes_str || 'Calculating...'}`;
      window._lastActivePercent = percent;
      window._lastActiveSpeed = data.speed_str;
      window._lastActiveEta = data.eta_str;
      window._lastActiveBytes = item.size;
      renderPanelActiveTasks();

      if (data.status === 'processing') {
        activeSpotlightStatusMessage.textContent = '⚙️ Merging Video & Audio with FFmpeg...';
        activeProgressBarFill.style.width = '98%';
      } else if (data.status === 'downloading') {
        activeSpotlightStatusMessage.textContent = '⬇️ High-Speed Streaming in Real-Time...';
      } else if (data.status === 'completed') {
        clearInterval(activePollInterval);
        item.status = 'completed';
        item.filename = data.filename;
        item.download_url = data.download_url;

        if (currentPlaylistData && currentPlaylistData.items) {
          const plItem = currentPlaylistData.items.find(pi => pi.id === item.id);
          if (plItem) {
            plItem.status = 'completed';
            plItem.filename = data.filename;
            saveCurrentPlaylistState();
          }
          renderPlaylistItems();
          updatePlaylistDownloadedCounter();
        }

        renderPanelActiveTasks();
        loadDownloadsHistory();
        renderModalQueueList();
        updateModalHeader();

        // Check if there are any remaining pending items in the active queue
        const remainingPending = activeQueue.filter(i => (i.status === 'pending' || i.status === 'paused') && i.id !== item.id);

        if (remainingPending.length === 0) {
          // All downloads done! Immediately close and dismiss popup modal so it never lingers
          minimizeDownloadManagerModal();
          isQueueRunning = false;
          currentActiveItem = null;
          currentActiveTaskId = null;
          activeQueue = [];
          renderSpotlightCard(null);
          renderModalQueueList();
          renderPanelActiveTasks();
          updateModalHeader();
        } else {
          // If batch queue still has more items, remove this completed item and continue
          const completedItemId = item.id;
          activeQueue = activeQueue.filter(i => i.id !== completedItemId);
          renderModalQueueList();
          renderPanelActiveTasks();
          updateModalHeader();
        }

        const isMobileOrWeb = !window.pywebview;
        if (isMobileOrWeb && data.filename) {
          const autoSaveUrl = `/api/file?filename=${encodeURIComponent(data.filename)}&download=1`;
          const a = document.createElement('a');
          a.href = autoSaveUrl;
          a.setAttribute('download', data.filename);
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            try { document.body.removeChild(a); } catch(e){}
          }, 1000);
          showAppToast("Video automatically saved to phone storage!", "Download Complete", "success");
        } else if (data.download_url) {
          const a = document.createElement('a');
          a.href = data.download_url;
          a.setAttribute('download', data.filename);
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }

        if (remainingPending.length > 0) {
          setTimeout(startNextQueueItem, 1000);
        }

      } else if (data.status === 'error') {
        clearInterval(activePollInterval);
        item.status = 'error';
        activeSpotlightStatusMessage.textContent = '❌ Download failed: ' + (data.error || 'Stream error');
        renderModalQueueList();
        setTimeout(startNextQueueItem, 2000);
      }

    } catch (e) {
      console.error("Polling error", e);
    }
  }, 400);
}

function toggleCurrentDownloadPause() {
  if (!currentActiveItem) return;

  if (isCurrentItemPaused) {
    isCurrentItemPaused = false;
    activePauseResumeBtn.innerHTML = `<i data-lucide="pause" class="w-3.5 h-3.5"></i><span>Pause Download</span>`;
    activePauseResumeBtn.classList.replace('bg-emerald-600', 'bg-amber-600');
    startNextQueueItem();
  } else {
    isCurrentItemPaused = true;
    if (activePollInterval) clearInterval(activePollInterval);
    currentActiveItem.status = 'paused';
    activePauseResumeBtn.innerHTML = `<i data-lucide="play" class="w-3.5 h-3.5"></i><span>Resume Download</span>`;
    activePauseResumeBtn.classList.replace('bg-amber-600', 'bg-emerald-600');
    activeSpotlightStatusMessage.textContent = '⏸️ Download Paused by user.';
    renderModalQueueList();
    renderPanelActiveTasks();
  }
  safeCreateIcons();
}

function skipToNextInQueue() {
  if (currentActiveItem) {
    if (activePollInterval) clearInterval(activePollInterval);
    currentActiveItem.status = 'paused';
  }
  renderPanelActiveTasks();
  startNextQueueItem();
}

function stopEntireQueue() {
  if (activePollInterval) clearInterval(activePollInterval);
  isQueueRunning = false;
  activeQueue.forEach(i => {
    if (i.status === 'downloading') i.status = 'paused';
  });
  currentActiveItem = null;
  currentActiveTaskId = null;
  renderSpotlightCard(null);
  renderModalQueueList();
  renderPanelActiveTasks();
  updateModalHeader();
  safeCreateIcons();
}

function openDownloadManagerModal() {
  if (downloadManagerModal) {
    downloadManagerModal.classList.remove('hidden');
    downloadManagerModal.classList.add('open');
    downloadManagerModal.style.setProperty('display', 'flex', 'important');
    downloadManagerModal.style.setProperty('visibility', 'visible', 'important');
    downloadManagerModal.style.setProperty('opacity', '1', 'important');
    downloadManagerModal.style.setProperty('pointer-events', 'auto', 'important');
  }
  if (floatingDownloadPill) floatingDownloadPill.classList.add('hidden');
  renderSpotlightCard(currentActiveItem);
  renderModalQueueList();
  updateModalHeader();
  safeCreateIcons();
}

function minimizeDownloadManagerModal() {
  if (downloadManagerModal) {
    downloadManagerModal.classList.add('hidden');
    downloadManagerModal.classList.remove('open');
    downloadManagerModal.style.setProperty('display', 'none', 'important');
    downloadManagerModal.style.setProperty('visibility', 'hidden', 'important');
    downloadManagerModal.style.setProperty('opacity', '0', 'important');
    downloadManagerModal.style.setProperty('pointer-events', 'none', 'important');
  }
  if (isQueueRunning && currentActiveItem) {
    if (floatingDownloadPill) floatingDownloadPill.classList.remove('hidden');
  } else {
    if (floatingDownloadPill) floatingDownloadPill.classList.add('hidden');
  }
  safeCreateIcons();
}

function updateModalHeader() {
  const total = activeQueue.length;
  const completed = activeQueue.filter(i => i.status === 'completed').length;
  const pending = activeQueue.filter(i => i.status === 'pending' || i.status === 'downloading' || i.status === 'paused').length;

  modalQueueBadge.textContent = `Queue: ${completed}/${total} Done`;
  if (isQueueRunning && currentActiveItem) {
    modalStatusSub.textContent = `Downloading ${currentActiveItem.title} (${completed + 1} of ${total})`;
  } else if (total > 0 && completed === total) {
    modalStatusSub.textContent = `🎉 All ${total} items downloaded successfully!`;
  } else {
    modalStatusSub.textContent = `Download Manager ready • ${pending} items pending`;
  }

  // Skip button only visible if there is another pending item in the queue (playlist/batch)
  if (activeSkipNextBtn) {
    const hasNextPending = activeQueue.some(i => (i.status === 'pending' || i.status === 'paused') && (!currentActiveItem || i.id !== currentActiveItem.id));
    if (hasNextPending) {
      activeSkipNextBtn.classList.remove('hidden');
    } else {
      activeSkipNextBtn.classList.add('hidden');
    }
  }
}

function renderSpotlightCard(item) {
  // Skip button only visible if there is another pending item in the queue (playlist/batch)
  if (activeSkipNextBtn) {
    const hasNextPending = activeQueue.some(i => (i.status === 'pending' || i.status === 'paused') && (!item || i.id !== item.id));
    if (hasNextPending) {
      activeSkipNextBtn.classList.remove('hidden');
    } else {
      activeSkipNextBtn.classList.add('hidden');
    }
  }

  if (!item) {
    activeSpotlightThumb.src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80';
    activeSpotlightIndex.textContent = '#0';
    activeSpotlightTitle.textContent = 'No Active Download in Progress';
    activeSpotlightFormatBadge.textContent = 'Idle';
    activeSpotlightStatusMessage.textContent = 'All downloads finished or queue is idle.';
    activeProgressBarFill.style.width = '0%';
    activeProgressPercent.textContent = '0%';
    activeProgressBytes.textContent = '0 MB / 0 MB';
    activeProgressSpeed.textContent = '-- MB/s';
    activeProgressEta.textContent = 'Time Left: --:--';
    return;
  }

  activeSpotlightThumb.src = item.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80';
  activeSpotlightIndex.textContent = `#${item.index || 1}`;
  activeSpotlightTitle.textContent = item.title;
  activeSpotlightFormatBadge.textContent = item.is_audio ? 'MP3 Audio' : 'MP4 HD';
  activeSpotlightStatusMessage.textContent = 'Fetching and downloading video stream...';
  safeCreateIcons();
}

function renderModalQueueList() {
  modalQueueItemsList.innerHTML = '';

  const modalCancelAllQueueBtn = document.getElementById('modalCancelAllQueueBtn');
  const modalCancelAllQueueBtnText = document.getElementById('modalCancelAllQueueBtnText');
  const activeCount = activeQueue.filter(i => i.status === 'downloading' || i.status === 'pending' || i.status === 'paused' || i.status === 'error').length;

  if (modalCancelAllQueueBtn) {
    if (activeCount > 0) {
      modalCancelAllQueueBtn.classList.remove('hidden');
      if (modalCancelAllQueueBtnText) {
        modalCancelAllQueueBtnText.textContent = `Cancel All (${activeCount})`;
      }
    } else {
      modalCancelAllQueueBtn.classList.add('hidden');
    }
  }

  if (activeQueue.length === 0) {
    modalQueueItemsList.innerHTML = `
      <div class="text-center py-6 text-slate-500 text-xs">
        <i data-lucide="layers" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
        Queue is currently empty.
      </div>
    `;
    safeCreateIcons();
    return;
  }

  activeQueue.forEach(item => {
    const isCurrent = currentActiveItem && currentActiveItem.id === item.id;
    const row = document.createElement('div');
    row.className = `p-3 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
      isCurrent
        ? 'bg-indigo-950/60 border-indigo-500/80 ring-1 ring-indigo-500/50'
        : item.status === 'completed'
        ? 'bg-emerald-950/30 border-emerald-500/30'
        : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/60'
    }`;

    let statusPill = '';
    let actionButtons = '';

    if (item.status === 'completed') {
      statusPill = `<span class="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center space-x-1"><i data-lucide="check" class="w-3 h-3"></i><span>Done</span></span>`;
      actionButtons = `
        <button onclick="window.playSavedFile('${item.filename || item.title}')" class="px-2.5 py-1 bg-emerald-600/30 hover:bg-emerald-600/60 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-bold flex items-center space-x-1">
          <i data-lucide="play" class="w-3 h-3"></i>
          <span>Play</span>
        </button>
      `;
    } else if (isCurrent) {
      statusPill = `<span class="text-[10px] font-bold text-indigo-300 bg-indigo-950/80 border border-indigo-500/50 px-2.5 py-0.5 rounded-full animate-pulse">Active Stream</span>`;
      actionButtons = `
        <div class="flex items-center space-x-2">
          <span class="text-xs text-indigo-300 font-mono font-semibold">Downloading</span>
          <button onclick="removeFromQueue('${item.id}')" class="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all" title="Cancel and remove download">
            <i data-lucide="x" class="w-3.5 h-3.5"></i>
            <span>Cancel</span>
          </button>
        </div>
      `;
    } else if (item.status === 'paused') {
      statusPill = `<span class="text-[10px] font-bold text-amber-400 bg-amber-950/60 border border-amber-500/30 px-2.5 py-0.5 rounded-full">Paused</span>`;
      actionButtons = `
        <div class="flex items-center space-x-1.5">
          <button onclick="switchAndDownloadNow('${item.id || item.task_id}')" class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer">
            <i data-lucide="zap" class="w-3 h-3"></i>
            <span>Resume</span>
          </button>
          <button onclick="removeFromQueue('${item.id || item.task_id}')" class="p-1 text-slate-400 hover:text-red-400" title="Remove">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      `;
    } else if (item.status === 'error') {
      statusPill = `<span class="text-[10px] font-bold text-rose-400 bg-rose-950/60 border border-rose-500/30 px-2.5 py-0.5 rounded-full" title="${item.error || 'Download failed'}">Failed (Retry)</span>`;
      actionButtons = `
        <div class="flex items-center space-x-1.5">
          <button onclick="switchAndDownloadNow('${item.id || item.task_id}')" class="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer">
            <i data-lucide="refresh-cw" class="w-3 h-3"></i>
            <span>Retry</span>
          </button>
          <button onclick="removeFromQueue('${item.id || item.task_id}')" class="p-1 text-slate-400 hover:text-red-400" title="Remove">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      `;
    } else {
      statusPill = `<span class="text-[10px] font-medium text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">Pending</span>`;
      actionButtons = `
        <button onclick="switchAndDownloadNow('${item.id || item.task_id}')" class="px-2.5 py-1 bg-slate-800 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer">
          <i data-lucide="zap" class="w-3 h-3"></i>
          <span>Download Now</span>
        </button>
        <button onclick="removeFromQueue('${item.id || item.task_id}')" class="p-1 text-slate-500 hover:text-red-400" title="Remove">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      `;
    }

    row.innerHTML = `
      <div class="flex items-center space-x-3 overflow-hidden">
        <div class="relative w-12 sm:w-16 aspect-video rounded-lg overflow-hidden bg-slate-900 flex-shrink-0 border border-slate-700/60">
          <img src="${item.thumbnail}" alt="" class="w-full h-full object-cover">
          <span class="absolute top-0.5 left-0.5 bg-indigo-600 text-white font-bold text-[8px] px-1 rounded">#${item.index || 1}</span>
        </div>
        <div class="overflow-hidden">
          <h5 class="text-xs font-bold text-slate-100 truncate">${item.title}</h5>
          <div class="flex items-center space-x-2 text-[10px] text-slate-400 mt-0.5">
            <span>${item.duration || '--:--'}</span>
            <span>•</span>
            ${statusPill}
          </div>
        </div>
      </div>
      <div class="flex items-center space-x-2 self-end sm:self-center flex-shrink-0">
        ${actionButtons}
      </div>
    `;

    modalQueueItemsList.appendChild(row);
  });

  safeCreateIcons();
}

/* ==========================================================================
   PLAYLIST VIEW & PERSISTENCE
   ========================================================================== */

function renderPlaylistView(data) {
  playlistTitle.textContent = data.title;
  playlistUploader.textContent = data.uploader || 'Creator';
  playlistCount.textContent = `${data.total_items} Videos`;
  updatePlaylistDownloadedCounter();
  renderPlaylistItems();
}

function updatePlaylistDownloadedCounter() {
  if (!currentPlaylistData || !currentPlaylistData.items) return;
  const downloadedCount = currentPlaylistData.items.filter(i => i.status === 'completed').length;
  playlistDownloadedCount.textContent = `${downloadedCount} / ${currentPlaylistData.items.length} Downloaded`;
}

function renderPlaylistItems() {
  if (!currentPlaylistData || !currentPlaylistData.items) return;
  playlistItemsList.innerHTML = '';

  currentPlaylistData.items.forEach((item) => {
    const row = document.createElement('div');
    row.className = `p-3 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none ${
      item.status === 'completed'
        ? 'bg-emerald-950/20 border-emerald-500/30'
        : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/80'
    }`;

    let statusBadge = item.status === 'completed'
      ? `<span class="text-[11px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center space-x-1"><i data-lucide="check" class="w-3 h-3"></i><span>Downloaded</span></span>`
      : `<span class="text-[11px] font-medium text-slate-400 bg-slate-700/50 px-2 py-0.5 rounded-full">${item.estimated_size || 'HD'}</span>`;

    let actionBtn = item.status === 'completed'
      ? `<button class="btn-pl-play px-3 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/60 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold flex items-center space-x-1 cursor-pointer"><i data-lucide="play" class="w-3.5 h-3.5"></i><span>Play</span></button>`
      : `<button class="btn-pl-download px-3 py-1.5 bg-slate-800 hover:bg-indigo-600 hover:text-white text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-bold flex items-center space-x-1 transition-all cursor-pointer"><i data-lucide="download" class="w-3.5 h-3.5"></i><span>Download</span></button>`;

    row.innerHTML = `
      <div class="flex items-center space-x-3 overflow-hidden">
        <input type="checkbox" class="playlist-item-checkbox rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer flex-shrink-0" data-id="${item.id}" ${item.status === 'completed' ? 'disabled' : 'checked'}>
        <div class="relative w-16 sm:w-20 aspect-video rounded-lg overflow-hidden bg-slate-900 flex-shrink-0 border border-slate-700/60">
          <img src="${item.thumbnail}" alt="" class="w-full h-full object-cover">
          <span class="absolute bottom-1 right-1 bg-black/80 text-white font-mono text-[9px] px-1 rounded font-semibold">${item.duration}</span>
          <span class="absolute top-1 left-1 bg-indigo-600/90 text-white text-[9px] px-1 rounded font-bold">#${item.index}</span>
        </div>
        <div class="overflow-hidden mr-2">
          <h4 class="text-xs sm:text-sm font-semibold text-slate-100 truncate mb-0.5" title="${item.title}">${item.title}</h4>
          <div class="flex items-center space-x-2 text-[11px] text-slate-400">
            <span>${item.uploader}</span>
            <span>•</span>
            ${statusBadge}
          </div>
        </div>
      </div>
      <div class="flex items-center space-x-2 self-end sm:self-center flex-shrink-0">
        ${actionBtn}
      </div>
    `;

    row.addEventListener('click', (e) => {
      // Don't intercept checkbox clicks
      if (e.target.closest('input[type="checkbox"]')) return;

      if (item.status === 'completed') {
        window.playSavedFile(item.filename || item.title);
      } else {
        downloadSinglePlaylistItem(item.id);
      }
    });

    playlistItemsList.appendChild(row);
  });

  safeCreateIcons();
}

async function saveCurrentPlaylistState() {
  if (!currentPlaylistData) return;
  try {
    await fetch('/api/playlists/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playlist_id: currentPlaylistData.playlist_id,
        data: currentPlaylistData
      })
    });
  } catch (e) {
    console.error("Failed to save playlist state", e);
  }
}

async function loadSavedPlaylists() {
  const savedPlaylistsSection = document.getElementById('savedPlaylistsSection');
  try {
    const res = await fetch('/api/playlists');
    const data = await res.json();
    if (!savedPlaylistsList) return;
    savedPlaylistsList.innerHTML = '';

    if (!data.playlists || data.playlists.length === 0) {
      if (savedPlaylistsSection) savedPlaylistsSection.classList.add('hidden');
      return;
    }

    if (savedPlaylistsSection) savedPlaylistsSection.classList.remove('hidden');

    data.playlists.forEach(pl => {
      const downloaded = pl.items ? pl.items.filter(i => i.status === 'completed').length : 0;
      const total = pl.total_items || (pl.items ? pl.items.length : 0);

      const card = document.createElement('div');
      card.className = 'p-3.5 rounded-2xl bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800/80 transition-all flex items-center justify-between gap-3 cursor-pointer select-none';
      card.innerHTML = `
        <div class="flex items-center space-x-3 overflow-hidden flex-grow">
          <div class="w-12 h-12 rounded-xl overflow-hidden bg-slate-900 flex-shrink-0 border border-slate-700/60">
            <img src="${pl.thumbnail || ''}" class="w-full h-full object-cover">
          </div>
          <div class="truncate">
            <div class="text-xs sm:text-sm font-bold text-slate-100 truncate">${pl.title}</div>
            <div class="text-[11px] text-slate-400">${pl.uploader} • <span class="font-semibold text-indigo-400">${downloaded} of ${total} downloaded</span></div>
          </div>
        </div>
        <div class="flex items-center space-x-2 flex-shrink-0">
          <button class="btn-open-playlist px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1 shadow-sm transition-all cursor-pointer">
            <i data-lucide="folder-open" class="w-3.5 h-3.5"></i>
            <span>Open</span>
          </button>
          <button class="btn-delete-playlist p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all cursor-pointer" title="Remove Playlist">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      `;

      card.addEventListener('click', (e) => {
        const delBtn = e.target.closest('.btn-delete-playlist');
        if (delBtn) {
          e.preventDefault();
          e.stopPropagation();
          deleteSavedPlaylist(pl.playlist_id);
          return;
        }
        openSavedPlaylist(pl.playlist_id);
      });

      savedPlaylistsList.appendChild(card);
    });

    safeCreateIcons();
  } catch (e) {
    console.error("Error loading saved playlists", e);
  }
}

window.openSavedPlaylist = async function(playlistId) {
  try {
    const res = await fetch('/api/playlists');
    const data = await res.json();
    const pl = data.playlists.find(p => p.playlist_id === playlistId);
    if (pl) {
      currentPlaylistData = pl;
      hideAllSections();
      renderPlaylistView(pl);
      playlistSection.classList.remove('hidden');
      playlistSection.scrollIntoView({ behavior: 'smooth' });
    }
  } catch (e) {
    console.error(e);
  }
};

window.deleteSavedPlaylist = async function(playlistId) {
  const confirmed = await showConfirmModal({
    title: "Remove Playlist",
    message: "Remove this playlist from saved list? (Downloaded files will remain safe)",
    confirmText: "Remove",
    isDanger: true
  });
  if (confirmed) {
    try {
      await fetch(`/api/playlists/${playlistId}`, { method: 'DELETE' });
      await loadSavedPlaylists();
      if (currentPlaylistData && currentPlaylistData.playlist_id === playlistId) {
        playlistSection.classList.add('hidden');
      }
    } catch (e) {
      console.error(e);
    }
  }
};

/* ==========================================================================
   DOWNLOADED FILES LIBRARY WITH THUMBNAILS, PLAY, LOCATE & DELETE
   ========================================================================== */

/* ==========================================================================
   DOWNLOADED FILES LIBRARY WITH SEARCH, FILTERS, THUMBNAILS, PLAY & LOCATE
   ========================================================================== */

window._allDownloadedItems = [];
window._currentHistoryFilter = 'all';
window._currentHistorySearch = '';

function renderPanelActiveTasks() {
  const panelActiveSection = document.getElementById('panelActiveSection');
  const panelActiveBadge = document.getElementById('panelActiveBadge');
  const panelActiveItemsList = document.getElementById('panelActiveItemsList');
  const navDownloadsCountBadge = document.getElementById('navDownloadsCountBadge');
  const panelOpenManagerBtn = document.getElementById('panelOpenManagerBtn');

  const activeItems = activeQueue.filter(i => i.status === 'downloading' || i.status === 'pending' || i.status === 'paused' || i.status === 'error');
  const hasActiveManagerTasks = activeQueue.some(i => i.status === 'downloading' || i.status === 'pending' || i.status === 'queued' || i.status === 'paused' || i.status === 'processing') || (currentActiveItem && (currentActiveItem.status === 'downloading' || currentActiveItem.status === 'pending' || currentActiveItem.status === 'paused')) || isQueueRunning;

  // Toggle "Download Manager" button visibility: show ONLY if downloading, paused, or queued
  if (panelOpenManagerBtn) {
    if (hasActiveManagerTasks) {
      panelOpenManagerBtn.classList.remove('hidden');
    } else {
      panelOpenManagerBtn.classList.add('hidden');
    }
  }

  if (navDownloadsCountBadge) {
    if (activeItems.length > 0) {
      navDownloadsCountBadge.textContent = activeItems.length;
      navDownloadsCountBadge.classList.remove('bg-indigo-600/30', 'text-indigo-300');
      navDownloadsCountBadge.classList.add('bg-emerald-500', 'text-white', 'animate-pulse');
    } else {
      const recentCount = Array.isArray(window._allDownloadedItems) ? window._allDownloadedItems.length : 0;
      navDownloadsCountBadge.textContent = recentCount;
      navDownloadsCountBadge.classList.remove('bg-emerald-500', 'text-white', 'animate-pulse');
      navDownloadsCountBadge.classList.add('bg-indigo-600/30', 'text-indigo-300');
    }
  }

  // Mobile Bottom Nav Badges Sync
  const mobileQueueBadge = document.getElementById('mobileQueueCountBadge');
  if (mobileQueueBadge) {
    if (activeItems.length > 0) {
      mobileQueueBadge.textContent = activeItems.length;
      mobileQueueBadge.classList.remove('hidden');
    } else {
      mobileQueueBadge.classList.add('hidden');
    }
  }

  const mobileDownloadsBadge = document.getElementById('mobileDownloadsCountBadge');
  if (mobileDownloadsBadge) {
    const recentCount = Array.isArray(window._allDownloadedItems) ? window._allDownloadedItems.length : 0;
    if (recentCount > 0) {
      mobileDownloadsBadge.textContent = recentCount;
      mobileDownloadsBadge.classList.remove('hidden');
    } else {
      mobileDownloadsBadge.classList.add('hidden');
    }
  }

  if (!panelActiveSection || !panelActiveItemsList) {
    updateDashboardEmptyState();
    return;
  }

  const cancelAllQueueBtn = document.getElementById('cancelAllQueueBtn');
  const cancelAllQueueBtnText = document.getElementById('cancelAllQueueBtnText');
  const panelCancelAllTopBtn = document.getElementById('panelCancelAllTopBtn');
  const panelCancelAllTopBtnText = document.getElementById('panelCancelAllTopBtnText');

  if (activeItems.length === 0) {
    panelActiveSection.classList.add('hidden');
    if (panelActiveBadge) panelActiveBadge.classList.add('hidden');
    if (cancelAllQueueBtn) cancelAllQueueBtn.classList.add('hidden');
    if (panelCancelAllTopBtn) panelCancelAllTopBtn.classList.add('hidden');
    updateDashboardEmptyState();
    return;
  }

  panelActiveSection.classList.remove('hidden');
  if (panelActiveBadge) panelActiveBadge.classList.remove('hidden');

  if (cancelAllQueueBtn) {
    cancelAllQueueBtn.classList.remove('hidden');
    if (cancelAllQueueBtnText) {
      cancelAllQueueBtnText.textContent = `Cancel All (${activeItems.length})`;
    }
  }

  if (panelCancelAllTopBtn) {
    panelCancelAllTopBtn.classList.remove('hidden');
    if (panelCancelAllTopBtnText) {
      panelCancelAllTopBtnText.textContent = `Cancel All (${activeItems.length})`;
    }
  }

  panelActiveItemsList.innerHTML = '';

  activeItems.forEach(item => {
    const isCurrent = currentActiveItem && (currentActiveItem.id === item.id || currentActiveItem.task_id === item.id);
    const percent = item.progress || item.percent || (isCurrent ? (window._lastActivePercent || 0) : 0);
    const speed = isCurrent ? (window._lastActiveSpeed || item.speed || '-- MB/s') : (item.status === 'paused' ? 'Paused / Incomplete' : (item.status === 'error' ? 'Download Failed' : 'Waiting...'));
    const bytes = isCurrent ? (window._lastActiveBytes || item.size || '0 MB / Calculating...') : (item.size || '0 MB / Calculating...');
    const isPaused = item.status === 'paused';
    const isError = item.status === 'error';

    let actionBtnsHtml = '';
    if (isPaused || isError) {
      actionBtnsHtml = `
        <button onclick="switchAndDownloadNow('${item.id || item.task_id}')" class="px-2.5 py-1 ${isError ? 'bg-rose-600 hover:bg-rose-500' : 'bg-indigo-600 hover:bg-indigo-500'} text-white rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer shadow-sm transition-all">
          <i data-lucide="${isError ? 'refresh-cw' : 'zap'}" class="w-3 h-3"></i>
          <span>${isError ? 'Retry' : 'Resume'}</span>
        </button>
        <button onclick="removeFromQueue('${item.id || item.task_id}')" class="p-1 text-slate-400 hover:text-red-400 rounded-md transition-colors" title="Cancel & Remove">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      `;
    } else {
      actionBtnsHtml = `
        <button onclick="openDownloadManagerModal()" class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-sm transition-all">
          View
        </button>
        <button onclick="removeFromQueue('${item.id || item.task_id}')" class="p-1 text-slate-400 hover:text-red-400 rounded-md transition-colors" title="Cancel & Remove">
          <i data-lucide="x" class="w-3.5 h-3.5"></i>
        </button>
      `;
    }

    const card = document.createElement('div');
    card.className = `p-3.5 rounded-2xl ${isError ? 'bg-rose-950/20 border border-rose-500/40' : (isPaused ? 'bg-amber-950/20 border border-amber-500/30' : 'bg-indigo-950/40 border border-indigo-500/40')} shadow-md space-y-2 cursor-pointer select-none transition-all`;
    card.innerHTML = `
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center space-x-3 overflow-hidden">
          <div class="w-12 h-12 rounded-xl overflow-hidden bg-slate-900 flex-shrink-0 border ${isError ? 'border-rose-500/40' : (isPaused ? 'border-amber-500/30' : 'border-indigo-500/40')}">
            <img src="${item.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80'}" class="w-full h-full object-cover">
          </div>
          <div class="truncate">
            <div class="text-xs sm:text-sm font-bold text-white truncate">${item.title || 'Downloading Video'}</div>
            <div class="text-[11px] ${isError ? 'text-rose-300' : (isPaused ? 'text-amber-300' : 'text-indigo-300')} font-mono mt-0.5 flex items-center space-x-2">
              <span>${speed}</span>
              <span>•</span>
              <span>${bytes}</span>
              ${item.quality_label ? `<span>•</span> <span class="text-pink-400 font-bold">${item.quality_label}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="flex items-center space-x-2 flex-shrink-0">
          <span class="text-xs font-bold ${isError ? 'text-rose-400' : (isPaused ? 'text-amber-400' : 'text-indigo-300')} font-mono">${percent}%</span>
          ${actionBtnsHtml}
        </div>
      </div>
      <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
        <div class="${isError ? 'bg-rose-500' : (isPaused ? 'bg-amber-500' : 'bg-gradient-to-r from-indigo-500 to-pink-500')} h-1.5 rounded-full transition-all duration-300" style="width: ${Math.max(percent, 2)}%"></div>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      openDownloadManagerModal();
    });

    panelActiveItemsList.appendChild(card);
  });

  updateDashboardEmptyState();
  safeCreateIcons();
}

function updateDashboardEmptyState() {
  const panelActiveSection = document.getElementById('panelActiveSection');
  const panelRecentSection = document.getElementById('panelRecentSection');
  const panelEmptyState = document.getElementById('panelEmptyState');
  const downloadsPanel = document.getElementById('downloadsPanel');
  const panelOpenManagerBtn = document.getElementById('panelOpenManagerBtn');

  const hasActive = activeQueue.some(i => i.status === 'downloading' || i.status === 'pending' || i.status === 'queued' || i.status === 'paused' || i.status === 'processing') || (currentActiveItem && (currentActiveItem.status === 'downloading' || currentActiveItem.status === 'pending' || currentActiveItem.status === 'paused')) || isQueueRunning;
  const hasRecent = Array.isArray(window._allDownloadedItems) && window._allDownloadedItems.length > 0;
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;

  // Toggle "Download Manager" button visibility: show ONLY if downloading, paused, or queued
  if (panelOpenManagerBtn) {
    if (hasActive) {
      panelOpenManagerBtn.classList.remove('hidden');
    } else {
      panelOpenManagerBtn.classList.add('hidden');
    }
  }

  if (downloadsPanel) {
    if (isMobile) {
      if (!hasActive && !hasRecent) {
        downloadsPanel.classList.add('hidden');
        downloadsPanel.style.setProperty('display', 'none', 'important');
      } else {
        downloadsPanel.classList.remove('hidden');
        downloadsPanel.style.removeProperty('display');
      }
    } else {
      downloadsPanel.classList.remove('hidden');
      downloadsPanel.style.removeProperty('display');
    }
  }

  if (panelRecentSection) {
    if (hasRecent) panelRecentSection.classList.remove('hidden');
    else panelRecentSection.classList.add('hidden');
  }
  if (panelActiveSection) {
    if (hasActive) panelActiveSection.classList.remove('hidden');
    else panelActiveSection.classList.add('hidden');
  }
  if (panelEmptyState) {
    if (!hasActive && !hasRecent) panelEmptyState.classList.remove('hidden');
    else panelEmptyState.classList.add('hidden');
  }
}

function renderFilteredHistoryList() {
  if (!historyList) return;
  historyList.innerHTML = '';

  const countBadge = document.getElementById('historyCountBadge');
  const noResultsEl = document.getElementById('historyNoResults');
  const clearBtn = document.getElementById('historyClearSearchBtn');
  const searchContainer = document.getElementById('historySearchContainer');
  const searchInput = document.getElementById('historySearchInput');

  // Search box only visible when downloaded items > 3 (on both mobile and laptop)
  const totalDownloaded = Array.isArray(window._allDownloadedItems) ? window._allDownloadedItems.length : 0;
  if (searchContainer) {
    if (totalDownloaded > 3) {
      searchContainer.classList.remove('hidden');
    } else {
      searchContainer.classList.add('hidden');
      if (searchInput && window._currentHistorySearch) {
        searchInput.value = '';
        window._currentHistorySearch = '';
      }
    }
  }

  let filtered = [...window._allDownloadedItems];

  // Apply Media Type Filter
  if (window._currentHistoryFilter === 'video') {
    filtered = filtered.filter(item => !item.is_audio);
  } else if (window._currentHistoryFilter === 'audio') {
    filtered = filtered.filter(item => !!item.is_audio);
  }

  // Apply Search Query Filter
  const q = (window._currentHistorySearch || '').trim().toLowerCase();
  if (q) {
    if (clearBtn) clearBtn.classList.remove('hidden');
    filtered = filtered.filter(item => {
      const t = (item.title || item.name || '').toLowerCase();
      const u = (item.uploader || '').toLowerCase();
      return t.includes(q) || u.includes(q);
    });
  } else {
    if (clearBtn) clearBtn.classList.add('hidden');
  }

  if (countBadge) {
    countBadge.textContent = filtered.length;
  }

  if (filtered.length === 0) {
    if (noResultsEl) noResultsEl.classList.remove('hidden');
  } else {
    if (noResultsEl) noResultsEl.classList.add('hidden');

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;

    filtered.forEach(item => {
      const row = document.createElement('div');
      row.className = 'history-item-row flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-2xl bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800/70 transition-all gap-3 cursor-pointer select-none';
      
      // Thumbnail Box HTML
      let thumbHtml = '';
      if (item.thumbnail) {
        thumbHtml = `
          <div class="thumb-trigger relative w-16 sm:w-20 aspect-video rounded-xl overflow-hidden bg-slate-900 flex-shrink-0 border border-slate-700/60 shadow-sm">
            <img src="${item.thumbnail}" alt="" class="w-full h-full object-cover">
            ${item.duration ? `<span class="absolute bottom-1 right-1 bg-black/80 text-white font-mono text-[8px] px-1 rounded font-semibold">${item.duration}</span>` : ''}
          </div>
        `;
      } else {
        thumbHtml = `
          <div class="thumb-trigger w-10 h-10 rounded-xl ${item.is_audio ? 'bg-pink-500/20 text-pink-400' : 'bg-indigo-500/20 text-indigo-400'} flex-shrink-0 flex items-center justify-center">
            <i data-lucide="${item.is_audio ? 'music' : 'video'}" class="w-5 h-5"></i>
          </div>
        `;
      }

      // Channel name: Clickable on Laptop UVD only, plain text on Mobile UVD
      let uploaderHtml = '';
      if (item.uploader) {
        if (!isMobile) {
          uploaderHtml = `<span>•</span> <span class="btn-channel-link inline-flex items-center space-x-1 text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer group" title="Open ${item.uploader} channel on YouTube"><span>${item.uploader}</span><svg class="w-2.5 h-2.5 opacity-70 group-hover:opacity-100 transition-opacity ml-0.5 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></span>`;
        } else {
          uploaderHtml = `<span>•</span> <span class="text-indigo-400">${item.uploader}</span>`;
        }
      }

      row.innerHTML = `
        <div class="flex items-center space-x-3 overflow-hidden mr-2">
          ${thumbHtml}
          <div class="truncate">
            <div class="title-trigger text-xs sm:text-sm font-semibold text-slate-100 truncate hover:text-indigo-400 transition-colors" title="${item.title || item.name}">
              ${item.title || item.name}
            </div>
            <div class="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center space-x-2">
              <span>${item.size}</span>
              <span>•</span>
              <span>${item.created}</span>
              ${uploaderHtml}
            </div>
          </div>
        </div>
        
        <!-- Action Buttons (Play, Location, Delete) -->
        <div class="flex items-center space-x-1.5 self-end sm:self-center flex-shrink-0">
          <button class="btn-play px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1 shadow-sm transition-all cursor-pointer" title="Play Video Directly">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <span>Play</span>
          </button>
          
          ${isMobile ? `
          <a href="/api/file?filename=${encodeURIComponent(item.name)}&download=1" download="${item.name}" class="btn-save-phone px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold flex items-center space-x-1 transition-all" title="Save directly to phone gallery" onclick="event.stopPropagation()">
            <svg class="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            <span>Save</span>
          </a>
          ` : `
          <button class="btn-location px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 rounded-xl text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer" title="Show and Highlight Exact File in Folder">
            <svg class="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            <span>Location</span>
          </button>
          `}

          <button class="btn-delete px-3 py-1.5 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 rounded-xl text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer" title="Delete File from Disk">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="17" x2="14" y2="11"></line></svg>
            <span>Delete</span>
          </button>
        </div>
      `;

      row.addEventListener('click', (e) => {
        const channelBtn = e.target.closest('.btn-channel-link');
        if (channelBtn) {
          e.preventDefault();
          e.stopPropagation();
          window.openChannelOnYouTube(item.uploader, item.channel_url, item.url);
          return;
        }

        const delBtn = e.target.closest('.btn-delete');
        if (delBtn) {
          e.preventDefault();
          e.stopPropagation();
          window.deleteDownloadedFile(item.name);
          return;
        }

        const locBtn = e.target.closest('.btn-location');
        if (locBtn) {
          e.preventDefault();
          e.stopPropagation();
          window.showFileInFolder(item.name);
          return;
        }

        // Clicking anywhere on the card or Play button plays the file immediately on 1 click
        window.playSavedFile(item.name);
      });

      historyList.appendChild(row);
    });
  }

  safeCreateIcons();
}

window.openChannelOnYouTube = function(uploader, channelUrl, videoUrl) {
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768) {
    return;
  }

  let targetUrl = channelUrl;
  if (!targetUrl || !targetUrl.startsWith('http')) {
    if (uploader) {
      targetUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(uploader.trim())}`;
    } else if (videoUrl) {
      targetUrl = videoUrl;
    }
  }

  if (!targetUrl) return;

  try {
    window.open(targetUrl, '_blank');
  } catch (e) {}

  fetch('/api/open-channel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploader: uploader, channel_url: targetUrl, url: videoUrl })
  }).catch(() => {});
};

function initHistoryControls() {
  const searchInput = document.getElementById('historySearchInput');
  const clearBtn = document.getElementById('historyClearSearchBtn');
  const fAll = document.getElementById('historyFilterAll');
  const fVideo = document.getElementById('historyFilterVideo');
  const fAudio = document.getElementById('historyFilterAudio');
  const emptyPasteBtn = document.getElementById('emptyStatePasteBtn');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      window._currentHistorySearch = e.target.value;
      renderFilteredHistoryList();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      window._currentHistorySearch = '';
      renderFilteredHistoryList();
    });
  }

  function setHistoryFilter(type) {
    window._currentHistoryFilter = type;
    const activeClass = 'px-2.5 py-1 rounded-lg bg-indigo-600 text-white cursor-pointer transition-all';
    const inactiveClass = 'px-2.5 py-1 rounded-lg text-slate-400 hover:text-white cursor-pointer transition-all';

    if (fAll) fAll.className = type === 'all' ? activeClass : inactiveClass;
    if (fVideo) fVideo.className = type === 'video' ? activeClass : inactiveClass;
    if (fAudio) fAudio.className = type === 'audio' ? activeClass : inactiveClass;

    renderFilteredHistoryList();
  }

  if (fAll) fAll.addEventListener('click', () => setHistoryFilter('all'));
  if (fVideo) fVideo.addEventListener('click', () => setHistoryFilter('video'));
  if (fAudio) fAudio.addEventListener('click', () => setHistoryFilter('audio'));

  if (emptyPasteBtn) {
    emptyPasteBtn.addEventListener('click', () => {
      if (pasteBtn) pasteBtn.click();
    });
  }
}

async function loadDownloadsHistory() {
  try {
    const res = await fetch('/api/downloads');
    const data = await res.json();
    const downloads = data.downloads || [];
    window._allDownloadedItems = downloads;
    window._recentDownloadsCount = downloads.length;

    const navBadge = document.getElementById('navDownloadsCountBadge');
    if (navBadge && (!activeQueue || activeQueue.length === 0)) {
      navBadge.textContent = downloads.length;
    }

    const mobileDownloadsBadge = document.getElementById('mobileDownloadsCountBadge');
    if (mobileDownloadsBadge) {
      if (downloads.length > 0) {
        mobileDownloadsBadge.textContent = downloads.length;
        mobileDownloadsBadge.classList.remove('hidden');
      } else {
        mobileDownloadsBadge.classList.add('hidden');
      }
    }

    renderFilteredHistoryList();
    updateDashboardEmptyState();
  } catch (e) {
    console.log("Error loading history", e);
  }
}

// Play or Watch File (In-App Player for Web & Mobile, Default OS player for PyWebView Desktop)
window.playSavedFile = async function(filename) {
  if (!filename) return;
  const isWebOrMobile = !window.pywebview;
  if (isWebOrMobile) {
    const playerModal = document.getElementById('mediaPlayerModal');
    const playerTitle = document.getElementById('playerModalTitle');
    const video = document.getElementById('inAppVideoPlayer');
    const dlBtn = document.getElementById('playerDirectDownloadBtn');
    const closeBtn = document.getElementById('closeMediaPlayerBtn');
    const dismissBtn = document.getElementById('playerDismissBtn');
    
    if (playerModal && video) {
      if (playerTitle) playerTitle.textContent = filename;
      const mediaUrl = `/api/file?filename=${encodeURIComponent(filename)}`;
      video.src = mediaUrl;
      video.load();
      video.play().catch(() => {});
      
      if (dlBtn) {
        dlBtn.href = mediaUrl;
        dlBtn.setAttribute('download', filename);
      }

      const closePlayer = () => {
        try { video.pause(); } catch(e){}
        video.removeAttribute('src');
        video.load();
        playerModal.classList.add('hidden');
        playerModal.classList.remove('flex');
      };

      if (closeBtn) closeBtn.onclick = closePlayer;
      if (dismissBtn) dismissBtn.onclick = closePlayer;
      playerModal.onclick = (e) => {
        if (e.target === playerModal) closePlayer();
      };

      playerModal.classList.remove('hidden');
      playerModal.classList.add('flex');
      safeCreateIcons();
      return;
    }
  }

  // Desktop Native Player
  try {
    await fetch('/api/open-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: filename })
    });
  } catch (e) {
    console.error("Error opening file", e);
  }
};

// Locate & Highlight file in Windows Explorer
window.showFileInFolder = async function(filename) {
  try {
    await fetch('/api/show-in-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: filename })
    });
  } catch (e) {
    console.error("Error locating file", e);
  }
};

// Delete File from Disk
window.deleteDownloadedFile = async function(filename) {
  if (!filename) return;
  const confirmed = await showConfirmModal({
    title: "Delete File",
    message: `Are you sure you want to delete "${filename}"?`,
    confirmText: "Delete",
    isDanger: true
  });
  if (confirmed) {
    try {
      // 1. Path param first: /api/downloads/{filename} (Supported by UVD.exe on Windows & Render backend)
      let res = await fetch(`/api/downloads/${encodeURIComponent(filename)}`, {
        method: 'DELETE'
      });
      // 2. Query param fallback: /api/downloads?filename=...
      if (!res.ok && (res.status === 405 || res.status === 404)) {
        res = await fetch(`/api/downloads?filename=${encodeURIComponent(filename)}`, {
          method: 'DELETE'
        });
      }
      // 3. POST fallback: /api/downloads/delete
      if (!res.ok && (res.status === 405 || res.status === 404)) {
        res = await fetch(`/api/downloads/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: filename })
        });
      }
      if (res.ok) {
        showAppToast("File deleted successfully.", "Deleted", "success");
        await loadDownloadsHistory();
      } else {
        const err = await res.json().catch(() => ({}));
        showAppToast(err.detail || "Could not delete file.", "Error", "error");
      }
    } catch (e) {
      console.error("Error deleting file", e);
      showAppToast("Network or system error while deleting file.", "Error", "error");
    }
  }
};

function hideAllSections() {
  resultSection.classList.add('hidden');
  playlistSection.classList.add('hidden');
  loadingSection.classList.add('hidden');
  errorSection.classList.add('hidden');
  const quickFormatContainer = document.getElementById('quickFormatContainer');
  if (quickFormatContainer) quickFormatContainer.classList.add('hidden');
}

/* ==========================================================================
   SETTINGS & CLIPBOARD SNIFFER & DRAG DROP
   ========================================================================== */

let appSettings = {
  download_dir: '',
  auto_clipboard: true,
  auto_shutdown: false,
  download_subtitles: false,
  auto_check_updates: true,
  update_url: ''
};

window._latestUpdateData = null;

async function initSettings() {
  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      appSettings = await res.json();
      let dlDir = appSettings.download_dir || '';
      if (dlDir.toLowerCase().includes('omnidownloader')) {
        dlDir = dlDir.replace(/OmniDownloader/gi, 'UVD Downloader');
        appSettings.download_dir = dlDir;
      }
      if (settingDownloadDir) settingDownloadDir.value = dlDir;
      if (settingAutoClipboard) settingAutoClipboard.checked = !!appSettings.auto_clipboard;
      if (settingAutoSubtitles) settingAutoSubtitles.checked = !!appSettings.download_subtitles;
      if (settingAutoShutdown) settingAutoShutdown.checked = !!appSettings.auto_shutdown;
      if (settingAutoCheckUpdates) settingAutoCheckUpdates.checked = appSettings.auto_check_updates !== false;
      if (settingUpdateUrl) settingUpdateUrl.value = appSettings.update_url || '';
    }

    // Fetch version information
    try {
      const vRes = await fetch('/api/version');
      if (vRes.ok) {
        const vData = await vRes.json();
        const ver = (vData && vData.version) ? vData.version : '2.1.0';
        if (settingsCurrentVerBadge) settingsCurrentVerBadge.textContent = 'v' + ver;
        if (modalCurrentVersion) modalCurrentVersion.textContent = 'v' + ver;
      }
    } catch (ve) {
      if (settingsCurrentVerBadge) settingsCurrentVerBadge.textContent = 'v2.1.0';
      if (modalCurrentVersion) modalCurrentVersion.textContent = 'v2.1.0';
    }

    // Fetch local network info for Android Mobile connect
    try {
      const netRes = await fetch('/api/network-info');
      if (netRes.ok) {
        const netData = await netRes.json();
        const settingsMobileUrl = document.getElementById('settingsMobileUrl');
        const copyMobileUrlBtn = document.getElementById('copyMobileUrlBtn');
        if (settingsMobileUrl && netData.mobile_url) {
          settingsMobileUrl.textContent = netData.mobile_url;
          if (copyMobileUrlBtn) {
            copyMobileUrlBtn.onclick = () => {
              navigator.clipboard.writeText(netData.mobile_url);
              showAppToast("Mobile connect URL copied: " + netData.mobile_url, "Copied!", "success");
            };
          }
        }
      }
    } catch (ne) {}

    // Auto-check for updates after 2 seconds if enabled
    if (appSettings.auto_check_updates !== false) {
      setTimeout(() => {
        checkAppUpdates(false);
      }, 2000);
    }
  } catch (e) {
    console.error("Failed to init settings:", e);
  }
}

function showUpdateModal(data) {
  if (!data) return;
  window._latestUpdateData = data;

  if (modalUpdateNewVerTag) modalUpdateNewVerTag.textContent = 'v' + (data.latest_version || '2.2.0');
  if (modalUpdateReleaseName) modalUpdateReleaseName.textContent = data.release_name || ('UVD v' + data.latest_version);
  if (modalCurrentVersion) modalCurrentVersion.textContent = 'v' + (data.current_version || '2.1.0');
  if (modalLatestVersion) modalLatestVersion.textContent = 'v' + (data.latest_version || '2.2.0');

  if (modalUpdateChangelogList) {
    modalUpdateChangelogList.innerHTML = '';
    const logs = Array.isArray(data.changelog) && data.changelog.length > 0 
      ? data.changelog 
      : ['Performance optimizations and bug fixes', 'Improved multi-platform video download engine', 'Stability improvements'];
    
    logs.forEach(log => {
      const item = document.createElement('div');
      item.className = 'flex items-start space-x-2 text-xs text-slate-300';
      item.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0"></span>
        <span>${log}</span>
      `;
      modalUpdateChangelogList.appendChild(item);
    });
  }

  if (updateDownloadNowBtn) {
    updateDownloadNowBtn.onclick = async () => {
      const downloadUrl = data.download_url || 'https://github.com/sanjay-singh/uvd-downloader/releases/latest';
      try {
        await fetch('/api/open-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: downloadUrl })
        });
      } catch (err) {
        window.open(downloadUrl, '_blank');
      }
      closeUpdateModal();
    };
  }

  if (updateModal) {
    updateModal.classList.remove('hidden');
    updateModal.classList.add('open');
    updateModal.style.setProperty('display', 'flex', 'important');
    updateModal.style.setProperty('visibility', 'visible', 'important');
    updateModal.style.setProperty('opacity', '1', 'important');
    updateModal.style.setProperty('pointer-events', 'auto', 'important');
  }
  safeCreateIcons();
}

function closeUpdateModal() {
  if (updateModal) {
    updateModal.classList.add('hidden');
    updateModal.classList.remove('open');
    updateModal.style.setProperty('display', 'none', 'important');
    updateModal.style.setProperty('visibility', 'hidden', 'important');
    updateModal.style.setProperty('pointer-events', 'none', 'important');
  }
}

async function checkAppUpdates(isManual = false) {
  try {
    if (checkUpdateSpinner) checkUpdateSpinner.classList.add('animate-spin');
    if (manualCheckUpdateBtn) manualCheckUpdateBtn.disabled = true;
    if (settingsUpdateStatusText) settingsUpdateStatusText.textContent = 'Checking server for updates...';

    const customUrl = settingUpdateUrl ? settingUpdateUrl.value.trim() : (appSettings.update_url || '');
    const res = await fetch('/api/check-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ update_url: customUrl })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.has_update) {
        window._latestUpdateData = data;
        if (navUpdateBadge) {
          navUpdateBadge.classList.remove('hidden');
          navUpdateBadge.classList.add('flex');
          if (navUpdateVersionTag) navUpdateVersionTag.textContent = 'v' + data.latest_version;
        }
        if (settingsUpdateStatusText) {
          settingsUpdateStatusText.textContent = `New update v${data.latest_version} available!`;
          settingsUpdateStatusText.className = 'text-[10px] text-amber-400 font-bold';
        }
        if (isManual) {
          showUpdateModal(data);
        }
      } else {
        if (navUpdateBadge) {
          navUpdateBadge.classList.add('hidden');
          navUpdateBadge.classList.remove('flex');
        }
        if (settingsUpdateStatusText) {
          settingsUpdateStatusText.textContent = `UVD is up to date (v${data.current_version})`;
          settingsUpdateStatusText.className = 'text-[10px] text-emerald-400 font-semibold';
        }
        if (isManual) {
          showAppToast(`You are using the latest version of UVD (v${data.current_version}).`, "Up to Date", "success");
        }
      }
    } else {
      if (settingsUpdateStatusText) {
        settingsUpdateStatusText.textContent = 'Could not reach update server';
        settingsUpdateStatusText.className = 'text-[10px] text-rose-400';
      }
      if (isManual) {
        showAppToast("Could not check for updates. Please check your internet connection.", "Update Check Failed", "error");
      }
    }
  } catch (err) {
    console.error("Update check failed:", err);
    if (settingsUpdateStatusText) {
      settingsUpdateStatusText.textContent = 'Update check failed';
      settingsUpdateStatusText.className = 'text-[10px] text-rose-400';
    }
    if (isManual) {
      showAppToast("Could not check for updates: " + err.message, "Update Check Failed", "error");
    }
  } finally {
    if (checkUpdateSpinner) checkUpdateSpinner.classList.remove('animate-spin');
    if (manualCheckUpdateBtn) manualCheckUpdateBtn.disabled = false;
    safeCreateIcons();
  }
}

if (browseFolderBtn) {
  browseFolderBtn.addEventListener('click', async () => {
    try {
      browseFolderBtn.disabled = true;
      browseFolderBtn.innerHTML = `<span>Opening...</span>`;
      const res = await fetch('/api/select-folder', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.download_dir) {
        settingDownloadDir.value = data.download_dir;
        appSettings.download_dir = data.download_dir;
        loadDownloadsHistory();
      }
    } catch (e) {
    } finally {
      browseFolderBtn.disabled = false;
      browseFolderBtn.innerHTML = `<i data-lucide="folder-open" class="w-3.5 h-3.5"></i> <span>Browse...</span>`;
      safeCreateIcons();
    }
  });
}

if (saveSettingsBtn) {
  saveSettingsBtn.addEventListener('click', async () => {
    try {
      saveSettingsBtn.textContent = 'Saving...';
      const payload = {
        download_dir: settingDownloadDir.value,
        auto_clipboard: settingAutoClipboard.checked,
        download_subtitles: settingAutoSubtitles.checked,
        auto_shutdown: settingAutoShutdown.checked,
        auto_check_updates: settingAutoCheckUpdates ? settingAutoCheckUpdates.checked : true,
        update_url: settingUpdateUrl ? settingUpdateUrl.value.trim() : ''
      };
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        appSettings = { ...appSettings, ...payload };
        if (typeof window.closeSettings === 'function') {
          window.closeSettings();
        } else if (settingsModal) {
          settingsModal.classList.add('hidden');
          settingsModal.classList.remove('open');
          settingsModal.style.setProperty('display', 'none', 'important');
        }
        showAppToast("Settings saved successfully!", "Saved", "success");
      } else {
        showAppToast("Failed to save settings", "Error", "error");
      }
    } catch (e) {
      showAppToast("Failed to save settings: " + e.message, "Error", "error");
    } finally {
      saveSettingsBtn.textContent = 'Save Settings';
    }
  });
}

// Trimming Options Toggle
if (toggleTrimOptionsBtn) {
  toggleTrimOptionsBtn.addEventListener('click', () => {
    if (trimOptionsContainer) {
      trimOptionsContainer.classList.toggle('hidden');
    }
  });
}

// Clipboard Link Sniffer
let lastCopiedUrl = '';
async function checkClipboardForVideoLinks() {
  if (!appSettings.auto_clipboard) return;
  try {
    let text = '';
    try {
      const res = await fetch('/api/clipboard');
      if (res.ok) {
        const data = await res.json();
        text = data.text || '';
      }
    } catch (e) {}

    if (!text) return;
    const cleanText = text.trim();
    const isVideoUrl = /https?:\/\/(www\.)?(youtube\.com|youtu\.be|instagram\.com|tiktok\.com|facebook\.com|twitter\.com|x\.com)\/[^\s]+/i.test(cleanText);
    
    if (isVideoUrl && cleanText !== lastCopiedUrl && cleanText !== urlInput.value.trim()) {
      lastCopiedUrl = cleanText;
      if (clipboardUrlText) clipboardUrlText.textContent = cleanText;
      if (clipboardToast) clipboardToast.classList.remove('hidden');
    }
  } catch (e) {}
}

window.addEventListener('focus', checkClipboardForVideoLinks);

if (clipboardCloseBtn) {
  clipboardCloseBtn.addEventListener('click', () => {
    if (clipboardToast) clipboardToast.classList.add('hidden');
  });
}

if (clipboardFetchBtn) {
  clipboardFetchBtn.addEventListener('click', () => {
    if (clipboardToast) clipboardToast.classList.add('hidden');
    if (lastCopiedUrl) {
      urlInput.value = lastCopiedUrl;
      fetchMediaInfo(lastCopiedUrl);
    }
  });
}

// Drag & Drop URLs onto Input Bar
if (urlInput) {
  const container = urlInput.closest('.glass-panel');
  if (container) {
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      container.classList.add('ring-2', 'ring-indigo-500');
    });
    container.addEventListener('dragleave', () => {
      container.classList.remove('ring-2', 'ring-indigo-500');
    });
    container.addEventListener('drop', (e) => {
      e.preventDefault();
      container.classList.remove('ring-2', 'ring-indigo-500');
      const text = e.dataTransfer.getData('text');
      if (text && text.trim()) {
        urlInput.value = text.trim();
        fetchMediaInfo(text.trim());
      }
    });
  }
}

initSettings();
