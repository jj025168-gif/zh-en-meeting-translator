"use strict";

// This file has two replaceable service boundaries: room (transport) and
// translate (translation). The rest of the app does not call ntfy directly.
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const synthesis = window.speechSynthesis || null;
const MAX_NTFY_BYTES = 4096;
const MAX_HISTORY = 300;
const PING_MS = 120000;
const OFFLINE_MS = 300000;
const LISTENING_MS = 30000;
const FALLBACK_MS = 15000;
const MODEL_IDS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"];
const STORE = {
  defaults: "hlzh-en-defaults-v1",
  settings: "hlzh-en-settings-v1",
  host: "hlzh-en-host-v1",
  soundNotice: "hlzh-en-sound-notice-v1",
  history: (code) => "hlzh-en-history-v1-" + code,
  identity: (code) => "hlzh-en-identity-v1-" + code,
  cursor: (code) => "hlzh-en-cursor-v1-" + code,
};

const ids = [
  "entryView", "entryForm", "entryTitle", "entryHint", "nameInput",
  "languageSelect", "entrySubmit", "entryError", "roomView", "roomCode",
  "memberCount", "membersButton", "inviteButton", "settingsButton",
  "connectionStatus", "membersPanel", "membersList", "membersClose",
  "conversation", "emptyConversation", "liveStatus", "interimText",
  "talkButton", "typeButton", "audioButton", "typingPanel", "typingInput",
  "typingSend", "typingCancel", "invitePanel", "inviteLink", "inviteShare",
  "inviteClose", "settingsView", "settingsClose", "settingsForm",
  "settingsName", "settingsLanguage", "fontSize", "fontSizeValue",
  "voiceZh", "voiceEn", "rateZh", "rateEn", "rateZhValue", "rateEnValue",
  "previewZh", "previewEn", "playbackSetting", "wakeLockNotice", "voiceWarning",
  "hostSettings", "apiKey", "modelSelect", "extraInstructions",
  "testTranslation", "testResult", "mymemoryEmail", "exportButton",
  "clearHistoryButton", "leaveButton", "settingsSave", "unlockOverlay",
  "unlockButton", "toast",
];
const ui = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

const COPY = {
  "zh-TW": {
    appTagline: "中英多人語音翻譯", audioButtonLabel: "本機播放開關",
    automatic: "自動", backToRoom: "返回房間", cancel: "取消",
    chineseRate: "中文語速", chineseVoice: "中文聲音",
    claudeApiKey: "Claude API 金鑰", clearHistory: "清空這台裝置的紀錄",
    close: "關閉", connecting: "連線中…", displayAndAudio: "顯示與播放",
    emptyConversation: "對話會顯示在這裡。點一下下方按鈕開始說話。",
    englishRate: "英文語速", englishVoice: "英文聲音",
    entryPrivacy: "請用新房間進行每場會議，並只把連結傳給與會者。",
    exportHistory: "複製對話紀錄", hostTranslation: "主持人翻譯設定",
    invite: "邀請", inviteHint: "把這個連結傳給與會者：",
    invitePeople: "邀請其他人", keyNote: "金鑰只存在這台裝置，請勿在共用手機上保存。",
    leaveRoom: "離開房間", members: "成員", model: "模型",
    myLanguage: "我說的語言", mymemoryEmail: "MyMemory 電子郵件（選填）",
    mymemoryNote: "免費翻譯備援會使用此信箱申請較高額度。",
    myName: "我的名字", namePlaceholder: "例如 Calven", otherSettings: "其他",
    playTranslations: "自動念出譯文", preview: "試聽", profile: "我的身分",
    ready: "準備好了", resumeRoom: "回到房間", roomTitle: "會議房間",
    conversationLabel: "對話內容",
    saveSettings: "儲存設定", send: "送出", settings: "設定",
    shareLink: "分享連結", tapToContinue: "點一下繼續",
    tapToTalk: "點一下說話", testTranslation: "測試翻譯",
    textSize: "對話字體大小", translationNotes: "補充說明與固定譯法",
    translationNotesPlaceholder: "人名、補習班名稱、常用術語…",
    typeButtonLabel: "改用鍵盤輸入", typePlaceholder: "輸入一句話",
    typeSentence: "輸入一句話",
    unlockHint: "重新整理後，點一下繼續，讓手機準備好播放語音。",
    wakeLockNote: "若裝置不支援保持螢幕開啟，請手動避免休眠。",
    create: "建立房間", join: "加入房間",
    createHint: "每個人用自己的手機加入同一個房間。",
    joinHint: "輸入名字並加入收到連結的房間。",
    connected: "已連線", reconnecting: "重新連線中…", offline: "目前離線",
    listening: "聆聽中…再點一次結束", sending: "送出中…",
    blocked: "正在說話…", speaking: "正在播放…",
    pending: "翻譯中…", replay: "再念一次", copy: "複製",
    notSentRetry: "未送出，點一下重送", retrySend: "重送",
    copied: "已複製", copyFailed: "無法複製，請手動選取。",
    noSpeech: "沒有聽到聲音，請再試一次。",
    permission: "請到設定開啟麥克風權限與 Siri／聽寫。",
    network: "網路有問題，請檢查連線後重試。",
    recognition: "語音辨識發生錯誤，請再試一次。",
    unsupported: "此瀏覽器不支援語音辨識，請使用鍵盤輸入。",
    speech: "無法播放語音。請關閉 iPhone 靜音開關、調高音量，再按播放鍵重試。",
    tooLong: "這句太長，請分成兩句。",
    busy: "連線服務暫時忙碌，請稍後再試。",
    transport: "訊息送出失敗，請檢查網路。",
    waitOther: "請等對方說完再試。",
    lostRace: "另一位成員先開始說話，已取消這次聽寫。",
    sameLanguage: "有多支同語言手機在線；請只留一支開啟本機播放，避免聲音重疊。",
    host: "主持人", online: "在線", away: "離線", languageZh: "中文",
    languageEn: "英文", empty: "請先輸入文字。",
    quota: "今天的免費翻譯額度用完了。",
    apiKey: "Claude API 金鑰無效或已失效。",
    rateLimit: "AI 翻譯請求太頻繁或額度不足。",
    translate: "翻譯失敗，請再試一次。",
    timeout: "翻譯逾時，請再試一次。",
    refused: "AI 拒絕翻譯這句，請換個說法。",
    wakeUnsupported: "此裝置無法保持螢幕喚醒，請讓螢幕保持開啟。",
    missingVoiceZh: "找不到繁體中文語音；系統會嘗試自行選擇。",
    missingVoiceEn: "找不到英文語音；系統會嘗試自行選擇。",
    noTts: "此瀏覽器不支援語音播放。",
    invalidRoom: "房間連結格式不正確。",
    historyCleared: "已清空這台裝置的紀錄。",
    historyEmpty: "目前沒有對話紀錄。",
    translationFailed: "翻譯暫時失敗。",
    shareFailed: "無法分享或複製連結，請手動複製畫面上的網址。",
    testing: "測試中…", saved: "設定已儲存。",
  },
  en: {
    appTagline: "Chinese–English group voice translation",
    audioButtonLabel: "Toggle sound on this device", automatic: "Automatic",
    backToRoom: "Back to room", cancel: "Cancel", chineseRate: "Chinese speed",
    chineseVoice: "Chinese voice", claudeApiKey: "Claude API key",
    clearHistory: "Clear history on this device", close: "Close",
    connecting: "Connecting…", displayAndAudio: "Display and sound",
    emptyConversation: "The conversation will appear here. Tap below to speak.",
    englishRate: "English speed", englishVoice: "English voice",
    entryPrivacy: "Use a new room for each meeting and share the link only with participants.",
    exportHistory: "Copy conversation", hostTranslation: "Host translation settings",
    invite: "Invite", inviteHint: "Send this link to participants:",
    invitePeople: "Invite people", keyNote: "The key is saved only on this device. Avoid shared phones.",
    leaveRoom: "Leave room", members: "Members", model: "Model",
    myLanguage: "I speak", mymemoryEmail: "MyMemory email (optional)",
    mymemoryNote: "This email can raise the free fallback quota.",
    myName: "My name", namePlaceholder: "For example, Amy",
    otherSettings: "Other", playTranslations: "Read translations aloud",
    preview: "Preview", profile: "My profile", ready: "Ready",
    resumeRoom: "Return to room", roomTitle: "Meeting room",
    conversationLabel: "Conversation",
    saveSettings: "Save settings", send: "Send", settings: "Settings",
    shareLink: "Share link", tapToContinue: "Tap to continue",
    tapToTalk: "Tap to speak", testTranslation: "Test translation",
    textSize: "Conversation text size",
    translationNotes: "Extra context and fixed terms",
    translationNotesPlaceholder: "Names, school name, common terms…",
    typeButtonLabel: "Type a sentence", typePlaceholder: "Type a sentence",
    typeSentence: "Type a sentence",
    unlockHint: "After refreshing, tap to enable audio on this phone.",
    wakeLockNote: "If this device cannot keep the screen awake, please keep it on.",
    create: "Create room", join: "Join room",
    createHint: "Each person joins the same room on their own phone.",
    joinHint: "Enter your name to join this room.",
    connected: "Connected", reconnecting: "Reconnecting…", offline: "Offline",
    listening: "Listening…tap again to stop", sending: "Sending…",
    blocked: "is speaking…", speaking: "Speaking…",
    pending: "Translating…", replay: "Read again", copy: "Copy",
    notSentRetry: "Not sent. Tap to retry.", retrySend: "Retry sending",
    copied: "Copied", copyFailed: "Copy failed. Please select the text.",
    noSpeech: "I did not hear anything. Please try again.",
    permission: "Enable microphone permission and Siri/Dictation in Settings.",
    network: "Network problem. Check your connection and retry.",
    recognition: "Speech recognition failed. Please try again.",
    unsupported: "Speech recognition is unavailable here. Use the keyboard.",
    speech: "Audio failed. Turn off iPhone silent mode, raise the volume, and tap replay.",
    tooLong: "This sentence is too long. Please split it into two.",
    busy: "The connection service is temporarily busy. Please try later.",
    transport: "The message could not be sent. Check your connection.",
    waitOther: "Please wait until the other person finishes.",
    lostRace: "Someone else started first. Your recording was stopped.",
    sameLanguage: "More than one phone uses the same language. Leave sound on for only one to avoid overlap.",
    host: "Host", online: "Online", away: "Offline", languageZh: "Chinese",
    languageEn: "English", empty: "Please enter a sentence.",
    quota: "Today's free translation quota is exhausted.",
    apiKey: "The Claude API key is invalid or expired.",
    rateLimit: "Too many AI translation requests or insufficient quota.",
    translate: "Translation failed. Please try again.",
    timeout: "Translation timed out. Please try again.",
    refused: "AI refused to translate this sentence. Please rephrase it.",
    wakeUnsupported: "This device cannot keep the screen awake. Please keep it on.",
    missingVoiceZh: "No Traditional Chinese voice was found. The system will choose one.",
    missingVoiceEn: "No English voice was found. The system will choose one.",
    noTts: "This browser cannot play speech.",
    invalidRoom: "The room link is invalid.",
    historyCleared: "History on this device was cleared.",
    historyEmpty: "There is no conversation history yet.",
    translationFailed: "Translation is temporarily unavailable.",
    shareFailed: "Could not share or copy the link. Copy the address shown.",
    testing: "Testing…", saved: "Settings saved.",
  },
};

function tr(key) {
  const lang = me ? me.lang : ui.languageSelect && ui.languageSelect.value === "en" ? "en" : "zh-TW";
  return (COPY[lang] || COPY["zh-TW"])[key] || key;
}

function readJSON(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (_error) {
    return fallback;
  }
}

function writeJSON(storage, key, value) {
  try { storage.setItem(key, JSON.stringify(value)); } catch (_error) { /* Private storage can fail. */ }
}

function removeStored(storage, key) {
  try { storage.removeItem(key); } catch (_error) { /* Continue without storage. */ }
}

function makeId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function makeRoomCode() {
  if (!window.crypto || !crypto.getRandomValues) throw new Error("Secure random numbers are unavailable.");
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function byteLength(value) {
  return new TextEncoder().encode(value).length;
}

function boundedNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : fallback;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class TransportFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// ntfy is entirely contained here. In particular, callers never assemble
// network envelopes, so settings and API keys cannot enter ntfy messages.
const room = (() => {
  let code = "";
  let person = null;
  let topic = "";
  let source = null;
  let statusHandler = () => {};
  let messageHandler = () => {};
  let busyHandler = () => {};
  let opened = false;
  let closed = true;
  let away = false;
  let reconnectTimer = null;
  let pingTimer = null;
  let reconnectCount = 0;
  let lastServerId = "";
  let epoch = 0;
  let sendChain = Promise.resolve();
  const seenMessageIds = new Set();

  function envelope(payload) {
    if (!person) throw new TransportFailure("transport");
    const base = {
      v: 1, type: payload.type, id: payload.id || makeId(),
      from: person.id, name: person.name, lang: person.lang,
      host: Boolean(person.host), ts: Date.now(),
    };
    if (payload.type === "hello" && payload.replyTo) base.replyTo = payload.replyTo;
    if (payload.type === "listening") base.on = Boolean(payload.on);
    if (payload.type === "utterance") {
      base.text = String(payload.text || "");
      if (payload.lang === "en" || payload.lang === "zh-TW") base.lang = payload.lang;
    }
    if (payload.type === "translation") {
      base.ref = String(payload.ref || "");
      base.text = String(payload.text || "");
      base.engine = payload.engine === "claude" ? "claude" : "mymemory";
      base.lang = payload.lang === "en" ? "en" : "zh-TW";
      // Translation lang is the output language; preserve sender identity too.
      base.memberLang = person.lang;
    }
    return base;
  }

  function fits(payload) {
    try { return byteLength(JSON.stringify(envelope(payload))) <= MAX_NTFY_BYTES; }
    catch (_error) { return false; }
  }

  function setStatus(value) { statusHandler(away && value === "connected" ? "offline" : value); }

  function connect() {
    if (closed || !topic) return;
    if (source) source.close();
    const connectionEpoch = epoch;
    let address = "https://ntfy.sh/" + topic + "/sse";
    if (lastServerId) address += "?since=" + encodeURIComponent(lastServerId);
    let openedSource;
    try {
      openedSource = new EventSource(address);
      source = openedSource;
    }
    catch (_error) { scheduleReconnect(); return; }
    openedSource.onopen = () => {
      if (closed || connectionEpoch !== epoch || source !== openedSource) return;
      reconnectCount = 0;
      setStatus("connected");
      // A hello on reconnect refreshes presence and lets late joiners find us.
      send({ type: "hello" }).catch(() => {});
      opened = true;
    };
    openedSource.onmessage = (event) => {
      if (closed || connectionEpoch !== epoch || source !== openedSource) return;
      let outer;
      let message;
      try {
        outer = JSON.parse(event.data);
        if (outer.event !== "message" || typeof outer.message !== "string") return;
        message = JSON.parse(outer.message);
      } catch (_error) { return; }
      if (!message || message.v !== 1 || typeof message.id !== "string" ||
          typeof message.from !== "string" || typeof message.type !== "string") return;
      const serverId = typeof outer.id === "string" ? outer.id : "";
      const serverTime = Number(outer.time);
      if (!serverId || !Number.isFinite(serverTime)) return;
      lastServerId = serverId;
      writeJSON(sessionStorage, STORE.cursor(code), lastServerId);
      if (seenMessageIds.has(message.id)) return;
      seenMessageIds.add(message.id);
      if (seenMessageIds.size > 3000) {
        const first = seenMessageIds.values().next().value;
        seenMessageIds.delete(first);
      }
      try { messageHandler(message, { id: serverId, time: serverTime }); }
      catch (_error) { /* Ignore an invalid or unrenderable SSE message. */ }
    };
    openedSource.onerror = () => {
      if (closed || connectionEpoch !== epoch || source !== openedSource) return;
      openedSource.close();
      source = null;
      opened = false;
      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (closed || reconnectTimer) return;
    setStatus(navigator.onLine === false ? "offline" : "reconnecting");
    const wait = Math.min(15000, 1000 * Math.pow(2, Math.min(reconnectCount++, 4)));
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, wait);
  }

  function retryDelay(header) {
    if (!header) return 5000;
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(header);
    return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 5000;
  }

  async function post(body, endpoint, expectedEpoch, releaseFirstAttempt, retryOnBusy) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (closed || expectedEpoch !== epoch) throw new TransportFailure("transport");
      let response;
      try {
        response = await fetch(endpoint, {
          method: "POST", body: body,
        });
      } catch (_error) {
        throw new TransportFailure("transport");
      } finally {
        if (attempt === 0) releaseFirstAttempt();
      }
      if (response.status === 429) {
        busyHandler();
        // A delayed listening on/off can arrive after its opposite event.
        if (!retryOnBusy || attempt === 2) throw new TransportFailure("busy");
        const wait = retryDelay(response.headers.get("Retry-After"));
        if (wait > 30000) throw new TransportFailure("busy");
        await delay(wait);
        if (closed || expectedEpoch !== epoch) throw new TransportFailure("transport");
        continue;
      }
      if (!response.ok) throw new TransportFailure("transport");
      if (source && source.readyState === EventSource.OPEN) setStatus("connected");
      try {
        const published = await response.json();
        return { id: published.id, time: Number(published.time) };
      } catch (_error) {
        return { id: "", time: NaN };
      }
    }
    throw new TransportFailure("busy");
  }

  function send(payload) {
    if (closed || !topic) return Promise.reject(new TransportFailure("transport"));
    const expectedEpoch = epoch;
    const endpoint = "https://ntfy.sh/" + topic;
    const packet = envelope(payload);
    const body = JSON.stringify(packet);
    if (byteLength(body) > MAX_NTFY_BYTES) return Promise.reject(new TransportFailure("tooLong"));
    // Preserve the order of initial POSTs, without making later messages wait
    // for this message's own Retry-After delay.
    let releaseFirstAttempt;
    const firstAttemptDone = new Promise((resolve) => {
      releaseFirstAttempt = resolve;
    });
    const turn = sendChain;
    sendChain = turn.then(() => firstAttemptDone);
    const task = turn.then(() => post(body, endpoint, expectedEpoch,
      releaseFirstAttempt, packet.type !== "listening"));
    return task.finally(() => releaseFirstAttempt());
  }

  function onMessage(handler) { messageHandler = handler; }
  function onStatus(handler) { statusHandler = handler; }
  function onBusy(handler) { busyHandler = handler; }

  function join(roomId, me) {
    leave(false);
    code = roomId;
    person = me;
    topic = "hlzh-en-" + roomId;
    closed = false;
    away = false;
    opened = false;
    reconnectCount = 0;
    lastServerId = readJSON(sessionStorage, STORE.cursor(code), "");
    seenMessageIds.clear();
    sendChain = Promise.resolve();
    setStatus("reconnecting");
    connect();
    pingTimer = setInterval(() => {
      if (!closed && opened) send({ type: "ping" }).catch(() => {});
    }, PING_MS);
  }

  function leave(announce = true) {
    if (announce && !closed && topic && person) {
      try {
        const body = JSON.stringify(envelope({ type: "bye" }));
        if (navigator.sendBeacon) navigator.sendBeacon("https://ntfy.sh/" + topic, body);
        else fetch("https://ntfy.sh/" + topic, { method: "POST", body: body, keepalive: true }).catch(() => {});
      } catch (_error) { /* Page may already be closing. */ }
    }
    closed = true;
    away = false;
    epoch++;
    if (source) source.close();
    source = null;
    clearTimeout(reconnectTimer);
    clearInterval(pingTimer);
    reconnectTimer = null;
    pingTimer = null;
    opened = false;
    setStatus("offline");
  }

  function markAway() {
    if (!closed) {
      away = true;
      setStatus("offline");
    }
  }
  function isClosed() { return closed; }
  function isOpen() { return !closed && source && source.readyState === EventSource.OPEN; }

  window.addEventListener("online", () => {
    if (!closed && !source) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
      connect();
    }
  });
  window.addEventListener("offline", () => { if (!closed) setStatus("offline"); });
  return { join, send, fits, onMessage, onStatus, onBusy, leave, markAway, isClosed, isOpen };
})();

let roomCode = "";
let me = null;
let history = [];
let localMode = "idle";
let transportStatus = "reconnecting";
let interim = "";
let recognition = null;
let recognitionToken = 0;
let recognitionStopping = false;
let recognitionWatchdog = null;
let errorResetTimer = null;
let wakeLock = null;
let toastTimer = null;
let voiceCache = [];
let voicesChangedFired = false;
let missingVoiceWarningShown = false;
let resumeJoinPending = false;
let speechUnlocked = false;
let speechUnlockReadyAt = 0;
let currentUtterance = null;
let speechToken = 0;
let speechWatchdog = null;
let speechWatchdogCallback = null;
let previewTimer = null;
let speakingItem = null;
let speechQueue = [];
const queuedSpeechIds = new Set();
const spokenIds = new Set();
const members = new Map();
const claims = new Map();
const pendingTranslations = new Map();
const fallbackTimers = new Map();
const translatingIds = new Set();

const savedSettings = readJSON(localStorage, STORE.settings, {});
const settings = {
  fontSize: boundedNumber(savedSettings.fontSize, 22, 42, 24),
  rateZh: boundedNumber(savedSettings.rateZh, 0.5, 1.5, 0.9),
  rateEn: boundedNumber(savedSettings.rateEn, 0.5, 1.5, 0.9),
  voiceZh: typeof savedSettings.voiceZh === "string" ? savedSettings.voiceZh : "",
  voiceEn: typeof savedSettings.voiceEn === "string" ? savedSettings.voiceEn : "",
  playback: savedSettings.playback !== false,
  email: typeof savedSettings.email === "string" ? savedSettings.email : "",
};
const savedHost = readJSON(localStorage, STORE.host, {});
const hostSettings = {
  apiKey: typeof savedHost.apiKey === "string" ? savedHost.apiKey.trim() : "",
  model: MODEL_IDS.includes(savedHost.model) ? savedHost.model : MODEL_IDS[1],
  extra: typeof savedHost.extra === "string" ? savedHost.extra.slice(0, 1000) : "",
};

function saveSettings() {
  writeJSON(localStorage, STORE.settings, settings);
  if (me && me.host) writeJSON(localStorage, STORE.host, hostSettings);
}

function saveIdentity() {
  if (!me || !roomCode) return;
  writeJSON(sessionStorage, STORE.identity(roomCode), {
    id: me.id, name: me.name, lang: me.lang, host: Boolean(me.host),
  });
}

function loadHistory() {
  const saved = readJSON(localStorage, STORE.history(roomCode), []);
  history = Array.isArray(saved) ? saved.filter((item) =>
    item && typeof item.id === "string" && typeof item.original === "string" &&
    (item.lang === "zh-TW" || item.lang === "en")).slice(-MAX_HISTORY) : [];
  for (const item of history) {
    if (item.from === me.id && !item.serverId && !item.engine) item.sent = false;
  }
  for (const item of history) if (item.engine) spokenIds.add(item.id);
  sortHistory();
}

function saveHistory() {
  sortHistory();
  history = history.slice(-MAX_HISTORY);
  writeJSON(localStorage, STORE.history(roomCode), history);
}

function orderCompare(a, b) {
  const at = Number(a.serverTime);
  const bt = Number(b.serverTime);
  if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
  if (Number.isFinite(at) && !Number.isFinite(bt)) return -1;
  if (!Number.isFinite(at) && Number.isFinite(bt)) return 1;
  const ai = String(a.serverId || "");
  const bi = String(b.serverId || "");
  return ai < bi ? -1 : ai > bi ? 1 : 0;
}

function sortHistory() {
  history.sort(orderCompare);
}

function getRecord(id) {
  return history.find((item) => item.id === id);
}

function showToast(message) {
  if (!message) return;
  ui.toast.textContent = message;
  ui.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 4500);
}

function showError(key) {
  localMode = "error";
  showToast(tr(key));
  renderStatus();
  clearTimeout(errorResetTimer);
  errorResetTimer = setTimeout(() => {
    if (localMode === "error") {
      localMode = "idle";
      renderStatus();
      drainSpeechQueue();
    }
  }, 900);
}

function sendSafely(payload) {
  return room.send(payload).catch((error) => {
    showToast(tr(error instanceof TransportFailure ? error.code : "transport"));
    throw error;
  });
}

function currentEntryLanguage() {
  return me ? me.lang : ui.languageSelect.value === "en" ? "en" : "zh-TW";
}

function applyLanguage() {
  const lang = currentEntryLanguage();
  document.documentElement.lang = lang === "en" ? "en" : "zh-Hant";
  const dictionary = COPY[lang];
  for (const node of document.querySelectorAll("[data-i18n]")) {
    const value = dictionary[node.dataset.i18n];
    if (value) node.textContent = value;
  }
  for (const node of document.querySelectorAll("[data-i18n-placeholder]")) {
    const value = dictionary[node.dataset.i18nPlaceholder];
    if (value) node.placeholder = value;
  }
  for (const node of document.querySelectorAll("[data-i18n-aria-label]")) {
    const value = dictionary[node.dataset.i18nAriaLabel];
    if (value) node.setAttribute("aria-label", value);
  }
  for (const node of document.querySelectorAll("[data-i18n-title]")) {
    const value = dictionary[node.dataset.i18nTitle];
    if (value) node.title = value;
  }
  document.title = dictionary.appTagline;
  if (!me) renderEntryCopy();
  renderConnection();
  renderMembers();
  renderStatus();
  renderConversation();
  updateVoices();
}

function renderEntryCopy() {
  const invited = Boolean(new URLSearchParams(location.search).get("room"));
  ui.entryTitle.textContent = tr(invited ? "join" : "create");
  ui.entryHint.textContent = tr(invited ? "joinHint" : "createHint");
  ui.entrySubmit.textContent = tr(invited ? "join" : "create");
}

function renderConnection() {
  ui.connectionStatus.textContent = tr(transportStatus);
  const row = ui.connectionStatus.closest(".connection-row");
  if (row) row.dataset.status = transportStatus;
}

function isOnline(member) {
  return member.online !== false && Date.now() - member.lastSeen < OFFLINE_MS;
}

function renderMembers() {
  if (!me) return;
  const sorted = Array.from(members.values()).sort((a, b) => {
    if (a.host !== b.host) return a.host ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  const onlineCount = sorted.filter(isOnline).length;
  ui.memberCount.textContent = String(onlineCount);
  const fragment = document.createDocumentFragment();
  for (const member of sorted) {
    const row = document.createElement("div");
    row.className = "member";
    const name = document.createElement("strong");
    name.className = "member-name";
    name.textContent = member.name;
    const detail = document.createElement("span");
    detail.className = "member-detail";
    detail.textContent = [
      member.lang === "en" ? tr("languageEn") : tr("languageZh"),
      member.host ? tr("host") : "",
      isOnline(member) ? tr("online") : tr("away"),
    ].filter(Boolean).join(" · ");
    row.append(name, detail);
    fragment.append(row);
  }
  ui.membersList.replaceChildren(fragment);
  const sameLanguage = ["zh-TW", "en"].some((language) =>
    sorted.filter((item) => isOnline(item) && item.lang === language).length >= 2);
  if (sameLanguage && readJSON(localStorage, STORE.soundNotice, false) !== true) {
    writeJSON(localStorage, STORE.soundNotice, true);
    showToast(tr("sameLanguage"));
  }
}

function winnerClaim() {
  const active = Array.from(claims.values()).filter((claim) => Date.now() < claim.expires);
  active.sort(orderCompare);
  return active[0] || null;
}

function stateName() {
  if (localMode === "listening" || localMode === "sending" || localMode === "error") return localMode;
  const winner = winnerClaim();
  if (winner && me && winner.from !== me.id) return "blocked";
  if (speakingItem) return "speaking";
  return "idle";
}

function renderStatus() {
  if (!me) return;
  const state = stateName();
  ui.roomView.dataset.state = state;
  const speaker = winnerClaim();
  let value = tr("ready");
  if (state === "listening") value = tr("listening");
  else if (state === "sending") value = tr("sending");
  else if (state === "blocked") value = (speaker.name || tr("members")) + " " + tr("blocked");
  else if (state === "speaking") value = tr("speaking");
  else if (state === "error") value = ui.toast.textContent || tr("transport");
  else if (!Recognition) value = tr("unsupported");
  ui.liveStatus.textContent = value;
  ui.interimText.textContent = interim;
  ui.talkButton.disabled = transportStatus !== "connected" || !Recognition ||
    (state !== "idle" && state !== "listening");
  ui.talkButton.classList.toggle("is-listening", state === "listening");
  ui.talkButton.setAttribute("aria-pressed", state === "listening" ? "true" : "false");
  ui.talkButton.textContent = tr(state === "listening" ? "listening" : "tapToTalk");
  ui.typeButton.disabled = transportStatus !== "connected" || state !== "idle";
  ui.audioButton.textContent = settings.playback ? "🔊" : "🔇";
  ui.audioButton.setAttribute("aria-pressed", settings.playback ? "true" : "false");
}

function messageAction(label, action, id) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "message-action";
  button.dataset.action = action;
  button.dataset.id = id;
  button.textContent = label;
  return button;
}

function renderConversation() {
  if (!me || !roomCode) return;
  sortHistory();
  const atBottom = ui.conversation.scrollHeight - ui.conversation.scrollTop -
    ui.conversation.clientHeight < 65;
  const fragment = document.createDocumentFragment();
  if (!history.length) {
    ui.emptyConversation.textContent = tr("emptyConversation");
    fragment.append(ui.emptyConversation);
  }
  history.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "message" + (item.from === me.id ? " is-mine" : "") +
      (index === history.length - 1 ? " is-latest" : "");
    card.dataset.id = item.id;
    const speaker = document.createElement("strong");
    speaker.className = "message-speaker";
    speaker.textContent = item.name || "?";
    const primary = document.createElement("p");
    primary.className = "message-primary";
    primary.lang = me.lang === "en" ? "en" : "zh-TW";
    const pendingText = item.from === me.id && item.sent === false
      ? tr("notSentRetry") : tr("pending");
    primary.textContent = (me.lang === "en" ? item.en : item.zh) || pendingText;
    const secondary = document.createElement("p");
    secondary.className = "message-secondary";
    secondary.lang = me.lang === "en" ? "zh-TW" : "en";
    secondary.textContent = (me.lang === "en" ? item.zh : item.en) || pendingText;
    const meta = document.createElement("p");
    meta.className = "message-meta";
    const when = Number.isFinite(Number(item.serverTime)) && item.serverTime
      ? item.serverTime * 1000 : item.ts;
    const time = Number.isFinite(when) ? new Date(when).toLocaleTimeString(
      me.lang === "en" ? "en-US" : "zh-TW", { hour: "2-digit", minute: "2-digit" }) : "";
    meta.textContent = [time, item.engine ? (item.engine === "claude" ? "Claude" : "MyMemory") : ""]
      .filter(Boolean).join(" · ");
    const actions = document.createElement("div");
    actions.className = "message-actions";
    if (item.from === me.id && item.sent === false) {
      actions.append(messageAction(tr("retrySend"), "retry", item.id));
    }
    if (me.lang === "en" ? item.en : item.zh) actions.append(messageAction(tr("replay"), "replay", item.id));
    actions.append(messageAction(tr("copy"), "copy", item.id));
    card.append(speaker, primary, secondary, meta, actions);
    fragment.append(card);
  });
  ui.conversation.replaceChildren(fragment);
  if (atBottom) ui.conversation.scrollTop = ui.conversation.scrollHeight;
}

function legacyCopy(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.readOnly = true;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.focus();
  area.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (_error) { /* No clipboard. */ }
  area.remove();
  return ok;
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text));
  }
  return Promise.resolve(legacyCopy(text));
}

class TranslationFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// Same 500-byte MyMemory request splitting as the iPhone-tested reference.
// It only splits calls to MyMemory; an ntfy utterance is never split.
function splitForTranslation(text) {
  if (byteLength(text) <= 500) return [text];
  const pieces = [];
  let piece = "";
  for (const character of text) {
    piece += character;
    if (/[。！？!?，,]/u.test(character)) {
      pieces.push(piece);
      piece = "";
    }
  }
  if (piece) pieces.push(piece);
  const chunks = [];
  let chunk = "";
  const flush = () => {
    if (chunk) chunks.push(chunk);
    chunk = "";
  };
  for (const part of pieces) {
    if (byteLength(chunk + part) <= 500) {
      chunk += part;
      continue;
    }
    flush();
    if (byteLength(part) <= 500) {
      chunk = part;
      continue;
    }
    for (const character of part) {
      if (byteLength(chunk + character) > 500) flush();
      chunk += character;
    }
  }
  flush();
  return chunks;
}

function isQuotaWarning(value) {
  return typeof value === "string" &&
    /mymemory\s+warning|quota|daily\s+(?:free\s+)?limit|used\s+all\s+available\s+free\s+translations|translation\s+limit|too\s+many\s+requests/i.test(value);
}

function targetLanguage(from) { return from === "en" ? "zh-TW" : "en"; }

function claudeContext() {
  const recent = history.filter((item) => item.engine && item.zh && item.en).slice(-6);
  if (!recent.length) return "";
  return "最近的對話（僅供理解，不要重譯）：\n" +
    recent.map((item) => {
      const translation = item.lang === "zh-TW" ? item.en : item.zh;
      return item.name + "（" + (item.lang === "zh-TW" ? "中文" : "英文") + "）：" +
        item.original + "\n→ " + translation;
    }).join("\n") + "\n\n";
}

function claudeSystemPrompt() {
  const lines = [
    "你是精通台灣繁體中文與英文的口譯員，正在為補習班主管與外籍英文老師的會議逐句翻譯。",
    "語氣自然、專業、口語。中譯英使用自然英文；英譯中使用台灣用語的繁體中文，不可出現簡體字。",
    "只輸出譯文本身，不加說明、標籤、註解或引號。",
    "原文可能來自語音辨識，有明顯同音錯字時可依上下文修正意思。",
  ];
  if (hostSettings.extra.trim()) lines.push("補充說明與固定譯法：" + hostSettings.extra.trim());
  return lines.join("\n");
}

async function translateWithClaude(text, from, to) {
  const instruction = to === "en"
    ? "請把這句繁體中文翻成自然英文："
    : "請把這句英文翻成台灣用語的繁體中文：";
  const body = {
    model: hostSettings.model,
    max_tokens: 1024,
    system: claudeSystemPrompt(),
    messages: [{ role: "user", content: claudeContext() + instruction + "\n" + text }],
    output_config: { effort: "low" },
  };
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": hostSettings.apiKey,
    "anthropic-version": "2026-10-21",
    "anthropic-dangerous-direct-browser-access": "true",
  };
  if (hostSettings.model !== "claude-haiku-5-5") {
    headers["anthropic-beta"] = "server-side-fallback-2026-07-01";
    body.fallbacks = "default";
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: headers, body: JSON.stringify(body), signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    if (error && error.name === "AbortError") throw new TranslationFailure("timeout");
    throw new TranslationFailure("network");
  }
  clearTimeout(timer);
  if (response.status === 401 || response.status === 403) throw new TranslationFailure("apiKey");
  if (response.status === 429 || response.status === 402) throw new TranslationFailure("rateLimit");
  if (response.status === 529 || response.status >= 500) throw new TranslationFailure("network");
  if (!response.ok) throw new TranslationFailure("translate");
  let data;
  try { data = await response.json(); } catch (_error) { throw new TranslationFailure("translate"); }
  if (data && data.stop_reason === "refusal") throw new TranslationFailure("refused");
  const translated = Array.isArray(data && data.content)
    ? data.content.filter((block) => block && block.type === "text" &&
      typeof block.text === "string").map((block) => block.text).join("").trim()
    : "";
  if (!translated) throw new TranslationFailure("translate");
  return translated.replace(/^["「『]+|["」』]+$/g, "").trim();
}

async function translateWithMyMemory(text, from, to) {
  const output = [];
  for (const chunk of splitForTranslation(text)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      let url = "https://api.mymemory.translated.net/get?q=" +
        encodeURIComponent(chunk) + "&langpair=" + encodeURIComponent(from + "|" + to);
      if (settings.email.trim()) url += "&de=" + encodeURIComponent(settings.email.trim());
      const response = await fetch(url, { signal: controller.signal });
      if (response.status === 429) throw new TranslationFailure("quota");
      if (!response.ok) throw new TranslationFailure("translate");
      const data = await response.json();
      const translated = data && data.responseData && data.responseData.translatedText;
      if (data && (Number(data.responseStatus) === 429 || data.quotaFinished === true ||
          isQuotaWarning(data.responseDetails) || isQuotaWarning(translated))) {
        throw new TranslationFailure("quota");
      }
      if (!data || Number(data.responseStatus) !== 200 ||
          typeof translated !== "string" || !translated.trim()) {
        throw new TranslationFailure("translate");
      }
      const decoder = document.createElement("textarea");
      decoder.innerHTML = translated.trim();
      output.push(decoder.value);
    } catch (error) {
      if (error instanceof TranslationFailure) throw error;
      if (error && error.name === "AbortError") throw new TranslationFailure("timeout");
      throw new TranslationFailure("network");
    } finally {
      clearTimeout(timer);
    }
  }
  return output.join(" ").trim();
}

// Translation boundary: this function alone chooses the engine.
async function translate(text, from, to) {
  if (hostSettings.apiKey && me && me.host) {
    return { text: await translateWithClaude(text, from, to), engine: "claude" };
  }
  return { text: await translateWithMyMemory(text, from, to), engine: "mymemory" };
}

function beginSpeakerFallback(item) {
  if (!me || me.host || item.from !== me.id || !item.serverId ||
      item.sent === false || fallbackTimers.has(item.id) || item.engine) return;
  const expectedRoom = roomCode;
  fallbackTimers.set(item.id, setTimeout(async () => {
    fallbackTimers.delete(item.id);
    if (item.engine || !item.serverId || item.sent === false ||
        roomCode !== expectedRoom || getRecord(item.id) !== item) return;
    try {
      const text = await translateWithMyMemory(item.original, item.lang, targetLanguage(item.lang));
      if (item.engine || !item.serverId || item.sent === false ||
          roomCode !== expectedRoom || getRecord(item.id) !== item) return;
      await publishTranslation(item, text, "mymemory");
    } catch (error) {
      if (!item.engine) showToast(tr(error instanceof TranslationFailure ? error.code : "translate"));
    }
  }, FALLBACK_MS));
}

function cancelFallback(id) {
  if (!fallbackTimers.has(id)) return;
  clearTimeout(fallbackTimers.get(id));
  fallbackTimers.delete(id);
}

async function publishTranslation(item, text, engine) {
  if (!text || !roomCode || !item.serverId || item.sent === false ||
      getRecord(item.id) !== item) return;
  const payload = {
    type: "translation", id: makeId(), ref: item.id,
    text: text, lang: targetLanguage(item.lang), engine: engine,
  };
  if (!room.fits(payload)) {
    showToast(tr("tooLong"));
    return;
  }
  const meta = await sendSafely(payload);
  applyTranslation({
    id: payload.id, ref: item.id, text: text,
    lang: payload.lang, engine: engine,
  }, meta);
}

async function hostTranslate(item) {
  if (!me || !me.host || !item.serverId || item.sent === false ||
      item.engine || translatingIds.has(item.id)) return;
  const expectedRoom = roomCode;
  translatingIds.add(item.id);
  try {
    let result;
    try {
      result = await translate(item.original, item.lang, targetLanguage(item.lang));
    } catch (_error) {
      if (item.engine || roomCode !== expectedRoom || getRecord(item.id) !== item) return;
      result = {
        text: await translateWithMyMemory(item.original, item.lang, targetLanguage(item.lang)),
        engine: "mymemory",
      };
    }
    if (roomCode !== expectedRoom || getRecord(item.id) !== item) return;
    if (item.engine === "claude") return;
    if (item.engine && result.engine !== "claude") return;
    await publishTranslation(item, result.text, result.engine);
  } catch (error) {
    showToast(tr(error instanceof TranslationFailure ? error.code : "translate"));
  } finally {
    translatingIds.delete(item.id);
  }
}

function applyTranslation(message, meta) {
  const item = getRecord(message.ref);
  if (!item) {
    const pending = pendingTranslations.get(message.ref) || [];
    pending.push({ message: message, meta: meta });
    pendingTranslations.set(message.ref, pending);
    return;
  }
  if (message.lang !== targetLanguage(item.lang) || typeof message.text !== "string" ||
      !message.text.trim()) return;
  const hadTranslation = Boolean(item.engine);
  const better = !hadTranslation || (item.engine !== "claude" && message.engine === "claude");
  if (!better) return;
  item.engine = message.engine === "claude" ? "claude" : "mymemory";
  item.translationId = message.id;
  item.translationTime = meta.time;
  item.translationServerId = meta.id;
  if (item.lang === "zh-TW") item.en = message.text.trim();
  else item.zh = message.text.trim();
  for (const queued of speechQueue) {
    if (!queued.manual && queued.id === item.id) {
      queued.text = me.lang === "en" ? item.en : item.zh;
    }
  }
  cancelFallback(item.id);
  saveHistory();
  renderConversation();
  if (!hadTranslation && item.from !== me.id && item.lang !== me.lang && settings.playback) {
    enqueueAutomaticSpeech(item);
  }
}

function addUtterance(message, meta) {
  let item = getRecord(message.id);
  if (!item) {
    item = {
      id: message.id, from: message.from, name: message.name,
      lang: message.lang, original: message.text, zh: message.lang === "zh-TW" ? message.text : "",
      en: message.lang === "en" ? message.text : "", engine: "",
      ts: message.ts, serverTime: meta.time, serverId: meta.id, sent: true,
    };
    history.push(item);
  } else if (item.sent !== false) {
    item.serverTime = meta.time;
    item.serverId = meta.id;
    item.sent = true;
  }
  saveHistory();
  renderConversation();
  const pending = pendingTranslations.get(item.id) || [];
  pendingTranslations.delete(item.id);
  pending.sort((a, b) => orderCompare(
    { serverTime: a.meta.time, serverId: a.meta.id },
    { serverTime: b.meta.time, serverId: b.meta.id }));
  for (const entry of pending) applyTranslation(entry.message, entry.meta);
  if (me && me.host && !item.engine) hostTranslate(item);
  if (me && item.from === me.id && !item.engine) beginSpeakerFallback(item);
}

function updatePresence(message, meta) {
  if (!message || typeof message.from !== "string" || !message.from ||
      typeof message.name !== "string" || !message.name.trim() ||
      !["zh-TW", "en"].includes(message.lang)) return;
  const prior = members.get(message.from);
  const identityLang = message.type === "translation"
    ? (["zh-TW", "en"].includes(message.memberLang) ? message.memberLang :
      prior ? prior.lang : "")
    : message.lang;
  if (!["zh-TW", "en"].includes(identityLang)) return;
  const serverTime = Number(meta && meta.time);
  members.set(message.from, {
    id: message.from, name: message.name, lang: identityLang,
    host: Boolean(message.host), online: message.type !== "bye",
    lastSeen: Number.isFinite(serverTime) && serverTime > 0
      ? serverTime * 1000 : Date.now(),
  });
  if (message.type === "bye") claims.delete(message.from);
  if (!prior || prior.name !== message.name || prior.lang !== identityLang ||
      prior.host !== Boolean(message.host) || prior.online === false) renderMembers();
  else renderMembers();
}

function handleListening(message, meta) {
  if (message.on) {
    if (me && message.from === me.id) {
      const own = claims.get(me.id);
      if (localMode !== "listening" || !own || own.id !== message.id) return;
    }
    const serverTime = Number(meta && meta.time);
    const expires = serverTime * 1000 + LISTENING_MS;
    if (!Number.isFinite(serverTime) || serverTime <= 0 || expires <= Date.now()) return;
    claims.set(message.from, {
      from: message.from, name: message.name, serverTime: meta.time,
      serverId: meta.id, expires: Math.min(expires, Date.now() + LISTENING_MS), id: message.id,
    });
  } else {
    if (me && message.from === me.id && localMode === "listening") return;
    claims.delete(message.from);
  }
  arbitrateListening();
  renderStatus();
  if (winnerClaim()) pauseSpeech();
  else resumeSpeech();
  drainSpeechQueue();
}

function arbitrateListening() {
  if (localMode !== "listening" || !me) return;
  const mine = claims.get(me.id);
  if (!mine || !mine.serverId) return;
  const winner = winnerClaim();
  if (winner && winner.from !== me.id) cancelListeningForRace();
}

function receiveRoomMessage(message, meta) {
  if (!me || !message || typeof message.from !== "string" || !message.from ||
      typeof message.name !== "string" || !message.name.trim() ||
      !["zh-TW", "en"].includes(message.lang)) return;
  if (!["hello", "ping", "bye", "listening", "utterance", "translation"].includes(message.type)) return;
  updatePresence(message, meta);
  const helloAge = Date.now() - Number(meta && meta.time) * 1000;
  if (message.type === "hello" && message.from !== me.id && !message.replyTo &&
      Number.isFinite(helloAge) && Math.abs(helloAge) <= 60000) {
    sendSafely({ type: "hello", replyTo: message.id }).catch(() => {});
  }
  if (message.type === "listening") handleListening(message, meta);
  if (message.type === "utterance" &&
      typeof message.text === "string" && ["zh-TW", "en"].includes(message.lang)) {
    addUtterance(message, meta);
  }
  if (message.type === "translation" && typeof message.ref === "string" &&
      typeof message.text === "string" && ["claude", "mymemory"].includes(message.engine)) {
    applyTranslation(message, meta);
  }
  if (message.type === "bye") {
    renderStatus();
    resumeSpeech();
    drainSpeechQueue();
  }
}

function presenceTick() {
  if (!me) return;
  let changed = false;
  for (const member of members.values()) {
    if (member.online && Date.now() - member.lastSeen >= OFFLINE_MS) {
      member.online = false;
      changed = true;
    }
  }
  for (const [id, claim] of claims) {
    if (Date.now() >= claim.expires) {
      claims.delete(id);
      changed = true;
    }
  }
  if (changed) {
    renderMembers();
    renderStatus();
    if (!winnerClaim()) resumeSpeech();
    drainSpeechQueue();
  }
}

function availableVoices(language) {
  if (language === "zh-TW") {
    const chinese = voiceCache.filter((voice) => voice.lang && /^zh/i.test(voice.lang));
    const traditional = chinese.filter((voice) =>
      /^zh[-_](?:tw|hant)(?:[-_]|$)/i.test(voice.lang));
    return traditional.length ? traditional : chinese;
  }
  return voiceCache.filter((voice) => voice.lang && /^en/i.test(voice.lang));
}

function populateVoiceSelect(select, voices, selectedURI) {
  const fragment = document.createDocumentFragment();
  const automatic = document.createElement("option");
  automatic.value = "";
  automatic.textContent = tr("automatic");
  fragment.append(automatic);
  for (const voice of voices) {
    if (!voice.voiceURI) continue;
    const option = document.createElement("option");
    option.value = voice.voiceURI;
    option.textContent = voice.name + " (" + voice.lang + ")";
    fragment.append(option);
  }
  select.replaceChildren(fragment);
  select.value = voices.some((voice) => voice.voiceURI === selectedURI) ? selectedURI : "";
}

function updateVoices() {
  voiceCache = [];
  if (!synthesis || typeof synthesis.getVoices !== "function") {
    populateVoiceSelect(ui.voiceZh, [], settings.voiceZh);
    populateVoiceSelect(ui.voiceEn, [], settings.voiceEn);
    ui.voiceWarning.textContent = tr("noTts");
    ui.voiceWarning.hidden = false;
    return;
  }
  try { voiceCache = Array.from(synthesis.getVoices() || []).filter(Boolean); }
  catch (_error) { voiceCache = []; }
  populateVoiceSelect(ui.voiceZh, availableVoices("zh-TW"), settings.voiceZh);
  populateVoiceSelect(ui.voiceEn, availableVoices("en-US"), settings.voiceEn);
  const warnings = [];
  if (voiceCache.length > 0 || voicesChangedFired) {
    if (!findVoice("zh-TW")) warnings.push(tr("missingVoiceZh"));
    if (!findVoice("en-US")) warnings.push(tr("missingVoiceEn"));
  }
  ui.voiceWarning.textContent = warnings.join(" ");
  ui.voiceWarning.hidden = warnings.length === 0;
}

function findVoice(language, selectedURI) {
  const preferred = selectedURI !== undefined ? selectedURI :
    language === "zh-TW" ? settings.voiceZh : settings.voiceEn;
  if (preferred) {
    const selected = voiceCache.find((voice) => voice.voiceURI === preferred);
    if (selected) return selected;
  }
  const normalized = language.toLowerCase();
  const exact = voiceCache.find((voice) => voice.lang &&
    voice.lang.toLowerCase().replace(/_/g, "-") === normalized);
  if (exact) return exact;
  if (language === "zh-TW") {
    return voiceCache.find((voice) => voice.lang && /^zh[-_]hk(?:[-_]|$)/i.test(voice.lang)) ||
      voiceCache.find((voice) => voice.lang && /^zh[-_]cn(?:[-_]|$)/i.test(voice.lang)) ||
      voiceCache.find((voice) => voice.lang && /^zh/i.test(voice.lang)) || null;
  }
  return voiceCache.find((voice) => voice.lang &&
    /^en(?:[-_]|$)/i.test(voice.lang)) || null;
}

// iPhone-tested pattern from reference: speak an empty utterance inside a
// user gesture, and do not immediately cancel it.
function unlockSpeech(language) {
  if (speechUnlocked || !synthesis || typeof SpeechSynthesisUtterance === "undefined") return false;
  try {
    const silent = new SpeechSynthesisUtterance("");
    silent.lang = language;
    silent.volume = 0;
    synthesis.speak(silent);
    speechUnlocked = true;
    speechUnlockReadyAt = Date.now() + 150;
    return true;
  } catch (_error) { return false; }
}

function createSpeechUtterance(text, language, voice) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language;
  utterance.rate = language === "zh-TW" ? settings.rateZh : settings.rateEn;
  utterance.volume = 1;
  if (voice) utterance.voice = voice;
  return utterance;
}

function clearSpeechWatchdog() {
  clearTimeout(speechWatchdog);
  speechWatchdog = null;
}

function startSpeechWatchdog(text, callback) {
  clearSpeechWatchdog();
  speechWatchdogCallback = callback;
  speechWatchdog = setTimeout(callback,
    Math.min(120000, Math.max(15000, text.length * 700)));
}

function playSpeech(text, language, voice, onEnd, onError, onTimeout = onEnd) {
  clearSpeechWatchdog();
  const token = ++speechToken;
  let settled = false;
  const finish = (callback) => {
    if (token !== speechToken || settled) return;
    settled = true;
    clearSpeechWatchdog();
    currentUtterance = null;
    callback();
  };
  let needsCancel;
  let utterance;
  try {
    needsCancel = synthesis.speaking || synthesis.pending;
    if (needsCancel) synthesis.cancel();
    utterance = createSpeechUtterance(text, language, voice);
  } catch (_error) {
    finish(onError);
    return;
  }
  utterance.onend = () => finish(onEnd);
  utterance.onerror = () => finish(onError);
  const start = () => {
    if (token !== speechToken || settled) return;
    try {
      currentUtterance = utterance;
      startSpeechWatchdog(text, () => {
        if (token !== speechToken || settled) return;
        finish(onTimeout);
        try { synthesis.cancel(); } catch (_error) { /* Already stopped. */ }
      });
      synthesis.speak(utterance);
      if (synthesis.paused && !winnerClaim()) synthesis.resume();
    } catch (_error) { finish(onError); }
  };
  if (needsCancel) setTimeout(start, 150);
  else start();
}

function pauseSpeech() {
  if (!synthesis || !speakingItem || synthesis.paused) return;
  try {
    synthesis.pause();
    clearSpeechWatchdog();
  } catch (_error) { /* Device may not support pause. */ }
}

function resumeSpeech() {
  if (!synthesis || !speakingItem || winnerClaim() || localMode === "listening") return;
  try {
    if (synthesis.paused) {
      synthesis.resume();
      if (speechWatchdogCallback) startSpeechWatchdog(speakingItem.text, speechWatchdogCallback);
    }
  } catch (_error) { /* The existing playback watchdog will handle failure. */ }
}

function enqueueAutomaticSpeech(item) {
  if (spokenIds.has(item.id) || queuedSpeechIds.has(item.id)) return;
  const text = me.lang === "en" ? item.en : item.zh;
  if (!text) return;
  speechQueue.push({ id: item.id, text: text,
    lang: me.lang === "en" ? "en-US" : "zh-TW", manual: false });
  queuedSpeechIds.add(item.id);
  speechQueue.sort((a, b) =>
    orderCompare(getRecord(a.id) || {}, getRecord(b.id) || {}));
  drainSpeechQueue();
}

function enqueueManualSpeech(text, language) {
  if (!text) return;
  unlockSpeech(language);
  speechQueue.push({ id: makeId(), text: text, lang: language, manual: true });
  drainSpeechQueue();
}

function drainSpeechQueue() {
  if (speakingItem || !speechQueue.length || winnerClaim() ||
      localMode === "listening" || localMode === "sending") return;
  if (!synthesis || typeof SpeechSynthesisUtterance === "undefined") {
    showToast(tr("speech"));
    speechQueue = [];
    queuedSpeechIds.clear();
    return;
  }
  if (!speechUnlocked && ui.unlockOverlay.hidden === false) return;
  if (Date.now() < speechUnlockReadyAt) {
    setTimeout(drainSpeechQueue, speechUnlockReadyAt - Date.now());
    return;
  }
  const item = speechQueue.shift();
  speakingItem = item;
  renderStatus();
  const finish = (failed) => {
    if (speakingItem !== item) return;
    speakingItem = null;
    if (!item.manual) {
      queuedSpeechIds.delete(item.id);
      spokenIds.add(item.id);
    }
    if (failed) showToast(tr("speech"));
    renderStatus();
    drainSpeechQueue();
  };
  const voice = findVoice(item.lang);
  if (!voice && (voiceCache.length > 0 || voicesChangedFired) && !missingVoiceWarningShown) {
    missingVoiceWarningShown = true;
    showToast(tr(item.lang === "zh-TW" ? "missingVoiceZh" : "missingVoiceEn"));
  }
  playSpeech(item.text, item.lang, voice,
    () => finish(false), () => finish(true), () => finish(false));
}

function cancelSpeechForMicrophone() {
  if (!synthesis) return;
  if (speakingItem) {
    speechQueue.unshift(speakingItem);
    speakingItem = null;
  }
  speechToken++;
  clearSpeechWatchdog();
  try { synthesis.cancel(); } catch (_error) { /* Audio may already be stopped. */ }
}

function setPlayback(enabled) {
  settings.playback = Boolean(enabled);
  if (!settings.playback) {
    speechQueue = speechQueue.filter((item) => {
      if (item.manual) return true;
      queuedSpeechIds.delete(item.id);
      spokenIds.add(item.id);
      return false;
    });
    if (speakingItem && !speakingItem.manual) {
      queuedSpeechIds.delete(speakingItem.id);
      spokenIds.add(speakingItem.id);
      speakingItem = null;
      speechToken++;
      clearSpeechWatchdog();
      try { if (synthesis) synthesis.cancel(); } catch (_error) { /* Already stopped. */ }
    }
  }
  saveSettings();
  renderStatus();
  drainSpeechQueue();
}

function recognitionErrorKey(code) {
  if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") return "permission";
  if (code === "no-speech") return "noSpeech";
  if (code === "network") return "network";
  return "recognition";
}

function sendListening(on, id = makeId()) {
  const payload = { type: "listening", id: id, on: on };
  const promise = sendSafely(payload);
  if (on && me) {
    claims.set(me.id, {
      from: me.id, name: me.name, id: id,
      serverTime: undefined, serverId: "",
      expires: Date.now() + LISTENING_MS,
    });
    promise.then((meta) => {
      const own = claims.get(me.id);
      if (own && own.id === id && !own.serverId) {
        own.serverTime = meta.time;
        own.serverId = meta.id;
        arbitrateListening();
      }
    }).catch(() => {
      if (localMode === "listening") cancelListeningForRace();
    });
  } else {
    if (me) claims.delete(me.id);
    promise.catch(() => {});
  }
  return promise;
}

function finishListening(text, errorKey) {
  clearTimeout(recognitionWatchdog);
  recognitionToken++;
  recognition = null;
  recognitionStopping = false;
  interim = "";
  if (me) claims.delete(me.id);
  sendListening(false);
  if (text && text.trim()) {
    localMode = "sending";
    submitUtterance(text.trim()).finally(() => {
      if (localMode === "sending") localMode = "idle";
      renderStatus();
      drainSpeechQueue();
    });
  } else if (errorKey) {
    showError(errorKey);
  } else {
    showError("noSpeech");
  }
  renderStatus();
}

function cancelListeningForRace() {
  if (localMode !== "listening") return;
  recognitionToken++;
  clearTimeout(recognitionWatchdog);
  const active = recognition;
  recognition = null;
  recognitionStopping = false;
  interim = "";
  try { if (active) active.abort(); } catch (_error) { /* Already ended. */ }
  if (me) claims.delete(me.id);
  sendListening(false);
  localMode = "idle";
  showToast(tr("lostRace"));
  renderStatus();
}

function startListening() {
  if (!Recognition || !me || localMode !== "idle" || transportStatus !== "connected") return;
  const winner = winnerClaim();
  if (winner && winner.from !== me.id) {
    showToast(tr("waitOther"));
    return;
  }
  cancelSpeechForMicrophone();
  if (synthesis && (synthesis.speaking || synthesis.pending)) {
    showError("speech");
    return;
  }
  unlockSpeech(me.lang === "en" ? "zh-TW" : "en-US");
  let current;
  try { current = new Recognition(); }
  catch (_error) { showError("recognition"); return; }
  const token = ++recognitionToken;
  recognition = current;
  recognitionStopping = false;
  current.lang = me.lang === "en" ? "en-US" : "zh-TW";
  current.interimResults = true;
  current.continuous = false;
  current.maxAlternatives = 1;
  let finalText = "";
  let receivedResult = false;
  let failed = false;
  current.onresult = (event) => {
    if (token !== recognitionToken) return;
    receivedResult = true;
    clearTimeout(recognitionWatchdog);
    let final = "";
    let interimValue = "";
    for (let index = 0; index < event.results.length; index++) {
      const result = event.results[index];
      if (!result[0]) continue;
      if (result.isFinal) final += result[0].transcript;
      else interimValue += result[0].transcript;
    }
    finalText = final.trim();
    interim = interimValue.trim() || finalText;
    renderStatus();
  };
  current.onerror = (event) => {
    if (token !== recognitionToken) return;
    failed = true;
    finishListening("", recognitionErrorKey(event.error));
  };
  current.onend = () => {
    if (token !== recognitionToken || failed) return;
    finishListening(finalText, finalText ? "" : "noSpeech");
  };
  localMode = "listening";
  sendListening(true);
  renderStatus();
  try {
    // iOS requires start() to remain in this synchronous click handler.
    current.start();
  } catch (_error) {
    finishListening("", "recognition");
    return;
  }
  recognitionWatchdog = setTimeout(() => {
    if (token !== recognitionToken || receivedResult) return;
    try { current.abort(); } catch (_error) { /* Already stopped. */ }
    finishListening("", "noSpeech");
  }, 8000);
}

function stopListening() {
  if (localMode !== "listening" || !recognition || recognitionStopping) return;
  recognitionStopping = true;
  renderStatus();
  try { recognition.stop(); }
  catch (_error) { finishListening("", "recognition"); }
}

function submitUtterance(text, id = makeId()) {
  let item = getRecord(id);
  const clean = item ? item.original : text.trim();
  if (!clean) {
    showToast(tr("empty"));
    return Promise.resolve(false);
  }
  if (item && item.sent === true && item.serverId) return Promise.resolve(true);
  const payload = { type: "utterance", id: id, text: clean, lang: item ? item.lang : me.lang };
  const expectedRoom = roomCode;
  if (!room.fits(payload)) {
    showToast(tr("tooLong"));
    return Promise.resolve(false);
  }
  if (!item) {
    item = {
      id: id, from: me.id, name: me.name, lang: me.lang,
      original: clean, zh: me.lang === "zh-TW" ? clean : "",
      en: me.lang === "en" ? clean : "", engine: "", ts: Date.now(), sent: null,
    };
    history.push(item);
  } else item.sent = null;
  saveHistory();
  renderConversation();
  return sendSafely(payload).then((meta) => {
    if (roomCode !== expectedRoom || getRecord(item.id) !== item) return false;
    const serverId = meta && typeof meta.id === "string" ? meta.id : "";
    if (serverId) {
      item.serverTime = meta.time;
      item.serverId = serverId;
    }
    if (!item.serverId) {
      item.sent = false;
      saveHistory();
      renderConversation();
      showToast(tr("transport"));
      return false;
    }
    item.sent = true;
    saveHistory();
    renderConversation();
    if (me.host) hostTranslate(item);
    else beginSpeakerFallback(item);
    return true;
  }).catch(() => {
    if (roomCode !== expectedRoom || getRecord(item.id) !== item) return false;
    if (!item.serverId) {
      item.sent = false;
      saveHistory();
      renderConversation();
    }
    return Boolean(item.serverId);
  });
}

function submitTyped(text) {
  if (!me || localMode !== "idle" || winnerClaim() || transportStatus !== "connected") return;
  const clean = text.trim();
  if (!clean) { showToast(tr("empty")); return; }
  const utteranceId = makeId();
  // Refuse before listening on/off, so an oversized paste produces no POST.
  if (!room.fits({ type: "utterance", id: utteranceId, text: clean })) {
    showToast(tr("tooLong"));
    return;
  }
  unlockSpeech(me.lang === "en" ? "zh-TW" : "en-US");
  localMode = "sending";
  renderStatus();
  ui.typingInput.value = "";
  ui.typingPanel.hidden = true;
  sendListening(true);
  sendListening(false);
  submitUtterance(clean, utteranceId).finally(() => {
    if (localMode === "sending") localMode = "idle";
    renderStatus();
    drainSpeechQueue();
  });
}

function inviteUrl() {
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("room", roomCode);
  url.hash = "";
  return url.href;
}

function fillSettingsForm() {
  if (!me) return;
  ui.settingsName.value = me.name;
  ui.settingsLanguage.value = me.lang;
  ui.fontSize.value = String(settings.fontSize);
  ui.fontSizeValue.textContent = settings.fontSize + " px";
  ui.rateZh.value = String(settings.rateZh);
  ui.rateEn.value = String(settings.rateEn);
  ui.rateZhValue.textContent = settings.rateZh.toFixed(2).replace(/0$/, "") + "×";
  ui.rateEnValue.textContent = settings.rateEn.toFixed(2).replace(/0$/, "") + "×";
  ui.playbackSetting.checked = settings.playback;
  ui.mymemoryEmail.value = settings.email;
  ui.hostSettings.hidden = !me.host;
  if (me.host) {
    ui.apiKey.value = hostSettings.apiKey;
    ui.modelSelect.value = hostSettings.model;
    ui.extraInstructions.value = hostSettings.extra;
  }
  ui.testResult.textContent = "";
  updateVoices();
}

function collectSettingsForm() {
  if (!me) return false;
  const nextName = ui.settingsName.value.trim().slice(0, 40);
  if (!nextName) {
    ui.settingsName.focus();
    return false;
  }
  const nextLang = ui.settingsLanguage.value === "en" ? "en" : "zh-TW";
  const identityChanged = nextName !== me.name || nextLang !== me.lang;
  me.name = nextName;
  me.lang = nextLang;
  settings.fontSize = boundedNumber(ui.fontSize.value, 22, 42, 24);
  settings.rateZh = boundedNumber(ui.rateZh.value, 0.5, 1.5, 0.9);
  settings.rateEn = boundedNumber(ui.rateEn.value, 0.5, 1.5, 0.9);
  settings.voiceZh = ui.voiceZh.value;
  settings.voiceEn = ui.voiceEn.value;
  setPlayback(ui.playbackSetting.checked);
  settings.email = ui.mymemoryEmail.validity.valid ? ui.mymemoryEmail.value.trim() : "";
  if (me.host) {
    hostSettings.apiKey = ui.apiKey.value.trim();
    hostSettings.model = MODEL_IDS.includes(ui.modelSelect.value) ?
      ui.modelSelect.value : MODEL_IDS[1];
    hostSettings.extra = ui.extraInstructions.value.trim().slice(0, 1000);
  }
  saveSettings();
  saveIdentity();
  writeJSON(localStorage, STORE.defaults, { name: me.name, lang: me.lang });
  document.documentElement.style.setProperty("--conversation-size", settings.fontSize + "px");
  if (identityChanged) {
    members.set(me.id, {
      id: me.id, name: me.name, lang: me.lang,
      host: me.host, online: true, lastSeen: Date.now(),
    });
    sendSafely({ type: "hello" }).catch(() => {});
  }
  applyLanguage();
  renderMembers();
  renderConversation();
  renderStatus();
  return true;
}

function closePanels() {
  ui.membersPanel.hidden = true;
  ui.invitePanel.hidden = true;
  ui.membersButton.setAttribute("aria-expanded", "false");
  ui.inviteButton.setAttribute("aria-expanded", "false");
}

async function requestWakeLock() {
  if (!me) return;
  if (!navigator.wakeLock || !navigator.wakeLock.request) {
    ui.wakeLockNotice.textContent = tr("wakeUnsupported");
    return;
  }
  if (document.visibilityState !== "visible") return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    ui.wakeLockNotice.textContent = tr("wakeLockNote");
  } catch (_error) {
    ui.wakeLockNotice.textContent = tr("wakeUnsupported");
  }
}

function enterRoom(code, identity, restored) {
  roomCode = code;
  me = identity;
  localMode = "idle";
  transportStatus = "reconnecting";
  interim = "";
  speechQueue = [];
  queuedSpeechIds.clear();
  spokenIds.clear();
  members.clear();
  claims.clear();
  pendingTranslations.clear();
  for (const timer of fallbackTimers.values()) clearTimeout(timer);
  fallbackTimers.clear();
  translatingIds.clear();
  saveIdentity();
  loadHistory();
  members.set(me.id, {
    id: me.id, name: me.name, lang: me.lang,
    host: Boolean(me.host), online: true, lastSeen: Date.now(),
  });
  ui.entryView.hidden = true;
  ui.settingsView.hidden = true;
  ui.roomView.hidden = false;
  ui.unlockOverlay.hidden = !restored;
  ui.roomCode.textContent = code;
  ui.inviteLink.textContent = inviteUrl();
  closePanels();
  applyLanguage();
  document.documentElement.style.setProperty("--conversation-size", settings.fontSize + "px");
  fillSettingsForm();
  room.onMessage(receiveRoomMessage);
  room.onBusy(() => showToast(tr("busy")));
  room.onStatus((status) => {
    transportStatus = status;
    if (status === "connected") resumeJoinPending = false;
    renderConnection();
    renderStatus();
  });
  room.join(code, me);
  requestWakeLock();
  for (const item of history) {
    if (item.from !== me.id || item.engine || !item.serverId || item.sent === false) continue;
    if (me.host) hostTranslate(item);
    else beginSpeakerFallback(item);
  }
}

function leaveRoom() {
  if (!me) return;
  room.leave();
  removeStored(sessionStorage, STORE.identity(roomCode));
  removeStored(sessionStorage, STORE.cursor(roomCode));
  for (const timer of fallbackTimers.values()) clearTimeout(timer);
  fallbackTimers.clear();
  if (recognition) {
    recognitionToken++;
    try { recognition.abort(); } catch (_error) { /* Already ended. */ }
    recognition = null;
  }
  cancelSpeechForMicrophone();
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
  me = null;
  roomCode = "";
  history = [];
  members.clear();
  claims.clear();
  speechQueue = [];
  localMode = "idle";
  ui.settingsView.hidden = true;
  ui.roomView.hidden = true;
  ui.entryView.hidden = false;
  closePanels();
  ui.unlockOverlay.hidden = true;
  const url = new URL(location.href);
  url.searchParams.delete("room");
  historyReplace(url);
  ui.languageSelect.value = "zh-TW";
  applyLanguage();
}

function historyReplace(url) {
  try { window.history.replaceState(null, "", url.href); }
  catch (_error) { /* file URL can reject history changes in some browsers. */ }
}

function openRoomFromForm(event) {
  event.preventDefault();
  const name = ui.nameInput.value.trim().slice(0, 40);
  if (!name) {
    ui.nameInput.focus();
    return;
  }
  const invited = new URLSearchParams(location.search).get("room");
  const language = ui.languageSelect.value === "en" ? "en" : "zh-TW";
  let code;
  try { code = invited || makeRoomCode(); }
  catch (_error) {
    ui.entryError.textContent = tr("transport");
    ui.entryError.hidden = false;
    return;
  }
  if (!/^[A-Za-z0-9]{12,40}$/.test(code)) {
    ui.entryError.textContent = tr("invalidRoom");
    ui.entryError.hidden = false;
    return;
  }
  // This must happen synchronously in the Create/Join click handler for iOS.
  unlockSpeech(language === "en" ? "zh-TW" : "en-US");
  const identity = { id: makeId(), name: name, lang: language, host: !invited };
  removeStored(sessionStorage, STORE.cursor(code));
  writeJSON(localStorage, STORE.defaults, { name: name, lang: language });
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("room", code);
  historyReplace(url);
  enterRoom(code, identity, false);
}

function restoreOrPrepareEntry() {
  const code = new URLSearchParams(location.search).get("room");
  const savedDefaults = readJSON(localStorage, STORE.defaults, {});
  ui.nameInput.value = typeof savedDefaults.name === "string" ? savedDefaults.name.slice(0, 40) : "";
  ui.languageSelect.value = savedDefaults.lang === "en" || savedDefaults.lang === "zh-TW"
    ? savedDefaults.lang : code ? "en" : "zh-TW";
  if (code && /^[A-Za-z0-9]{12,40}$/.test(code)) {
    const saved = readJSON(sessionStorage, STORE.identity(code), null);
    if (saved && typeof saved.id === "string" && typeof saved.name === "string" &&
        ["en", "zh-TW"].includes(saved.lang) && typeof saved.host === "boolean") {
      enterRoom(code, saved, true);
      return;
    }
  }
  applyLanguage();
  if (code && !/^[A-Za-z0-9]{12,40}$/.test(code)) {
    ui.entryError.textContent = tr("invalidRoom");
    ui.entryError.hidden = false;
  } else if (!Recognition) {
    ui.entryError.textContent = tr("unsupported");
    ui.entryError.hidden = false;
  }
}

function resumeRoomConnection() {
  if (!me || !roomCode || resumeJoinPending) return;
  if (!room.isClosed() && transportStatus === "connected" && room.isOpen()) return;
  resumeJoinPending = true;
  room.join(roomCode, me);
}

function init() {
  ui.entryForm.addEventListener("submit", openRoomFromForm);
  ui.languageSelect.addEventListener("change", applyLanguage);
  ui.talkButton.addEventListener("click", () => {
    if (localMode === "listening") stopListening();
    else startListening();
  });
  ui.typeButton.addEventListener("click", () => {
    if (stateName() !== "idle" || transportStatus !== "connected") return;
    ui.typingPanel.hidden = false;
    ui.typingInput.focus();
  });
  ui.typingCancel.addEventListener("click", () => { ui.typingPanel.hidden = true; });
  ui.typingPanel.addEventListener("submit", (event) => {
    event.preventDefault();
    submitTyped(ui.typingInput.value);
  });
  ui.audioButton.addEventListener("click", () => {
    setPlayback(!settings.playback);
    ui.playbackSetting.checked = settings.playback;
  });
  ui.membersButton.addEventListener("click", () => {
    ui.membersPanel.hidden = false;
    ui.membersButton.setAttribute("aria-expanded", "true");
    renderMembers();
  });
  ui.membersClose.addEventListener("click", closePanels);
  ui.inviteButton.addEventListener("click", () => {
    ui.invitePanel.hidden = false;
    ui.inviteButton.setAttribute("aria-expanded", "true");
    ui.inviteLink.textContent = inviteUrl();
  });
  ui.inviteClose.addEventListener("click", closePanels);
  ui.inviteShare.addEventListener("click", async () => {
    const link = inviteUrl();
    if (navigator.share) {
      try { await navigator.share({ title: tr("appTagline"), url: link }); }
      catch (error) { if (error && error.name !== "AbortError") showToast(tr("shareFailed")); }
      return;
    }
    showToast(tr((await copyText(link)) ? "copied" : "shareFailed"));
  });
  ui.settingsButton.addEventListener("click", () => {
    closePanels();
    fillSettingsForm();
    ui.settingsView.hidden = false;
    ui.roomView.hidden = true;
  });
  ui.settingsClose.addEventListener("click", () => {
    ui.settingsView.hidden = true;
    ui.roomView.hidden = false;
  });
  ui.settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!collectSettingsForm()) return;
    ui.settingsView.hidden = true;
    ui.roomView.hidden = false;
    showToast(tr("saved"));
  });
  ui.fontSize.addEventListener("input", () => {
    ui.fontSizeValue.textContent = ui.fontSize.value + " px";
    document.documentElement.style.setProperty("--conversation-size", ui.fontSize.value + "px");
  });
  for (const pair of [[ui.rateZh, ui.rateZhValue], [ui.rateEn, ui.rateEnValue]]) {
    pair[0].addEventListener("input", () => {
      pair[1].textContent = Number(pair[0].value).toFixed(2).replace(/0$/, "") + "×";
    });
  }
  ui.previewZh.addEventListener("click", () => {
    settings.voiceZh = ui.voiceZh.value;
    settings.rateZh = boundedNumber(ui.rateZh.value, 0.5, 1.5, 0.9);
    saveSettings();
    const justUnlocked = unlockSpeech("zh-TW");
    if (previewTimer) clearTimeout(previewTimer);
    const preview = () => enqueueManualSpeech("你好，很高興認識你。", "zh-TW");
    if (justUnlocked) previewTimer = setTimeout(preview, 150);
    else preview();
  });
  ui.previewEn.addEventListener("click", () => {
    settings.voiceEn = ui.voiceEn.value;
    settings.rateEn = boundedNumber(ui.rateEn.value, 0.5, 1.5, 0.9);
    saveSettings();
    const justUnlocked = unlockSpeech("en-US");
    if (previewTimer) clearTimeout(previewTimer);
    const preview = () => enqueueManualSpeech("Hello, it is nice to meet you.", "en-US");
    if (justUnlocked) previewTimer = setTimeout(preview, 150);
    else preview();
  });
  ui.testTranslation.addEventListener("click", async () => {
    if (!me || !me.host) return;
    hostSettings.apiKey = ui.apiKey.value.trim();
    hostSettings.model = MODEL_IDS.includes(ui.modelSelect.value) ? ui.modelSelect.value : MODEL_IDS[1];
    hostSettings.extra = ui.extraInstructions.value.trim().slice(0, 1000);
    saveSettings();
    ui.testTranslation.disabled = true;
    ui.testResult.textContent = tr("testing");
    try {
      const result = await translate("我們下週開始新的課程", "zh-TW", "en");
      ui.testResult.textContent = result.engine + ": " + result.text;
    } catch (error) {
      ui.testResult.textContent = tr(error instanceof TranslationFailure ? error.code : "translate");
    } finally { ui.testTranslation.disabled = false; }
  });
  ui.conversation.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const item = getRecord(button.dataset.id);
    if (!item) return;
    if (button.dataset.action === "retry") {
      if (item.from === me.id && item.sent === false) submitUtterance(item.original, item.id);
      return;
    }
    if (button.dataset.action === "replay") {
      enqueueManualSpeech(me.lang === "en" ? item.en : item.zh,
        me.lang === "en" ? "en-US" : "zh-TW");
    }
    if (button.dataset.action === "copy") {
      const value = "中文：" + (item.zh || tr("pending")) +
        "\nEnglish: " + (item.en || tr("pending"));
      showToast(tr((await copyText(value)) ? "copied" : "copyFailed"));
    }
  });
  ui.exportButton.addEventListener("click", async () => {
    if (!history.length) { showToast(tr("historyEmpty")); return; }
    const lines = history.map((item) => {
      const time = Number.isFinite(Number(item.serverTime)) && item.serverTime
        ? new Date(item.serverTime * 1000) : new Date(item.ts);
      const label = Number.isFinite(time.getTime()) ? time.toLocaleString() : "";
      return [label + " " + (item.name || ""),
        "中文：" + (item.zh || tr("pending")),
        "English: " + (item.en || tr("pending"))].join("\n");
    });
    showToast(tr((await copyText(lines.join("\n\n"))) ? "copied" : "copyFailed"));
  });
  ui.clearHistoryButton.addEventListener("click", () => {
    if (!confirm(me.lang === "en"
      ? "Clear conversation history on this device?"
      : "確定清空這台裝置在此房間的對話紀錄？")) return;
    history = [];
    writeJSON(localStorage, STORE.history(roomCode), []);
    renderConversation();
    showToast(tr("historyCleared"));
  });
  ui.leaveButton.addEventListener("click", leaveRoom);
  ui.unlockButton.addEventListener("click", () => {
    unlockSpeech(me.lang === "en" ? "zh-TW" : "en-US");
    ui.unlockOverlay.hidden = true;
    drainSpeechQueue();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      requestWakeLock();
      resumeRoomConnection();
    } else resumeJoinPending = false;
  });
  window.addEventListener("pagehide", (event) => {
    if (!me) return;
    resumeJoinPending = false;
    if (event.persisted) room.markAway();
    else room.leave();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted || room.isClosed()) resumeRoomConnection();
  });
  setInterval(presenceTick, 1000);
  restoreOrPrepareEntry();
  if (synthesis && typeof synthesis.addEventListener === "function") {
    synthesis.addEventListener("voiceschanged", () => {
      voicesChangedFired = true;
      updateVoices();
    });
  } else if (synthesis) synthesis.onvoiceschanged = () => {
    voicesChangedFired = true;
    updateVoices();
  };
}

init();
