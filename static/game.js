(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const canvas = $("gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const bootScreen = $("bootScreen");
  const scoreEl = $("score");
  const finalScoreEl = $("finalScore");
  const bestScoreEl = $("bestScore");
  const startScreen = $("startScreen");
  const gameOverScreen = $("gameOverScreen");
  const hud = $("hud");
  const playButton = $("playButton");
  const restartButton = $("restartButton");
  const shareButton = $("shareButton");
  const soundButton = $("soundButton");
  const rotateNotice = $("rotateNotice");
  const homeCoinsEl = $("homeCoins");
  const homeLevelEl = $("homeLevel");
  const homeBestEl = $("homeBest");
  const coinsEarnedEl = $("coinsEarned");
  const xpEarnedEl = $("xpEarned");
  const resultLevelEl = $("resultLevel");
  const xpFillEl = $("xpFill");
  const newBestBadge = $("newBestBadge");
  const resultTitle = $("resultTitle");

  const tg = window.Telegram?.WebApp ?? null;
  const telegramUser = tg?.initDataUnsafe?.user ?? null;
  const playerId = telegramUser?.id ?? "guest";
  const playerKey = `flappy-reef-best-${playerId}`;
  const coinsKey = `flappy-reef-coins-${playerId}`;
  const xpKey = `flappy-reef-xp-${playerId}`;

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

  const State = Object.freeze({ READY: "ready", PLAYING: "playing", DEAD: "dead", PAUSED: "paused" });
  let state = State.READY;
  let stateBeforePause = State.READY;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let lastTime = performance.now();
  let elapsed = 0;
  let score = 0;
  let bestScore = Number.parseInt(localStorage.getItem(playerKey) || "0", 10);
  let totalCoins = Number.parseInt(localStorage.getItem(coinsKey) || "0", 10);
  let totalXp = Number.parseInt(localStorage.getItem(xpKey) || "0", 10);
  let particles = [];
  let runWasBest = false;
  let worldSpeed = 188;
  let spawnTimer = 0;
  let nextSpawnIn = 1.55;
  let shakeTime = 0;
  let flashTime = 0;
  let soundEnabled = true;
  let audioContext = null;
  let ambientBubbles = [];
  let pipes = [];
  let floorOffset = 0;
  let reefOffset = 0;
  let distantFish = [];
  let jellyfish = [];
  let seaPlants = [];

  const fish = {
    x: 0,
    y: 0,
    radius: 18,
    velocityY: 0,
    rotation: 0,
    finPhase: 0,
    tailPhase: 0,
  };

  function scaleFactor() {
    return Math.min(width / 390, height / 844);
  }

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
    if (state !== State.PLAYING) {
      fish.x = width * 0.28;
      fish.y = height * 0.45;
    }

    createAmbientBubbles();
    createDistantLife();
    createSeaPlants();
  }

  function createAmbientBubbles() {
    const count = Math.max(24, Math.floor((width * height) / 14500));
    ambientBubbles = Array.from({ length: count }, (_, i) => ({
      x: pseudo(i + 1) * Math.max(width, 1),
      y: pseudo(i + 14) * Math.max(height, 1),
      r: 1 + pseudo(i + 32) * 4,
      speed: 8 + pseudo(i + 77) * 22,
      drift: 0.4 + pseudo(i + 122) * 1.4,
      alpha: 0.07 + pseudo(i + 200) * 0.2,
    }));
  }

  function createDistantLife() {
    const fishCount = Math.max(9, Math.floor(width / 58));
    distantFish = Array.from({ length: fishCount }, (_, i) => ({
      x: pseudo(i + 10) * width,
      y: height * (0.13 + pseudo(i + 34) * 0.58),
      speed: 7 + pseudo(i + 55) * 17,
      scale: 0.35 + pseudo(i + 72) * 0.62,
      phase: pseudo(i + 92) * Math.PI * 2,
      direction: pseudo(i + 105) > 0.5 ? 1 : -1,
      tone: pseudo(i + 131),
    }));

    const jellyCount = Math.max(4, Math.floor(width / 115));
    jellyfish = Array.from({ length: jellyCount }, (_, i) => ({
      x: pseudo(i + 300) * width,
      y: height * (0.19 + pseudo(i + 321) * 0.5),
      speed: 4 + pseudo(i + 345) * 9,
      scale: 0.48 + pseudo(i + 367) * 0.7,
      phase: pseudo(i + 388) * Math.PI * 2,
      alpha: 0.16 + pseudo(i + 404) * 0.16,
    }));
  }

  function createSeaPlants() {
    const count = Math.max(18, Math.floor(width / 25));
    seaPlants = Array.from({ length: count }, (_, i) => ({
      x: (i / count) * width + pseudo(i + 500) * 22,
      height: 14 + pseudo(i + 520) * 54,
      width: 3 + pseudo(i + 540) * 5,
      phase: pseudo(i + 560) * Math.PI * 2,
      color: pseudo(i + 580),
    }));
  }

  function haptic(type) {
    try {
      if (!tg?.HapticFeedback) return;
      if (type === "flap") tg.HapticFeedback.impactOccurred("light");
      if (type === "score") tg.HapticFeedback.impactOccurred("soft");
      if (type === "dead") tg.HapticFeedback.notificationOccurred("error");
    } catch (_) {
      // Optional.
    }
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

  function flapSound() { tone(430, 0.09, 0.025, "sine", 170); }
  function scoreSound() {
    tone(720, 0.08, 0.035, "triangle", 130);
    window.setTimeout(() => tone(980, 0.09, 0.028, "triangle", 90), 55);
  }
  function crashSound() { tone(135, 0.28, 0.06, "sawtooth", -75); }

  function levelFromXp(xp) { return Math.floor(Math.sqrt(xp / 20)) + 1; }
  function xpForLevel(level) { return Math.max(0, (level - 1) * (level - 1) * 20); }

  function updateProfileUi() {
    const level = levelFromXp(totalXp);
    const startXp = xpForLevel(level);
    const endXp = xpForLevel(level + 1);
    const progress = endXp > startXp ? ((totalXp - startXp) / (endXp - startXp)) * 100 : 0;
    homeCoinsEl.textContent = String(totalCoins);
    homeLevelEl.textContent = String(level);
    homeBestEl.textContent = String(bestScore);
    resultLevelEl.textContent = String(level);
    xpFillEl.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  }

  function burst(x, y, amount = 14, kind = "bubble") {
    for (let i = 0; i < amount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 42 + Math.random() * 155;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.45 + Math.random() * 0.45,
        maxLife: 0.9,
        size: 2 + Math.random() * 5,
        kind,
        hue: 175 + Math.random() * 65,
      });
    }
  }

  function resetGame() {
    score = 0;
    elapsed = 0;
    worldSpeed = Math.max(175, width * 0.46);
    spawnTimer = 0;
    nextSpawnIn = 1.22;
    floorOffset = 0;
    reefOffset = 0;
    pipes = [];
    particles = [];
    runWasBest = false;
    fish.x = width * 0.28;
    fish.y = height * 0.45;
    fish.velocityY = 0;
    fish.rotation = 0;
    scoreEl.textContent = "0";
  }

  function startGame() {
    resetGame();
    state = State.PLAYING;
    startScreen.classList.add("hidden");
    gameOverScreen.classList.add("hidden");
    hud.classList.remove("hidden");
    lastTime = performance.now();
    flap();
  }

  function flap() {
    if (state !== State.PLAYING) return;
    const s = scaleFactor();
    fish.velocityY = -Math.max(350, 435 * s);
    fish.rotation = -0.42;
    haptic("flap");
    flapSound();
    burst(fish.x - fish.radius * 1.15, fish.y + 4, 5, "bubble");
  }

  function endGame() {
    if (state !== State.PLAYING) return;
    state = State.DEAD;
    shakeTime = 0.38;
    flashTime = 0.14;
    haptic("dead");
    crashSound();

    runWasBest = score > bestScore;
    if (runWasBest) {
      bestScore = score;
      localStorage.setItem(playerKey, String(bestScore));
    }

    const coinsEarned = Math.max(1, Math.floor(score / 2) + (runWasBest ? 3 : 0));
    const xpEarned = Math.max(2, score * 3 + (runWasBest ? 10 : 0));
    totalCoins += coinsEarned;
    totalXp += xpEarned;
    localStorage.setItem(coinsKey, String(totalCoins));
    localStorage.setItem(xpKey, String(totalXp));

    coinsEarnedEl.textContent = String(coinsEarned);
    xpEarnedEl.textContent = String(xpEarned);
    newBestBadge.classList.toggle("hidden", !runWasBest);
    resultTitle.textContent = score >= 30 ? "Ocean legend!" : score >= 20 ? "Reef master!" : score >= 10 ? "Great swim!" : "Nice swim!";
    finalScoreEl.textContent = String(score);
    bestScoreEl.textContent = String(bestScore);
    updateProfileUi();
    burst(fish.x, fish.y, 30, "spark");

    window.setTimeout(() => {
      hud.classList.add("hidden");
      gameOverScreen.classList.remove("hidden");
    }, 430);
  }

  function spawnPipe() {
    const s = scaleFactor();
    const floorHeight = Math.max(72, height * 0.095);
    const topSafe = Math.max(105, height * 0.13);
    const bottomSafe = floorHeight + Math.max(80, height * 0.08);
    const gap = Math.max(150, Math.min(205, height * (0.235 - Math.min(score, 25) * 0.0016)));
    const minimumCenter = topSafe + gap / 2;
    const maximumCenter = height - bottomSafe - gap / 2;
    const wave = Math.sin(elapsed * 1.31 + pipes.length * 2.4);
    const randomCenter = minimumCenter + Math.random() * Math.max(1, maximumCenter - minimumCenter);
    const center = randomCenter * 0.76 + (height * 0.48 + wave * height * 0.09) * 0.24;

    pipes.push({
      x: width + Math.max(42, width * 0.08),
      width: Math.max(70, 80 * s),
      gapTop: center - gap / 2,
      gapBottom: center + gap / 2,
      scored: false,
      seed: Math.random() * 1000,
    });
    nextSpawnIn = Math.max(1.08, 1.48 - score * 0.006);
  }

  function updateAmbient(dt) {
    for (const bubble of ambientBubbles) {
      bubble.y -= bubble.speed * dt;
      bubble.x += Math.sin(elapsed * bubble.drift + bubble.y * 0.01) * 3 * dt;
      if (bubble.y + bubble.r < 0) {
        bubble.y = height + bubble.r;
        bubble.x = Math.random() * width;
      }
    }

    const ambientScroll = state === State.PLAYING ? worldSpeed * 0.08 : 7;
    for (const f of distantFish) {
      f.x += f.direction * (f.speed + ambientScroll) * dt;
      f.y += Math.sin(elapsed * 0.8 + f.phase) * 2.1 * dt;
      if (f.direction > 0 && f.x > width + 35) f.x = -35;
      if (f.direction < 0 && f.x < -35) f.x = width + 35;
    }

    for (const jelly of jellyfish) {
      jelly.x -= (jelly.speed + ambientScroll * 0.35) * dt;
      jelly.y += Math.sin(elapsed * 1.1 + jelly.phase) * 3.3 * dt;
      if (jelly.x < -45) {
        jelly.x = width + 45 + Math.random() * 80;
        jelly.y = height * (0.18 + Math.random() * 0.5);
      }
    }
  }

  function update(dt) {
    elapsed += dt;
    updateAmbient(dt);

    if (shakeTime > 0) shakeTime = Math.max(0, shakeTime - dt);
    if (flashTime > 0) flashTime = Math.max(0, flashTime - dt);

    if (state === State.READY) {
      fish.y = height * 0.45 + Math.sin(elapsed * 2.8) * 8;
      fish.rotation = Math.sin(elapsed * 2.1) * 0.055;
      fish.finPhase += dt * 8;
      fish.tailPhase += dt * 11;
    }

    for (const particle of particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += (particle.kind === "bubble" ? -36 : 240) * dt;
      particle.vx *= 0.985;
    }
    particles = particles.filter((particle) => particle.life > 0);

    if (state !== State.PLAYING) return;

    const s = scaleFactor();
    const gravity = Math.max(980, 1260 * s);
    const floorHeight = Math.max(72, height * 0.095);

    fish.velocityY += gravity * dt;
    fish.y += fish.velocityY * dt;
    fish.rotation = Math.min(1.06, fish.rotation + dt * 2.35);
    fish.finPhase += dt * (fish.velocityY < 0 ? 18 : 10);
    fish.tailPhase += dt * (16 + Math.min(8, Math.abs(fish.velocityY) * 0.015));

    worldSpeed = Math.max(175, width * 0.46) + Math.min(115, score * 4.6);
    floorOffset = (floorOffset + worldSpeed * dt) % 46;
    reefOffset = (reefOffset + worldSpeed * dt * 0.16) % 180;

    spawnTimer += dt;
    if (spawnTimer >= nextSpawnIn) {
      spawnTimer = 0;
      spawnPipe();
    }

    const hitPadding = fish.radius * 0.28;
    const bx1 = fish.x - fish.radius + hitPadding;
    const bx2 = fish.x + fish.radius - hitPadding;
    const by1 = fish.y - fish.radius + hitPadding;
    const by2 = fish.y + fish.radius - hitPadding;

    for (const pipe of pipes) {
      pipe.x -= worldSpeed * dt;

      if (!pipe.scored && pipe.x + pipe.width < fish.x) {
        pipe.scored = true;
        score += 1;
        scoreEl.textContent = String(score);
        haptic("score");
        scoreSound();
        burst(pipe.x + pipe.width / 2, (pipe.gapTop + pipe.gapBottom) / 2, 12, "spark");
      }

      const horizontalOverlap = bx2 > pipe.x && bx1 < pipe.x + pipe.width;
      const verticalCollision = by1 < pipe.gapTop || by2 > pipe.gapBottom;
      if (horizontalOverlap && verticalCollision) {
        endGame();
        return;
      }
    }

    pipes = pipes.filter((pipe) => pipe.x + pipe.width > -35);
    if (fish.y - fish.radius <= 0 || fish.y + fish.radius >= height - floorHeight) endGame();
  }

  function roundedRectPath(context, x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function drawWater() {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#052d50");
    gradient.addColorStop(0.36, "#086e98");
    gradient.addColorStop(0.72, "#0a9fb0");
    gradient.addColorStop(1, "#075f78");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(width * 0.64, -height * 0.03, 4, width * 0.64, 0, width * 0.72);
    glow.addColorStop(0, "rgba(194, 252, 255, .42)");
    glow.addColorStop(0.28, "rgba(96, 232, 255, .17)");
    glow.addColorStop(1, "rgba(10, 73, 104, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#e4feff";
    for (let i = -3; i < 10; i += 1) {
      const sway = Math.sin(elapsed * 0.15 + i) * 26;
      ctx.beginPath();
      ctx.moveTo(width * 0.64 + sway, -20);
      ctx.lineTo(width * (i * 0.17) - 110, height * 0.91);
      ctx.lineTo(width * (i * 0.17) + 30, height * 0.91);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDistantFish(f) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(f.direction * f.scale, f.scale);
    const wobble = Math.sin(elapsed * 5 + f.phase) * 0.15;
    ctx.rotate(wobble);
    ctx.globalAlpha = 0.12 + f.scale * 0.08;
    const color = f.tone > 0.66 ? "#b5efff" : f.tone > 0.33 ? "#5fcbd9" : "#123e5e";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(-23, -8);
    ctx.lineTo(-21, 0);
    ctx.lineTo(-23, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawJellyfish(jelly) {
    ctx.save();
    ctx.translate(jelly.x, jelly.y);
    ctx.scale(jelly.scale, jelly.scale);
    ctx.globalAlpha = jelly.alpha;
    const pulse = 1 + Math.sin(elapsed * 2.5 + jelly.phase) * 0.08;
    ctx.scale(pulse, 1 / pulse);
    const dome = ctx.createLinearGradient(0, -14, 0, 9);
    dome.addColorStop(0, "#f1d9ff");
    dome.addColorStop(1, "#7d7ee8");
    ctx.fillStyle = dome;
    ctx.beginPath();
    ctx.arc(0, 0, 14, Math.PI, 0);
    ctx.quadraticCurveTo(9, 11, 0, 6);
    ctx.quadraticCurveTo(-9, 11, -14, 0);
    ctx.fill();
    ctx.strokeStyle = "#d9d5ff";
    ctx.lineWidth = 1.5;
    for (let i = -2; i <= 2; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * 5, 5);
      ctx.bezierCurveTo(i * 6 + Math.sin(elapsed * 2 + i) * 4, 13, i * 3, 20, i * 5 + Math.cos(elapsed * 2 + i) * 3, 29);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFarReef() {
    const base = height * 0.9;
    ctx.save();
    ctx.fillStyle = "rgba(2, 45, 67, .48)";
    ctx.beginPath();
    ctx.moveTo(0, base);
    for (let x = -reefOffset; x <= width + 190; x += 45) {
      const y = base - 15 - Math.sin((x + reefOffset) * 0.035) * 13 - ((Math.floor((x + reefOffset) / 45)) % 3) * 7;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.48;
    ctx.fillStyle = "#073e57";
    for (let x = -reefOffset * 0.7 - 80; x < width + 100; x += 90) {
      const h = 28 + pseudo(x * 0.03) * 55;
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.quadraticCurveTo(x - 8, base - h * 0.45, x + 3, base - h);
      ctx.quadraticCurveTo(x + 13, base - h * 0.56, x + 16, base);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 11, base - h * 0.42);
      ctx.quadraticCurveTo(x + 27, base - h * 0.55, x + 30, base - h * 0.75);
      ctx.quadraticCurveTo(x + 33, base - h * 0.48, x + 20, base - h * 0.31);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawAmbient() {
    for (const f of distantFish) drawDistantFish(f);
    for (const jelly of jellyfish) drawJellyfish(jelly);

    ctx.save();
    for (const bubble of ambientBubbles) {
      ctx.globalAlpha = bubble.alpha;
      ctx.strokeStyle = "#e6ffff";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(bubble.x, bubble.y, bubble.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = bubble.alpha * 0.7;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(bubble.x - bubble.r * 0.3, bubble.y - bubble.r * 0.35, Math.max(0.5, bubble.r * 0.18), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBackground() {
    drawWater();
    drawDistantFishLayer();
    drawFarReef();
    drawAmbient();
  }

  function drawDistantFishLayer() {
    // A few schools are drawn before the reef so they feel very far away.
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = "#d7faff";
    for (let school = 0; school < 3; school += 1) {
      const sx = ((elapsed * (4 + school * 1.5) + school * width * 0.39) % (width + 180)) - 90;
      const sy = height * (0.17 + school * 0.14);
      for (let i = 0; i < 5; i += 1) {
        const x = sx + i * 18;
        const y = sy + Math.sin(i * 1.8 + elapsed) * 5;
        ctx.beginPath();
        ctx.ellipse(x, y, 6, 2.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawRockTexture(x, y, w, h, seed) {
    ctx.save();
    roundedRectPath(ctx, x, y, w, h, 10);
    ctx.clip();

    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, "#194f61");
    g.addColorStop(0.48, "#2a7780");
    g.addColorStop(1, "#123c52");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);

    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#9dd8c9";
    ctx.fillRect(x + w * 0.16, y, w * 0.12, h);

    for (let i = 0; i < Math.ceil(h / 28) + 3; i += 1) {
      const px = x + 7 + pseudo(seed + i * 13) * Math.max(8, w - 14);
      const py = y + pseudo(seed + i * 31) * h;
      const r = 2 + pseudo(seed + i * 61) * 4;
      ctx.globalAlpha = 0.18 + pseudo(seed + i * 8) * 0.2;
      ctx.fillStyle = pseudo(seed + i * 21) > 0.45 ? "#082e42" : "#74a98f";
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = "#092f40";
    ctx.lineWidth = 1.3;
    for (let yLine = y + 21; yLine < y + h; yLine += 37) {
      ctx.beginPath();
      ctx.moveTo(x + 4, yLine + Math.sin(seed + yLine) * 3);
      ctx.lineTo(x + w - 4, yLine + Math.cos(seed + yLine * 0.4) * 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawStarfish(x, y, radius, rotation, color = "#ff8b3d") {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(91, 37, 19, .35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = -Math.PI / 2 + (Math.PI * i) / 5;
      const r = i % 2 === 0 ? radius : radius * 0.42;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawCoralSprig(x, y, direction, scale, color, phase = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, direction * scale);
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(Math.sin(elapsed + phase) * 2, -12, 0, -25);
    ctx.moveTo(0, -12);
    ctx.quadraticCurveTo(-9, -15, -11, -24);
    ctx.moveTo(0, -17);
    ctx.quadraticCurveTo(9, -18, 11, -28);
    ctx.stroke();
    ctx.restore();
  }

  function drawReefColumn(pipe) {
    const capHeight = 27;
    const bodyX = pipe.x + 7;
    const bodyWidth = pipe.width - 14;
    const floorHeight = Math.max(72, height * 0.095);
    const topHeight = pipe.gapTop;
    const bottomY = pipe.gapBottom;
    const bottomHeight = height - floorHeight - bottomY;

    drawRockTexture(bodyX, -16, bodyWidth, topHeight + 16, pipe.seed);
    drawColumnCap(pipe.x, pipe.gapTop - capHeight, pipe.width, capHeight, false, pipe.seed);
    drawRockTexture(bodyX, bottomY, bodyWidth, bottomHeight + 18, pipe.seed + 10);
    drawColumnCap(pipe.x, bottomY, pipe.width, capHeight, true, pipe.seed + 20);

    const topStarY = Math.max(38, pipe.gapTop * (0.38 + pseudo(pipe.seed) * 0.35));
    drawStarfish(bodyX + bodyWidth * (0.38 + pseudo(pipe.seed + 1) * 0.32), topStarY, 7, pipe.seed);
    if (bottomHeight > 80) {
      drawStarfish(bodyX + bodyWidth * (0.3 + pseudo(pipe.seed + 4) * 0.35), bottomY + Math.min(bottomHeight - 30, 44 + pseudo(pipe.seed + 5) * 65), 7, pipe.seed * 0.4, "#f6bf43");
    }

    drawCoralSprig(pipe.x + pipe.width * 0.22, pipe.gapTop - 3, -1, 0.7, "#ff5f65", pipe.seed);
    drawCoralSprig(pipe.x + pipe.width * 0.72, pipe.gapTop - 2, -1, 0.55, "#b966db", pipe.seed + 2);
    drawCoralSprig(pipe.x + pipe.width * 0.25, bottomY + 3, 1, 0.68, "#ff855b", pipe.seed + 4);
    drawCoralSprig(pipe.x + pipe.width * 0.73, bottomY + 3, 1, 0.55, "#54d697", pipe.seed + 6);
  }

  function drawColumnCap(x, y, w, h, bottom, seed) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, "#153f54");
    g.addColorStop(0.48, "#3c8b88");
    g.addColorStop(1, "#0d3449");
    ctx.fillStyle = g;
    roundedRectPath(ctx, x, y, w, h, 10);
    ctx.fill();

    ctx.strokeStyle = "rgba(180, 240, 221, .28)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const lineY = bottom ? y + 6 : y + h - 6;
    ctx.moveTo(x + 10, lineY);
    ctx.lineTo(x + w - 10, lineY);
    ctx.stroke();

    ctx.globalAlpha = 0.65;
    ctx.fillStyle = "#64b87d";
    for (let i = 0; i < 4; i += 1) {
      const cx = x + 10 + pseudo(seed + i * 12) * (w - 20);
      const cy = bottom ? y + 2 + pseudo(seed + i) * 8 : y + h - 10 + pseudo(seed + i) * 8;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 5 + pseudo(seed + i * 3) * 5, 2.4, pseudo(seed + i) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFish() {
    ctx.save();
    ctx.translate(fish.x, fish.y);
    ctx.rotate(fish.rotation);
    const s = Math.max(0.84, scaleFactor());
    ctx.scale(s, s);

    const tailWave = Math.sin(fish.tailPhase) * 0.16;
    const finWave = Math.sin(fish.finPhase) * 0.22;

    ctx.save();
    ctx.translate(-18, 0);
    ctx.rotate(tailWave);
    const tailGradient = ctx.createLinearGradient(-22, -15, 2, 15);
    tailGradient.addColorStop(0, "#ffb433");
    tailGradient.addColorStop(1, "#e84c21");
    ctx.fillStyle = tailGradient;
    ctx.strokeStyle = "rgba(91, 38, 15, .46)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-17, -18, -24, -15);
    ctx.quadraticCurveTo(-19, 0, -24, 15);
    ctx.quadraticCurveTo(-16, 18, 0, 0);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "rgba(0,0,0,.17)";
    ctx.beginPath();
    ctx.ellipse(1, 7, 24, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createLinearGradient(-20, -15, 24, 17);
    body.addColorStop(0, "#ffb433");
    body.addColorStop(0.52, "#ff7b24");
    body.addColorStop(1, "#e74b20");
    ctx.fillStyle = body;
    ctx.strokeStyle = "rgba(91, 38, 15, .48)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 24, 16.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, 23.2, 15.7, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "rgba(255,255,255,.93)";
    ctx.fillRect(-12, -18, 7, 36);
    ctx.fillRect(6, -18, 7, 36);
    ctx.fillStyle = "rgba(15,42,51,.12)";
    ctx.fillRect(-7, -18, 2, 36);
    ctx.fillRect(11, -18, 2, 36);
    ctx.restore();

    ctx.save();
    ctx.translate(-2, 8);
    ctx.rotate(0.2 + finWave);
    ctx.fillStyle = "#f45b20";
    ctx.beginPath();
    ctx.ellipse(-2, 4, 10, 5, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(-2, -12);
    ctx.rotate(-0.16 - finWave * 0.5);
    ctx.fillStyle = "#ff9c29";
    ctx.beginPath();
    ctx.moveTo(-7, 3);
    ctx.quadraticCurveTo(0, -12, 9, 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(15, -6, 7.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#052134";
    ctx.beginPath();
    ctx.arc(17.2, -5.7, 3.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(18.2, -6.8, 1, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#7e3018";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(19, 2, 5, 0.35, 1.65);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,.24)";
    ctx.beginPath();
    ctx.ellipse(-4, -8.5, 10, 3.4, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    for (const p of particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      if (p.kind === "bubble") {
        ctx.strokeStyle = "#eaffff";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = `hsl(${p.hue} 90% 68%)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawForegroundReef(y) {
    ctx.save();
    for (const plant of seaPlants) {
      const sway = Math.sin(elapsed * 1.5 + plant.phase) * 4;
      const x = plant.x - (reefOffset * 1.7) % width;
      for (const wrap of [x, x + width]) {
        ctx.strokeStyle = plant.color > 0.66 ? "#3aa676" : plant.color > 0.33 ? "#1d7d68" : "#5c7d53";
        ctx.lineWidth = plant.width;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(wrap, y + 7);
        ctx.quadraticCurveTo(wrap + sway, y - plant.height * 0.55, wrap + sway * 0.45, y - plant.height);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawFloor() {
    const floorHeight = Math.max(72, height * 0.095);
    const y = height - floorHeight;

    drawForegroundReef(y + 4);

    const sand = ctx.createLinearGradient(0, y, 0, height);
    sand.addColorStop(0, "#f8d889");
    sand.addColorStop(0.45, "#dfa95c");
    sand.addColorStop(1, "#af7445");
    ctx.fillStyle = sand;
    ctx.fillRect(0, y, width, floorHeight);

    ctx.fillStyle = "rgba(255, 250, 202, .62)";
    ctx.fillRect(0, y, width, 4);

    ctx.save();
    ctx.globalAlpha = 0.45;
    for (let x = -floorOffset - 46; x < width + 46; x += 46) {
      ctx.fillStyle = "#8d5a3d";
      ctx.beginPath();
      ctx.ellipse(x + 18, y + 28, 4, 2.5, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + 37, y + 51, 6, 3, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    for (let x = -reefOffset * 2 - 90; x < width + 100; x += 185) {
      ctx.fillStyle = "#466a69";
      ctx.beginPath();
      ctx.ellipse(x + 40, y + 9, 23, 10, -0.12, 0, Math.PI * 2);
      ctx.fill();
      drawCoralSprig(x + 25, y + 3, -1, 0.55, "#e75c72", x);
      drawCoralSprig(x + 55, y + 4, -1, 0.43, "#8b65cc", x + 3);
    }
  }

  function draw() {
    ctx.save();
    if (shakeTime > 0) {
      const intensity = 8 * (shakeTime / 0.38);
      ctx.translate((Math.random() - 0.5) * intensity, (Math.random() - 0.5) * intensity);
    }

    drawBackground();
    for (const pipe of pipes) drawReefColumn(pipe);
    drawFish();
    drawParticles();
    drawFloor();
    ctx.restore();

    if (flashTime > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.55, flashTime * 3.5)})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  function frame(now) {
    const rawDt = (now - lastTime) / 1000;
    const dt = Math.min(0.033, Math.max(0, rawDt));
    lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function handlePrimaryAction(event) {
    if (event?.target instanceof HTMLElement && event.target.closest("button")) return;
    event?.preventDefault?.();
    if (state === State.READY) startGame();
    else if (state === State.PLAYING) flap();
  }

  function shareScore() {
    const text = `I scored ${score} in Flappy Reef 🐠 Can you beat me?`;
    const url = window.location.href.split("#")[0];
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    if (tg?.openTelegramLink) tg.openTelegramLink(shareUrl);
    else window.open(shareUrl, "_blank", "noopener,noreferrer");
  }

  function toggleSound() {
    soundEnabled = !soundEnabled;
    soundButton.textContent = soundEnabled ? "🔊" : "🔇";
    soundButton.setAttribute("aria-label", soundEnabled ? "Mute sound" : "Enable sound");
    if (soundEnabled) tone(620, 0.06, 0.03, "sine");
  }

  playButton.addEventListener("click", (event) => { event.stopPropagation(); startGame(); });
  restartButton.addEventListener("click", (event) => { event.stopPropagation(); startGame(); });
  shareButton.addEventListener("click", (event) => { event.stopPropagation(); shareScore(); });
  soundButton.addEventListener("click", (event) => { event.stopPropagation(); toggleSound(); });

  window.addEventListener("pointerdown", handlePrimaryAction, { passive: false });
  window.addEventListener("keydown", (event) => {
    if (["Space", "ArrowUp", "KeyW"].includes(event.code)) {
      event.preventDefault();
      if (state === State.READY || state === State.DEAD) startGame(); else flap();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stateBeforePause = state;
      if (state === State.PLAYING) state = State.PAUSED;
    } else if (state === State.PAUSED) {
      state = stateBeforePause === State.PLAYING ? State.PLAYING : stateBeforePause;
      lastTime = performance.now();
    }
  });

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => window.setTimeout(resize, 120));

  function finishBoot() {
    window.setTimeout(() => {
      bootScreen.classList.add("leaving");
      window.setTimeout(() => {
        bootScreen.classList.add("hidden");
        startScreen.classList.remove("hidden");
      }, 460);
    }, 1150);
  }

  bestScoreEl.textContent = String(bestScore);
  updateProfileUi();
  resize();
  resetGame();
  state = State.READY;
  requestAnimationFrame(frame);
  if (document.readyState === "complete") finishBoot(); else window.addEventListener("load", finishBoot, { once: true });
})();
