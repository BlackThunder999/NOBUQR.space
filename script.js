// ============================================================
// NOBUQR.SPACE - ВСЯ ЛОГИКА
// ============================================================

// --- Глобальные переменные (var только) ---
var SUPABASE_URL = 'https://iljsednetiogjtowlexo.supabase.co';
var SUPABASE_KEY = 'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O';
var supabase;
var currentUser = null;
var currentSession = null;
var sessionExpiry = null;
var currentFeed = 'latest';
var currentTab = 'home';
var currentChatId = null;
var currentChatUser = null;
var viewingUserId = null;
var feedPage = 0;
var feedLoading = false;
var feedHasMore = true;
var FEED_PAGE_SIZE = 15;
var PEPPER = 'NOBUQR_SPACE_PEPPER_V1_xK9mP2vL8nQ4wR7yF3jH6tB5dA1cU0eZ9sW3oI8';
var SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 часа
var MAT_FILTER = ['хуй', 'пизда', 'ебать', 'блять', 'сука', 'fuck', 'shit', 'ass', 'bitch', 'cunt', 'dick', 'whore', 'slut'];
var SPAM_PATTERNS = [
  { regex: /(.)\1{6,}/, msg: 'Слишком много повторяющихся символов' },
  { regex: /https?:\/\/[^\s]+.*https?:\/\/[^\s]+/, msg: 'Слишком много ссылок' }
];
var ENCRYPTION_KEY_CACHE = null;

// --- Инициализация Supabase ---
function initSupabase() {
  if (typeof supabase !== 'undefined' && supabase !== null) return;
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 10 } }
  });
}

// --- Хеширование PBKDF2-SHA512 ---
function generateSalt(length) {
  var arr = new Uint8Array(length);
  window.crypto.getRandomValues(arr);
  var result = '';
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
  for (var i = 0; i < arr.length; i++) {
    result = result + chars.charAt(arr[i] % chars.length);
  }
  return result;
}

function pbkdf2Hash(password, salt, iterations, callback) {
  var encoder = new TextEncoder();
  var passwordData = encoder.encode(password);
  var saltData = encoder.encode(salt);
  
  window.crypto.subtle.importKey('raw', passwordData, { name: 'PBKDF2' }, false, ['deriveBits'])
    .then(function(key) {
      return window.crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: saltData, iterations: iterations, hash: 'SHA-512' },
        key,
        512
      );
    })
    .then(function(bits) {
      var hashArray = Array.from(new Uint8Array(bits));
      var hashHex = hashArray.map(function(b) { return ('00' + b.toString(16)).slice(-2); }).join('');
      callback(null, hashHex);
    })
    .catch(function(err) {
      callback(err, null);
    });
}

function doubleHashPassword(password, salt, iterations, callback) {
  var pepperedPassword = password + PEPPER + salt.substring(0, 16);
  pbkdf2Hash(pepperedPassword, salt, iterations, function(err, firstHash) {
    if (err) { callback(err, null); return; }
    var combined = firstHash + salt.substring(16, 32);
    pbkdf2Hash(combined, salt.substring(32, 64), Math.floor(iterations / 10), function(err2, secondHash) {
      if (err2) { callback(err2, null); return; }
      var shaObj = new jsSHA('SHA-512', 'TEXT');
      shaObj.update(secondHash + PEPPER);
      var finalHash = shaObj.getHash('HEX');
      callback(null, finalHash);
    });
  });
}

function constantTimeCompare(a, b) {
  if (a.length !== b.length) return false;
  var result = 0;
  for (var i = 0; i < a.length; i++) {
    result = result | (a.charCodeAt(i) ^ b.charCodeAt(i));
  }
  return result === 0;
}

// --- Шифрование сессии ---
function getEncryptionKey() {
  if (ENCRYPTION_KEY_CACHE) return ENCRYPTION_KEY_CACHE;
  var stored = localStorage.getItem('nob_enc_key');
  if (stored) {
    ENCRYPTION_KEY_CACHE = stored;
    return stored;
  }
  var key = generateSalt(64);
  localStorage.setItem('nob_enc_key', key);
  ENCRYPTION_KEY_CACHE = key;
  return key;
}

function encryptData(data) {
  try {
    var key = getEncryptionKey();
    var json = JSON.stringify(data);
    var result = '';
    for (var i = 0; i < json.length; i++) {
      var charCode = json.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      result = result + String.fromCharCode(charCode);
    }
    return btoa(result);
  } catch(e) {
    return btoa(JSON.stringify(data));
  }
}

function decryptData(encoded) {
  try {
    var key = getEncryptionKey();
    var decoded = atob(encoded);
    var result = '';
    for (var i = 0; i < decoded.length; i++) {
      var charCode = decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      result = result + String.fromCharCode(charCode);
    }
    return JSON.parse(result);
  } catch(e) {
    return null;
  }
}

// --- Управление сессией ---
function saveSession(userData) {
  var sessionData = {
    userId: userData.id,
    email: userData.email,
    handle: userData.handle,
    displayName: userData.display_name,
    avatarUrl: userData.avatar_url,
    isAdmin: userData.is_admin,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DURATION
  };
  localStorage.setItem('nob_session', encryptData(sessionData));
  currentSession = sessionData;
  currentUser = userData;
  sessionExpiry = sessionData.expiresAt;
}

function loadSession() {
  var stored = localStorage.getItem('nob_session');
  if (!stored) return false;
  var sessionData = decryptData(stored);
  if (!sessionData) return false;
  if (Date.now() > sessionData.expiresAt) {
    localStorage.removeItem('nob_session');
    return false;
  }
  currentSession = sessionData;
  sessionExpiry = sessionData.expiresAt;
  return true;
}

function clearSession() {
  localStorage.removeItem('nob_session');
  localStorage.removeItem('nob_enc_key');
  currentSession = null;
  currentUser = null;
  sessionExpiry = null;
  ENCRYPTION_KEY_CACHE = null;
}

function checkSession() {
  if (!currentSession || Date.now() > sessionExpiry) {
    clearSession();
    showAuthScreen();
    showToast('Сессия истекла. Войдите снова.', 'error');
    return false;
  }
  return true;
}

// --- Экранирование HTML (XSS защита) ---
function escapeHTML(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// --- Фильтр мата ---
function filterBadWords(text) {
  var filtered = text;
  for (var i = 0; i < MAT_FILTER.length; i++) {
    var word = MAT_FILTER[i];
    var regex = new RegExp(word, 'gi');
    filtered = filtered.replace(regex, '***');
  }
  return filtered;
}

function checkSpam(text) {
  for (var i = 0; i < SPAM_PATTERNS.length; i++) {
    if (SPAM_PATTERNS[i].regex.test(text)) {
      return SPAM_PATTERNS[i].msg;
    }
  }
  return null;
}

// --- Toast уведомления ---
function showToast(message, type) {
  type = type || 'info';
  var container = document.getElementById('toast-container');
  var toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(function() {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(function() { container.removeChild(toast); }, 300);
  }, 3000);
}

// --- Навигация по экранам ---
function showAuthScreen() {
  document.getElementById('auth-screen').classList.add('active');
  document.getElementById('app-screen').classList.remove('active');
}

function showAppScreen() {
  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');
}

function showLogin() {
  document.getElementById('login-form').classList.remove('hidden');
  document.getElementById('register-form').classList.add('hidden');
}

function showRegister() {
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('register-form').classList.remove('hidden');
}

// --- Переключение вкладок ---
function switchTab(tab) {
  if (!checkSession()) return;
  currentTab = tab;
  var tabs = document.querySelectorAll('.tab-content');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
  var target = document.getElementById('tab-' + tab);
  if (target) target.classList.add('active');
  
  var navBtns = document.querySelectorAll('.nav-btn');
  for (var j = 0; j < navBtns.length; j++) navBtns[j].classList.remove('active');
  var activeBtn = document.querySelector('[data-tab="' + tab + '"]');
  if (activeBtn) activeBtn.classList.add('active');
  
  if (tab === 'home') loadFeed();
  if (tab === 'shop') loadShop();
  if (tab === 'profile') loadProfile(currentSession.userId);
}

function switchFeed(feedType) {
  currentFeed = feedType;
  feedPage = 0;
  feedHasMore = true;
  var tabs = document.querySelectorAll('.feed-tab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
  event.target.classList.add('active');
  document.getElementById('feed-container').innerHTML = '';
  loadFeed();
}

// --- Обработка хештегов и упоминаний ---
function parseChirpText(text) {
  var escaped = escapeHTML(text);
  escaped = escaped.replace(/#(\w+)/g, '<span class="hashtag" onclick="window.searchHashtag(\'$1\')">#$1</span>');
  escaped = escaped.replace(/@(\w+)/g, '<span class="mention" onclick="window.openUserByHandle(\'$1\')">@$1</span>');
  return escaped;
}

// --- Форматирование времени ---
function timeAgo(dateStr) {
  var date = new Date(dateStr);
  var now = new Date();
  var seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return seconds + 'с';
  var minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'м';
  var hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'ч';
  var days = Math.floor(hours / 24);
  if (days < 30) return days + 'д';
  var months = Math.floor(days / 30);
  if (months < 12) return months + 'мес';
  return Math.floor(months / 12) + 'г';
}

// --- Модальные окна ---
function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

function openCreateModal() {
  if (!checkSession()) return;
  document.getElementById('create-text').value = '';
  document.getElementById('create-media-preview').innerHTML = '';
  document.getElementById('char-count').textContent = '0';
  document.getElementById('create-image-input').value = '';
  document.getElementById('create-video-input').value = '';
  window._createMediaFile = null;
  window._createMediaType = null;
  openModal('create-modal');
}

function closeCreateModal() {
  closeModal('create-modal');
}

function updateCharCount() {
  var count = document.getElementById('create-text').value.length;
  document.getElementById('char-count').textContent = count;
}

function openEditProfileModal() {
  if (!checkSession()) return;
  document.getElementById('edit-name').value = currentUser.display_name || '';
  document.getElementById('edit-bio').value = currentUser.bio || '';
  document.getElementById('edit-link').value = currentUser.link || '';
  document.getElementById('edit-location').value = currentUser.location || '';
  document.getElementById('avatar-preview').innerHTML = '';
  document.getElementById('banner-preview').innerHTML = '';
  document.getElementById('edit-avatar-input').value = '';
  document.getElementById('edit-banner-input').value = '';
  window._newAvatarFile = null;
  window._newBannerFile = null;
  openModal('edit-profile-modal');
}

function closeEditProfileModal() {
  closeModal('edit-profile-modal');
}

function closeUserProfile() {
  closeModal('user-profile-modal');
  viewingUserId = null;
}

function showTOS() {
  openModal('tos-modal');
}

function closeTOS() {
  closeModal('tos-modal');
}

function showPrivacy() {
  openModal('privacy-modal');
}

function closePrivacy() {
  closeModal('privacy-modal');
}

function openDiscord() {
  window.open('https://discord.gg/UfudC69FX', '_blank');
}

// --- Авторизация ---
function handleLogin() {
  initSupabase();
  var email = document.getElementById('login-email').value.trim();
  var password = document.getElementById('login-password').value;
  
  if (!email || !password) {
    showToast('Заполните все поля', 'error');
    return;
  }
  
  supabase.from('users').select('*').eq('email', email).single().then(function(res) {
    if (res.error || !res.data) {
      showToast('Неверный email или пароль', 'error');
      return;
    }
    var user = res.data;
    doubleHashPassword(password, user.password_salt, user.password_iterations, function(err, hash) {
      if (err) { showToast('Ошибка входа', 'error'); return; }
      if (!constantTimeCompare(hash, user.password_hash)) {
        showToast('Неверный email или пароль', 'error');
        return;
      }
      if (user.is_banned) {
        showToast('Ваш аккаунт заблокирован: ' + user.ban_reason, 'error');
        return;
      }
      saveSession(user);
      showAppScreen();
      currentTab = 'home';
      switchTab('home');
      loadFeed();
      updateAdminButton();
      showToast('Добро пожаловать, ' + user.display_name + '!', 'success');
    });
  });
}

function handleRegister() {
  initSupabase();
  var email = document.getElementById('reg-email').value.trim();
  var name = document.getElementById('reg-name').value.trim();
  var handle = document.getElementById('reg-handle').value.trim();
  var age = parseInt(document.getElementById('reg-age').value);
  var password = document.getElementById('reg-password').value;
  var passwordConfirm = document.getElementById('reg-password-confirm').value;
  var tos = document.getElementById('reg-tos').checked;
  
  if (!email || !name || !handle || !age || !password) {
    showToast('Заполните все поля', 'error');
    return;
  }
  if (password !== passwordConfirm) {
    showToast('Пароли не совпадают', 'error');
    return;
  }
  if (password.length < 8) {
    showToast('Пароль должен быть не менее 8 символов', 'error');
    return;
  }
  if (age < 13) {
    showToast('Вам должно быть 13+ лет', 'error');
    return;
  }
  if (!tos) {
    showToast('Примите условия использования', 'error');
    return;
  }
  if (!handle.startsWith('@')) {
    showToast('Handle должен начинаться с @', 'error');
    return;
  }
  var handleClean = handle.substring(1);
  if (!/^[a-zA-Z0-9_]{3,29}$/.test(handleClean)) {
    showToast('Handle: 3-29 символов (буквы, цифры, _)', 'error');
    return;
  }
  
  supabase.from('users').select('id').eq('handle', handle).single().then(function(res) {
    if (res.data) {
      showToast('Этот @handle уже занят', 'error');
      return;
    }
    supabase.from('users').select('id').eq('email', email).single().then(function(res2) {
      if (res2.data) {
        showToast('Этот email уже зарегистрирован', 'error');
        return;
      }
      
      var salt = generateSalt(128);
      var iterations = 500000;
      doubleHashPassword(password, salt, iterations, function(err, hash) {
        if (err) { showToast('Ошибка регистрации', 'error'); return; }
        
        var newUser = {
          email: email,
          password_hash: hash,
          password_salt: salt,
          password_iterations: iterations,
          handle: handle,
          display_name: name,
          age: age,
          bio: '',
          avatar_url: '',
          banner_url: ''
        };
        
        supabase.from('users').insert([newUser]).select().single().then(function(res3) {
          if (res3.error) {
            showToast('Ошибка регистрации: ' + res3.error.message, 'error');
            return;
          }
          // Создаём запись Gems
          supabase.from('gems').insert([{ user_id: res3.data.id, balance: 10, total_earned: 10 }]).then(function() {});
          saveSession(res3.data);
          showAppScreen();
          currentTab = 'home';
          switchTab('home');
          loadFeed();
          showToast('Регистрация успешна! +10 💎', 'success');
        });
      });
    });
  });
}

function logout() {
  clearSession();
  showAuthScreen();
  showToast('Вы вышли из аккаунта', 'info');
}

// --- Загрузка ленты ---
function loadFeed() {
  if (feedLoading || !feedHasMore) return;
  if (!checkSession()) return;
  feedLoading = true;
  document.getElementById('feed-loader').classList.remove('hidden');
  
  var query = supabase.from('chirps').select('*, users:user_id(id, handle, display_name, avatar_url, avatar_frame, nickname_color, verified, title_prefix)', { count: 'exact' }).order('created_at', { ascending: false }).range(feedPage * FEED_PAGE_SIZE, (feedPage + 1) * FEED_PAGE_SIZE - 1);
  
  if (currentFeed === 'popular') {
    query = query.order('rechirp_count', { ascending: false });
  }
  
  if (currentFeed === 'following' && currentSession) {
    supabase.from('follows').select('following_id').eq('follower_id', currentSession.userId).then(function(followRes) {
      var followingIds = [];
      if (followRes.data) {
        for (var i = 0; i < followRes.data.length; i++) {
          followingIds.push(followRes.data[i].following_id);
        }
      }
      followingIds.push(currentSession.userId);
      query = query.in('user_id', followingIds);
      executeFeedQuery(query);
    });
  } else {
    executeFeedQuery(query);
  }
}

function executeFeedQuery(query) {
  query.then(function(res) {
    feedLoading = false;
    document.getElementById('feed-loader').classList.add('hidden');
    
    if (res.error) {
      console.error('Feed error:', res.error);
      return;
    }
    
    if (res.data.length < FEED_PAGE_SIZE) feedHasMore = false;
    
    if (feedPage === 0) {
      document.getElementById('feed-container').innerHTML = '';
    }
    
    if (res.data.length === 0 && feedPage === 0) {
      document.getElementById('feed-container').innerHTML = '<div class="empty-state"><div class="empty-state-icon">🐦</div><div class="empty-state-text">Пока нет постов. Будьте первым!</div></div>';
      return;
    }
    
    for (var i = 0; i < res.data.length; i++) {
      renderChirp(res.data[i]);
    }
    feedPage++;
  });
}

function renderChirp(chirp) {
  var container = document.getElementById('feed-container');
  var card = document.createElement('div');
  card.className = 'chirp-card';
  card.id = 'chirp-' + chirp.id;
  
  var user = chirp.users || {};
  var avatarUrl = user.avatar_url || '';
  var avatarClass = user.avatar_frame ? 'chirp-avatar chirp-avatar-frame' : 'chirp-avatar';
  var displayName = (user.title_prefix ? user.title_prefix + ' ' : '') + escapeHTML(user.display_name || 'Unknown');
  var verifiedIcon = user.verified ? '<span class="verified-badge">✓</span>' : '';
  var nameStyle = user.nickname_color && user.nickname_color !== '#ffffff' ? ' style="color:' + user.nickname_color + ';"' : '';
  
  var avatarHTML = avatarUrl 
    ? '<img class="' + avatarClass + '" src="' + avatarUrl + '" alt="" onclick="window.openUserProfile(\'' + user.id + '\')">'
    : '<div class="' + avatarClass + '" style="background:#7c4dff;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:18px;" onclick="window.openUserProfile(\'' + user.id + '\')">' + (user.display_name ? user.display_name.charAt(0).toUpperCase() : '?') + '</div>';
  
  var mediaHTML = '';
  if (chirp.image_url) {
    mediaHTML = '<img class="chirp-media" src="' + chirp.image_url + '" alt="" loading="lazy">';
  }
  if (chirp.video_url) {
    mediaHTML = '<video class="chirp-video" src="' + chirp.video_url + '" controls></video>';
  }
  
  card.innerHTML = 
    '<div class="chirp-header">' +
      avatarHTML +
      '<div class="chirp-user-info" onclick="window.openUserProfile(\'' + user.id + '\')">' +
        '<div class="chirp-display-name"' + nameStyle + '>' + displayName + ' ' + verifiedIcon + '</div>' +
        '<div class="chirp-handle">' + escapeHTML(user.handle || '') + ' · <span class="chirp-time">' + timeAgo(chirp.created_at) + '</span></div>' +
      '</div>' +
      (chirp.user_id === (currentSession ? currentSession.userId : '') ? '<button style="background:none;border:none;color:#707080;cursor:pointer;font-size:16px;" onclick="window.deleteChirp(\'' + chirp.id + '\')">🗑️</button>' : '') +
    '</div>' +
    '<div class="chirp-text">' + parseChirpText(chirp.text) + '</div>' +
    mediaHTML +
    '<div class="chirp-actions">' +
      '<button class="chirp-action" id="like-btn-' + chirp.id + '" onclick="window.toggleLike(\'' + chirp.id + '\')">❤️ <span id="like-count-' + chirp.id + '">...</span></button>' +
      '<button class="chirp-action" onclick="window.openComments(\'' + chirp.id + '\')">💬 <span id="comment-count-' + chirp.id + '">...</span></button>' +
      '<button class="chirp-action" id="rechirp-btn-' + chirp.id + '" onclick="window.rechirp(\'' + chirp.id + '\')">🔄 <span id="rechirp-count-' + chirp.id + '">' + (chirp.rechirp_count || 0) + '</span></button>' +
    '</div>';
  
  container.appendChild(card);
  
  loadChirpStats(chirp.id);
  checkUserLike(chirp.id);
}

function loadChirpStats(chirpId) {
  supabase.from('likes').select('id', { count: 'exact' }).eq('chirp_id', chirpId).then(function(res) {
    var el = document.getElementById('like-count-' + chirpId);
    if (el) el.textContent = res.count || 0;
  });
  supabase.from('comments').select('id', { count: 'exact' }).eq('chirp_id', chirpId).then(function(res) {
    var el = document.getElementById('comment-count-' + chirpId);
    if (el) el.textContent = res.count || 0;
  });
}

function checkUserLike(chirpId) {
  if (!currentSession) return;
  supabase.from('likes').select('id').eq('chirp_id', chirpId).eq('user_id', currentSession.userId).single().then(function(res) {
    if (res.data) {
      var btn = document.getElementById('like-btn-' + chirpId);
      if (btn) btn.classList.add('liked');
    }
  });
}

function toggleLike(chirpId) {
  if (!checkSession()) return;
  var btn = document.getElementById('like-btn-' + chirpId);
  
  if (btn.classList.contains('liked')) {
    supabase.from('likes').delete().eq('chirp_id', chirpId).eq('user_id', currentSession.userId).then(function() {
      btn.classList.remove('liked');
      loadChirpStats(chirpId);
    });
  } else {
    supabase.from('likes').insert([{ chirp_id: chirpId, user_id: currentSession.userId }]).then(function(res) {
      if (!res.error) {
        btn.classList.add('liked');
        btn.classList.add('like-animation');
        setTimeout(function() { btn.classList.remove('like-animation'); }, 400);
        loadChirpStats(chirpId);
        // Начисление Gems автору
        supabase.from('chirps').select('user_id').eq('id', chirpId).single().then(function(cRes) {
          if (cRes.data && cRes.data.user_id !== currentSession.userId) {
            addGems(cRes.data.user_id, 1, 'Лайк на пост');
            createNotification(cRes.data.user_id, 'like', chirpId);
          }
        });
      }
    });
  }
}

function rechirp(chirpId) {
  if (!checkSession()) return;
  supabase.from('chirps').select('*').eq('id', chirpId).single().then(function(res) {
    if (!res.data) return;
    var newChirp = {
      user_id: currentSession.userId,
      text: res.data.text,
      image_url: res.data.image_url,
      video_url: res.data.video_url,
      is_rechirp: true,
      original_chirp_id: chirpId
    };
    supabase.from('chirps').insert([newChirp]).then(function(r2) {
      if (!r2.error) {
        supabase.from('chirps').update({ rechirp_count: (res.data.rechirp_count || 0) + 1 }).eq('id', chirpId).then(function() {
          var el = document.getElementById('rechirp-count-' + chirpId);
          if (el) el.textContent = parseInt(el.textContent) + 1;
          showToast('Речирп опубликован! 🔄', 'success');
          feedPage = 0;
          feedHasMore = true;
          document.getElementById('feed-container').innerHTML = '';
          loadFeed();
        });
      }
    });
  });
}

function deleteChirp(chirpId) {
  if (!checkSession()) return;
  if (!confirm('Удалить пост?')) return;
  supabase.from('chirps').delete().eq('id', chirpId).eq('user_id', currentSession.userId).then(function(res) {
    if (!res.error) {
      var el = document.getElementById('chirp-' + chirpId);
      if (el) el.remove();
      showToast('Пост удалён', 'success');
    }
  });
}

function createChirp() {
  if (!checkSession()) return;
  var text = document.getElementById('create-text').value.trim();
  if (!text && !window._createMediaFile) {
    showToast('Введите текст или добавьте медиа', 'error');
    return;
  }
  if (text.length > 280) {
    showToast('Максимум 280 символов', 'error');
    return;
  }
  var spamCheck = checkSpam(text);
  if (spamCheck) {
    showToast(spamCheck, 'error');
    return;
  }
  text = filterBadWords(text);
  
  var uploadMedia = function(callback) {
    if (!window._createMediaFile) { callback(null); return; }
    var bucket = window._createMediaType === 'video' ? 'videos' : 'images';
    var maxSize = window._createMediaType === 'video' ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (window._createMediaFile.size > maxSize) {
      showToast('Файл слишком большой', 'error');
      return;
    }
    var fileName = currentSession.userId + '_' + Date.now() + '_' + window._createMediaFile.name;
    supabase.storage.from(bucket).upload(fileName, window._createMediaFile).then(function(uploadRes) {
      if (uploadRes.error) { showToast('Ошибка загрузки', 'error'); return; }
      var urlRes = supabase.storage.from(bucket).getPublicUrl(fileName);
      callback(urlRes.data.publicUrl);
    });
  };
  
  uploadMedia(function(mediaUrl) {
    var newChirp = {
      user_id: currentSession.userId,
      text: text,
      image_url: window._createMediaType === 'image' && mediaUrl ? mediaUrl : '',
      video_url: window._createMediaType === 'video' && mediaUrl ? mediaUrl : ''
    };
    supabase.from('chirps').insert([newChirp]).then(function(res) {
      if (res.error) { showToast('Ошибка публикации', 'error'); return; }
      closeCreateModal();
      addGems(currentSession.userId, 1, 'За пост');
      feedPage = 0;
      feedHasMore = true;
      document.getElementById('feed-container').innerHTML = '';
      loadFeed();
      showToast('Пост опубликован! +1 💎', 'success');
    });
  });
}

function handleMediaSelect(type) {
  var input = document.getElementById('create-' + type + '-input');
  if (input.files && input.files[0]) {
    window._createMediaFile = input.files[0];
    window._createMediaType = type;
    var preview = document.getElementById('create-media-preview');
    var url = URL.createObjectURL(input.files[0]);
    if (type === 'image') {
      preview.innerHTML = '<img src="' + url + '" style="width:100%;max-height:200px;object-fit:cover;border-radius:8px;">';
    } else {
      preview.innerHTML = '<video src="' + url + '" controls style="width:100%;max-height:200px;border-radius:8px;"></video>';
    }
  }
}

// --- Комментарии ---
function openComments(chirpId) {
  if (!checkSession()) return;
  alert('Комментарии: ID поста ' + chirpId + '\nФункционал комментариев в разработке.');
  // Здесь должен открываться модал с комментариями
}

// --- Поиск ---
function handleSearch(event) {
  if (!checkSession()) return;
  var query = document.getElementById('search-input').value.trim();
  if (event.key !== 'Enter' || !query) return;
  
  var container = document.getElementById('search-results');
  container.innerHTML = '<div class="loader">Поиск...</div>';
  
  if (query.startsWith('#')) {
    var tag = query.substring(1).toLowerCase();
    supabase.from('chirps').select('*, users:user_id(*)').ilike('text', '%#' + tag + '%').order('created_at', { ascending: false }).limit(20).then(function(res) {
      container.innerHTML = '<h4 style="padding:8px;">Результаты по #' + tag + '</h4>';
      if (!res.data || res.data.length === 0) {
        container.innerHTML += '<div class="empty-state"><div class="empty-state-text">Ничего не найдено</div></div>';
      } else {
        for (var i = 0; i < res.data.length; i++) {
          renderChirpInContainer(res.data[i], container);
        }
      }
    });
  } else {
    supabase.from('users').select('*').or('handle.ilike.%' + query + '%,display_name.ilike.%' + query + '%').limit(20).then(function(res) {
      container.innerHTML = '<h4 style="padding:8px;">Пользователи</h4>';
      if (!res.data || res.data.length === 0) {
        container.innerHTML += '<div class="empty-state"><div class="empty-state-text">Ничего не найдено</div></div>';
      } else {
        for (var i = 0; i < res.data.length; i++) {
          var user = res.data[i];
          var card = document.createElement('div');
          card.className = 'search-user-card';
          card.onclick = function(u) { return function() { window.openUserProfile(u.id); }; }(user);
          card.innerHTML = 
            '<img class="search-user-avatar" src="' + (user.avatar_url || '') + '" onerror="this.style.display=\'none\'">' +
            '<div><strong>' + escapeHTML(user.display_name) + '</strong><br><small>' + escapeHTML(user.handle) + '</small></div>';
          container.appendChild(card);
        }
      }
    });
  }
}

function searchHashtag(tag) {
  switchTab('search');
  document.getElementById('search-input').value = '#' + tag;
  var event = new KeyboardEvent('keyup', { key: 'Enter' });
  document.getElementById('search-input').dispatchEvent(event);
}

function renderChirpInContainer(chirp, container) {
  var card = document.createElement('div');
  card.className = 'chirp-card';
  card.innerHTML = 
    '<div class="chirp-text">' + parseChirpText(chirp.text) + '</div>' +
    '<div style="font-size:11px;color:#707080;">' + timeAgo(chirp.created_at) + '</div>';
  container.appendChild(card);
}

// --- Профили ---
function loadProfile(userId) {
  if (!checkSession()) return;
  supabase.from('users').select('*').eq('id', userId).single().then(function(res) {
    if (!res.data) return;
    var user = res.data;
    var isOwn = user.id === currentSession.userId;
    var container = document.getElementById('profile-content');
    
    supabase.from('chirps').select('id', { count: 'exact' }).eq('user_id', userId).then(function(chirpRes) {
      supabase.from('follows').select('id', { count: 'exact' }).eq('following_id', userId).then(function(followerRes) {
        supabase.from('follows').select('id', { count: 'exact' }).eq('follower_id', userId).then(function(followingRes) {
          supabase.from('likes').select('id', { count: 'exact' }).eq('user_id', userId).then(function(likeRes) {
            
            var bannerClass = user.animated_banner ? 'profile-banner animated-banner' : 'profile-banner';
            var bannerStyle = user.banner_url ? 'background-image:url(' + user.banner_url + ');background-size:cover;' : '';
            var avatarHTML = user.avatar_url ? '<img class="profile-avatar-large" src="' + user.avatar_url + '" alt="">' : '<div class="profile-avatar-large" style="background:#7c4dff;display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:700;color:#fff;">' + (user.display_name ? user.display_name.charAt(0).toUpperCase() : '?') + '</div>';
            var nameStyle = user.nickname_color && user.nickname_color !== '#ffffff' ? ' style="color:' + user.nickname_color + ';"' : '';
            var verifiedIcon = user.verified ? '<span class="verified-badge">✓</span>' : '';
            var displayName = (user.title_prefix ? user.title_prefix + ' ' : '') + escapeHTML(user.display_name);
            
            var actionsHTML = '';
            if (isOwn) {
              actionsHTML = '<button class="profile-action-btn btn-edit-profile" onclick="window.openEditProfileModal()">Редактировать</button>';
            } else {
              actionsHTML = '<button class="profile-action-btn btn-message" onclick="window.openChatWith(\'' + user.id + '\')">💬 Сообщение</button>';
              supabase.from('follows').select('id').eq('follower_id', currentSession.userId).eq('following_id', userId).single().then(function(fRes) {
                var followBtn = document.getElementById('follow-btn-' + userId);
                if (followBtn) {
                  if (fRes.data) {
                    followBtn.textContent = 'Отписаться';
                    followBtn.classList.add('following');
                  } else {
                    followBtn.textContent = 'Подписаться';
                    followBtn.classList.remove('following');
                  }
                }
              });
              actionsHTML += '<button class="profile-action-btn btn-follow" id="follow-btn-' + userId + '" onclick="window.toggleFollow(\'' + userId + '\')">Подписаться</button>';
            }
            
            container.innerHTML = 
              '<div class="' + bannerClass + '" style="' + bannerStyle + '"></div>' +
              '<div class="profile-header-info">' +
                avatarHTML +
                '<div class="profile-name-area">' +
                  '<div class="profile-display-name"' + nameStyle + '>' + displayName + ' ' + verifiedIcon + '</div>' +
                  '<div class="profile-handle">' + escapeHTML(user.handle) + '</div>' +
                '</div>' +
                (user.bio ? '<div class="profile-bio">' + escapeHTML(user.bio) + '</div>' : '') +
                '<div class="profile-meta">' +
                  (user.link ? '<span>🔗 <a href="' + escapeHTML(user.link) + '" target="_blank" style="color:#b388ff;">' + escapeHTML(user.link) + '</a></span>' : '') +
                  (user.location ? '<span>📍 ' + escapeHTML(user.location) + '</span>' : '') +
                  '<span>📅 На платформе с ' + new Date(user.created_at).toLocaleDateString() + '</span>' +
                '</div>' +
                '<div class="profile-stats">' +
                  '<div class="profile-stat"><div class="profile-stat-value">' + (chirpRes.count || 0) + '</div><div class="profile-stat-label">Постов</div></div>' +
                  '<div class="profile-stat"><div class="profile-stat-value">' + (followerRes.count || 0) + '</div><div class="profile-stat-label">Подписчиков</div></div>' +
                  '<div class="profile-stat"><div class="profile-stat-value">' + (followingRes.count || 0) + '</div><div class="profile-stat-label">Подписок</div></div>' +
                  '<div class="profile-stat"><div class="profile-stat-value">' + (likeRes.count || 0) + '</div><div class="profile-stat-label">Лайков</div></div>' +
                '</div>' +
                '<div class="profile-actions">' + actionsHTML + '</div>' +
              '</div>' +
              '<div class="profile-chirps" id="profile-chirps-container"><div class="loader">Загрузка постов...</div></div>';
            
            loadUserChirps(userId);
          });
        });
      });
    });
  });
}

function loadUserChirps(userId) {
  supabase.from('chirps').select('*, users:user_id(*)').eq('user_id', userId).order('created_at', { ascending: false }).limit(30).then(function(res) {
    var container = document.getElementById('profile-chirps-container');
    if (!container) return;
    container.innerHTML = '';
    if (!res.data || res.data.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🐦</div><div class="empty-state-text">Нет постов</div></div>';
    } else {
      for (var i = 0; i < res.data.length; i++) {
        renderChirpInContainer(res.data[i], container);
      }
    }
  });
}

function openUserProfile(userId) {
  if (!checkSession()) return;
  viewingUserId = userId;
  document.getElementById('user-profile-modal-title').textContent = 'Профиль';
  var content = document.getElementById('user-profile-modal-content');
  content.innerHTML = '<div class="loader">Загрузка...</div>';
  openModal('user-profile-modal');
  
  supabase.from('users').select('*').eq('id', userId).single().then(function(res) {
    if (!res.data) { content.innerHTML = 'Пользователь не найден'; return; }
    var user = res.data;
    content.innerHTML = 
      '<div style="text-align:center;">' +
        (user.avatar_url ? '<img src="' + user.avatar_url + '" style="width:80px;height:80px;border-radius:50%;object-fit:cover;">' : '') +
        '<h3>' + escapeHTML(user.display_name) + (user.verified ? ' ✓' : '') + '</h3>' +
        '<p>' + escapeHTML(user.handle) + '</p>' +
        (user.bio ? '<p>' + escapeHTML(user.bio) + '</p>' : '') +
        '<button class="btn-primary" style="margin-top:10px;" onclick="window.closeUserProfile(); window.switchTab(\'profile\'); window.loadProfile(\'' + userId + '\');">Открыть профиль</button>' +
      '</div>';
  });
}

function openUserByHandle(handle) {
  if (!checkSession()) return;
  supabase.from('users').select('id').eq('handle', '@' + handle).single().then(function(res) {
    if (res.data) openUserProfile(res.data.id);
  });
}

function toggleFollow(userId) {
  if (!checkSession()) return;
  var btn = document.getElementById('follow-btn-' + userId);
  var isFollowing = btn.classList.contains('following');
  
  if (isFollowing) {
    supabase.from('follows').delete().eq('follower_id', currentSession.userId).eq('following_id', userId).then(function() {
      btn.textContent = 'Подписаться';
      btn.classList.remove('following');
    });
  } else {
    supabase.from('follows').insert([{ follower_id: currentSession.userId, following_id: userId }]).then(function(res) {
      if (!res.error) {
        btn.textContent = 'Отписаться';
        btn.classList.add('following');
        addGems(currentSession.userId, 0, 'Подписка');
        createNotification(userId, 'follow', null);
      }
    });
  }
}

function saveProfile() {
  if (!checkSession()) return;
  var updates = {
    display_name: document.getElementById('edit-name').value.trim(),
    bio: document.getElementById('edit-bio').value.trim(),
    link: document.getElementById('edit-link').value.trim(),
    location: document.getElementById('edit-location').value.trim()
  };
  
  var uploadFile = function(file, bucket, callback) {
    if (!file) { callback(null); return; }
    var fileName = currentSession.userId + '_' + Date.now() + '_' + file.name;
    supabase.storage.from(bucket).upload(fileName, file).then(function(res) {
      if (res.error) { callback(null); return; }
      callback(supabase.storage.from(bucket).getPublicUrl(fileName).data.publicUrl);
    });
  };
  
  uploadFile(window._newAvatarFile, 'avatars', function(avatarUrl) {
    if (avatarUrl) updates.avatar_url = avatarUrl;
    uploadFile(window._newBannerFile, 'images', function(bannerUrl) {
      if (bannerUrl) updates.banner_url = bannerUrl;
      
      supabase.from('users').update(updates).eq('id', currentSession.userId).then(function(res) {
        if (!res.error) {
          if (updates.display_name) currentUser.display_name = updates.display_name;
          if (updates.avatar_url) currentUser.avatar_url = updates.avatar_url;
          if (updates.banner_url) currentUser.banner_url = updates.banner_url;
          closeEditProfileModal();
          loadProfile(currentSession.userId);
          showToast('Профиль обновлён', 'success');
        }
      });
    });
  });
}

function previewAvatar() {
  var file = document.getElementById('edit-avatar-input').files[0];
  if (file) {
    window._newAvatarFile = file;
    document.getElementById('avatar-preview').innerHTML = '<img src="' + URL.createObjectURL(file) + '" style="width:80px;height:80px;border-radius:50%;object-fit:cover;">';
  }
}

function previewBanner() {
  var file = document.getElementById('edit-banner-input').files[0];
  if (file) {
    window._newBannerFile = file;
    document.getElementById('banner-preview').innerHTML = '<img src="' + URL.createObjectURL(file) + '" style="width:100%;height:80px;object-fit:cover;border-radius:8px;">';
  }
}

// --- Gems система ---
function getGemsBalance(userId, callback) {
  supabase.from('gems').select('balance').eq('user_id', userId).single().then(function(res) {
    if (res.data) callback(res.data.balance);
    else callback(0);
  });
}

function addGems(userId, amount, reason) {
  supabase.from('gems').select('*').eq('user_id', userId).single().then(function(res) {
    var newBalance = amount;
    var totalEarned = amount;
    if (res.data) {
      newBalance = res.data.balance + amount;
      totalEarned = res.data.total_earned + (amount > 0 ? amount : 0);
      supabase.from('gems').update({ balance: newBalance, total_earned: totalEarned }).eq('user_id', userId).then(function() {});
    } else {
      supabase.from('gems').insert([{ user_id: userId, balance: amount, total_earned: amount }]).then(function() {});
    }
    supabase.from('gem_transactions').insert([{ user_id: userId, amount: amount, reason: reason }]).then(function() {});
  });
}

function spendGems(userId, amount, reason, callback) {
  getGemsBalance(userId, function(balance) {
    if (balance < amount) {
      showToast('Недостаточно Gems 💎', 'error');
      if (callback) callback(false);
      return;
    }
    supabase.from('gems').update({ balance: balance - amount }).eq('user_id', userId).then(function() {
      supabase.from('gem_transactions').insert([{ user_id: userId, amount: -amount, reason: reason }]).then(function() {});
      if (callback) callback(true);
    });
  });
}

// --- Магазин ---
function loadShop() {
  if (!checkSession()) return;
  getGemsBalance(currentSession.userId, function(balance) {
    document.getElementById('shop-gems-balance').textContent = balance;
  });
  
  supabase.from('shop_items').select('*').eq('is_active', true).order('sort_order').then(function(res) {
    var container = document.getElementById('shop-items-container');
    container.innerHTML = '';
    if (!res.data || res.data.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-text">Товаров пока нет</div></div>';
      return;
    }
    for (var i = 0; i < res.data.length; i++) {
      var item = res.data[i];
      var card = document.createElement('div');
      card.className = 'shop-item-card';
      card.innerHTML = 
        '<div class="shop-item-info">' +
          '<h4>' + item.name + '</h4>' +
          '<p>' + item.description + '</p>' +
          '<div class="shop-item-price">💎 ' + item.price + '</div>' +
        '</div>' +
        '<button class="shop-item-buy-btn" id="buy-btn-' + item.id + '" onclick="window.buyItem(\'' + item.id + '\', ' + item.price + ', \'' + item.item_type + '\')">Купить</button>';
      container.appendChild(card);
    }
  });
  
  loadInventory();
}

function loadInventory() {
  supabase.from('user_inventory').select('*, shop_items:item_id(*)').eq('user_id', currentSession.userId).then(function(res) {
    var container = document.getElementById('inventory-container');
    container.innerHTML = '';
    if (!res.data || res.data.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-text">Инвентарь пуст</div></div>';
      return;
    }
    for (var i = 0; i < res.data.length; i++) {
      var inv = res.data[i];
      var item = inv.shop_items;
      var div = document.createElement('div');
      div.className = 'inventory-item';
      div.innerHTML = 
        '<span>' + item.name + (inv.is_equipped ? ' ✅' : '') + '</span>' +
        '<button onclick="window.toggleEquip(\'' + inv.id + '\', ' + inv.is_equipped + ', \'' + item.item_type + '\', \'' + item.id + '\')">' + (inv.is_equipped ? 'Снять' : 'Экипировать') + '</button>';
      container.appendChild(div);
    }
  });
}

function buyItem(itemId, price, itemType) {
  if (!checkSession()) return;
  spendGems(currentSession.userId, price, 'Покупка товара', function(success) {
    if (!success) return;
    supabase.from('user_inventory').insert([{ user_id: currentSession.userId, item_id: itemId, is_equipped: false }]).then(function(res) {
      if (res.error) {
        addGems(currentSession.userId, price, 'Возврат за ошибку');
        showToast('Ошибка покупки', 'error');
        return;
      }
      showToast('Покупка успешна!', 'success');
      loadShop();
    });
  });
}

function toggleEquip(inventoryId, currentlyEquipped, itemType, itemId) {
  if (!checkSession()) return;
  if (currentlyEquipped) {
    // Снять
    supabase.from('user_inventory').update({ is_equipped: false }).eq('id', inventoryId).then(function() {
      applyUnequip(itemType);
      loadShop();
    });
  } else {
    // Снять все предметы этого типа
    supabase.from('user_inventory').update({ is_equipped: false }).eq('user_id', currentSession.userId).eq('is_equipped', true).then(function() {
      // Экипировать выбранный
      supabase.from('user_inventory').update({ is_equipped: true }).eq('id', inventoryId).then(function() {
        supabase.from('shop_items').select('*').eq('id', itemId).single().then(function(itemRes) {
          if (itemRes.data) applyEquip(itemType, itemRes.data);
          loadShop();
        });
      });
    });
  }
}

function applyEquip(itemType, itemData) {
  var update = {};
  switch(itemType) {
    case 'nickname_color': update.nickname_color = '#b388ff'; break;
    case 'avatar_frame': update.avatar_frame = 'gold'; break;
    case 'profile_badge': update.profile_badge = '🏅'; break;
    case 'title_prefix': update.title_prefix = '👑'; break;
    case 'animated_banner': update.animated_banner = 'animated'; break;
    case 'verified': update.verified = true; break;
  }
  supabase.from('users').update(update).eq('id', currentSession.userId).then(function() {
    for (var key in update) {
      if (currentUser) currentUser[key] = update[key];
    }
  });
}

function applyUnequip(itemType) {
  var update = {};
  switch(itemType) {
    case 'nickname_color': update.nickname_color = '#ffffff'; break;
    case 'avatar_frame': update.avatar_frame = ''; break;
    case 'profile_badge': update.profile_badge = ''; break;
    case 'title_prefix': update.title_prefix = ''; break;
    case 'animated_banner': update.animated_banner = ''; break;
    case 'verified': update.verified = false; break;
  }
  supabase.from('users').update(update).eq('id', currentSession.userId).then(function() {
    for (var key in update) {
      if (currentUser) currentUser[key] = update[key];
    }
  });
}

// --- Чат ---
function openChatWith(userId) {
  if (!checkSession()) return;
  if (userId === currentSession.userId) { showToast('Нельзя писать себе', 'error'); return; }
  
  supabase.from('users').select('*').eq('id', userId).single().then(function(userRes) {
    if (!userRes.data) return;
    currentChatUser = userRes.data;
    document.getElementById('chat-title').textContent = '💬 ' + userRes.data.display_name;
    
    // Найти или создать чат
    supabase.from('chats').select('*').or('user1_id.eq.' + currentSession.userId + ',user2_id.eq.' + currentSession.userId).then(function(chatRes) {
      var chatId = null;
      if (chatRes.data) {
        for (var i = 0; i < chatRes.data.length; i++) {
          var c = chatRes.data[i];
          if ((c.user1_id === currentSession.userId && c.user2_id === userId) || (c.user1_id === userId && c.user2_id === currentSession.userId)) {
            chatId = c.id;
            break;
          }
        }
      }
      
      if (chatId) {
        currentChatId = chatId;
        openModal('chat-modal');
        loadChatMessages();
      } else {
        supabase.from('chats').insert([{ user1_id: currentSession.userId, user2_id: userId }]).select().single().then(function(newChat) {
          if (newChat.data) {
            currentChatId = newChat.data.id;
            openModal('chat-modal');
            loadChatMessages();
          }
        });
      }
    });
  });
}

function loadChatMessages() {
  if (!currentChatId) return;
  supabase.from('chat_messages').select('*, sender: sender_id(display_name, avatar_url)').eq('chat_id', currentChatId).order('created_at').then(function(res) {
    var container = document.getElementById('chat-messages');
    container.innerHTML = '';
    if (res.data) {
      for (var i = 0; i < res.data.length; i++) {
        renderChatMessage(res.data[i]);
      }
      container.scrollTop = container.scrollHeight;
    }
  });
}

function renderChatMessage(msg) {
  var container = document.getElementById('chat-messages');
  var div = document.createElement('div');
  div.className = 'chat-message ' + (msg.sender_id === currentSession.userId ? 'sent' : 'received');
  div.textContent = msg.text;
  container.appendChild(div);
}

function sendChatMessage() {
  if (!checkSession() || !currentChatId) return;
  var input = document.getElementById('chat-input');
  var text = input.value.trim();
  if (!text) return;
  text = filterBadWords(text);
  
  supabase.from('chat_messages').insert([{ chat_id: currentChatId, sender_id: currentSession.userId, text: text }]).then(function(res) {
    if (!res.error) {
      input.value = '';
      loadChatMessages();
    }
  });
}

function handleChatKey(event) {
  if (event.key === 'Enter') sendChatMessage();
}

function closeChat() {
  closeModal('chat-modal');
  currentChatId = null;
  currentChatUser = null;
}

// --- Уведомления ---
function createNotification(userId, type, chirpId) {
  if (userId === currentSession.userId) return;
  supabase.from('notifications').insert([{
    user_id: userId,
    from_user_id: currentSession.userId,
    type: type,
    chirp_id: chirpId || null,
    text: ''
  }]).then(function() {});
}

// --- Админ-панель ---
function updateAdminButton() {
  var btn = document.getElementById('admin-btn');
  if (currentUser && currentUser.is_admin) {
    btn.style.display = 'block';
  } else {
    btn.style.display = 'none';
  }
}

function showAdminPanel() {
  if (!checkSession() || !currentUser.is_admin) return;
  openModal('admin-modal');
  switchAdminTab('stats');
}

function closeAdminPanel() {
  closeModal('admin-modal');
}

function switchAdminTab(tab) {
  var tabs = document.querySelectorAll('.admin-tab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
  event.target.classList.add('active');
  
  var content = document.getElementById('admin-content');
  
  switch(tab) {
    case 'stats':
      loadAdminStats(content);
      break;
    case 'users':
      loadAdminUsers(content);
      break;
    case 'reports':
      loadAdminReports(content);
      break;
    case 'gems':
      loadAdminGems(content);
      break;
  }
}

function loadAdminStats(container) {
  container.innerHTML = '<div class="loader">Загрузка...</div>';
  var stats = {};
  supabase.from('users').select('id', { count: 'exact' }).then(function(res) {
    stats.users = res.count || 0;
    supabase.from('chirps').select('id', { count: 'exact' }).then(function(res2) {
      stats.chirps = res2.count || 0;
      supabase.from('reports').select('id', { count: 'exact' }).eq('status', 'pending').then(function(res3) {
        stats.reports = res3.count || 0;
        container.innerHTML = 
          '<div class="admin-stat-card"><strong>Пользователи:</strong> ' + stats.users + '</div>' +
          '<div class="admin-stat-card"><strong>Посты:</strong> ' + stats.chirps + '</div>' +
          '<div class="admin-stat-card"><strong>Жалобы (ожидают):</strong> ' + stats.reports + '</div>';
      });
    });
  });
}

function loadAdminUsers(container) {
  container.innerHTML = '<div class="loader">Загрузка...</div>';
  supabase.from('users').select('*').order('created_at', { ascending: false }).limit(50).then(function(res) {
    container.innerHTML = '';
    if (!res.data || res.data.length === 0) return;
    for (var i = 0; i < res.data.length; i++) {
      var user = res.data[i];
      var row = document.createElement('div');
      row.className = 'admin-user-row';
      row.innerHTML = 
        '<span>' + escapeHTML(user.handle) + ' (' + escapeHTML(user.display_name) + ')' + (user.is_banned ? ' 🔴' : '') + '</span>' +
        '<span>' +
          (user.is_banned 
            ? '<button onclick="window.adminUnban(\'' + user.id + '\')" style="margin-right:4px;">Разбанить</button>'
            : '<button onclick="window.adminBan(\'' + user.id + '\')" style="margin-right:4px;color:#ff4757;">Бан</button>') +
          '<button onclick="window.adminWarn(\'' + user.id + '\')">⚠️</button>' +
        '</span>';
      container.appendChild(row);
    }
  });
}

function loadAdminReports(container) {
  container.innerHTML = '<div class="loader">Загрузка...</div>';
  supabase.from('reports').select('*, reporter:reporter_id(handle), reported:reported_user_id(handle)').eq('status', 'pending').order('created_at', { ascending: false }).then(function(res) {
    container.innerHTML = '';
    if (!res.data || res.data.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-text">Нет жалоб</div></div>';
      return;
    }
    for (var i = 0; i < res.data.length; i++) {
      var report = res.data[i];
      var row = document.createElement('div');
      row.className = 'admin-user-row';
      row.innerHTML = 
        '<span>' + (report.reporter ? report.reporter.handle : '?') + ' → ' + (report.reported ? report.reported.handle : '?') + ': ' + escapeHTML(report.reason) + '</span>' +
        '<span>' +
          '<button onclick="window.adminResolveReport(\'' + report.id + '\')">✓</button>' +
          '<button onclick="window.adminDismissReport(\'' + report.id + '\')">✕</button>' +
        '</span>';
      container.appendChild(row);
    }
  });
}

function loadAdminGems(container) {
  container.innerHTML = 
    '<div style="padding:10px;">' +
      '<input type="text" id="admin-gems-handle" placeholder="@handle пользователя" style="width:100%;padding:10px;margin-bottom:8px;background:#0a0a19;border:1px solid rgba(124,77,255,0.2);border-radius:8px;color:#fff;">' +
      '<input type="number" id="admin-gems-amount" placeholder="Количество Gems" style="width:100%;padding:10px;margin-bottom:8px;background:#0a0a19;border:1px solid rgba(124,77,255,0.2);border-radius:8px;color:#fff;">' +
      '<input type="text" id="admin-gems-reason" placeholder="Причина" style="width:100%;padding:10px;margin-bottom:8px;background:#0a0a19;border:1px solid rgba(124,77,255,0.2);border-radius:8px;color:#fff;">' +
      '<button class="btn-primary" onclick="window.adminGiveGems()">Начислить 💎</button>' +
      '<div id="admin-gems-result" style="margin-top:10px;"></div>' +
    '</div>';
}

function adminGiveGems() {
  var handle = document.getElementById('admin-gems-handle').value.trim();
  var amount = parseInt(document.getElementById('admin-gems-amount').value);
  var reason = document.getElementById('admin-gems-reason').value.trim() || 'Админ-начисление';
  
  if (!handle || !amount) {
    showToast('Заполните handle и количество', 'error');
    return;
  }
  
  supabase.from('users').select('id').eq('handle', handle).single().then(function(res) {
    if (!res.data) { showToast('Пользователь не найден', 'error'); return; }
    addGems(res.data.id, amount, reason + ' (админ: ' + currentUser.handle + ')');
    document.getElementById('admin-gems-result').innerHTML = '<span style="color:#2ed573;">✅ Начислено ' + amount + ' 💎 пользователю ' + handle + '</span>';
    showToast('Gems начислены!', 'success');
  });
}

function adminBan(userId) {
  var reason = prompt('Причина бана:');
  if (!reason) return;
  supabase.from('users').update({ is_banned: true, ban_reason: reason }).eq('id', userId).then(function() {
    showToast('Пользователь забанен', 'success');
    loadAdminUsers(document.getElementById('admin-content'));
  });
}

function adminUnban(userId) {
  supabase.from('users').update({ is_banned: false, ban_reason: '' }).eq('id', userId).then(function() {
    showToast('Пользователь разбанен', 'success');
    loadAdminUsers(document.getElementById('admin-content'));
  });
}

function adminWarn(userId) {
  supabase.from('admin_messages').insert([{ admin_id: currentSession.userId, user_id: userId, message: 'Предупреждение от администратора' }]).then(function() {
    createNotification(userId, 'admin', null);
    showToast('Предупреждение отправлено', 'success');
  });
}

function adminResolveReport(reportId) {
  supabase.from('reports').update({ status: 'resolved' }).eq('id', reportId).then(function() {
    showToast('Жалоба решена', 'success');
    loadAdminReports(document.getElementById('admin-content'));
  });
}

function adminDismissReport(reportId) {
  supabase.from('reports').update({ status: 'dismissed' }).eq('id', reportId).then(function() {
    showToast('Жалоба отклонена', 'success');
    loadAdminReports(document.getElementById('admin-content'));
  });
}

// --- Бесконечная прокрутка ---
function setupInfiniteScroll() {
  var content = document.getElementById('main-content');
  content.addEventListener('scroll', function() {
    if (currentTab !== 'home') return;
    var scrollTop = content.scrollTop;
    var scrollHeight = content.scrollHeight;
    var clientHeight = content.clientHeight;
    if (scrollHeight - scrollTop - clientHeight < 200 && !feedLoading && feedHasMore) {
      loadFeed();
    }
  });
}

// --- Realtime подписка ---
function setupRealtime() {
  initSupabase();
  
  supabase.channel('nobuqr-realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chirps' }, function(payload) {
      if (currentTab === 'home' && currentFeed === 'latest') {
        feedPage = 0;
        feedHasMore = true;
        document.getElementById('feed-container').innerHTML = '';
        loadFeed();
        showToast('Новый пост! 🐦', 'info');
      }
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, function(payload) {
      if (payload.new && payload.new.user_id === currentSession.userId) {
        showToast('Новое уведомление! 🔔', 'info');
      }
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, function(payload) {
      if (currentChatId && payload.new && payload.new.chat_id === currentChatId && payload.new.sender_id !== currentSession.userId) {
        renderChatMessage(payload.new);
        var container = document.getElementById('chat-messages');
        container.scrollTop = container.scrollHeight;
      }
    })
    .subscribe();
}

// --- Инициализация ---
function initApp() {
  initSupabase();
  
  if (loadSession()) {
    // Загружаем полные данные пользователя
    supabase.from('users').select('*').eq('id', currentSession.userId).single().then(function(res) {
      if (res.data) {
        currentUser = res.data;
        if (currentUser.is_banned) {
          clearSession();
          showAuthScreen();
          showToast('Ваш аккаунт заблокирован', 'error');
          return;
        }
        showAppScreen();
        switchTab('home');
        loadFeed();
        updateAdminButton();
        setupRealtime();
      } else {
        clearSession();
        showAuthScreen();
      }
    });
  } else {
    showAuthScreen();
  }
  
  setupInfiniteScroll();
}

// --- Ежедневный бонус ---
function checkDailyBonus() {
  if (!currentSession) return;
  var lastBonus = localStorage.getItem('nob_daily_bonus');
  var today = new Date().toDateString();
  if (lastBonus !== today) {
    addGems(currentSession.userId, 5, 'Ежедневный бонус');
    localStorage.setItem('nob_daily_bonus', today);
    showToast('Ежедневный бонус: +5 💎!', 'success');
  }
}

// --- Глобальные функции (для onclick) ---
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.showLogin = showLogin;
window.showRegister = showRegister;
window.logout = logout;
window.switchTab = switchTab;
window.switchFeed = switchFeed;
window.openCreateModal = openCreateModal;
window.closeCreateModal = closeCreateModal;
window.updateCharCount = updateCharCount;
window.createChirp = createChirp;
window.handleMediaSelect = handleMediaSelect;
window.toggleLike = toggleLike;
window.rechirp = rechirp;
window.deleteChirp = deleteChirp;
window.openComments = openComments;
window.handleSearch = handleSearch;
window.searchHashtag = searchHashtag;
window.openUserProfile = openUserProfile;
window.openUserByHandle = openUserByHandle;
window.closeUserProfile = closeUserProfile;
window.toggleFollow = toggleFollow;
window.openEditProfileModal = openEditProfileModal;
window.closeEditProfileModal = closeEditProfileModal;
window.saveProfile = saveProfile;
window.previewAvatar = previewAvatar;
window.previewBanner = previewBanner;
window.loadProfile = loadProfile;
window.buyItem = buyItem;
window.toggleEquip = toggleEquip;
window.openChatWith = openChatWith;
window.sendChatMessage = sendChatMessage;
window.handleChatKey = handleChatKey;
window.closeChat = closeChat;
window.showAdminPanel = showAdminPanel;
window.closeAdminPanel = closeAdminPanel;
window.switchAdminTab = switchAdminTab;
window.adminGiveGems = adminGiveGems;
window.adminBan = adminBan;
window.adminUnban = adminUnban;
window.adminWarn = adminWarn;
window.adminResolveReport = adminResolveReport;
window.adminDismissReport = adminDismissReport;
window.showTOS = showTOS;
window.closeTOS = closeTOS;
window.showPrivacy = showPrivacy;
window.closePrivacy = closePrivacy;
window.openDiscord = openDiscord;

// --- Запуск ---
document.addEventListener('DOMContentLoaded', function() {
  initApp();
  setTimeout(function() {
    if (currentSession) checkDailyBonus();
  }, 2000);
});