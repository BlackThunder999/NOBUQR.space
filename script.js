// NobuSocial - Главный скрипт
var SUPABASE_URL = 'https://iljsednetiogjtowlexo.supabase.co';
var SUPABASE_KEY = 'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O';
var supabase;
var me = null;
var feedType = 'latest';
var feedPage = 0;
var loading = false;
var hasMore = true;
var chatId = null;
var chatUser = null;
var groupId = null;
var chatTab = 'personal';
var PEPPER = 'NobuSocial_Pepper_2026_xK9m';
var BAD = ['хуй','пизда','ебать','блять','сука','fuck','shit','bitch'];

function initSB(){if(!supabase)supabase=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:false}})}
function toast(m,t){t=t||'';var c=document.getElementById('toast-container');var d=document.createElement('div');d.className='toast '+t;d.textContent=m;c.appendChild(d);setTimeout(function(){d.style.opacity='0';d.style.transition='opacity .3s';setTimeout(function(){c.removeChild(d)},300)},3000)}
function esc(s){if(!s)return'';var d=document.createElement('div');d.appendChild(document.createTextNode(s));return d.innerHTML}
function timeAgo(d){var s=Math.floor((new Date()-new Date(d))/1000);if(s<60)return s+'с';var m=Math.floor(s/60);if(m<60)return m+'м';var h=Math.floor(m/60);if(h<24)return h+'ч';var dd=Math.floor(h/24);if(dd<30)return dd+'д';return Math.floor(dd/30)+'мес'}
function parseText(t){t=esc(t);t=t.replace(/#(\w+)/g,'<span class="ht" onclick="searchTag(\'$1\')">#$1</span>');t=t.replace(/@(\w+)/g,'<span class="mn" onclick="openUserHandle(\'$1\')">@$1</span>');return t}
function filterText(t){for(var i=0;i<BAD.length;i++){t=t.replace(new RegExp(BAD[i],'gi'),'***')}return t}
function genSalt(l){var a=new Uint8Array(l);crypto.getRandomValues(a);var r='';var ch='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';for(var i=0;i<l;i++)r+=ch.charAt(a[i]%ch.length);return r}

function hashPass(pw,salt,iter,cb){
  var d=new TextEncoder().encode(pw+PEPPER+salt.substring(0,16));
  crypto.subtle.importKey('raw',d,{name:'PBKDF2'},false,['deriveBits']).then(function(k){
    return crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:iter,hash:'SHA-512'},k,512)
  }).then(function(b){
    var h=Array.from(new Uint8Array(b)).map(function(x){return('00'+x.toString(16)).slice(-2)}).join('');
    var sha=new jsSHA('SHA-512','TEXT');sha.update(h+PEPPER);cb(null,sha.getHash('HEX'))
  }).catch(function(e){cb(e)})
}

function saveMe(u){me=u;var d={id:u.id,email:u.email,handle:u.handle,name:u.display_name,avatar:u.avatar_url,admin:u.is_admin,exp:Date.now()+86400000};localStorage.setItem('ns_sess',btoa(JSON.stringify(d)))}
function loadMe(){var r=localStorage.getItem('ns_sess');if(!r)return false;try{var d=JSON.parse(atob(r));if(Date.now()>d.exp){localStorage.removeItem('ns_sess');return false}return d}catch(e){return false}}
function clearMe(){localStorage.removeItem('ns_sess');me=null}

function showLog(){document.getElementById('login-form').style.display='block';document.getElementById('reg-form').style.display='none'}
function showReg(){document.getElementById('login-form').style.display='none';document.getElementById('reg-form').style.display='block'}

function doLogin(){
  initSB();var em=document.getElementById('login-email').value.trim();var pw=document.getElementById('login-password').value;
  if(!em||!pw){toast('Заполните поля','err');return}
  supabase.from('users').select('*').eq('email',em).single().then(function(r){
    if(r.error||!r.data){toast('Неверный email или пароль','err');return}
    var u=r.data;
    hashPass(pw,u.password_salt,u.password_iterations,function(err,h){
      if(err||h!==u.password_hash){toast('Неверный пароль','err');return}
      if(u.is_banned){toast('Аккаунт заблокирован: '+u.ban_reason,'err');return}
      saveMe(u);showApp();switchTab('home');loadFeed();updateAdminBtn();setupRT();toast('Добро пожаловать, '+u.display_name+'!','ok')
    })
  })
}

function doRegister(){
  initSB();var em=document.getElementById('reg-email').value.trim();var nm=document.getElementById('reg-name').value.trim();var hn=document.getElementById('reg-handle').value.trim();var ag=parseInt(document.getElementById('reg-age').value);var pw=document.getElementById('reg-pass').value;var pw2=document.getElementById('reg-pass2').value;
  if(!em||!nm||!hn||!ag||!pw){toast('Заполните все поля','err');return}
  if(pw!==pw2){toast('Пароли не совпадают','err');return}
  if(pw.length<8){toast('Минимум 8 символов','err');return}
  if(ag<13){toast('Возраст 13+','err');return}
  if(!document.getElementById('reg-tos').checked){toast('Примите условия','err');return}
  if(!/^@[a-zA-Z0-9_]{3,29}$/.test(hn)){toast('Handle: @ + 3-29 символов','err');return}
  supabase.from('users').select('id').eq('handle',hn).single().then(function(r1){if(r1.data){toast('Handle занят','err');return}
    supabase.from('users').select('id').eq('email',em).single().then(function(r2){if(r2.data){toast('Email занят','err');return}
      var salt=genSalt(128);
      hashPass(pw,salt,500000,function(err,h){
        if(err){toast('Ошибка','err');return}
        supabase.from('users').insert([{email:em,password_hash:h,password_salt:salt,handle:hn,display_name:nm,age:ag}]).select().single().then(function(r3){
          if(r3.error){toast('Ошибка: '+r3.error.message,'err');return}
          supabase.from('gems').insert([{user_id:r3.data.id,balance:10,total_earned:10}]).then(function(){})
          saveMe(r3.data);showApp();switchTab('home');loadFeed();updateAdminBtn();setupRT();toast('Регистрация успешна! +10 💎','ok')
        })
      })
    })
  })
}

function logout(){clearMe();document.getElementById('app-screen').style.display='none';document.getElementById('auth-screen').style.display='flex';showLog();toast('Вы вышли')}
function showApp(){document.getElementById('auth-screen').style.display='none';document.getElementById('app-screen').style.display='flex'}

function switchTab(t){
  var tabs=['home','search','chats','profile'];for(var i=0;i<tabs.length;i++)document.getElementById('tab-'+tabs[i]).style.display='none';
  document.getElementById('tab-'+t).style.display='block';
  var btns=document.querySelectorAll('.nav-btn');for(var j=0;j<btns.length;j++)btns[j].classList.remove('active');
  var b=document.querySelector('[data-tab="'+t+'"]');if(b)b.classList.add('active');
  if(t==='home')loadFeed();if(t==='chats')loadChats();if(t==='profile')loadMyProfile()
}

function setFeed(t,el){feedType=t;feedPage=0;hasMore=true;var btns=document.querySelectorAll('.ftab');for(var i=0;i<btns.length;i++)btns[i].classList.remove('active');el.classList.add('active');document.getElementById('feed-box').innerHTML='';loadFeed()}

function loadFeed(){
  if(loading||!hasMore||!me)return;loading=true;
  var q=supabase.from('chirps').select('*,users:user_id(id,handle,display_name,avatar_url,nickname_color,verified,title_prefix)').order('created_at',{ascending:false}).range(feedPage*15,(feedPage+1)*15-1);
  if(feedType==='following'){supabase.from('follows').select('following_id').eq('follower_id',me.id).then(function(r){var ids=[me.id];if(r.data)for(var i=0;i<r.data.length;i++)ids.push(r.data[i].following_id);q=q.in('user_id',ids);execQ(q)})}else{execQ(q)}
}

function execQ(q){q.then(function(r){loading=false;if(r.data.length<15)hasMore=false;if(feedPage===0)document.getElementById('feed-box').innerHTML='';if(r.data.length===0&&feedPage===0){document.getElementById('feed-box').innerHTML='<div class="empty">Нет постов</div>';return}for(var i=0;i<r.data.length;i++)renderCard(r.data[i]);feedPage++})}

function renderCard(c){
  var u=c.users||{};var av=u.avatar_url?'<img class="card-av" src="'+u.avatar_url+'" onclick="openUser(\''+u.id+'\')">':'<div class="card-av" style="display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700" onclick="openUser(\''+u.id+'\')">'+(u.display_name||'?')[0].toUpperCase()+'</div>';
  var nm=(u.title_prefix?u.title_prefix+' ':'')+esc(u.display_name||'?');var ver=u.verified?' <span style="color:#7c4dff">✓</span>':'';var nc=u.nickname_color&&u.nickname_color!=='#ffffff'?'color:'+u.nickname_color+';':'';
  var med='';if(c.image_url)med+='<img class="card-img" src="'+c.image_url+'" loading="lazy">';if(c.video_url)med+='<video class="card-video" src="'+c.video_url+'" controls></video>';if(c.audio_url)med+='<audio class="card-audio" src="'+c.audio_url+'" controls></audio>';
  var del=c.user_id===me.id?'<button style="background:none;border:none;color:#707080;cursor:pointer;margin-left:auto" onclick="delChirp(\''+c.id+'\')">🗑️</button>':'';
  var d=document.createElement('div');d.className='card';d.id='c-'+c.id;
  d.innerHTML='<div class="card-header">'+av+'<div style="flex:1;cursor:pointer" onclick="openUser(\''+u.id+'\')"><div class="card-name" style="'+nc+'">'+nm+ver+'</div><div class="card-handle">'+esc(u.handle||'')+' · '+timeAgo(c.created_at)+'</div></div>'+del+'</div><div class="card-text">'+parseText(c.text)+'</div>'+med+'<div class="card-actions"><button class="card-act" id="lb-'+c.id+'" onclick="likeChirp(\''+c.id+'\')">❤️ <span id="lc-'+c.id+'">...</span></button><button class="card-act" onclick="rechirp(\''+c.id+'\')">🔄 <span>'+(c.rechirp_count||0)+'</span></button></div>';
  document.getElementById('feed-box').appendChild(d);loadLikes(c.id);checkLike(c.id)
}

function loadLikes(cid){supabase.from('likes').select('id',{count:'exact'}).eq('chirp_id',cid).then(function(r){var e=document.getElementById('lc-'+cid);if(e)e.textContent=r.count||0})}
function checkLike(cid){if(!me)return;supabase.from('likes').select('id').eq('chirp_id',cid).eq('user_id',me.id).single().then(function(r){if(r.data){var b=document.getElementById('lb-'+cid);if(b)b.classList.add('liked')}})}

function likeChirp(cid){
  if(!me)return;var b=document.getElementById('lb-'+cid);
  if(b.classList.contains('liked')){supabase.from('likes').delete().eq('chirp_id',cid).eq('user_id',me.id).then(function(){b.classList.remove('liked');loadLikes(cid)})}
  else{supabase.from('likes').insert([{chirp_id:cid,user_id:me.id}]).then(function(r){if(!r.error){b.classList.add('liked');loadLikes(cid);supabase.from('chirps').select('user_id').eq('id',cid).single().then(function(cr){if(cr.data&&cr.data.user_id!==me.id){addGems(cr.data.user_id,1,'Лайк');notify(cr.data.user_id,'like',cid)}})}})}
}

function rechirp(cid){if(!me)return;supabase.from('chirps').select('*').eq('id',cid).single().then(function(r){if(!r.data)return;supabase.from('chirps').insert([{user_id:me.id,text:r.data.text,image_url:r.data.image_url,video_url:r.data.video_url,audio_url:r.data.audio_url,is_rechirp:true,original_chirp_id:cid}]).then(function(){supabase.from('chirps').update({rechirp_count:(r.data.rechirp_count||0)+1}).eq('id',cid).then(function(){});toast('Речирп!','ok');feedPage=0;hasMore=true;document.getElementById('feed-box').innerHTML='';loadFeed()})})}
function delChirp(cid){if(!confirm('Удалить?'))return;supabase.from('chirps').delete().eq('id',cid).eq('user_id',me.id).then(function(){var e=document.getElementById('c-'+cid);if(e)e.remove();toast('Удалено','ok')})}

function openCreate(){document.getElementById('create-text').value='';document.getElementById('media-preview').innerHTML='';document.getElementById('char-count').textContent='0';document.getElementById('modal-create').style.display='flex';window._mf=null;window._mt=null}
function closeCreate(){document.getElementById('modal-create').style.display='none'}
function countChar(){document.getElementById('char-count').textContent=document.getElementById('create-text').value.length}
function pickMedia(t){var inp=document.querySelector('[accept="'+t+'/*"]');if(!inp||!inp.files||!inp.files[0])return;window._mf=inp.files[0];window._mt=t;var url=URL.createObjectURL(inp.files[0]);var p=document.getElementById('media-preview');if(t==='image')p.innerHTML='<img src="'+url+'" style="width:100%;max-height:180px;object-fit:cover;border-radius:8px">';else if(t==='video')p.innerHTML='<video src="'+url+'" controls style="width:100%;max-height:180px;border-radius:8px"></video>';else p.innerHTML='<audio src="'+url+'" controls style="width:100%"></audio>'}

function postChirp(){
  if(!me)return;var txt=filterText(document.getElementById('create-text').value.trim());if(!txt&&!window._mf){toast('Введите текст','err');return}if(txt.length>280){toast('Макс 280','err');return}
  var upload=function(cb){if(!window._mf){cb(null);return}var bucket=window._mt==='video'?'videos':(window._mt==='audio'?'videos':'images');var fn=me.id+'_'+Date.now()+'_'+window._mf.name;supabase.storage.from(bucket).upload(fn,window._mf).then(function(r){if(r.error){cb(null);return}cb(supabase.storage.from(bucket).getPublicUrl(fn).data.publicUrl)})};
  upload(function(url){var c={user_id:me.id,text:txt};if(window._mt==='image'&&url)c.image_url=url;if(window._mt==='video'&&url)c.video_url=url;if(window._mt==='audio'&&url){c.audio_url=url;c.is_audio=true}supabase.from('chirps').insert([c]).then(function(r){if(r.error){toast('Ошибка','err');return}closeCreate();addGems(me.id,1,'Пост');feedPage=0;hasMore=true;document.getElementById('feed-box').innerHTML='';loadFeed();toast('Опубликовано! +1 💎','ok')})})
}

function getGems(uid,cb){supabase.from('gems').select('balance').eq('user_id',uid).single().then(function(r){cb(r.data?r.data.balance:0)})}
function addGems(uid,amt,reason){supabase.from('gems').select('*').eq('user_id',uid).single().then(function(r){var bal=amt;var te=amt>0?amt:0;if(r.data){bal=r.data.balance+amt;te=r.data.total_earned+(amt>0?amt:0);supabase.from('gems').update({balance:bal,total_earned:te}).eq('user_id',uid).then(function(){})}else{supabase.from('gems').insert([{user_id:uid,balance:amt,total_earned:amt}]).then(function(){})}supabase.from('gem_transactions').insert([{user_id:uid,amount:amt,reason:reason}]).then(function(){})})}
function spendGems(uid,amt,reason,cb){getGems(uid,function(bal){if(bal<amt){toast('Недостаточно 💎','err');cb(false);return}supabase.from('gems').update({balance:bal-amt}).eq('user_id',uid).then(function(){supabase.from('gem_transactions').insert([{user_id:uid,amount:-amt,reason:reason}]).then(function(){});cb(true)})})}

function openShop(){getGems(me.id,function(b){document.getElementById('shop-bal').textContent=b;loadShopItems();loadInv();document.getElementById('modal-shop').style.display='flex'})}
function closeShop(){document.getElementById('modal-shop').style.display='none'}
function loadShopItems(){supabase.from('shop_items').select('*').eq('is_active',true).order('sort_order').then(function(r){var c=document.getElementById('shop-items');c.innerHTML='';if(!r.data)return;for(var i=0;i<r.data.length;i++){var it=r.data[i];var d=document.createElement('div');d.className='shop-item';d.innerHTML='<div><strong>'+it.name+'</strong><div>💎 '+it.price+'</div></div><button onclick="buyItem(\''+it.id+'\','+it.price+',\''+it.item_type+'\')">Купить</button>';c.appendChild(d)}})}
function loadInv(){supabase.from('user_inventory').select('*,shop_items:item_id(*)').eq('user_id',me.id).then(function(r){var c=document.getElementById('inv-items');c.innerHTML='';if(!r.data||r.data.length===0){c.innerHTML='<div class="empty">Пусто</div>';return}for(var i=0;i<r.data.length;i++){var inv=r.data[i];var it=inv.shop_items;var d=document.createElement('div');d.className='inv-item';d.innerHTML='<span>'+it.name+(inv.is_equipped?' ✅':'')+'</span><button onclick="toggleEq(\''+inv.id+'\','+inv.is_equipped+',\''+it.item_type+'\',\''+it.id+'\')">'+(inv.is_equipped?'Снять':'Надеть')+'</button>';c.appendChild(d)}})}
function buyItem(iid,price,itype){spendGems(me.id,price,'Покупка',function(ok){if(!ok)return;supabase.from('user_inventory').insert([{user_id:me.id,item_id:iid}]).then(function(r){if(r.error){addGems(me.id,price,'Возврат');return}toast('Куплено!','ok');openShop()})})}
function toggleEq(invid,eq,itype,iid){if(eq){supabase.from('user_inventory').update({is_equipped:false}).eq('id',invid).then(function(){unequip(itype);openShop()})}else{supabase.from('user_inventory').update({is_equipped:false}).eq('user_id',me.id).eq('is_equipped',true).then(function(){supabase.from('user_inventory').update({is_equipped:true}).eq('id',invid).then(function(){supabase.from('shop_items').select('*').eq('id',iid).single().then(function(r){if(r.data)equip(itype);openShop()})})})}}
function equip(t){var u={};if(t==='nickname_color')u.nickname_color='#b388ff';if(t==='avatar_frame')u.avatar_frame='gold';if(t==='profile_badge')u.profile_badge='🏅';if(t==='title_prefix')u.title_prefix='👑';if(t==='animated_banner')u.animated_banner='animated';if(t==='verified')u.verified=true;supabase.from('users').update(u).eq('id',me.id).then(function(){for(var k in u)me[k]=u[k]})}
function unequip(t){var u={};if(t==='nickname_color')u.nickname_color='#ffffff';if(t==='avatar_frame')u.avatar_frame='';if(t==='profile_badge')u.profile_badge='';if(t==='title_prefix')u.title_prefix='';if(t==='animated_banner')u.animated_banner='';if(t==='verified')u.verified=false;supabase.from('users').update(u).eq('id',me.id).then(function(){for(var k in u)me[k]=u[k]})}

function loadMyProfile(){loadProfile(me.id)}
function loadProfile(uid){supabase.from('users').select('*').eq('id',uid).single().then(function(r){var u=r.data;if(!u)return;var own=u.id===me.id;supabase.from('chirps').select('id',{count:'exact'}).eq('user_id',uid).then(function(cr){supabase.from('follows').select('id',{count:'exact'}).eq('following_id',uid).then(function(fr){supabase.from('follows').select('id',{count:'exact'}).eq('follower_id',uid).then(function(fg){var banner=u.banner_url?'background-image:url('+u.banner_url+');background-size:cover;':'';var av=u.avatar_url?'<img class="profile-av" src="'+u.avatar_url+'">':'<div class="profile-av" style="display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:28px">'+u.display_name[0].toUpperCase()+'</div>';var nc=u.nickname_color&&u.nickname_color!=='#ffffff'?'color:'+u.nickname_color+';':'';var ver=u.verified?' ✓':'';var nm=(u.title_prefix?u.title_prefix+' ':'')+esc(u.display_name);var btns='';if(own){btns='<button class="profile-btn" onclick="openEdit()">✏️</button><button class="profile-btn" onclick="openShop()">🛒</button><button class="profile-btn" onclick="openSub()">⭐</button>';if(u.is_subscribed)btns+='<div style="color:#ffd700;font-size:12px;margin-top:6px">⭐ Подписка активна</div>'}else{btns='<button class="profile-btn primary" id="fbtn-'+u.id+'" onclick="toggleFollow(\''+u.id+'\')">Подписаться</button><button class="profile-btn" onclick="openChatWith(\''+u.id+'\')">💬</button>'}document.getElementById('profile-content').innerHTML='<div class="profile-banner" style="'+banner+'"></div><div class="profile-info">'+av+'<div class="profile-name" style="'+nc+'">'+nm+ver+'</div><div class="profile-handle">'+esc(u.handle)+'</div>'+(u.bio?'<div class="profile-bio">'+esc(u.bio)+'</div>':'')+'<div class="profile-stats"><div class="profile-stat"><div class="profile-stat-num">'+(cr.count||0)+'</div><div class="profile-stat-lbl">Постов</div></div><div class="profile-stat"><div class="profile-stat-num">'+(fr.count||0)+'</div><div class="profile-stat-lbl">Подписчиков</div></div><div class="profile-stat"><div class="profile-stat-num">'+(fg.count||0)+'</div><div class="profile-stat-lbl">Подписок</div></div></div><div class="profile-btns">'+btns+'</div></div><div id="profile-chirps" style="padding:8px 14px"></div>';if(!own)checkFollowBtn(uid);loadUserChirps(uid)})})})})}
function loadUserChirps(uid){supabase.from('chirps').select('*,users:user_id(*)').eq('user_id',uid).order('created_at',{ascending:false}).limit(20).then(function(r){var c=document.getElementById('profile-chirps');if(!c)return;c.innerHTML=r.data&&r.data.length>0?'':'<div class="empty">Нет постов</div>';if(r.data)for(var i=0;i<r.data.length;i++){var d=document.createElement('div');d.className='card';d.innerHTML='<div class="card-text">'+parseText(r.data[i].text)+'</div><div style="font-size:11px;color:#707080">'+timeAgo(r.data[i].created_at)+'</div>';c.appendChild(d)}})}
function checkFollowBtn(uid){supabase.from('follows').select('id').eq('follower_id',me.id).eq('following_id',uid).single().then(function(r){var b=document.getElementById('fbtn-'+uid);if(b&&r.data){b.textContent='Отписаться';b.classList.add('following')}})}
function toggleFollow(uid){var b=document.getElementById('fbtn-'+uid);if(!b)return;if(b.classList.contains('following')){supabase.from('follows').delete().eq('follower_id',me.id).eq('following_id',uid).then(function(){b.textContent='Подписаться';b.classList.remove('following')})}else{supabase.from('follows').insert([{follower_id:me.id,following_id:uid}]).then(function(r){if(!r.error){b.textContent='Отписаться';b.classList.add('following');notify(uid,'follow',null)}})}}
function openUser(uid){supabase.from('users').select('*').eq('id',uid).single().then(function(r){var u=r.data;document.getElementById('modal-user-content').innerHTML='<div style="text-align:center"><img src="'+(u.avatar_url||'')+'" style="width:70px;height:70px;border-radius:50%;object-fit:cover"><h3>'+esc(u.display_name)+'</h3><p>'+esc(u.handle)+'</p><button class="btn" onclick="closeUserModal();switchTab(\'profile\');loadProfile(\''+uid+'\')">Открыть профиль</button></div>';document.getElementById('modal-user').style.display='flex'})}
function openUserHandle(h){supabase.from('users').select('id').eq('handle','@'+h).single().then(function(r){if(r.data)openUser(r.data.id)})}
function closeUserModal(){document.getElementById('modal-user').style.display='none'}

function openEdit(){document.getElementById('edit-name').value=me.display_name||'';document.getElementById('edit-bio').value=me.bio||'';document.getElementById('edit-link').value=me.link||'';document.getElementById('edit-loc').value=me.location||'';document.getElementById('modal-edit').style.display='flex';window._af=null;window._bf=null}
function closeEdit(){document.getElementById('modal-edit').style.display='none'}
function prevAv(){var f=document.getElementById('edit-avatar').files[0];if(f)window._af=f}
function prevBn(){var f=document.getElementById('edit-banner').files[0];if(f)window._bf=f}
function saveProfile(){var up={display_name:document.getElementById('edit-name').value.trim(),bio:document.getElementById('edit-bio').value.trim(),link:document.getElementById('edit-link').value.trim(),location:document.getElementById('edit-loc').value.trim()};var upload=function(f,bk,cb){if(!f){cb(null);return}var fn=me.id+'_'+Date.now()+'_'+f.name;supabase.storage.from(bk).upload(fn,f).then(function(r){if(r.error){cb(null);return}cb(supabase.storage.from(bk).getPublicUrl(fn).data.publicUrl)})};upload(window._af,'avatars',function(av){if(av)up.avatar_url=av;upload(window._bf,'images',function(bn){if(bn)up.banner_url=bn;supabase.from('users').update(up).eq('id',me.id).then(function(){for(var k in up)me[k]=up[k];closeEdit();loadMyProfile();toast('Сохранено','ok')})})})}

function switchChatTab(t,el){chatTab=t;var btns=document.querySelectorAll('#chats-tabs .ftab');for(var i=0;i<btns.length;i++)btns[i].classList.remove('active');el.classList.add('active');loadChats()}
function loadChats(){var c=document.getElementById('chats-list');c.innerHTML='<div class="loader">Загрузка...</div>';if(chatTab==='personal'){supabase.from('chats').select('*').or('user1_id.eq.'+me.id+',user2_id.eq.'+me.id).then(function(r){if(!r.data||r.data.length===0){c.innerHTML='<div class="empty">Нет чатов</div>';return}c.innerHTML='';for(var i=0;i<r.data.length;i++){var ch=r.data[i];var oid=ch.user1_id===me.id?ch.user2_id:ch.user1_id;supabase.from('users').select('display_name,avatar_url,handle').eq('id',oid).single().then(function(u){var d=document.createElement('div');d.className='chat-item';d.onclick=function(){openChatWith(oid)};d.innerHTML='<img class="chat-av" src="'+(u.data.avatar_url||'')+'"><div><strong>'+esc(u.data.display_name)+'</strong><br><small>'+esc(u.data.handle)+'</small></div>';c.appendChild(d)})}})}else{supabase.from('group_members').select('group_id').eq('user_id',me.id).then(function(r){if(!r.data||r.data.length===0){c.innerHTML='<div class="empty">Нет групп</div><button class="btn" style="margin-top:10px" onclick="openCreateGroup()">➕ Создать группу</button>';return}c.innerHTML='<button class="btn" style="margin:10px 0" onclick="openCreateGroup()">➕ Создать группу</button>';for(var i=0;i<r.data.length;i++){var gid=r.data[i].group_id;supabase.from('groups_chats').select('*').eq('id',gid).single().then(function(g){var d=document.createElement('div');d.className='chat-item';d.onclick=function(){openGroup(g.data.id)};d.innerHTML='<div><strong>👥 '+esc(g.data.name)+'</strong><br><small>'+esc(g.data.description||'')+'</small></div>';c.appendChild(d)})}})})}

function openChatWith(uid){supabase.from('users').select('*').eq('id',uid).single().then(function(r){chatUser=r.data;document.getElementById('chat-title').textContent='💬 '+r.data.display_name;supabase.from('chats').select('*').or('user1_id.eq.'+me.id+',user2_id.eq.'+me.id).then(function(cr){var cid=null;if(cr.data){for(var i=0;i<cr.data.length;i++){var c=cr.data[i];if((c.user1_id===me.id&&c.user2_id===uid)||(c.user1_id===uid&&c.user2_id===me.id)){cid=c.id;break}}}if(cid){chatId=cid;loadChatMsgs();document.getElementById('modal-chat').style.display='flex'}else{supabase.from('chats').insert([{user1_id:me.id,user2_id:uid}]).select().single().then(function(nc){chatId=nc.data.id;loadChatMsgs();document.getElementById('modal-chat').style.display='flex'})}})})}
function loadChatMsgs(){if(!chatId)return;supabase.from('chat_messages').select('*').eq('chat_id',chatId).order('created_at').then(function(r){var c=document.getElementById('chat-msgs');c.innerHTML='';if(r.data){for(var i=0;i<r.data.length;i++){var m=r.data[i];var d=document.createElement('div');d.className='chat-msg '+(m.sender_id===me.id?'sent':'recv');d.textContent=m.encrypted_text||m.text||'';c.appendChild(d)}c.scrollTop=c.scrollHeight}})}
function sendChat(){if(!chatId)return;var t=filterText(document.getElementById('chat-input').value.trim());if(!t)return;supabase.from('chat_messages').insert([{chat_id:chatId,sender_id:me.id,encrypted_text:t}]).then(function(){document.getElementById('chat-input').value='';loadChatMsgs()})}
function chatKey(e){if(e.key==='Enter')sendChat()}
function closeChat(){document.getElementById('modal-chat').style.display='none';chatId=null;chatUser=null}

function openCreateGroup(){document.getElementById('modal-create-group').style.display='flex'}
function closeCreateGroup(){document.getElementById('modal-create-group').style.display='none'}
function createGroup(){var nm=document.getElementById('group-name').value.trim();var desc=document.getElementById('group-desc').value.trim();if(!nm){toast('Введите название','err');return}supabase.from('groups_chats').insert([{name:nm,description:desc,owner_id:me.id}]).select().single().then(function(r){if(r.error){toast('Ошибка','err');return}supabase.from('group_members').insert([{group_id:r.data.id,user_id:me.id,role:'owner'}]).then(function(){closeCreateGroup();loadChats();toast('Группа создана!','ok')})})}
function openGroup(gid){groupId=gid;supabase.from('groups_chats').select('*').eq('id',gid).single().then(function(r){document.getElementById('group-title').textContent='👥 '+r.data.name;loadGroupMsgs();document.getElementById('modal-group').style.display='flex'})}
function loadGroupMsgs(){if(!groupId)return;supabase.from('group_messages').select('*,sender:sender_id(display_name)').eq('group_id',groupId).order('created_at').then(function(r){var c=document.getElementById('group-msgs');c.innerHTML='';if(r.data){for(var i=0;i<r.data.length;i++){var m=r.data[i];var d=document.createElement('div');d.className='chat-msg '+(m.sender_id===me.id?'sent':'recv');d.innerHTML='<small style="color:#b388ff">'+esc(m.sender.display_name)+'</small><br>'+esc(m.encrypted_text);c.appendChild(d)}c.scrollTop=c.scrollHeight}})}
function sendGroup(){if(!groupId)return;var t=filterText(document.getElementById('group-input').value.trim());if(!t)return;supabase.from('group_messages').insert([{group_id:groupId,sender_id:me.id,encrypted_text:t}]).then(function(){document.getElementById('group-input').value='';loadGroupMsgs()})}
function groupKey(e){if(e.key==='Enter')sendGroup()}
function closeGroup(){document.getElementById('modal-group').style.display='none';groupId=null}

function doSearch(e){if(e.key!=='Enter')return;var q=document.getElementById('search-inp').value.trim();if(!q)return;var c=document.getElementById('search-res');c.innerHTML='<div class="loader">Поиск...</div>';supabase.from('users').select('*').or('handle.ilike.%'+q+'%,display_name.ilike.%'+q+'%').limit(20).then(function(r){c.innerHTML='';if(!r.data||r.data.length===0){c.innerHTML='<div class="empty">Никого</div>';return}for(var i=0;i<r.data.length;i++){var u=r.data[i];var d=document.createElement('div');d.className='search-user';d.onclick=function(uid){return function(){openUser(uid)}}(u.id);d.innerHTML='<img class="search-av" src="'+(u.avatar_url||'')+'"><div><strong>'+esc(u.display_name)+'</strong><br><small>'+esc(u.handle)+'</small></div>';c.appendChild(d)}})}
function searchTag(t){switchTab('search');document.getElementById('search-inp').value='#'+t;doSearch({key:'Enter'})}

function openSub(){document.getElementById('modal-sub').style.display='flex'}
function closeSub(){document.getElementById('modal-sub').style.display='none'}
function activateSub(){var code=document.getElementById('sub-code').value.trim();if(!code){toast('Введите код','err');return}supabase.from('subscription_codes').select('*').eq('code',code).eq('is_used',false).single().then(function(r){if(!r.data){toast('Код неверный','err');return}var exp=new Date();exp.setDate(exp.getDate()+r.data.duration_days);supabase.from('subscription_codes').update({is_used:true,used_by:me.id,used_at:new Date().toISOString()}).eq('id',r.data.id).then(function(){supabase.from('subscriptions').insert([{user_id:me.id,code_id:r.data.id,expires_at:exp.toISOString()}]).then(function(){supabase.from('users').update({is_subscribed:true,subscription_expiry:exp.toISOString()}).eq('id',me.id).then(function(){me.is_subscribed=true;toast('⭐ Подписка до '+exp.toLocaleDateString()+'!','ok');closeSub();loadMyProfile()})})})})}

function updateAdminBtn(){var b=document.getElementById('admin-btn-top');if(me&&me.is_admin)b.style.display='block';else b.style.display='none'}
function openAdmin(){document.getElementById('modal-admin').style.display='flex';admTab('stats',document.querySelector('.atab'))}
function closeAdmin(){document.getElementById('modal-admin').style.display='none'}
function admTab(t,el){var btns=document.querySelectorAll('.atab');for(var i=0;i<btns.length;i++)btns[i].classList.remove('active');el.classList.add('active');var c=document.getElementById('admin-content');if(t==='stats'){supabase.from('users').select('id',{count:'exact'}).then(function(r1){supabase.from('chirps').select('id',{count:'exact'}).then(function(r2){c.innerHTML='<div class="admin-row"><span>Пользователей:</span><span>'+(r1.count||0)+'</span></div><div class="admin-row"><span>Постов:</span><span>'+(r2.count||0)+'</span></div>'})})}if(t==='gems'){c.innerHTML='<input id="adm-handle" placeholder="@handle"><input type="number" id="adm-amount" placeholder="Gems"><input id="adm-reason" placeholder="Причина"><button class="btn" onclick="admGiveGems()">Выдать 💎</button><div id="adm-result"></div>'}if(t==='premium'){c.innerHTML='<input id="adm-prem-handle" placeholder="@handle"><input type="number" id="adm-prem-days" placeholder="Дней"><button class="btn" onclick="admGivePrem()">Выдать ⭐</button><div id="adm-prem-result"></div>'}if(t==='bans'){c.innerHTML='<input id="adm-ban-handle" placeholder="@handle"><input id="adm-ban-reason" placeholder="Причина"><select id="adm-ban-type"><option value="permanent">Навсегда</option><option value="temporary">На время</option></select><input type="number" id="adm-ban-hours" placeholder="Часов (для врем.)"><button class="btn" onclick="admBan()">Забанить 🚫</button>'}if(t==='warn'){c.innerHTML='<input id="adm-warn-handle" placeholder="@handle"><input id="adm-warn-reason" placeholder="Причина"><button class="btn" onclick="admWarn()">Предупредить ⚠️</button>'}}
function admGiveGems(){var h=document.getElementById('adm-handle').value.trim();var a=parseInt(document.getElementById('adm-amount').value);var r=document.getElementById('adm-reason').value.trim()||'Админ';if(!h||!a){toast('Заполните','err');return}supabase.from('users').select('id').eq('handle',h).single().then(function(res){if(!res.data){toast('Не найден','err');return}addGems(res.data.id,a,r);document.getElementById('adm-result').innerHTML='<span style="color:#2ed573">✅ +'+a+' 💎 → '+h+'</span>';toast('Выдано!','ok')})}
function admGivePrem(){var h=document.getElementById('adm-prem-handle').value.trim();var d=parseInt(document.getElementById('adm-prem-days').value);if(!h||!d){toast('Заполните','err');return}supabase.from('users').select('id').eq('handle',h).single().then(function(res){if(!res.data){toast('Не найден','err');return}var exp=new Date();exp.setDate(exp.getDate()+d);supabase.from('users').update({is_subscribed:true,subscription_expiry:exp.toISOString(),premium_source:'admin'}).eq('id',res.data.id).then(function(){document.getElementById('adm-prem-result').innerHTML='<span style="color:#ffd700">⭐ Premium → '+h+'</span>';toast('Premium выдан!','ok')})})}
function admBan(){var h=document.getElementById('adm-ban-handle').value.trim();var r=document.getElementById('adm-ban-reason').value.trim();var t=document.getElementById('adm-ban-type').value;var hrs=parseInt(document.getElementById('adm-ban-hours').value)||0;if(!h||!r){toast('Заполните','err');return}supabase.from('users').select('*').eq('handle',h).single().then(function(res){if(!res.data){toast('Не найден','err');return}var exp=null;if(t==='temporary'&&hrs>0){exp=new Date();exp.setHours(exp.getHours()+hrs)}supabase.from('users').update({is_banned:true,ban_reason:r}).eq('id',res.data.id).then(function(){supabase.from('bans').insert([{user_id:res.data.id,banned_by:me.id,reason:r,ban_type:t,expires_at:exp?exp.toISOString():null}]).then(function(){toast('Забанен','ok')})})})}
function admWarn(){var h=document.getElementById('adm-warn-handle').value.trim();var r=document.getElementById('adm-warn-reason').value.trim();if(!h||!r){toast('Заполните','err');return}supabase.from('users').select('id').eq('handle',h).single().then(function(res){if(!res.data){toast('Не найден','err');return}supabase.from('warnings').insert([{user_id:res.data.id,warned_by:me.id,reason:r}]).then(function(){notify(res.data.id,'admin',null);toast('Предупреждён','ok')})})}

function notify(uid,type,cid){if(uid===me.id)return;supabase.from('notifications').insert([{user_id:uid,from_user_id:me.id,type:type,chirp_id:cid||null}]).then(function(){})}
function setupRT(){if(!me)return;supabase.channel('ns-rt').on('postgres_changes',{event:'INSERT',schema:'public',table:'chirps'},function(){if(feedType==='latest'){feedPage=0;hasMore=true;document.getElementById('feed-box').innerHTML='';loadFeed()}}).on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_messages'},function(p){if(chatId&&p.new&&p.new.chat_id===chatId&&p.new.sender_id!==me.id){loadChatMsgs()}}).on('postgres_changes',{event:'INSERT',schema:'public',table:'group_messages'},function(p){if(groupId&&p.new&&p.new.group_id===groupId){loadGroupMsgs()}}).subscribe()}

function showTOS(){document.getElementById('modal-tos').style.display='flex'}
function closeTOS(){document.getElementById('modal-tos').style.display='none'}

document.addEventListener('DOMContentLoaded',function(){
  initSB();var lm=loadMe();
  if(lm){supabase.from('users').select('*').eq('id',lm.id).single().then(function(r){if(r.data&&!r.data.is_banned){me=r.data;showApp();switchTab('home');loadFeed();updateAdminBtn();setupRT()}else{clearMe();document.getElementById('app-screen').style.display='none';document.getElementById('auth-screen').style.display='flex';showLog()}})}
  else{document.getElementById('app-screen').style.display='none';document.getElementById('auth-screen').style.display='flex';showLog()}
  document.getElementById('main-content').addEventListener('scroll',function(){if(loading||!hasMore)return;var el=document.getElementById('main-content');if(el.scrollHeight-el.scrollTop-el.clientHeight<200)loadFeed()})
})

setTimeout(function(){if(!me)return;var today=new Date().toDateString();var last=localStorage.getItem('ns_daily');if(last!==today){addGems(me.id,5,'Ежедневный бонус');localStorage.setItem('ns_daily',today);toast('+5 💎 Ежедневный бонус!','ok')}},3000)