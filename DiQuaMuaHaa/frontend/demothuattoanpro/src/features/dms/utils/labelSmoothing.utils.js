function getSmoothedLabel(apiResult, history, minProbForLabel, consistentFrames) {
  let smoothedLabel = apiResult?.label || "unknown";
  if (history.length > 0) {
    const rel = history.filter((h) => h.prob >= minProbForLabel);
    if (rel.length > 0) {
      const cnt = {};
      rel.forEach((h) => {
        cnt[h.label] = (cnt[h.label] || 0) + 1;
      });
      const maj = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
      const rec = rel.slice(-consistentFrames);
      if (rec.length === consistentFrames && rec.every((h) => h.label === maj))
        smoothedLabel = maj;
    }
  }
  return smoothedLabel;
}

export { getSmoothedLabel };
