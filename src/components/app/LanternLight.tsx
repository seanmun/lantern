'use client';

import { useEffect, useRef } from 'react';

/**
 * The dark theme's background: a faint hexagon lattice that a warm, flickering
 * lantern light reveals where it falls, with embers drifting up through it.
 * The light follows the pointer; with no pointer (phones) it hangs near the top
 * and sways. Embers follow the day: more and warmer when the portfolio is up.
 *
 * One fragment shader on one fixed canvas behind the page. Capped at 30 fps
 * and device-pixel ratio 1.5, paused while the tab is hidden, and still (no
 * flicker, no embers) for people who prefer reduced motion.
 */

const VERTEX = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAGMENT = `
precision mediump float;
uniform vec2 uRes;      // canvas size, px
uniform vec2 uLight;    // light position, px (origin bottom-left)
uniform float uTime;
uniform float uMotion;  // 0 = reduced motion
uniform float uMood;    // -1 (down day) .. 1 (up day)
uniform float uScale;   // device pixel ratio
uniform vec3 uBase;     // page color

float hexDist(vec2 p) {
  p = abs(p);
  return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x);
}

// Nearest hexagon center: returns the offset from it
vec2 hexLocal(vec2 uv) {
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(uv, r) - h;
  vec2 b = mod(uv - h, r) - h;
  return dot(a, a) < dot(b, b) ? a : b;
}

float hash(float n) { return fract(sin(n) * 43758.5453123); }

void main() {
  vec2 frag = gl_FragCoord.xy;
  float t = uTime * uMotion;

  // Lattice: thin lines along hexagon edges, about 34 CSS px across
  vec2 local = hexLocal(frag / (34.0 * uScale));
  float edge = 0.5 - hexDist(local);
  float line = 1.0 - smoothstep(0.0, 0.035, edge);

  // Lantern light with a candle flicker
  float flicker = 1.0 + uMotion * (0.05 * sin(t * 7.3) + 0.035 * sin(t * 12.7 + 1.3) + 0.025 * sin(t * 23.1 + 0.4));
  float radius = 260.0 * uScale * flicker;
  float d = distance(frag, uLight) / radius;
  float glow = exp(-d * d * 2.4);
  vec3 warm = mix(vec3(0.95, 0.42, 0.12), vec3(1.0, 0.74, 0.36), glow);

  vec3 col = uBase;
  col += warm * glow * 0.16;                      // the pool of light
  col += warm * line * (0.028 + glow * 0.42);     // lattice: barely there, lit near the light

  // Embers: up to 28 rising sparks, more on good days
  if (uMotion > 0.5) {
    float count = 8.0 + 20.0 * clamp(uMood * 0.5 + 0.5, 0.0, 1.0);
    vec2 uv = frag / uRes.y;
    float aspect = uRes.x / uRes.y;
    for (int i = 0; i < 28; i++) {
      float fi = float(i);
      if (fi >= count) break;
      float speed = 0.018 + 0.028 * hash(fi * 3.17);
      float life = fract(t * speed + hash(fi * 1.31));
      vec2 pos = vec2(hash(fi * 7.73) * aspect + 0.03 * sin(t * 0.6 + fi * 2.1), life * 1.15 - 0.08);
      float size = (0.0018 + 0.0022 * hash(fi * 5.39));
      float spark = smoothstep(size, 0.0, distance(uv, pos)) * sin(life * 3.14159);
      vec3 ember = mix(vec3(1.0, 0.45, 0.18), vec3(1.0, 0.72, 0.32), hash(fi * 9.1));
      // Cooler, dimmer embers on a down day
      ember = mix(ember, vec3(0.75, 0.42, 0.32), clamp(-uMood, 0.0, 1.0) * 0.6);
      col += ember * spark * 0.9;
    }
  }

  gl_FragColor = vec4(col, 1.0);
}`;

const hexToRgb = (hex: string) => {
  const m = hex.trim().replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m.slice(0, 6), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export function LanternLight({ mood }: { mood: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const moodRef = useRef(mood);

  useEffect(() => {
    moodRef.current = Math.max(-1, Math.min(1, mood));
  }, [mood]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext('webgl', { antialias: false, premultipliedAlpha: false });
    if (!canvas || !gl) return; // no WebGL: the plain dark page remains

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn('⚠️ lantern light shader:', gl.getShaderInfoLog(s));
      return s;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('⚠️ lantern light shader failed:', gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(program, name);
    const uRes = u('uRes'), uLight = u('uLight'), uTime = u('uTime'), uMotion = u('uMotion'), uMood = u('uMood'), uScale = u('uScale'), uBase = u('uBase');

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarse = window.matchMedia('(hover: none)');
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    let width = 0, height = 0;
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();

    // The light eases toward its target: the pointer, or a hanging spot that sways
    const target = { x: width * 0.5, y: 150 };
    const light = { ...target };
    let pointerSeen = false;
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
        pointerSeen = true;
        target.x = e.clientX;
        target.y = e.clientY;
      }
    };
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('resize', resize);

    const base = hexToRgb(getComputedStyle(document.documentElement).getPropertyValue('--color-page') || '#09090b');
    let raf = 0;
    let last = 0;
    const started = performance.now();

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (document.hidden || now - last < 33) return; // ~30 fps
      last = now;
      const motion = reduced.matches ? 0 : 1;
      const t = (now - started) / 1000;
      if (!pointerSeen || coarse.matches) {
        // Hanging lantern: top center, gently swaying, drifting down a little as you scroll
        target.x = width * 0.5 + motion * Math.sin(t * 0.35) * width * 0.08;
        target.y = 140 + Math.min(window.scrollY * 0.15, 120);
      }
      const ease = motion ? 0.12 : 1;
      light.x += (target.x - light.x) * ease;
      light.y += (target.y - light.y) * ease;

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uLight, light.x * scale, (height - light.y) * scale);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uMotion, motion);
      gl.uniform1f(uMood, moodRef.current);
      gl.uniform1f(uScale, scale);
      gl.uniform3f(uBase, base[0], base[1], base[2]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('resize', resize);
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />;
}
