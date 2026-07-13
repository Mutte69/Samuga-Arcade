(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const scoreEl = document.getElementById("score");
  const finalScoreEl = document.getElementById("finalScore");
  const bestScoreEl = document.getElementById("bestScore");
  const startScreen = document.getElementById("startScreen");
  const gameOverScreen = document.getElementById("gameOverScreen");
  const hud = document.getElementById("hud");
  const playButton = document.getElementById("playButton");
  const restartButton = document.getElementById("restartButton");
  const shareButton = document.getElementById("shareButton");
  const soundButton = document.getElementById("soundButton");
  const rotateNotice = document.getElementById("rotateNotice");

  const tg = window.Telegram?.WebApp ?? null;
  const telegramUser = tg?.initDataUnsafe?.user ?? null;
  const playerKey = telegramUser?.id ? `flappy-reef-best-${telegramUser.id}` : "flappy-reef-best-guest";

  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor("#061b2b");
      tg.setBackgroundColor("#061b2b");
      if (typeof tg.requestFullscreen === "function") {
        tg.requestFullscreen();
      }
      if (typeof tg.disableVerticalSwipes === "function") {
        tg.disableVerticalSwipes();
      }
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
  let worldSpeed = 188;
  let spawnTimer = 0;
  let nextSpawnIn = 1.55;
  let shakeTime = 0;
  let flashTime = 0;
  let soundEnabled = true;
  let audioContext = null;
  let bubbles = [];
  let pipes = [];
  let floorOffset = 0;

  const bird = {
    x: 0,
    y: 0,
    radius: 17,
    velocityY: 0,
    rotation: 0,
    wingPhase: 0,
  };

  function scaleFactor() {
    return Math.min(width / 390, height / 844);
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
      bird.x = width * 0.28;
      bird.y = height * 0.45;
    }

    createBubbles();
  }

  function createBubbles() {
    const count = Math.max(18, Math.floor((width * height) / 18000));
    bubbles = Array.from({ length: count }, (_, index) => ({
      x: (index * 83.7) % Math.max(width, 1),
      y: (index * 131.3) % Math.max(height, 1),
      r: 1 + ((index * 1.73) % 4),
      speed: 7 + ((index * 4.1) % 18),
      alpha: 0.08 + ((index * 0.071) % 0.19),
    }));
  }

  function haptic(type) {
    try {
      if (!tg?.HapticFeedback) return;
      if (type === "flap") tg.HapticFeedback.impactOccurred("light");
      if (type === "score") tg.HapticFeedback.impactOccurred("soft");
      if (type === "dead") tg.HapticFeedback.notificationOccurred("error");
    } catch (_) {
      // Haptics are optional.
    }
  }

  function ensureAudio() {
    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) audioContext = new AudioCtx();
    }
    if (audioContext?.state === "suspended") audioContext.resume().catch(() => {});
  }

  function tone(frequency, duration, volume = 0.04, type = "sine") {
    if (!soundEnabled) return;
    ensureAudio();
    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  function flapSound() {
    tone(520, 0.07, 0.026, "sine");
  }

  function scoreSound() {
    tone(740, 0.08, 0.04, "triangle");
    window.setTimeout(() => tone(980, 0.09, 0.03, "triangle"), 55);
  }

  function crashSound() {
    tone(120, 0.24, 0.065, "sawtooth");
  }

  function resetGame() {
    score = 0;
    elapsed = 0;
    worldSpeed = Math.max(175, width * 0.46);
    spawnTimer = 0;
    nextSpawnIn = 1.22;
    floorOffset = 0;
    pipes = [];
    bird.x = width * 0.28;
    bird.y = height * 0.45;
    bird.velocityY = 0;
    bird.rotation = 0;
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
    bird.velocityY = -Math.max(350, 435 * s);
    bird.rotation = -0.48;
    haptic("flap");
    flapSound();
  }

  function endGame() {
    if (state !== State.PLAYING) return;
    state = State.DEAD;
    shakeTime = 0.36;
    flashTime = 0.14;
    haptic("dead");
    crashSound();

    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem(playerKey, String(bestScore));
    }

    finalScoreEl.textContent = String(score);
    bestScoreEl.textContent = String(bestScore);

    window.setTimeout(() => {
      hud.classList.add("hidden");
      gameOverScreen.classList.remove("hidden");
    }, 420);
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
      width: Math.max(67, 76 * s),
      gapTop: center - gap / 2,
      gapBottom: center + gap / 2,
      scored: false,
      coralSeed: Math.random() * 100,
    });

    nextSpawnIn = Math.max(1.08, 1.48 - score * 0.006);
  }

  function update(dt) {
    elapsed += dt;

    for (const bubble of bubbles) {
      bubble.y -= bubble.speed * dt;
      bubble.x += Math.sin(elapsed + bubble.y * 0.01) * 2.8 * dt;
      if (bubble.y + bubble.r < 0) {
        bubble.y = height + bubble.r;
        bubble.x = Math.random() * width;
      }
    }

    if (shakeTime > 0) shakeTime = Math.max(0, shakeTime - dt);
    if (flashTime > 0) flashTime = Math.max(0, flashTime - dt);

    if (state === State.READY) {
      bird.y = height * 0.45 + Math.sin(elapsed * 3) * 8;
      bird.rotation = Math.sin(elapsed * 2.2) * 0.08;
      bird.wingPhase += dt * 8;
      return;
    }

    if (state !== State.PLAYING) return;

    const s = scaleFactor();
    const gravity = Math.max(980, 1260 * s);
    const floorHeight = Math.max(72, height * 0.095);

    bird.velocityY += gravity * dt;
    bird.y += bird.velocityY * dt;
    bird.rotation = Math.min(1.15, bird.rotation + dt * 2.55);
    bird.wingPhase += dt * (bird.velocityY < 0 ? 16 : 8);

    worldSpeed = Math.max(175, width * 0.46) + Math.min(115, score * 4.6);
    floorOffset = (floorOffset + worldSpeed * dt) % 46;

    spawnTimer += dt;
    if (spawnTimer >= nextSpawnIn) {
      spawnTimer = 0;
      spawnPipe();
    }

    const hitPadding = bird.radius * 0.23;
    const bx1 = bird.x - bird.radius + hitPadding;
    const bx2 = bird.x + bird.radius - hitPadding;
    const by1 = bird.y - bird.radius + hitPadding;
    const by2 = bird.y + bird.radius - hitPadding;

    for (const pipe of pipes) {
      pipe.x -= worldSpeed * dt;

      if (!pipe.scored && pipe.x + pipe.width < bird.x) {
        pipe.scored = true;
        score += 1;
        scoreEl.textContent = String(score);
        haptic("score");
        scoreSound();
      }

      const px1 = pipe.x;
      const px2 = pipe.x + pipe.width;
      const horizontalOverlap = bx2 > px1 && bx1 < px2;
      const verticalCollision = by1 < pipe.gapTop || by2 > pipe.gapBottom;

      if (horizontalOverlap && verticalCollision) {
        endGame();
        return;
      }
    }

    pipes = pipes.filter((pipe) => pipe.x + pipe.width > -30);

    if (bird.y - bird.radius <= 0 || bird.y + bird.radius >= height - floorHeight) {
      endGame();
    }
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

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#06324d");
    gradient.addColorStop(0.42, "#087c99");
    gradient.addColorStop(1, "#0dc5c5");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const sun = ctx.createRadialGradient(width * 0.72, height * 0.13, 5, width * 0.72, height * 0.13, width * 0.65);
    sun.addColorStop(0, "rgba(138, 244, 255, 0.30)");
    sun.addColorStop(0.34, "rgba(88, 224, 255, 0.12)");
    sun.addColorStop(1, "rgba(12, 63, 88, 0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = "#d9fbff";
    for (let i = -2; i < 9; i += 1) {
      ctx.beginPath();
      ctx.moveTo(width * 0.72, 0);
      ctx.lineTo(width * (i * 0.19) - 110, height * 0.88);
      ctx.lineTo(width * (i * 0.19) + 35, height * 0.88);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    for (const bubble of bubbles) {
      ctx.globalAlpha = bubble.alpha;
      ctx.strokeStyle = "#eaffff";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(bubble.x, bubble.y, bubble.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    drawDistantReef();
  }

  function drawDistantReef() {
    const base = height * 0.89;
    ctx.save();
    ctx.fillStyle = "rgba(1, 49, 65, 0.30)";
    ctx.beginPath();
    ctx.moveTo(0, base);
    for (let x = 0; x <= width + 40; x += 36) {
      const y = base - 19 - Math.sin(x * 0.032 + elapsed * 0.08) * 12 - ((x / 36) % 3) * 6;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawPipe(pipe) {
    const capHeight = 28;
    const bodyX = pipe.x + 8;
    const bodyWidth = pipe.width - 16;
    const topHeight = pipe.gapTop;
    const floorHeight = Math.max(72, height * 0.095);
    const bottomY = pipe.gapBottom;
    const bottomHeight = height - floorHeight - bottomY;

    drawCoralColumn(bodyX, -18, bodyWidth, topHeight + 18, false, pipe.coralSeed);
    drawCoralCap(pipe.x, pipe.gapTop - capHeight, pipe.width, capHeight, false);
    drawCoralColumn(bodyX, bottomY, bodyWidth, bottomHeight + 18, true, pipe.coralSeed + 4);
    drawCoralCap(pipe.x, bottomY, pipe.width, capHeight, true);
  }

  function drawCoralColumn(x, y, w, h, fromTop, seed) {
    if (h <= 0) return;
    const gradient = ctx.createLinearGradient(x, y, x + w, y);
    gradient.addColorStop(0, "#c72f76");
    gradient.addColorStop(0.48, "#f05b8f");
    gradient.addColorStop(1, "#9d205e");
    ctx.fillStyle = gradient;
    roundedRectPath(ctx, x, y, w, h, 12);
    ctx.fill();

    ctx.save();
    roundedRectPath(ctx, x, y, w, h, 12);
    ctx.clip();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#ffd4e5";
    ctx.fillRect(x + w * 0.16, y, w * 0.13, h);

    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#741345";
    for (let i = 0; i < Math.ceil(h / 35); i += 1) {
      const cy = y + 17 + i * 35;
      const cx = x + 12 + ((i * 23 + seed * 7) % Math.max(16, w - 24));
      ctx.beginPath();
      ctx.arc(cx, cy, 3 + ((i + seed) % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const tipY = fromTop ? y : y + h;
    ctx.fillStyle = "#f06a9b";
    for (let branch = 0; branch < 3; branch += 1) {
      const bx = x + w * (0.22 + branch * 0.28);
      const direction = fromTop ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(bx - 5, tipY);
      ctx.quadraticCurveTo(bx - 10, tipY + direction * 15, bx - 2, tipY + direction * 24);
      ctx.quadraticCurveTo(bx + 5, tipY + direction * 15, bx + 6, tipY);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawCoralCap(x, y, w, h, isBottom) {
    const gradient = ctx.createLinearGradient(x, y, x + w, y);
    gradient.addColorStop(0, "#ab2669");
    gradient.addColorStop(0.5, "#ff76a5");
    gradient.addColorStop(1, "#a51f61");
    ctx.fillStyle = gradient;
    roundedRectPath(ctx, x, y, w, h, 11);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 208, 226, 0.34)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const lineY = isBottom ? y + 6 : y + h - 6;
    ctx.moveTo(x + 12, lineY);
    ctx.lineTo(x + w - 12, lineY);
    ctx.stroke();
  }

  function drawBird() {
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.rotation);

    const wingLift = Math.sin(bird.wingPhase) * 5;

    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.beginPath();
    ctx.ellipse(-2, 7, 23, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    const bodyGradient = ctx.createLinearGradient(-20, -14, 23, 17);
    bodyGradient.addColorStop(0, "#fff476");
    bodyGradient.addColorStop(0.58, "#ffc63b");
    bodyGradient.addColorStop(1, "#f28b28");
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.ellipse(0, 0, 22, 17, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffde4e";
    ctx.beginPath();
    ctx.ellipse(-7, 8 + wingLift * 0.4, 12, 8, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(183, 102, 22, 0.45)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(10, -7, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#062333";
    ctx.beginPath();
    ctx.arc(13, -6, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(14, -7, 1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ff744c";
    ctx.beginPath();
    ctx.moveTo(18, -1);
    ctx.lineTo(34, 4);
    ctx.lineTo(18, 9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(116, 34, 22, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.33)";
    ctx.beginPath();
    ctx.ellipse(-7, -8, 9, 4, -0.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawFloor() {
    const floorHeight = Math.max(72, height * 0.095);
    const y = height - floorHeight;

    const sand = ctx.createLinearGradient(0, y, 0, height);
    sand.addColorStop(0, "#ffe28c");
    sand.addColorStop(1, "#df9e50");
    ctx.fillStyle = sand;
    ctx.fillRect(0, y, width, floorHeight);

    ctx.fillStyle = "rgba(255, 252, 210, 0.58)";
    ctx.fillRect(0, y, width, 5);

    ctx.save();
    ctx.globalAlpha = 0.38;
    for (let x = -floorOffset - 46; x < width + 46; x += 46) {
      ctx.fillStyle = "#b9753f";
      ctx.beginPath();
      ctx.ellipse(x + 18, y + 31, 4, 2.6, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + 36, y + 53, 6, 3, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function draw() {
    ctx.save();

    if (shakeTime > 0) {
      const intensity = 7 * (shakeTime / 0.36);
      ctx.translate((Math.random() - 0.5) * intensity, (Math.random() - 0.5) * intensity);
    }

    drawBackground();
    for (const pipe of pipes) drawPipe(pipe);
    drawBird();
    drawFloor();
    ctx.restore();

    if (flashTime > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.55, flashTime * 3.5)})`;
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

  playButton.addEventListener("click", (event) => {
    event.stopPropagation();
    startGame();
  });

  restartButton.addEventListener("click", (event) => {
    event.stopPropagation();
    startGame();
  });

  shareButton.addEventListener("click", (event) => {
    event.stopPropagation();
    shareScore();
  });

  soundButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleSound();
  });

  window.addEventListener("pointerdown", handlePrimaryAction, { passive: false });
  window.addEventListener("keydown", (event) => {
    if (["Space", "ArrowUp", "KeyW"].includes(event.code)) {
      event.preventDefault();
      if (state === State.READY || state === State.DEAD) startGame();
      else flap();
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

  bestScoreEl.textContent = String(bestScore);
  resize();
  resetGame();
  state = State.READY;
  requestAnimationFrame(frame);
})();
