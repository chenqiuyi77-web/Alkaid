const chatWindow = document.getElementById('chat-window');
const msgInput = document.getElementById('msg-input');
const catSelect = document.getElementById('cat-select');
const replyTextarea = document.getElementById('reply-library');
const statusDot = document.getElementById('status-dot');

// ================= 核心状态数据 =================
let chatHistory = JSON.parse(localStorage.getItem('chatHistoryDB')) || [];
let replyMode = localStorage.getItem('replyMode') || 'mixed'; 
let replyLibrary = JSON.parse(localStorage.getItem('replyLibraryDB')) || { "默认分类": "想你啦\n早点休息\n我一直都在\n抱抱\n乖" };
let currentCategory = Object.keys(replyLibrary)[0] || "默认分类";
let myStickers = JSON.parse(localStorage.getItem('myStickers')) || [];
let youStickers = JSON.parse(localStorage.getItem('youStickers')) || [];
let isBotReplying = false; 

// 更新：语音库数据结构
let voiceLibrary = JSON.parse(localStorage.getItem('voiceLibraryDB')) || { "默认语音": [] };
let currentVoiceCategory = Object.keys(voiceLibrary)[0] || "默认语音";
let globalAudioPlayer = new Audio();
let currentlyPlayingAudio = { id: null, element: null };

// 状态库数据
let statusLibrary = JSON.parse(localStorage.getItem('statusLibraryDB')) || { "日常状态": "发呆中\n正在看书\n喝咖啡\n好想你\n有点困" };
let currentStatusCategory = Object.keys(statusLibrary)[0] || "日常状态";
let currentStatusText = localStorage.getItem('currentStatusText') || "发呆中...";
let nextStatusUpdateTime = parseInt(localStorage.getItem('nextStatusUpdateTime')) || 0;

// 节奏及功能配置
let rhythmSettings = JSON.parse(localStorage.getItem('rhythmSettings')) || {
    minWait: 2, maxWait: 5, proactive: false, proactiveInterval: 15, mixEmoji: false, showTimestamp: false, randomReadState: false
};
let proactiveTimer = null; 

// 拍一拍配置
let tickleSettings = JSON.parse(localStorage.getItem('tickleSettings')) || {
    myAction: "拍了拍", mySuffix: "", youAction: "拍了拍", youSuffix: ""
};

// 信件记录配置
let letterHistory = JSON.parse(localStorage.getItem('letterHistoryDB')) || [];

// 长按与引用状态
let currentQuoteText = null; 
let selectedMsgIdForContext = null;
let pressTimer = null;

window.onload = () => {
    const savedTheme = localStorage.getItem('theme') || 'default';
    document.documentElement.setAttribute('data-theme', savedTheme);

    const savedWallpaper = localStorage.getItem('chatWallpaper');
    if(savedWallpaper) document.getElementById('app').style.backgroundImage = `url('${savedWallpaper}')`;

    const savedName = localStorage.getItem('partnerName');
    if(savedName) updatePartnerNameDisplay(savedName);
    
    document.getElementById('reply-mode-select').value = replyMode;
    
    const savedMeAvatar = localStorage.getItem('myAvatar');
    if(savedMeAvatar) document.documentElement.style.setProperty('--me-avatar', savedMeAvatar);
    const savedYouAvatar = localStorage.getItem('youAvatar');
    if(savedYouAvatar) document.documentElement.style.setProperty('--you-avatar', savedYouAvatar);

    initRhythmUI();
    initTickleUI();
    renderCategorySelect();
    renderVoiceCategorySelect(); 
    renderStatusCategorySelect(); 
    checkAndUpdateStatus(); 
    setInterval(checkAndUpdateStatus, 60000); 
    renderStickers();
    renderChatHistory();
    
    window.visualViewport.addEventListener("resize", () => {
        setTimeout(() => { chatWindow.scrollTop = chatWindow.scrollHeight; }, 100);
    });
    
    // 全局音频播放器事件监听
    globalAudioPlayer.addEventListener('timeupdate', updateAudioProgress);
    globalAudioPlayer.addEventListener('ended', stopAudioPlayback);
}

// ================= 语音功能及语音库管理 (已更新) =================
const voiceCatSelect = document.getElementById('voice-cat-select');
const voiceListDiv = document.getElementById('voice-list');

function renderVoiceCategorySelect() {
    voiceCatSelect.innerHTML = '';
    for(let cat in voiceLibrary) {
        let opt = document.createElement('option'); opt.value = cat; opt.innerText = cat; voiceCatSelect.appendChild(opt);
    }
    voiceCatSelect.value = currentVoiceCategory;
    renderVoiceList();
}

function switchVoiceCategory() { 
    currentVoiceCategory = voiceCatSelect.value; 
    renderVoiceList(); 
}

function renderVoiceList() {
    voiceListDiv.innerHTML = '';
    const voices = voiceLibrary[currentVoiceCategory] || [];
    voices.forEach((voice, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'voice-item-wrapper';
        wrapper.innerHTML = `
            <span class="voice-item-icon">🎵</span>
            <span class="voice-item-text">${voice.text}</span>
            <span class="voice-item-delete" onclick="deleteVoice(${index})">×</span>
        `;
        voiceListDiv.appendChild(wrapper);
    });
}

function addNewVoiceCategory() {
    const newCat = prompt("请输入新语音分类名称：");
    if(newCat && newCat.trim() !== "") {
        if(!voiceLibrary[newCat.trim()]) { 
            voiceLibrary[newCat.trim()] = []; 
            currentVoiceCategory = newCat.trim(); 
            localStorage.setItem('voiceLibraryDB', JSON.stringify(voiceLibrary));
            renderVoiceCategorySelect(); 
        } else { 
            alert("分类已存在啦宝宝！"); 
        }
    }
}

function deleteVoiceCategory() {
    if (Object.keys(voiceLibrary).length <= 1) { alert("请至少保留一个语音分类哦宝宝！"); return; }
    if (confirm(`确定要删除【${currentVoiceCategory}】语音分类吗？`)) {
        delete voiceLibrary[currentVoiceCategory]; 
        localStorage.setItem('voiceLibraryDB', JSON.stringify(voiceLibrary));
        currentVoiceCategory = Object.keys(voiceLibrary)[0]; 
        renderVoiceCategorySelect();
    }
}

function uploadVoice(event) {
    const file = event.target.files[0];
    if (!file || !file.type.startsWith('audio/mpeg')) {
        alert("宝宝，请上传 MP3 格式的语音文件哦！");
        return;
    }

    const text = prompt("请输入这条语音对应的文字内容：", file.name.replace('.mp3', ''));
    if (!text || text.trim() === "") {
        alert("没有输入文字，语音未保存哦宝宝！");
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const newVoice = {
            id: generateId(),
            name: file.name,
            text: text.trim(),
            data: e.target.result
        };
        if (!voiceLibrary[currentVoiceCategory]) {
            voiceLibrary[currentVoiceCategory] = [];
        }
        voiceLibrary[currentVoiceCategory].push(newVoice);
        localStorage.setItem('voiceLibraryDB', JSON.stringify(voiceLibrary));
        renderVoiceList();
        alert("语音和文字都保存好啦！");
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

function deleteVoice(index) {
    if (confirm("确定要删除这条语音和文字吗？")) {
        voiceLibrary[currentVoiceCategory].splice(index, 1);
        localStorage.setItem('voiceLibraryDB', JSON.stringify(voiceLibrary));
        renderVoiceList();
    }
}

function togglePlayAudio(event, msgId) {
    event.stopPropagation();
    const voiceBubble = event.currentTarget; // 点击的目标现在是 voice-player
    const msg = chatHistory.find(m => m.id === msgId);
    if (!voiceBubble || !msg) return;

    const voiceData = msg.content.data;
    if (!voiceData) return;
    
    if (currentlyPlayingAudio.id === msgId && !globalAudioPlayer.paused) {
        globalAudioPlayer.pause();
        voiceBubble.querySelector('.voice-icon').classList.remove('playing');
    } else {
        if (currentlyPlayingAudio.element) {
            currentlyPlayingAudio.element.querySelector('.voice-icon').classList.remove('playing');
            currentlyPlayingAudio.element.querySelector('.voice-progress').style.width = '0%';
        }
        
        currentlyPlayingAudio = { id: msgId, element: voiceBubble };
        globalAudioPlayer.src = voiceData;
        globalAudioPlayer.play();
        voiceBubble.querySelector('.voice-icon').classList.add('playing');
    }
}

function updateAudioProgress() {
    if (globalAudioPlayer.paused || !currentlyPlayingAudio.element) return;
    const progress = (globalAudioPlayer.currentTime / globalAudioPlayer.duration) * 100;
    currentlyPlayingAudio.element.querySelector('.voice-progress').style.width = `${progress}%`;
}

function stopAudioPlayback() {
    if (currentlyPlayingAudio.element) {
        currentlyPlayingAudio.element.querySelector('.voice-icon').classList.remove('playing');
        currentlyPlayingAudio.element.querySelector('.voice-progress').style.width = '0%';
    }
    currentlyPlayingAudio = { id: null, element: null };
}

// ================= 状态功能及状态库管理 =================
function toggleStatusPopup(event) {
    event.stopPropagation();
    const popup = document.getElementById('status-popup');
    const textEl = document.getElementById('status-popup-text');
    
    if (popup.style.display === 'block') {
        popup.style.display = 'none';
    } else {
        textEl.innerText = currentStatusText;
        popup.style.display = 'block';
    }
}
function hideStatusPopup() {
    document.getElementById('status-popup').style.display = 'none';
}

function checkAndUpdateStatus() {
    const now = Date.now();
    if (now >= nextStatusUpdateTime || !currentStatusText) {
        const categories = Object.keys(statusLibrary);
        if (categories.length === 0) {
            currentStatusText = "发呆中...";
        } else {
            const randomCat = categories[Math.floor(Math.random() * categories.length)];
            const phrases = statusLibrary[randomCat].split(/\n/).filter(p => p.trim() !== '');
            
            if (phrases.length > 0) {
                currentStatusText = phrases[Math.floor(Math.random() * phrases.length)].trim();
            } else {
                currentStatusText = "发呆中...";
            }
        }
        
        const delayHours = 1 + Math.random() * 7;
        nextStatusUpdateTime = now + delayHours * 60 * 60 * 1000;
        
        localStorage.setItem('currentStatusText', currentStatusText);
        localStorage.setItem('nextStatusUpdateTime', nextStatusUpdateTime);
    }
}

const statusCatSelect = document.getElementById('status-cat-select');
const statusTextarea = document.getElementById('status-library');

function renderStatusCategorySelect() {
    statusCatSelect.innerHTML = '';
    for(let cat in statusLibrary) {
        let opt = document.createElement('option'); opt.value = cat; opt.innerText = cat; statusCatSelect.appendChild(opt);
    }
    statusCatSelect.value = currentStatusCategory;
    statusTextarea.value = statusLibrary[currentStatusCategory] || "";
}
function switchStatusCategory() { 
    currentStatusCategory = statusCatSelect.value; 
    statusTextarea.value = statusLibrary[currentStatusCategory] || ""; 
}
function addNewStatusCategory() {
    const newCat = prompt("请输入新状态分类名称：");
    if(newCat && newCat.trim() !== "") {
        if(!statusLibrary[newCat.trim()]) { 
            statusLibrary[newCat.trim()] = ""; 
            currentStatusCategory = newCat.trim(); 
            renderStatusCategorySelect(); 
        } else { 
            alert("分类已存在啦宝宝！"); 
        }
    }
}
function saveStatusCategory() {
    statusLibrary[currentStatusCategory] = statusTextarea.value;
    localStorage.setItem('statusLibraryDB', JSON.stringify(statusLibrary)); 
    alert("状态库保存成功啦！下次刷新就会生效哦~");
}
function deleteStatusCategory() {
    if (Object.keys(statusLibrary).length <= 1) { alert("请至少保留一个状态分类哦宝宝！"); return; }
    if (confirm(`确定要删除【${currentStatusCategory}】状态分类吗？`)) {
        delete statusLibrary[currentStatusCategory]; 
        localStorage.setItem('statusLibraryDB', JSON.stringify(statusLibrary));
        currentStatusCategory = Object.keys(statusLibrary)[0]; 
        renderStatusCategorySelect();
    }
}

// ================= 写信功能逻辑 =================
function sendLetter() {
    const content = document.getElementById('letter-input').value.trim();
    if(!content) { alert("信件内容不能为空哦宝宝！"); return; }

    const now = Date.now();
    const delayHours = 10 + Math.random() * 14; 
    const targetTime = now + delayHours * 60 * 60 * 1000;

    let allPhrases = [];
    for(let cat in replyLibrary) {
        const phrases = replyLibrary[cat].split(/\n/).filter(p => p.trim() !== '');
        allPhrases = allPhrases.concat(phrases);
    }
    if (allPhrases.length === 0) allPhrases = ["收到你的信啦", "好好照顾自己", "一直陪着你"];

    const sentenceCount = Math.floor(Math.random() * 5) + 8; 
    let replyText = "";
    
    for (let i = 0; i < sentenceCount; i++) {
        let phrase = allPhrases[Math.floor(Math.random() * allPhrases.length)].trim();
        let punctRand = Math.random();
        let punctuation = "。";
        
        if (punctRand < 0.2) punctuation = "！";
        else if (punctRand < 0.4) punctuation = "...";
        
        replyText += phrase + punctuation;
    }

    const newLetter = {
        id: generateId(),
        sendTime: now,
        userText: content,
        targetTime: targetTime,
        replyText: replyText
    };

    letterHistory.unshift(newLetter);
    localStorage.setItem('letterHistoryDB', JSON.stringify(letterHistory));

    document.getElementById('letter-input').value = "";

    const dateObj = new Date(targetTime);
    const formatTime = `${dateObj.getMonth()+1}月${dateObj.getDate()}日 ${dateObj.getHours().toString().padStart(2,'0')}:${dateObj.getMinutes().toString().padStart(2,'0')}`;
    alert(`信件寄出成功啦宝宝！预计会在 ${formatTime} 左右收到回信哦~`);
}

function openLetterHistory() {
    renderLetterHistory();
    openPanel('sub-letter-history');
}

function renderLetterHistory() {
    const container = document.getElementById('letter-history-list');
    container.innerHTML = "";

    if (letterHistory.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#888; font-size:14px; margin-top:30px;">还没有信件记录哦，快给他写下第一封信吧~</div>';
        return;
    }

    const now = Date.now();
    const botName = document.getElementById('display-name').innerText;

    letterHistory.forEach(letter => {
        const sendDate = new Date(letter.sendTime);
        const sendStr = `${sendDate.getMonth()+1}-${sendDate.getDate()} ${sendDate.getHours().toString().padStart(2,'0')}:${sendDate.getMinutes().toString().padStart(2,'0')}`;

        let html = `
            <div class="letter-card">
                <div class="sender">你 <span class="time">${sendStr}</span></div>
                <div class="content">${letter.userText}</div>
        `;

        if (now >= letter.targetTime) {
            const replyDate = new Date(letter.targetTime);
            const replyStr = `${replyDate.getMonth()+1}-${replyDate.getDate()} ${replyDate.getHours().toString().padStart(2,'0')}:${replyDate.getMinutes().toString().padStart(2,'0')}`;
            html += `
                <div class="letter-reply">
                    <div class="sender" style="color:var(--accent-color);">${botName} <span class="time">${replyStr}</span></div>
                    <div class="content">${letter.replyText}</div>
                </div>
            `;
        } else {
            const replyDate = new Date(letter.targetTime);
            const replyStr = `${replyDate.getMonth()+1}-${replyDate.getDate()} ${replyDate.getHours().toString().padStart(2,'0')}:${replyDate.getMinutes().toString().padStart(2,'0')}`;
            html += `
                <div class="letter-reply">
                    <div class="letter-pending">回信正在快马加鞭赶来...<br>(预计到达时间: ${replyStr})</div>
                </div>
            `;
        }

        html += `</div>`;
        container.innerHTML += html;
    });
}

// ================= 拍一拍逻辑 =================
function initTickleUI() {
    document.getElementById('tickle-my-action').value = tickleSettings.myAction;
    document.getElementById('tickle-my-suffix').value = tickleSettings.mySuffix;
    document.getElementById('tickle-you-action').value = tickleSettings.youAction;
    document.getElementById('tickle-you-suffix').value = tickleSettings.youSuffix;
}

function saveTickleSettings() {
    tickleSettings = {
        myAction: document.getElementById('tickle-my-action').value.trim(),
        mySuffix: document.getElementById('tickle-my-suffix').value.trim(),
        youAction: document.getElementById('tickle-you-action').value.trim(),
        youSuffix: document.getElementById('tickle-you-suffix').value.trim()
    };
    localStorage.setItem('tickleSettings', JSON.stringify(tickleSettings));
    alert("拍一拍设置保存成功啦宝宝！");
}

function triggerMyTickle() {
    const name = document.getElementById('display-name').innerText;
    const action = tickleSettings.myAction || "拍了拍";
    const suffix = tickleSettings.mySuffix ? ` ${tickleSettings.mySuffix}` : "";
    const text = `你 ${action} ${name}${suffix}`;
    addMessageToChat('system', 'tickle', text);
    
    if (!isBotReplying && !rhythmSettings.randomReadState) {
        setStatusDot('green');
    }
}

// ================= 自定义壁纸逻辑 =================
function changeWallpaper(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            let w = img.width, h = img.height;
            const max = 1200; 
            if(w > h && w > max) { h *= max/w; w = max; }
            else if(h > max) { w *= max/h; h = max; }
            canvas.width = w; canvas.height = h;
            ctx.drawImage(img, 0, 0, w, h);
            const compressedB64 = canvas.toDataURL('image/jpeg', 0.6); 
            
            document.getElementById('app').style.backgroundImage = `url('${compressedB64}')`;
            localStorage.setItem('chatWallpaper', compressedB64);
            alert("壁纸更换成功啦宝宝！");
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}
function clearWallpaper() {
    document.getElementById('app').style.backgroundImage = 'none';
    localStorage.removeItem('chatWallpaper');
    alert("壁纸已经清除咯~");
}

// ================= 节奏及时间戳设置逻辑 =================
function initRhythmUI() {
    document.getElementById('min-wait').value = rhythmSettings.minWait;
    document.getElementById('max-wait').value = rhythmSettings.maxWait;
    document.getElementById('proactive-toggle').checked = rhythmSettings.proactive;
    document.getElementById('proactive-interval').value = rhythmSettings.proactiveInterval;
    document.getElementById('mix-emoji-toggle').checked = rhythmSettings.mixEmoji;
    document.getElementById('timestamp-toggle').checked = rhythmSettings.showTimestamp || false; 
    document.getElementById('random-read-toggle').checked = rhythmSettings.randomReadState || false; 
    updateRhythmDisplays();
    applyRhythmSettings();
}
function syncSettings() {
    let minW = parseInt(document.getElementById('min-wait').value);
    let maxW = parseInt(document.getElementById('max-wait').value);
    if(minW > maxW) { maxW = minW; document.getElementById('max-wait').value = maxW; } 

    let oldShowTimestamp = rhythmSettings.showTimestamp;

    rhythmSettings = {
        minWait: minW, maxWait: maxW,
        proactive: document.getElementById('proactive-toggle').checked,
        proactiveInterval: parseInt(document.getElementById('proactive-interval').value),
        mixEmoji: document.getElementById('mix-emoji-toggle').checked,
        showTimestamp: document.getElementById('timestamp-toggle').checked,
        randomReadState: document.getElementById('random-read-toggle').checked 
    };
    localStorage.setItem('rhythmSettings', JSON.stringify(rhythmSettings));
    updateRhythmDisplays();
    applyRhythmSettings();

    if(oldShowTimestamp !== rhythmSettings.showTimestamp) {
        renderChatHistory();
    }
}
function updateRhythmDisplays() {
    document.getElementById('min-val-display').innerText = rhythmSettings.minWait + 's';
    document.getElementById('max-val-display').innerText = rhythmSettings.maxWait + 's';
    document.getElementById('interval-display').innerText = rhythmSettings.proactiveInterval + '分钟';
}
function applyRhythmSettings() {
    if(proactiveTimer) clearInterval(proactiveTimer);
    if(rhythmSettings.proactive) {
        const ms = rhythmSettings.proactiveInterval * 60 * 1000;
        proactiveTimer = setInterval(() => { 
            if(!isBotReplying) {
                setStatusDot('green'); 
                triggerBotReply(); 
            }
        }, ms);
    }
}

// ================= 基础及界面 =================
function openPanel(id) { document.getElementById(id).classList.add('active'); if(id === 'sub-storage') checkStorage(); 
if (id === 'sub-quiz') renderQuizHistory(); 
if (id === 'sub-quiz-history') renderFullQuizHistory(); }
function closePanel(id) { document.getElementById(id).classList.remove('active'); }

function changeName() {
    const newName = prompt("请输入专属称呼：", document.getElementById('display-name').innerText);
    if (newName && newName.trim() !== "") {
        updatePartnerNameDisplay(newName.trim());
        localStorage.setItem('partnerName', newName.trim());
    }
}

function updatePartnerNameDisplay(name) {
    document.getElementById('display-name').innerText = name;
    const spans = document.querySelectorAll('.partner-name-display');
    spans.forEach(span => span.innerText = name);
}

function setTheme(themeName) { 
    document.documentElement.setAttribute('data-theme', themeName); 
    localStorage.setItem('theme', themeName);
}
function changeReplyMode() { replyMode = document.getElementById('reply-mode-select').value; localStorage.setItem('replyMode', replyMode); }

function setStatusDot(color) {
    statusDot.classList.remove('yellow', 'red');
    if (color === 'yellow') statusDot.classList.add('yellow');
    else if (color === 'red') statusDot.classList.add('red');
}

function checkAndTriggerReply() {
    if (rhythmSettings.randomReadState) {
        const rand = Math.random();
        if (rand < 0.20) { 
            setStatusDot('yellow'); 
            return; 
        }
    }
    setStatusDot('green'); 
    triggerBotReply();
}

// ================= 聊天及历史记录 (已更新) =================
function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }

function renderChatHistory() {
chatWindow.innerHTML = ''; 
let lastDateStr = null;
chatHistory.forEach((msg) => {
    const msgDate = new Date(msg.timestampFull || msg.sendTime || Date.now());
    const todayStr = msgDate.getFullYear() + '年' + (msgDate.getMonth() + 1) + '月' + msgDate.getDate() + '日 星期' + ['日','一','二','三','四','五','六'][msgDate.getDay()];
    
    if (!lastDateStr || lastDateStr !== todayStr) {
        const dateDiv = document.createElement('div');
        dateDiv.style.cssText = 'text-align: center; font-size: 12px; color: #999; padding: 14px 0 10px 0;';
        dateDiv.innerText = todayStr;
        chatWindow.appendChild(dateDiv);
        lastDateStr = todayStr;
    }
    appendDOMOnly(msg.id, msg.sender, msg.type, msg.content, msg.quote, msg.timestamp);
});
}

function addMessageToChat(sender, type, content, quote = null) {
const msgId = generateId();
const now = new Date();
const timestamp = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

const todayStr = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日 星期' + ['日','一','二','三','四','五','六'][now.getDay()];

let lastDateStr = null;
if (chatHistory.length > 0) {
    const lastMsg = chatHistory[chatHistory.length - 1];
    const lastDate = new Date(lastMsg.timestampFull || lastMsg.sendTime || Date.now());
    lastDateStr = lastDate.getFullYear() + '年' + (lastDate.getMonth() + 1) + '月' + lastDate.getDate() + '日 星期' + ['日','一','二','三','四','五','六'][lastDate.getDay()];
}

if (!lastDateStr || lastDateStr !== todayStr) {
    const dateDiv = document.createElement('div');
    dateDiv.style.cssText = 'text-align: center; font-size: 12px; color: #999; padding: 14px 0 10px 0;';
    dateDiv.innerText = todayStr;
    chatWindow.appendChild(dateDiv);
}

appendDOMOnly(msgId, sender, type, content, quote, timestamp);
chatHistory.push({ id: msgId, sender, type, content, quote, timestamp, timestampFull: now.toISOString() });
if (chatHistory.length > 300) chatHistory.shift();
localStorage.setItem('chatHistoryDB', JSON.stringify(chatHistory));
}

function appendDOMOnly(id, sender, type, content, quote = null, timestamp = null) {
    const row = document.createElement('div'); 
    row.className = `msg-row ${sender}`;
    row.dataset.id = id;

    if (type === 'tickle') {
        const tickleBubble = document.createElement('div');
        tickleBubble.className = 'tickle-bubble';
        tickleBubble.innerText = content;
        row.appendChild(tickleBubble);
        chatWindow.appendChild(row);
        chatWindow.scrollTop = chatWindow.scrollHeight;
        return;
    }

    const avatar = document.createElement('div'); avatar.className = 'chat-avatar';
    const bubble = document.createElement('div'); bubble.className = 'bubble';
    
    bindLongPress(bubble, id, sender, type, content);

    if (sender === 'you') {
        let lastClickTime = 0;
        avatar.addEventListener('click', (e) => {
            let currentTime = new Date().getTime();
            if (currentTime - lastClickTime < 350) {
                triggerMyTickle();
                lastClickTime = 0;
            } else {
                lastClickTime = currentTime;
            }
        });
    }

    let innerHTML = '';
    if (quote) innerHTML += `<div class="quote-block">${quote}</div>`;

    if (type === 'img') {
        bubble.style.padding = '5px'; 
        innerHTML += `<img src="${content}" class="bubble-img">`;
    } else if (type === 'mixed') {
        bubble.className = 'bubble bubble-mixed';
        innerHTML += `<span>${content.text}</span><img src="${content.img}" class="bubble-img">`;
    } else if (type === 'voice') {
        bubble.className += ' bubble-voice-text';
        innerHTML += `
            <span>${content.text}</span>
            <div class="voice-player" onclick="togglePlayAudio(event, '${id}')">
                <span class="voice-icon">►</span>
                <div class="voice-progress-bar"><div class="voice-progress"></div></div>
                <span class="voice-duration">${content.duration}</span>
            </div>
        `;
    } else {
        innerHTML += `<span>${content}</span>`;
    }
    bubble.innerHTML = innerHTML;

    const timeDiv = document.createElement('div');
    if (rhythmSettings.showTimestamp && timestamp) {
        timeDiv.style.cssText = "font-size: 11px; color: #aaa; margin: 0 4px; align-self: flex-end; padding-bottom: 2px;";
        timeDiv.innerText = timestamp;
    }

    if (sender === 'me') { 
        if (rhythmSettings.showTimestamp && timestamp) row.appendChild(timeDiv);
        row.appendChild(bubble); 
        row.appendChild(avatar); 
    } else { 
        row.appendChild(avatar); 
        row.appendChild(bubble); 
        if (rhythmSettings.showTimestamp && timestamp) row.appendChild(timeDiv);
    }
    
    chatWindow.appendChild(row);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}


function clearHistory() {
    if(confirm("确定要清空所有聊天记录吗宝宝？")) {
        chatHistory = []; localStorage.removeItem('chatHistoryDB');
        renderChatHistory(); closePanel('settings-menu');
    }
}

// ================= 导出/导入数据逻辑 (现代化分离架构版) =================

// 辅助工具：非阻塞的延迟函数，用于把主线程还给浏览器渲染 UI
const yieldThread = () => new Promise(resolve => setTimeout(resolve, 10));

const BackupUtils = {
    isMedia: (s) => typeof s === 'string' && s.length > 500 && /^data:(image|video|audio)\//i.test(s),
    
    extractMedia: (node, state) => {
        if (!state) state = { store: {}, map: new Map(), n: 0 };
        if (node === null || node === undefined) return node;
        
        if (typeof node === 'object' && node.data && BackupUtils.isMedia(node.data)) {
            let id = state.map.get(node.data);
            if (!id) {
                id = 'm' + state.n++;
                state.map.set(node.data, id);
                state.store[id] = node.data;
            }
            return { ...node, data: { __mRef: id } };
        }

        if (typeof node === 'string') {
            if (BackupUtils.isMedia(node)) {
                let id = state.map.get(node);
                if (!id) {
                    id = 'm' + state.n++;
                    state.map.set(node, id);
                    state.store[id] = node;
                }
                return { __mRef: id };
            }
            return node;
        }

        if (Array.isArray(node)) return node.map(x => BackupUtils.extractMedia(x, state));
        if (typeof node === 'object') {
            let out = {};
            for (let k in node) out[k] = BackupUtils.extractMedia(node[k], state);
            return out;
        }
        return node;
    },
    
    inlineMedia: (node, store) => {
        if (!store) store = {};
        if (node === null || node === undefined) return node;

        if (typeof node === 'object' && !Array.isArray(node) && node.data && node.data.__mRef) {
            const mediaData = store[node.data.__mRef];
            return mediaData !== undefined ? { ...node, data: mediaData } : node;
        }

        if (typeof node === 'object' && !Array.isArray(node) && node.__mRef) {
            return store[node.__mRef] !== undefined ? store[node.__mRef] : node;
        }
        
        if (Array.isArray(node)) return node.map(x => BackupUtils.inlineMedia(x, store));
        if (typeof node === 'object') {
            let o = {};
            for (let k in node) o[k] = BackupUtils.inlineMedia(node[k], store);
            return o;
        }
        return node;
    },

    dataUrlToBinary: (dataUrl) => {
        const m = /^data:([^,]+),([\s\S]*)$/.exec(dataUrl);
        if(!m) return null;
        try {
            const binary = atob(m[2].replace(/\s/g, ''));
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return { mime: m[1].split(';')[0].trim(), bytes };
        } catch(e) { return null; }
    }
};

async function exportData() {
    const backupBtn = document.getElementById('export-btn'); 
    
    try {
        if (backupBtn) backupBtn.innerText = "准备环境...";
        await yieldThread(); 

        let lsData = {};
        const keys = Object.keys(localStorage);
        const totalKeys = keys.length;
        
        for (let j = 0; j < totalKeys; j++) {
            let key = keys[j];
            let val = localStorage.getItem(key);
            try { lsData[key] = JSON.parse(val); } 
            catch(e) { lsData[key] = val; }
            
            if (j % 5 === 0) {
                if (backupBtn) backupBtn.innerText = `读取数据... ${Math.round((j / totalKeys) * 100)}%`;
                await yieldThread(); 
            }
        }

        if (backupBtn) backupBtn.innerText = "压缩媒体文件中...";
        await yieldThread();
        
        let state = { store: {}, map: new Map(), n: 0 };
        let processedLs = BackupUtils.extractMedia(lsData, state);
        
        let payload = {
            type: 'chatapp-backup-v4',
            timestamp: new Date().toISOString(),
            localStorage: processedLs,
            mediaStore: state.store
        };

        const dateStr = new Date().toLocaleDateString().replace(/\//g, '-');
        
        if (typeof JSZip !== 'undefined') {
            const zip = new JSZip();
            let mediaIndex = {};
            let mediaIds = Object.keys(payload.mediaStore);
            
            for (let i = 0; i < mediaIds.length; i++) {
                let id = mediaIds[i];
                let bin = BackupUtils.dataUrlToBinary(payload.mediaStore[id]);
                if (bin) {
                    zip.file(`media/${id}`, bin.bytes, { binary: true });
                    mediaIndex[id] = { mime: bin.mime };
                }
                if (i % 10 === 0) {
                    if (backupBtn) backupBtn.innerText = `打包媒体... ${Math.round((i / mediaIds.length) * 100)}%`;
                    await yieldThread(); 
                }
            }
            
            delete payload.mediaStore; 
            payload.mediaIndex = mediaIndex;
            zip.file('backup.json', JSON.stringify(payload));
            
            if (backupBtn) backupBtn.innerText = "生成压缩包...";
            await yieldThread();

            const blob = await zip.generateAsync({ 
                type: 'blob', 
                compression: 'DEFLATE',
                }, function updateCallback(metadata) {
                    if (backupBtn) backupBtn.innerText = `压缩中: ${metadata.percent.toFixed(0)}%`;
            });
            
            downloadFile(blob, `摇光_${dateStr}.zip`);
        } else {
            if (backupBtn) backupBtn.innerText = "生成 JSON 文件...";
            await yieldThread();
            const str = JSON.stringify(payload);
            const blob = new Blob([str], {type: "application/json;charset=utf-8"});
            downloadFile(blob, `摇光_${dateStr}.json`);
        }
        
        alert("宝宝，数据导出成功啦！妥妥的保存好哦~");
    } catch (err) {
        console.error("导出异常：", err);
        alert("打包出现了一点小问题，请刷新后再试一次吧宝宝。");
    } finally {
        if (backupBtn) backupBtn.innerText = "导出备份";
    }
}

function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm("导入数据将覆盖当前的所有聊天记录、设置和表情包哦！确定要继续吗宝宝？")) {
        event.target.value = ''; return;
    }

    try {
        let finalData = {};
        
        if (file.name.endsWith('.zip')) {
            if (typeof JSZip === 'undefined') throw new Error("缺少 ZIP 解析库");
            const zip = await JSZip.loadAsync(file);
            let jsonRaw = await zip.file('backup.json').async('string');
            let parsed = JSON.parse(jsonRaw);
            
            if (parsed.mediaIndex) {
               parsed.mediaStore = {};
               const mediaIds = Object.keys(parsed.mediaIndex);
               for (let i=0; i < mediaIds.length; i++) {
                   let id = mediaIds[i];
                   const zf = zip.file(`media/${id}`);
                   if(zf) {
                       const ab = await zf.async('arraybuffer');
                       parsed.mediaStore[id] = 'data:' + parsed.mediaIndex[id].mime + ';base64,' + 
                           btoa(String.fromCharCode(...new Uint8Array(ab)));
                   }
               }
            }
            finalData = parsed;
        } else {
            let text = await file.text();
            finalData = JSON.parse(text);
        }

        localStorage.clear();
        
        if (finalData.type && finalData.type.startsWith('chatapp-backup')) {
            let restoredLs = BackupUtils.inlineMedia(finalData.localStorage, finalData.mediaStore);
            for (let key in restoredLs) {
                let val = restoredLs[key];
                localStorage.setItem(key, typeof val === 'object' ? JSON.stringify(val) : val);
            }
        } else {
            for (let key in finalData) {
                localStorage.setItem(key, finalData[key]);
            }
        }
        
        alert("导入成功啦！页面即将刷新以加载那些美好的新数据~");
        location.reload();
    } catch(err) {
        console.error(err);
        alert("导入失败了呜呜，可能是文件损坏或者不支持该格式哦。");
    } finally {
        event.target.value = ''; 
    }
}

// ================= 长按与上下文菜单 =================
function bindLongPress(element, id, sender, type, content) {
    // 语音消息不允许长按
    if (type === 'voice') return;

    let isPressing = false;
    
    const start = (e) => {
        isPressing = true;
        pressTimer = setTimeout(() => {
            if(isPressing) showContextMenu(e, id, sender, type, content);
        }, 500);
    };
    const cancel = () => {
        isPressing = false;
        clearTimeout(pressTimer);
    };

    element.addEventListener('touchstart', start, {passive: true});
    element.addEventListener('touchend', cancel);
    element.addEventListener('touchmove', cancel);
    element.addEventListener('mousedown', start);
    element.addEventListener('mouseup', cancel);
    element.addEventListener('mouseleave', cancel);
    element.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e, id, sender, type, content);
    });
}

function showContextMenu(e, id, sender, type, content) {
    e.preventDefault();
    e.stopPropagation(); 
    selectedMsgIdForContext = id;
    
    let qText = (sender === 'me' ? "你" : document.getElementById('display-name').innerText) + ": ";
    if(type === 'img') qText += "[图片]";
    else if(type === 'mixed') qText += content.text + " [图片]";
    else if(type === 'voice') qText += content.text; // 引用时显示语音的文本
    else qText += content;
    
    selectedMsgIdForContext = { id, text: qText };

    const menu = document.getElementById('context-menu');
    menu.style.display = 'flex';
    
    let clientX = e.clientX || (e.touches && e.touches[0].clientX);
    let clientY = e.clientY || (e.touches && e.touches[0].clientY);
    
    menu.style.left = Math.min(clientX, window.innerWidth - 120) + 'px';
    menu.style.top = Math.min(clientY, window.innerHeight - 100) + 'px';
}

function hideContextMenu() { document.getElementById('context-menu').style.display = 'none'; }

function triggerQuote() {
    hideContextMenu();
    if(!selectedMsgIdForContext) return;
    currentQuoteText = selectedMsgIdForContext.text;
    document.getElementById('reply-preview-text').innerText = "回复：" + currentQuoteText;
    document.getElementById('reply-preview-bar').style.display = 'flex';
    msgInput.focus();
}
function cancelQuote() { currentQuoteText = null; document.getElementById('reply-preview-bar').style.display = 'none'; }

function triggerDelete() {
    hideContextMenu();
    if(!selectedMsgIdForContext) return;
    const idToDelete = selectedMsgIdForContext.id;
    
    chatHistory = chatHistory.filter(msg => msg.id !== idToDelete);
    localStorage.setItem('chatHistoryDB', JSON.stringify(chatHistory));
    
    const row = document.querySelector(`.msg-row[data-id="${idToDelete}"]`);
    if(row) {
        row.style.opacity = '0';
        setTimeout(() => row.remove(), 200);
    }
}

// ================= 发送与回复逻辑 (已更新) =================
function handleEnter(e) { if (e.key === 'Enter') handleSendButton(); }

function handleSendButton() {
    const text = msgInput.value.trim();
    document.getElementById('sticker-drawer').classList.remove('active');
    
    if (!text) { 
        if(!isBotReplying) checkAndTriggerReply(); 
        return; 
    }
    
    addMessageToChat('me', 'text', text, currentQuoteText);
    msgInput.value = '';
    cancelQuote(); 

    if (rhythmSettings.randomReadState && !isBotReplying) {
        const rand = Math.random();
        if (rand < 0.20) setStatusDot('yellow');
        else setStatusDot('green');
    } else if (!isBotReplying) {
        setStatusDot('green');
    }
}

function showTypingIndicator() {
    if (document.getElementById('typing-indicator-row')) return;
    const row = document.createElement('div'); row.className = 'msg-row you'; row.id = 'typing-indicator-row';
    row.innerHTML = `<div class="chat-avatar" style="background-image: var(--you-avatar)"></div><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
    chatWindow.appendChild(row); chatWindow.scrollTop = chatWindow.scrollHeight;
}
function hideTypingIndicator() { const el = document.getElementById('typing-indicator-row'); if (el) el.remove(); }

async function triggerBotReply() {
    isBotReplying = true;
    
    let allPhrases = [];
    for(let cat in replyLibrary) {
        allPhrases = allPhrases.concat(replyLibrary[cat].split(/\n/).filter(p => p.trim() !== ''));
    }
    let allVoices = [];
    for(let cat in voiceLibrary) {
        allVoices = allVoices.concat(voiceLibrary[cat] || []);
    }
    const allStickers = youStickers;

    if (allPhrases.length === 0 && allVoices.length === 0 && allStickers.length === 0) {
        addMessageToChat('you', 'text', '...');
        isBotReplying = false;
        return;
    }

    let replyCount = 1;
    const countRand = Math.random();
    if (countRand > 0.75 && countRand <= 0.95) replyCount = 2;
    else if (countRand > 0.95) replyCount = 3;

    let currentMode = replyMode;
    if (currentMode === 'mixed') currentMode = Math.random() > 0.5 ? 'split' : 'combined';
    
    let messageQueue = [];

    if (Math.random() < 0.03) {
        const name = document.getElementById('display-name').innerText;
        const action = tickleSettings.youAction || "拍了拍";
        const suffix = tickleSettings.youSuffix ? ` ${tickleSettings.youSuffix}` : "";
        messageQueue.push({ type: 'tickle', content: `${name} ${action} 你${suffix}` });
    }
    
    const totalItems = allPhrases.length + allVoices.length + allStickers.length;
    let combinedText = [];
    let combinedSticker = null;

    for (let i = 0; i < replyCount; i++) {
        const randIndex = Math.floor(Math.random() * totalItems);
        let message = {};

        if (randIndex < allPhrases.length) {
            const phrase = allPhrases[randIndex].trim();
            if (currentMode === 'combined') {
                combinedText.push(phrase);
            } else {
                message = { type: 'text', content: phrase };
                messageQueue.push(message);
            }
        } else if (randIndex < allPhrases.length + allVoices.length) {
            if (currentMode === 'combined') { replyCount++; continue; }
            const voiceIndex = randIndex - allPhrases.length;
            const randomVoice = allVoices[voiceIndex];
            const duration = await getAudioDuration(randomVoice.data);
            message = { type: 'voice', content: { text: randomVoice.text, data: randomVoice.data, duration: duration } };
            messageQueue.push(message);
        } else {
            const stickerIndex = randIndex - allPhrases.length - allVoices.length;
            const sticker = allStickers[stickerIndex];
            if (currentMode === 'combined') {
                if (!combinedSticker) combinedSticker = sticker;
            } else {
                if (rhythmSettings.mixEmoji) {
                    const phrase = allPhrases.length > 0 ? allPhrases[Math.floor(Math.random() * allPhrases.length)].trim() : '...';
                    messageQueue.push({ type: 'mixed', content: { text: phrase, img: sticker } });
                } else {
                    messageQueue.push({ type: 'img', content: sticker });
                }
            }
        }
    }

    if (currentMode === 'combined' && (combinedText.length > 0 || combinedSticker)) {
        if (combinedText.length > 0 && combinedSticker && rhythmSettings.mixEmoji) {
            messageQueue.push({ type: 'mixed', content: { text: combinedText.join(' '), img: combinedSticker } });
        } else {
            if (combinedText.length > 0) messageQueue.push({ type: 'text', content: combinedText.join(' ') });
            if (combinedSticker) messageQueue.push({ type: 'img', content: combinedSticker });
        }
    }

    let randomQuoteText = null;
    if (Math.random() < 0.3 && chatHistory.length > 0) {
        const myMsgs = chatHistory.filter(m => m.sender === 'me');
        if (myMsgs.length > 0) {
            const randomMsg = myMsgs[Math.floor(Math.random() * myMsgs.length)];
            randomQuoteText = "你: ";
            if (randomMsg.type === 'img') randomQuoteText += "[图片]";
            else if (randomMsg.type === 'mixed') randomQuoteText += randomMsg.content.text + " [图片]";
            else if (randomMsg.type === 'voice') randomQuoteText += randomMsg.content.text;
            else randomQuoteText += randomMsg.content;
        }
    }

    let firstRealMsgIndex = messageQueue.findIndex(m => m.type !== 'tickle');
    if (firstRealMsgIndex !== -1 && randomQuoteText) {
        messageQueue[firstRealMsgIndex].quote = randomQuoteText;
    }

    processMessageQueue(messageQueue);
}

function getAudioDuration(data) {
    return new Promise(resolve => {
        if (!data) { resolve('0:00"'); return; }
        const audio = new Audio(data);
        audio.onloadedmetadata = () => {
            const duration = Math.round(audio.duration);
            const durationStr = `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}"`;
            resolve(durationStr);
        };
        audio.onerror = () => resolve('???"');
        setTimeout(() => { if(audio.readyState === 0) resolve('???"'); }, 2000);
    });
}


function processMessageQueue(queue) {
    if(queue.length === 0) { isBotReplying = false; return; }
    
    let minDelay = rhythmSettings.minWait * 1000;
    let maxDelay = rhythmSettings.maxWait * 1000;
    let delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    
    const nextMsg = queue[0];
    
    if (nextMsg.type === 'tickle') {
        queue.shift();
        addMessageToChat('system', 'tickle', nextMsg.content);
        setTimeout(() => processMessageQueue(queue), 300);
        return;
    }
    
    showTypingIndicator();

    setTimeout(() => {
        hideTypingIndicator();
        const msg = queue.shift();
        addMessageToChat('you', msg.type, msg.content, msg.quote);
        if(queue.length > 0) setTimeout(() => processMessageQueue(queue), 400 + Math.random() * 500);
        else isBotReplying = false;
    }, delay);
}


// ================= 问卷功能 =================
let quizHistory = JSON.parse(localStorage.getItem('quizHistoryDB')) || [];

function sendQuiz() {
const qs = [];
for (let i = 1; i <= 5; i++) {
    const val = document.getElementById(`quiz-q${i}`).value.trim();
    if (!val) { alert(`第 ${i} 个问题不能空哦宝宝！`); return; }
    qs.push(val);
}

let allPhrases = [];
for (let cat in replyLibrary) {
    const phrases = replyLibrary[cat].split(/\n/).filter(p => p.trim() !== '');
    allPhrases = allPhrases.concat(phrases);
}
if (allPhrases.length === 0) allPhrases = ["嗯嗯，你说得对", "好哦", "我懂你", "抱抱", "一直陪着你"];

const answers = qs.map(() => {
    return allPhrases[Math.floor(Math.random() * allPhrases.length)].trim();
});

const now = Date.now();
const delayMinutes = 20 + Math.floor(Math.random() * 11); 
const targetTime = now + delayMinutes * 60 * 1000;

const quizRecord = {
    id: generateId(),
    questions: qs,
    answers: answers,
    sendTime: now,
    targetTime: targetTime,
    isReplied: false
};

quizHistory.unshift(quizRecord);
localStorage.setItem('quizHistoryDB', JSON.stringify(quizHistory));

for (let i = 1; i <= 5; i++) {
    document.getElementById(`quiz-q${i}`).value = '';
}

renderQuizHistory();

const arriveTime = new Date(targetTime);
const timeStr = `${arriveTime.getHours().toString().padStart(2,'0')}:${arriveTime.getMinutes().toString().padStart(2,'0')}`;
alert(`问卷寄出啦！预计 ${timeStr} 左右会收到回复哦~`);
}

function renderQuizHistory() {
const container = document.getElementById('quiz-history-list');
if (!container) return;
container.innerHTML = '';

if (quizHistory.length === 0) {
    container.innerHTML = '<div style="color:#888; font-size:13px;">还没有问卷记录呢，寄出第一份吧~</div>';
    return;
}

const now = Date.now();
const pendingQuizzes = quizHistory.filter(record => now < record.targetTime);

if (pendingQuizzes.length === 0) {
    container.innerHTML = '<div style="color:#888; font-size:13px; text-align:center; padding:10px 0;">没有待回复的问卷，寄出新问题吧</div>';
    return;
}

pendingQuizzes.forEach((record, idx) => {
    const sendDate = new Date(record.sendTime);
    const sendStr = `${sendDate.getHours().toString().padStart(2,'0')}:${sendDate.getMinutes().toString().padStart(2,'0')}`;

    let html = `<div style="border-bottom:1px solid var(--border-color); padding:12px 0;">`;
    html += `<div style="font-weight:600; font-size:13px; color:var(--accent-color);">问卷 <span style="font-weight:400; color:#888; font-size:12px;">${sendStr}</span></div>`;

    record.questions.forEach((q, i) => {
        html += `<div style="font-size:13px; margin-top:6px; color:var(--text-color);">${i+1}. ${q}</div>`;
        const remain = Math.max(0, Math.ceil((record.targetTime - now) / 60000));
        html += `<div style="font-size:12px; color:#888; padding-left:18px; font-style:italic;">预计 ${remain} 分钟后回复</div>`;
    });

    html += `</div>`;
    container.innerHTML += html;
});
}

setInterval(() => {
if (document.getElementById('sub-quiz') && document.getElementById('sub-quiz').classList.contains('active')) {
    renderQuizHistory();
}
if (document.getElementById('sub-quiz-history') && document.getElementById('sub-quiz-history').classList.contains('active')) {
    renderFullQuizHistory();  
}
}, 30000);

// ================= 问卷历史 =================
function openQuizHistory() {
renderFullQuizHistory();
openPanel('sub-quiz-history');
}

function renderFullQuizHistory() {
const container = document.getElementById('quiz-history-list-full');
if (!container) return;
container.innerHTML = '';

if (quizHistory.length === 0) {
    container.innerHTML = '<div style="text-align:center; color:#888; font-size:14px; margin-top:30px;">还没有问卷记录哦，寄出第一份吧~</div>';
    return;
}

const now = Date.now();

quizHistory.forEach((record, idx) => {
    const sendDate = new Date(record.sendTime);
    const sendStr = `${sendDate.getMonth()+1}-${sendDate.getDate()} ${sendDate.getHours().toString().padStart(2,'0')}:${sendDate.getMinutes().toString().padStart(2,'0')}`;

    let html = `
        <div class="letter-card" style="margin-bottom:15px;">
            <div class="sender">问卷 #${quizHistory.length - idx} <span class="time">${sendStr}</span></div>
    `;

    record.questions.forEach((q, i) => {
        html += `<div style="font-size:14px; margin-top:6px; color:var(--text-color);">${i+1}. ${q}</div>`;
        if (now >= record.targetTime) {
            html += `<div style="font-size:14px; color:var(--accent-color); padding-left:18px; margin-bottom:6px;">↳ ${record.answers[i] || "…"}</div>`;
        } else {
            const remain = Math.max(0, Math.ceil((record.targetTime - now) / 60000));
            html += `<div style="font-size:13px; color:#888; padding-left:18px; font-style:italic;">预计 ${remain} 分钟后回复</div>`;
        }
    });

    if (now >= record.targetTime) {
        html += `<div style="font-size:12px; color:#888; margin-top:8px;">已全部回复</div>`;
    } else {
        html += `<div style="font-size:12px; color:#888; margin-top:8px;">等待回复中...</div>`;
    }

    html += `</div>`;
    container.innerHTML += html;
});
}

// ================= 分类及表情包管理 =================
function renderCategorySelect() {
    catSelect.innerHTML = '';
    for(let cat in replyLibrary) {
        let opt = document.createElement('option'); opt.value = cat; opt.innerText = cat; catSelect.appendChild(opt);
    }
    catSelect.value = currentCategory;
    replyTextarea.value = replyLibrary[currentCategory] || "";
}
function switchCategory() { currentCategory = catSelect.value; replyTextarea.value = replyLibrary[currentCategory] || ""; }
function addNewCategory() {
    const newCat = prompt("请输入新分类名称：");
    if(newCat && newCat.trim() !== "") {
        if(!replyLibrary[newCat.trim()]) { replyLibrary[newCat.trim()] = ""; currentCategory = newCat.trim(); renderCategorySelect(); } 
        else { alert("分类已存在"); }
    }
}
function saveCategory() {
    replyLibrary[currentCategory] = replyTextarea.value;
    localStorage.setItem('replyLibraryDB', JSON.stringify(replyLibrary)); alert("已保存");
}
function deleteCategory() {
    if (Object.keys(replyLibrary).length <= 1) { alert("请至少保留一个分类哦！"); return; }
    if (confirm(`确定要删除【${currentCategory}】分类吗？`)) {
        delete replyLibrary[currentCategory]; localStorage.setItem('replyLibraryDB', JSON.stringify(replyLibrary));
        currentCategory = Object.keys(replyLibrary)[0]; renderCategorySelect();
    }
}

function renderStickers() {
    const myGrid = document.getElementById('my-stickers-grid'); const youGrid = document.getElementById('you-stickers-grid'); const drawer = document.getElementById('sticker-drawer');
    myGrid.innerHTML = ''; youGrid.innerHTML = ''; drawer.innerHTML = '';
    
    const createStickerWrapper = (b64, type, index) => {
        let wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        wrapper.style.display = 'inline-block';
        
        let img = document.createElement('img'); 
        img.src = b64; 
        img.className = 'sticker-item'; 
        wrapper.appendChild(img);
        
        let delBtn = document.createElement('div');
        delBtn.innerHTML = '×';
        delBtn.style.position = 'absolute';
        delBtn.style.top = '-5px';
        delBtn.style.right = '-5px';
        delBtn.style.width = '18px';
        delBtn.style.height = '18px';
        delBtn.style.background = 'rgba(255, 59, 48, 0.9)';
        delBtn.style.color = 'white';
        delBtn.style.borderRadius = '50%';
        delBtn.style.textAlign = 'center';
        delBtn.style.lineHeight = '16px';
        delBtn.style.fontSize = '12px';
        delBtn.style.cursor = 'pointer';
        delBtn.title = '双击删除';
        
        delBtn.ondblclick = () => {
            if(confirm("确定要删除这个表情包吗宝宝？")) {
                if (type === 'me') {
                    myStickers.splice(index, 1);
                    localStorage.setItem('myStickers', JSON.stringify(myStickers));
                } else {
                    youStickers.splice(index, 1);
                    localStorage.setItem('youStickers', JSON.stringify(youStickers));
                }
                renderStickers();
            }
        };
        wrapper.appendChild(delBtn);
        return wrapper;
    };

    myStickers.forEach((b64, index) => {
        myGrid.appendChild(createStickerWrapper(b64, 'me', index));
        let sendImg = document.createElement('img'); sendImg.src = b64; sendImg.className = 'sendable-sticker';
        sendImg.onclick = () => { addMessageToChat('me', 'img', b64, currentQuoteText); cancelQuote(); document.getElementById('sticker-drawer').classList.remove('active'); };
        drawer.appendChild(sendImg);
    });
    
    youStickers.forEach((b64, index) => { 
        youGrid.appendChild(createStickerWrapper(b64, 'you', index)); 
    });
}

function toggleStickerDrawer() { if(myStickers.length === 0) { alert("表情包为空"); return; } document.getElementById('sticker-drawer').classList.toggle('active'); }
function uploadSticker(event, person) {
    const file = event.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image(); img.onload = () => {
            const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
            let w = img.width, h = img.height; const max = 150;
            if(w > max) { h *= max/w; w = max; } if(h > max) { w *= max/h; h = max; }
            canvas.width = w; canvas.height = h; ctx.drawImage(img, 0, 0, w, h);
            const compressedB64 = canvas.toDataURL('image/jpeg', 0.7);
            if(person === 'me') { myStickers.push(compressedB64); localStorage.setItem('myStickers', JSON.stringify(myStickers)); } 
            else { youStickers.push(compressedB64); localStorage.setItem('youStickers', JSON.stringify(youStickers)); }
            renderStickers();
        }; img.src = e.target.result;
    }; reader.readAsDataURL(file);
}
function changeAvatar(event, person) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const imgUrl = `url('${e.target.result}')`;
            if(person === 'me') { document.documentElement.style.setProperty('--me-avatar', imgUrl); localStorage.setItem('myAvatar', imgUrl); } 
            else { document.documentElement.style.setProperty('--you-avatar', imgUrl); localStorage.setItem('youAvatar', imgUrl); }
        }; reader.readAsDataURL(file);
    }
}
function checkStorage() {
    let _lsTotal = 0;
    for (let _x in localStorage) { if (!localStorage.hasOwnProperty(_x)) continue; _lsTotal += ((localStorage[_x].length + _x.length) * 2); }
    document.getElementById('storage-info').innerHTML = `缓存占用：${(_lsTotal / 1024).toFixed(2)} KB <br>记录数：${chatHistory.length}/300`;
}