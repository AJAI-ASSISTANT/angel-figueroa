/* The front page's own sky: white stars on near-black with a breath of blue, drawn at the screen's full pixel
   density (so it is crisp on any display), each breathing on two unrelated rhythms. */
(() => {
  const c = document.getElementById('sky'), x = c.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COLS = [[[255,255,255],.7],[[244,247,255],.3]];   // white stars, always
  const pick = () => { let r = Math.random(); for (const [col, w] of COLS) { if ((r -= w) <= 0) return col; } return COLS[1][0]; };
  let W, H, dpr, stars = [];
  const R = (a, b) => a + Math.random() * (b - a);
  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 3); W = innerWidth; H = innerHeight;
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(W * H / 900);                 // density follows the screen, not a fixed count
    stars = Array.from({ length: n }, () => { const u = Math.random(); return { x: R(0, W), y: R(0, H), s: .45 + Math.pow(u, 5) * 2.6, b: .08 + .92 * Math.pow(u, 3.1), c: pick(), f1: R(.2, .7), f2: R(.8, 2), p: R(0, 40), tw: R(.25, .7) }; });
  }
  size(); addEventListener('resize', size);
  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || now - last < 1000 / 40) return; last = now;
    const t = reduce ? 0 : now / 1000;
    x.fillStyle = '#020203'; x.fillRect(0, 0, W, H);
    const g = x.createRadialGradient(W * .72, H * .3, 0, W * .72, H * .3, Math.max(W, H) * .8);
    g.addColorStop(0, 'rgba(70,120,255,.06)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'lighter';
    for (const p of stars) {
      const slow = .5 + .5 * Math.sin(t * p.f1 + p.p), fast = .5 + .5 * Math.sin(t * p.f2 + p.p * 1.7);
      let k = Math.min(1, slow * (.6 + .4 * fast)); k = k * k * (3 - 2 * k);
      const b = p.b * (1 - p.tw * k), r = p.s * 2.2;
      if (r < .9) { x.fillStyle = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${b})`; x.fillRect(p.x, p.y, .9, .9); continue; }
      const gg = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      gg.addColorStop(0, `rgba(255,255,255,${b})`); gg.addColorStop(.14, `rgba(255,255,255,${b * .85})`); gg.addColorStop(.32, `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${b * .4})`); gg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gg; x.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      if (p.s > 2 && b > .5) { const L = p.s * 5.5 * b; x.strokeStyle = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${b * .45})`; x.lineWidth = .6; x.beginPath(); x.moveTo(p.x - L, p.y); x.lineTo(p.x + L, p.y); x.moveTo(p.x, p.y - L); x.lineTo(p.x, p.y + L); x.stroke(); }
    }
    x.globalCompositeOperation = 'source-over';
  }
  requestAnimationFrame(frame);
})();
