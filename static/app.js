(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const canvas = $("gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const bootScreen = $("bootScreen");
  const topBar = $("topBar");
  const backButton = $("backButton");
  const topEyebrow = $("topEyebrow");
  const topTitle = $("topTitle");
  const topCoins = $("topCoins");
  const topLevel = $("topLevel");
  const hubScreen = $("hubScreen");
  const gameScreen = $("gameScreen");
  const resultScreen = $("resultScreen");
  const soundButton = $("soundButton");
  const instructionPill = $("instructionPill");
  const mazeControls = $("mazeControls");
  const duelControls = $("duelControls");
  const hudLabel = $("hudLabel");
  const hudScore = $("hudScore");
  const hudTimerChip = $("hudTimerChip");
  const hudTimer = $("hudTimer");
  const rotateNotice = $("rotateNotice");

  const tg = window.Telegram?.WebApp ?? null;
  const telegramUser = tg?.initDataUnsafe?.user ?? null;
  const playerId = String(telegramUser?.id ?? "guest");
  const profileKey = `samuga-arcade-profile-${playerId}`;
  const storage = (() => {
    const memory = new Map();
    const fallback = {
      getItem: (key) => memory.has(String(key)) ? memory.get(String(key)) : null,
      setItem: (key, value) => memory.set(String(key), String(value)),
      removeItem: (key) => memory.delete(String(key)),
    };
    try {
      const testKey = "__samuga_storage_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    } catch (_) {
      return fallback;
    }
  })();

  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor("#031c31");
      tg.setBackgroundColor("#031c31");
      if (typeof tg.requestFullscreen === "function") tg.requestFullscreen();
      if (typeof tg.disableVerticalSwipes === "function") tg.disableVerticalSwipes();
    } catch (error) {
      console.debug("Telegram UI setup skipped:", error);
    }
  }

  const defaultProfile = () => ({ coins: 0, xp: 0, bests: { flappy: 0, bubble: 0, maze: 0, memory: 0, treasure: 0, shark: 0, snake: 0, ghost: 0, hockey: 0, clash: 0 } });
  let profile = loadProfile();

  function loadProfile() {
    let loaded = defaultProfile();
    try {
      const parsed = JSON.parse(storage.getItem(profileKey) || "null");
      if (parsed && typeof parsed === "object") {
        loaded.coins = Math.max(0, Number.parseInt(parsed.coins || 0, 10));
        loaded.xp = Math.max(0, Number.parseInt(parsed.xp || 0, 10));
        loaded.bests = { ...loaded.bests, ...(parsed.bests || {}) };
      }
    } catch (_) {
      // Use a clean profile if local data was malformed.
    }

    const oldBest = Number.parseInt(storage.getItem(`flappy-reef-best-${playerId}`) || "0", 10);
    const oldCoins = Number.parseInt(storage.getItem(`flappy-reef-coins-${playerId}`) || "0", 10);
    const oldXp = Number.parseInt(storage.getItem(`flappy-reef-xp-${playerId}`) || "0", 10);
    loaded.bests.flappy = Math.max(Number(loaded.bests.flappy || 0), oldBest);
    loaded.coins = Math.max(loaded.coins, oldCoins);
    loaded.xp = Math.max(loaded.xp, oldXp);
    return loaded;
  }

  function saveProfile() {
    storage.setItem(profileKey, JSON.stringify(profile));
  }

  function levelFromXp(xp) {
    return Math.floor(Math.sqrt(Math.max(0, xp) / 20)) + 1;
  }

  function xpForLevel(level) {
    return Math.max(0, (level - 1) * (level - 1) * 20);
  }

  function profileProgress() {
    const level = levelFromXp(profile.xp);
    const start = xpForLevel(level);
    const end = xpForLevel(level + 1);
    const percent = end > start ? ((profile.xp - start) / (end - start)) * 100 : 0;
    return { level, start, end, percent: Math.max(0, Math.min(100, percent)) };
  }

  function updateProfileUI() {
    const progress = profileProgress();
    topCoins.textContent = String(profile.coins);
    topLevel.textContent = String(progress.level);
    $("homeCoins").textContent = String(profile.coins);
    $("homeLevel").textContent = String(progress.level);
    $("xpLabel").textContent = `${profile.xp - progress.start} / ${progress.end - progress.start} XP`;
    $("homeXpFill").style.width = `${progress.percent}%`;
    $("bestFlappy").textContent = String(profile.bests.flappy || 0);
    $("bestBubble").textContent = String(profile.bests.bubble || 0);
    $("bestMaze").textContent = String(profile.bests.maze || 0);
    $("bestMemory").textContent = String(profile.bests.memory || 0);
    $("bestTreasure").textContent = String(profile.bests.treasure || 0);
    $("bestShark").textContent = String(profile.bests.shark || 0);
    $("bestSnake").textContent = String(profile.bests.snake || 0);
    $("bestGhost").textContent = String(profile.bests.ghost || 0);
    $("bestHockey").textContent = String(profile.bests.hockey || 0);
    $("bestClash").textContent = String(profile.bests.clash || 0);
  }

  let width = 0;
  let height = 0;
  let dpr = 1;
  let lastTime = performance.now();
  let worldTime = 0;
  let currentGame = null;
  let currentGameId = null;
  let screenMode = "boot";
  let soundEnabled = true;
  let audioContext = null;
  let pointerStart = null;
  let ambientBubbles = [];
  let distantFish = [];
  let jellyfish = [];
  let seaPlants = [];
  let particles = [];
  let shakeTime = 0;
  let flashTime = 0;

  function pseudo(seed) {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rotateNotice.classList.toggle("hidden", !(width > height && height < 550));
    makeAmbientLife();
    if (currentGame?.resize) currentGame.resize();
  }

  function makeAmbientLife() {
    const bubbleCount = Math.max(24, Math.floor((width * height) / 14500));
    ambientBubbles = Array.from({ length: bubbleCount }, (_, i) => ({
      x: pseudo(i + 1) * Math.max(width, 1),
      y: pseudo(i + 14) * Math.max(height, 1),
      r: 1 + pseudo(i + 32) * 4,
      speed: 8 + pseudo(i + 77) * 22,
      drift: 0.4 + pseudo(i + 122) * 1.4,
      alpha: 0.07 + pseudo(i + 200) * 0.2,
    }));
    distantFish = Array.from({ length: Math.max(9, Math.floor(width / 58)) }, (_, i) => ({
      x: pseudo(i + 10) * width,
      y: height * (0.14 + pseudo(i + 34) * 0.56),
      speed: 7 + pseudo(i + 55) * 17,
      scale: 0.35 + pseudo(i + 72) * 0.62,
      phase: pseudo(i + 92) * Math.PI * 2,
      direction: pseudo(i + 105) > 0.5 ? 1 : -1,
      tone: pseudo(i + 131),
    }));
    jellyfish = Array.from({ length: Math.max(4, Math.floor(width / 115)) }, (_, i) => ({
      x: pseudo(i + 300) * width,
      y: height * (0.19 + pseudo(i + 321) * 0.5),
      speed: 4 + pseudo(i + 345) * 9,
      scale: 0.48 + pseudo(i + 367) * 0.7,
      phase: pseudo(i + 388) * Math.PI * 2,
      alpha: 0.15 + pseudo(i + 404) * 0.16,
    }));
    seaPlants = Array.from({ length: Math.max(18, Math.floor(width / 25)) }, (_, i) => ({
      x: (i / Math.max(1, Math.floor(width / 25))) * width + pseudo(i + 500) * 22,
      h: 14 + pseudo(i + 520) * 54,
      w: 3 + pseudo(i + 540) * 5,
      phase: pseudo(i + 560) * Math.PI * 2,
      tone: pseudo(i + 580),
    }));
  }

  function ensureAudio() {
    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) audioContext = new AudioCtx();
    }
    if (audioContext?.state === "suspended") audioContext.resume().catch(() => {});
  }

  function tone(frequency, duration, volume = 0.04, type = "sine", glide = 0) {
    if (!soundEnabled) return;
    ensureAudio();
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (glide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency + glide), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  function haptic(kind) {
    try {
      if (!tg?.HapticFeedback) return;
      if (kind === "tap") tg.HapticFeedback.impactOccurred("light");
      if (kind === "good") tg.HapticFeedback.notificationOccurred("success");
      if (kind === "bad") tg.HapticFeedback.notificationOccurred("error");
      if (kind === "soft") tg.HapticFeedback.impactOccurred("soft");
    } catch (_) {
      // Haptics are optional outside Telegram.
    }
  }

  function burst(x, y, amount = 12, kind = "bubble") {
    for (let i = 0; i < amount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 35 + Math.random() * 145;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.45 + Math.random() * 0.5,
        maxLife: 0.95,
        size: 2 + Math.random() * 5,
        kind,
        hue: 175 + Math.random() * 80,
      });
    }
  }

  function updateParticles(dt) {
    particles = particles.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) return false;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.kind === "bubble" ? -22 : 115) * dt;
      p.vx *= Math.pow(0.97, dt * 60);
      return true;
    });
  }

  function drawParticles() {
    for (const p of particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      if (p.kind === "bubble") {
        ctx.strokeStyle = `hsla(${p.hue},90%,85%,${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.kind === "bad" ? `rgba(255,74,95,${alpha})` : `hsla(${p.hue},95%,65%,${alpha})`;
        ctx.translate(p.x, p.y);
        ctx.rotate((1 - alpha) * 4);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      }
      ctx.restore();
    }
  }

  function drawOceanBackground(dt, mood = "reef") {
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    if (mood === "maze") {
      grad.addColorStop(0, "#052b4f");
      grad.addColorStop(0.55, "#075b79");
      grad.addColorStop(1, "#063a4e");
    } else {
      grad.addColorStop(0, "#07537d");
      grad.addColorStop(0.48, "#068eb0");
      grad.addColorStop(1, "#0aa4ae");
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const sunX = width * 0.72;
    ctx.save();
    ctx.globalAlpha = 0.13;
    for (let i = -6; i < 9; i += 1) {
      const spread = width * 0.11;
      ctx.fillStyle = i % 2 ? "#c4fbff" : "#77eaff";
      ctx.beginPath();
      ctx.moveTo(sunX + i * 4, -10);
      ctx.lineTo(sunX + i * spread + Math.sin(worldTime * 0.18 + i) * 35, height * 0.86);
      ctx.lineTo(sunX + (i + 0.55) * spread + Math.sin(worldTime * 0.18 + i) * 35, height * 0.86);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    for (const bubble of ambientBubbles) {
      bubble.y -= bubble.speed * dt;
      bubble.x += Math.sin(worldTime * bubble.drift + bubble.y * 0.018) * 4 * dt;
      if (bubble.y < -10) {
        bubble.y = height + 10;
        bubble.x = Math.random() * width;
      }
      ctx.strokeStyle = `rgba(205,248,255,${bubble.alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(bubble.x, bubble.y, bubble.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    drawDistantLife(dt);
    drawReefFloor();
  }

  function drawDistantLife(dt) {
    for (const fish of distantFish) {
      fish.x += fish.speed * fish.direction * dt;
      if (fish.direction > 0 && fish.x > width + 40) fish.x = -40;
      if (fish.direction < 0 && fish.x < -40) fish.x = width + 40;
      const bob = Math.sin(worldTime * 0.8 + fish.phase) * 5;
      const s = fish.scale;
      ctx.save();
      ctx.globalAlpha = 0.13 + fish.tone * 0.08;
      ctx.translate(fish.x, fish.y + bob);
      ctx.scale(fish.direction * s, s);
      ctx.fillStyle = fish.tone > 0.5 ? "#b9e9ec" : "#68c8d5";
      ctx.beginPath();
      ctx.ellipse(0, 0, 18, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-15, 0); ctx.lineTo(-28, -10); ctx.lineTo(-26, 10); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    for (const jelly of jellyfish) {
      jelly.y -= jelly.speed * dt;
      if (jelly.y < height * 0.1) jelly.y = height * 0.72;
      const pulse = 1 + Math.sin(worldTime * 2 + jelly.phase) * 0.08;
      ctx.save();
      ctx.globalAlpha = jelly.alpha;
      ctx.translate(jelly.x, jelly.y);
      ctx.scale(jelly.scale * pulse, jelly.scale);
      const g = ctx.createLinearGradient(0, -15, 0, 16);
      g.addColorStop(0, "#f5c7ff"); g.addColorStop(1, "#7ed5ff");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 14, Math.PI, 0); ctx.lineTo(14, 4); ctx.quadraticCurveTo(7, 9, 0, 4); ctx.quadraticCurveTo(-7, 9, -14, 4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#b9e9ff"; ctx.lineWidth = 1.4;
      for (let i = -8; i <= 8; i += 8) {
        ctx.beginPath(); ctx.moveTo(i, 5); ctx.bezierCurveTo(i - 4, 13, i + 4, 18, i, 28); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawReefFloor() {
    const floorY = height * 0.9;
    ctx.fillStyle = "rgba(2,65,75,.52)";
    ctx.beginPath();
    ctx.moveTo(0, floorY);
    for (let x = 0; x <= width + 35; x += 35) {
      ctx.lineTo(x, floorY - 10 - pseudo(Math.floor(x / 35) + 900) * 25);
    }
    ctx.lineTo(width, height); ctx.lineTo(0, height); ctx.closePath(); ctx.fill();

    for (const plant of seaPlants) {
      const sway = Math.sin(worldTime * 1.25 + plant.phase) * 6;
      ctx.strokeStyle = plant.tone > 0.72 ? "rgba(239,103,137,.38)" : plant.tone > 0.42 ? "rgba(75,198,139,.42)" : "rgba(34,143,135,.5)";
      ctx.lineWidth = plant.w;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(plant.x, height);
      ctx.quadraticCurveTo(plant.x + sway * 0.35, height - plant.h * 0.52, plant.x + sway, height - plant.h);
      ctx.stroke();
    }
  }

  function drawFish(x, y, scale = 1, rotation = 0, color = "orange") {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);
    const tailWave = Math.sin(worldTime * 12) * 4;
    ctx.fillStyle = color === "blue" ? "#42cfee" : "#ff7b28";
    ctx.beginPath();
    ctx.moveTo(-18, 0); ctx.lineTo(-35, -13 - tailWave * 0.25); ctx.lineTo(-31, 0); ctx.lineTo(-35, 13 + tailWave * 0.25); ctx.closePath(); ctx.fill();
    const body = ctx.createLinearGradient(-20, -15, 20, 15);
    if (color === "blue") { body.addColorStop(0, "#a5f5ff"); body.addColorStop(.45, "#24c8ea"); body.addColorStop(1, "#0874b5"); }
    else { body.addColorStop(0, "#ffd850"); body.addColorStop(.45, "#ff942d"); body.addColorStop(1, "#e34d24"); }
    ctx.fillStyle = body;
    ctx.strokeStyle = "rgba(75,35,12,.55)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, 25, 16, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (color !== "blue") {
      ctx.fillStyle = "rgba(255,255,255,.92)";
      ctx.fillRect(-9, -15, 7, 30); ctx.fillRect(9, -13, 6, 26);
    }
    ctx.fillStyle = "rgba(255,151,44,.85)";
    ctx.beginPath(); ctx.ellipse(-2, 14, 10, 5, -.25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(15, -5, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#062239"; ctx.beginPath(); ctx.arc(17, -5, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffd24b"; ctx.beginPath(); ctx.ellipse(25, 4, 7, 3.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function setInstruction(text, autoFade = false) {
    instructionPill.textContent = text;
    instructionPill.classList.remove("fade", "hidden");
    if (autoFade) window.setTimeout(() => instructionPill.classList.add("fade"), 1500);
  }

  function setHud(label, score, timer = null) {
    hudLabel.textContent = label;
    hudScore.textContent = String(score);
    if (timer === null) {
      hudTimerChip.classList.add("hidden");
    } else {
      hudTimerChip.classList.remove("hidden");
      hudTimer.textContent = String(Math.max(0, Math.ceil(timer)));
    }
  }

  function showHub() {
    currentGame?.destroy?.();
    currentGame = null;
    currentGameId = null;
    screenMode = "hub";
    resultScreen.classList.add("hidden");
    gameScreen.classList.add("hidden");
    mazeControls.classList.add("hidden");
    duelControls.classList.add("hidden");
    hubScreen.classList.remove("hidden");
    topBar.classList.remove("hidden");
    backButton.classList.add("hidden");
    topEyebrow.textContent = "SAMUGA";
    topTitle.textContent = "ARCADE";
    updateProfileUI();
  }

  const gameFactories = {};

  function launchGame(gameId) {
    const factory = gameFactories[gameId];
    if (!factory) return;
    ensureAudio();
    screenMode = "game";
    currentGameId = gameId;
    hubScreen.classList.add("hidden");
    resultScreen.classList.add("hidden");
    gameScreen.classList.remove("hidden");
    topBar.classList.remove("hidden");
    backButton.classList.remove("hidden");
    mazeControls.classList.toggle("hidden", gameId !== "maze");
    duelControls.classList.toggle("hidden", gameId !== "clash");
    currentGame = factory();
    topEyebrow.textContent = "NOW PLAYING";
    topTitle.textContent = currentGame.title;
    particles = [];
    shakeTime = 0;
    flashTime = 0;
    currentGame.start();
  }

  function finishGame(result) {
    if (!currentGameId || screenMode !== "game") return;
    const gameId = currentGameId;
    const score = Math.max(0, Math.floor(result.score || 0));
    const previousBest = Number(profile.bests[gameId] || 0);
    const isBest = score > previousBest;
    if (isBest) profile.bests[gameId] = score;
    profile.coins += Math.max(0, Math.floor(result.coins || 0));
    profile.xp += Math.max(0, Math.floor(result.xp || 0));
    saveProfile();
    updateProfileUI();

    screenMode = "result";
    gameScreen.classList.add("hidden");
    mazeControls.classList.add("hidden");
    duelControls.classList.add("hidden");
    resultScreen.classList.remove("hidden");
    $("resultEyebrow").textContent = result.eyebrow || "GAME COMPLETE";
    $("newBestBadge").classList.toggle("hidden", !isBest);
    $("resultTitle").textContent = result.title || (isBest ? "New arcade best!" : "Great run!");
    $("resultMessage").textContent = result.message || "You earned rewards for your arcade profile.";
    $("resultScoreLabel").textContent = result.scoreLabel || "SCORE";
    $("resultScore").textContent = String(score);
    $("resultBest").textContent = String(profile.bests[gameId] || score);
    $("coinsEarned").textContent = String(Math.max(0, Math.floor(result.coins || 0)));
    $("xpEarned").textContent = String(Math.max(0, Math.floor(result.xp || 0)));
    const progress = profileProgress();
    $("resultLevel").textContent = String(progress.level);
    $("resultXpFill").style.width = `${progress.percent}%`;
    haptic(isBest ? "good" : "soft");
    tone(isBest ? 920 : 690, .12, .035, "triangle", 180);
  }

  function shareCurrentScore() {
    const score = $("resultScore").textContent;
    const gameName = currentGame?.title || "Samuga Arcade";
    const text = `I scored ${score} in ${gameName}! Can you beat me in Samuga Arcade?`;
    const url = window.location.href.split("#")[0];
    if (navigator.share) {
      navigator.share({ title: "Samuga Arcade", text, url }).catch(() => {});
      return;
    }
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    if (tg?.openTelegramLink) tg.openTelegramLink(shareUrl);
    else window.open(shareUrl, "_blank", "noopener,noreferrer");
  }

  // ---------- FLAPPY REEF ----------
  gameFactories.flappy = () => {
    const game = {
      title: "FLAPPY REEF",
      fish: { x: 0, y: 0, vy: 0, rotation: 0, radius: 17 },
      pipes: [], score: 0, started: false, ended: false, spawnTimer: 0, nextSpawn: 1.25, speed: 185,
      start() {
        this.resize();
        this.pipes = [];
        this.score = 0;
        this.started = false;
        this.ended = false;
        this.spawnTimer = 0;
        this.speed = Math.max(175, width * .46);
        setHud("SCORE", 0, null);
        setInstruction("Tap anywhere to swim");
      },
      resize() {
        this.fish.x = width * .28;
        if (!this.started) this.fish.y = height * .46;
      },
      tap() {
        if (this.ended) return;
        if (!this.started) {
          this.started = true;
          instructionPill.classList.add("fade");
        }
        this.fish.vy = -Math.max(350, Math.min(470, height * .52));
        this.fish.rotation = -.42;
        burst(this.fish.x - 20, this.fish.y + 4, 5, "bubble");
        tone(430, .08, .023, "sine", 170);
        haptic("tap");
      },
      spawnPipe() {
        const floor = Math.max(72, height * .095);
        const gap = Math.max(145, Math.min(205, height * (.235 - Math.min(this.score, 25) * .0016)));
        const topSafe = Math.max(145, height * .17);
        const bottomSafe = floor + Math.max(74, height * .08);
        const minCenter = topSafe + gap / 2;
        const maxCenter = height - bottomSafe - gap / 2;
        const center = minCenter + Math.random() * Math.max(1, maxCenter - minCenter);
        this.pipes.push({ x: width + 70, w: Math.max(64, width * .17), gapTop: center - gap / 2, gapBottom: center + gap / 2, passed: false, seed: Math.random() * 1000 });
      },
      update(dt) {
        if (this.ended || !this.started) {
          this.fish.y = height * .46 + Math.sin(worldTime * 2.2) * 10;
          this.fish.rotation = Math.sin(worldTime * 1.8) * .05;
          return;
        }
        this.speed = Math.max(175, width * .46) + Math.min(115, this.score * 4.1);
        this.fish.vy += Math.max(900, height * 1.12) * dt;
        this.fish.y += this.fish.vy * dt;
        this.fish.rotation = Math.min(1.18, this.fish.rotation + 2.5 * dt);
        this.spawnTimer += dt;
        if (this.spawnTimer >= this.nextSpawn) {
          this.spawnTimer = 0;
          this.nextSpawn = Math.max(.98, 1.3 - this.score * .007);
          this.spawnPipe();
        }
        for (const pipe of this.pipes) {
          pipe.x -= this.speed * dt;
          if (!pipe.passed && pipe.x + pipe.w < this.fish.x) {
            pipe.passed = true;
            this.score += 1;
            setHud("SCORE", this.score, null);
            burst(this.fish.x, this.fish.y, 10, "spark");
            tone(750, .08, .033, "triangle", 190);
            haptic("soft");
          }
        }
        this.pipes = this.pipes.filter((pipe) => pipe.x + pipe.w > -30);
        const floorY = height - Math.max(72, height * .095);
        if (this.fish.y - this.fish.radius < 0 || this.fish.y + this.fish.radius > floorY) this.crash();
        for (const pipe of this.pipes) {
          const overlapX = this.fish.x + this.fish.radius > pipe.x + 5 && this.fish.x - this.fish.radius < pipe.x + pipe.w - 5;
          const hitY = this.fish.y - this.fish.radius < pipe.gapTop || this.fish.y + this.fish.radius > pipe.gapBottom;
          if (overlapX && hitY) { this.crash(); break; }
        }
      },
      crash() {
        if (this.ended) return;
        this.ended = true;
        shakeTime = .38;
        flashTime = .12;
        burst(this.fish.x, this.fish.y, 30, "bad");
        tone(140, .28, .06, "sawtooth", -75);
        haptic("bad");
        const score = this.score;
        window.setTimeout(() => finishGame({
          score,
          coins: Math.max(1, Math.floor(score / 2) + 1),
          xp: Math.max(2, score * 3 + 2),
          eyebrow: "REEF RUN OVER",
          title: score >= 25 ? "Reef master!" : score >= 10 ? "Great swim!" : "Nice try!",
          message: "Every gate improves your timing. Dive in again and chase the next best.",
        }), 430);
      },
      render(dt) {
        drawOceanBackground(dt);
        for (const pipe of this.pipes) drawReefPipe(pipe);
        drawFish(this.fish.x, this.fish.y, 1, this.fish.rotation);
      },
    };
    return game;
  };

  function drawReefPipe(pipe) {
    const floorY = height - Math.max(72, height * .095);
    drawPipeSection(pipe.x, -20, pipe.w, pipe.gapTop + 20, true, pipe.seed);
    drawPipeSection(pipe.x, pipe.gapBottom, pipe.w, floorY - pipe.gapBottom + 20, false, pipe.seed + 20);
  }

  function drawPipeSection(x, y, w, h, top, seed) {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, "#123c50"); g.addColorStop(.2, "#247078"); g.addColorStop(.52, "#195761"); g.addColorStop(.8, "#2b7f79"); g.addColorStop(1, "#0b3145");
    ctx.fillStyle = g; ctx.strokeStyle = "#082a3c"; ctx.lineWidth = 3;
    roundRect(ctx, x, y, w, h, 10); ctx.fill(); ctx.stroke();
    const lipH = 24;
    const lipY = top ? y + h - lipH : y;
    const lipG = ctx.createLinearGradient(x - 7, 0, x + w + 7, 0);
    lipG.addColorStop(0, "#0c3448"); lipG.addColorStop(.22, "#2c8b83"); lipG.addColorStop(.55, "#2c6f72"); lipG.addColorStop(1, "#092b3f");
    ctx.fillStyle = lipG; roundRect(ctx, x - 7, lipY, w + 14, lipH, 9); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.globalAlpha = .75;
    for (let i = 0; i < 5; i += 1) {
      const px = x + 10 + pseudo(seed + i) * (w - 20);
      const py = y + 12 + pseudo(seed + i + 8) * Math.max(10, h - 34);
      ctx.fillStyle = i % 2 ? "#f27593" : "#df7243";
      ctx.beginPath();
      for (let n = 0; n < 10; n += 1) {
        const a = (n / 10) * Math.PI * 2;
        const r = n % 2 ? 3 : 7;
        ctx.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = "rgba(67,224,159,.65)"; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i += 1) {
      const px = x + 12 + pseudo(seed + i + 30) * (w - 24);
      const py = top ? lipY - 4 : lipY + lipH + 4;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + 7, py + (top ? -15 : 15), px + 2, py + (top ? -25 : 25)); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- BUBBLE BURST ----------
  gameFactories.bubble = () => ({
    title: "BUBBLE BURST",
    targets: [], score: 0, combo: 0, timeLeft: 30, spawnTimer: 0, ended: false,
    start() {
      this.targets = [];
      this.score = 0;
      this.combo = 0;
      this.timeLeft = 30;
      this.spawnTimer = 0;
      this.ended = false;
      setHud("SCORE", 0, this.timeLeft);
      setInstruction("Pop bubbles • Avoid the dark urchins", true);
    },
    spawn() {
      const roll = Math.random();
      const type = roll > .91 ? "urchin" : roll > .78 ? "gold" : "bubble";
      const r = type === "urchin" ? 24 + Math.random() * 8 : 20 + Math.random() * 22;
      this.targets.push({ x: r + Math.random() * (width - r * 2), y: height + r + 10, r, vy: 55 + Math.random() * 65, drift: (Math.random() - .5) * 24, phase: Math.random() * Math.PI * 2, type, life: 1 });
    },
    tap(x, y) {
      if (this.ended) return;
      for (let i = this.targets.length - 1; i >= 0; i -= 1) {
        const target = this.targets[i];
        if (Math.hypot(x - target.x, y - target.y) <= target.r * 1.16) {
          this.targets.splice(i, 1);
          if (target.type === "urchin") {
            this.score = Math.max(0, this.score - 3);
            this.combo = 0;
            shakeTime = .18;
            burst(target.x, target.y, 18, "bad");
            tone(125, .18, .05, "sawtooth", -50);
            haptic("bad");
          } else {
            this.combo += 1;
            const base = target.type === "gold" ? 3 : 1;
            const bonus = this.combo > 0 && this.combo % 8 === 0 ? 2 : 0;
            this.score += base + bonus;
            burst(target.x, target.y, target.type === "gold" ? 18 : 10, "spark");
            tone(target.type === "gold" ? 940 : 650, .07, .025, "triangle", 120);
            haptic("tap");
          }
          setHud("SCORE", this.score, this.timeLeft);
          return;
        }
      }
    },
    update(dt) {
      if (this.ended) return;
      this.timeLeft -= dt;
      this.spawnTimer += dt;
      const spawnEvery = Math.max(.25, .48 - (30 - this.timeLeft) * .004);
      if (this.spawnTimer >= spawnEvery) { this.spawnTimer = 0; this.spawn(); }
      for (const target of this.targets) {
        target.y -= target.vy * dt;
        target.x += Math.sin(worldTime * 2 + target.phase) * target.drift * dt;
      }
      this.targets = this.targets.filter((target) => target.y + target.r > 70);
      setHud("SCORE", this.score, this.timeLeft);
      if (this.timeLeft <= 0) {
        this.ended = true;
        const score = this.score;
        finishGame({
          score,
          coins: Math.max(2, Math.floor(score / 3)),
          xp: Math.max(4, score * 2),
          eyebrow: "TIDE COMPLETE",
          title: score >= 45 ? "Bubble legend!" : score >= 25 ? "Fast fingers!" : "Good burst!",
          message: "Gold bubbles are worth more. Keep your combo alive and stay away from urchins.",
        });
      }
    },
    render(dt) {
      drawOceanBackground(dt);
      for (const target of this.targets) {
        if (target.type === "urchin") drawUrchin(target);
        else drawBubbleTarget(target);
      }
    },
  });

  function drawBubbleTarget(target) {
    ctx.save();
    ctx.translate(target.x, target.y);
    const pulse = 1 + Math.sin(worldTime * 3 + target.phase) * .04;
    ctx.scale(pulse, pulse);
    const g = ctx.createRadialGradient(-target.r * .3, -target.r * .35, 1, 0, 0, target.r);
    if (target.type === "gold") {
      g.addColorStop(0, "rgba(255,255,222,.95)"); g.addColorStop(.18, "rgba(255,231,82,.86)"); g.addColorStop(.72, "rgba(255,152,25,.38)"); g.addColorStop(1, "rgba(255,124,0,.08)");
    } else {
      g.addColorStop(0, "rgba(255,255,255,.9)"); g.addColorStop(.2, "rgba(118,239,255,.4)"); g.addColorStop(.75, "rgba(44,158,233,.18)"); g.addColorStop(1, "rgba(30,104,187,.05)");
    }
    ctx.fillStyle = g; ctx.strokeStyle = target.type === "gold" ? "rgba(255,231,104,.9)" : "rgba(212,250,255,.82)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, target.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-target.r * .22, -target.r * .22, target.r * .52, Math.PI * 1.05, Math.PI * 1.55); ctx.stroke();
    if (target.type === "gold") { ctx.fillStyle = "#fff5a8"; ctx.font = `${target.r}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("★", 0, 2); }
    ctx.restore();
  }

  function drawUrchin(target) {
    ctx.save(); ctx.translate(target.x, target.y); ctx.rotate(worldTime * .4 + target.phase);
    ctx.fillStyle = "#2b1649"; ctx.strokeStyle = "#f26cff"; ctx.lineWidth = 2;
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * target.r * .55, Math.sin(a) * target.r * .55); ctx.lineTo(Math.cos(a) * target.r * 1.16, Math.sin(a) * target.r * 1.16); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, 0, target.r * .67, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ff8ef6"; ctx.beginPath(); ctx.arc(-7, -4, 3, 0, Math.PI * 2); ctx.arc(7, -4, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ---------- REEF MAZE ----------
  const TOP_WALL = 1, RIGHT_WALL = 2, BOTTOM_WALL = 4, LEFT_WALL = 8;
  gameFactories.maze = () => ({
    title: "REEF MAZE",
    cols: 11, rows: 15, cells: [], player: { c: 0, r: 0 }, timeLeft: 60, moves: 0, rect: null, ended: false,
    start() {
      this.ended = false;
      this.timeLeft = 60;
      this.moves = 0;
      this.player = { c: 0, r: 0 };
      this.resize();
      this.generate();
      setHud("MOVES", 0, this.timeLeft);
      setInstruction("Swipe or use arrows to reach the pearl", true);
    },
    resize() {
      const availableW = Math.min(width - 28, 520);
      const top = Math.max(165, height * .19);
      const bottomSpace = 172;
      const availableH = Math.max(280, height - top - bottomSpace);
      this.cols = width < 430 ? 11 : 13;
      this.rows = Math.max(13, Math.min(19, Math.floor((availableH / availableW) * this.cols)));
      const cell = Math.min(availableW / this.cols, availableH / this.rows);
      const mazeW = cell * this.cols;
      const mazeH = cell * this.rows;
      this.rect = { x: (width - mazeW) / 2, y: top + (availableH - mazeH) / 2, w: mazeW, h: mazeH, cell };
    },
    generate() {
      const count = this.cols * this.rows;
      this.cells = Array.from({ length: count }, () => TOP_WALL | RIGHT_WALL | BOTTOM_WALL | LEFT_WALL);
      const visited = new Array(count).fill(false);
      const stack = [{ c: 0, r: 0 }];
      visited[0] = true;
      while (stack.length) {
        const current = stack[stack.length - 1];
        const options = [];
        if (current.r > 0 && !visited[(current.r - 1) * this.cols + current.c]) options.push({ dc: 0, dr: -1, wall: TOP_WALL, opposite: BOTTOM_WALL });
        if (current.c < this.cols - 1 && !visited[current.r * this.cols + current.c + 1]) options.push({ dc: 1, dr: 0, wall: RIGHT_WALL, opposite: LEFT_WALL });
        if (current.r < this.rows - 1 && !visited[(current.r + 1) * this.cols + current.c]) options.push({ dc: 0, dr: 1, wall: BOTTOM_WALL, opposite: TOP_WALL });
        if (current.c > 0 && !visited[current.r * this.cols + current.c - 1]) options.push({ dc: -1, dr: 0, wall: LEFT_WALL, opposite: RIGHT_WALL });
        if (!options.length) { stack.pop(); continue; }
        const next = options[Math.floor(Math.random() * options.length)];
        const nc = current.c + next.dc;
        const nr = current.r + next.dr;
        const index = current.r * this.cols + current.c;
        const nextIndex = nr * this.cols + nc;
        this.cells[index] &= ~next.wall;
        this.cells[nextIndex] &= ~next.opposite;
        visited[nextIndex] = true;
        stack.push({ c: nc, r: nr });
      }
    },
    move(direction) {
      if (this.ended) return;
      const index = this.player.r * this.cols + this.player.c;
      const walls = this.cells[index];
      let dc = 0, dr = 0, blocked = false;
      if (direction === "up") { dr = -1; blocked = Boolean(walls & TOP_WALL); }
      if (direction === "right") { dc = 1; blocked = Boolean(walls & RIGHT_WALL); }
      if (direction === "down") { dr = 1; blocked = Boolean(walls & BOTTOM_WALL); }
      if (direction === "left") { dc = -1; blocked = Boolean(walls & LEFT_WALL); }
      if (blocked) { tone(170, .05, .015, "square", -30); haptic("soft"); return; }
      this.player.c += dc;
      this.player.r += dr;
      this.moves += 1;
      setHud("MOVES", this.moves, this.timeLeft);
      tone(430, .04, .012, "sine", 40);
      if (this.player.c === this.cols - 1 && this.player.r === this.rows - 1) this.complete();
    },
    complete() {
      if (this.ended) return;
      this.ended = true;
      const score = Math.max(10, Math.floor(this.timeLeft * 8 + Math.max(0, 220 - this.moves * 2)));
      const p = this.cellCenter(this.player.c, this.player.r);
      burst(p.x, p.y, 32, "spark");
      finishGame({
        score,
        coins: Math.max(5, Math.floor(score / 60)),
        xp: Math.max(12, Math.floor(score / 3)),
        eyebrow: "PEARL DISCOVERED",
        title: "Maze escaped!",
        message: `You reached the pearl in ${this.moves} moves with ${Math.ceil(this.timeLeft)} seconds left.`,
      });
    },
    update(dt) {
      if (this.ended) return;
      this.timeLeft -= dt;
      setHud("MOVES", this.moves, this.timeLeft);
      if (this.timeLeft <= 0) {
        this.ended = true;
        finishGame({ score: 0, coins: 1, xp: 3, eyebrow: "TIME'S UP", title: "The pearl is still hidden", message: "Study the paths, use the controls quickly, and try a fresh maze." });
      }
    },
    cellCenter(c, r) {
      return { x: this.rect.x + (c + .5) * this.rect.cell, y: this.rect.y + (r + .5) * this.rect.cell };
    },
    render(dt) {
      drawOceanBackground(dt, "maze");
      if (!this.rect || !this.cells.length) return;
      const { x, y, cell } = this.rect;
      ctx.save();
      ctx.fillStyle = "rgba(1,23,40,.64)";
      roundRect(ctx, x - 8, y - 8, this.rect.w + 16, this.rect.h + 16, 18); ctx.fill();
      ctx.strokeStyle = "rgba(117,235,239,.92)";
      ctx.lineWidth = Math.max(2, cell * .09);
      ctx.lineCap = "round";
      ctx.shadowColor = "rgba(78,235,255,.28)"; ctx.shadowBlur = 5;
      for (let r = 0; r < this.rows; r += 1) {
        for (let c = 0; c < this.cols; c += 1) {
          const walls = this.cells[r * this.cols + c];
          const x0 = x + c * cell, y0 = y + r * cell;
          ctx.beginPath();
          if (walls & TOP_WALL) { ctx.moveTo(x0, y0); ctx.lineTo(x0 + cell, y0); }
          if (walls & RIGHT_WALL) { ctx.moveTo(x0 + cell, y0); ctx.lineTo(x0 + cell, y0 + cell); }
          if (walls & BOTTOM_WALL) { ctx.moveTo(x0, y0 + cell); ctx.lineTo(x0 + cell, y0 + cell); }
          if (walls & LEFT_WALL) { ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 + cell); }
          ctx.stroke();
        }
      }
      ctx.shadowBlur = 0;
      const goal = this.cellCenter(this.cols - 1, this.rows - 1);
      const glow = ctx.createRadialGradient(goal.x, goal.y, 1, goal.x, goal.y, cell * .65);
      glow.addColorStop(0, "rgba(255,255,255,.95)"); glow.addColorStop(.2, "rgba(125,244,255,.9)"); glow.addColorStop(1, "rgba(41,213,255,0)");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(goal.x, goal.y, cell * .65, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(goal.x, goal.y, cell * .2, 0, Math.PI * 2); ctx.fill();
      const p = this.cellCenter(this.player.c, this.player.r);
      drawFish(p.x, p.y, Math.max(.28, Math.min(.52, cell / 38)), 0, "blue");
      ctx.restore();
    },
  });

  // ---------- OCEAN PAIRS ----------
  gameFactories.memory = () => ({
    title: "OCEAN PAIRS",
    cards: [], first: null, second: null, lockUntil: 0, previewUntil: 0, timeLeft: 60, moves: 0, pairs: 0, rect: null, ended: false,
    start() {
      const icons = ["fish", "octopus", "turtle", "jelly", "crab", "dolphin", "shell", "star"];
      this.cards = shuffle([...icons, ...icons]).map((icon, index) => ({ icon, matched: false, flipped: false, index }));
      this.first = null;
      this.second = null;
      this.lockUntil = 0;
      this.previewUntil = performance.now() + 1250;
      this.timeLeft = 60;
      this.moves = 0;
      this.pairs = 0;
      this.ended = false;
      this.resize();
      setHud("PAIRS", "0/8", this.timeLeft);
      setInstruction("Memorize the reef cards…", false);
      window.setTimeout(() => {
        if (currentGame === this && !this.ended) setInstruction("Tap two cards to find a pair", true);
      }, 1300);
    },
    resize() {
      const sidePadding = Math.max(14, width * .035);
      const maxW = Math.min(width - sidePadding * 2, 520);
      const top = Math.max(148, Math.min(205, height * .205));
      const bottomPadding = Math.max(18, height * .025);
      const availableH = Math.max(250, height - top - bottomPadding);
      const gap = Math.max(6, Math.min(11, width * .02));
      const cellByWidth = (maxW - gap * 3) / 4;
      const cellByHeight = (availableH - gap * 3) / 4;
      const cell = Math.max(48, Math.min(cellByWidth, cellByHeight, 122));
      const boardW = cell * 4 + gap * 3;
      const boardH = cell * 4 + gap * 3;
      const centeredY = top + Math.max(0, (availableH - boardH) / 2);
      this.rect = { x: (width - boardW) / 2, y: centeredY, cell, gap, w: boardW, h: boardH };
    },
    tap(x, y) {
      const now = performance.now();
      if (this.ended || now < this.previewUntil || now < this.lockUntil || !this.rect) return;
      const { x: bx, y: by, cell, gap } = this.rect;
      if (x < bx || y < by || x > bx + this.rect.w || y > by + this.rect.h) return;
      const c = Math.floor((x - bx) / (cell + gap));
      const r = Math.floor((y - by) / (cell + gap));
      if (c < 0 || c > 3 || r < 0 || r > 3) return;
      const localX = (x - bx) - c * (cell + gap);
      const localY = (y - by) - r * (cell + gap);
      if (localX > cell || localY > cell) return;
      const index = r * 4 + c;
      const card = this.cards[index];
      if (!card || card.matched || card.flipped) return;
      card.flipped = true;
      tone(520, .05, .018, "sine", 65);
      haptic("tap");
      if (this.first === null) {
        this.first = index;
        return;
      }
      this.second = index;
      this.moves += 1;
      const firstCard = this.cards[this.first];
      if (firstCard.icon === card.icon) {
        firstCard.matched = true;
        card.matched = true;
        this.pairs += 1;
        const center = this.cardCenter(index);
        burst(center.x, center.y, 18, "spark");
        tone(820, .08, .03, "triangle", 150);
        haptic("good");
        this.first = null;
        this.second = null;
        setHud("PAIRS", `${this.pairs}/8`, this.timeLeft);
        if (this.pairs === 8) this.complete();
      } else {
        this.lockUntil = now + 720;
      }
    },
    cardCenter(index) {
      const c = index % 4;
      const r = Math.floor(index / 4);
      return {
        x: this.rect.x + c * (this.rect.cell + this.rect.gap) + this.rect.cell / 2,
        y: this.rect.y + r * (this.rect.cell + this.rect.gap) + this.rect.cell / 2,
      };
    },
    complete() {
      if (this.ended) return;
      this.ended = true;
      const score = Math.max(50, Math.floor(800 + this.timeLeft * 6 - this.moves * 12));
      finishGame({
        score,
        coins: Math.max(6, Math.floor(score / 85)),
        xp: Math.max(15, Math.floor(score / 4)),
        eyebrow: "ALL PAIRS FOUND",
        title: "Perfect memory!",
        message: `You cleared the board in ${this.moves} turns with ${Math.ceil(this.timeLeft)} seconds remaining.`,
      });
    },
    update(dt) {
      if (this.ended) return;
      const now = performance.now();
      if (now >= this.previewUntil) this.timeLeft -= dt;
      if (this.second !== null && now >= this.lockUntil) {
        const first = this.cards[this.first];
        const second = this.cards[this.second];
        if (first) first.flipped = false;
        if (second) second.flipped = false;
        this.first = null;
        this.second = null;
        this.lockUntil = 0;
      }
      setHud("PAIRS", `${this.pairs}/8`, this.timeLeft);
      if (this.timeLeft <= 0) {
        this.ended = true;
        const score = this.pairs * 80;
        finishGame({ score, coins: Math.max(1, this.pairs), xp: Math.max(3, this.pairs * 5), eyebrow: "TIME'S UP", title: `${this.pairs} pairs found`, message: "Remember the positions, stay calm, and clear the full reef next time." });
      }
    },
    render(dt) {
      drawOceanBackground(dt);
      if (!this.rect || this.cards.length !== 16) return;
      const { x, y, cell, gap } = this.rect;
      const preview = performance.now() < this.previewUntil;
      ctx.save();
      ctx.fillStyle = "rgba(0,18,34,.32)";
      roundRect(ctx, x - 9, y - 9, this.rect.w + 18, this.rect.h + 18, 20);
      ctx.fill();
      for (let i = 0; i < this.cards.length; i += 1) {
        const c = i % 4;
        const r = Math.floor(i / 4);
        const cx = x + c * (cell + gap);
        const cy = y + r * (cell + gap);
        const card = this.cards[i];
        const revealed = preview || card.flipped || card.matched;
        ctx.shadowColor = "rgba(0,0,0,.26)";
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 5;
        const g = ctx.createLinearGradient(cx, cy, cx + cell, cy + cell);
        if (revealed) {
          g.addColorStop(0, card.matched ? "#34cdb2" : "#24b8d7");
          g.addColorStop(1, card.matched ? "#08717b" : "#07527e");
        } else {
          g.addColorStop(0, "#0d5d7a");
          g.addColorStop(1, "#031f3d");
        }
        ctx.fillStyle = g;
        ctx.strokeStyle = revealed ? "rgba(177,250,255,.78)" : "rgba(101,214,236,.36)";
        ctx.lineWidth = Math.max(2, cell * .025);
        roundRect(ctx, cx, cy, cell, cell, Math.max(10, cell * .16));
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        if (revealed) {
          drawPairIcon(card.icon, cx + cell / 2, cy + cell / 2, cell * .31, card.matched ? 1 : .92);
        } else {
          ctx.save();
          ctx.translate(cx + cell / 2, cy + cell / 2);
          ctx.strokeStyle = "rgba(113,236,255,.72)";
          ctx.lineWidth = Math.max(2, cell * .035);
          ctx.beginPath();
          ctx.arc(0, 0, cell * .18, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-cell * .13, 0);
          ctx.quadraticCurveTo(0, -cell * .18, cell * .13, 0);
          ctx.quadraticCurveTo(0, cell * .18, -cell * .13, 0);
          ctx.stroke();
          ctx.restore();
        }
      }
      ctx.restore();
    },
  });

  function drawPairIcon(kind, x, y, size, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const s = size;
    if (kind === "fish") {
      ctx.fillStyle = "#ffd04a";
      ctx.beginPath(); ctx.ellipse(0, 0, s * .72, s * .45, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ff7932";
      ctx.beginPath(); ctx.moveTo(-s * .58, 0); ctx.lineTo(-s * 1.05, -s * .5); ctx.lineTo(-s * .92, 0); ctx.lineTo(-s * 1.05, s * .5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(s * .36, -s * .1, s * .13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#07253b"; ctx.beginPath(); ctx.arc(s * .4, -s * .1, s * .065, 0, Math.PI * 2); ctx.fill();
    } else if (kind === "octopus") {
      ctx.fillStyle = "#e87dff";
      ctx.beginPath(); ctx.arc(0, -s * .12, s * .5, Math.PI, 0); ctx.lineTo(s * .5, s * .25); ctx.quadraticCurveTo(s * .3, s * .43, s * .14, s * .2); ctx.quadraticCurveTo(0, s * .48, -s * .14, s * .2); ctx.quadraticCurveTo(-s * .3, s * .43, -s * .5, s * .25); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(-s * .17, -s * .1, s * .09, 0, Math.PI * 2); ctx.arc(s * .17, -s * .1, s * .09, 0, Math.PI * 2); ctx.fill();
    } else if (kind === "turtle") {
      ctx.fillStyle = "#68d36f";
      ctx.beginPath(); ctx.ellipse(0, 0, s * .62, s * .45, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#176f58"; ctx.lineWidth = s * .1; ctx.beginPath(); ctx.arc(0, 0, s * .29, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#7ee2a0"; ctx.beginPath(); ctx.arc(s * .68, 0, s * .2, 0, Math.PI * 2); ctx.fill();
      for (const a of [-.65, .65]) { ctx.beginPath(); ctx.ellipse(a * s, -s * .34, s * .22, s * .11, a, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(a * s, s * .34, s * .22, s * .11, -a, 0, Math.PI * 2); ctx.fill(); }
    } else if (kind === "jelly") {
      ctx.fillStyle = "#8de5ff";
      ctx.beginPath(); ctx.arc(0, -s * .05, s * .55, Math.PI, 0); ctx.lineTo(s * .55, s * .16); ctx.quadraticCurveTo(0, s * .35, -s * .55, s * .16); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#b8efff"; ctx.lineWidth = s * .1;
      for (let i = -2; i <= 2; i += 1) { ctx.beginPath(); ctx.moveTo(i * s * .2, s * .16); ctx.quadraticCurveTo(i * s * .27 + s * .12, s * .48, i * s * .17, s * .72); ctx.stroke(); }
    } else if (kind === "crab") {
      ctx.fillStyle = "#ff6f4c";
      ctx.beginPath(); ctx.ellipse(0, s * .08, s * .55, s * .38, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#ff9a59"; ctx.lineWidth = s * .12;
      ctx.beginPath(); ctx.moveTo(-s * .45, -s * .03); ctx.lineTo(-s * .83, -s * .37); ctx.lineTo(-s * 1.02, -s * .24); ctx.moveTo(s * .45, -s * .03); ctx.lineTo(s * .83, -s * .37); ctx.lineTo(s * 1.02, -s * .24); ctx.stroke();
      ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(-s * .2, -s * .13, s * .1, 0, Math.PI * 2); ctx.arc(s * .2, -s * .13, s * .1, 0, Math.PI * 2); ctx.fill();
    } else if (kind === "dolphin") {
      ctx.fillStyle = "#72c7ef";
      ctx.beginPath(); ctx.ellipse(0, 0, s * .72, s * .28, -.25, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-s * .55, s * .05); ctx.lineTo(-s * .96, -s * .4); ctx.lineTo(-s * .84, s * .12); ctx.lineTo(-s * .98, s * .5); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-s * .05, -s * .18); ctx.lineTo(s * .18, -s * .65); ctx.lineTo(s * .3, -s * .1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#092a43"; ctx.beginPath(); ctx.arc(s * .43, -s * .08, s * .055, 0, Math.PI * 2); ctx.fill();
    } else if (kind === "shell") {
      ctx.fillStyle = "#ffb2c9";
      ctx.beginPath(); ctx.arc(0, s * .12, s * .62, Math.PI, 0); ctx.lineTo(s * .48, s * .5); ctx.lineTo(-s * .48, s * .5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#ffe0ea"; ctx.lineWidth = s * .075;
      for (let i = -2; i <= 2; i += 1) { ctx.beginPath(); ctx.moveTo(0, -s * .48); ctx.lineTo(i * s * .2, s * .45); ctx.stroke(); }
    } else {
      ctx.fillStyle = "#ffe052";
      ctx.beginPath();
      for (let i = 0; i < 10; i += 1) { const a = -Math.PI / 2 + i * Math.PI / 5; const r = i % 2 ? s * .37 : s * .78; const px = Math.cos(a) * r; const py = Math.sin(a) * r; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // ---------- REEF HOCKEY: LOCAL TWO PLAYER ----------
  gameFactories.hockey = () => ({
    title: "REEF HOCKEY",
    arena: null,
    p1: null,
    p2: null,
    puck: null,
    pointers: new Map(),
    score1: 0,
    score2: 0,
    started: false,
    ended: false,
    goalPause: 0,
    start() {
      this.score1 = 0; this.score2 = 0; this.started = false; this.ended = false; this.goalPause = 0; this.pointers = new Map();
      this.resize(true);
      setHud("BLUE • ORANGE", "0 : 0", null);
      setInstruction("Two players: drag one paddle each", false);
    },
    resize(reset = false) {
      const top = Math.max(142, height * .16);
      const bottom = Math.max(20, height * .025);
      const side = Math.max(12, width * .035);
      this.arena = { x: side, y: top, w: width - side * 2, h: height - top - bottom, goalW: Math.min(width * .42, 190) };
      const r = Math.max(22, Math.min(34, width * .07));
      if (reset || !this.p1) {
        this.p1 = { x: width / 2, y: this.arena.y + this.arena.h * .76, r, vx: 0, vy: 0, lastX: width / 2, lastY: this.arena.y + this.arena.h * .76 };
        this.p2 = { x: width / 2, y: this.arena.y + this.arena.h * .24, r, vx: 0, vy: 0, lastX: width / 2, lastY: this.arena.y + this.arena.h * .24 };
        this.puck = { x: width / 2, y: this.arena.y + this.arena.h / 2, r: Math.max(13, r * .5), vx: 0, vy: 0 };
      } else {
        this.p1.r = r; this.p2.r = r; this.puck.r = Math.max(13, r * .5);
        this.resetPuck(Math.random() > .5 ? 1 : -1, false);
      }
    },
    pointerDown(id, x, y) {
      if (this.ended) return;
      const player = y >= this.arena.y + this.arena.h / 2 ? 1 : 2;
      if ([...this.pointers.values()].includes(player)) return;
      this.pointers.set(id, player);
      if (!this.started) {
        this.started = true;
        this.resetPuck(Math.random() > .5 ? 1 : -1, true);
      }
      instructionPill.classList.add("fade");
      this.movePaddle(player, x, y);
      haptic("tap");
    },
    pointerMove(id, x, y) {
      const player = this.pointers.get(id);
      if (!player || this.ended) return;
      this.movePaddle(player, x, y);
    },
    pointerUp(id) { this.pointers.delete(id); },
    movePaddle(player, x, y) {
      const paddle = player === 1 ? this.p1 : this.p2;
      const minX = this.arena.x + paddle.r;
      const maxX = this.arena.x + this.arena.w - paddle.r;
      const mid = this.arena.y + this.arena.h / 2;
      const minY = player === 1 ? mid + paddle.r * .45 : this.arena.y + paddle.r;
      const maxY = player === 1 ? this.arena.y + this.arena.h - paddle.r : mid - paddle.r * .45;
      paddle.lastX = paddle.x; paddle.lastY = paddle.y;
      paddle.x = Math.max(minX, Math.min(maxX, x));
      paddle.y = Math.max(minY, Math.min(maxY, y));
      paddle.vx = (paddle.x - paddle.lastX) * 25;
      paddle.vy = (paddle.y - paddle.lastY) * 25;
    },
    resetPuck(direction = 1, serve = true) {
      this.puck.x = this.arena.x + this.arena.w / 2;
      this.puck.y = this.arena.y + this.arena.h / 2;
      const angle = (Math.random() - .5) * .62;
      const speed = Math.max(190, Math.min(330, width * .58));
      this.puck.vx = serve ? Math.sin(angle) * speed : 0;
      this.puck.vy = serve ? direction * Math.cos(angle) * speed : 0;
      this.goalPause = serve ? .55 : 0;
    },
    collidePaddle(paddle) {
      const dx = this.puck.x - paddle.x;
      const dy = this.puck.y - paddle.y;
      const min = this.puck.r + paddle.r;
      const distSq = dx * dx + dy * dy;
      if (distSq >= min * min) return;
      const dist = Math.max(.001, Math.sqrt(distSq));
      const nx = dx / dist, ny = dy / dist;
      this.puck.x = paddle.x + nx * min;
      this.puck.y = paddle.y + ny * min;
      const dot = this.puck.vx * nx + this.puck.vy * ny;
      const power = Math.max(190, Math.min(560, Math.hypot(paddle.vx, paddle.vy) * .75 + 250));
      this.puck.vx = this.puck.vx - 2 * Math.min(0, dot) * nx + nx * power + paddle.vx * .25;
      this.puck.vy = this.puck.vy - 2 * Math.min(0, dot) * ny + ny * power + paddle.vy * .25;
      const cap = 720;
      const speed = Math.hypot(this.puck.vx, this.puck.vy);
      if (speed > cap) { this.puck.vx *= cap / speed; this.puck.vy *= cap / speed; }
      burst(this.puck.x, this.puck.y, 8, "bubble");
      tone(260, .045, .024, "square", 70);
      haptic("soft");
    },
    scoreGoal(player) {
      if (this.goalPause > 0 || this.ended) return;
      if (player === 1) this.score1 += 1; else this.score2 += 1;
      setHud("BLUE • ORANGE", `${this.score1} : ${this.score2}`, null);
      burst(this.puck.x, Math.max(this.arena.y, Math.min(this.arena.y + this.arena.h, this.puck.y)), 30, "spark");
      tone(720, .14, .05, "triangle", 220);
      haptic("good");
      if (this.score1 >= 5 || this.score2 >= 5) {
        this.ended = true;
        const winner = this.score1 > this.score2 ? "Blue" : "Orange";
        window.setTimeout(() => finishGame({
          score: Math.max(this.score1, this.score2) * 100 + Math.min(this.score1, this.score2) * 10,
          coins: 8,
          xp: 25,
          eyebrow: "LOCAL MATCH COMPLETE",
          title: `${winner} player wins!`,
          message: `Final score: Blue ${this.score1} – ${this.score2} Orange. Pass the phone around and run it back.`,
          scoreLabel: "MATCH SCORE",
        }), 450);
        return;
      }
      this.resetPuck(player === 1 ? 1 : -1, true);
    },
    update(dt) {
      if (this.ended || !this.started) return;
      this.p1.vx *= Math.pow(.72, dt * 60); this.p1.vy *= Math.pow(.72, dt * 60);
      this.p2.vx *= Math.pow(.72, dt * 60); this.p2.vy *= Math.pow(.72, dt * 60);
      if (this.goalPause > 0) { this.goalPause = Math.max(0, this.goalPause - dt); return; }
      this.puck.x += this.puck.vx * dt;
      this.puck.y += this.puck.vy * dt;
      this.puck.vx *= Math.pow(.998, dt * 60);
      this.puck.vy *= Math.pow(.998, dt * 60);
      const left = this.arena.x + this.puck.r;
      const right = this.arena.x + this.arena.w - this.puck.r;
      if (this.puck.x < left) { this.puck.x = left; this.puck.vx = Math.abs(this.puck.vx) * .96; tone(180,.03,.012,"square",30); }
      if (this.puck.x > right) { this.puck.x = right; this.puck.vx = -Math.abs(this.puck.vx) * .96; tone(180,.03,.012,"square",30); }
      const goalLeft = this.arena.x + (this.arena.w - this.arena.goalW) / 2;
      const goalRight = goalLeft + this.arena.goalW;
      const inGoal = this.puck.x > goalLeft && this.puck.x < goalRight;
      if (this.puck.y < this.arena.y - this.puck.r * .8 && inGoal) this.scoreGoal(1);
      else if (this.puck.y > this.arena.y + this.arena.h + this.puck.r * .8 && inGoal) this.scoreGoal(2);
      else {
        if (this.puck.y < this.arena.y + this.puck.r && !inGoal) { this.puck.y = this.arena.y + this.puck.r; this.puck.vy = Math.abs(this.puck.vy) * .96; }
        if (this.puck.y > this.arena.y + this.arena.h - this.puck.r && !inGoal) { this.puck.y = this.arena.y + this.arena.h - this.puck.r; this.puck.vy = -Math.abs(this.puck.vy) * .96; }
      }
      this.collidePaddle(this.p1);
      this.collidePaddle(this.p2);
    },
    render(dt) {
      drawOceanBackground(dt, "maze");
      const a = this.arena;
      if (!a) return;
      ctx.save();
      ctx.fillStyle = "rgba(3,35,60,.58)";
      ctx.strokeStyle = "rgba(148,239,255,.72)";
      ctx.lineWidth = 3;
      roundRect(ctx, a.x, a.y, a.w, a.h, 24); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(132,230,247,.35)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a.x, a.y + a.h / 2); ctx.lineTo(a.x + a.w, a.y + a.h / 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(a.x + a.w / 2, a.y + a.h / 2, Math.min(58, a.w * .16), 0, Math.PI * 2); ctx.stroke();
      const goalLeft = a.x + (a.w - a.goalW) / 2;
      ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.strokeStyle = "rgba(211,251,255,.82)";
      ctx.fillRect(goalLeft, a.y - 10, a.goalW, 14); ctx.strokeRect(goalLeft, a.y - 10, a.goalW, 14);
      ctx.fillRect(goalLeft, a.y + a.h - 4, a.goalW, 14); ctx.strokeRect(goalLeft, a.y + a.h - 4, a.goalW, 14);
      this.drawPaddle(this.p1, "#20d8ff", "#0873c8");
      this.drawPaddle(this.p2, "#ffbd34", "#e84d35");
      const pg = ctx.createRadialGradient(this.puck.x - 4, this.puck.y - 5, 2, this.puck.x, this.puck.y, this.puck.r);
      pg.addColorStop(0, "#d9f7ff"); pg.addColorStop(.35, "#18384b"); pg.addColorStop(1, "#061928");
      ctx.fillStyle = pg; ctx.shadowColor = "rgba(80,225,255,.5)"; ctx.shadowBlur = 11;
      ctx.beginPath(); ctx.arc(this.puck.x, this.puck.y, this.puck.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    },
    drawPaddle(p, c1, c2) {
      const g = ctx.createRadialGradient(p.x - p.r * .25, p.y - p.r * .3, 2, p.x, p.y, p.r);
      g.addColorStop(0, "white"); g.addColorStop(.15, c1); g.addColorStop(1, c2);
      ctx.fillStyle = g; ctx.shadowColor = c1; ctx.shadowBlur = 13;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = "rgba(0,21,37,.55)";
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * .43, 0, Math.PI * 2); ctx.fill();
    },
  });

  // ---------- GHOST SHIP: LANTERN HORROR SURVIVAL ----------
  gameFactories.ghost = () => ({
    title: "GHOST SHIP",
    arena: null,
    player: null,
    ghost: null,
    walls: [],
    embers: [],
    exit: null,
    keys: new Set(),
    joystickId: null,
    joystickOrigin: null,
    joystickVec: { x: 0, y: 0 },
    facing: -Math.PI / 2,
    battery: 1,
    elapsed: 0,
    collected: 0,
    totalEmbers: 6,
    ended: false,
    graceTimer: 6,
    huntGrace: 0,
    huntTimer: 0,
    forcedHuntGap: 16,
    timeSinceHunt: 0,
    huntCheckAcc: 0,
    falseScareAcc: 0,
    nextFalseScareAt: 10,
    flickerUntil: 0,
    scareUntil: 0,
    heartAcc: 0,
    start() {
      this.keys = new Set();
      this.joystickId = null;
      this.joystickVec = { x: 0, y: 0 };
      this.facing = -Math.PI / 2;
      this.battery = 1;
      this.elapsed = 0;
      this.collected = 0;
      this.ended = false;
      this.exit = null;
      this.graceTimer = 6;
      this.huntGrace = 0;
      this.huntTimer = 0;
      this.forcedHuntGap = 16 + Math.random() * 4;
      this.timeSinceHunt = 0;
      this.huntCheckAcc = 0;
      this.falseScareAcc = 0;
      this.nextFalseScareAt = 9 + Math.random() * 6;
      this.flickerUntil = 0;
      this.scareUntil = 0;
      this.heartAcc = 0;
      this.resize();
      const a = this.arena;
      this.player = { x: a.x + a.w / 2, y: a.y + a.h * .84, r: 13 };
      this.ghost = { x: a.x + a.w * .5, y: a.y + a.h * .16, mode: "patrol", target: null, retargetAcc: 0, loseTimer: 0 };
      this.generate();
      this.pickPatrolTarget();
      setHud("EMBERS", `0/${this.totalEmbers}`, null);
      setInstruction("Drag anywhere to move. Find 6 embers. You are not alone down here.", true);
    },
    resize() {
      const top = Math.max(150, height * .17);
      const bottom = Math.max(46, height * .05);
      const side = Math.max(14, width * .04);
      this.arena = { x: side, y: top, w: width - side * 2, h: height - top - bottom };
    },
    computeReachable() {
      const a = this.arena;
      const cell = 12;
      const cols = Math.max(1, Math.ceil(a.w / cell));
      const rows = Math.max(1, Math.ceil(a.h / cell));
      const blocked = (gx, gy) => {
        const px = a.x + gx * cell + cell / 2;
        const py = a.y + gy * cell + cell / 2;
        return this.walls.some((wall) => pointInRect(px, py, wall, this.player.r));
      };
      const startGX = Math.min(cols - 1, Math.max(0, Math.floor((this.player.x - a.x) / cell)));
      const startGY = Math.min(rows - 1, Math.max(0, Math.floor((this.player.y - a.y) / cell)));
      const visited = new Set();
      const key = (gx, gy) => `${gx},${gy}`;
      if (!blocked(startGX, startGY)) {
        const stack = [[startGX, startGY]];
        visited.add(key(startGX, startGY));
        while (stack.length) {
          const [gx, gy] = stack.pop();
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = gx + dx, ny = gy + dy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            const k = key(nx, ny);
            if (visited.has(k) || blocked(nx, ny)) continue;
            visited.add(k);
            stack.push([nx, ny]);
          }
        }
      }
      return (px, py) => visited.has(key(Math.floor((px - a.x) / cell), Math.floor((py - a.y) / cell)));
    },
    generate() {
      const a = this.arena;
      const margin = 34;
      const exitPoint = { x: a.x + a.w * .5, y: a.y + 26 };
      let isReachable = () => true;
      for (let layoutAttempt = 0; layoutAttempt < 16; layoutAttempt += 1) {
        this.walls = [];
        const wallCount = 5 + Math.floor(Math.random() * 2);
        let attempts = 0;
        while (this.walls.length < wallCount && attempts < 80) {
          attempts += 1;
          const w = 46 + Math.random() * 58;
          const h = 46 + Math.random() * 58;
          const x = a.x + margin + Math.random() * Math.max(1, a.w - margin * 2 - w);
          const y = a.y + margin + Math.random() * Math.max(1, a.h - margin * 2 - h);
          const rect = { x, y, w, h };
          const centerDist = Math.hypot((x + w / 2) - (a.x + a.w / 2), (y + h / 2) - (a.y + a.h * .84));
          if (centerDist < 95) continue;
          if (this.walls.some((other) => rectsOverlap(other, rect, 32))) continue;
          this.walls.push(rect);
        }
        isReachable = this.computeReachable();
        if (isReachable(exitPoint.x, exitPoint.y)) break;
      }
      this.embers = [];
      let emberAttempts = 0;
      while (this.embers.length < this.totalEmbers && emberAttempts < 400) {
        emberAttempts += 1;
        const x = a.x + margin + Math.random() * (a.w - margin * 2);
        const y = a.y + margin + Math.random() * (a.h - margin * 2);
        if (this.walls.some((wall) => pointInRect(x, y, wall, 22))) continue;
        if (Math.hypot(x - this.player.x, y - this.player.y) < 80) continue;
        if (this.embers.some((e) => Math.hypot(e.x - x, e.y - y) < 70)) continue;
        if (!isReachable(x, y)) continue;
        this.embers.push({ x, y, collected: false, phase: Math.random() * Math.PI * 2 });
      }
      // Fallback: if the reachable-only pass came up short (rare, tight layouts), fill remaining
      // embers from any legal spot outside walls so a run is never short an ember to find.
      emberAttempts = 0;
      while (this.embers.length < this.totalEmbers && emberAttempts < 400) {
        emberAttempts += 1;
        const x = a.x + margin + Math.random() * (a.w - margin * 2);
        const y = a.y + margin + Math.random() * (a.h - margin * 2);
        if (this.walls.some((wall) => pointInRect(x, y, wall, 22))) continue;
        if (this.embers.some((e) => Math.hypot(e.x - x, e.y - y) < 70)) continue;
        this.embers.push({ x, y, collected: false, phase: Math.random() * Math.PI * 2 });
      }
    },
    pickPatrolTarget() {
      const a = this.arena;
      const margin = 40;
      this.ghost.target = { x: a.x + margin + Math.random() * (a.w - margin * 2), y: a.y + margin + Math.random() * (a.h - margin * 2) };
    },
    pointerDown(id, x, y) {
      if (this.ended || this.joystickId !== null) return;
      this.joystickId = id;
      this.joystickOrigin = { x, y };
      this.joystickVec = { x: 0, y: 0 };
      instructionPill.classList.add("fade");
    },
    pointerMove(id, x, y) {
      if (id !== this.joystickId || !this.joystickOrigin) return;
      const dx = x - this.joystickOrigin.x, dy = y - this.joystickOrigin.y;
      const maxR = 46;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(1, dist / maxR);
      const angle = Math.atan2(dy, dx);
      this.joystickVec = { x: Math.cos(angle) * clamped, y: Math.sin(angle) * clamped };
    },
    pointerUp(id) {
      if (id !== this.joystickId) return;
      this.joystickId = null;
      this.joystickVec = { x: 0, y: 0 };
    },
    keyControl(code, down) {
      const map = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
      const dir = map[code];
      if (!dir) return;
      if (down) this.keys.add(dir); else this.keys.delete(dir);
    },
    collides(x, y) {
      const r = this.player.r;
      for (const wall of this.walls) {
        if (x > wall.x - r && x < wall.x + wall.w + r && y > wall.y - r && y < wall.y + wall.h + r) return true;
      }
      return false;
    },
    steerGhost(target, speed, dt) {
      const g = this.ghost;
      const dx = target.x - g.x, dy = target.y - g.y;
      const dist = Math.hypot(dx, dy);
      if (dist < .5) return;
      g.x += (dx / dist) * speed * dt;
      g.y += (dy / dist) * speed * dt;
    },
    checkHuntTrigger() {
      if (this.graceTimer > 0 || this.huntGrace > 0) return;
      const dist = Math.hypot(this.ghost.x - this.player.x, this.ghost.y - this.player.y);
      const proximity = Math.max(0, 1 - dist / 260);
      const timeFactor = Math.min(.3, this.elapsed * .0055);
      const chance = .05 + proximity * .45 + timeFactor;
      if (Math.random() < chance || this.timeSinceHunt > this.forcedHuntGap) this.startHunt();
    },
    startHunt() {
      this.ghost.mode = "hunt";
      this.huntTimer = 0;
      this.ghost.retargetAcc = 10;
      this.ghost.loseTimer = 0;
      this.timeSinceHunt = 0;
      tone(85, 1.1, .055, "sawtooth", -35);
      haptic("soft");
      setInstruction("It's moving — run!", true);
    },
    endHunt() {
      this.ghost.mode = "patrol";
      this.huntGrace = 4 + Math.random() * 3;
      this.forcedHuntGap = 15 + Math.random() * 9;
      this.pickPatrolTarget();
    },
    triggerFlicker() {
      this.flickerUntil = worldTime + .3;
      tone(240, .1, .022, "square", -70);
      this.falseScareAcc = 0;
      this.nextFalseScareAt = 9 + Math.random() * 7;
    },
    triggerCapture() {
      if (this.ended) return;
      this.ended = true;
      this.scareUntil = worldTime + .85;
      shakeTime = .85;
      haptic("bad");
      tone(90, .5, .09, "sawtooth", -40);
      tone(760, .4, .06, "sawtooth", 260);
      burst(this.ghost.x, this.ghost.y, 40, "bad");
      const elapsedSec = this.elapsed;
      const collected = this.collected;
      const total = this.totalEmbers;
      window.setTimeout(() => {
        const score = Math.max(0, collected * 60 + Math.floor(elapsedSec * 1.4));
        finishGame({
          score,
          coins: Math.max(2, Math.floor(score / 45)),
          xp: Math.max(6, Math.floor(score / 7)),
          eyebrow: "THE WRECK CLAIMED YOU",
          title: "Something caught you in the dark",
          message: collected >= total ? "You gathered every ember but never reached the surface." : `You recovered ${collected} of ${total} embers before the lantern went out.`,
          scoreLabel: "SCORE",
        });
      }, 700);
    },
    spawnExit() {
      const a = this.arena;
      this.exit = { x: a.x + a.w * .5, y: a.y + 26 };
      tone(500, .3, .05, "triangle", 260);
      setInstruction("All embers found — get back to the hatch!", false);
    },
    win() {
      if (this.ended) return;
      this.ended = true;
      burst(this.exit.x, this.exit.y, 40, "spark");
      tone(880, .3, .05, "triangle", 220);
      haptic("good");
      const battBonus = Math.floor(this.battery * 260);
      const speedBonus = Math.max(0, Math.floor(420 - this.elapsed * 2.6));
      const score = 480 + battBonus + speedBonus;
      finishGame({
        score,
        coins: Math.max(10, Math.floor(score / 55)),
        xp: Math.max(24, Math.floor(score / 18)),
        eyebrow: "ESCAPED THE WRECK",
        title: "You made it to the surface",
        message: `You recovered all ${this.totalEmbers} embers in ${Math.floor(this.elapsed)}s with ${Math.round(this.battery * 100)}% lantern power left.`,
        scoreLabel: "SCORE",
      });
    },
    update(dt) {
      if (this.ended) return;
      this.elapsed += dt;
      let vx = 0, vy = 0;
      if (this.joystickId !== null) { vx = this.joystickVec.x; vy = this.joystickVec.y; }
      else {
        if (this.keys.has("up")) vy -= 1;
        if (this.keys.has("down")) vy += 1;
        if (this.keys.has("left")) vx -= 1;
        if (this.keys.has("right")) vx += 1;
      }
      const mag = Math.hypot(vx, vy);
      if (mag > 1) { vx /= mag; vy /= mag; }
      if (mag > .06) this.facing = Math.atan2(vy, vx);
      const speed = 152;
      const nx = this.player.x + vx * speed * dt;
      const ny = this.player.y + vy * speed * dt;
      if (!this.collides(nx, this.player.y)) this.player.x = nx;
      if (!this.collides(this.player.x, ny)) this.player.y = ny;
      const a = this.arena;
      this.player.x = Math.max(a.x + this.player.r, Math.min(a.x + a.w - this.player.r, this.player.x));
      this.player.y = Math.max(a.y + this.player.r, Math.min(a.y + a.h - this.player.r, this.player.y));

      const drain = .0092 + Math.min(1, mag) * .01;
      this.battery = Math.max(0, this.battery - drain * dt);

      if (this.graceTimer > 0) this.graceTimer -= dt;
      if (this.huntGrace > 0) this.huntGrace -= dt;
      this.timeSinceHunt += dt;

      for (const ember of this.embers) {
        if (ember.collected) continue;
        if (Math.hypot(ember.x - this.player.x, ember.y - this.player.y) < 26) {
          ember.collected = true;
          this.collected += 1;
          burst(ember.x, ember.y, 16, "spark");
          tone(720 + this.collected * 30, .16, .04, "triangle", 160);
          haptic("tap");
          setHud("EMBERS", `${this.collected}/${this.totalEmbers}`, null);
          if (this.collected >= this.totalEmbers && !this.exit) this.spawnExit();
        }
      }

      if (this.exit && Math.hypot(this.exit.x - this.player.x, this.exit.y - this.player.y) < 30) {
        this.win();
        return;
      }

      const g = this.ghost;
      if (g.mode === "patrol") {
        if (!g.target || Math.hypot(g.target.x - g.x, g.target.y - g.y) < 18) this.pickPatrolTarget();
        this.steerGhost(g.target, 52, dt);
        this.huntCheckAcc += dt;
        if (this.huntCheckAcc >= .5) { this.huntCheckAcc = 0; this.checkHuntTrigger(); }
      } else if (g.mode === "hunt") {
        this.huntTimer += dt;
        g.retargetAcc += dt;
        if (g.retargetAcc > .4) {
          g.retargetAcc = 0;
          const wobble = Math.max(8, 85 - this.huntTimer * 9);
          g.target = { x: this.player.x + (Math.random() - .5) * wobble, y: this.player.y + (Math.random() - .5) * wobble };
        }
        this.steerGhost(g.target, 120, dt);
        const dist = Math.hypot(g.x - this.player.x, g.y - this.player.y);
        if (dist > 430) { g.loseTimer += dt; if (g.loseTimer > 2.2) this.endHunt(); } else g.loseTimer = 0;
        if (this.huntTimer > 12) this.endHunt();
        if (dist < 26) { this.triggerCapture(); return; }
      }

      if (g.mode === "patrol" && this.graceTimer <= 0) {
        this.falseScareAcc += dt;
        if (this.falseScareAcc > this.nextFalseScareAt) this.triggerFlicker();
      }

      const distToGhost = Math.hypot(g.x - this.player.x, g.y - this.player.y);
      const tension = g.mode === "hunt" ? 1 : Math.max(0, 1 - distToGhost / 300) * .55;
      this.heartAcc += dt;
      const interval = 1.2 - tension * .9;
      if (tension > .1 && this.heartAcc > interval) {
        this.heartAcc = 0;
        tone(58 + tension * 24, .12, .018 + tension * .022, "sine", -8);
      }

      setHud("EMBERS", `${this.collected}/${this.totalEmbers}`, null);
    },
    currentAmbientR() {
      let r = 78;
      if (this.battery <= 0) r = 40 + Math.sin(worldTime * 8) * 10;
      else r *= .55 + this.battery * .45;
      if (worldTime < this.flickerUntil) r *= .35 + Math.abs(Math.sin(worldTime * 45)) * .5;
      if (this.ghost.mode === "hunt") r *= .82;
      return Math.max(30, r);
    },
    currentConeR() {
      let r = 235;
      if (this.battery <= 0) r = 70 + Math.sin(worldTime * 8) * 15;
      else r *= .5 + this.battery * .5;
      if (worldTime < this.flickerUntil) r *= .3 + Math.abs(Math.sin(worldTime * 45)) * .5;
      if (this.ghost.mode === "hunt") r *= .85;
      return Math.max(50, r);
    },
    drawGhost() {
      const g = this.ghost;
      ctx.save();
      const bob = Math.sin(worldTime * 3.4) * 4;
      ctx.translate(g.x, g.y + bob);
      const tint = g.mode === "hunt" ? "rgba(255,70,70,.85)" : "rgba(190,230,255,.55)";
      ctx.fillStyle = tint;
      ctx.beginPath();
      ctx.moveTo(-16, 12);
      ctx.quadraticCurveTo(-18, -22, 0, -24);
      ctx.quadraticCurveTo(18, -22, 16, 12);
      for (let i = 4; i >= -4; i -= 1) ctx.lineTo(i * 4, 12 + Math.sin(worldTime * 5 + i) * 3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = g.mode === "hunt" ? "#fff2f2" : "#eafcff";
      ctx.beginPath(); ctx.ellipse(-5, -8, 2.6, 3.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(5, -8, 2.6, 3.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    },
    drawDarkness(ambientR, coneR) {
      ctx.save();
      ctx.fillStyle = "rgba(2,2,4,.965)";
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "destination-out";
      const px = this.player.x, py = this.player.y;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, ambientR);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(px, py, ambientR, 0, Math.PI * 2); ctx.fill();

      ctx.save();
      const spread = .48;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.arc(px, py, coneR, this.facing - spread, this.facing + spread);
      ctx.closePath();
      ctx.clip();
      const cone = ctx.createRadialGradient(px, py, 0, px, py, coneR);
      cone.addColorStop(0, "rgba(255,255,255,1)");
      cone.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = cone;
      ctx.fillRect(px - coneR, py - coneR, coneR * 2, coneR * 2);
      ctx.restore();

      ctx.globalCompositeOperation = "source-over";
      ctx.restore();
    },
    drawBattery() {
      const w = 86, h = 14;
      const x = width / 2 - w / 2, y = height - 30;
      ctx.save();
      ctx.globalAlpha = .9;
      ctx.strokeStyle = "rgba(255,255,255,.5)";
      ctx.lineWidth = 2;
      roundRect(ctx, x, y, w, h, 5); ctx.stroke();
      ctx.fillStyle = this.battery < .22 ? "#ff5d5d" : "#8cffb0";
      const fillW = Math.max(2, (w - 4) * this.battery);
      roundRect(ctx, x + 2, y + 2, fillW, h - 4, 3); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.75)";
      ctx.font = "9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("LANTERN", width / 2, y - 6);
      ctx.restore();
    },
    drawScare() {
      const flicker = Math.random() > .5 ? 1 : .4;
      ctx.save();
      ctx.fillStyle = `rgba(${Math.floor(140 + Math.random() * 80)},0,10,${.55 * flicker})`;
      ctx.fillRect(0, 0, width, height);
      ctx.translate(width / 2, height / 2.3);
      const s = Math.min(width, height) * .5;
      ctx.fillStyle = "rgba(6,4,10,.92)";
      ctx.beginPath(); ctx.ellipse(0, 0, s * .6, s * .75, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#8cff6b";
      ctx.shadowColor = "#8cff6b"; ctx.shadowBlur = 30;
      ctx.beginPath(); ctx.ellipse(-s * .22, -s * .08, s * .09, s * .14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(s * .22, -s * .08, s * .09, s * .14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#1a0508";
      ctx.beginPath();
      ctx.moveTo(-s * .28, s * .28);
      for (let i = 0; i <= 8; i += 1) { const t = i / 8; ctx.lineTo(-s * .28 + t * s * .56, s * .28 + Math.sin(t * Math.PI * 6) * s * .05); }
      ctx.lineTo(s * .28, s * .42); ctx.lineTo(-s * .28, s * .42); ctx.closePath(); ctx.fill();
      ctx.restore();
    },
    render(dt) {
      const a = this.arena;
      if (!a) return;
      if (this.scareUntil && worldTime < this.scareUntil) { this.drawScare(); return; }

      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, "#050608");
      grad.addColorStop(1, "#0a0d10");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.fillStyle = "rgba(4,10,14,.9)";
      roundRect(ctx, a.x, a.y, a.w, a.h, 10); ctx.fill();
      ctx.strokeStyle = "rgba(60,80,70,.35)"; ctx.lineWidth = 2;
      for (let x = a.x; x < a.x + a.w; x += 34) { ctx.beginPath(); ctx.moveTo(x, a.y); ctx.lineTo(x, a.y + a.h); ctx.stroke(); }
      ctx.restore();

      ctx.save();
      for (const wall of this.walls) {
        ctx.fillStyle = "rgba(28,22,18,.92)";
        roundRect(ctx, wall.x, wall.y, wall.w, wall.h, 6); ctx.fill();
        ctx.strokeStyle = "rgba(80,60,42,.5)"; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.restore();

      for (const ember of this.embers) {
        if (ember.collected) continue;
        const pulse = 1 + Math.sin(worldTime * 3 + ember.phase) * .18;
        const glow = ctx.createRadialGradient(ember.x, ember.y, 0, ember.x, ember.y, 24 * pulse);
        glow.addColorStop(0, "rgba(255,214,120,.95)"); glow.addColorStop(1, "rgba(255,140,40,0)");
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(ember.x, ember.y, 24 * pulse, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff3d6";
        ctx.beginPath(); ctx.arc(ember.x, ember.y, 5, 0, Math.PI * 2); ctx.fill();
      }

      if (this.exit) {
        const pulse = 1 + Math.sin(worldTime * 4) * .12;
        const glow = ctx.createRadialGradient(this.exit.x, this.exit.y, 0, this.exit.x, this.exit.y, 40 * pulse);
        glow.addColorStop(0, "rgba(150,255,220,.85)"); glow.addColorStop(1, "rgba(80,255,200,0)");
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(this.exit.x, this.exit.y, 40 * pulse, 0, Math.PI * 2); ctx.fill();
      }

      const g = this.ghost;
      const distToGhost = Math.hypot(g.x - this.player.x, g.y - this.player.y);
      const angleToGhost = Math.atan2(g.y - this.player.y, g.x - this.player.x);
      let angleDiff = Math.abs(angleToGhost - this.facing);
      if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
      const ambientR = this.currentAmbientR();
      const coneR = this.currentConeR();
      const visible = distToGhost < ambientR * 1.15 || (distToGhost < coneR && angleDiff < .5);
      if (visible) this.drawGhost();

      ctx.save();
      ctx.translate(this.player.x, this.player.y);
      ctx.rotate(this.facing + Math.PI / 2);
      ctx.fillStyle = "#dfe9ea";
      ctx.beginPath(); ctx.ellipse(0, 2, 9, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffdf8c"; ctx.shadowColor = "#ffdf8c"; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(0, -13, 5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();

      this.drawDarkness(ambientR, coneR);

      const tension = g.mode === "hunt" ? .32 : Math.max(0, .18 - distToGhost / 2200);
      if (tension > .02) {
        const vg = ctx.createRadialGradient(width / 2, height / 2, height * .25, width / 2, height / 2, height * .75);
        vg.addColorStop(0, "rgba(120,0,10,0)"); vg.addColorStop(1, `rgba(120,0,10,${tension})`);
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, width, height);
      }

      this.drawBattery();
    },
  });

  // ---------- CORAL CLASH: LOCAL TWO PLAYER ----------
  gameFactories.clash = () => ({
    title: "CORAL CLASH",
    arena: null,
    fighters: null,
    timeLeft: 60,
    ended: false,
    start() {
      this.timeLeft = 60; this.ended = false;
      this.resize(true);
      setHud("P1 • P2", "100 : 100", this.timeLeft);
      setInstruction("Each player has move + STRIKE controls", true);
    },
    resize(reset = false) {
      const top = Math.max(205, height * .25);
      const bottom = Math.min(height - 130, height * .78);
      this.arena = { x: 18, y: top, w: width - 36, h: Math.max(185, bottom - top), ground: bottom - 24 };
      if (reset || !this.fighters) {
        this.fighters = [
          { id: 1, x: width * .28, health: 100, direction: 1, moveLeft: false, moveRight: false, attack: 0, cooldown: 0, hitDone: false, knock: 0, color: "blue" },
          { id: 2, x: width * .72, health: 100, direction: -1, moveLeft: false, moveRight: false, attack: 0, cooldown: 0, hitDone: false, knock: 0, color: "orange" },
        ];
      }
    },
    control(playerId, action, pressed) {
      if (this.ended) return;
      const f = this.fighters[playerId - 1];
      if (!f) return;
      if (action === "left") f.moveLeft = pressed;
      if (action === "right") f.moveRight = pressed;
      if (action === "attack" && pressed && f.cooldown <= 0) {
        f.attack = .28; f.cooldown = .48; f.hitDone = false;
        tone(playerId === 1 ? 330 : 260, .06, .024, "square", 80);
        haptic("tap");
      }
    },
    update(dt) {
      if (this.ended) return;
      this.timeLeft -= dt;
      const f1 = this.fighters[0], f2 = this.fighters[1];
      f1.direction = f1.x <= f2.x ? 1 : -1;
      f2.direction = f2.x <= f1.x ? 1 : -1;
      const speed = Math.max(115, Math.min(210, width * .42));
      for (const f of this.fighters) {
        f.cooldown = Math.max(0, f.cooldown - dt);
        f.attack = Math.max(0, f.attack - dt);
        let move = (f.moveRight ? 1 : 0) - (f.moveLeft ? 1 : 0);
        if (f.attack > .08) move *= .35;
        f.x += move * speed * dt + f.knock * dt;
        f.knock *= Math.pow(.86, dt * 60);
        f.x = Math.max(this.arena.x + 36, Math.min(this.arena.x + this.arena.w - 36, f.x));
      }
      const minGap = 58;
      const dx = f2.x - f1.x;
      if (Math.abs(dx) < minGap) {
        const push = (minGap - Math.abs(dx)) / 2;
        const dir = dx >= 0 ? 1 : -1;
        f1.x -= push * dir; f2.x += push * dir;
      }
      this.tryHit(f1, f2);
      this.tryHit(f2, f1);
      setHud("P1 • P2", `${Math.ceil(f1.health)} : ${Math.ceil(f2.health)}`, this.timeLeft);
      if (f1.health <= 0 || f2.health <= 0) this.finishMatch(f1.health <= 0 ? 2 : 1);
      else if (this.timeLeft <= 0) this.finishMatch(f1.health === f2.health ? 0 : (f1.health > f2.health ? 1 : 2));
    },
    tryHit(attacker, defender) {
      if (attacker.attack <= .08 || attacker.attack >= .22 || attacker.hitDone) return;
      attacker.hitDone = true;
      const distance = Math.abs(attacker.x - defender.x);
      const facingTarget = Math.sign(defender.x - attacker.x) === attacker.direction;
      if (distance > 105 || !facingTarget) return;
      defender.health = Math.max(0, defender.health - 12);
      defender.knock = attacker.direction * Math.max(170, width * .42);
      shakeTime = .18; flashTime = .055;
      burst(defender.x, this.arena.ground - 48, 15, "bad");
      tone(115, .11, .045, "sawtooth", -35);
      haptic("bad");
    },
    finishMatch(winner) {
      if (this.ended) return;
      this.ended = true;
      for (const f of this.fighters) { f.moveLeft = false; f.moveRight = false; }
      const f1 = this.fighters[0], f2 = this.fighters[1];
      const winnerName = winner === 1 ? "Blue fighter" : winner === 2 ? "Orange fighter" : "Draw";
      const score = winner === 0 ? 300 : 500 + Math.ceil((winner === 1 ? f1.health : f2.health) * 5);
      window.setTimeout(() => finishGame({
        score,
        coins: winner === 0 ? 4 : 8,
        xp: winner === 0 ? 14 : 26,
        eyebrow: winner === 0 ? "DRAW MATCH" : "KNOCKOUT",
        title: winner === 0 ? "The reef stands even!" : `${winnerName} wins!`,
        message: `Final health: Blue ${Math.ceil(f1.health)} – ${Math.ceil(f2.health)} Orange.`,
        scoreLabel: "BATTLE SCORE",
      }), 480);
    },
    render(dt) {
      drawOceanBackground(dt, "maze");
      if (!this.arena || !this.fighters) return;
      const a = this.arena;
      ctx.save();
      const g = ctx.createLinearGradient(0, a.y, 0, a.y + a.h);
      g.addColorStop(0, "rgba(4,63,86,.3)"); g.addColorStop(1, "rgba(3,28,43,.82)");
      ctx.fillStyle = g; ctx.strokeStyle = "rgba(116,229,242,.36)"; ctx.lineWidth = 2;
      roundRect(ctx, a.x, a.y, a.w, a.h, 26); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(20,99,79,.88)"; ctx.fillRect(a.x, a.ground, a.w, a.y + a.h - a.ground);
      for (let i = 0; i < 9; i += 1) {
        ctx.fillStyle = i % 2 ? "#1f776a" : "#176258";
        ctx.beginPath(); ctx.arc(a.x + (i + .5) * a.w / 9, a.ground + 4, 14 + (i % 3) * 4, Math.PI, 0); ctx.fill();
      }
      this.drawHealthBars();
      this.drawFighter(this.fighters[0]);
      this.drawFighter(this.fighters[1]);
      ctx.restore();
    },
    drawHealthBars() {
      const barW = Math.min(150, width * .34), barH = 12, y = this.arena.y + 16;
      const drawBar = (x, health, c1, c2, right = false) => {
        ctx.fillStyle = "rgba(0,15,28,.75)"; roundRect(ctx, x, y, barW, barH, 8); ctx.fill();
        const fill = barW * health / 100;
        const gx = right ? x + barW - fill : x;
        const grad = ctx.createLinearGradient(gx, 0, gx + fill, 0); grad.addColorStop(0, c1); grad.addColorStop(1, c2);
        ctx.fillStyle = grad; roundRect(ctx, gx, y, Math.max(1, fill), barH, 8); ctx.fill();
      };
      drawBar(this.arena.x + 14, this.fighters[0].health, "#12a5dc", "#58efff");
      drawBar(this.arena.x + this.arena.w - 14 - barW, this.fighters[1].health, "#ff543d", "#ffc13d", true);
      ctx.fillStyle = "white"; ctx.font = "900 10px system-ui"; ctx.textAlign = "left"; ctx.fillText("P1", this.arena.x + 14, y - 5); ctx.textAlign = "right"; ctx.fillText("P2", this.arena.x + this.arena.w - 14, y - 5);
    },
    drawFighter(f) {
      const y = this.arena.ground - 40;
      const attacking = f.attack > 0;
      ctx.save(); ctx.translate(f.x, y); ctx.scale(f.direction, 1);
      if (f.health <= 0) ctx.rotate(Math.PI / 2 * f.direction);
      const main = f.color === "blue" ? "#10bce8" : "#f26a39";
      const light = f.color === "blue" ? "#6ef2ff" : "#ffc34c";
      ctx.strokeStyle = light; ctx.lineWidth = 8; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-20, 16); ctx.lineTo(-32, 30); ctx.moveTo(20, 16); ctx.lineTo(32, 30); ctx.stroke();
      ctx.fillStyle = main; ctx.beginPath(); ctx.ellipse(0, 2, 31, 24, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = light; ctx.beginPath(); ctx.arc(-12, -20, 8, 0, Math.PI * 2); ctx.arc(12, -20, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#06243a"; ctx.beginPath(); ctx.arc(-10, -21, 3, 0, Math.PI * 2); ctx.arc(14, -21, 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = light; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.moveTo(22, -3); ctx.lineTo(attacking ? 62 : 43, attacking ? -6 : -20); ctx.stroke();
      ctx.fillStyle = light; ctx.beginPath(); ctx.arc(attacking ? 66 : 47, attacking ? -6 : -23, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = main; ctx.beginPath(); ctx.moveTo(attacking ? 64 : 45, attacking ? -18 : -35); ctx.lineTo(attacking ? 78 : 60, attacking ? -5 : -24); ctx.lineTo(attacking ? 63 : 45, attacking ? 6 : -12); ctx.closePath(); ctx.fill();
      ctx.restore();
    },
  });

  function shuffle(values) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function rectsOverlap(a, b, pad = 0) {
    return a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;
  }

  function pointInRect(px, py, rect, pad = 0) {
    return px > rect.x - pad && px < rect.x + rect.w + pad && py > rect.y - pad && py < rect.y + rect.h + pad;
  }

  function roundRect(context, x, y, w, h, radius) {
    const r = Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function handlePointerDown(event) {
    if (screenMode !== "game" || !currentGame) return;
    const { x, y } = canvasPoint(event);
    try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
    if (typeof currentGame.pointerDown === "function") {
      currentGame.pointerDown(event.pointerId, x, y, event);
      return;
    }
    pointerStart = { x, y, time: performance.now(), id: event.pointerId };
    if (currentGameId !== "maze") currentGame.tap?.(x, y);
  }

  function handlePointerMove(event) {
    if (screenMode !== "game" || !currentGame || typeof currentGame.pointerMove !== "function") return;
    const { x, y } = canvasPoint(event);
    currentGame.pointerMove(event.pointerId, x, y, event);
  }

  function handlePointerUp(event) {
    if (screenMode !== "game" || !currentGame) return;
    const { x, y } = canvasPoint(event);
    if (typeof currentGame.pointerUp === "function") currentGame.pointerUp(event.pointerId, x, y, event);
    if (currentGameId !== "maze" || !pointerStart || pointerStart.id !== event.pointerId) return;
    const dx = x - pointerStart.x;
    const dy = y - pointerStart.y;
    pointerStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    currentGame.move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
  }

  function handleKey(event) {
    if (screenMode !== "game" || !currentGame) return;
    const isDown = event.type === "keydown";
    if (isDown && currentGameId === "flappy" && ["Space", "ArrowUp"].includes(event.code)) { event.preventDefault(); currentGame.tap(); }
    if (isDown && currentGameId === "maze") {
      const directions = { ArrowUp: "up", ArrowRight: "right", ArrowDown: "down", ArrowLeft: "left", KeyW: "up", KeyD: "right", KeyS: "down", KeyA: "left" };
      if (directions[event.code]) { event.preventDefault(); currentGame.move(directions[event.code]); }
    }
    if (currentGameId === "ghost") {
      const moveKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"];
      if (moveKeys.includes(event.code)) { event.preventDefault(); currentGame.keyControl(event.code, isDown); }
    }
    if (currentGameId === "clash") {
      const down = isDown;
      const controls = {
        KeyA: [1, "left"], KeyD: [1, "right"], KeyF: [1, "attack"],
        ArrowLeft: [2, "left"], ArrowRight: [2, "right"], Slash: [2, "attack"], Enter: [2, "attack"],
      };
      const mapping = controls[event.code];
      if (mapping) { event.preventDefault(); currentGame.control(mapping[0], mapping[1], down); }
    }
  }

  function frame(now) {
    const dt = Math.min(.034, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    worldTime += dt;
    updateParticles(dt);
    if (shakeTime > 0) shakeTime = Math.max(0, shakeTime - dt);
    if (flashTime > 0) flashTime = Math.max(0, flashTime - dt);

    ctx.save();
    if (shakeTime > 0) ctx.translate((Math.random() - .5) * 12 * (shakeTime / .38), (Math.random() - .5) * 10 * (shakeTime / .38));
    if (screenMode === "game" || screenMode === "result") {
      if (screenMode === "game") currentGame?.update?.(dt);
      currentGame?.render?.(dt);
    } else {
      drawOceanBackground(dt);
    }
    drawParticles();
    if (flashTime > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flashTime * 2.5})`;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
    requestAnimationFrame(frame);
  }

  document.querySelectorAll("[data-game]").forEach((button) => button.addEventListener("click", () => launchGame(button.dataset.game)));
  backButton.addEventListener("click", showHub);
  $("arcadeButton").addEventListener("click", showHub);
  $("playAgainButton").addEventListener("click", () => currentGameId && launchGame(currentGameId));
  $("shareButton").addEventListener("click", shareCurrentScore);
  soundButton.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    soundButton.textContent = soundEnabled ? "🔊" : "🔇";
    soundButton.setAttribute("aria-label", soundEnabled ? "Mute sound" : "Enable sound");
    if (soundEnabled) tone(620, .06, .02, "sine", 80);
  });
  mazeControls.querySelectorAll("[data-dir]").forEach((button) => button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    currentGame?.move?.(button.dataset.dir);
  }));
  duelControls.querySelectorAll("[data-player][data-action]").forEach((button) => {
    const setPressed = (pressed, event) => {
      event?.preventDefault?.();
      button.classList.toggle("pressed", pressed);
      const player = Number(button.dataset.player);
      currentGame?.control?.(player, button.dataset.action, pressed);
    };
    button.addEventListener("pointerdown", (event) => {
      try { button.setPointerCapture(event.pointerId); } catch (_) {}
      setPressed(true, event);
    });
    button.addEventListener("pointerup", (event) => setPressed(false, event));
    button.addEventListener("pointercancel", (event) => setPressed(false, event));
    button.addEventListener("lostpointercapture", (event) => setPressed(false, event));
  });
  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", (event) => { currentGame?.pointerUp?.(event.pointerId); pointerStart = null; });
  window.addEventListener("keydown", handleKey, { passive: false });
  window.addEventListener("keyup", handleKey, { passive: false });
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => { lastTime = performance.now(); });

  resize();
  updateProfileUI();
  requestAnimationFrame(frame);
  window.setTimeout(() => {
    bootScreen.classList.add("leaving");
    window.setTimeout(() => {
      bootScreen.classList.add("hidden");
      showHub();
    }, 450);
  }, 1150);
})();
