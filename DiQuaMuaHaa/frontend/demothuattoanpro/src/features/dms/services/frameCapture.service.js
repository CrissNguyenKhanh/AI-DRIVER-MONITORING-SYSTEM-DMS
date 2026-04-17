function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function captureFrame(vid, quality = 0.7) {
  if (!vid || vid.readyState < 2) return null;

  // Downscale để giảm request payload base64
  const maxW = 480;
  const srcW = vid.videoWidth || 640;
  const srcH = vid.videoHeight || 480;
  const scale = Math.min(1, maxW / srcW);
  const targetW = Math.max(1, Math.round(srcW * scale));
  const targetH = Math.max(1, Math.round(srcH * scale));

  const c = document.createElement("canvas");
  c.width = targetW;
  c.height = targetH;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(vid, 0, 0, targetW, targetH);
  return c.toDataURL("image/jpeg", quality);
}

async function captureBurstFrames(vid, count, gapMs) {
  const frames = [];
  for (let i = 0; i < count; i++) {
    const frame = captureFrame(vid, 0.7);
    if (frame) frames.push(frame);
    if (i < count - 1) await sleep(gapMs);
  }
  return frames;
}

export { sleep, captureFrame, captureBurstFrames };
