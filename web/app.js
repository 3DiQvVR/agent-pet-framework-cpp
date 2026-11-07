(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const page = new URLSearchParams(window.location.search).get("page") || "chat";
  document.body.dataset.page = ["chat", "characters", "sessions", "memory", "activity"].includes(page) ? page : "chat";
  document.querySelectorAll("[data-page-link]").forEach((link) => {
    if (link.dataset.pageLink === document.body.dataset.page) link.setAttribute("aria-current", "page");
  });
  const el = {
    cardList: $("cardList"), cardCount: $("cardCount"),
    sessionList: $("sessionList"), sessionCount: $("sessionCount"),
    statusDot: $("statusDot"), statusText: $("statusText"),
    crumbName: $("crumbName"), modelBadge: $("modelBadge"),
    stage: $("stage"), pet: $("petAvatar"), petName: $("petName"),
    petTagline: $("petTagline"), emotionPill: $("emotionPill"), halo: $("halo"),
    bubble: $("bubble"), messages: $("messages"), typing: $("typing"),
    replySpeed: $("replySpeed"), replySpeedValue: $("replySpeedValue"),
    composer: $("composer"), input: $("input"), sendBtn: $("sendBtn"),
    newChatBtn: $("newChatBtn"), memoryBtn: $("memoryBtn"), live2dDesktopBtn: $("live2dDesktopBtn"),
    refreshMemory: $("refreshMemory"), memory: $("memory"),
    trace: $("trace"), traceCount: $("traceCount"), quick: $("quick"),
    toast: $("toast"),
    newCardBtn: $("newCardBtn"), cardModal: $("cardModal"), modalTitle: $("modalTitle"),
    modalClose: $("modalClose"), fId: $("fId"), fName: $("fName"), fTagline: $("fTagline"),
    fEmoji: $("fEmoji"), fColor: $("fColor"), fGreeting: $("fGreeting"),
    fPortrait: $("fPortrait"), portraitPreview: $("portraitPreview"), portraitHint: $("portraitHint"), clearPortrait: $("clearPortrait"),
    fLive2d: $("fLive2d"), live2dHint: $("live2dHint"),
    fSystem: $("fSystem"), fStyle: $("fStyle"), fBoundaries: $("fBoundaries"),
    fScope: $("fScope"), fHistory: $("fHistory"), fTools: $("fTools"),
    formError: $("formError"), deleteCardBtn: $("deleteCardBtn"),
    cancelCardBtn: $("cancelCardBtn"), saveCardBtn: $("saveCardBtn"),
  };

  const state = {
    characters: [],
    card: null,
    session: null,
    sessions: [],
    busy: false,
    traceItems: new Map(),
    tools: [],
    editing: null,
    streamText: null,
    streamQueue: [],
    streamTimer: null,
    streamLastTick: 0,
    streamFraction: 0,
    streamFinal: false,
    portraitData: "",
    live2dFiles: [],
  };

  const QUICK_PROMPTS = [
    "现在几点？",
    "记住 我喜欢下雨天",
    "你还记得我吗？",
    "帮我列个待办",
  ];

  // Keep the on-stage companion attentive to the pointer. Live2D models can
  // later consume these normalized coordinates as gaze parameters; the current
  // portrait fallback uses a small, bounded parallax movement.
  let pointerFrame = 0;
  el.stage.addEventListener("pointermove", (event) => {
    if (pointerFrame) return;
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = 0;
      const bounds = el.stage.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2));
      const y = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2));
      el.pet.style.setProperty("--gaze-x", `${x * 5}px`);
      el.pet.style.setProperty("--gaze-y", `${y * 4}px`);
      el.pet.style.setProperty("--gaze-rotate", `${x * 2}deg`);
    });
  });
  el.stage.addEventListener("pointerleave", () => {
    el.pet.style.setProperty("--gaze-x", "0px");
    el.pet.style.setProperty("--gaze-y", "0px");
    el.pet.style.setProperty("--gaze-rotate", "0deg");
  });

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[ch]));
  }

  // A desktop pet speaks in chat bubbles, not documents. Some providers still
  // emit Markdown headings/lists/bold; normalise the final text so raw "##",
  // "**" or "- " never leak into the conversation.
  function normalizeReply(text) {
    let value = String(text || "").replace(/\r\n/g, "\n");
    value = value.replace(/```[\s\S]*?```/g, (block) =>
      block.replace(/```[a-zA-Z0-9_-]*\s*/g, "").replace(/```/g, "").trim());
    value = value.replace(/^#{1,6}\s+/gm, "");
    value = value.replace(/^\s*>\s?/gm, "");
    value = value.replace(/^\s*[-*+]\s+/gm, "");
    value = value.replace(/^\s*\d+[.)]\s+/gm, "");
    value = value.replace(/^\s*---+\s*$/gm, "");
    value = value.replace(/\*\*(.*?)\*\*/g, "$1");
    value = value.replace(/__(.*?)__/g, "$1");
    value = value.replace(/`([^`]+)`/g, "$1");
    value = value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1（$2）");
    const blocks = value
      .split(/\n{2,}/)
      .map((block) => block.split("\n").map((line) => line.trim()).filter(Boolean).join(" "))
      .filter(Boolean);
    return blocks.join("\n\n").trim();
  }

  function validPortrait(value) {
    return typeof value === "string" && value.length <= 2200000 &&
      /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
  }

  function showPortraitPreview(value) {
    state.portraitData = validPortrait(value) ? value : "";
    el.portraitPreview.classList.toggle("hidden", !state.portraitData);
    el.portraitHint.textContent = state.portraitData ? "立绘已就绪" : "未上传图片，将使用 Emoji 头像。";
    if (state.portraitData) el.portraitPreview.src = state.portraitData;
    else el.portraitPreview.removeAttribute("src");
  }

  function toast(message) {
    el.toast.textContent = message;
    el.toast.classList.add("show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => el.toast.classList.remove("show"), 2800);
  }

  async function api(path, options) {
    const response = await fetch(path, options);
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  function setStatus(online, text) {
    el.statusDot.className = "dot " + (online ? "online" : "offline");
    el.statusText.textContent = text;
  }

  function applyCard(card) {
    state.card = card;
    document.documentElement.style.setProperty("--accent", card.color || "#6ea8fe");
    el.pet.textContent = card.emoji || "🐾";
    if (validPortrait(card.portrait)) {
      const image = document.createElement("img");
      image.src = card.portrait; image.alt = `${card.name}立绘`; el.pet.replaceChildren(image);
      el.pet.classList.add("has-portrait");
    } else el.pet.classList.remove("has-portrait");
    el.pet.className = "pet";
    el.petName.textContent = card.name;
    el.petTagline.textContent = card.tagline || "";
    el.crumbName.textContent = card.name;
    const emotionName = card.default_emotion || "neutral";
    const spec = (card.emotions && card.emotions[emotionName]) || { label: "待机", color: card.color };
    setEmotion(emotionName, spec.label, 0.5, spec.color);
    document.querySelectorAll(".card").forEach((node) => {
      node.classList.toggle("active", node.dataset.id === card.id);
    });
  }

  function setEmotion(name, label, intensity, color) {
    const spec = (state.card && state.card.emotions && state.card.emotions[name]) || {};
    const tone = color || spec.color || (state.card && state.card.color) || "#6ea8fe";
    el.emotionPill.textContent = intensity ? `${label || name} ${Math.round(intensity * 100)}%` : (label || name);
    el.emotionPill.style.color = tone;
    el.emotionPill.style.borderColor = tone + "77";
    el.emotionPill.style.background = tone + "18";
    el.halo.style.background = tone;
    el.pet.classList.remove("happy", "sad");
    if (name === "happy") el.pet.classList.add("happy");
    if (name === "sad") el.pet.classList.add("sad");
  }

  function showBubble(text, timeout = 7000) {
    if (!text) return;
    el.bubble.textContent = text;
    el.bubble.classList.add("show");
    clearTimeout(showBubble._timer);
    showBubble._timer = setTimeout(() => el.bubble.classList.remove("show"), timeout);
  }

  function renderCards() {
    el.cardList.innerHTML = "";
    el.cardCount.textContent = String(state.characters.length);
    if (!state.characters.length) {
      el.cardList.innerHTML = '<div class="trace-empty">没有找到角色卡，请检查 cards/ 目录。</div>';
      return;
    }
    for (const card of state.characters) {
      const node = document.createElement("div");
      node.className = "card";
      node.dataset.id = card.id;
      node.style.setProperty("--card-color", card.color || "#6ea8fe");
      node.style.setProperty("--card-soft", (card.color || "#6ea8fe") + "22");
      node.innerHTML = `
        <div class="card-emoji">${esc(card.emoji || "🐾")}</div>
        <div class="card-actions">
          ${card.editable ? '<button data-action="edit" title="编辑">✎</button>' : ""}
          <button data-action="copy" title="复制为自定义">⧉</button>
        </div>
        <div class="card-body">
          <div class="card-name">${esc(card.name)}<small>${esc(card.id)}</small>
            ${card.source === "database" ? '<span class="badge-mini">自定义</span>' : ""}
          </div>
          <div class="card-tagline">${esc(card.tagline || "")}</div>
        </div>`;
      if (validPortrait(card.portrait)) {
        const avatar = node.querySelector(".card-emoji");
        const image = document.createElement("img");
        image.src = card.portrait; image.alt = `${card.name}立绘`; image.className = "card-portrait";
        avatar.replaceChildren(image);
      }
      node.addEventListener("click", () => selectCard(card, { openDesktop: true }));
      const editButton = node.querySelector('[data-action="edit"]');
      if (editButton) {
        editButton.addEventListener("click", (event) => {
          event.stopPropagation();
          openCardForm(card, true);
        });
      }
      node.querySelector('[data-action="copy"]').addEventListener("click", (event) => {
        event.stopPropagation();
        openCardForm({
          ...card,
          id: `${card.id}_copy`,
          name: `${card.name} 副本`,
          source: "file",
          editable: false,
        }, false);
      });
      el.cardList.appendChild(node);
    }
  }

  async function loadCharacters() {
    const data = await api("/api/characters");
    state.characters = data.characters || [];
    renderCards();
    if (data.errors && data.errors.length) {
      console.warn("card errors", data.errors);
      toast(`有 ${data.errors.length} 张角色卡加载失败`);
    }
  }

  async function loadConfig() {
    try {
      const config = await api("/api/config");
      const label = config.llm.provider === config.llm.model
        ? config.llm.provider
        : `${config.llm.provider} · ${config.llm.model}`;
      el.modelBadge.textContent = label;
      setStatus(true, "运行中");
    } catch (error) {
      setStatus(false, "服务未连接");
    }
  }

  const FALLBACK_TOOLS = [
    { name: "get_time", description: "当前时间", risk: "read" },
    { name: "remember", description: "写入长期记忆", risk: "write" },
    { name: "recall", description: "检索长期记忆", risk: "read" },
    { name: "set_emotion", description: "改变情绪", risk: "write" },
    { name: "todo_*", description: "待办工具组", risk: "write" },
  ];

  async function loadTools() {
    try {
      const data = await api("/api/tools");
      state.tools = data.tools || [];
    } catch (_) {
      state.tools = FALLBACK_TOOLS;
    }
    if (!state.tools.length) state.tools = FALLBACK_TOOLS;
  }

  function renderToolPicker(allow) {
    el.fTools.innerHTML = "";
    const allowAll = !allow || allow.length === 0;
    for (const tool of state.tools) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = tool.name;
      input.checked = allowAll || allow.includes(tool.name) ||
        allow.some((pattern) => pattern.endsWith("*") && tool.name.startsWith(pattern.slice(0, -1)));
      const text = document.createElement("span");
      text.textContent = tool.name;
      text.title = tool.description || "";
      label.append(input, text);
      el.fTools.appendChild(label);
    }
  }

  function blankCard() {
    return {
      id: `custom_${Date.now().toString(36)}`,
      name: "",
      tagline: "",
      emoji: "🌱",
      color: "#6ea8fe",
      greeting: "",
      persona: { system: "", speaking_style: "", boundaries: [] },
      tools: { allow: ["get_time", "remember", "recall", "set_emotion", "todo_*"], deny: [] },
      memory: { history_limit: 20, scope: "character" },
    };
  }

  function openCardForm(card, editing) {
    const source = card || blankCard();
    state.editing = editing ? card : null;
    el.modalTitle.textContent = editing ? `编辑「${source.name}」` : "新建角色卡";
    el.fId.value = source.id || "";
    el.fId.disabled = editing;
    el.fName.value = source.name || "";
    el.fTagline.value = source.tagline || "";
    el.fEmoji.value = source.emoji || "🌱";
    el.fPortrait.value = "";
    el.fLive2d.value = "";
    state.live2dFiles = [];
    el.live2dHint.textContent = source.live2d_model ? `已提交模型：${source.live2d_model}` : "选择目录后，保存角色时会上传模型资源。";
    showPortraitPreview(source.portrait || "");
    el.fColor.value = /^#[0-9a-fA-F]{6}$/.test(source.color || "") ? source.color : "#6ea8fe";
    el.fGreeting.value = source.greeting || "";
    el.fSystem.value = (source.persona && source.persona.system) || "";
    el.fStyle.value = (source.persona && source.persona.speaking_style) || "";
    el.fBoundaries.value = ((source.persona && source.persona.boundaries) || []).join("\n");
    el.fScope.value = (source.memory && source.memory.scope) || "character";
    el.fHistory.value = (source.memory && source.memory.history_limit) || 20;
    renderToolPicker((source.tools && source.tools.allow) || []);
    el.formError.textContent = "";
    el.deleteCardBtn.classList.toggle("hidden", !(editing && source.editable));
    el.cardModal.classList.remove("hidden");
    setTimeout(() => el.fName.focus(), 60);
  }

  function closeCardForm() {
    el.cardModal.classList.add("hidden");
    state.editing = null;
    el.formError.textContent = "";
  }

  function collectCard() {
    const color = el.fColor.value || "#6ea8fe";
    const allow = Array.from(el.fTools.querySelectorAll("input:checked")).map((input) => input.value);
    const boundaries = el.fBoundaries.value.split("\n").map((line) => line.trim()).filter(Boolean);
    const history = Math.max(4, Math.min(100, Number(el.fHistory.value) || 20));
    return {
      schema_version: 1,
      id: el.fId.value.trim(),
      name: el.fName.value.trim(),
      tagline: el.fTagline.value.trim(),
      emoji: el.fEmoji.value.trim() || "🌱",
      portrait: state.portraitData,
      live2d_model: (state.editing && state.editing.live2d_model) || "",
      color,
      greeting: el.fGreeting.value.trim(),
      persona: {
        system: el.fSystem.value.trim(),
        speaking_style: el.fStyle.value.trim(),
        boundaries,
      },
      emotions: {
        neutral: { label: "平静", color: "#8fa3bf" },
        happy: { label: "开心", color: "#ffd166" },
        sad: { label: "低落", color: "#7aa2d6" },
        curious: { label: "好奇", color: "#9b8cff" },
      },
      default_emotion: "neutral",
      tools: { allow, deny: [] },
      memory: { history_limit: history, scope: el.fScope.value },
      voice: { provider: "none", voice_id: "" },
      metadata: { author: "you", version: "1.0.0", tags: ["自定义"] },
    };
  }

  async function saveCard() {
    const card = collectCard();
    if (!/^[a-z][a-z0-9_-]{1,63}$/.test(card.id)) {
      el.formError.textContent = "角色 ID 只能包含小写字母、数字、- 和 _，且以字母开头。";
      return;
    }
    if (!card.name) {
      el.formError.textContent = "请填写角色名称。";
      return;
    }
    if (!card.persona.system) {
      el.formError.textContent = "请填写人设 system。";
      return;
    }
    const editing = state.editing;
    if (!editing && state.characters.some((item) => item.id === card.id)) {
      el.formError.textContent = `ID「${card.id}」已存在，请换一个，或先用复制功能。`;
      return;
    }

    el.saveCardBtn.disabled = true;
    try {
      const response = await fetch(
        editing ? `/api/characters/${encodeURIComponent(card.id)}` : "/api/characters",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(card),
        },
      );
      let data = {};
      try { data = await response.json(); } catch (_) {}
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      if (state.live2dFiles.length) {
        const files = state.live2dFiles;
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const relative = file.webkitRelativePath.split("/").slice(1).join("/");
          const encoded = relative.split("/").map(encodeURIComponent).join("/");
          const upload = await fetch(`/api/live2d/${encodeURIComponent(card.id)}/${encoded}`, {
            method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: file,
          });
          if (!upload.ok) {
            let detail = {}; try { detail = await upload.json(); } catch (_) {}
            throw new Error(detail.error || `模型文件上传失败：${relative}`);
          }
          el.live2dHint.textContent = `正在上传模型资源 ${i + 1}/${files.length}`;
        }
      }
      closeCardForm();
      await loadCharacters();
      const saved = state.characters.find((item) => item.id === card.id);
      if (saved) await selectCard(saved);
      if (saved && state.live2dFiles.length) await launchDesktopPet(saved);
      toast(editing ? "角色卡已更新" : "角色卡已创建");
    } catch (error) {
      el.formError.textContent = error.message;
    } finally {
      el.saveCardBtn.disabled = false;
    }
  }

  async function deleteCard() {
    const card = state.editing;
    if (!card || !card.editable) return;
    if (!window.confirm(`删除自定义角色「${card.name}」？此操作不可撤销。`)) return;
    try {
      const response = await fetch(`/api/characters/${encodeURIComponent(card.id)}`, { method: "DELETE" });
      let data = {};
      try { data = await response.json(); } catch (_) {}
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      closeCardForm();
      await loadCharacters();
      if (state.card && state.card.id === card.id) {
        state.card = null;
        if (state.characters.length) await selectCard(state.characters[0]);
        else clearConversation();
      }
      toast("角色卡已删除");
    } catch (error) {
      el.formError.textContent = error.message;
    }
  }

  function renderSessions(sessions) {
    el.sessionList.innerHTML = "";
    el.sessionCount.textContent = String(sessions.length);
    if (!sessions.length) {
      el.sessionList.innerHTML = '<div class="trace-empty">还没有会话</div>';
      return;
    }
    for (const session of sessions) {
      const node = document.createElement("div");
      node.className = "session";
      if (state.session && state.session.id === session.id) node.classList.add("active");
      const title = document.createElement("div");
      title.className = "session-title";
      title.textContent = session.title || session.character_id;
      const time = document.createElement("div");
      time.className = "session-time";
      time.textContent = formatTime(session.updated_at);
      node.append(title, time);
      node.addEventListener("click", () => loadSession(session.id));
      el.sessionList.appendChild(node);
    }
  }

  function formatTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value.slice(0, 16).replace("T", " ");
    return date.toLocaleString("zh-CN", {
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  }

  async function loadSessions() {
    try {
      const data = await api("/api/sessions?limit=8");
      state.sessions = data.sessions || [];
      renderSessions(state.sessions);
    } catch (_) {
      el.sessionList.innerHTML = '<div class="trace-empty">会话加载失败</div>';
    }
  }

  function clearConversation() {
    el.messages.innerHTML = '<div class="empty">选好角色后，直接在下方输入。<br><b>桌宠会自己决定是否调用工具。</b></div>';
    el.trace.innerHTML = '<div class="trace-empty">工具调用会出现在这里</div>';
    state.traceItems.clear();
    el.traceCount.textContent = "0";
  }

  async function selectCard(card, options = {}) {
    if (state.busy) return toast("等这一轮说完再换角色");
    if (options.openDesktop) launchDesktopPet(card);
    applyCard(card);
    clearConversation();
    try {
      const data = await api("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character_id: card.id }),
      });
      state.session = data.session;
      if (data.character) applyCard(data.character);
      addMessage("assistant", data.greeting || "我在这里。", state.card);
      showBubble(data.greeting || "");
      await Promise.all([loadMemory(), loadSessions()]);
    } catch (error) {
      toast(error.message);
    }
  }

  async function launchDesktopPet(card) {
    try {
      const result = await api("/api/desktop/live2d", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character_id: card.id }),
      });
      toast(result.closed ? "Live2D 桌面形象已关闭" : `${card.name} 的 Live2D 桌面形象已打开`);
    } catch (error) { toast(error.message); }
  }

  async function loadSession(id) {
    if (state.busy) return toast("等这一轮说完再切换会话");
    try {
      const data = await api(`/api/sessions/${encodeURIComponent(id)}`);
      state.session = data.session;
      if (data.character) applyCard(data.character);
      el.messages.innerHTML = "";
      const messages = (data.messages || []).filter((m) => (m.role === "user" || m.role === "assistant") && m.content);
      if (!messages.length) {
        clearConversation();
      } else {
        for (const message of messages) {
          addMessage(message.role, message.content, state.card, false);
        }
        const last = messages[messages.length - 1];
        if (last && last.role === "assistant") showBubble(last.content);
        el.messages.scrollTop = el.messages.scrollHeight;
      }
      el.trace.innerHTML = '<div class="trace-empty">历史会话不保留工具轨迹</div>';
      state.traceItems.clear();
      el.traceCount.textContent = "0";
      await Promise.all([loadMemory(), loadSessions()]);
    } catch (error) {
      toast(error.message);
    }
  }

  function addMessage(role, text, card, scroll = true) {
    if (!text) return;
    if (role === "assistant" && text.trim()) text = normalizeReply(text);
    if (!text) return;
    const placeholder = el.messages.querySelector(".empty");
    if (placeholder) placeholder.remove();
    const node = document.createElement("div");
    node.className = `message ${role}`;
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = role === "user" ? "你" : ((card && card.emoji) || "🐾");
    const body = document.createElement("div");
    body.className = "msg-body";
    const name = document.createElement("div");
    name.className = "msg-name";
    name.textContent = role === "user" ? "你" : ((card && card.name) || "桌宠");
    const content = document.createElement("div");
    content.className = "msg-text";
    content.textContent = text;
    body.append(name, content);
    node.append(avatar, body);
    el.messages.appendChild(node);
    if (scroll) el.messages.scrollTop = el.messages.scrollHeight;
    return content;
  }

  function appendAssistantDelta(text) {
    if (!state.streamText) state.streamText = addMessage("assistant", " ", state.card);
    if (state.streamText.textContent === " ") state.streamText.textContent = "";
    state.streamQueue.push(...Array.from(text));
    startStreamTicker();
  }

  function startStreamTicker() {
    if (state.streamTimer || !state.streamQueue.length) return;
    state.streamLastTick = performance.now();
    state.streamTimer = setInterval(() => {
      const now = performance.now();
      state.streamFraction += (now - state.streamLastTick) * Number(el.replySpeed.value) / 1000;
      state.streamLastTick = now;
      const count = Math.min(state.streamQueue.length, Math.floor(state.streamFraction));
      if (count) {
        state.streamFraction -= count;
        const chunk = state.streamQueue.splice(0, count).join("");
        state.streamText.textContent += chunk;
        el.messages.scrollTop = el.messages.scrollHeight;
        showBubble(state.streamText.textContent.slice(-220), 4000);
      }
      if (!state.streamQueue.length) {
        clearInterval(state.streamTimer);
        state.streamTimer = null;
        if (state.streamFinal) { state.streamText = null; state.streamFinal = false; }
      }
    }, 30);
  }

  function finishPendingStream() {
    if (state.streamTimer) clearInterval(state.streamTimer);
    state.streamTimer = null;
    if (state.streamText) {
      const text = state.streamText.textContent + state.streamQueue.join("");
      state.streamText.textContent = normalizeReply(text);
    }
    state.streamQueue = [];
    state.streamText = null;
    state.streamFinal = false;
  }

  function addTrace(id, name, args) {
    const placeholder = el.trace.querySelector(".trace-empty");
    if (placeholder) placeholder.remove();
    const node = document.createElement("div");
    node.className = "trace-item";
    const title = document.createElement("div");
    title.className = "trace-name";
    title.textContent = name;
    const detail = document.createElement("div");
    detail.className = "trace-args";
    detail.textContent = compact(args);
    node.append(title, detail);
    el.trace.appendChild(node);
    el.trace.scrollTop = el.trace.scrollHeight;
    state.traceItems.set(id, node);
    el.traceCount.textContent = String(state.traceItems.size);
  }

  function updateTrace(id, ok, content) {
    const node = state.traceItems.get(id);
    if (!node) return;
    node.classList.add(ok ? "ok" : "fail");
    const detail = document.createElement("div");
    detail.className = "trace-result";
    detail.textContent = (content || "").slice(0, 160);
    node.appendChild(detail);
    el.trace.scrollTop = el.trace.scrollHeight;
  }

  function compact(value) {
    try {
      const text = JSON.stringify(value);
      if (!text || text === "{}") return "无参数";
      return text.length > 90 ? text.slice(0, 90) + "…" : text;
    } catch (_) {
      return String(value);
    }
  }

  function renderMemory(facts) {
    el.memory.innerHTML = "";
    if (!facts || !facts.length) {
      el.memory.innerHTML = '<div class="memory-empty">还没有长期记忆。对它说“记住 …”试试。</div>';
      return;
    }
    for (const fact of facts) {
      const node = document.createElement("div");
      node.className = "fact";
      const key = document.createElement("div");
      key.className = "fact-key";
      key.textContent = fact.key;
      const value = document.createElement("div");
      value.className = "fact-value";
      value.textContent = fact.value;
      node.append(key, value);
      if (fact.tags && fact.tags.length) {
        const tags = document.createElement("div");
        tags.className = "fact-tags";
        for (const tag of fact.tags) {
          const span = document.createElement("span");
          span.textContent = tag;
          tags.appendChild(span);
        }
        node.appendChild(tags);
      }
      el.memory.appendChild(node);
    }
  }

  async function loadMemory() {
    if (!state.card || !state.session) return;
    const sessionId = state.session.id;
    try {
      const data = await api(`/api/memory?session_id=${encodeURIComponent(sessionId)}`);
      if (!state.session || state.session.id !== sessionId) return;
      renderMemory(data.facts || []);
    } catch (_) {
      el.memory.innerHTML = '<div class="memory-empty">记忆加载失败</div>';
    }
  }

  async function readSSE(response, onEvent) {
    if (!response.body) throw new Error("浏览器不支持流式读取");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf("\n\n")) >= 0) {
        const chunk = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try { onEvent(JSON.parse(payload)); } catch (_) {}
        }
      }
    }
  }

  function handleEvent(event) {
    const data = event.data || {};
    switch (event.type) {
      case "assistant":
        if (state.streamText) {
          const displayed = Array.from(state.streamText.textContent);
          const complete = Array.from(data.content || "");
          state.streamQueue = complete.slice(displayed.length);
          state.streamFraction = 0;
          state.streamFinal = true;
          if (state.streamQueue.length) startStreamTicker();
          else { state.streamText = null; state.streamFinal = false; }
        } else addMessage("assistant", data.content, state.card);
        showBubble(data.content);
        break;
      case "assistant_start":
        finishPendingStream();
        state.streamText = null;
        state.streamQueue = [];
        state.streamFinal = false;
        break;
      case "assistant_delta":
        appendAssistantDelta(data.content || "");
        break;
      case "tool_call":
        addTrace(data.id, data.name, data.arguments);
        showBubble(`正在调用 ${data.name}…`, 3000);
        break;
      case "tool_result":
        updateTrace(data.id, data.ok, data.content);
        break;
      case "emotion":
        setEmotion(data.name, data.label, data.intensity, data.color);
        break;
      case "policy_denied":
        updateTrace(data.id, false, "策略拒绝：" + (data.reason || ""));
        toast(`已拦截工具调用：${data.name}`);
        break;
      case "error":
        toast(data.message || "Agent 出错");
        break;
      case "done":
        finishPendingStream();
        break;
      default:
        break;
    }
  }

  async function send(text) {
    if (!state.session) return toast("先选一只桌宠");
    if (state.busy) return;
    const message = (text || el.input.value).trim();
    if (!message) return;

    finishPendingStream();

    el.input.value = "";
    addMessage("user", message, state.card);
    state.busy = true;
    state.streamText = null;
    el.sendBtn.disabled = true;
    el.typing.classList.remove("hidden");
    showBubble("让我想想…", 3000);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: state.session.id, message }),
      });
      if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try { const body = await response.json(); detail = body.error || detail; } catch (_) {}
        throw new Error(detail);
      }
      await readSSE(response, handleEvent);
    } catch (error) {
      toast(error.message);
    } finally {
      state.busy = false;
      el.sendBtn.disabled = false;
      el.typing.classList.add("hidden");
      await Promise.all([loadMemory(), loadSessions()]);
    }
  }

  async function newChat() {
    if (state.card) await selectCard(state.card);
  }

  function renderQuick() {
    el.quick.innerHTML = "";
    for (const prompt of QUICK_PROMPTS) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = prompt;
      button.addEventListener("click", () => send(prompt));
      el.quick.appendChild(button);
    }
  }

  function bind() {
    el.replySpeed.value = localStorage.getItem("petcore.replySpeed") || "36";
    el.replySpeedValue.value = `${el.replySpeed.value} 字/秒`;
    el.replySpeed.addEventListener("input", () => {
      el.replySpeedValue.value = `${el.replySpeed.value} 字/秒`;
      localStorage.setItem("petcore.replySpeed", el.replySpeed.value);
    });
    el.fPortrait.addEventListener("change", () => {
      const file = el.fPortrait.files && el.fPortrait.files[0];
      if (!file) return;
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
        el.formError.textContent = "请选择 PNG、JPG/JPEG 或 WebP 图片。"; el.fPortrait.value = ""; return;
      }
      if (file.size > 1.5 * 1024 * 1024) {
        el.formError.textContent = "图片超过 1.5 MB，请先压缩或缩小后再上传。"; el.fPortrait.value = ""; return;
      }
      const reader = new FileReader();
      reader.onload = () => { showPortraitPreview(reader.result); el.formError.textContent = ""; };
      reader.onerror = () => { el.formError.textContent = "读取图片失败，请重试。"; };
      reader.readAsDataURL(file);
    });
    el.fLive2d.addEventListener("change", () => {
      const files = Array.from(el.fLive2d.files || []);
      const model = files.find((file) => file.name.toLowerCase().endsWith(".model3.json"));
      const total = files.reduce((sum, file) => sum + file.size, 0);
      if (!files.length) { state.live2dFiles = []; return; }
      if (!model) { el.formError.textContent = "所选目录中没有 .model3.json 模型入口文件。"; el.fLive2d.value = ""; return; }
      if (files.length > 200 || files.some((file) => file.size > 16 * 1024 * 1024) || total > 128 * 1024 * 1024) {
        el.formError.textContent = "模型目录最多 200 个文件、总计 128 MB，单个文件不能超过 16 MB。"; el.fLive2d.value = ""; return;
      }
      state.live2dFiles = files;
      el.live2dHint.textContent = `已选择 ${files.length} 个文件（${(total / 1024 / 1024).toFixed(1)} MB）`;
      el.formError.textContent = "";
    });
    el.clearPortrait.addEventListener("click", () => { el.fPortrait.value = ""; showPortraitPreview(""); });
    el.composer.addEventListener("submit", (event) => {
      event.preventDefault();
      send();
    });
    el.newChatBtn.addEventListener("click", newChat);
    el.live2dDesktopBtn.addEventListener("click", () => {
      if (!state.card) return toast("请先选择聊天角色");
      launchDesktopPet(state.card);
    });
    el.refreshMemory.addEventListener("click", loadMemory);
    el.memoryBtn.addEventListener("click", () => {
      el.memory.scrollIntoView({ behavior: "smooth", block: "nearest" });
      el.memory.animate(
        [{ boxShadow: "0 0 0 0 rgba(110,168,254,.0)" }, { boxShadow: "0 0 0 4px rgba(110,168,254,.18)" }, { boxShadow: "0 0 0 0 rgba(110,168,254,0)" }],
        { duration: 900 },
      );
    });
    el.newCardBtn.addEventListener("click", () => openCardForm(null, false));
    el.modalClose.addEventListener("click", closeCardForm);
    el.cancelCardBtn.addEventListener("click", closeCardForm);
    el.saveCardBtn.addEventListener("click", saveCard);
    el.deleteCardBtn.addEventListener("click", deleteCard);
    el.cardModal.addEventListener("click", (event) => {
      if (event.target === el.cardModal) closeCardForm();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !el.cardModal.classList.contains("hidden")) closeCardForm();
    });
  }

  async function init() {
    clearConversation();
    renderQuick();
    bind();
    await loadConfig();
    await loadTools();
    try {
      await loadCharacters();
      await loadSessions();
      if (state.sessions.length) {
        // Continue the most recent conversation instead of discarding it.
        await loadSession(state.sessions[0].id);
      } else if (state.characters.length) {
        await selectCard(state.characters[0]);
      } else {
        setStatus(false, "没有角色卡");
      }
      if (state.card) await launchDesktopPet(state.card);
    } catch (error) {
      setStatus(false, "加载失败");
      toast(error.message);
    }
  }

  init();
})();
