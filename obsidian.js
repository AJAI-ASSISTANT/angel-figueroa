/* Obsidian ice: black stone with blue-white light breathing in its cracks, white points of light.
   The crack field is computed at a resolution matched to the screen, then drawn smooth. */
(() => {
  const c = document.getElementById('bg'), x = c.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W, H, dpr, fw, fh, off, ox, img, stars = [];

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
  let gl = null, glc = null, glProg = null, uT = null, uAspect = null;
  function initGL() {
    try {
      glc = document.createElement('canvas');
      gl = glc.getContext('webgl', { alpha: false, antialias: false, depth: false,
                                     preserveDrawingBuffer: false, powerPreference: 'low-power' });
      if (!gl) return false;
      const vs = 'attribute vec2 p;varying vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
      // the same arithmetic the JS path uses, line for line
      const fs = [
        'precision highp float;varying vec2 uv;uniform float t;uniform float aspect;',
        'void main(){',
        '  float u = uv.x * 6.0;',
        '  float v = (1.0 - uv.y) * 6.0 * aspect;',
        '  float f = sin(u*1.3 + sin(v*0.9 + t*0.15)*1.4)',
        '          + sin(v*1.1 + sin(u*0.8 - t*0.10)*1.6)',
        '          + 0.5*sin((u+v)*2.1);',
        '  float crack = max(0.0, 1.0 - abs(f)*4.5);',
        '  float heat  = crack * (0.7 + 0.3*sin(t*1.4 + u + v));',
        '  float base  = 0.0;',
        '  gl_FragColor = vec4(base + 175.0/255.0*heat*heat,',
        '                      base + 200.0/255.0*pow(heat,1.6),',
        '                      base + heat, 1.0);',
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
      return true;
    } catch (e) { gl = null; glc = null; return false; }
  }
  const useGL = initGL();
  const R = (a, b) => a + Math.random() * (b - a);
  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 3); W = innerWidth; H = innerHeight;
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const devW = W * dpr;
    fw = Math.max(240, Math.min(480, Math.round(devW / 3))); fh = Math.round(fw * H / W);
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
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      x.drawImage(glc, 0, 0, W, H);
    } else if (redraw) { fieldAt = now;
    for (let yy = 0; yy < fh; yy++) for (let xx = 0; xx < fw; xx++) {
      const u = xx / fw * 6, v = yy / fh * 6 * (H / W);   // same crack scale as the preview on any screen
      const f = Math.sin(u * 1.3 + Math.sin(v * .9 + t * .15) * 1.4) + Math.sin(v * 1.1 + Math.sin(u * .8 - t * .1) * 1.6) + .5 * Math.sin((u + v) * 2.1);
      const crack = Math.max(0, 1 - Math.abs(f) * 4.5), heat = crack * (.7 + .3 * Math.sin(t * 1.4 + u + v));
      const i4 = (yy * fw + xx) * 4, base = 0;
      d[i4] = base + 175 * heat * heat; d[i4 + 1] = base + 200 * Math.pow(heat, 1.6); d[i4 + 2] = base + 255 * heat; d[i4 + 3] = 255;
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
