/* Obsidian ice: black stone with blue-white light breathing in its cracks, white points of light.
   The crack field is computed at a resolution matched to the screen, then drawn smooth. */
(() => {
  const c = document.getElementById('bg'), x = c.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W, H, dpr, fw, fh, off, ox, img, stars = [];
  const R = (a, b) => a + Math.random() * (b - a);
  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 3); W = innerWidth; H = innerHeight;
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    fw = Math.min(260, Math.round(W / 1.6)); fh = Math.round(fw * H / W);
    off = document.createElement('canvas'); off.width = fw; off.height = fh; ox = off.getContext('2d'); img = ox.createImageData(fw, fh);
    stars = Array.from({ length: Math.round(W * H / 4200) }, () => { const u = Math.random(); return { x: R(0, W), y: R(0, H), r: 1 + Math.pow(u, 4) * 5, b: .35 + .65 * Math.pow(u, 1.5), f1: R(.3, .9), f2: R(1, 2.4), p: R(0, 40), v: R(.4, 1) }; });
  }
  size(); addEventListener('resize', size);
  const sp = document.createElement('canvas'); sp.width = sp.height = 32; { const g = sp.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.12, 'rgba(255,255,255,.9)'); gr.addColorStop(.32, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); }
  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || now - last < 1000 / 30) return; last = now;
    const t = reduce ? 4 : now / 1000, d = img.data;
    for (let yy = 0; yy < fh; yy++) for (let xx = 0; xx < fw; xx++) {
      const u = xx / fw * 6, v = yy / fh * 6 * (H / W);   // same crack scale as the preview on any screen
      const f = Math.sin(u * 1.3 + Math.sin(v * .9 + t * .15) * 1.4) + Math.sin(v * 1.1 + Math.sin(u * .8 - t * .1) * 1.6) + .5 * Math.sin((u + v) * 2.1);
      const crack = Math.max(0, 1 - Math.abs(f) * 4.5), heat = crack * (.7 + .3 * Math.sin(t * 1.4 + u + v));
      const i4 = (yy * fw + xx) * 4, base = 5 + 4 * Math.sin(u * 9 + v * 7);
      d[i4] = base + 175 * heat * heat; d[i4 + 1] = base + 200 * Math.pow(heat, 1.6); d[i4 + 2] = base + 3 + 255 * heat; d[i4 + 3] = 255;
    }
    ox.putImageData(img, 0, 0); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(off, 0, 0, W, H);
    x.globalCompositeOperation = 'lighter';
    const g = x.createRadialGradient(W / 2, H * .55, 0, W / 2, H * .55, Math.max(W, H) * .6); g.addColorStop(0, 'rgba(60,120,255,.10)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (const p of stars) {
      p.y -= .3 * p.v; p.x += Math.sin(t * .8 + p.p) * .25; if (p.y < -8) { p.y = H + 8; p.x = R(0, W); }
      const slow = .5 + .5 * Math.sin(t * p.f1 + p.p), fast = .5 + .5 * Math.sin(t * p.f2 + p.p * 1.7);
      let k = Math.min(1, slow * (.55 + .45 * fast)); k = k * k * (3 - 2 * k);
      const r = p.r * (.8 + .4 * k); x.globalAlpha = p.b * k; x.drawImage(sp, p.x - r * 2, p.y - r * 2, r * 4, r * 4);
      if (p.r > 3.6 && k > .82) { const L = p.r * (3.5 + 5 * (k - .82) / .18); x.globalAlpha = p.b * k * .5; x.strokeStyle = '#fff'; x.lineWidth = .7; x.beginPath(); x.moveTo(p.x - L, p.y); x.lineTo(p.x + L, p.y); x.moveTo(p.x, p.y - L); x.lineTo(p.x, p.y + L); x.stroke(); }
    }
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    const sh = x.createLinearGradient(0, 0, 0, H); sh.addColorStop(0, 'rgba(2,3,6,.35)'); sh.addColorStop(.45, 'rgba(2,3,6,0)'); sh.addColorStop(1, 'rgba(2,3,6,.35)'); x.fillStyle = sh; x.fillRect(0, 0, W, H);
  }
  requestAnimationFrame(frame);
})();
