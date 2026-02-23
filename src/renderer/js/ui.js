const { ipcRenderer } = require('electron');

// --- 1) DOM ---
const btnOpen = document.getElementById('btn-open');
const statusText = document.getElementById('status-text');
const canvas = document.getElementById('radar-canvas');
const ctx = canvas.getContext('2d');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');

const defaultOpenButtonText = btnOpen.innerText;

// --- 2) de_mirage radar metadata ---
const MIRAGE_RADAR_META = {
  pos_x: -3230,
  pos_y: 1713,
  scale: 5.0,
  size: 1024
};

const RADAR_IMAGE_PATH = 'assets/maps/de_mirage.png';
const PLAYBACK_INTERVAL_MS = 125; // ~8 FPS

const radarImg = new Image();
let radarImageReady = false;
let radarImageFailed = false;

radarImg.onload = () => {
  radarImageReady = true;
  radarImageFailed = false;
};

radarImg.onerror = () => {
  radarImageReady = false;
  radarImageFailed = true;
  console.warn(`[Radar] Failed to load map image: ${RADAR_IMAGE_PATH}`);
};

radarImg.src = RADAR_IMAGE_PATH;

// --- 3) Playback state ---
let framesData = [];
let currentFrameIndex = 0;
let isPlaying = false;
let isUserScrubbing = false;
let playbackTimerId = null;
let animationRequestId = null;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clearPlaybackLoopHandles() {
  if (playbackTimerId !== null) {
    clearTimeout(playbackTimerId);
    playbackTimerId = null;
  }

  if (animationRequestId !== null) {
    cancelAnimationFrame(animationRequestId);
    animationRequestId = null;
  }
}

function pausePlayback() {
  isPlaying = false;
  clearPlaybackLoopHandles();
}

function resumePlayback() {
  if (!framesData.length) {
    return;
  }

  if (isPlaying) {
    return;
  }

  isPlaying = true;
  scheduleNextFrame();
}

function scheduleNextFrame() {
  if (!isPlaying || isUserScrubbing) {
    return;
  }

  clearPlaybackLoopHandles();

  playbackTimerId = setTimeout(() => {
    playbackTimerId = null;
    animationRequestId = requestAnimationFrame(() => {
      animationRequestId = null;
      playNextFrame();
    });
  }, PLAYBACK_INTERVAL_MS);
}

function setupProgressBar(totalFrames) {
  const maxFrameIndex = Math.max(totalFrames - 1, 0);

  progressBar.min = '0';
  progressBar.max = String(maxFrameIndex);
  progressBar.value = '0';
  progressBar.step = '1';
  progressBar.disabled = totalFrames === 0;

  progressText.innerText = totalFrames > 0 ? `1/${totalFrames}` : '0/0';
}

function updateProgressBar(frameIndex) {
  if (!framesData.length) {
    progressBar.value = '0';
    progressText.innerText = '0/0';
    return;
  }

  const safeIndex = clamp(frameIndex, 0, framesData.length - 1);
  progressBar.value = String(safeIndex);
  progressText.innerText = `${safeIndex + 1}/${framesData.length}`;
}

function worldToCanvas(gameX, gameY, scaleX, scaleY) {
  // CS2 world -> 1024x1024 radar pixels
  const pixelX = (gameX - MIRAGE_RADAR_META.pos_x) / MIRAGE_RADAR_META.scale;
  const pixelY = (MIRAGE_RADAR_META.pos_y - gameY) / MIRAGE_RADAR_META.scale;

  // Radar pixels -> current canvas pixels
  return {
    x: pixelX * scaleX,
    y: pixelY * scaleY
  };
}

function drawFallbackBackground() {
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (radarImageFailed) {
    ctx.fillStyle = '#888';
    ctx.font = '14px Segoe UI';
    ctx.fillText(`Radar image missing: ${RADAR_IMAGE_PATH}`, 16, 26);
  }
}

function drawRadarBackground() {
  if (radarImageReady && radarImg.naturalWidth > 0 && radarImg.naturalHeight > 0) {
    try {
      ctx.drawImage(radarImg, 0, 0, canvas.width, canvas.height);
      return;
    } catch (err) {
      radarImageReady = false;
      radarImageFailed = true;
      console.warn(`[Radar] drawImage failed, fallback enabled: ${err.message}`);
    }
  }

  drawFallbackBackground();
}

function renderFrame(players) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawRadarBackground();

  if (!Array.isArray(players)) {
    return;
  }

  const scaleX = canvas.width / MIRAGE_RADAR_META.size;
  const scaleY = canvas.height / MIRAGE_RADAR_META.size;
  const unitScale = Math.max(Math.min(scaleX, scaleY), 0.5);
  const playerRadius = 6 * unitScale;
  const viewLength = 12 * unitScale;

  players.forEach((player) => {
    const mapped = worldToCanvas(player.X, player.Y, scaleX, scaleY);

    ctx.fillStyle = player.team_num === 2 ? '#f1c40f' : '#3498db';

    ctx.beginPath();
    ctx.arc(mapped.x, mapped.y, playerRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = Math.max(1, unitScale);
    ctx.stroke();

    const radian = player.yaw * (Math.PI / 180);
    const endX = mapped.x + Math.cos(radian) * viewLength;
    const endY = mapped.y - Math.sin(radian) * viewLength;

    ctx.beginPath();
    ctx.moveTo(mapped.x, mapped.y);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1.5, 2 * unitScale);
    ctx.stroke();
  });
}

function renderFrameByIndex(index) {
  if (!framesData.length) {
    drawRadarBackground();
    return 0;
  }

  const safeIndex = clamp(index, 0, framesData.length - 1);
  const frame = framesData[safeIndex] || { players: [] };
  renderFrame(frame.players || []);
  updateProgressBar(safeIndex);
  return safeIndex;
}

function playNextFrame() {
  if (!isPlaying || isUserScrubbing) {
    return;
  }

  if (currentFrameIndex >= framesData.length) {
    pausePlayback();
    statusText.innerText = 'Playback finished';
    return;
  }

  renderFrameByIndex(currentFrameIndex);
  currentFrameIndex += 1;
  scheduleNextFrame();
}

function handleScrubStart() {
  if (!framesData.length) {
    return;
  }

  isUserScrubbing = true;
  pausePlayback();
}

function handleScrubInput() {
  if (!framesData.length) {
    return;
  }

  isUserScrubbing = true;
  pausePlayback();

  const targetIndex = Number(progressBar.value) || 0;
  currentFrameIndex = renderFrameByIndex(targetIndex);
}

function handleScrubEnd() {
  if (!framesData.length) {
    return;
  }

  const targetIndex = Number(progressBar.value) || 0;
  currentFrameIndex = renderFrameByIndex(targetIndex);
  isUserScrubbing = false;

  // Requirement: resume playback from selected frame after release.
  resumePlayback();
}

progressBar.addEventListener('mousedown', handleScrubStart);
progressBar.addEventListener('input', handleScrubInput);
progressBar.addEventListener('mouseup', handleScrubEnd);
progressBar.addEventListener('change', handleScrubEnd);

// --- 4) Import button ---
btnOpen.addEventListener('click', async () => {
  btnOpen.disabled = true;
  btnOpen.innerText = 'Loading...';
  statusText.innerText = 'Extracting timeline data from demo, please wait...';
  statusText.style.color = '#f39c12';

  try {
    const response = await ipcRenderer.invoke('analyze-demo');

    if (response.status === 'canceled') {
      statusText.innerText = 'Canceled';
      statusText.style.color = '#aaa';
      return;
    }

    if (response.status !== 'success') {
      statusText.innerText = `Parse failed: ${response.message || 'Unknown error'}`;
      statusText.style.color = '#e74c3c';
      console.error('[Analyze Demo Error]', response);
      return;
    }

    pausePlayback();
    isUserScrubbing = false;
    framesData = response.frames || [];
    currentFrameIndex = 0;

    setupProgressBar(framesData.length);

    if (!framesData.length) {
      statusText.innerText = 'Parse completed, but no playable frames were found.';
      statusText.style.color = '#f39c12';
      drawRadarBackground();
      return;
    }

    renderFrameByIndex(0);
    statusText.innerText = `Parse complete. Frames: ${framesData.length}. Playing...`;
    statusText.style.color = '#2ecc71';
    resumePlayback();
  } catch (error) {
    statusText.innerText = `Fatal error: ${error.message}`;
    statusText.style.color = '#e74c3c';
    console.error('[UI Fatal Error]', error);
  } finally {
    btnOpen.disabled = false;
    btnOpen.innerText = defaultOpenButtonText;
  }
});

// Initial UI state
setupProgressBar(0);
drawRadarBackground();
