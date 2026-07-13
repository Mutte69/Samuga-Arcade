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
      window.storage.setItem(testKey, "1");
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

  const defaultProfile = () => ({ coins: 0, xp: 0, bests: { flappy: 0, bubble: 0, maze: 0, memory: 0 } });
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
    cards: [], first: null, second: null, lockUntil: 0, timeLeft: 60, moves: 0, pairs: 0, rect: null, ended: false,
    start() {
      const icons = ["🐠", "🐙", "🐢", "🪼", "🦀", "🐬", "🐚", "⭐"];
      this.cards = shuffle([...icons, ...icons]).map((icon) => ({ icon, matched: false, flipped: false }));
      this.first = null; this.second = null; this.lockUntil = 0; this.timeLeft = 60; this.moves = 0; this.pairs = 0; this.ended = false;
      this.resize();
      setHud("PAIRS", "0/8", this.timeLeft);
      setInstruction("Match all eight ocean pairs", true);
    },
    resize() {
      const maxW = Math.min(width - 30, 500);
      const top = Math.max(165, height * .2);
      const availableH = Math.max(300, height - top - 42);
      const gap = Math.max(7, Math.min(11, width * .022));
      const cell = Math.min((maxW - gap * 3) / 4, (availableH - gap * 3) / 4);
      const boardW = cell * 4 + gap * 3;
      const boardH = boardW;
      this.rect = { x: (width - boardW) / 2, y: top + Math.max(0, (availableH - boardH) / 2), cell, gap, w: boardW, h: boardH };
    },
    tap(x, y) {
      if (this.ended || performance.now() < this.lockUntil || !this.rect) return;
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
        firstCard.matched = true; card.matched = true;
        this.pairs += 1;
        const center = this.cardCenter(index);
        burst(center.x, center.y, 18, "spark");
        tone(820, .08, .03, "triangle", 150);
        haptic("good");
        this.first = null; this.second = null;
        setHud("PAIRS", `${this.pairs}/8`, this.timeLeft);
        if (this.pairs === 8) this.complete();
      } else {
        this.lockUntil = performance.now() + 720;
      }
    },
    cardCenter(index) {
      const c = index % 4, r = Math.floor(index / 4);
      return { x: this.rect.x + c * (this.rect.cell + this.rect.gap) + this.rect.cell / 2, y: this.rect.y + r * (this.rect.cell + this.rect.gap) + this.rect.cell / 2 };
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
      this.timeLeft -= dt;
      if (this.second !== null && performance.now() >= this.lockUntil) {
        this.cards[this.first].flipped = false;
        this.cards[this.second].flipped = false;
        this.first = null; this.second = null; this.lockUntil = 0;
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
      if (!this.rect) return;
      const { x, y, cell, gap } = this.rect;
      ctx.save();
      for (let i = 0; i < this.cards.length; i += 1) {
        const c = i % 4, r = Math.floor(i / 4);
        const cx = x + c * (cell + gap), cy = y + r * (cell + gap);
        const card = this.cards[i];
        const revealed = card.flipped || card.matched;
        ctx.shadowColor = "rgba(0,0,0,.22)"; ctx.shadowBlur = 10; ctx.shadowOffsetY = 5;
        const g = ctx.createLinearGradient(cx, cy, cx + cell, cy + cell);
        if (revealed) { g.addColorStop(0, card.matched ? "#27b7a5" : "#20a8c9"); g.addColorStop(1, card.matched ? "#0c6d77" : "#07567e"); }
        else { g.addColorStop(0, "#0a4667"); g.addColorStop(1, "#031f3d"); }
        ctx.fillStyle = g; ctx.strokeStyle = revealed ? "rgba(148,247,255,.55)" : "rgba(101,214,236,.22)"; ctx.lineWidth = 2;
        roundRect(ctx, cx, cy, cell, cell, Math.max(11, cell * .16)); ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        if (revealed) {
          ctx.font = `${Math.max(25, cell * .48)}px system-ui`;
          ctx.fillText(card.icon, cx + cell / 2, cy + cell / 2 + 2);
        } else {
          ctx.fillStyle = "rgba(101,227,247,.55)";
          ctx.font = `900 ${Math.max(20, cell * .35)}px system-ui`;
          ctx.fillText("?", cx + cell / 2, cy + cell / 2 + 2);
        }
      }
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

  function handlePointerDown(event) {
    if (screenMode !== "game" || !currentGame) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    pointerStart = { x, y, time: performance.now() };
    if (currentGameId !== "maze") currentGame.tap?.(x, y);
  }

  function handlePointerUp(event) {
    if (screenMode !== "game" || currentGameId !== "maze" || !currentGame || !pointerStart) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const dx = x - pointerStart.x;
    const dy = y - pointerStart.y;
    pointerStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    currentGame.move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
  }

  function handleKey(event) {
    if (screenMode !== "game" || !currentGame) return;
    if (currentGameId === "flappy" && ["Space", "ArrowUp"].includes(event.code)) { event.preventDefault(); currentGame.tap(); }
    if (currentGameId === "maze") {
      const directions = { ArrowUp: "up", ArrowRight: "right", ArrowDown: "down", ArrowLeft: "left", KeyW: "up", KeyD: "right", KeyS: "down", KeyA: "left" };
      if (directions[event.code]) { event.preventDefault(); currentGame.move(directions[event.code]); }
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
  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", () => { pointerStart = null; });
  window.addEventListener("keydown", handleKey, { passive: false });
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
