/**
 * Nobu Social — Core Application Module
 * Professional-grade social networking client
 * @version 2.0.0
 */

const NobuSocial = (() => {
    'use strict';

    // ==================== Configuration ====================
    const CONFIG = {
        supabase: {
            url: 'https://iljsednetiogjtowlexo.supabase.co',
            publishableKey: 'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O'
        },
        storage: {
            nickname: 'nobu_nickname',
            userId: 'nobu_user_id',
            verified: 'nobu_verified',
            avatar: 'nobu_avatar',
            lastPostTime: 'nobu_last_post_time'
        },
        admin: {
            password: 'nobuadmin2024',
            verifyPassword: 'NobuSocialAdmin2024'
        },
        limits: {
            maxPostLength: 500,
            postCooldownMs: 5000,
            maxImageSizeMB: 5,
            maxAvatarSizeMB: 2
        },
        feed: {
            refreshIntervalMs: 5000
        }
    };

    // ==================== State Management ====================
    const State = {
        currentUserId: null,
        currentNickname: '',
        isVerified: false,
        avatarUrl: null,
        isAdmin: false,
        isPublishing: false,
        likedPostIds: new Set(),
        bannedUserIds: new Set(),
        selectedImageFile: null,
        subscriptions: {
            realtime: null,
            refreshInterval: null,
            bannedUsersInterval: null
        }
    };

    // ==================== Supabase Client ====================
    const supabase = window.supabase.createClient(
        CONFIG.supabase.url,
        CONFIG.supabase.publishableKey
    );

    // ==================== DOM References ====================
    const DOM = {
        get: (selector, parent = document) => parent.querySelector(selector),
        getAll: (selector, parent = document) => parent.querySelectorAll(selector),
        byId: (id) => document.getElementById(id)
    };

    // Cache all frequently used elements
    const Elements = {
        nicknameDisplay: DOM.byId('nicknameDisplay'),
        nicknameText: DOM.byId('nicknameText'),
        avatarInitial: DOM.byId('avatarInitial'),
        avatarCircle: DOM.byId('avatarCircle'),
        editNicknameBtn: DOM.byId('editNicknameBtn'),
        nicknameEditor: DOM.byId('nicknameEditor'),
        nicknameInput: DOM.byId('nicknameInput'),
        saveNicknameBtn: DOM.byId('saveNicknameBtn'),
        cancelNicknameBtn: DOM.byId('cancelNicknameBtn'),
        composerAvatar: DOM.get('.composer-avatar'),
        composerAvatarInitial: DOM.byId('composerAvatarInitial'),
        composerNickname: DOM.byId('composerNickname'),
        postTextarea: DOM.byId('postTextarea'),
        charCount: DOM.byId('charCount'),
        publishBtn: DOM.byId('publishBtn'),
        composerError: DOM.byId('composerError'),
        composerErrorText: DOM.byId('composerErrorText'),
        postsFeed: DOM.byId('postsFeed'),
        feedLoading: DOM.byId('feedLoading'),
        feedEmpty: DOM.byId('feedEmpty'),
        feedError: DOM.byId('feedError'),
        feedErrorText: DOM.byId('feedErrorText'),
        retryBtn: DOM.byId('retryBtn'),
        statusDot: DOM.byId('statusDot'),
        statusText: DOM.byId('statusText'),
        composerBody: DOM.get('.composer-body')
    };

    // ==================== Utility Functions ====================
    const Utils = {
        escapeHtml(text) {
            if (!text || typeof text !== 'string') return '';
            const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
            return text.replace(/[&<>"']/g, (m) => map[m]);
        },

        generateUUID() {
            return crypto.randomUUID();
        },

        isValidUUID(str) {
            return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
        },

        formatDate(dateStr) {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return '';
            const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
            if (diffSec < 60) return 'только что';
            const diffMin = Math.floor(diffSec / 60);
            if (diffMin < 60) return `${diffMin} мин. назад`;
            const diffHour = Math.floor(diffMin / 60);
            if (diffHour < 24) return `${diffHour} ч. назад`;
            const diffDay = Math.floor(diffHour / 24);
            if (diffDay < 7) return `${diffDay} дн. назад`;
            return date.toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            });
        },

        canPublish() {
            const lastTime = parseInt(localStorage.getItem(CONFIG.storage.lastPostTime) || '0', 10);
            return (Date.now() - lastTime) >= CONFIG.limits.postCooldownMs;
        },

        setLastPostTime() {
            localStorage.setItem(CONFIG.storage.lastPostTime, Date.now().toString());
        },

        isSpamText(text) {
            if (!text || text.length < 5) return false;
            const freq = {};
            for (const char of text) freq[char] = (freq[char] || 0) + 1;
            const maxFreq = Math.max(...Object.values(freq));
            const ratio = maxFreq / text.length;
            const uniqueCount = Object.keys(freq).length;
            if (ratio > 0.7 && text.length > 5) return true;
            if (uniqueCount <= 2 && text.length > 10) return true;
            for (let len = 1; len <= 4; len++) {
                const pattern = text.substring(0, len);
                if (!pattern) continue;
                let repeats = true;
                for (let i = 0; i < text.length; i += len) {
                    if (text.substring(i, i + len) !== pattern) {
                        repeats = false;
                        break;
                    }
                }
                if (repeats && text.length > len * 3) return true;
            }
            return false;
        }
    };

    // ==================== Storage Manager ====================
    const StorageManager = {
        getUserId() {
            let userId = localStorage.getItem(CONFIG.storage.userId);
            if (!userId || !Utils.isValidUUID(userId)) {
                userId = Utils.generateUUID();
                localStorage.setItem(CONFIG.storage.userId, userId);
            }
            return userId;
        },

        getNickname() {
            return localStorage.getItem(CONFIG.storage.nickname) || '';
        },

        setNickname(nick) {
            localStorage.setItem(CONFIG.storage.nickname, nick);
        },

        getVerified() {
            return localStorage.getItem(CONFIG.storage.verified) === 'true';
        },

        setVerified(status) {
            localStorage.setItem(CONFIG.storage.verified, String(status));
        },

        getAvatar() {
            return localStorage.getItem(CONFIG.storage.avatar) || null;
        },

        setAvatar(url) {
            localStorage.setItem(CONFIG.storage.avatar, url);
        }
    };

    // ==================== UI Controller ====================
    const UI = {
        updateNicknameDisplay(nick) {
            const displayName = nick || 'Гость';
            Elements.nicknameText.textContent = displayName;
            Elements.composerNickname.textContent = displayName;
            this.updateVerifiedBadge();
            this.applyAvatar();
            this.updatePublishButton();
        },

        updateVerifiedBadge() {
            const existingBadge = Elements.composerNickname.querySelector('.verified-badge');
            if (State.isVerified && !existingBadge) {
                const badge = document.createElement('span');
                badge.className = 'verified-badge';
                badge.innerHTML = '<i class="fas fa-check"></i>';
                Elements.composerNickname.appendChild(badge);
            } else if (!State.isVerified && existingBadge) {
                existingBadge.remove();
            }
        },

        applyAvatar() {
            const url = State.avatarUrl;
            if (url) {
                Elements.avatarCircle.style.backgroundImage = `url(${url})`;
                Elements.avatarCircle.classList.add('has-image');
                Elements.avatarInitial.textContent = '';
                Elements.composerAvatar.style.backgroundImage = `url(${url})`;
                Elements.composerAvatar.style.backgroundSize = 'cover';
                Elements.composerAvatar.style.backgroundPosition = 'center';
                Elements.composerAvatarInitial.textContent = '';
            } else {
                const initial = State.currentNickname ? State.currentNickname.charAt(0).toUpperCase() : '?';
                Elements.avatarCircle.style.backgroundImage = '';
                Elements.avatarCircle.classList.remove('has-image');
                Elements.avatarInitial.textContent = initial;
                Elements.composerAvatar.style.backgroundImage = '';
                Elements.composerAvatarInitial.textContent = initial;
            }
            const preview = DOM.byId('avatarPreviewInEditor');
            if (preview) {
                if (url) {
                    preview.style.backgroundImage = `url(${url})`;
                    preview.classList.add('has-image');
                    preview.textContent = '';
                } else {
                    preview.style.backgroundImage = '';
                    preview.classList.remove('has-image');
                    preview.textContent = State.currentNickname ? State.currentNickname.charAt(0).toUpperCase() : '?';
                }
            }
        },

        showError(message) {
            if (message) {
                Elements.composerError.classList.remove('hidden');
                Elements.composerErrorText.textContent = message;
            } else {
                Elements.composerError.classList.add('hidden');
            }
        },

        updatePublishButton() {
            const hasContent = Elements.postTextarea.value.trim().length > 0 || State.selectedImageFile !== null;
            const blocked = State.bannedUserIds.has(State.currentUserId);
            const canPost = Utils.canPublish();
            Elements.publishBtn.disabled = blocked || !hasContent || !State.currentNickname || State.isPublishing || !canPost;
            if (blocked) this.showError('Ваш аккаунт заблокирован');
            else if (!canPost && hasContent) this.showError('Подождите 5 секунд перед следующей публикацией');
        },

        updateCharCounter() {
            const len = Elements.postTextarea.value.length;
            Elements.charCount.textContent = len;
            Elements.charCount.classList.remove('warning', 'danger');
            if (len >= 450 && len < 500) Elements.charCount.classList.add('warning');
            else if (len >= 500) Elements.charCount.classList.add('danger');
            this.updatePublishButton();
        },

        setFeedStatus(status, text) {
            Elements.statusDot.className = 'status-dot';
            if (status === 'connected') {
                Elements.statusDot.classList.add('connected');
                Elements.statusText.textContent = text || 'Подключено';
            } else if (status === 'connecting') {
                Elements.statusDot.classList.add('connecting');
                Elements.statusText.textContent = text || 'Подключение...';
            } else if (status === 'error') {
                Elements.statusDot.classList.add('error');
                Elements.statusText.textContent = text || 'Ошибка';
            }
        },

        showFeedLoading() {
            Elements.feedLoading.classList.remove('hidden');
            Elements.feedError.classList.add('hidden');
            Elements.feedEmpty.classList.add('hidden');
        },

        showFeedEmpty() {
            Elements.feedLoading.classList.add('hidden');
            Elements.feedError.classList.add('hidden');
            Elements.feedEmpty.classList.remove('hidden');
        },

        showFeedError(message) {
            Elements.feedLoading.classList.add('hidden');
            Elements.feedError.classList.remove('hidden');
            Elements.feedEmpty.classList.add('hidden');
            Elements.feedErrorText.textContent = message || 'Не удалось загрузить посты';
        },

        clearFeed() {
            DOM.getAll('.post-card', Elements.postsFeed).forEach(card => card.remove());
        }
    };

    // ==================== Post Renderer ====================
    const PostRenderer = {
        createCard(post) {
            if (State.bannedUserIds.has(post.user_id)) return null;

            const card = document.createElement('div');
            card.className = 'post-card';
            card.dataset.postId = post.id;
            card.dataset.userId = post.user_id;
            card.dataset.nickname = post.nickname;

            const avatarChar = post.nickname ? post.nickname.charAt(0).toUpperCase() : '?';
            const verifiedBadge = post.verified ? '<span class="verified-badge"><i class="fas fa-check"></i></span>' : '';
            const isLiked = State.likedPostIds.has(post.id);
            const likesCount = post.likes || 0;
            const safeContent = Utils.escapeHtml(post.content || '');
            const timeStr = Utils.formatDate(post.created_at);

            let imageHtml = '';
            if (post.image_url) {
                imageHtml = `
                    <div class="post-image">
                        <img src="${Utils.escapeHtml(post.image_url)}" 
                             alt="Изображение" 
                             loading="lazy" 
                             onclick="window.open('${Utils.escapeHtml(post.image_url)}', '_blank')">
                    </div>`;
            }

            card.innerHTML = `
                <div class="post-header">
                    <div class="post-avatar">${Utils.escapeHtml(avatarChar)}</div>
                    <div class="post-author-info">
                        <span class="post-nickname">${Utils.escapeHtml(post.nickname || 'Гость')}${verifiedBadge}</span>
                        <span class="post-time">${timeStr}</span>
                    </div>
                </div>
                ${post.content ? `<div class="post-content">${safeContent}</div>` : ''}
                ${imageHtml}
                <div class="post-actions">
                    <button class="like-btn ${isLiked ? 'liked' : ''}">
                        <i class="fas fa-heart"></i>
                        <span class="like-count">${likesCount}</span>
                    </button>
                </div>`;

            const likeBtn = DOM.get('.like-btn', card);
            likeBtn.addEventListener('click', () => LikeSystem.toggle(post.id, likeBtn));

            if (State.isAdmin) {
                AdminPanel.addCardButtons(card);
            }

            return card;
        },

        renderFeed(posts) {
            UI.clearFeed();
            if (!posts || posts.length === 0) {
                UI.showFeedEmpty();
                return;
            }
            const fragment = document.createDocumentFragment();
            posts.forEach(post => {
                const card = this.createCard(post);
                if (card) fragment.appendChild(card);
            });
            Elements.postsFeed.appendChild(fragment);
            if (Elements.postsFeed.children.length === 0) {
                UI.showFeedEmpty();
            }
        }
    };

    // ==================== Like System ====================
    const LikeSystem = {
        async toggle(postId, button) {
            if (!State.currentUserId) return;
            const isLiked = State.likedPostIds.has(postId);
            const countEl = DOM.get('.like-count', button);
            let count = parseInt(countEl?.textContent || '0', 10);

            if (isLiked) {
                State.likedPostIds.delete(postId);
                count = Math.max(0, count - 1);
                button.classList.remove('liked');
            } else {
                State.likedPostIds.add(postId);
                count++;
                button.classList.add('liked');
            }
            countEl.textContent = count;

            try {
                if (isLiked) {
                    const { error } = await supabase
                        .from('likes')
                        .delete()
                        .match({ post_id: postId, user_id: State.currentUserId });
                    if (error) throw error;
                } else {
                    const { error } = await supabase
                        .from('likes')
                        .insert({ post_id: postId, user_id: State.currentUserId });
                    if (error) throw error;
                }
            } catch (err) {
                console.error('[LikeSystem] Error:', err);
                if (isLiked) {
                    State.likedPostIds.add(postId);
                    count++;
                    button.classList.add('liked');
                } else {
                    State.likedPostIds.delete(postId);
                    count = Math.max(0, count - 1);
                    button.classList.remove('liked');
                }
                countEl.textContent = count;
            }
        },

        async loadUserLikes() {
            if (!State.currentUserId) return;
            try {
                const { data, error } = await supabase
                    .from('likes')
                    .select('post_id')
                    .eq('user_id', State.currentUserId);
                if (error) throw error;
                State.likedPostIds = new Set(data ? data.map(row => row.post_id) : []);
            } catch (err) {
                console.error('[LikeSystem] Load error:', err);
                State.likedPostIds = new Set();
            }
        }
    };

    // ==================== Feed Service ====================
    const FeedService = {
        async fetchPosts() {
            const { data, error } = await supabase
                .from('posts')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        },

        async publish(content, imageFile) {
            let imageUrl = null;
            if (imageFile) {
                imageUrl = await this.uploadImage(imageFile);
            }
            const { data, error } = await supabase
                .from('posts')
                .insert([{
                    user_id: State.currentUserId,
                    nickname: State.currentNickname,
                    content: content,
                    likes: 0,
                    verified: State.isVerified,
                    image_url: imageUrl
                }])
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async uploadImage(file) {
            const fileName = `post-images/${State.currentUserId}_${Date.now()}.${file.name.split('.').pop()}`;
            const { error } = await supabase.storage
                .from('post-images')
                .upload(fileName, file, { cacheControl: '3600', upsert: false });
            if (error) throw error;
            const { data } = supabase.storage
                .from('post-images')
                .getPublicUrl(fileName);
            return data.publicUrl;
        },

        async uploadAvatar(file) {
            const fileName = `avatars/${State.currentUserId}_avatar.${file.name.split('.').pop()}`;
            const { error } = await supabase.storage
                .from('post-images')
                .upload(fileName, file, { cacheControl: '3600', upsert: true });
            if (error) throw error;
            const { data } = supabase.storage
                .from('post-images')
                .getPublicUrl(fileName);
            return data.publicUrl;
        },

        async loadAndRender() {
            UI.showFeedLoading();
            try {
                const posts = await this.fetchPosts();
                PostRenderer.renderFeed(posts);
                UI.setFeedStatus('connected', 'Активно');
            } catch (err) {
                console.error('[FeedService] Load error:', err);
                UI.showFeedError('Не удалось загрузить посты');
                UI.setFeedStatus('error', 'Ошибка загрузки');
            }
        }
    };

    // ==================== Realtime Service ====================
    const RealtimeService = {
        connect() {
            if (State.subscriptions.realtime) {
                supabase.removeChannel(State.subscriptions.realtime);
            }
            UI.setFeedStatus('connecting', 'Подключение...');
            State.subscriptions.realtime = supabase
                .channel('posts-realtime')
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'posts'
                }, (payload) => {
                    const post = payload.new;
                    if (!State.bannedUserIds.has(post.user_id)) {
                        const card = PostRenderer.createCard(post);
                        if (card) {
                            const firstCard = DOM.get('.post-card', Elements.postsFeed);
                            if (firstCard) {
                                Elements.postsFeed.insertBefore(card, firstCard);
                            } else {
                                Elements.postsFeed.appendChild(card);
                            }
                            Elements.feedEmpty.classList.add('hidden');
                        }
                    }
                })
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'posts'
                }, (payload) => {
                    const updated = payload.new;
                    const card = DOM.get(`[data-post-id="${updated.id}"]`, Elements.postsFeed);
                    if (card) {
                        const countEl = DOM.get('.like-count', card);
                        if (countEl) countEl.textContent = updated.likes || 0;
                    }
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        UI.setFeedStatus('connected', 'Realtime');
                    } else if (status === 'CHANNEL_ERROR') {
                        UI.setFeedStatus('error', 'Ошибка');
                    }
                });
        },

        disconnect() {
            if (State.subscriptions.realtime) {
                supabase.removeChannel(State.subscriptions.realtime);
                State.subscriptions.realtime = null;
            }
        }
    };

    // ==================== Ban System ====================
    const BanSystem = {
        async loadBannedUsers() {
            try {
                const { data, error } = await supabase
                    .from('banned_users')
                    .select('user_id');
                if (error) throw error;
                State.bannedUserIds = new Set(data ? data.map(row => row.user_id) : []);
                UI.updatePublishButton();
            } catch (err) {
                console.error('[BanSystem] Load error:', err);
                State.bannedUserIds = new Set();
            }
        },

        async blockUser(userId, nickname) {
            try {
                const { error } = await supabase
                    .from('banned_users')
                    .upsert({ user_id: userId, nickname: nickname || 'Unknown' });
                if (error) throw error;
                State.bannedUserIds.add(userId);
                DOM.getAll(`[data-user-id="${userId}"]`, Elements.postsFeed)
                    .forEach(card => card.remove());
            } catch (err) {
                console.error('[BanSystem] Block error:', err);
            }
        },

        async unblockUser(userId) {
            try {
                const { error } = await supabase
                    .from('banned_users')
                    .delete()
                    .match({ user_id: userId });
                if (error) throw error;
                State.bannedUserIds.delete(userId);
                await FeedService.loadAndRender();
            } catch (err) {
                console.error('[BanSystem] Unblock error:', err);
            }
        },

        async banAllSpammers() {
            try {
                const { data } = await supabase
                    .from('posts')
                    .select('user_id, nickname, content');
                if (!data) return 0;
                const spammerIds = new Set();
                for (const post of data) {
                    if (Utils.isSpamText(post.content)) {
                        spammerIds.add(post.user_id);
                        await supabase.from('banned_users').upsert({
                            user_id: post.user_id,
                            nickname: post.nickname
                        });
                    }
                }
                for (const id of spammerIds) {
                    State.bannedUserIds.add(id);
                }
                DOM.getAll('.post-card', Elements.postsFeed).forEach(card => {
                    if (State.bannedUserIds.has(card.dataset.userId)) {
                        card.remove();
                    }
                });
                return spammerIds.size;
            } catch (err) {
                console.error('[BanSystem] Mass ban error:', err);
                return 0;
            }
        },

        async getBannedList() {
            try {
                const { data, error } = await supabase
                    .from('banned_users')
                    .select('*')
                    .order('created_at', { ascending: false });
                if (error) throw error;
                return data || [];
            } catch (err) {
                console.error('[BanSystem] List error:', err);
                return [];
            }
        }
    };

    // ==================== Admin Panel ====================
    const AdminPanel = {
        toggleBtn: null,
        modal: null,

        create() {
            this.toggleBtn = document.createElement('button');
            this.toggleBtn.className = 'admin-toggle-btn';
            this.toggleBtn.innerHTML = '<i class="fas fa-shield-haltered"></i>';
            this.toggleBtn.title = 'Админ-панель';
            document.body.appendChild(this.toggleBtn);

            this.modal = document.createElement('div');
            this.modal.className = 'admin-modal';
            this.modal.id = 'adminModal';
            this.modal.innerHTML = `
                <h3><i class="fas fa-crown"></i> Администрирование</h3>
                <input type="password" class="admin-password-input" placeholder="Пароль администратора" id="adminPasswordInput">
                <button class="admin-login-btn" id="adminLoginBtn">Войти</button>
                <div class="admin-error" id="adminError">Неверный пароль</div>
                <button class="ban-all-btn" id="banAllBtn" style="display:none;">
                    <i class="fas fa-gavel"></i> Забанить спамеров
                </button>
                <div id="bannedList" style="margin-top:14px; display:none;"></div>
            `;
            document.body.appendChild(this.modal);

            this.bindEvents();
        },

        bindEvents() {
            this.toggleBtn.addEventListener('click', () => {
                if (State.isAdmin) {
                    this.logout();
                } else {
                    this.modal.classList.toggle('active');
                }
            });

            DOM.byId('adminLoginBtn').addEventListener('click', () => this.login());
            DOM.byId('adminPasswordInput').addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.login();
            });

            DOM.byId('banAllBtn').addEventListener('click', async () => {
                if (!confirm('Забанить всех пользователей со спам-контентом?')) return;
                const count = await BanSystem.banAllSpammers();
                await this.renderBannedList();
                DOM.byId('bannedList').style.display = 'block';
                alert(`Заблокировано: ${count} пользователей`);
            });

            document.addEventListener('click', (e) => {
                if (!this.modal.contains(e.target) && e.target !== this.toggleBtn) {
                    this.modal.classList.remove('active');
                }
            });
        },

        login() {
            if (DOM.byId('adminPasswordInput').value === CONFIG.admin.password) {
                State.isAdmin = true;
                this.toggleBtn.classList.add('active');
                this.modal.classList.remove('active');
                DOM.byId('adminPasswordInput').value = '';
                DOM.byId('adminError').style.display = 'none';
                DOM.byId('banAllBtn').style.display = 'block';
                this.addAllCardButtons();
                this.renderBannedList().then(() => {
                    DOM.byId('bannedList').style.display = 'block';
                });
            } else {
                DOM.byId('adminError').style.display = 'block';
            }
        },

        logout() {
            State.isAdmin = false;
            this.toggleBtn.classList.remove('active');
            this.modal.classList.remove('active');
            DOM.byId('banAllBtn').style.display = 'none';
            DOM.byId('bannedList').style.display = 'none';
            this.removeAllCardButtons();
        },

        addCardButtons(card) {
            if (!State.isAdmin) return;
            const header = DOM.get('.post-header', card);
            if (!header) return;

            if (!DOM.get('.delete-post-btn', card)) {
                const delBtn = document.createElement('button');
                delBtn.className = 'delete-post-btn';
                delBtn.innerHTML = '<i class="fas fa-trash"></i>';
                delBtn.title = 'Удалить пост';
                delBtn.addEventListener('click', async () => {
                    if (!confirm('Удалить этот пост?')) return;
                    const { error } = await supabase
                        .from('posts')
                        .delete()
                        .match({ id: card.dataset.postId });
                    if (!error) card.remove();
                });
                header.appendChild(delBtn);
            }

            if (!DOM.get('.block-user-btn', card)) {
                const blockBtn = document.createElement('button');
                blockBtn.className = 'block-user-btn';
                blockBtn.innerHTML = '<i class="fas fa-user-slash"></i>';
                blockBtn.title = 'Заблокировать пользователя';
                blockBtn.addEventListener('click', async () => {
                    if (!confirm(`Заблокировать пользователя ${card.dataset.nickname}?`)) return;
                    await BanSystem.blockUser(card.dataset.userId, card.dataset.nickname);
                    DOM.getAll(`[data-user-id="${card.dataset.userId}"]`, Elements.postsFeed)
                        .forEach(c => c.remove());
                    await this.renderBannedList();
                    DOM.byId('bannedList').style.display = 'block';
                });
                header.appendChild(blockBtn);
            }
        },

        addAllCardButtons() {
            DOM.getAll('.post-card', Elements.postsFeed).forEach(card => {
                this.addCardButtons(card);
            });
        },

        removeAllCardButtons() {
            DOM.getAll('.delete-post-btn, .block-user-btn').forEach(btn => btn.remove());
        },

        async renderBannedList() {
            const container = DOM.byId('bannedList');
            if (!container) return;
            container.innerHTML = '<h4 style="margin-bottom:10px;color:#f87171;">🚫 Заблокированные пользователи</h4>';
            const list = await BanSystem.getBannedList();
            if (list.length === 0) {
                container.innerHTML += '<p style="color:#636376;">Список пуст</p>';
                return;
            }
            list.forEach(entry => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 0;color:#f1f1f5;border-bottom:1px solid rgba(255,255,255,0.05);';
                row.innerHTML = `<span style="font-size:0.85rem;">${Utils.escapeHtml(entry.nickname || 'Без ника')}</span>`;
                const unblockBtn = document.createElement('button');
                unblockBtn.className = 'unblock-btn';
                unblockBtn.textContent = 'Разблокировать';
                unblockBtn.addEventListener('click', async () => {
                    await BanSystem.unblockUser(entry.user_id);
                    await this.renderBannedList();
                    container.style.display = 'block';
                });
                row.appendChild(unblockBtn);
                container.appendChild(row);
            });
        }
    };

    // ==================== Composer ====================
    const Composer = {
        imagePreviewContainer: null,
        imagePreview: null,
        fileInput: null,

        init() {
            this.createImageUploadUI();
            this.bindEvents();
        },

        createImageUploadUI() {
            const toolbar = document.createElement('div');
            toolbar.className = 'composer-toolbar';
            const attachBtn = document.createElement('button');
            attachBtn.className = 'attach-btn';
            attachBtn.innerHTML = '<i class="fas fa-image"></i>';
            attachBtn.title = 'Прикрепить изображение';

            this.fileInput = document.createElement('input');
            this.fileInput.type = 'file';
            this.fileInput.accept = 'image/*';
            this.fileInput.style.display = 'none';

            this.imagePreviewContainer = document.createElement('div');
            this.imagePreviewContainer.className = 'image-preview-container';
            this.imagePreview = document.createElement('img');
            this.imagePreview.className = 'image-preview';
            this.imagePreview.alt = 'Предпросмотр';
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-image-btn';
            removeBtn.innerHTML = '<i class="fas fa-times"></i>';

            this.imagePreviewContainer.appendChild(this.imagePreview);
            this.imagePreviewContainer.appendChild(removeBtn);
            toolbar.appendChild(attachBtn);
            toolbar.appendChild(this.fileInput);

            const footer = DOM.get('.composer-footer', Elements.composerBody);
            Elements.composerBody.insertBefore(this.imagePreviewContainer, footer);
            Elements.composerBody.insertBefore(toolbar, this.imagePreviewContainer);

            attachBtn.addEventListener('click', () => this.fileInput.click());
            removeBtn.addEventListener('click', () => this.clearImage());
            this.fileInput.addEventListener('change', (e) => this.handleImageSelect(e));
        },

        handleImageSelect(event) {
            const file = event.target.files?.[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) {
                UI.showError('Выберите изображение');
                return;
            }
            if (file.size > CONFIG.limits.maxImageSizeMB * 1024 * 1024) {
                UI.showError(`Размер не более ${CONFIG.limits.maxImageSizeMB} МБ`);
                return;
            }
            State.selectedImageFile = file;
            const reader = new FileReader();
            reader.onload = (e) => {
                this.imagePreview.src = e.target.result;
                this.imagePreviewContainer.classList.add('active');
                UI.updatePublishButton();
            };
            reader.readAsDataURL(file);
            UI.showError('');
        },

        clearImage() {
            State.selectedImageFile = null;
            this.fileInput.value = '';
            this.imagePreview.src = '';
            this.imagePreviewContainer.classList.remove('active');
            UI.updatePublishButton();
        },

        async publish() {
            if (State.isPublishing) return;
            const content = Elements.postTextarea.value.trim();
            if (!content && !State.selectedImageFile) {
                UI.showError('Пост не может быть пустым');
                return;
            }
            if (State.bannedUserIds.has(State.currentUserId)) {
                UI.showError('Вы заблокированы');
                return;
            }
            if (content && Utils.isSpamText(content)) {
                UI.showError('Сообщение отклонено: обнаружен спам');
                return;
            }
            if (!Utils.canPublish()) {
                UI.showError('Подождите 5 секунд');
                return;
            }
            if (content.length > CONFIG.limits.maxPostLength) {
                UI.showError(`Максимум ${CONFIG.limits.maxPostLength} символов`);
                return;
            }

            State.isPublishing = true;
            UI.updatePublishButton();
            UI.showError('');
            Elements.publishBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

            try {
                await FeedService.publish(content, State.selectedImageFile);
                Utils.setLastPostTime();
                Elements.postTextarea.value = '';
                this.clearImage();
                UI.updateCharCounter();
                UI.showError('');
                await FeedService.loadAndRender();
            } catch (err) {
                console.error('[Composer] Publish error:', err);
                UI.showError('Ошибка публикации');
            } finally {
                State.isPublishing = false;
                Elements.publishBtn.innerHTML = '<i class="fas fa-paper-plane"></i><span>Опубликовать</span>';
                UI.updatePublishButton();
            }
        },

        bindEvents() {
            Elements.postTextarea.addEventListener('input', () => {
                UI.updateCharCounter();
                if (Elements.composerError.classList.contains('hidden') === false &&
                    Elements.composerErrorText.textContent.includes('Подождите') === false) {
                    UI.showError('');
                }
            });
            Elements.publishBtn.addEventListener('click', () => this.publish());
            Elements.postTextarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    this.publish();
                }
            });
        }
    };

    // ==================== Nickname Editor ====================
    const NicknameEditor = {
        init() {
            this.createAvatarUploadUI();
            this.bindEvents();
        },

        createAvatarUploadUI() {
            const avatarArea = document.createElement('div');
            avatarArea.className = 'avatar-upload-area';
            avatarArea.innerHTML = `
                <div class="current-avatar-preview" id="avatarPreviewInEditor"></div>
                <input type="file" id="avatarFileInput" accept="image/*" style="display:none">
                <button class="avatar-upload-btn" id="avatarUploadBtn">
                    <i class="fas fa-camera"></i> Сменить аватар
                </button>
            `;
            const buttonsContainer = Elements.saveNicknameBtn.parentNode;
            Elements.nicknameEditor.insertBefore(avatarArea, buttonsContainer);

            DOM.byId('avatarUploadBtn').addEventListener('click', () => {
                DOM.byId('avatarFileInput').click();
            });
            DOM.byId('avatarFileInput').addEventListener('change', async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (!file.type.startsWith('image/')) {
                    alert('Выберите изображение');
                    return;
                }
                if (file.size > CONFIG.limits.maxAvatarSizeMB * 1024 * 1024) {
                    alert(`Размер не более ${CONFIG.limits.maxAvatarSizeMB} МБ`);
                    return;
                }
                try {
                    const url = await FeedService.uploadAvatar(file);
                    State.avatarUrl = url;
                    StorageManager.setAvatar(url);
                    UI.applyAvatar();
                } catch (err) {
                    console.error('[Avatar] Upload error:', err);
                    alert('Не удалось загрузить аватар');
                }
            });
        },

        show() {
            Elements.nicknameDisplay.classList.add('hidden');
            Elements.nicknameEditor.classList.remove('hidden');
            Elements.nicknameInput.value = State.currentNickname;
            Elements.nicknameInput.focus();
            UI.applyAvatar();
        },

        hide() {
            Elements.nicknameEditor.classList.add('hidden');
            Elements.nicknameDisplay.classList.remove('hidden');
        },

        save() {
            const newNick = Elements.nicknameInput.value.trim();
            if (!newNick) {
                Elements.nicknameInput.style.border = '1px solid #ef4444';
                Elements.nicknameInput.focus();
                setTimeout(() => { Elements.nicknameInput.style.border = ''; }, 2000);
                return;
            }

            if (newNick === 'NobuSocial') {
                const password = prompt('Введите пароль для верификации NobuSocial:');
                if (password === CONFIG.admin.verifyPassword) {
                    State.isVerified = true;
                    StorageManager.setVerified(true);
                } else {
                    State.isVerified = false;
                    StorageManager.setVerified(false);
                    if (password !== null) alert('Неверный пароль!');
                }
            } else {
                State.isVerified = false;
                StorageManager.setVerified(false);
            }

            State.currentNickname = newNick;
            StorageManager.setNickname(newNick);
            UI.updateNicknameDisplay(newNick);
            this.hide();
            UI.showError('');
        },

        bindEvents() {
            Elements.editNicknameBtn.addEventListener('click', () => this.show());
            Elements.saveNicknameBtn.addEventListener('click', () => this.save());
            Elements.cancelNicknameBtn.addEventListener('click', () => {
                if (!State.currentNickname) return;
                this.hide();
            });
            Elements.nicknameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.save();
                } else if (e.key === 'Escape') {
                    if (State.currentNickname) this.hide();
                }
            });
        }
    };

    // ==================== App Initialization ====================
    const App = {
        async init() {
            // Load state from storage
            State.currentUserId = StorageManager.getUserId();
            State.currentNickname = StorageManager.getNickname();
            State.isVerified = StorageManager.getVerified();
            State.avatarUrl = StorageManager.getAvatar();

            // Initialize UI
            UI.updateNicknameDisplay(State.currentNickname);
            UI.applyAvatar();
            UI.updateCharCounter();

            // Show nickname editor if no nickname set
            if (!State.currentNickname) {
                NicknameEditor.show();
            }

            // Initialize subsystems
            Composer.init();
            NicknameEditor.init();
            AdminPanel.create();

            // Bind global events
            Elements.retryBtn.addEventListener('click', () => FeedService.loadAndRender());

            // Load initial data
            await Promise.all([
                BanSystem.loadBannedUsers(),
                LikeSystem.loadUserLikes()
            ]);
            await FeedService.loadAndRender();

            // Setup realtime
            RealtimeService.connect();

            // Setup intervals (with cleanup protection)
            State.subscriptions.refreshInterval = setInterval(() => {
                FeedService.loadAndRender();
            }, CONFIG.feed.refreshIntervalMs);

            State.subscriptions.bannedUsersInterval = setInterval(() => {
                BanSystem.loadBannedUsers();
            }, 10000);

            // Update publish button periodically for rate limit status
            setInterval(() => {
                UI.updatePublishButton();
            }, 1000);
        },

        cleanup() {
            clearInterval(State.subscriptions.refreshInterval);
            clearInterval(State.subscriptions.bannedUsersInterval);
            RealtimeService.disconnect();
        }
    };

    // ==================== Start ====================
    document.addEventListener('DOMContentLoaded', () => {
        App.init();
    });

    window.addEventListener('beforeunload', () => {
        App.cleanup();
    });

    return { App, Utils, State };
})();