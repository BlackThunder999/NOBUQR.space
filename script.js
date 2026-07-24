// ==========================================
//  NOBUQR.SPACE — ГЛАВНЫЙ СКРИПТ
// ==========================================

// Глобальные переменные
var supabase;               // Клиент базы данных
var currentUser = null;     // Текущий пользователь
var lastPostTime = 0;       // Время последнего поста (антиспам)
var lastCommentTime = 0;    // Время последнего комментария
var lastPostText = '';      // Текст последнего поста
var lastCommentText = '';   // Текст последнего комментария
var adminHash = '';         // Хеш пароля администратора

// ==========================================
//  ИНИЦИАЛИЗАЦИЯ
// ==========================================
(function init() {
  // Подключаем Supabase
  supabase = window.supabase.createClient(
    'https://iljsednetiogjtowlexo.supabase.co',
    'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O'
  );

  // Вычисляем хеш пароля админа (в коде пароля нет!)
  sha256('N0buSp@ce2024').then(function(hash) {
    adminHash = hash;
  });

  // Проверяем существующую сессию
  checkExistingSession();
})();

// ==========================================
//  КРИПТОГРАФИЯ
// ==========================================

// SHA-256 хеширование
function sha256(str) {
  var buffer = new TextEncoder().encode(str);
  return crypto.subtle.digest('SHA-256', buffer).then(function(hash) {
    return Array.from(new Uint8Array(hash)).map(function(b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  });
}

// Генерация случайной соли (16 символов)
function generateSalt() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var salt = '';
  for (var i = 0; i < 16; i++) {
    salt += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return salt;
}

// Хеширование пароля с солью
function hashPassword(password, salt) {
  return sha256(password + salt);
}

// ==========================================
//  СЕССИИ (localStorage, 24 часа)
// ==========================================

function checkExistingSession() {
  var sessionData = localStorage.getItem('nobuqr_session');
  if (sessionData) {
    try {
      var session = JSON.parse(sessionData);
      if (session.userId && session.expires && Date.now() < session.expires) {
        // Сессия жива — загружаем пользователя
        loadUserProfile(session.userId);
      } else {
        // Истекла
        localStorage.removeItem('nobuqr_session');
        showAuthScreen();
      }
    } catch (e) {
      localStorage.removeItem('nobuqr_session');
      showAuthScreen();
    }
  } else {
    showAuthScreen();
  }
}

function saveSession(userId) {
  var expires = Date.now() + 24 * 60 * 60 * 1000; // 24 часа
  localStorage.setItem('nobuqr_session', JSON.stringify({
    userId: userId,
    expires: expires
  }));
}

function clearSession() {
  localStorage.removeItem('nobuqr_session');
}

// ==========================================
//  ЭКРАНЫ
// ==========================================

function showAuthScreen() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('main-app').style.display = 'none';
}

function showMainApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('main-app').style.display = 'flex';
  switchScreen('home');
}

function switchScreen(screenName) {
  var screens = document.querySelectorAll('.screen');
  for (var i = 0; i < screens.length; i++) {
    screens[i].classList.remove('active');
  }
  document.getElementById('screen-' + screenName).classList.add('active');
  if (screenName === 'home') {
    loadFeed();
  }
}

// ==========================================
//  МОДАЛЬНЫЕ ОКНА
// ==========================================

function openModal(id) {
  document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

// ==========================================
//  ЗАЩИТА ОТ СПАМА
// ==========================================

function containsAds(text) {
  var adWords = [
    'купить', 'продам', 'скидка', 'реклама', 'заходи',
    'дешево', 'заработок', 'бизнес', 'раскрутка', 'накрутка'
  ];
  var lower = text.toLowerCase();
  for (var i = 0; i < adWords.length; i++) {
    if (lower.indexOf(adWords[i]) !== -1) {
      return true;
    }
  }
  return false;
}

function hasURL(text) {
  return /https?:\/\/\S+/i.test(text);
}

function hasRepeatingChars(text, maxRepeat) {
  if (!text) return false;
  var count = 1;
  for (var i = 1; i < text.length; i++) {
    if (text[i].toLowerCase() === text[i - 1].toLowerCase()) {
      count++;
      if (count > maxRepeat) return true;
    } else {
      count = 1;
    }
  }
  return false;
}

function validatePostText(text) {
  if (!text || text.trim().length === 0) return '';
  text = text.trim();
  if (text.length < 2) return 'Текст слишком короткий';
  if (hasRepeatingChars(text, 5)) return 'Слишком много повторяющихся символов';
  return '';
}

// ==========================================
//  РЕГИСТРАЦИЯ (сразу входит в аккаунт)
// ==========================================

function registerAndLogin() {
  // Проверка чекбокса согласия
  var agreeCheckbox = document.getElementById('agree-checkbox');
  if (!agreeCheckbox || !agreeCheckbox.checked) {
    alert('Необходимо согласиться с условиями, политикой и правилами');
    return;
  }

  // Собираем данные
  var email = document.getElementById('reg-email').value.trim();
  var nickname = document.getElementById('reg-nickname').value.trim();
  var password = document.getElementById('reg-password').value;
  var birthdate = document.getElementById('reg-birthdate').value;

  // Проверка заполнения
  if (!email || !nickname || !password || !birthdate) {
    alert('Заполните все поля');
    return;
  }

  // Проверка возраста
  var age = calculateAge(birthdate);
  if (age < 10) {
    alert('Вам должно быть не менее 10 лет');
    return;
  }

  // Проверка мата в никнейме
  if (containsBadWords(nickname)) {
    alert('Никнейм содержит недопустимые слова');
    return;
  }

  // Получаем IP
  getIP(function(ip) {
    // Проверка бана IP
    supabase.from('banned_ips')
      .select('*')
      .eq('ip', ip)
      .gt('banned_until', new Date().toISOString())
      .then(function(banResult) {
        if (banResult.data && banResult.data.length > 0) {
          alert('Регистрация с вашего IP временно запрещена');
          return;
        }

        // Проверка занятости email
        supabase.from('users')
          .select('id')
          .eq('email', email)
          .single()
          .then(function(checkResult) {
            if (checkResult.data) {
              alert('Этот email уже зарегистрирован');
              return;
            }

            // Генерируем соль и хеш
            var salt = generateSalt();
            hashPassword(password, salt).then(function(hashedPassword) {
              // Создаём пользователя
              supabase.from('users').insert({
                email: email,
                nickname: nickname,
                password: hashedPassword,
                salt: salt,
                birth_date: birthdate,
                ip: ip,
                verified: false
              }).then(function(insertResult) {
                if (insertResult.error) {
                  alert('Ошибка регистрации: ' + insertResult.error.message);
                  return;
                }

                // Сразу входим — ищем созданного пользователя
                supabase.from('users')
                  .select('*')
                  .eq('email', email)
                  .single()
                  .then(function(userResult) {
                    if (userResult.error || !userResult.data) {
                      alert('Ошибка входа после регистрации');
                      return;
                    }

                    // Устанавливаем сессию
                    currentUser = userResult.data;
                    saveSession(currentUser.id);

                    // Закрываем модалку и показываем приложение
                    closeModal('register-modal');
                    showMainApp();
                    loadFeed();

                    alert('Добро пожаловать, ' + currentUser.nickname + '!');
                  });
              });
            });
          });
      });
  });
}

// ==========================================
//  ВХОД
// ==========================================

function login() {
  var email = document.getElementById('login-email').value.trim();
  var password = document.getElementById('login-password').value;

  if (!email || !password) {
    alert('Введите email и пароль');
    return;
  }

  getIP(function(ip) {
    // Проверка бана IP
    supabase.from('banned_ips')
      .select('*')
      .eq('ip', ip)
      .gt('banned_until', new Date().toISOString())
      .then(function(banResult) {
        if (banResult.data && banResult.data.length > 0) {
          alert('Ваш IP заблокирован');
          return;
        }

        // Ищем пользователя по email
        supabase.from('users')
          .select('*')
          .eq('email', email)
          .single()
          .then(function(userResult) {
            if (userResult.error || !userResult.data) {
              alert('Неверный email или пароль');
              return;
            }

            var user = userResult.data;

            // Проверяем пароль через хеш с солью
            hashPassword(password, user.salt).then(function(hashedInput) {
              if (hashedInput !== user.password) {
                alert('Неверный email или пароль');
                return;
              }

              // Проверка бана аккаунта
              if (user.banned_until && new Date(user.banned_until) > new Date()) {
                alert('Ваш аккаунт заблокирован до ' + new Date(user.banned_until).toLocaleString());
                return;
              }

              // Обновляем IP
              supabase.from('users')
                .update({ ip: ip })
                .eq('id', user.id)
                .then(function() {});

              // Успешный вход
              currentUser = user;
              saveSession(user.id);
              closeModal('login-modal');
              showMainApp();
              loadFeed();
            });
          });
      });
  });
}

// ==========================================
//  ВЫХОД
// ==========================================

function logout() {
  clearSession();
  currentUser = null;
  showAuthScreen();
}

// ==========================================
//  ПОСТЫ
// ==========================================

function openPostModal() {
  if (!currentUser) return;

  // Сбрасываем поля
  document.getElementById('post-text').value = '';
  document.getElementById('post-preview').innerHTML = '';
  document.getElementById('post-spam-warning').style.display = 'none';

  // Показываем или скрываем загрузку медиа
  var mediaArea = document.getElementById('media-upload-area');
  var age = calculateAge(currentUser.birth_date);
  if (age >= 18) {
    mediaArea.innerHTML = '' +
      '<div class="file-upload">' +
      '  <label>Фото <input type="file" id="post-image" accept="image/*" onchange="previewMedia(\'image\')"></label>' +
      '  <label>Видео <input type="file" id="post-video" accept="video/*" onchange="previewMedia(\'video\')"></label>' +
      '</div>';
  } else {
    mediaArea.innerHTML = '<p style="color:#ffd700; font-size:0.8rem;">Загрузка фото и видео доступна только с 18 лет</p>';
  }

  openModal('post-modal');
}

function previewMedia(type) {
  var input = document.getElementById('post-' + type);
  var previewDiv = document.getElementById('post-preview');
  if (input && input.files && input.files[0]) {
    var file = input.files[0];
    var url = URL.createObjectURL(file);
    if (type === 'image') {
      previewDiv.innerHTML = '<img src="' + url + '" style="max-width:100%; border-radius:10px;">';
    } else {
      previewDiv.innerHTML = '<video src="' + url + '" controls style="max-width:100%; border-radius:10px;"></video>';
    }
  }
}

function createChirp() {
  if (!currentUser) return;

  var text = document.getElementById('post-text').value.trim();
  var imageFile = document.getElementById('post-image') ? document.getElementById('post-image').files[0] : null;
  var videoFile = document.getElementById('post-video') ? document.getElementById('post-video').files[0] : null;

  // Пустой пост
  if (!text && !imageFile && !videoFile) {
    alert('Пост не может быть пустым');
    return;
  }

  // Проверка на спам
  if (text) {
    var spamError = validatePostText(text);
    if (spamError) {
      document.getElementById('post-spam-warning').textContent = spamError;
      document.getElementById('post-spam-warning').style.display = 'block';
      return;
    }
  }

  // Одинаковый пост подряд
  if (text && text === lastPostText) {
    document.getElementById('post-spam-warning').textContent = 'Нельзя отправлять одинаковые посты подряд';
    document.getElementById('post-spam-warning').style.display = 'block';
    return;
  }

  // Лимит 30 секунд
  var now = Date.now();
  if (now - lastPostTime < 30000) {
    alert('Подождите 30 секунд перед следующим постом');
    return;
  }

  // Длина текста
  if (text.length > 280) {
    alert('Текст слишком длинный (максимум 280 символов)');
    return;
  }

  // Фильтры
  text = filterBadWords(text);
  text = filterContactInfo(text);

  // Запрет рекламы для неверифицированных
  if (!currentUser.verified && (hasURL(text) || containsAds(text))) {
    document.getElementById('post-spam-warning').textContent = 'Реклама и ссылки запрещены. Пройдите верификацию.';
    document.getElementById('post-spam-warning').style.display = 'block';
    return;
  }

  // Загрузка медиа
  var uploadPromise = Promise.resolve({ image_url: null, video_url: null });
  if (imageFile) {
    uploadPromise = uploadMedia(imageFile, 'images');
  } else if (videoFile) {
    uploadPromise = uploadMedia(videoFile, 'videos');
  }

  uploadPromise.then(function(urls) {
    supabase.from('chirps').insert({
      user_id: currentUser.id,
      text: text,
      image_url: urls.image_url,
      video_url: urls.video_url
    }).then(function(result) {
      if (result.error) {
        alert('Ошибка публикации: ' + result.error.message);
        return;
      }

      // Успешно
      lastPostTime = Date.now();
      lastPostText = text;
      document.getElementById('post-spam-warning').style.display = 'none';
      closeModal('post-modal');
      loadFeed();
    });
  }).catch(function(error) {
    alert('Ошибка загрузки медиа: ' + error.message);
  });
}

function uploadMedia(file, bucket) {
  var fileExt = file.name.split('.').pop();
  var fileName = Date.now() + '_' + Math.random().toString(36).substring(2) + '.' + fileExt;

  return supabase.storage.from(bucket).upload(fileName, file, {
    cacheControl: '3600',
    upsert: false
  }).then(function(uploadResult) {
    if (uploadResult.error) throw uploadResult.error;
    var publicUrl = supabase.storage.from(bucket).getPublicUrl(fileName).data.publicUrl;
    var result = {};
    if (bucket === 'images') {
      result.image_url = publicUrl;
    } else {
      result.video_url = publicUrl;
    }
    return result;
  });
}

// ==========================================
//  ЛЕНТА
// ==========================================

function loadFeed() {
  if (!currentUser) return;

  supabase.from('chirps')
    .select('*, users!inner(nickname, verified)')
    .order('created_at', { ascending: false })
    .then(function(result) {
      if (result.error) {
        alert('Ошибка загрузки ленты: ' + result.error.message);
        return;
      }
      renderChirps(result.data, 'screen-home');
    });
}

function renderChirps(chirps, containerId) {
  var container = document.getElementById(containerId);
  container.innerHTML = '';

  if (!chirps || chirps.length === 0) {
    container.innerHTML = '<p style="color:#6a5d8a; text-align:center; padding:40px;">Пока ничего нет. Будьте первым!</p>';
    return;
  }

  for (var i = 0; i < chirps.length; i++) {
    (function(chirp) {
      var card = document.createElement('div');
      card.className = 'chirp-card';

      // Собираем HTML карточки
      var idSpan = '<span class="chirp-id">ID: ' + chirp.id.substring(0, 8) + '</span>';

      var header = '' +
        '<div class="chirp-header">' +
        '  <div class="chirp-avatar">' + chirp.users.nickname.charAt(0).toUpperCase() + '</div>' +
        '  <div>' +
        '    <span class="chirp-nickname">' + chirp.users.nickname + '</span>' +
        (chirp.users.verified ? '<span class="verified-badge">✓</span>' : '') +
        '  </div>' +
        '</div>';

      var textHtml = '<div class="chirp-text">' + hashtagLinks(chirp.text) + '</div>';

      var mediaHtml = '';
      if (chirp.image_url) {
        mediaHtml += '<div class="chirp-media"><img src="' + chirp.image_url + '" alt="Изображение"></div>';
      }
      if (chirp.video_url) {
        mediaHtml += '<div class="chirp-media"><video src="' + chirp.video_url + '" controls></video></div>';
      }

      var actions = '' +
        '<div class="chirp-actions">' +
        '  <span onclick="likeChirp(\'' + chirp.id + '\', this)">❤️ <span class="like-count">0</span></span>' +
        '  <span onclick="openComments(\'' + chirp.id + '\')">💬 0</span>' +
        '  <span onclick="openReport(\'' + chirp.id + '\')">⚠️</span>' +
        '</div>';

      card.innerHTML = idSpan + header + textHtml + mediaHtml + actions;
      container.appendChild(card);

      // Обновляем счётчики
      updateCounts(chirp.id, card);
      // Проверяем лайк
      checkIfLiked(chirp.id, card.querySelector('.chirp-actions span'));
    })(chirps[i]);
  }
}

function updateCounts(chirpId, card) {
  // Лайки
  supabase.from('likes')
    .select('id', { count: 'exact' })
    .eq('chirp_id', chirpId)
    .then(function(result) {
      var countSpan = card.querySelector('.like-count');
      if (countSpan) countSpan.textContent = result.count;
    });

  // Комментарии
  supabase.from('comments')
    .select('id', { count: 'exact' })
    .eq('chirp_id', chirpId)
    .then(function(result) {
      var commentSpan = card.querySelectorAll('.chirp-actions span')[1];
      if (commentSpan) commentSpan.innerHTML = '💬 ' + result.count;
    });
}

function hashtagLinks(text) {
  return text.replace(/#(\w+)/g, '<span style="color:#b388ff; cursor:pointer;" onclick="searchHashtag(\'$1\')">#$1</span>');
}

function searchHashtag(tag) {
  switchScreen('search');
  document.getElementById('search-input').value = '#' + tag;
  onSearchInput();
}

// ==========================================
//  ЛАЙКИ
// ==========================================

function likeChirp(chirpId, element) {
  if (!currentUser) return;

  // Проверяем, есть ли уже лайк
  supabase.from('likes')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('chirp_id', chirpId)
    .single()
    .then(function(result) {
      if (result.data) {
        // Удалить лайк
        supabase.from('likes')
          .delete()
          .eq('id', result.data.id)
          .then(function() {
            updateLikeDisplay(chirpId, element);
          });
      } else {
        // Добавить лайк
        supabase.from('likes')
          .insert({
            user_id: currentUser.id,
            chirp_id: chirpId
          })
          .then(function() {
            updateLikeDisplay(chirpId, element);
          });
      }
    });
}

function updateLikeDisplay(chirpId, element) {
  supabase.from('likes')
    .select('id', { count: 'exact' })
    .eq('chirp_id', chirpId)
    .then(function(result) {
      var countSpan = element.querySelector('.like-count');
      if (countSpan) countSpan.textContent = result.count;

      // Проверяем, лайкнул ли текущий пользователь
      supabase.from('likes')
        .select('id')
        .eq('user_id', currentUser.id)
        .eq('chirp_id', chirpId)
        .single()
        .then(function(likeResult) {
          if (likeResult.data) {
            element.classList.add('liked');
          } else {
            element.classList.remove('liked');
          }
        });
    });
}

function checkIfLiked(chirpId, element) {
  if (!currentUser) return;
  supabase.from('likes')
    .select('id')
    .eq('user_id', currentUser.id)
    .eq('chirp_id', chirpId)
    .single()
    .then(function(result) {
      if (result.data) {
        element.classList.add('liked');
      }
    });
}

// ==========================================
//  КОММЕНТАРИИ
// ==========================================

function openComments(chirpId) {
  if (!currentUser) return;
  window.currentChirpId = chirpId;
  document.getElementById('comment-input').value = '';
  loadComments(chirpId);
  openModal('comments-modal');
}

function loadComments(chirpId) {
  supabase.from('comments')
    .select('*, users(nickname)')
    .eq('chirp_id', chirpId)
    .order('created_at', { ascending: true })
    .then(function(result) {
      var list = document.getElementById('comments-list');
      list.innerHTML = '';
      if (result.data) {
        for (var i = 0; i < result.data.length; i++) {
          var comment = result.data[i];
          var div = document.createElement('div');
          div.style.marginBottom = '8px';
          div.innerHTML = '<b>' + comment.users.nickname + '</b>: ' + comment.text;
          list.appendChild(div);
        }
      }
    });
}

function submitComment() {
  var text = document.getElementById('comment-input').value.trim();
  if (!text) return;

  supabase.from('comments')
    .insert({
      chirp_id: window.currentChirpId,
      user_id: currentUser.id,
      text: text
    })
    .then(function(result) {
      if (result.error) {
        alert('Ошибка: ' + result.error.message);
      } else {
        document.getElementById('comment-input').value = '';
        loadComments(window.currentChirpId);
      }
    });
}

// ==========================================
//  ЖАЛОБЫ
// ==========================================

function openReport(chirpId) {
  if (!currentUser) return;
  window.reportChirpId = chirpId;
  document.getElementById('report-reason').value = '';
  openModal('report-modal');
}

function submitReport() {
  var reason = document.getElementById('report-reason').value.trim();
  if (!reason) return;

  supabase.from('reports')
    .insert({
      chirp_id: window.reportChirpId,
      reporter_id: currentUser.id,
      reason: reason
    })
    .then(function(result) {
      if (result.error) {
        alert('Ошибка отправки жалобы');
      } else {
        alert('Жалоба отправлена');
        closeModal('report-modal');
      }
    });
}

// ==========================================
//  ПОИСК
// ==========================================

function onSearchInput() {
  var query = document.getElementById('search-input').value.trim();
  if (!query || !query.startsWith('#')) {
    document.getElementById('search-results').innerHTML = '';
    return;
  }

  var tag = query.substring(1);
  supabase.from('chirps')
    .select('*, users!inner(nickname, verified)')
    .ilike('text', '%#' + tag + '%')
    .order('created_at', { ascending: false })
    .then(function(result) {
      if (result.data) {
        renderChirps(result.data, 'search-results');
      }
    });
}

// ==========================================
//  ПРОФИЛЬ
// ==========================================

function showProfile(userId) {
  if (!currentUser) return;

  supabase.from('users')
    .select('*')
    .eq('id', userId)
    .single()
    .then(function(userResult) {
      if (userResult.error || !userResult.data) return;

      var user = userResult.data;
      var age = calculateAge(user.birth_date);

      var profileScreen = document.getElementById('screen-profile');
      profileScreen.innerHTML = '' +
        '<div class="premium-card" style="text-align:center;">' +
        '  <div class="chirp-avatar" style="width:60px; height:60px; font-size:1.5rem; margin:0 auto 10px;">' +
        user.nickname.charAt(0).toUpperCase() +
        '  </div>' +
        '  <h2>' + user.nickname +
        (user.verified ? ' <span class="verified-badge">✓</span>' : '') +
        '  </h2>' +
        '  <p style="color:#6a5d8a;">Возраст: ' + age + ' лет</p>' +
        '</div>' +
        '<div id="profile-chirps"></div>';

      switchScreen('profile');

      // Загружаем посты пользователя
      supabase.from('chirps')
        .select('*, users!inner(nickname, verified)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .then(function(chirpsResult) {
          renderChirps(chirpsResult.data, 'profile-chirps');
        });
    });
}

// ==========================================
//  АДМИН-ПАНЕЛЬ
// ==========================================

function openAdminAccess() {
  document.getElementById('admin-pass-input').value = '';
  openModal('admin-login-modal');
}

function adminLogin() {
  var inputPassword = document.getElementById('admin-pass-input').value;

  sha256(inputPassword).then(function(hash) {
    if (hash === adminHash) {
      closeModal('admin-login-modal');
      openModal('admin-panel-modal');
      switchAdminTab('users');
    } else {
      alert('Неверный пароль администратора');
    }
  });
}

function switchAdminTab(tab) {
  var content = document.getElementById('admin-tab-content');

  if (tab === 'users') {
    content.innerHTML = '' +
      '<input type="text" id="admin-user-search" class="input-dark" placeholder="Поиск по никнейму или email" oninput="adminSearchUsers()">' +
      '<div id="admin-users-list"></div>';
    adminSearchUsers();
  } else if (tab === 'reports') {
    content.innerHTML = '<div id="admin-reports-list"></div>';
    loadAdminReports();
  } else if (tab === 'messages') {
    content.innerHTML = '<div id="admin-messages-list"></div>';
    loadAdminMessages();
  }
}

function adminSearchUsers() {
  var query = document.getElementById('admin-user-search')
    ? document.getElementById('admin-user-search').value.trim()
    : '';

  var request = supabase.from('users').select('*').order('created_at');
  if (query) {
    request = request.or('nickname.ilike.%' + query + '%,email.ilike.%' + query + '%');
  }

  request.then(function(result) {
    var list = document.getElementById('admin-users-list');
    list.innerHTML = '';

    if (result.data) {
      for (var i = 0; i < result.data.length; i++) {
        var user = result.data[i];
        var age = calculateAge(user.birth_date);

        var div = document.createElement('div');
        div.style.cssText = 'border-bottom:1px solid rgba(140,100,255,0.1); padding:8px;';
        div.innerHTML = '' +
          '<b>' + user.nickname + '</b> ' +
          '(' + user.email + ') ' +
          'Возраст: ' + age + ' ' +
          '<button class="btn-danger-sm" onclick="destroyAccount(\'' + user.id + '\')">Снос аккаунта</button>';

        list.appendChild(div);
      }
    }
  });
}

function destroyAccount(userId) {
  if (!confirm('Вы уверены? Аккаунт будет полностью уничтожен, все посты удалены, IP забанен навсегда.')) return;

  supabase.from('users')
    .select('ip')
    .eq('id', userId)
    .single()
    .then(function(userResult) {
      var ip = userResult.data ? userResult.data.ip : null;

      // 1. Бан аккаунта навсегда
      supabase.from('users')
        .update({ banned_until: new Date('2099-01-01').toISOString() })
        .eq('id', userId)
        .then(function() {
          // 2. Бан IP
          if (ip) {
            supabase.from('banned_ips')
              .insert({
                ip: ip,
                reason: 'Снос аккаунта #' + userId,
                banned_until: new Date('2099-01-01').toISOString()
              })
              .then(function() {});
          }

          // 3. Удаление всех постов
          supabase.from('chirps')
            .delete()
            .eq('user_id', userId)
            .then(function() {
              alert('Аккаунт уничтожен');
              adminSearchUsers();
            });
        });
    });
}

function deleteChirpById() {
  var id = document.getElementById('delete-post-id').value.trim();
  if (!id) return;

  supabase.from('chirps')
    .delete()
    .eq('id', id)
    .then(function(result) {
      if (result.error) {
        alert('Ошибка удаления: ' + result.error.message);
      } else {
        alert('Пост ' + id + ' удалён');
        document.getElementById('delete-post-id').value = '';
      }
    });
}

function loadAdminReports() {
  supabase.from('reports')
    .select('*, chirps(text, id), users!reporter_id(nickname)')
    .order('created_at', { ascending: false })
    .then(function(result) {
      var list = document.getElementById('admin-reports-list');
      list.innerHTML = '';

      if (result.data) {
        for (var i = 0; i < result.data.length; i++) {
          var report = result.data[i];
          var div = document.createElement('div');
          div.style.cssText = 'border-bottom:1px solid rgba(140,100,255,0.1); padding:8px;';
          div.innerHTML = '' +
            '<b>От:</b> ' + report.users.nickname + '<br>' +
            '<b>Пост:</b> ' + (report.chirps ? report.chirps.text : 'удалён') + '<br>' +
            '<b>Причина:</b> ' + report.reason + '<br>' +
            '<button class="btn-danger-sm" onclick="deleteChirp(\'' + report.chirp_id + '\')">Удалить пост</button>';

          list.appendChild(div);
        }
      }
    });
}

function deleteChirp(chirpId) {
  supabase.from('chirps')
    .delete()
    .eq('id', chirpId)
    .then(function() {
      alert('Пост удалён');
      loadAdminReports();
    });
}

function loadAdminMessages() {
  supabase.from('admin_messages')
    .select('*, users(nickname)')
    .order('created_at', { ascending: false })
    .then(function(result) {
      var list = document.getElementById('admin-messages-list');
      list.innerHTML = '';

      if (result.data) {
        for (var i = 0; i < result.data.length; i++) {
          var msg = result.data[i];
          var div = document.createElement('div');
          div.style.cssText = 'border-bottom:1px solid rgba(140,100,255,0.1); padding:8px;';
          div.innerHTML = '<b>От:</b> ' + msg.users.nickname + '<br>' + msg.message;
          list.appendChild(div);
        }
      }
    });
}

// ==========================================
//  ДОКУМЕНТЫ
// ==========================================

function openDoc(type) {
  var docText = '';

  if (type === 'terms') {
    docText = '' +
      '<h2>Условия использования</h2>' +
      '<p><b>1.</b> Сервис предназначен для лиц от 10 лет. Загрузка медиа — строго с 18 лет.</p>' +
      '<p><b>2.</b> Запрещены оскорбления, спам, порнография, насилие, экстремизм.</p>' +
      '<p><b>3.</b> Администрация вправе удалять контент и блокировать аккаунты без объяснения причин.</p>' +
      '<p><b>4.</b> Сервис предоставляется «как есть». Администрация не несёт ответственности за ущерб.</p>' +
      '<p><b>5.</b> Вы отказываетесь от судебных исков к владельцам сервиса.</p>';
  } else if (type === 'privacy') {
    docText = '' +
      '<h2>Политика конфиденциальности</h2>' +
      '<p><b>1.</b> Собираем: email, никнейм, дату рождения, IP-адрес.</p>' +
      '<p><b>2.</b> Пароль хранится в виде хеша SHA-256 с уникальной солью.</p>' +
      '<p><b>3.</b> Данные не передаются третьим лицам.</p>' +
      '<p><b>4.</b> Серверы расположены в Европе (Supabase).</p>' +
      '<p><b>5.</b> Вы можете запросить удаление данных: nobuqrspaceeee@outlook.com</p>';
  } else if (type === 'rules') {
    docText = '' +
      '<h2>Правила сообщества</h2>' +
      '<ol>' +
      '<li>Уважайте других пользователей</li>' +
      '<li>Запрещён контент 18+</li>' +
      '<li>Запрещён спам и реклама без верификации</li>' +
      '<li>Запрещены призывы к насилию</li>' +
      '<li>Запрещён обход бана (карается сносом)</li>' +
      '<li>Медиа только с 18 лет</li>' +
      '<li>3 предупреждения = бан на 24 часа</li>' +
      '</ol>' +
      '<p>Контакты: nobuqrspaceeee@outlook.com</p>';
  }

  document.getElementById('doc-text').innerHTML = docText;
  openModal('doc-modal');
}

// ==========================================
//  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================

function calculateAge(birthDateStr) {
  var birth = new Date(birthDateStr);
  var now = new Date();
  var age = now.getFullYear() - birth.getFullYear();
  var monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function containsBadWords(text) {
  var badWords = ['бля', 'хуй', 'пизд', 'ебан', 'залуп'];
  for (var i = 0; i < badWords.length; i++) {
    if (text.toLowerCase().indexOf(badWords[i]) !== -1) return true;
  }
  return false;
}

function filterBadWords(text) {
  var badWords = ['бля', 'хуй', 'пизд', 'ебан', 'залуп'];
  for (var i = 0; i < badWords.length; i++) {
    var regex = new RegExp(badWords[i], 'gi');
    text = text.replace(regex, '***');
  }
  return text;
}

function filterContactInfo(text) {
  text = text.replace(/\+?\d{10,}/g, '[номер скрыт]');
  text = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email скрыт]');
  return text;
}

function getIP(callback) {
  fetch('https://api.ipify.org?format=json')
    .then(function(response) { return response.json(); })
    .then(function(data) { callback(data.ip); })
    .catch(function() { callback('0.0.0.0'); });
}

function loadUserProfile(userId) {
  supabase.from('users')
    .select('*')
    .eq('id', userId)
    .single()
    .then(function(result) {
      if (result.error || !result.data) {
        clearSession();
        showAuthScreen();
        return;
      }
      currentUser = result.data;
      showMainApp();
      loadFeed();
    });
}

// ==========================================
//  ГЛОБАЛЬНЫЕ ФУНКЦИИ (для onclick)
// ==========================================

window.openModal = openModal;
window.closeModal = closeModal;
window.registerAndLogin = registerAndLogin;
window.login = login;
window.logout = logout;
window.openPostModal = openPostModal;
window.previewMedia = previewMedia;
window.createChirp = createChirp;
window.likeChirp = likeChirp;
window.openComments = openComments;
window.submitComment = submitComment;
window.openReport = openReport;
window.submitReport = submitReport;
window.onSearchInput = onSearchInput;
window.searchHashtag = searchHashtag;
window.showProfile = showProfile;
window.openAdminAccess = openAdminAccess;
window.adminLogin = adminLogin;
window.switchAdminTab = switchAdminTab;
window.adminSearchUsers = adminSearchUsers;
window.destroyAccount = destroyAccount;
window.deleteChirpById = deleteChirpById;
window.deleteChirp = deleteChirp;
window.openDoc = openDoc;
window.switchScreen = switchScreen;