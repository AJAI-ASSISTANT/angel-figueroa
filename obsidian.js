/* Obsidian ice: black stone with blue-white light breathing in its cracks, white points of light.
   The crack field is computed at a resolution matched to the screen, then drawn smooth. */
(() => {
  const c = document.getElementById('bg'), x = c.getContext('2d');
  /* THE LIGHT IN THE CRACKS IS THE PERSON'S COLOUR. A page sets
     window.AJ_GLOW = [r, g, b] before loading this; with nothing set it is
     the blue that has been live on Angel's page since 15 Oct, so his page
     is unchanged by this existing at all. Both the GPU path and the
     JavaScript fallback read the same three numbers -- a value read in one
     place and hardcoded in the other is the fault this repo keeps writing
     down. */
  const GLOW = (window.AJ_GLOW && window.AJ_GLOW.length === 3)
    ? window.AJ_GLOW : [127, 178, 255];   // #7fb2ff, his own accent

  /* THE STROKE, IN SCREEN PIXELS, and the gain that goes with it.

     LINEPX is the half-width of the line where it fades out, so the stroke
     reads about twice this across. 1.6 is a hairline on a phone and still a
     hairline on a 1200px share card, because it is measured in pixels and
     not in field units -- which is the whole difference between this and
     the soft band it replaces.

     GAIN is not decoration and it is not taste. A SHARPER LINE IS A DIMMER
     LINE: narrowing the stroke removes most of the lit area, so thin and
     bright have to be dialled together or sharpening just reads as "it
     faded". The orb has exactly this pair -- uSharp and uLine -- and
     web/orb.js says so in the comment above them. */
  const LINEPX = 1.9, GAIN = 1.0, SCALE = 13;

  /* AND THE GAIN HAS TO KEEP THE HUE. The first version multiplied the
     colour by 2.35 to answer "a sharper line is a dimmer line" -- and
     #7fb2ff is (127,178,255), so 127*2.35 = 298. Red clipped, then green,
     and every stroke core saturated to WHITE. The lines were beautifully
     sharp and the one thing he asked for -- blue -- had been multiplied
     out of them. Measured rather than noticed: the lit pixels averaged a
     blue lead over red of 27, where his accent leads by 128.
     So the colour is normalised to a peak of 1 and the brightness comes
     from the stroke profile. Nothing can clip, the hue is exactly his
     accent at every brightness, and LINEPX carries the compensation. */
  const PEAK = Math.max(GLOW[0], GLOW[1], GLOW[2]) || 255;
  const COL = [GLOW[0] / PEAK, GLOW[1] / PEAK, GLOW[2] / PEAK];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W, H, dpr, fw, fh, off, ox, img, stars = [];

  // The field, as one function, so the shader and this path cannot say two
  // different things -- it is written out twice by necessity (one is GLSL)
  // and tools/test_obsidian.js checks the two agree numerically.
  // THE SAME FIVE TERMS AS THE SHADER. These two drifted within the hour:
  // the GPU path moved to five terms at scale 13 while this stayed on three
  // at scale 6, and because only the GPU path was ever rendered nothing
  // said so. tools/test_obsidian.js renders BOTH and compares them, which
  // is the only thing that keeps two hand-written copies of one expression
  // honest.
  const fld = (u, v, t) =>
    Math.sin(u * 1.3 + Math.sin(v * .9 + t * .15) * 1.4) +
    Math.sin(v * 1.1 + Math.sin(u * .8 - t * .1) * 1.6) +
    .5 * Math.sin((u + v) * 2.1) +
    .45 * Math.sin(u * .47 - v * .62 + t * .08) +
    .30 * Math.sin(v * .38 + u * .21 - t * .06);
  const sstep = (a, b, x) => {
    const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };

  /* ── THE FIELD RUNS ON THE GPU, AT FULL RESOLUTION ───────────────────
     It used to be computed per pixel in JavaScript on a canvas 260px wide
     and then stretched across the whole screen -- a 5x upscale on a desktop
     and about the same on a phone at dpr 3, which is exactly why the blue
     looked soft. Computing it in JS at real resolution is not an option:
     1400x950 is 1.3 million pixels and five sines each, every frame.

     But the field is a pure function of position and time, which is what a
     fragment shader is for. On the GPU it is the same arithmetic at full
     device resolution for less cost than the 260px version, and the result
     is blitted 1:1 into the 2D canvas -- no upscale anywhere.

     The JavaScript path is kept, untouched, as the fallback: WebGL can be
     refused by a browser, a blocklisted driver or a locked-down device, and
     a background that renders nothing at all is worse than a soft one. */
  let gl = null, glc = null, glProg = null, uT = null, uAspect = null, uPx = null;
  function initGL() {
    try {
      glc = document.createElement('canvas');
      gl = glc.getContext('webgl', { alpha: false, antialias: false, depth: false,
                                     preserveDrawingBuffer: false, powerPreference: 'low-power' });
      // WHICH ENGINE DREW THIS. A shader that fails to compile is caught
      // below, initGL returns false, and the page quietly uses the JS
      // fallback -- correct behaviour, and completely silent. Two renders
      // of a broken shader were measured and looked at before anybody
      // noticed the GPU had never run. This flag is how a check can tell
      // the difference, and it costs one assignment.
      window.AJ_BG_PATH = 'js';
      // AFTER the flag, not before it. Set below the early return, a
      // machine with no WebGL reported 'unknown' -- which is a third state
      // meaning "nothing told me", and a check cannot tell that from a
      // script that never ran.
      if (!gl) return false;
      const vs = 'attribute vec2 p;varying vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
      // the same arithmetic the JS path uses, line for line
      // THE SAME ARITHMETIC THE JS PATH USES, LINE FOR LINE -- and this
      // block was briefly neither. An edit anchored on the field expression
      // replaced it in place and left the old `void main(){` and its two
      // lines standing above the new one, so the source declared a uniform
      // inside a function and defined main twice. It cannot compile; initGL
      // catches that and returns false; the page silently falls back to the
      // JS path and looks completely fine. Two renders were measured and
      // admired before anybody noticed the GPU had never run -- which is
      // the "a WKWebView is not a browser" lesson in a different costume:
      // ask which engine drew what you are looking at.
      const fs = [
        'precision highp float;',
        'varying vec2 uv;',
        'uniform float t;',
        'uniform float aspect;',
        'uniform vec2 px;',          // one screen pixel, in field units
        'float field(float u, float v, float tt){',
        '  return sin(u*1.3 + sin(v*0.9 + tt*0.15)*1.4)',
        '       + sin(v*1.1 + sin(u*0.8 - tt*0.10)*1.6)',
        '       + 0.5*sin((u+v)*2.1)',
        '       + 0.45*sin(u*0.47 - v*0.62 + tt*0.08)',
        '       + 0.30*sin(v*0.38 + u*0.21 - tt*0.06);',
        '}',
        // A LINE OF CONSTANT SCREEN WIDTH, not a falloff. The old crack was
        // max(0,1-abs(f)*4.5): a linear ramp whose width is fixed in FIELD
        // units, which is a wide soft band -- the hazy glow. Thinning it
        // with a big pow() is what web/orb.js does, but the orb is drawn at
        // full resolution and this also runs on a 240px field that is
        // scaled up, where a pow-thinned line is sub-pixel and comes back
        // as mush. So the distance to the ridge is divided by the field's
        // own GRADIENT, which turns it into a distance in PIXELS, and the
        // stroke is a smoothstep LINEPX wide: the same width at any
        // resolution, on either path, anti-aliased by construction.
        'void main(){',
        '  float u = uv.x * ' + SCALE.toFixed(1) + ';',
        '  float v = (1.0 - uv.y) * ' + SCALE.toFixed(1) + ' * aspect;',
        '  float f  = field(u, v, t);',
        '  float gx = (field(u+px.x, v, t) - field(u-px.x, v, t)) / (2.0*px.x);',
        '  float gy = (field(u, v+px.y, t) - field(u, v-px.y, t)) / (2.0*px.y);',
        '  float g  = max(length(vec2(gx, gy)), 1e-4);',
        '  float dpx = abs(f) / g / max(px.x, 1e-6);',
        '  float line  = 1.0 - smoothstep(0.0, ' + LINEPX.toFixed(2) + ', dpx);',
        // The second, finer family. The orb carries two stroke widths and
        // it is most of why it reads as drawn rather than printed.
        '  float line2 = 1.0 - smoothstep(0.0, ' + (LINEPX * 0.55).toFixed(2) + ', dpx);',
        '  float lit = line * (0.70 + 0.30*sin(t*1.4 + u + v));',
        // NO WIDE WASH. orb.js adds pow(f1,6.)*.06 -- a soft halo round
        // every line -- and its uSharp exists to fade that out. There is no
        // equivalent here on purpose: lines, and nothing painted over them.
        '  vec3 col = vec3(' + COL[0].toFixed(4) + ',' + COL[1].toFixed(4) +
                         ',' + COL[2].toFixed(4) + ') * lit * ' +
                         GAIN.toFixed(2) + ';',
        // SHARPENING ALSO DIMS -- narrowing a stroke removes most of its
        // lit area -- so GAIN above and this core are what keep it bright.
        // Kept blue rather than white: a white core took the colour out of
        // the line, which is the one thing he asked for.
        '  col += vec3(0.78,0.90,1.0) * line2 * line2 * 0.30 * lit;',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n');
      function sh(type, src) {
        const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o);
        if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
        return o;
      }
      glProg = gl.createProgram();
      gl.attachShader(glProg, sh(gl.VERTEX_SHADER, vs));
      gl.attachShader(glProg, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(glProg);
      if (!gl.getProgramParameter(glProg, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(glProg));
      gl.useProgram(glProg);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(glProg, 'p');
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      uT = gl.getUniformLocation(glProg, 't');
      uAspect = gl.getUniformLocation(glProg, 'aspect');
      uPx = gl.getUniformLocation(glProg, 'px');
      window.AJ_BG_PATH = 'gpu';
      return true;
    } catch (e) { gl = null; glc = null; return false; }
  }
  const useGL = initGL();
  const R = (a, b) => a + Math.random() * (b - a);
  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 3); W = innerWidth; H = innerHeight;
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const devW = W * dpr;
    // A HAIRLINE NEEDS PIXELS TO BE A HAIRLINE IN. This was 240..480, which
    // was right for a wide soft band and is not right for a 2px stroke: at
    // 240 across a 390pt phone the upscale smears every line and the frame
    // went from 95% pure black on the GPU to 87% here. The floor is raised
    // for the lines' sake; it only ever runs where there is no WebGL at
    // all, and the loop is still throttled to 15 redraws a second.
    fw = Math.max(380, Math.min(560, Math.round(devW / 2))); fh = Math.round(fw * H / W);
    if (gl && glc) { glc.width = c.width; glc.height = c.height; gl.viewport(0, 0, glc.width, glc.height); }
    off = document.createElement('canvas'); off.width = fw; off.height = fh; ox = off.getContext('2d'); img = ox.createImageData(fw, fh);
    stars = Array.from({ length: Math.round(W * H / 4200) }, () => { const u = Math.random(); return { x: R(0, W), y: R(0, H), r: 1 + Math.pow(u, 4) * 5, b: .35 + .65 * Math.pow(u, 1.5), f1: R(.9, 2.4), f2: R(2.6, 5.4), p: R(0, 40), v: R(.4, 1), sh: R(1.7, 4.4) }; });
  }
  size(); addEventListener('resize', size);
  const SPR = 128;
  const sp = document.createElement('canvas'); sp.width = sp.height = SPR;
  { const g = sp.getContext('2d'), h = SPR / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
    // a tighter core than before as well as more pixels: the old stops put 30%
    // alpha out at a third of the radius, which reads as a smudge rather than
    // a point of light however many pixels it is drawn with
    gr.addColorStop(0,   'rgba(255,255,255,1)');
    gr.addColorStop(.06, 'rgba(255,255,255,.98)');
    gr.addColorStop(.16, 'rgba(255,255,255,.55)');
    gr.addColorStop(.34, 'rgba(255,255,255,.16)');
    gr.addColorStop(1,   'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, SPR, SPR); }
  let last = 0, fieldAt = -1e9;
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || now - last < 1000 / 30) return; last = now;
    const t = reduce ? 4 : now / 1000, d = img.data;
    const redraw = now - fieldAt >= 1000 / 15 || reduce;
    if (gl && glc) {                       // full resolution, 1:1, no upscale
      gl.uniform1f(uT, t); gl.uniform1f(uAspect, H / W);
      // One screen pixel in field units. u spans 0..6 across the canvas, so
      // this is what turns a distance in the field into a distance in
      // pixels -- the whole reason the stroke is the same width everywhere.
      if (uPx) gl.uniform2f(uPx, SCALE / glc.width,
                            SCALE * (H / W) / glc.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      x.drawImage(glc, 0, 0, W, H);
    } else if (redraw) { fieldAt = now;
    const ex = SCALE / fw, ey = SCALE * (H / W) / fh;
    for (let yy = 0; yy < fh; yy++) for (let xx = 0; xx < fw; xx++) {
      const u = xx / fw * SCALE, v = yy / fh * SCALE * (H / W);   // same scale as the shader
      const f = fld(u, v, t);
      // THE SAME ARITHMETIC AS THE SHADER, line for line -- which is this
      // file's own standing rule and the reason the two paths cannot drift
      // into two different pictures. The gradient turns a distance in the
      // field into a distance in PIXELS, so the stroke is the same width
      // here, on the GPU, and on a 1200px share card.
      const gx = (fld(u + ex, v, t) - fld(u - ex, v, t)) / (2 * ex);
      const gy = (fld(u, v + ey, t) - fld(u, v - ey, t)) / (2 * ey);
      const g = Math.max(Math.hypot(gx, gy), 1e-4);
      const dpx = Math.abs(f) / g / ex;
      const line = 1 - sstep(0, LINEPX, dpx);
      const line2 = 1 - sstep(0, LINEPX * .55, dpx);
      const lit = line * (.7 + .3 * Math.sin(t * 1.4 + u + v));
      const core = line2 * line2 * .30 * lit;
      const i4 = (yy * fw + xx) * 4;
      d[i4] = Math.min(255, 255 * COL[0] * lit * GAIN + 199 * core);
      d[i4 + 1] = Math.min(255, 255 * COL[1] * lit * GAIN + 230 * core);
      d[i4 + 2] = Math.min(255, 255 * COL[2] * lit * GAIN + 255 * core);
      d[i4 + 3] = 255;
    }
    ox.putImageData(img, 0, 0); }
    if (!gl) { x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(off, 0, 0, W, H); }
    x.globalCompositeOperation = 'lighter';
    // THE BLUE WASH IS GONE. A 10% blue laid over the entire frame in 'lighter'
    // lifts every black in the picture -- the deepest part of the sky stopped
    // being black and became blue-grey, which is exactly what reads as soft.
    // The ribbons supply the blue; they do not need a haze helping them, and
    // without it the contrast between a lit crack and the stone behind it is
    // the full range instead of a compressed one.
    for (const p of stars) {
      p.y -= .3 * p.v; p.x += Math.sin(t * .8 + p.p) * .25; if (p.y < -8) { p.y = H + 8; p.x = R(0, W); }
      const slow = .5 + .5 * Math.sin(t * p.f1 + p.p), fast = .5 + .5 * Math.sin(t * p.f2 + p.p * 1.7);
      let k = Math.min(1, slow * (.55 + .45 * fast));
      k = Math.pow(k, p.sh);          // dim most of the time, bright briefly
      const r = p.r * (.72 + .72 * k); x.globalAlpha = p.b * (.28 + 1.05 * k);
      x.drawImage(sp, p.x - r * 2, p.y - r * 2, r * 4, r * 4);
      // the cross-flare is what the eye actually reads as a twinkle, and it
      // used to fire only on the biggest 15% of stars and only above k=.82,
      // so on a normal screen almost nothing ever flared
      if (p.r > 2.2 && k > .5) { const L = p.r * (3.5 + 5 * (k - .5) / .5); x.globalAlpha = p.b * k * .6; x.strokeStyle = '#fff'; x.lineWidth = Math.max(.5, 1 / dpr); x.beginPath(); x.moveTo(p.x - L, p.y); x.lineTo(p.x + L, p.y); x.moveTo(p.x, p.y - L); x.lineTo(p.x, p.y + L); x.stroke(); }
    }
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    const sh = x.createLinearGradient(0, 0, 0, H); sh.addColorStop(0, 'rgba(0,0,0,.35)'); sh.addColorStop(.45, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.35)'); x.fillStyle = sh; x.fillRect(0, 0, W, H);
  }
  requestAnimationFrame(frame);
})();
