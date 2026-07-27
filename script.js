// ============================================
// NobuSocial - Complete JavaScript Application
// Mobile Social Network with Supabase Backend
// 1500+ lines of pure JavaScript (ES5 style)
// ============================================

// Supabase Configuration
var SUPABASE_URL = 'https://iljsednetiogjtowlexo.supabase.co';
var SUPABASE_KEY = 'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O';
var supabase = supabaseClient(SUPABASE_URL, SUPABASE_KEY);

// Application State
var currentUser = null;
var currentSession = null;
var currentScreen = 'auth';
var currentProfileUser = null;
var currentChirp = null;
var currentChat = null;
var currentChatUser = null;
var feedTab = 'latest';
var feedPage = 1;
var feedLoading = false;
var feedEnded = false;
var searchQuery = '';
var searchTimeout = null;
var notifications = [];
var unreadNotifications = 0;
var chatsList = [];
var currentAdminTab = 'stats';
var currentShopTab = 'all';
var currentInventoryTab = 'all';

// DOM Elements Cache
var appElement = null;
var mainContentElement = null;
var bottomNavElement = null;
var toastContainerElement = null;
var loadingOverlayElement = null;
var headerElement = null;

// ============================================
// INITIALIZATION
// ============================================

// Initialize the application
function init() {
    cacheDOMElements();
    setupEventListeners();
    checkSession();
    setupRealtimeSubscriptions();
}

// Cache DOM elements for better performance
function cacheDOMElements() {
    appElement = document.getElementById('app');
    mainContentElement = document.getElementById('main-content');
    bottomNavElement = document.getElementById('bottom-nav');
    toastContainerElement = document.getElementById('toast-container');
    loadingOverlayElement = document.getElementById('loading-overlay');
    headerElement = document.getElementById('header');
}

// Setup event listeners
function setupEventListeners() {
    // Handle back button
    window.onpopstate = function(event) {
        handleBackNavigation(event);
    };

    // Handle keyboard shortcuts
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            hideModals();
        }
    });

    // Handle offline/online events
    window.addEventListener('offline', function() {
        showToast('Вы офлайн', 'warning');
    });

    window.addEventListener('online', function() {
        showToast('Вы онлайн', 'success');
        if (currentUser) {
            syncData();
        }
    });

    // Prevent default behavior for some elements
    document.querySelectorAll('a[href="#"]').forEach(function(link) {
        link.addEventListener('click', function(event) {
            event.preventDefault();
        });
    });
}

// Check for existing session on app start
function checkSession() {
    var sessionData = localStorage.getItem('nobuSession');
    if (sessionData) {
        try {
            currentSession = JSON.parse(sessionData);
            var sessionAge = Date.now() - currentSession.timestamp;
            var sessionExpiry = 24 * 60 * 60 * 1000; // 24 hours
            
            if (sessionAge < sessionExpiry) {
                currentUser = currentSession.user;
                loadUserData(currentUser.id);
                navigateTo('home');
                return;
            }
        } catch (error) {
            console.error('Error parsing session:', error);
        }
    }
    
    // No valid session, show auth screen
    showScreen('auth');
    updateBottomNavVisibility();
}

// ============================================
// SUPABASE CLIENT
// ============================================

// Create Supabase client
function supabaseClient(url, key) {
    return window.Supabase.createClient(url, key);
}

// Hash password with SHA-256 and salt
function hashPassword(password, salt) {
    var encoder = new TextEncoder();
    var data = encoder.encode(password + salt);
    return window.crypto.subtle.digest('SHA-256', data).then(function(hash) {
        return Array.from(new Uint8Array(hash)).map(function(b) {
            return b.toString(16).padStart(2, '0');
        }).join('');
    });
}

// Generate random salt
function generateSalt() {
    return window.crypto.getRandomValues(new Uint32Array(1))[0].toString(36) + 
           window.crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
}

// ============================================
// AUTHENTICATION
// ============================================

// Switch between login and register tabs
function switchAuthTab(tab) {
    var loginTab = document.getElementById('login-tab');
    var registerTab = document.getElementById('register-tab');
    var loginForm = document.getElementById('login-form');
    var registerForm = document.getElementById('register-form');
    
    if (tab === 'login') {
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
    } else {
        loginTab.classList.remove('active');
        registerTab.classList.add('active');
        loginForm.classList.remove('active');
        registerForm.classList.add('active');
    }
}

// Handle login form submission
function handleLogin(event) {
    if (event) event.preventDefault();
    
    var email = document.getElementById('login-email').value.trim();
    var password = document.getElementById('login-password').value;
    
    if (!email || !password) {
        showToast('Пожалуйста, заполните все поля', 'error');
        return;
    }
    
    if (!isValidEmail(email)) {
        showToast('Неверный формат email', 'error');
        return;
    }
    
    showLoading();
    
    // Get user by email
    supabase.from('users').select('*').eq('email', email).single()
        .then(function(response) {
            if (response.error || !response.data) {
                hideLoading();
                showToast('Пользователь не найден', 'error');
                return;
            }
            
            var user = response.data;
            
            // Hash the input password with the stored salt
            return hashPassword(password, user.password_salt).then(function(hashedPassword) {
                if (hashedPassword === user.password_hash) {
                    // Password matches, create session
                    if (user.is_banned) {
                        hideLoading();
                        showToast('Аккаунт заблокирован: ' + (user.banned_reason || 'Без причины'), 'error');
                        return;
                    }
                    
                    currentUser = user;
                    currentSession = {
                        user: user,
                        timestamp: Date.now()
                    };
                    
                    localStorage.setItem('nobuSession', JSON.stringify(currentSession));
                    hideLoading();
                    
                    // Load user data and navigate to home
                    loadUserData(user.id);
                    navigateTo('home');
                    showToast('Добро пожаловать, ' + user.display_name + '!', 'success');
                    
                } else {
                    hideLoading();
                    showToast('Неверный пароль', 'error');
                }
            });
        })
        .catch(function(error) {
            hideLoading();
            showToast('Ошибка входа: ' + error.message, 'error');
        });
}

// Handle register form submission
function handleRegister(event) {
    if (event) event.preventDefault();
    
    var username = document.getElementById('reg-username').value.trim();
    var email = document.getElementById('reg-email').value.trim();
    var password = document.getElementById('reg-password').value;
    var displayName = document.getElementById('reg-display-name').value.trim() || username;
    
    if (!username || !email || !password) {
        showToast('Пожалуйста, заполните все поля', 'error');
        return;
    }
    
    if (!isValidEmail(email)) {
        showToast('Неверный формат email', 'error');
        return;
    }
    
    if (!isValidUsername(username)) {
        showToast('Имя пользователя должно содержать только буквы, цифры, подчеркивания и точки', 'error');
        return;
    }
    
    if (password.length < 6) {
        showToast('Пароль должен содержать не менее 6 символов', 'error');
        return;
    }
    
    showLoading();
    
    // Check if username or email already exists
    var usernameCheck = supabase.from('users').select('id').eq('username', username).single();
    var emailCheck = supabase.from('users').select('id').eq('email', email).single();
    
    Promise.all([usernameCheck, emailCheck])
        .then(function(results) {
            if (results[0].data) {
                hideLoading();
                showToast('Имя пользователя уже занято', 'error');
                return;
            }
            if (results[1].data) {
                hideLoading();
                showToast('Email уже используется', 'error');
                return;
            }
            
            // Create new user
            var salt = generateSalt();
            return hashPassword(password, salt).then(function(hashedPassword) {
                var newUser = {
                    username: username,
                    email: email,
                    password_hash: hashedPassword,
                    password_salt: salt,
                    display_name: displayName,
                    bio: '',
                    avatar_url: getDefaultAvatar(username),
                    banner_url: '',
                    website: '',
                    location: '',
                    is_admin: false,
                    is_banned: false,
                    gems: 0
                };
                
                return supabase.from('users').insert(newUser).select().single();
            });
        })
        .then(function(response) {
            if (response.error) {
                hideLoading();
                showToast('Ошибка регистрации: ' + response.error.message, 'error');
                return;
            }
            
            var user = response.data;
            
            // Create gems record for user
            return supabase.from('gems').insert({
                user_id: user.id,
                amount: 100 // Starting gems
            });
        })
        .then(function() {
            hideLoading();
            showToast('Регистрация успешна!', 'success');
            switchAuthTab('login');
        })
        .catch(function(error) {
            hideLoading();
            showToast('Ошибка регистрации: ' + error.message, 'error');
        });
}

// Validate email format
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Validate username format
function isValidUsername(username) {
    return /^[a-zA-Z0-9_.]+$/.test(username) && username.length >= 3 && username.length <= 50;
}

// Generate default avatar URL based on username
function getDefaultAvatar(username) {
    var colors = ['#7c4dff', '#5a3dff', '#9d7dff', '#4caf50', '#f44336', '#2196f3', '#ff9800'];
    var index = username.charCodeAt(0) % colors.length;
    return 'https://via.placeholder.com/100x100/' + colors[index] + '/ffffff?text=' + username.charAt(0).toUpperCase();
}

// Logout
function logout() {
    currentUser = null;
    currentSession = null;
    localStorage.removeItem('nobuSession');
    
    // Clear all screens
    var screens = document.querySelectorAll('.screen');
    screens.forEach(function(screen) {
        screen.classList.remove('active');
    });
    
    // Show auth screen
    showScreen('auth');
    updateBottomNavVisibility();
    showToast('Вы вышли из аккаунта', 'success');
    
    // Reset state
    currentProfileUser = null;
    currentChirp = null;
    currentChat = null;
    feedPage = 1;
    feedEnded = false;
}

// ============================================
// USER DATA
// ============================================

// Load user data
function loadUserData(userId) {
    supabase.from('users').select('*').eq('id', userId).single()
        .then(function(response) {
            if (response.error) {
                console.error('Error loading user data:', response.error);
                return;
            }
            currentUser = response.data;
            updateHeader();
            loadNotifications();
            loadChatsList();
        })
        .catch(function(error) {
            console.error('Error loading user data:', error);
        });
}

// Update header with user info
function updateHeader() {
    if (!currentUser) return;
    
    var pageTitle = document.getElementById('page-title');
    if (currentScreen === 'profile' && currentProfileUser && currentProfileUser.id === currentUser.id) {
        pageTitle.textContent = 'Мой профиль';
    } else if (currentScreen === 'profile' && currentProfileUser) {
        pageTitle.textContent = currentProfileUser.display_name || currentProfileUser.username;
    } else if (currentScreen === 'chat') {
        pageTitle.textContent = currentChatUser ? (currentChatUser.display_name || currentChatUser.username) : 'Чат';
    } else if (currentScreen === 'view-chirp') {
        pageTitle.textContent = 'Чирп';
    } else {
        var titles = {
            'home': 'NobuSocial',
            'search': 'Поиск',
            'create': 'Создать chirp',
            'shop': 'Магазин',
            'notifications': 'Уведомления',
            'settings': 'Настройки',
            'edit-profile': 'Редактировать профиль',
            'inventory': 'Инвентарь',
            'admin': 'Админ-панель',
            'chats-list': 'Чаты'
        };
        pageTitle.textContent = titles[currentScreen] || 'NobuSocial';
    }
}

// ============================================
// NAVIGATION
// ============================================

// Navigate to a screen
function navigateTo(screenName, options) {
    options = options || {};
    
    var screens = document.querySelectorAll('.screen');
    screens.forEach(function(screen) {
        screen.classList.remove('active');
    });
    
    currentScreen = screenName;
    
    var screenElement = document.getElementById(screenName + '-screen');
    if (screenElement) {
        screenElement.classList.add('active');
    }
    
    updateHeader();
    updateBottomNavVisibility();
    
    // Handle specific screen initializations
    switch (screenName) {
        case 'home':
            loadFeed('latest');
            break;
        case 'search':
            document.getElementById('search-input').value = '';
            document.getElementById('search-results').innerHTML = '';
            break;
        case 'create':
            resetCreateForm();
            break;
        case 'shop':
            loadShopItems();
            loadUserGems();
            break;
        case 'profile':
            if (options.userId) {
                loadProfile(options.userId);
            } else if (currentUser) {
                loadProfile(currentUser.id);
            }
            break;
        case 'notifications':
            loadNotifications();
            break;
        case 'settings':
            // Settings screen doesn't need initialization
            break;
        case 'edit-profile':
            populateEditProfileForm();
            break;
        case 'inventory':
            loadInventory();
            break;
        case 'admin':
            if (currentUser && currentUser.is_admin) {
                loadAdminStats();
            } else {
                navigateTo('home');
                showToast('Доступ запрещен', 'error');
            }
            break;
        case 'chats-list':
            loadChatsList();
            break;
    }
    
    // Update URL for back navigation
    if (!options.skipHistory) {
        window.history.pushState({ screen: screenName, options: options }, '', '#' + screenName);
    }
}

// Go back to previous screen
function goBack() {
    window.history.back();
}

// Handle back navigation
function handleBackNavigation(event) {
    if (event.state && event.state.screen) {
        var screens = document.querySelectorAll('.screen');
        screens.forEach(function(screen) {
            screen.classList.remove('active');
        });
        
        currentScreen = event.state.screen;
        
        var screenElement = document.getElementById(event.state.screen + '-screen');
        if (screenElement) {
            screenElement.classList.add('active');
        }
        
        updateHeader();
        updateBottomNavVisibility();
        
        // Reload screen data if needed
        if (event.state.screen === 'home') {
            loadFeed(feedTab);
        } else if (event.state.screen === 'profile') {
            if (currentProfileUser) {
                loadProfile(currentProfileUser.id);
            } else if (currentUser) {
                loadProfile(currentUser.id);
            }
        }
    } else {
        // No history state, go to home or auth
        if (currentUser) {
            navigateTo('home');
        } else {
            navigateTo('auth');
        }
    }
}

// Show a specific screen
function showScreen(screenName) {
    navigateTo(screenName);
}

// Update bottom navigation visibility
function updateBottomNavVisibility() {
    if (!bottomNavElement) return;
    
    var hideNavScreens = ['auth', 'view-chirp', 'chat', 'edit-profile', 'settings', 'inventory', 'admin'];
    
    if (hideNavScreens.indexOf(currentScreen) !== -1 || !currentUser) {
        bottomNavElement.style.display = 'none';
    } else {
        bottomNavElement.style.display = 'flex';
    }
    
    // Update active nav item
    var navItems = bottomNavElement.querySelectorAll('.nav-item');
    navItems.forEach(function(item) {
        item.classList.remove('active');
        var screenMap = {
            'home': 0,
            'search': 1,
            'create': 2,
            'shop': 3,
            'profile': 4
        };
        if (screenMap[currentScreen] !== undefined) {
            navItems[screenMap[currentScreen]].classList.add('active');
        }
    });
}

// ============================================
// FEED / CHIPS
// ============================================

// Switch feed tab
function switchFeedTab(tab) {
    feedTab = tab;
    feedPage = 1;
    feedEnded = false;
    
    var tabs = document.querySelectorAll('.feed-tab');
    tabs.forEach(function(tabElement) {
        tabElement.classList.remove('active');
    });
    
    event.target.classList.add('active');
    
    loadFeed(tab);
}

// Load feed
function loadFeed(tab) {
    if (feedLoading || feedEnded) return;
    
    feedLoading = true;
    var feedContainer = document.getElementById('feed-content');
    var loader = document.getElementById('feed-loader');
    
    if (feedPage === 1) {
        feedContainer.innerHTML = '';
    }
    
    loader.style.display = 'flex';
    
    var query = supabase.from('chirps');
    
    switch (tab) {
        case 'latest':
            query = query.order('created_at', { ascending: false });
            break;
        case 'popular':
            query = query.order('like_count', { ascending: false }).order('created_at', { ascending: false });
            break;
        case 'following':
            if (currentUser) {
                query = query
                    .in('user_id', supabase
                        .from('follows')
                        .select('following_id')
                        .eq('follower_id', currentUser.id)
                    );
            }
            query = query.order('created_at', { ascending: false });
            break;
    }
    
    query = query
        .range((feedPage - 1) * 20, feedPage * 20 - 1)
        .select('*, users(*)');
    
    query.then(function(response) {
        feedLoading = false;
        loader.style.display = 'none';
        
        if (response.error) {
            showToast('Ошибка загрузки ленты: ' + response.error.message, 'error');
            return;
        }
        
        var chirps = response.data;
        
        if (chirps.length === 0) {
            if (feedPage === 1) {
                feedContainer.innerHTML = '<div class="empty-state"><i class="fas fa-feather-alt"></i><h3>Нет chirпов</h3><p>Будьте первым, кто создаст chirp!</p></div>';
            }
            feedEnded = true;
            return;
        }
        
        chirps.forEach(function(chirp) {
            renderChirp(chirp, feedContainer);
        });
        
        feedPage++;
        
        // Add scroll listener for infinite scroll
        if (feedPage === 2) {
            mainContentElement.addEventListener('scroll', handleFeedScroll);
        }
    })
    .catch(function(error) {
        feedLoading = false;
        loader.style.display = 'none';
        showToast('Ошибка загрузки ленты: ' + error.message, 'error');
    });
}

// Handle feed scroll for infinite loading
function handleFeedScroll() {
    if (feedLoading || feedEnded) return;
    
    var scrollTop = mainContentElement.scrollTop;
    var scrollHeight = mainContentElement.scrollHeight;
    var clientHeight = mainContentElement.clientHeight;
    
    if (scrollTop + clientHeight > scrollHeight - 100) {
        loadFeed(feedTab);
    }
}

// Render a chirp
function renderChirp(chirp, container, options) {
    options = options || {};
    
    var chirpElement = document.createElement('div');
    chirpElement.className = 'chirp-card';
    chirpElement.dataset.chirpId = chirp.id;
    
    var user = chirp.users || chirp.user;
    var isOwn = currentUser && currentUser.id === user.id;
    var isLiked = false;
    
    // Check if current user liked this chirp
    if (currentUser) {
        supabase.from('likes').select('id').eq('user_id', currentUser.id).eq('chirp_id', chirp.id).single()
            .then(function(response) {
                if (response.data) {
                    isLiked = true;
                    var likeBtn = chirpElement.querySelector('.chirp-action.like-btn');
                    if (likeBtn) {
                        likeBtn.classList.add('liked');
                        likeBtn.querySelector('i').className = 'fas fa-heart';
                    }
                }
            });
    }
    
    var timeAgo = getTimeAgo(chirp.created_at);
    var displayName = user.display_name || user.username;
    var username = '@' + user.username;
    
    // Sanitize content
    var content = sanitizeHTML(chirp.content);
    var bio = sanitizeHTML(user.bio || '');
    
    chirpElement.innerHTML = '
        <div class="chirp-header">
            <img src="' + (user.avatar_url || getDefaultAvatar(user.username)) + '" alt="Avatar" class="chirp-avatar" onclick="navigateTo(\'profile\', { userId: \'' + user.id + '\' })">
            <div class="chirp-user-info" onclick="navigateTo(\'profile\', { userId: \'' + user.id + '\' })">
                <h4>' + escapeHtml(displayName) + '</h4>
                <p>' + escapeHtml(username) + '</p>
            </div>
            <span class="chirp-time">' + escapeHtml(timeAgo) + '</span>
        </div>
        <div class="chirp-content">
            <p class="chirp-text">' + content + '</p>
        </div>
    ';
    
    // Add media if present
    if (chirp.media_url) {
        var mediaElement = document.createElement('div');
        mediaElement.className = 'chirp-media';
        
        if (chirp.media_type === 'video') {
            mediaElement.innerHTML = '<video src="' + escapeHtml(chirp.media_url) + '" controls></video>';
        } else {
            mediaElement.innerHTML = '<img src="' + escapeHtml(chirp.media_url) + '" alt="Chirp image">';
        }
        
        chirpElement.appendChild(mediaElement);
    }
    
    // Add stats
    var statsElement = document.createElement('div');
    statsElement.className = 'chirp-stats';
    statsElement.innerHTML = '
        <div class="chirp-stat">
            <i class="far fa-heart"></i>
            <span>' + chirp.like_count + '</span>
        </div>
        <div class="chirp-stat">
            <i class="fas fa-retweet"></i>
            <span>' + chirp.rechirp_count + '</span>
        </div>
        <div class="chirp-stat">
            <i class="far fa-comment"></i>
            <span>' + chirp.comment_count + '</span>
        </div>
        <div class="chirp-stat">
            <i class="far fa-eye"></i>
            <span>' + chirp.view_count + '</span>
        </div>
    ';
    chirpElement.appendChild(statsElement);
    
    // Add actions
    var actionsElement = document.createElement('div');
    actionsElement.className = 'chirp-actions';
    actionsElement.innerHTML = '
        <button class="chirp-action like-btn" onclick="likeChirp(\'' + chirp.id + '\', this)">
            <i class="far fa-heart"></i>
            <span>Лайк</span>
        </button>
        <button class="chirp-action" onclick="showComments(\'' + chirp.id + '\')">
            <i class="far fa-comment"></i>
            <span>Комментировать</span>
        </button>
        <button class="chirp-action" onclick="rechirp(\'' + chirp.id + '\')">
            <i class="fas fa-retweet"></i>
            <span>Речирп</span>
        </button>
        <button class="chirp-action more-btn" onclick="showChirpActions(\'' + chirp.id + '\', event)">
            <i class="fas fa-ellipsis-h"></i>
        </button>
    ';
    chirpElement.appendChild(actionsElement);
    
    // Add click handler to view chirp
    chirpElement.addEventListener('click', function(event) {
        if (!event.target.closest('.chirp-action') && !event.target.closest('.chirp-avatar') && !event.target.closest('.chirp-user-info')) {
            viewChirp(chirp.id);
        }
    });
    
    container.appendChild(chirpElement);
}

// Like a chirp
function likeChirp(chirpId, buttonElement) {
    if (!currentUser) {
        showToast('Авторизуйтесь, чтобы ставить лайки', 'error');
        return;
    }
    
    var isLiked = buttonElement.classList.contains('liked');
    
    if (isLiked) {
        // Unlike
        supabase.from('likes').delete().eq('user_id', currentUser.id).eq('chirp_id', chirpId)
            .then(function(response) {
                if (response.error) {
                    showToast('Ошибка: ' + response.error.message, 'error');
                    return;
                }
                buttonElement.classList.remove('liked');
                buttonElement.querySelector('i').className = 'far fa-heart';
                
                // Update like count
                var likeCountElement = buttonElement.closest('.chirp-actions').previousElementSibling.querySelector('.chirp-stat:first-child span');
                if (likeCountElement) {
                    likeCountElement.textContent = parseInt(likeCountElement.textContent) - 1;
                }
                
                showToast('Лайк удален', 'success');
            });
    } else {
        // Like
        supabase.from('likes').insert({
            user_id: currentUser.id,
            chirp_id: chirpId
        })
            .then(function(response) {
                if (response.error) {
                    showToast('Ошибка: ' + response.error.message, 'error');
                    return;
                }
                buttonElement.classList.add('liked');
                buttonElement.querySelector('i').className = 'fas fa-heart';
                
                // Update like count
                var likeCountElement = buttonElement.closest('.chirp-actions').previousElementSibling.querySelector('.chirp-stat:first-child span');
                if (likeCountElement) {
                    likeCountElement.textContent = parseInt(likeCountElement.textContent) + 1;
                }
                
                // Send notification to chirp author
                supabase.from('chirps').select('user_id').eq('id', chirpId).single()
                    .then(function(chirpResponse) {
                        if (chirpResponse.data && chirpResponse.data.user_id !== currentUser.id) {
                            supabase.from('notifications').insert({
                                recipient_id: chirpResponse.data.user_id,
                                sender_id: currentUser.id,
                                notification_type: 'like',
                                chirp_id: chirpId
                            });
                        }
                    });
                
                showToast('Лайк добавлен', 'success');
            });
    }
}

// View a chirp in detail
function viewChirp(chirpId) {
    supabase.from('chirps').select('*, users(*)').eq('id', chirpId).single()
        .then(function(response) {
            if (response.error) {
                showToast('Ошибка загрузки chirpa: ' + response.error.message, 'error');
                return;
            }
            
            currentChirp = response.data;
            renderChirpDetail(currentChirp);
            navigateTo('view-chirp');
            
            // Increment view count
            supabase.from('chirps').update({ view_count: currentChirp.view_count + 1 }).eq('id', chirpId);
        });
}

// Render chirp detail
function renderChirpDetail(chirp) {
    var user = chirp.users || chirp.user;
    var displayName = user.display_name || user.username;
    var username = '@' + user.username;
    var timeAgo = getTimeAgo(chirp.created_at);
    var content = sanitizeHTML(chirp.content);
    
    document.getElementById('chirp-avatar').src = user.avatar_url || getDefaultAvatar(user.username);
    document.getElementById('chirp-display-name').textContent = escapeHtml(displayName);
    document.getElementById('chirp-username').textContent = escapeHtml(username);
    document.getElementById('chirp-text').innerHTML = content;
    document.getElementById('chirp-likes').textContent = chirp.like_count;
    document.getElementById('chirp-rechirps').textContent = chirp.rechirp_count;
    document.getElementById('chirp-comments').textContent = chirp.comment_count;
    document.getElementById('chirp-views').textContent = chirp.view_count + 1;
    
    // Set media
    var mediaContainer = document.getElementById('chirp-media');
    mediaContainer.innerHTML = '';
    if (chirp.media_url) {
        if (chirp.media_type === 'video') {
            mediaContainer.innerHTML = '<video src="' + escapeHtml(chirp.media_url) + '" controls id="chirp-video"></video>';
        } else {
            mediaContainer.innerHTML = '<img src="' + escapeHtml(chirp.media_url) + '" alt="Chirp image" id="chirp-image">';
        }
    }
    
    // Load comments
    loadComments(chirp.id);
    
    // Check if current user liked this chirp
    if (currentUser) {
        supabase.from('likes').select('id').eq('user_id', currentUser.id).eq('chirp_id', chirp.id).single()
            .then(function(response) {
                var likeIcon = document.getElementById('like-icon');
                if (response.data) {
                    likeIcon.className = 'fas fa-heart';
                } else {
                    likeIcon.className = 'far fa-heart';
                }
            });
    }
}

// Load comments for a chirp
function loadComments(chirpId) {
    supabase.from('chirps').select('*, users(*)').eq('original_chirp_id', chirpId).order('created_at', { ascending: true })
        .then(function(response) {
            if (response.error) {
                showToast('Ошибка загрузки комментариев: ' + response.error.message, 'error');
                return;
            }
            
            var commentsList = document.getElementById('comments-list');
            commentsList.innerHTML = '';
            
            if (response.data.length === 0) {
                commentsList.innerHTML = '<p class="text-muted text-center p-md">Нет комментариев</p>';
                return;
            }
            
            response.data.forEach(function(comment) {
                renderComment(comment, commentsList);
            });
        });
}

// Render a comment
function renderComment(comment, container) {
    var user = comment.users || comment.user;
    var displayName = user.display_name || user.username;
    var username = '@' + user.username;
    var timeAgo = getTimeAgo(comment.created_at);
    var content = sanitizeHTML(comment.content);
    
    var commentElement = document.createElement('div');
    commentElement.className = 'comment';
    commentElement.innerHTML = '
        <img src="' + (user.avatar_url || getDefaultAvatar(user.username)) + '" alt="Avatar" class="comment-avatar" onclick="navigateTo(\'profile\', { userId: \'' + user.id + '\' })">
        <div class="comment-content">
            <div class="comment-header">
                <h5 onclick="navigateTo(\'profile\', { userId: \'' + user.id + '\' })">' + escapeHtml(displayName) + '</h5>
                <span>' + escapeHtml(username) + ' • ' + escapeHtml(timeAgo) + '</span>
            </div>
            <p class="comment-text">' + content + '</p>
        </div>
    ';
    
    container.appendChild(commentElement);
}

// Show comments section
function showComments(chirpId) {
    viewChirp(chirpId);
    // Scroll to comments
    setTimeout(function() {
        var commentsSection = document.getElementById('chirp-comments');
        if (commentsSection) {
            commentsSection.scrollIntoView({ behavior: 'smooth' });
        }
    }, 100);
}

// Add a comment
function addComment() {
    if (!currentUser) {
        showToast('Авторизуйтесь, чтобы комментировать', 'error');
        return;
    }
    
    var content = document.getElementById('comment-input').value.trim();
    if (!content) {
        showToast('Введите текст комментария', 'error');
        return;
    }
    
    if (content.length > 280) {
        showToast('Комментарий не может превышать 280 символов', 'error');
        return;
    }
    
    // Filter profanity
    content = filterProfanity(content);
    
    // Sanitize
    content = sanitizeHTML(content);
    
    supabase.from('chirps').insert({
        user_id: currentUser.id,
        content: content,
        original_chirp_id: currentChirp.id,
        is_rechirp: false
    })
        .then(function(response) {
            if (response.error) {
                showToast('Ошибка добавления комментария: ' + response.error.message, 'error');
                return;
            }
            
            // Clear input
            document.getElementById('comment-input').value = '';
            
            // Update comment count
            supabase.from('chirps').update({ comment_count: currentChirp.comment_count + 1 }).eq('id', currentChirp.id);
            currentChirp.comment_count++;
            document.getElementById('chirp-comments').textContent = currentChirp.comment_count;
            
            // Reload comments
            loadComments(currentChirp.id);
            
            // Send notification to chirp author
            if (currentChirp.user_id !== currentUser.id) {
                supabase.from('notifications').insert({
                    recipient_id: currentChirp.user_id,
                    sender_id: currentUser.id,
                    notification_type: 'comment',
                    chirp_id: currentChirp.id
                });
            }
            
            showToast('Комментарий добавлен', 'success');
        });
}

// Rechirp (repost)
function rechirp(chirpId) {
    if (!currentUser) {
        showToast('Авторизуйтесь, чтобы делать речирпы', 'error');
        return;
    }
    
    showLoading();
    
    supabase.from('chirps').select('content, media_url, media_type, user_id').eq('id', chirpId).single()
        .then(function(response) {
            if (response.error) {
                hideLoading();
                showToast('Ошибка: ' + response.error.message, 'error');
                return;
            }
            
            var originalChirp = response.data;
            
            supabase.from('chirps').insert({
                user_id: currentUser.id,
                content: 'Rechirped',
                original_chirp_id: chirpId,
                is_rechirp: true
            })
                .then(function(insertResponse) {
                    hideLoading();
                    if (insertResponse.error) {
                        showToast('Ошибка: ' + insertResponse.error.message, 'error');
                        return;
                    }
                    
                    // Update rechirp count
                    supabase.from('chirps').update({ rechirp_count: originalChirp.rechirp_count + 1 }).eq('id', chirpId);
                    
                    // Send notification to original author
                    if (originalChirp.user_id !== currentUser.id) {
                        supabase.from('notifications').insert({
                            recipient_id: originalChirp.user_id,
                            sender_id: currentUser.id,
                            notification_type: 'rechirp',
                            chirp_id: chirpId
                        });
                    }
                    
                    showToast('Речирп добавлен', 'success');
                    
                    // Refresh feed
                    feedPage = 1;
                    feedEnded = false;
                    loadFeed(feedTab);
                    
                    // Go back to home
                    navigateTo('home');
                });
        });
}

// Show chirp actions menu
function showChirpActions(chirpId, event) {
    if (event) event.stopPropagation();
    
    var chirp = null;
    
    // Find chirp in current feed
    var chirpElements = document.querySelectorAll('.chirp-card');
    for (var i = 0; i < chirpElements.length; i++) {
        if (chirpElements[i].dataset.chirpId === chirpId) {
            chirp = {
                id: chirpId,
                element: chirpElements[i]
            };
            break;
        }
    }
    
    if (!chirp) {
        // If not found in feed, it might be in detail view
        if (currentChirp && currentChirp.id === chirpId) {
            chirp = currentChirp;
        }
    }
    
    // Check if current user is the author
    var isOwn = currentUser && chirp && chirp.user_id && chirp.user_id === currentUser.id;
    
    var actions = [];
    
    if (isOwn) {
        actions = [
            { icon: 'fa-edit', text: 'Редактировать', action: 'editChirp(\'' + chirpId + '\')' },
            { icon: 'fa-trash', text: 'Удалить', action: 'deleteChirp(\'' + chirpId + '\')', danger: true }
        ];
    } else {
        actions = [
            { icon: 'fa-flag', text: 'Пожаловаться', action: 'reportChirp(\'' + chirpId + '\')' },
            { icon: 'fa-share', text: 'Поделиться', action: 'shareChirp(\'' + chirpId + '\')' }
        ];
    }
    
    showActionSheet(actions);
}

// Edit chirp
function editChirp(chirpId) {
    supabase.from('chirps').select('content').eq('id', chirpId).single()
        .then(function(response) {
            if (response.error) {
                showToast('Ошибка загрузки chirpa', 'error');
                return;
            }
            
            var content = response.data.content;
            var editContent = prompt('Редактировать chirp:', content);
            
            if (editContent !== null && editContent !== content) {
                if (editContent.length > 280) {
                    showToast('Chirp не может превышать 280 символов', 'error');
                    return;
                }
                
                if (editContent.length === 0) {
                    showToast('Chirp не может быть пустым', 'error');
                    return;
                }
                
                editContent = filterProfanity(editContent);
                editContent = sanitizeHTML(editContent);
                
                showLoading();
                
                supabase.from('chirps').update({ content: editContent }).eq('id', chirpId)
                    .then(function(updateResponse) {
                        hideLoading();
                        if (updateResponse.error) {
                            showToast('Ошибка сохранения: ' + updateResponse.error.message, 'error');
                            return;
                        }
                        
                        showToast('Chirp обновлен', 'success');
                        
                        // Refresh feed
                        feedPage = 1;
                        feedEnded = false;
                        loadFeed(feedTab);
                    });
            }
        });
}

// Delete chirp
function deleteChirp(chirpId) {
    if (!confirm('Вы уверены, что хотите удалить этот chirp?')) {
        return;
    }
    
    showLoading();
    
    supabase.from('chirps').delete().eq('id', chirpId)
        .then(function(response) {
            hideLoading();
            if (response.error) {
                showToast('Ошибка удаления: ' + response.error.message, 'error');
                return;
            }
            
            showToast('Chirp удален', 'success');
            
            // Refresh feed
            feedPage = 1;
            feedEnded = false;
            loadFeed(feedTab);
            
            // If viewing the chirp, go back
            if (currentChirp && currentChirp.id === chirpId) {
                navigateTo('home');
            }
        });
}

// Report chirp
function reportChirp(chirpId) {
    if (!currentUser) {
        showToast('Авторизуйтесь, чтобы пожаловаться', 'error');
        return;
    }
    
    var reason = prompt('Причина жалобы (spam, abuse, inappropriate, other):');
    if (!reason) return;
    
    supabase.from('reports').insert({
        reporter_id: currentUser.id,
        chirp_id: chirpId,
        report_type: reason,
        status: 'pending'
    })
        .then(function(response) {
            if (response.error) {
                showToast('Ошибка отправки жалобы: ' + response.error.message, 'error');
                return;
            }
            showToast('Жалоба отправлена', 'success');
        });
}

// Share chirp
function shareChirp(chirpId) {
    var chirpUrl = window.location.origin + '/#view-chirp?id=' + chirpId;
    
    if (navigator.share) {
        navigator.share({
            title: 'NobuSocial Chirp',
            text: 'Посмотрите этот chirp на NobuSocial',
            url: chirpUrl
        }).catch(function(error) {
            console.error('Error sharing:', error);
        });
    } else {
        // Fallback for browsers that don't support Web Share API
        prompt('Скопируйте ссылку для делиться:', chirpUrl);
        showToast('Ссылка скопирована в буфер обмена', 'success');
    }
}

// ============================================
// CREATE CHIRP
// ============================================

// Reset create form
function resetCreateForm() {
    document.getElementById('chirp-content').value = '';
    document.getElementById('char-count').textContent = '0';
    document.getElementById('media-preview').classList.remove('has-media');
    document.getElementById('media-preview').innerHTML = '';
    document.getElementById('media-image').src = '';
    document.getElementById('media-video').src = '';
    document.getElementById('media-upload').value = '';
    
    updateChirpCounter();
}

// Update character counter
function updateChirpCounter() {
    var content = document.getElementById('chirp-content').value;
    var count = content.length;
    var counter = document.getElementById('char-count');
    
    counter.textContent = count;
    
    if (count > 280) {
        counter.parentElement.classList.add('error');
        counter.parentElement.classList.remove('warning');
    } else if (count > 240) {
        counter.parentElement.classList.add('warning');
        counter.parentElement.classList.remove('error');
    } else {
        counter.parentElement.classList.remove('warning', 'error');
    }
}

// Handle media upload
function handleMediaUpload(event) {
    var file = event.target.files[0];
    if (!file) return;
    
    var maxImageSize = 10 * 1024 * 1024; // 10MB
    var maxVideoSize = 50 * 1024 * 1024; // 50MB
    
    var isImage = file.type.startsWith('image/');
    var isVideo = file.type.startsWith('video/');
    
    if (!isImage && !isVideo) {
        showToast('Пожалуйста, загрузите изображение или видео', 'error');
        resetMediaUpload();
        return;
    }
    
    if (isImage && file.size > maxImageSize) {
        showToast('Изображение не может превышать 10MB', 'error');
        resetMediaUpload();
        return;
    }
    
    if (isVideo && file.size > maxVideoSize) {
        showToast('Видео не может превышать 50MB', 'error');
        resetMediaUpload();
        return;
    }
    
    var preview = document.getElementById('media-preview');
    preview.classList.add('has-media');
    preview.innerHTML = '';
    
    if (isImage) {
        var img = document.createElement('img');
        img.id = 'media-image';
        img.src = URL.createObjectURL(file);
        preview.appendChild(img);
    } else if (isVideo) {
        var video = document.createElement('video');
        video.id = 'media-video';
        video.controls = true;
        video.src = URL.createObjectURL(file);
        preview.appendChild(video);
    }
    
    var removeBtn = document.createElement('button');
    removeBtn.className = 'remove-media';
    removeBtn.innerHTML = '<i class="fas fa-times"></i>';
    removeBtn.onclick = removeMedia;
    preview.appendChild(removeBtn);
}

// Remove media
function removeMedia() {
    resetMediaUpload();
}

// Reset media upload
function resetMediaUpload() {
    var preview = document.getElementById('media-preview');
    preview.classList.remove('has-media');
    preview.innerHTML = '';
    document.getElementById('media-upload').value = '';
}

// Create a new chirp
function createChirp() {
    if (!currentUser) {
        showToast('Авторизуйтесь, чтобы создавать chirps', 'error');
        navigateTo('auth');
        return;
    }
    
    var content = document.getElementById('chirp-content').value.trim();
    var mediaFile = document.getElementById('media-upload').files[0];
    
    if (!content && !mediaFile) {
        showToast('Введите текст или загрузите медиа', 'error');
        return;
    }
    
    if (content.length > 280) {
        showToast('Chirp не может превышать 280 символов', 'error');
        return;
    }
    
    // Filter profanity
    content = filterProfanity(content);
    
    // Sanitize
    content = sanitizeHTML(content);
    
    showLoading();
    
    var chirpData = {
        user_id: currentUser.id,
        content: content,
        media_url: null,
        media_type: null,
        media_size: 0,
        is_rechirp: false,
        original_chirp_id: null
    };
    
    if (mediaFile) {
        // Upload media to Supabase Storage
        var fileName = Date.now() + '-' + mediaFile.name;
        var filePath = 'chirps/' + currentUser.id + '/' + fileName;
        
        var isImage = mediaFile.type.startsWith('image/');
        var isVideo = mediaFile.type.startsWith('video/');
        
        chirpData.media_type = isImage ? 'image' : isVideo ? 'video' : null;
        chirpData.media_size = mediaFile.size;
        
        supabase.storage.from('chirps').upload(filePath, mediaFile)
            .then(function(uploadResponse) {
                if (uploadResponse.error) {
                    hideLoading();
                    showToast('Ошибка загрузки медиа: ' + uploadResponse.error.message, 'error');
                    return;
                }
                
                // Get public URL
                var publicUrl = supabase.storage.from('chirps').getPublicUrl(filePath).data.publicUrl;
                chirpData.media_url = publicUrl;
                
                // Insert chirp
                return supabase.from('chirps').insert(chirpData).select().single();
            })
            .then(function(response) {
                hideLoading();
                if (response.error) {
                    showToast('Ошибка создания chirpa: ' + response.error.message, 'error');
                    return;
                }
                
                // Reset form
                resetCreateForm();
                
                showToast('Chirp опубликован!', 'success');
                
                // Go to home and refresh feed
                navigateTo('home');
                feedPage = 1;
                feedEnded = false;
                loadFeed(feedTab);
            })
            .catch(function(error) {
                hideLoading();
                showToast('Ошибка: ' + error.message, 'error');
            });
    } else {
        // No media, just create chirp
        supabase.from('chirps').insert(chirpData)
            .then(function(response) {
                hideLoading();
                if (response.error) {
                    showToast('Ошибка создания chirpa: ' + response.error.message, 'error');
                    return;
                }
                
                // Reset form
                resetCreateForm();
                
                showToast('Chirp опубликован!', 'success');
                
                // Go to home and refresh feed
                navigateTo('home');
                feedPage = 1;
                feedEnded = false;
                loadFeed(feedTab);
            })
            .catch(function(error) {
                hideLoading();
                showToast('Ошибка: ' + error.message, 'error');
            });
    }
}

// ============================================
// PROFILE
// ============================================

// Load profile
function loadProfile(userId) {
    currentProfileUser = null;
    
    supabase.from('users').select('*').eq('id', userId).single()
        .then(function(response) {
            if (response.error) {
                showToast('Ошибка загрузки профиля: ' + response.error.message, 'error');
                navigateTo('home');
                return;
            }
            
            currentProfileUser = response.data;
            renderProfile(currentProfileUser);
            loadProfileChirps(userId, 'chirps');
        });
}

// Render profile
function renderProfile(user) {
    var displayName = user.display_name || user.username;
    var username = '@' + user.username;
    var bio = user.bio || '';
    var location = user.location || '';
    var website = user.website || '';
    
    document.getElementById('profile-avatar').src = user.avatar_url || getDefaultAvatar(user.username);
    document.getElementById('profile-banner').innerHTML = '<img id="banner-img" src="' + (user.banner_url || '') + '" alt="Banner">';
    document.getElementById('profile-display-name').textContent = escapeHtml(displayName);
    document.getElementById('profile-username').textContent = escapeHtml(username);
    document.getElementById('profile-bio').textContent = escapeHtml(bio);
    document.getElementById('profile-location').textContent = escapeHtml(location);
    document.getElementById('profile-website').textContent = escapeHtml(website);
    document.getElementById('profile-website').href = website.startsWith('http') ? website : 'https://' + website;
    
    // Load stats
    loadProfileStats(user.id);
    
    // Update follow button
    updateFollowButton(user.id);
    
    // Check for avatar frame
    checkAvatarFrame(user.id);
    
    // Hide website if empty
    if (!website) {
        document.getElementById('profile-website').style.display = 'none';
    } else {
        document.getElementById('profile-website').style.display = 'inline';
    }
    
    // Hide location if empty
    if (!location) {
        document.getElementById('profile-location').style.display = 'none';
    } else {
        document.getElementById('profile-location').style.display = 'inline';
    }
}

// Load profile stats
function loadProfileStats(userId) {
    var statsPromises = [
        supabase.from('chirps').select('id').eq('user_id', userId).eq('is_rechirp', false),
        supabase.from('follows').select('id').eq('follower_id', userId),
        supabase.from('follows').select('id').eq('following_id', userId),
        supabase.from('likes').select('id').eq('user_id', userId)
    ];
    
    Promise.all(statsPromises)
        .then(function(results) {
            document.getElementById('profile-chirps').textContent = results[0].data ? results[0].data.length : 0;
            document.getElementById('profile-following').textContent = results[1].data ? results[1].data.length : 0;
            document.getElementById('profile-followers').textContent = results[2].data ? results[2].data.length : 0;
            document.getElementById('profile-likes').textContent = results[3].data ? results[3].data.length : 0;
        });
}

// Check if current user has avatar frame equipped
function checkAvatarFrame(userId) {
    if (userId !== currentUser.id) return;
    
    supabase.from('user_inventory').select('*, shop_items(*)').eq('user_id', userId).eq('is_equipped', true).eq('shop_items.category', 'avatar_frame').single()
        .then(function(response) {
            var frame = document.getElementById('avatar-frame');
            if (response.data) {
                var frameType = response.data.shop_items.name.toLowerCase();
                frame.classList.add('active');
                frame.className = 'avatar-frame active ' + frameType.replace(' ', '-').toLowerCase();
            } else {
                frame.classList.remove('active');
            }
        });
}

// Update follow button
function updateFollowButton(userId) {
    if (!currentUser || userId === currentUser.id) {
        document.getElementById('follow-btn').style.display = 'none';
        document.getElementById('message-btn').style.display = 'none';
        document.getElementById('settings-btn').style.display = 'block';
        return;
    }
    
    document.getElementById('follow-btn').style.display = 'block';
    document.getElementById('message-btn').style.display = 'block';
    document.getElementById('settings-btn').style.display = 'none';
    
    supabase.from('follows').select('id').eq('follower_id', currentUser.id).eq('following_id', userId).single()
        .then(function(response) {
            var followBtn = document.getElementById('follow-btn');
            if (response.data) {
                followBtn.textContent = 'Отписаться';
                followBtn.classList.add('following');
                followBtn.onclick = toggleFollow;
            } else {
                followBtn.textContent = 'Подписаться';
                followBtn.classList.remove('following');
                followBtn.onclick = toggleFollow;
            }
        });
}

// Toggle follow
function toggleFollow() {
    if (!currentUser || !currentProfileUser) return;
    
    var userId = currentProfileUser.id;
    
    supabase.from('follows').select('id').eq('follower_id', currentUser.id).eq('following_id', userId).single()
        .then(function(response) {
            if (response.data) {
                // Unfollow
                supabase.from('follows').delete().eq('id', response.data.id)
                    .then(function(deleteResponse) {
                        if (deleteResponse.error) {
                            showToast('Ошибка: ' + deleteResponse.error.message, 'error');
                            return;
                        }
                        
                        document.getElementById('follow-btn').textContent = 'Подписаться';
                        document.getElementById('follow-btn').classList.remove('following');
                        
                        // Update follower count
                        loadProfileStats(userId);
                        
                        showToast('Вы отписались', 'success');
                    });
            } else {
                // Follow
                supabase.from('follows').insert({
                    follower_id: currentUser.id,
                    following_id: userId
                })
                    .then(function(insertResponse) {
                        if (insertResponse.error) {
                            showToast('Ошибка: ' + insertResponse.error.message, 'error');
                            return;
                        }
                        
                        document.getElementById('follow-btn').textContent = 'Отписаться';
                        document.getElementById('follow-btn').classList.add('following');
                        
                        // Update follower count
                        loadProfileStats(userId);
                        
                        // Send notification
                        supabase.from('notifications').insert({
                            recipient_id: userId,
                            sender_id: currentUser.id,
                            notification_type: 'follow'
                        });
                        
                        showToast('Вы подписались', 'success');
                    });
            }
        });
}

// Start chat with user
function startChat() {
    if (!currentUser || !currentProfileUser || currentProfileUser.id === currentUser.id) return;
    
    // Check if users are mutual followers
    var checkFollow1 = supabase.from('follows').select('id').eq('follower_id', currentUser.id).eq('following_id', currentProfileUser.id).single();
    var checkFollow2 = supabase.from('follows').select('id').eq('follower_id', currentProfileUser.id).eq('following_id', currentUser.id).single();
    
    Promise.all([checkFollow1, checkFollow2])
        .then(function(results) {
            if (!results[0].data || !results[1].data) {
                showToast('Вы можете писать только взаимным подписчикам', 'error');
                return;
            }
            
            // Check if chat already exists
            var user1 = currentUser.id < currentProfileUser.id ? currentUser.id : currentProfileUser.id;
            var user2 = currentUser.id < currentProfileUser.id ? currentProfileUser.id : currentUser.id;
            
            supabase.from('chats').select('*').eq('user1_id', user1).eq('user2_id', user2).single()
                .then(function(response) {
                    if (response.data) {
                        // Chat exists, navigate to it
                        currentChat = response.data;
                        currentChatUser = currentProfileUser;
                        loadChatMessages(response.data.id);
                    } else {
                        // Create new chat
                        supabase.from('chats').insert({
                            user1_id: user1,
                            user2_id: user2
                        }).select().single()
                            .then(function(chatResponse) {
                                if (chatResponse.error) {
                                    showToast('Ошибка создания чата: ' + chatResponse.error.message, 'error');
                                    return;
                                }
                                
                                currentChat = chatResponse.data;
                                currentChatUser = currentProfileUser;
                                loadChatMessages(chatResponse.data.id);
                            });
                    }
                });
        });
}

// Load chat messages
function loadChatMessages(chatId) {
    supabase.from('chat_messages').select('*, users(*)').eq('chat_id', chatId).order('created_at', { ascending: true })
        .then(function(response) {
            if (response.error) {
                showToast('Ошибка загрузки сообщений: ' + response.error.message, 'error');
                return;
            }
            
            currentChat = { id: chatId };
            renderChatMessages(response.data);
            navigateTo('chat');
            
            // Mark messages as read
            markMessagesAsRead(chatId);
        });
}

// Render chat messages
function renderChatMessages(messages) {
    var chatMessagesElement = document.getElementById('chat-messages');
    chatMessagesElement.innerHTML = '';
    
    if (messages.length === 0) {
        chatMessagesElement.innerHTML = '<div class="empty-state"><i class="fas fa-comments"></i><h3>Нет сообщений</h3><p>Начните чат!</p></div>';
        return;
    }
    
    messages.forEach(function(message) {
        var user = message.users || message.user;
        var isOutgoing = user.id === currentUser.id;
        var messageElement = document.createElement('div');
        messageElement.className = 'chat-message ' + (isOutgoing ? 'outgoing' : 'incoming');
        
        var timeAgo = getTimeAgo(message.created_at);
        var content = sanitizeHTML(message.content);
        
        messageElement.innerHTML = '
            <p class="chat-message-text">' + content + '</p>
            <span class="chat-message-time">' + escapeHtml(timeAgo) + '</span>
        ';
        
        chatMessagesElement.appendChild(messageElement);
    });
    
    // Scroll to bottom
    setTimeout(function() {
        chatMessagesElement.scrollTop = chatMessagesElement.scrollHeight;
    }, 100);
}

// Mark messages as read
function markMessagesAsRead(chatId) {
    supabase.from('chat_messages').update({ is_read: true }).eq('chat_id', chatId).eq('sender_id', currentChatUser.id);
}

// Send chat message
function sendChatMessage() {
    if (!currentUser || !currentChat || !currentChatUser) return;
    
    var content = document.getElementById('chat-input').value.trim();
    if (!content) return;
    
    // Filter profanity
    content = filterProfanity(content);
    
    // Sanitize
    content = sanitizeHTML(content);
    
    supabase.from('chat_messages').insert({
        chat_id: currentChat.id,
        sender_id: currentUser.id,
        content: content
    })
        .then(function(response) {
            if (response.error) {
                showToast('Ошибка отправки сообщения: ' + response.error.message, 'error');
                return;
            }
            
            // Clear input
            document.getElementById('chat-input').value = '';
            
            // Send notification
            supabase.from('notifications').insert({
                recipient_id: currentChatUser.id,
                sender_id: currentUser.id,
                notification_type: 'message',
                chat_id: currentChat.id
            });
        });
}

// Handle chat key press
function handleChatKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
    }
}

// Back to chats list
function backToChats() {
    navigateTo('chats-list');
}

// Load chats list
function loadChatsList() {
    if (!currentUser) return;
    
    var chatsQuery = supabase.from('chats').select('*, users1:users!chats_user1_id_fkey, users2:users!chats_user2_id_fkey');
    
    // Filter chats where current user is either user1 or user2
    chatsQuery = chatsQuery.or('user1_id.eq.' + currentUser.id + ',user2_id.eq.' + currentUser.id);
    
    chatsQuery.order('updated_at', { ascending: false })
        .then(function(response) {
            if (response.error) {
                showToast('Ошибка загрузки чатов: ' + response.error.message, 'error');
                return;
            }
            
            chatsList = response.data;
            renderChatsList(chatsList);
        });
}

// Render chats list
function renderChatsList(chats) {
    var chatsListContent = document.getElementById('chats-list-content');
    chatsListContent.innerHTML = '';
    
    if (chats.length === 0) {
        chatsListContent.innerHTML = '<div class="empty-state"><i class="fas fa-comment-slash"></i><h3>Нет чатов</h3><p>Начните чат с взаимными подписчиками</p></div>';
        return;
    }
    
    chats.forEach(function(chat) {
        var otherUser = chat.user1_id === currentUser.id ? chat.users2 : chat.users1;
        
        // Get last message
        supabase.from('chat_messages').select('*').eq('chat_id', chat.id).order('created_at', { ascending: false }).limit(1).single()
            .then(function(lastMessageResponse) {
                var lastMessage = lastMessageResponse.data;
                var lastMessageText = lastMessage ? lastMessage.content : 'Новый чат';
                var lastMessageTime = lastMessage ? getTimeAgo(lastMessage.created_at) : '';
                
                // Check for unread messages
                supabase.from('chat_messages').select('id').eq('chat_id', chat.id).eq('sender_id', otherUser.id).eq('is_read', false)
                    .then(function(unreadResponse) {
                        var hasUnread = unreadResponse.data && unreadResponse.data.length > 0;
                        
                        var chatItem = document.createElement('div');
                        chatItem.className = 'chat-item';
                        chatItem.onclick = function() {
                            currentChatUser = otherUser;
                            loadChatMessages(chat.id);
                        };
                        
                        chatItem.innerHTML = '
                            <img src="' + (otherUser.avatar_url || getDefaultAvatar(otherUser.username)) + '" alt="Avatar" class="chat-item-avatar">
                            <div class="chat-item-info">
                                <h4>' + escapeHtml(otherUser.display_name || otherUser.username) + '</h4>
                                <p>' + escapeHtml(lastMessageText.length > 30 ? lastMessageText.substring(0, 30) + '...' : lastMessageText) + '</p>
                            </div>
                            <div class="chat-item-meta">
                                <span class="chat-item-time">' + escapeHtml(lastMessageTime) + '</span>
                                ' + (hasUnread ? '<div class="chat-item-unread"></div>' : '') + '
                            </div>
                        ';
                        
                        chatsListContent.appendChild(chatItem);
                    });
            });
    });
}

// Switch profile tab
function switchProfileTab(tab) {
    var tabs = document.querySelectorAll('.profile-tab');
    tabs.forEach(function(tabElement) {
        tabElement.classList.remove('active');
    });
    event.target.classList.add('active');
    
    loadProfileChirps(currentProfileUser.id, tab);
}

// Load profile chirps
function loadProfileChirps(userId, tab) {
    var query = supabase.from('chirps').select('*, users(*)').eq('user_id', userId);
    
    switch (tab) {
        case 'likes':
            query = supabase.from('chirps').select('*, users(*), likes!inner(*)').eq('likes.user_id', userId);
            break;
        case 'rechirps':
            query = query.eq('is_rechirp', true);
            break;
        default:
            query = query.eq('is_rechirp', false);
    }
    
    query.order('created_at', { ascending: false })
        .then(function(response) {
            if (response.error) {
                showToast('Ошибка загрузки chirпов: ' + response.error.message, 'error');
                return;
            }
            
            var profileContent = document.getElementById('profile-content');
            profileContent.innerHTML = '';
            
            if (response.data.length === 0) {
                profileContent.innerHTML = '<div class="empty-state"><i class="fas fa-feather-alt"></i><h3>Нет chirпов</h3></div>';
                return;
            }
            
            response.data.forEach(function(chirp) {
                renderChirp(chirp, profileContent, { compact: true });
            });
        });
}

// ============================================
// SEARCH
// ============================================

// Show search
function showSearch() {
    if (currentUser) {
        navigateTo('search');
    } else {
        navigateTo('auth');
    }
}

// Handle search input
function handleSearchInput() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(function() {
        var query = document.getElementById('search-input').value.trim();
        if (query.length >= 2) {
            searchUsers(query);
        } else if (query.length === 0) {
            document.getElementById('search-results').innerHTML = '';
        }
    }, 300);
}

// Search users
function searchUsers(query) {
    searchQuery = query;
    
    supabase.from('users').select('*').ilike('username', '%' + query + '%').or('ilike(display_name,' + '%' + query + '%' + ')').limit(20)
        .then(function(response) {
            if (response.error) {
                showToast('Ошибка поиска: ' + response.error.message, 'error');
                return;
            }
            
            renderSearchResults(response.data);
        });
}

// Render search results
function renderSearchResults(users) {
    var searchResults = document.getElementById('search-results');
    searchResults.innerHTML = '';
    
    if (users.length === 0) {
        searchResults.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><h3>Пользователи не найдены</h3></div>';
        return;
    }
    
    users.forEach(function(user) {
        var displayName = user.display_name || user.username;
        var username = '@' + user.username;
        
        var userElement = document.createElement('div');
        userElement.className = 'search-result';
        userElement.onclick = function() {
            navigateTo('profile', { userId: user.id });
        };
        
        userElement.innerHTML = '
            <img src="' + (user.avatar_url || getDefaultAvatar(user.username)) + '" alt="Avatar" class="search-result-avatar">
            <div class="search-result-info">
                <h4>' + escapeHtml(displayName) + '</h4>
                <p>' + escapeHtml(username) + '</p>
            </div>
        ';
        
        searchResults.appendChild(userElement);
    });
}

// ============================================
// SHOP
// ============================================

// Switch shop tab
function switchShopTab(category) {
    currentShopTab = category;
    
    var tabs = document.querySelectorAll('.shop-tab');
    tabs.forEach(function(tab) {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');
    
    loadShopItems();
}

// Load shop items
function loadShopItems() {
    var query = supabase.from('shop_items').select('*').eq('is_active', true);
    
    if (currentShopTab !== 'all') {
        query = query.eq('category', currentShopTab);
    }
    
    query.order('price', { ascending: true })
        .then(function(response) {
            if (response.error) {
                showToast('Ошибка загрузки товаров: ' + response.error.message, 'error');
                return;
            }
            
            renderShopItems(response.data);
        });
}

// Render shop items
function renderShopItems(items) {
    var shopItemsElement = document.getElementById('shop-items');
    shopItemsElement.innerHTML = '';
    
    if (items.length === 0) {
        shopItemsElement.innerHTML = '<div class="empty-state"><i class="fas fa-store-slash"></i><h3>Нет товаров</h3></div>';
        return;
    }
    
    items.forEach(function(item) {
        var itemElement = document.createElement('div');
        itemElement.className = 'shop-item-card';
        itemElement.onclick = function() {
            showShopItemDetails(item);
        };
        
        var imageHtml = '';
        if (item.image_url) {
            imageHtml = '<img src="' + escapeHtml(item.image_url) + '" alt="' + escapeHtml(item.name) + '">';
        } else {
            var icons = {
                'avatar_frame': 'fa-user-circle',
                'banner': 'fa-image',
                'badge': 'fa-award',
                'effect': 'fa-sparkles'
            };
            imageHtml = '<i class="fas ' + (icons[item.category] || 'fa-gem') + '"></i>';
        }
        
        itemElement.innerHTML = '
            <div class="shop-item-image">
                ' + imageHtml + '
            </div>
            <div class="shop-item-info">
                <h3 class="shop-item-name">' + escapeHtml(item.name) + '</h3>
                <p class="shop-item-description">' + escapeHtml(item.description) + '</p>
            </div>
            <div class="shop-item-price">
                <span>' + item.price + ' Gems</span>
                <button class="shop-item-buy" onclick="event.stopPropagation(); buyShopItem(\'' + item.id + '\')">Купить</button>
            </div>
        ';
        
        shopItemsElement.appendChild(itemElement);
    });
}

// Buy shop item
function buyShopItem(itemId) {
    if (!currentUser) {
        showToast('Авторизуйтесь, чтобы покупать товары', 'error');
        return;
    }
    
    // Check user gems
    supabase.from('gems').select('amount').eq('user_id', currentUser.id).single()
        .then(function(response) {
            if (response.error || !response.data) {
                showToast('Ошибка проверки баланса', 'error');
                return;
            }
            
            var userGems = response.data.amount;
            
            // Get item price
            supabase.from('shop_items').select('price, name').eq('id', itemId).single()
                .then(function(itemResponse) {
                    if (itemResponse.error || !itemResponse.data) {
                        showToast('Товар не найден', 'error');
                        return;
                    }
                    
                    var itemPrice = itemResponse.data.price;
                    
                    if (userGems < itemPrice) {
                        showToast('Недостаточно Gems', 'error');
                        return;
                    }
                    
                    // Confirm purchase
                    if (confirm('Купить ' + escapeHtml(itemResponse.data.name) + ' за ' + itemPrice + ' Gems?')) {
                        // Deduct gems
                        supabase.from('gems').update({ amount: userGems - itemPrice }).eq('user_id', currentUser.id)
                            .then(function(gemsResponse) {
                                if (gemsResponse.error) {
                                    showToast('Ошибка списания Gems: ' + gemsResponse.error.message, 'error');
                                    return;
                                }
                                
                                // Add to inventory
                                supabase.from('user_inventory').insert({
                                    user_id: currentUser.id,
                                    shop_item_id: itemId,
                                    is_equipped: false
                                })
                                    .then(function(inventoryResponse) {
                                        if (inventoryResponse.error) {
                                            showToast('Ошибка добавления в инвентарь: ' + inventoryResponse.error.message, 'error');
                                            // Refund gems
                                            supabase.from('gems').update({ amount: userGems }).eq('user_id', currentUser.id);
                                            return;
                                        }
                                        
                                        // Record transaction
                                        supabase.from('gem_transactions').insert({
                                            user_id: currentUser.id,
                                            amount: -itemPrice,
                                            transaction_type: 'purchase',
                                            description: 'Покупка: ' + itemResponse.data.name,
                                            related_id: itemId
                                        });
                                        
                                        showToast('Покупка успешна!', 'success');
                                        loadUserGems();
                                        loadInventory();
                                    });
                            });
                    }
                });
        });
}

// Load user gems
function loadUserGems() {
    if (!currentUser) return;
    
    supabase.from('gems').select('amount').eq('user_id', currentUser.id).single()
        .then(function(response) {
            if (response.error || !response.data) {
                document.getElementById('user-gems').textContent = '0';
                return;
            }
            document.getElementById('user-gems').textContent = response.data.amount;
        });
}

// Show shop item details
function showShopItemDetails(item) {
    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = '
        <div class="modal">
            <h3>' + escapeHtml(item.name) + '</h3>
            <div class="shop-item-image" style="margin-bottom: 16px;">
                ' + (item.image_url ? '<img src="' + escapeHtml(item.image_url) + '" alt="' + escapeHtml(item.name) + '">' : '<i class="fas fa-gem" style="font-size: 48px; color: var(--accent-primary);"></i>') + '
            </div>
            <p style="margin-bottom: 16px;">' + escapeHtml(item.description) + '</p>
            <p style="margin-bottom: 16px;"><strong>Цена:</strong> ' + item.price + ' Gems</p>
            <p style="margin-bottom: 16px;"><strong>Категория:</strong> ' + escapeHtml(item.category) + '</p>
            <div class="modal-actions">
                <button class="modal-btn secondary" onclick="this.closest(\".modal-overlay\").remove()">Отмена</button>
                <button class="modal-btn primary" onclick="buyShopItem(\'' + item.id + '\'); this.closest(\".modal-overlay\").remove();">Купить</button>
            </div>
        </div>
    ';
    
    document.body.appendChild(modal);
}

// ============================================
// INVENTORY
// ============================================

// Load inventory
function loadInventory() {
    if (!currentUser) return;
    
    var query = supabase.from('user_inventory').select('*, shop_items(*)').eq('user_id', currentUser.id);
    
    switch (currentInventoryTab) {
        case 'equipped':
            query = query.eq('is_equipped', true);
            break;
        case 'frames':
            query = query.eq('shop_items.category', 'avatar_frame');
            break;
        case 'banners':
            query = query.eq('shop_items.category', 'banner');
            break;
        case 'badges':
            query = query.eq('shop_items.category', 'badge');
            break;
    }
    
    query.order('purchased_at', { ascending: false })
        .then(function(response) {
            if (response.error) {
                showToast('Ошибка загрузки инвентаря: ' + response.error.message, 'error');
                return;
            }
            
            renderInventory(response.data);
        });
}

// Switch inventory tab
function switchInventoryTab(tab) {
    currentInventoryTab = tab;
    
    var tabs = document.querySelectorAll('.inventory-tab');
    tabs.forEach(function(tabElement) {
        tabElement.classList.remove('active');
    });
    event.target.classList.add('active');
    
    loadInventory();
}

// Render inventory
function renderInventory(items) {
    var inventoryItemsElement = document.getElementById('inventory-items');
    inventoryItemsElement.innerHTML = '';
    
    if (items.length === 0) {
        inventoryItemsElement.innerHTML = '<div class="empty-state"><i class="fas fa-box-open"></i><h3>Инвентарь пуст</h3><p>Купите товары в магазине</p></div>';
        return;
    }
    
    items.forEach(function(item) {
        var shopItem = item.shop_items;
        var isEquipped = item.is_equipped;
        
        var itemElement = document.createElement('div');
        itemElement.className = 'inventory-item ' + (isEquipped ? 'equipped' : '');
        
        var imageHtml = '';
        if (shopItem.image_url) {
            imageHtml = '<img src="' + escapeHtml(shopItem.image_url) + '" alt="' + escapeHtml(shopItem.name) + '">';
        } else {
            var icons = {
                'avatar_frame': 'fa-user-circle',
                'banner': 'fa-image',
                'badge': 'fa-award',
                'effect': 'fa-sparkles'
            };
            imageHtml = '<i class="fas ' + (icons[shopItem.category] || 'fa-gem') + '"></i>';
        }
        
        itemElement.innerHTML = '
            <div class="inventory-item-image">
                ' + imageHtml + '
            </div>
            <div class="inventory-item-info">
                <h4 class="inventory-item-name">' + escapeHtml(shopItem.name) + '</h4>
                <p class="inventory-item-category">' + escapeHtml(shopItem.category) + '</p>
            </div>
            <div class="inventory-item-actions">
                <button class="inventory-action-btn ' + (isEquipped ? 'equipped' : '') + '" onclick="toggleEquip(\'' + item.id + '\', \'' + shopItem.category + '\', this)">
                    <i class="fas ' + (isEquipped ? 'fa-check' : 'fa-plus') + '"></i>
                </button>
            </div>
        ';
        
        inventoryItemsElement.appendChild(itemElement);
    });
}

// Toggle equip/unequip item
function toggleEquip(inventoryId, category, buttonElement) {
    if (!currentUser) return;
    
    var isEquipped = buttonElement.closest('.inventory-item').classList.contains('equipped');
    
    if (isEquipped) {
        // Unequip
        supabase.from('user_inventory').update({ is_equipped: false }).eq('id', inventoryId)
            .then(function(response) {
                if (response.error) {
                    showToast('Ошибка: ' + response.error.message, 'error');
                    return;
                }
                buttonElement.closest('.inventory-item').classList.remove('equipped');
                buttonElement.classList.remove('equipped');
                buttonElement.innerHTML = '<i class="fas fa-plus"></i>';
                showToast('Товар снят', 'success');
                
                // Refresh profile to update frame
                if (category === 'avatar_frame' && currentProfileUser && currentProfileUser.id === currentUser.id) {
                    checkAvatarFrame(currentUser.id);
                }
            });
    } else {
        // Equip - first unequip any other item in the same category
        supabase.from('user_inventory').update({ is_equipped: false }).eq('user_id', currentUser.id).eq('shop_item_id', function() {
            return this.select('shop_items!inner(*)').eq('shop_items.category', category);
        })
            .then(function() {
                supabase.from('user_inventory').update({ is_equipped: true }).eq('id', inventoryId)
                    .then(function(response) {
                        if (response.error) {
                            showToast('Ошибка: ' + response.error.message, 'error');
                            return;
                        }
                        buttonElement.closest('.inventory-item').classList.add('equipped');
                        buttonElement.classList.add('equipped');
                        buttonElement.innerHTML = '<i class="fas fa-check"></i>';
                        showToast('Товар активирован', 'success');
                        
                        // Refresh profile to update frame
                        if (category === 'avatar_frame' && currentProfileUser && currentProfileUser.id === currentUser.id) {
                            checkAvatarFrame(currentUser.id);
                        }
                    });
            });
    }
}

// ============================================
// NOTIFICATIONS
// ============================================

// Load notifications
function loadNotifications() {
    if (!currentUser) return;
    
    supabase.from('notifications').select('*, sender:users!notifications_sender_id_fkey, chats!inner(*)').eq('recipient_id', currentUser.id).order('created_at', { ascending: false })
        .then(function(response) {
            if (response.error) {
                showToast('Ошибка загрузки уведомлений: ' + response.error.message, 'error');
                return;
            }
            
            notifications = response.data;
            renderNotifications(notifications);
            updateUnreadCount();
        });
}

// Render notifications
function renderNotifications(notifications) {
    var notificationsList = document.getElementById('notifications-list');
    notificationsList.innerHTML = '';
    
    if (notifications.length === 0) {
        notificationsList.innerHTML = '<div class="empty-state"><i class="fas fa-bell-slash"></i><h3>Нет уведомлений</h3></div>';
        return;
    }
    
    notifications.forEach(function(notification) {
        var sender = notification.sender || {};
        var displayName = sender.display_name || sender.username || 'Пользователь';
        var username = '@' + (sender.username || '');
        var timeAgo = getTimeAgo(notification.created_at);
        
        var message = '';
        switch (notification.notification_type) {
            case 'like':
                message = '<span>' + escapeHtml(displayName) + '</span> лайкнул ваш chirp';
                break;
            case 'comment':
                message = '<span>' + escapeHtml(displayName) + '</span> прокомментировал ваш chirp';
                break;
            case 'rechirp':
                message = '<span>' + escapeHtml(displayName) + '</span> сделали речирп вашего chirpa';
                break;
            case 'follow':
                message = '<span>' + escapeHtml(displayName) + '</span> подписался на вас';
                break;
            case 'message':
                message = '<span>' + escapeHtml(displayName) + '</span> отправил вам сообщение';
                break;
            case 'mention':
                message = '<span>' + escapeHtml(displayName) + '</span> упомянул вас';
                break;
            default:
                message = 'Новое уведомление';
        }
        
        var iconClass = '';
        switch (notification.notification_type) {
            case 'like': iconClass = 'fa-heart'; break;
            case 'comment': iconClass = 'fa-comment'; break;
            case 'rechirp': iconClass = 'fa-retweet'; break;
            case 'follow': iconClass = 'fa-user-plus'; break;
            case 'message': iconClass = 'fa-envelope'; break;
            case 'mention': iconClass = 'fa-at'; break;
        }
        
        var notificationElement = document.createElement('div');
        notificationElement.className = 'notification ' + (notification.is_read ? '' : 'unread');
        notificationElement.onclick = function() {
            markNotificationAsRead(notification.id);
            handleNotificationClick(notification);
        };
        
        notificationElement.innerHTML = '
            <div class="notification-icon ' + notification.notification_type + '">
                <i class="fas ' + iconClass + '"></i>
            </div>
            <div class="notification-content">
                <p>' + message + '</p>
            </div>
            <span class="notification-time">' + escapeHtml(timeAgo) + '</span>
        ';
        
        notificationsList.appendChild(notificationElement);
    });
}

// Mark notification as read
function markNotificationAsRead(notificationId) {
    supabase.from('notifications').update({ is_read: true }).eq('id', notificationId)
        .then(function(response) {
            if (response.error) {
                console.error('Error marking notification as read:', response.error);
            }
        });
}

// Handle notification click
function handleNotificationClick(notification) {
    switch (notification.notification_type) {
        case 'like':
        case 'comment':
        case 'rechirp':
            if (notification.chirp_id) {
                viewChirp(notification.chirp_id);
            }
            break;
        case 'follow':
            if (notification.sender_id) {
                navigateTo('profile', { userId: notification.sender_id });
            }
            break;
        case 'message':
            if (notification.chat_id) {
                // Find the chat user
                var chat = notification.chats || {};
                var otherUserId = chat.user1_id === currentUser.id ? chat.user2_id : chat.user1_id;
                
                supabase.from('users').select('*').eq('id', otherUserId).single()
                    .then(function(response) {
                        if (response.data) {
                            currentChatUser = response.data;
                            loadChatMessages(notification.chat_id);
                        }
                    });
            }
            break;
        case 'mention':
            if (notification.chirp_id) {
                viewChirp(notification.chirp_id);
            }
            break;
    }
}

// Update unread notification count
function updateUnreadCount() {
    if (!currentUser) return;
    
    supabase.from('notifications').select('id').eq('recipient_id', currentUser.id).eq('is_read', false)
        .then(function(response) {
            unreadNotifications = response.data ? response.data.length : 0;
            
            // Update badge if needed
            var navItem = document.querySelector('.nav-item[onclick*="notifications"]');
            if (navItem) {
                var badge = navItem.querySelector('.notification-badge');
                if (badge) {
                    badge.remove();
                }
                if (unreadNotifications > 0) {
                    var badgeElement = document.createElement('span');
                    badgeElement.className = 'notification-badge';
                    badgeElement.textContent = unreadNotifications;
                    navItem.appendChild(badgeElement);
                }
            }
        });
}

// ============================================
// SETTINGS
// ============================================

// Show settings
function showSettings() {
    navigateTo('settings');
}

// Edit profile
function editProfile() {
    navigateTo('edit-profile');
}

// Populate edit profile form
function populateEditProfileForm() {
    if (!currentUser) return;
    
    document.getElementById('edit-avatar').src = currentUser.avatar_url || getDefaultAvatar(currentUser.username);
    document.getElementById('edit-banner').src = currentUser.banner_url || '';
    document.getElementById('edit-display-name').value = currentUser.display_name || '';
    document.getElementById('edit-bio').value = currentUser.bio || '';
    document.getElementById('edit-website').value = currentUser.website || '';
    document.getElementById('edit-location').value = currentUser.location || '';
}

// Handle avatar upload
function handleAvatarUpload(event) {
    var file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showToast('Пожалуйста, загрузите изображение', 'error');
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
        showToast('Аватар не может превышать 5MB', 'error');
        return;
    }
    
    var preview = document.getElementById('edit-avatar');
    preview.src = URL.createObjectURL(file);
    
    // Upload to Supabase Storage
    showLoading();
    
    var fileName = Date.now() + '-avatar.' + file.name.split('.').pop();
    var filePath = 'avatars/' + currentUser.id + '/' + fileName;
    
    supabase.storage.from('avatars').upload(filePath, file)
        .then(function(response) {
            hideLoading();
            if (response.error) {
                showToast('Ошибка загрузки аватара: ' + response.error.message, 'error');
                return;
            }
            
            var publicUrl = supabase.storage.from('avatars').getPublicUrl(filePath).data.publicUrl;
            
            // Update user
            supabase.from('users').update({ avatar_url: publicUrl }).eq('id', currentUser.id)
                .then(function(updateResponse) {
                    if (updateResponse.error) {
                        showToast('Ошибка обновления аватара: ' + updateResponse.error.message, 'error');
                        return;
                    }
                    
                    currentUser.avatar_url = publicUrl;
                    showToast('Аватар обновлен', 'success');
                });
        });
}

// Handle banner upload
function handleBannerUpload(event) {
    var file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showToast('Пожалуйста, загрузите изображение', 'error');
        return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
        showToast('Баннер не может превышать 10MB', 'error');
        return;
    }
    
    var preview = document.getElementById('edit-banner');
    preview.src = URL.createObjectURL(file);
    
    // Upload to Supabase Storage
    showLoading();
    
    var fileName = Date.now() + '-banner.' + file.name.split('.').pop();
    var filePath = 'banners/' + currentUser.id + '/' + fileName;
    
    supabase.storage.from('banners').upload(filePath, file)
        .then(function(response) {
            hideLoading();
            if (response.error) {
                showToast('Ошибка загрузки баннера: ' + response.error.message, 'error');
                return;
            }
            
            var publicUrl = supabase.storage.from('banners').getPublicUrl(filePath).data.publicUrl;
            
            // Update user
            supabase.from('users').update({ banner_url: publicUrl }).eq('id', currentUser.id)
                .then(function(updateResponse) {
                    if (updateResponse.error) {
                        showToast('Ошибка обновления баннера: ' + updateResponse.error.message, 'error');
                        return;
                    }
                    
                    currentUser.banner_url = publicUrl;
                    showToast('Баннер обновлен', 'success');
                });
        });
}

// Save profile
function saveProfile() {
    if (!currentUser) return;
    
    var displayName = document.getElementById('edit-display-name').value.trim();
    var bio = document.getElementById('edit-bio').value.trim();
    var website = document.getElementById('edit-website').value.trim();
    var location = document.getElementById('edit-location').value.trim();
    
    // Filter profanity
    displayName = filterProfanity(displayName);
    bio = filterProfanity(bio);
    location = filterProfanity(location);
    
    // Sanitize
    displayName = sanitizeHTML(displayName);
    bio = sanitizeHTML(bio);
    website = sanitizeHTML(website);
    location = sanitizeHTML(location);
    
    showLoading();
    
    var updateData = {
        display_name: displayName,
        bio: bio,
        website: website,
        location: location
    };
    
    supabase.from('users').update(updateData).eq('id', currentUser.id)
        .then(function(response) {
            hideLoading();
            if (response.error) {
                showToast('Ошибка сохранения профиля: ' + response.error.message, 'error');
                return;
            }
            
            // Update current user
            currentUser.display_name = displayName;
            currentUser.bio = bio;
            currentUser.website = website;
            currentUser.location = location;
            
            showToast('Профиль обновлен', 'success');
            navigateTo('profile');
        });
}

// Change password
function changePassword() {
    var oldPassword = prompt('Введите текущий пароль:');
    if (!oldPassword) return;
    
    var newPassword = prompt('Введите новый пароль:');
    if (!newPassword) return;
    
    if (newPassword.length < 6) {
        showToast('Новый пароль должен содержать не менее 6 символов', 'error');
        return;
    }
    
    var confirmPassword = prompt('Подтвердите новый пароль:');
    if (newPassword !== confirmPassword) {
        showToast('Пароли не совпадают', 'error');
        return;
    }
    
    showLoading();
    
    // Verify old password
    hashPassword(oldPassword, currentUser.password_salt).then(function(hashedOldPassword) {
        if (hashedOldPassword !== currentUser.password_hash) {
            hideLoading();
            showToast('Неверный текущий пароль', 'error');
            return;
        }
        
        // Hash new password
        var newSalt = generateSalt();
        hashPassword(newPassword, newSalt).then(function(hashedNewPassword) {
            supabase.from('users').update({
                password_hash: hashedNewPassword,
                password_salt: newSalt
            }).eq('id', currentUser.id)
                .then(function(response) {
                    hideLoading();
                    if (response.error) {
                        showToast('Ошибка смены пароля: ' + response.error.message, 'error');
                        return;
                    }
                    
                    // Update current user
                    currentUser.password_hash = hashedNewPassword;
                    currentUser.password_salt = newSalt;
                    
                    showToast('Пароль изменен', 'success');
                });
        });
    });
}

// Toggle private account
function togglePrivateAccount() {
    // This is a placeholder - in a real app, you'd update the user's privacy settings
    showToast('Функция временно недоступна', 'info');
}

// ============================================
// ADMIN PANEL
// ============================================

// Switch admin tab
function switchAdminTab(tab) {
    currentAdminTab = tab;
    
    var tabs = document.querySelectorAll('.admin-tab');
    tabs.forEach(function(tabElement) {
        tabElement.classList.remove('active');
    });
    event.target.classList.add('active');
    
    var sections = document.querySelectorAll('.admin-section');
    sections.forEach(function(section) {
        section.style.display = 'none';
    });
    
    var sectionId = 'admin-' + tab;
    var section = document.getElementById(sectionId);
    if (section) {
        section.style.display = 'block';
    }
    
    switch (tab) {
        case 'stats':
            loadAdminStats();
            break;
        case 'users':
            searchAdminUsers();
            break;
        case 'reports':
            loadAdminReports();
            break;
        case 'gems':
            loadAdminGems();
            break;
    }
}

// Load admin stats
function loadAdminStats() {
    var statsPromises = [
        supabase.from('users').select('id'),
        supabase.from('chirps').select('id'),
        supabase.from('likes').select('id'),
        supabase.from('chats').select('id')
    ];
    
    Promise.all(statsPromises)
        .then(function(results) {
            document.getElementById('admin-total-users').textContent = results[0].data ? results[0].data.length : 0;
            document.getElementById('admin-total-chirps').textContent = results[1].data ? results[1].data.length : 0;
            document.getElementById('admin-total-likes').textContent = results[2].data ? results[2].data.length : 0;
            document.getElementById('admin-total-chats').textContent = results[3].data ? results[3].data.length : 0;
        });
}

// Search admin users
function searchAdminUsers() {
    var query = document.getElementById('admin-user-search').value.trim();
    
    var usersQuery = supabase.from('users').select('*').order('created_at', { ascending: false });
    
    if (query) {
        usersQuery = usersQuery.or('ilike(username,' + '%' + query + '%' + '),ilike(display_name,' + '%' + query + '%' + '),ilike(email,' + '%' + query + '%' + ')');
    }
    
    usersQuery.limit(50)
        .then(function(response) {
            if (response.error) {
                showToast('Ошибка загрузки пользователей: ' + response.error.message, 'error');
                return;
            }
            
            renderAdminUsers(response.data);
        });
}

// Render admin users
function renderAdminUsers(users) {
    var adminUsersList = document.getElementById('admin-users-list');
    adminUsersList.innerHTML = '';
    
    if (users.length === 0) {
        adminUsersList.innerHTML = '<div class="empty-state"><i class="fas fa-users-slash"></i><h3>Пользователи не найдены</h3></div>';
        return;
    }
    
    users.forEach(function(user) {
        var userElement = document.createElement('div');
        userElement.className = 'admin-list-item';
        
        var statusBadge = '';
        if (user.is_admin) {
            statusBadge = '<span class="badge badge-admin">Админ</span>';
        } else if (user.is_banned) {
            statusBadge = '<span class="badge badge-danger">Заблокирован</span>';
        }
        
        userElement.innerHTML = '
            <img src="' + (user.avatar_url || getDefaultAvatar(user.username)) + '" alt="Avatar" class="admin-avatar">
            <div class="admin-info">
                <h4>' + escapeHtml(user.display_name || user.username) + '</h4>
                <p>' + escapeHtml('@' + user.username) + '</p>
            </div>
            <div class="admin-actions">
                ' + statusBadge + '
                <button class="admin-btn" onclick="viewUserDetails(\'' + user.id + '\')">Просмотр</button>
                ' + (user.is_banned ? 
                    '<button class="admin-btn" onclick="unbanUser(\'' + user.id + '\')">Разблокировать</button>' :
                    '<button class="admin-btn danger" onclick="banUser(\'' + user.id + '\')">Заблокировать</button>') + '
            </div>
        ';
        
        adminUsersList.appendChild(userElement);
    });
}

// View user details
function viewUserDetails(userId) {
    navigateTo('profile', { userId: userId });
}

// Ban user
function banUser(userId) {
    var reason = prompt('Причина блокировки:');
    if (reason === null) return;
    
    supabase.from('users').update({
        is_banned: true,
        banned_reason: reason
    }).eq('id', userId)
        .then(function(response) {
            if (response.error) {
                showToast('Ошибка блокировки: ' + response.error.message, 'error');
                return;
            }
            
            showToast('Пользователь заблокирован', 'success');
            searchAdminUsers();
        });
}

// Unban user
function unbanUser(userId) {
    supabase.from('users').update({
        is_banned: false,
        banned_reason: null
    }).eq('id', userId)
        .then(function(response) {
            if (response.error) {
                showToast('Ошибка разблокировки: ' + response.error.message, 'error');
                return;
            }
            
            showToast('Пользователь разблокирован', 'success');
            searchAdminUsers();
        });
}

// Load admin reports
function loadAdminReports() {
    supabase.from('reports').select('*, reporter:users!reports_reporter_id_fkey, reported_user:users!reports_reported_user_id_fkey').order('created_at', { ascending: false })
        .then(function(response) {
            if (response.error) {
                showToast('Ошибка загрузки жалоб: ' + response.error.message, 'error');
                return;
            }
            
            renderAdminReports(response.data);
        });
}

// Render admin reports
function renderAdminReports(reports) {
    var adminReportsList = document.getElementById('admin-reports-list');
    adminReportsList.innerHTML = '';
    
    if (reports.length === 0) {
        adminReportsList.innerHTML = '<div class="empty-state"><i class="fas fa-flag-slash"></i><h3>Нет жалоб</h3></div>';
        return;
    }
    
    reports.forEach(function(report) {
        var reporter = report.reporter || {};
        var reportedUser = report.reported_user || {};
        
        var statusBadge = '';
        switch (report.status) {
            case 'pending': statusBadge = '<span class="badge" style="background: var(--warning);">Ожидает</span>'; break;
            case 'reviewed': statusBadge = '<span class="badge" style="background: var(--info);">Просмотрено</span>'; break;
            case 'resolved': statusBadge = '<span class="badge" style="background: var(--success);">Решено</span>'; break;
        }
        
        var reportElement = document.createElement('div');
        reportElement.className = 'admin-list-item';
        
        reportElement.innerHTML = '
            <div class="admin-info">
                <h4>Жалоба от ' + escapeHtml(reporter.display_name || reporter.username || 'Unknown') + '</h4>
                <p>На: ' + escapeHtml(reportedUser.display_name || reportedUser.username || 'Unknown') + '</p>
                <p>Тип: ' + escapeHtml(report.report_type) + '</p>
                <p>Описание: ' + escapeHtml(report.description || 'Нет описания') + '</p>
                <p>' + statusBadge + '</p>
            </div>
            <div class="admin-actions">
                <button class="admin-btn" onclick="viewReportDetails(\'' + report.id + '\')">Подробнее</button>
                <button class="admin-btn" onclick="resolveReport(\'' + report.id + '\')">Решить</button>
            </div>
        ';
        
        adminReportsList.appendChild(reportElement);
    });
}

// View report details
function viewReportDetails(reportId) {
    // This would show a modal with report details
    showToast('Функция временно недоступна', 'info');
}

// Resolve report
function resolveReport(reportId) {
    supabase.from('reports').update({
        status: 'resolved',
        reviewed_by: currentUser.id,
        reviewed_at: new Date().toISOString()
    }).eq('id', reportId)
        .then(function(response) {
            if (response.error) {
                showToast('Ошибка: ' + response.error.message, 'error');
                return;
            }
            
            showToast('Жалоба помечена как решенная', 'success');
            loadAdminReports();
        });
}

// Load admin gems
function loadAdminGems() {
    supabase.from('gem_transactions').select('*, users!gem_transactions_user_id_fkey').order('created_at', { ascending: false }).limit(50)
        .then(function(response) {
            if (response.error) {
                showToast('Ошибка загрузки транзакций: ' + response.error.message, 'error');
                return;
            }
            
            renderAdminGems(response.data);
        });
}

// Render admin gems
function renderAdminGems(transactions) {
    var adminGemsList = document.getElementById('admin-gems-list');
    adminGemsList.innerHTML = '';
    
    if (transactions.length === 0) {
        adminGemsList.innerHTML = '<div class="empty-state"><i class="fas fa-gem"></i><h3>Нет транзакций</h3></div>';
        return;
    }
    
    transactions.forEach(function(transaction) {
        var user = transaction.users || {};
        var displayName = user.display_name || user.username || 'Unknown';
        
        var amountClass = transaction.amount >= 0 ? 'text-success' : 'text-error';
        var amountText = (transaction.amount >= 0 ? '+' : '') + transaction.amount + ' Gems';
        
        var transactionElement = document.createElement('div');
        transactionElement.className = 'admin-list-item';
        
        transactionElement.innerHTML = '
            <div class="admin-info">
                <h4>' + escapeHtml(displayName) + '</h4>
                <p>Тип: ' + escapeHtml(transaction.transaction_type) + '</p>
                <p>Сумма: <span class="' + amountClass + '">' + escapeHtml(amountText) + '</span></p>
                <p>Описание: ' + escapeHtml(transaction.description || 'Нет описания') + '</p>
            </div>
        ';
        
        adminGemsList.appendChild(transactionElement);
    });
}

// Grant gems to user
function grantGems() {
    var username = document.getElementById('gems-username').value.trim();
    var amount = parseInt(document.getElementById('gems-amount').value);
    
    if (!username || isNaN(amount) || amount <= 0) {
        showToast('Пожалуйста, введите имя пользователя и количество Gems', 'error');
        return;
    }
    
    // Find user by username
    supabase.from('users').select('id').eq('username', username).single()
        .then(function(response) {
            if (response.error || !response.data) {
                showToast('Пользователь не найден', 'error');
                return;
            }
            
            var userId = response.data.id;
            
            // Add gems
            supabase.from('gems').upsert({
                user_id: userId,
                amount: supabase.rpc('increment', { table: 'gems', column: 'amount', id: userId, amount: amount })
            })
                .then(function(gemsResponse) {
                    if (gemsResponse.error) {
                        showToast('Ошибка выдачи Gems: ' + gemsResponse.error.message, 'error');
                        return;
                    }
                    
                    // Record transaction
                    supabase.from('gem_transactions').insert({
                        user_id: userId,
                        amount: amount,
                        transaction_type: 'admin_grant',
                        description: 'Выдано админом: ' + currentUser.username,
                        related_id: null
                    });
                    
                    showToast('Gems выданы', 'success');
                    document.getElementById('gems-username').value = '';
                    document.getElementById('gems-amount').value = '';
                    loadAdminGems();
                });
        });
}

// ============================================
// REALTIME SUBSCRIPTIONS
// ============================================

// Setup realtime subscriptions
function setupRealtimeSubscriptions() {
    if (!currentUser) return;
    
    // Subscribe to new notifications
    supabase.channel('notifications_' + currentUser.id)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'recipient_id=eq.' + currentUser.id }, function(payload) {
            notifications.unshift(payload.new);
            unreadNotifications++;
            updateUnreadCount();
            
            // Show toast for new notification
            var senderName = payload.new.sender_display_name || payload.new.sender_username || 'Пользователь';
            showToast(senderName + ' отправил вам уведомление', 'info');
        })
        .subscribe();
    
    // Subscribe to new chat messages
    supabase.channel('chats_' + currentUser.id)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'chat_id=eq.any(array[' + getUserChatIds() + '])' }, function(payload) {
            if (payload.new.sender_id !== currentUser.id) {
                // New message from someone else
                var chatId = payload.new.chat_id;
                var senderId = payload.new.sender_id;
                
                // Check if this chat is currently open
                if (currentChat && currentChat.id === chatId) {
                    // Just append the message
                    var messageElement = createMessageElement(payload.new);
                    document.getElementById('chat-messages').appendChild(messageElement);
                    scrollToBottom('chat-messages');
                } else {
                    // Update chats list
                    loadChatsList();
                    
                    // Show toast
                    getUserInfo(senderId).then(function(user) {
                        var displayName = user.display_name || user.username || 'Пользователь';
                        showToast(displayName + ' отправил вам сообщение', 'info');
                    });
                }
            }
        })
        .subscribe();
    
    // Subscribe to new chirps from followed users
    supabase.channel('feed_' + currentUser.id)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chirps', filter: 'user_id=eq.any(array[' + getFollowedUserIds() + '])' }, function(payload) {
            if (currentScreen === 'home' && feedTab === 'following') {
                // Prepend new chirp to feed
                var feedContainer = document.getElementById('feed-content');
                if (feedContainer) {
                    renderChirp(payload.new, feedContainer, { prepend: true });
                }
            }
        })
        .subscribe();
    
    // Subscribe to like changes on user's chirps
    supabase.channel('likes_' + currentUser.id)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'likes', filter: 'chirp_id=eq.any(array[' + getUserChirpIds() + '])' }, function(payload) {
            // Update like count on the chirp in the feed
            var chirpId = payload.new.chirp_id;
            var likeCountElements = document.querySelectorAll('.chirp-card[data-chirp-id="' + chirpId + '"] .chirp-stat:first-child span');
            likeCountElements.forEach(function(element) {
                element.textContent = parseInt(element.textContent) + 1;
            });
        })
        .subscribe();
}

// Get user chat IDs for realtime subscription
function getUserChatIds() {
    // This is a simplified version - in a real app, you'd fetch the actual chat IDs
    return '';
}

// Get followed user IDs for realtime subscription
function getFollowedUserIds() {
    // Simplified version
    return '';
}

// Get user chirp IDs for realtime subscription
function getUserChirpIds() {
    // Simplified version
    return '';
}

// Get user info by ID
function getUserInfo(userId) {
    return supabase.from('users').select('*').eq('id', userId).single()
        .then(function(response) {
            return response.data || {};
        });
}

// Create message element
function createMessageElement(message) {
    var user = message.users || {};
    var isOutgoing = user.id === currentUser.id;
    var timeAgo = getTimeAgo(message.created_at);
    var content = sanitizeHTML(message.content);
    
    var messageElement = document.createElement('div');
    messageElement.className = 'chat-message ' + (isOutgoing ? 'outgoing' : 'incoming');
    messageElement.innerHTML = '
        <p class="chat-message-text">' + content + '</p>
        <span class="chat-message-time">' + escapeHtml(timeAgo) + '</span>
    ';
    
    return messageElement;
}

// Scroll to bottom of element
function scrollToBottom(elementId) {
    setTimeout(function() {
        var element = document.getElementById(elementId);
        if (element) {
            element.scrollTop = element.scrollHeight;
        }
    }, 100);
}

// Sync data when coming back online
function syncData() {
    if (currentUser) {
        loadNotifications();
        loadChatsList();
        if (currentScreen === 'home') {
            loadFeed(feedTab);
        }
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Show loading overlay
function showLoading() {
    if (loadingOverlayElement) {
        loadingOverlayElement.classList.remove('hidden');
    }
}

// Hide loading overlay
function hideLoading() {
    if (loadingOverlayElement) {
        loadingOverlayElement.classList.add('hidden');
    }
}

// Show toast notification
function showToast(message, type) {
    type = type || 'info';
    
    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    
    toastContainerElement.appendChild(toast);
    
    // Auto-remove after 3 seconds
    setTimeout(function() {
        toast.remove();
    }, 3000);
}

// Show action sheet
function showActionSheet(actions) {
    var actionSheet = document.createElement('div');
    actionSheet.className = 'action-sheet';
    
    actions.forEach(function(action, index) {
        if (index > 0) {
            var separator = document.createElement('div');
            separator.className = 'action-sheet-separator';
            actionSheet.appendChild(separator);
        }
        
        var item = document.createElement('button');
        item.className = 'action-sheet-item ' + (action.danger ? 'danger' : '');
        item.innerHTML = '<i class="fas ' + action.icon + '"></i> ' + action.text;
        item.onclick = function() {
            actionSheet.remove();
            eval(action.action);
        };
        actionSheet.appendChild(item);
    });
    
    // Add cancel button
    var separator = document.createElement('div');
    separator.className = 'action-sheet-separator';
    actionSheet.appendChild(separator);
    
    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'action-sheet-item action-sheet-cancel';
    cancelBtn.innerHTML = '<i class="fas fa-times"></i> Отмена';
    cancelBtn.onclick = function() {
        actionSheet.remove();
    };
    actionSheet.appendChild(cancelBtn);
    
    document.body.appendChild(actionSheet);
}

// Hide all modals
function hideModals() {
    var modals = document.querySelectorAll('.modal-overlay, .action-sheet');
    modals.forEach(function(modal) {
        modal.remove();
    });
}

// Format date as time ago
function getTimeAgo(dateString) {
    var date = new Date(dateString);
    var now = new Date();
    var seconds = Math.floor((now - date) / 1000);
    
    var intervals = {
        'год': 31536000,
        'месяц': 2592000,
        'неделя': 604800,
        'день': 86400,
        'час': 3600,
        'минута': 60
    };
    
    for (var interval in intervals) {
        var count = Math.floor(seconds / intervals[interval]);
        if (count >= 1) {
            var plural = count === 1 ? '' : (count >= 2 && count <= 4 ? 'а' : '');
            return count + ' ' + interval + plural + ' назад';
        }
    }
    
    return 'Только что';
}

// Escape HTML special characters
function escapeHtml(text) {
    if (!text) return '';
    var map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// Sanitize HTML to prevent XSS
function sanitizeHTML(text) {
    if (!text) return '';
    
    // First, escape HTML
    text = escapeHtml(text);
    
    // Then, allow some safe HTML tags
    text = text.replace(/\([^\s]+)/g, function(match) {
        // Handle mentions
        var username = match.substring(1);
        return '<span class="mention">@' + escapeHtml(username) + '</span>';
    });
    
    text = text.replace(/#([^\s]+)/g, function(match) {
        // Handle hashtags
        var hashtag = match.substring(1);
        return '<span class="hashtag">#' + escapeHtml(hashtag) + '</span>';
    });
    
    // Allow line breaks
    text = text.replace(/\n/g, '<br>');
    
    return text;
}

// Filter profanity
function filterProfanity(text) {
    if (!text) return '';
    
    var profanityList = ['хуй', 'пизда', 'ебать', 'блядь', 'сука', 'залупа', 'пиздец', 'говно', 'мудак', 'пидар', 'еблан', 'лох', 'долбоёб', 'жопа', 'чмо', 'уёбок'];
    
    var filtered = text;
    profanityList.forEach(function(word) {
        var regex = new RegExp(word, 'gi');
        var replacement = '';
        for (var i = 0; i < word.length; i++) {
            replacement += '*';
        }
        filtered = filtered.replace(regex, replacement);
    });
    
    return filtered;
}

// Check if user is admin
function isAdmin() {
    return currentUser && currentUser.is_admin;
}

// ============================================
// INITIALIZE APPLICATION
// ============================================

// Start the application when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    init();
});

// Also run on load in case DOMContentLoaded was missed
window.onload = function() {
    if (!document.getElementById('app')) {
        init();
    }
};
