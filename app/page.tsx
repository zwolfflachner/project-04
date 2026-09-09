'use client';

import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, ChevronLeft, ChevronRight, SkipBack, SkipForward } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

type RadioBlock = {
  song?: Record<string, { title: string; artist: string; elapsed: number; duration: number }>;
  event: string;
  end_event: string;
  url: string;
  cue?: number;
};

const RADIO_API_BASE = (process.env.NEXT_PUBLIC_RADIO_API_BASE || '').replace(/\/$/, '');
const radioApiUrl = (path: string) => `${RADIO_API_BASE}${path}`;

const vertexShader = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  uniform vec2 uResolution;
  uniform vec2 uPointer;
  uniform float uTime;
  uniform float uPalette;
  uniform vec4 uAudio;

  float softBlob(vec2 p, vec2 center, vec2 radius) {
    vec2 d = (p - center) / radius;
    return exp(-dot(d, d) * 1.28);
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  float softFbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.56;
    mat2 rotation = mat2(0.86, 0.51, -0.51, 0.86);
    for (int i = 0; i < 3; i++) {
      value += amplitude * noise(p);
      p = rotation * p * 1.82 + 8.3;
      amplitude *= 0.48;
    }
    return value;
  }

  float fluidFbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.52;
    mat2 rotation = mat2(0.82, 0.57, -0.57, 0.82);
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p = rotation * p * 2.02 + 13.7;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution.xy;
    vec2 p = (gl_FragCoord.xy * 2.0 - uResolution.xy) / min(uResolution.x, uResolution.y);
    float t = uTime * 0.30;
    vec2 screenScale = uResolution.xy / min(uResolution.x, uResolution.y);
    vec2 pointer = (uPointer * 2.0 - 1.0) * screenScale;
    vec2 pull = pointer - p;
    float influence = exp(-0.92 * dot(pull, pull));
    vec2 sourceP = p;
    float musicPulse = uAudio.x * 0.22 + uAudio.w * 0.10;

    // Large, slow deformations: the whole gradient breathes and folds as one surface.
    vec2 flow = vec2(
      sin(p.y * 0.82 + t) + 0.55 * sin(p.x * 0.58 - t * 0.73),
      cos(p.x * 0.76 - t * 0.86) + 0.48 * cos(p.y * 0.63 + t * 0.61)
    );
    p += flow * 0.16;
    p *= 1.0 - musicPulse;
    p -= pull * influence * 0.25;
    p += vec2(-pull.y, pull.x) * influence * 0.22;

    // A restrained organic warp brings back the earlier liquid character
    // while keeping the large, calm masses from the reference.
    vec2 organicFlow = vec2(
      softFbm(p * 0.56 + vec2(t * 0.24, -t * 0.16)),
      softFbm(p * 0.52 + vec2(-t * 0.18, t * 0.22) + 4.7)
    ) - 0.5;
    vec2 blendedP = p + organicFlow * 0.38;

    float paletteStage = mod(uPalette, 4.0);
    float paletteBlend = smoothstep(0.0, 1.0, fract(paletteStage));
    vec3 ink;
    vec3 violet;
    vec3 haze;
    vec3 acid;

    if (paletteStage < 1.0) {
      ink = mix(vec3(0.105, 0.075, 0.16), vec3(0.57, 0.73, 0.94), paletteBlend);
      violet = mix(vec3(0.34, 0.255, 0.44), vec3(0.17, 0.11, 0.42), paletteBlend);
      haze = mix(vec3(0.61, 0.55, 0.66), vec3(1.0, 0.38, 0.87), paletteBlend);
      acid = mix(vec3(0.66, 0.98, 0.015), vec3(1.0, 0.34, 0.0), paletteBlend);
    } else if (paletteStage < 2.0) {
      ink = mix(vec3(0.57, 0.73, 0.94), vec3(0.025, 0.09, 0.22), paletteBlend);
      violet = mix(vec3(0.17, 0.11, 0.42), vec3(0.10, 0.31, 0.92), paletteBlend);
      haze = mix(vec3(1.0, 0.38, 0.87), vec3(0.31, 0.94, 0.78), paletteBlend);
      acid = mix(vec3(1.0, 0.34, 0.0), vec3(1.0, 0.18, 0.22), paletteBlend);
    } else if (paletteStage < 3.0) {
      ink = mix(vec3(0.025, 0.09, 0.22), vec3(0.06, 0.12, 0.20), paletteBlend);
      violet = mix(vec3(0.10, 0.31, 0.92), vec3(0.42, 0.19, 0.50), paletteBlend);
      haze = mix(vec3(0.31, 0.94, 0.78), vec3(0.63, 0.82, 0.71), paletteBlend);
      acid = mix(vec3(1.0, 0.18, 0.22), vec3(0.87, 0.60, 0.05), paletteBlend);
    } else {
      ink = mix(vec3(0.06, 0.12, 0.20), vec3(0.105, 0.075, 0.16), paletteBlend);
      violet = mix(vec3(0.42, 0.19, 0.50), vec3(0.34, 0.255, 0.44), paletteBlend);
      haze = mix(vec3(0.63, 0.82, 0.71), vec3(0.61, 0.55, 0.66), paletteBlend);
      acid = mix(vec3(0.87, 0.60, 0.05), vec3(0.66, 0.98, 0.015), paletteBlend);
    }

    vec2 c0 = vec2(
      -0.62 + 0.72 * sin(t * 0.83),
       0.78 + 0.68 * cos(t * 0.69)
    );
    vec2 c1 = vec2(
       0.58 + 0.74 * cos(t * 0.61 + 1.1),
       0.23 + 0.82 * sin(t * 0.78 + 0.5)
    );
    vec2 c2 = vec2(
      -0.28 + 0.84 * sin(t * 0.54 + 2.5),
      -0.76 + 0.72 * cos(t * 0.72 + 0.3)
    );
    vec2 c3 = vec2(
       0.66 + 0.70 * cos(t * 0.70 + 3.2),
      -0.62 + 0.82 * sin(t * 0.57 + 2.0)
    );

    float breathe0 = 1.0 + 0.14 * sin(t * 1.13);
    float breathe1 = 1.0 + 0.12 * cos(t * 0.91 + 1.4);
    float breathe2 = 1.0 + 0.15 * sin(t * 0.84 + 2.1);
    float breathe3 = 1.0 + 0.13 * cos(t * 1.02 + 2.8);
    float edgePulse = (softFbm(blendedP * 0.74 + t * 0.12) - 0.5) * 0.16;
    float w0 = softBlob(blendedP, c0, vec2(1.08, 0.94) * breathe0) + 0.045;
    float w1 = softBlob(blendedP, c1, vec2(1.04, 1.16) * breathe1) + 0.038;
    float w2 = softBlob(blendedP, c2, vec2(1.18, 1.00) * breathe2) + 0.042;
    float w3 = softBlob(blendedP, c3, vec2(1.02, 1.18) * breathe3) + 0.034;
    w0 *= 1.0 + edgePulse;
    w1 *= 1.0 - edgePulse * 0.85;
    w2 *= 1.0 + edgePulse * 0.65;
    w3 *= 1.0 - edgePulse * 0.55;
    float total = w0 + w1 + w2 + w3;
    vec3 calmColor = (ink * w0 + violet * w1 + haze * w2 + acid * w3) / total;

    // A broad highlight follows the cursor without introducing a new colour.
    calmColor = mix(calmColor, haze, influence * 0.075);

    // Original liquid field: 70% of the final movement and colour distribution.
    float fluidT = uTime * 0.075;
    vec2 fluidDrift = vec2(
      fluidFbm(sourceP * 0.58 + vec2(fluidT * 0.7, -fluidT * 0.45)),
      fluidFbm(sourceP * 0.55 + vec2(-fluidT * 0.38, fluidT * 0.62))
    );
    vec2 fluidP = sourceP + (fluidDrift - 0.5) * 1.18;
    fluidP -= pull * influence * 0.16;
    fluidP += vec2(-pull.y, pull.x) * influence * 0.16;
    float field = fluidFbm(fluidP * 0.92 + fluidDrift * 0.7 + vec2(fluidT * 0.22, -fluidT * 0.31));
    field += 0.21 * sin(fluidP.x * 1.42 - fluidP.y * 0.73 + fluidT + fluidDrift.x * 3.0);
    field += influence * 0.19;

    float deepMask = smoothstep(0.38, 0.61, field);
    float acidMask = smoothstep(0.50, 0.77, field + 0.11 * sin(fluidP.y * 2.1 - fluidT));
    vec3 fluidColor = mix(ink, violet, smoothstep(0.25, 0.52, field));
    fluidColor = mix(fluidColor, haze, smoothstep(0.48, 0.66, field));
    fluidColor = mix(fluidColor, acid, acidMask);
    fluidColor = mix(fluidColor, violet, deepMask * (1.0 - acidMask) * 0.45);

    vec3 color = mix(calmColor, fluidColor, 0.70);

    // Music reveals extra hues without replacing the selected base palette.
    float bassRibbon = 0.5 + 0.5 * sin(blendedP.x * 1.25 - blendedP.y * 0.72 + t * 1.4);
    float midRibbon = 0.5 + 0.5 * sin(blendedP.y * 1.48 + blendedP.x * 0.54 - t * 1.1 + 2.1);
    float airRibbon = 0.5 + 0.5 * cos((blendedP.x + blendedP.y) * 1.16 + t * 1.7);
    vec3 musicCyan = vec3(0.05, 0.86, 1.0);
    vec3 musicRose = vec3(1.0, 0.12, 0.48);
    vec3 musicAmber = vec3(1.0, 0.68, 0.04);
    color = mix(color, musicRose, uAudio.x * bassRibbon * 0.48);
    color = mix(color, musicCyan, uAudio.y * midRibbon * 0.40);
    color = mix(color, musicAmber, uAudio.z * airRibbon * 0.34);
    color *= 1.0 + uAudio.w * 0.18;

    float vignette = 1.0 - smoothstep(0.18, 1.42, length((uv - 0.5) * vec2(0.84, 1.0)));
    color *= 0.83 + vignette * 0.18;

    // Do the final colour pass in WebGL. Safari can rasterize a filtered
    // canvas at a different scale, which makes this field look coarse.
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(luminance), color, 1.08);
    color = (color - 0.5) * 1.04 + 0.5;

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`;

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorDotRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const volumeRef = useRef(0.64);
  const frequencyDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const audioLevelsRef = useRef({ bass: 0, mid: 0, treble: 0, energy: 0 });
  const currentBlockRef = useRef<RadioBlock | null>(null);
  const historyRef = useRef<RadioBlock[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState([64]);
  const [channels, setChannels] = useState([{ chan: '42', title: 'Serenity' }]);
  const [channel, setChannel] = useState('42');
  const channelRef = useRef('42');
  const requestIdRef = useRef(0);
  const [radioError, setRadioError] = useState('');
  const [loadingChannel, setLoadingChannel] = useState(false);
  const channelIndex = Math.max(0, channels.findIndex(item => item.chan === channel));
  const previousChannel = channels[(channelIndex - 1 + channels.length) % channels.length];
  const nextChannel = channels[(channelIndex + 1) % channels.length];
  const [track, setTrack] = useState({ title: 'Serenity', artist: 'Загрузка информации о треке…' });
  const [progress, setProgress] = useState({ position: 0, duration: 0, start: 0 });
  const syncTrack = () => {
    const audio = audioRef.current;
    const block = currentBlockRef.current;
    if (!audio || !block) return;
    const songs = Object.values(block.song || {}).sort((a, b) => Number(a.elapsed) - Number(b.elapsed));
    const song = [...songs].reverse().find(song => Number(song.elapsed) / 1000 <= audio.currentTime + 0.1) || songs[0];
    if (!song) return;
    const start = Number(song.elapsed) / 1000;
    const duration = Number(song.duration) / 1000;
    setTrack({ title: song.title, artist: song.artist });
    setProgress({ position: Math.max(0, Math.min(duration, audio.currentTime - start)), duration, start });
  };
  const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(radioApiUrl('/api/radio?channels=1'), { signal: controller.signal }).then(response => response.json()).then(data => {
      if (Array.isArray(data) && data.length) setChannels(data);
    }).catch(() => {});
    fetch(radioApiUrl('/api/radio'), { signal: controller.signal }).then(response => response.json()).then((block: RadioBlock) => {
      if (currentBlockRef.current) return;
      const song = Object.values(block.song || {})[0];
      if (song) setTrack({ title: song.title, artist: song.artist });
    }).catch(() => { if (!controller.signal.aborted) setTrack({ title: 'Serenity', artist: 'Radio Paradise' }); });
    return () => controller.abort();
  }, []);

  const connectAnalyser = () => {
    const audio = audioRef.current;
    if (!audio || analyserRef.current) return;
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.86;
    const source = context.createMediaElementSource(audio);
    source.connect(analyser);
    const gain = context.createGain();
    gain.gain.value = volumeRef.current;
    analyser.connect(gain);
    gain.connect(context.destination);
    gainRef.current = gain;
    audio.volume = 1;
    audioContextRef.current = context;
    analyserRef.current = analyser;
    frequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount);
  };

  const loadBlock = async (block: RadioBlock, autoplay = true) => {
    const audio = audioRef.current;
    if (!audio) return;
    currentBlockRef.current = block;
    const firstSong = Object.values(block.song || {})[0];
    if (firstSong) setTrack({ title: firstSong.title, artist: firstSong.artist });
    const cueSeconds = Math.max(0, Number(block.cue || 0) / 1000);
    const seekToCue = () => {
      if (Number.isFinite(cueSeconds) && cueSeconds > 0) audio.currentTime = cueSeconds;
      syncTrack();
    };
    audio.addEventListener('loadedmetadata', seekToCue, { once: true });
    audio.src = radioApiUrl(`/api/radio/audio?url=${encodeURIComponent(block.url)}`);
    audio.load();
    if (autoplay) {
      connectAnalyser();
      await audioContextRef.current?.resume();
      await audio.play();
      setIsPlaying(true);
    }
  };

  const fetchBlock = async (event?: number, elapsed?: number) => {
    const params = new URLSearchParams();
    params.set('chan', channelRef.current);
    if (event != null) params.set('event', String(event));
    if (elapsed != null) params.set('elapsed', String(Math.max(0, Math.round(elapsed))));
    const response = await fetch(radioApiUrl(`/api/radio?${params}`));
    if (!response.ok) throw new Error('Radio Paradise is unavailable');
    return (await response.json()) as RadioBlock;
  };

  const changeChannel = async (id: string) => {
    const requestId = ++requestIdRef.current;
    const resume = !audioRef.current?.paused;
    audioRef.current?.pause();
    channelRef.current = id;
    setChannel(id);
    historyRef.current = [];
    currentBlockRef.current = null;
    setProgress({ position: 0, duration: 0, start: 0 });
    setTrack({ title: 'Загрузка…', artist: channels.find(item => item.chan === id)?.title || 'Radio Paradise' });
    setLoadingChannel(true);
    setRadioError('');
    try {
      const block = await fetchBlock();
      if (requestId !== requestIdRef.current) return;
      await loadBlock(block, resume);
    } catch {
      if (requestId === requestIdRef.current) setRadioError('Не удалось подключиться. Попробуйте другой канал или нажмите Play.');
    } finally {
      if (requestId === requestIdRef.current) setLoadingChannel(false);
    }
  };

  const playRadio = async () => {
    try {
      const audio = audioRef.current;
      if (!audio) return;
      audio.volume = 1;
      connectAnalyser();
      await audioContextRef.current?.resume();
      if (!currentBlockRef.current) await loadBlock(await fetchBlock(), true);
      else {
        await audio.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error(error);
      setIsPlaying(false);
    }
  };

  const pauseRadio = () => {
    audioRef.current?.pause();
    setIsPlaying(false);
  };

  const nextTrack = async () => {
    try {
      const current = currentBlockRef.current;
      const audio = audioRef.current;
      if (current) historyRef.current.push(current);
      const block = await fetchBlock(current ? Number(current.event) : undefined, audio?.currentTime);
      await loadBlock(block, isPlaying);
    } catch (error) {
      console.error(error);
    }
  };

  const previousTrack = async () => {
    try {
      const previous = historyRef.current.pop();
      if (previous) await loadBlock({ ...previous, cue: 0 }, isPlaying);
      else {
        const event = Number(currentBlockRef.current?.event || 0);
        await loadBlock(await fetchBlock(Math.max(0, event - 2)), isPlaying);
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'high-performance' });
    if (!canvas || !gl) return;

    const vertex = createShader(gl, gl.VERTEX_SHADER, vertexShader);
    const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentShader);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      gl.deleteProgram(program);
      return;
    }
    const activateProgram = gl.useProgram.bind(gl);
    activateProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const resolution = gl.getUniformLocation(program, 'uResolution');
    const pointerUniform = gl.getUniformLocation(program, 'uPointer');
    const timeUniform = gl.getUniformLocation(program, 'uTime');
    const paletteUniform = gl.getUniformLocation(program, 'uPalette');
    const audioUniform = gl.getUniformLocation(program, 'uAudio');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = { x: 0.5, y: 0.5 };
    const target = { x: 0.5, y: 0.5 };
    let palette = 0;
    let paletteTarget = 0;
    let cursorColorIndex = 0;
    let frame = 0;
    const start = performance.now();
    const cursorColors = ['#b6ff0c', '#ff62dd', '#4bf1d0', '#ff7a00'];

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.75);
      const width = Math.round(canvas.clientWidth * ratio);
      const height = Math.round(canvas.clientHeight * ratio);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };
    const updatePointer = (event: PointerEvent) => {
      target.x = event.clientX / window.innerWidth;
      target.y = 1 - event.clientY / window.innerHeight;
      if (cursorDotRef.current) {
        cursorDotRef.current.style.opacity = '1';
        cursorDotRef.current.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0) translate(-50%, -50%)`;
      }
    };
    const updateTilt = (event: DeviceOrientationEvent) => {
      if (event.gamma == null || event.beta == null) return;
      target.x = Math.max(0, Math.min(1, 0.5 + event.gamma / 90));
      target.y = Math.max(0, Math.min(1, 0.5 - (event.beta - 45) / 180));
    };
    const nextPalette = (event: PointerEvent) => {
      updatePointer(event);
      if ((event.target as Element | null)?.closest('.radio-player')) return;
      paletteTarget += 1;
      cursorColorIndex = (cursorColorIndex + 1) % cursorColors.length;
      if (cursorDotRef.current) {
        const color = cursorColors[cursorColorIndex];
        cursorDotRef.current.style.backgroundColor = color;
        cursorDotRef.current.style.boxShadow = `0 0 12px ${color}80`;
      }
    };
    const hideCursor = (event: MouseEvent) => {
      if (!event.relatedTarget && cursorDotRef.current) cursorDotRef.current.style.opacity = '0';
    };
    const render = (now: number) => {
      resize();
      pointer.x += (target.x - pointer.x) * 0.12;
      pointer.y += (target.y - pointer.y) * 0.12;
      palette += (paletteTarget - palette) * 0.026;
      const analyser = analyserRef.current;
      const frequencyData = frequencyDataRef.current;
      const levels = audioLevelsRef.current;
      if (analyser && frequencyData && !audioRef.current?.paused) {
        analyser.getByteFrequencyData(frequencyData);
        const average = (from: number, to: number) => {
          let sum = 0;
          for (let i = from; i < to; i++) sum += frequencyData[i] || 0;
          return sum / Math.max(1, to - from) / 255;
        };
        const bass = average(1, 12);
        const mid = average(12, 48);
        const treble = average(48, 110);
        const energy = average(1, 110);
        levels.bass += (bass - levels.bass) * 0.12;
        levels.mid += (mid - levels.mid) * 0.10;
        levels.treble += (treble - levels.treble) * 0.08;
        levels.energy += (energy - levels.energy) * 0.09;
      } else {
        levels.bass *= 0.94;
        levels.mid *= 0.94;
        levels.treble *= 0.94;
        levels.energy *= 0.94;
      }
      const motionScale = reducedMotion.matches ? 0.18 : 1;
      const elapsed = ((now - start) / 1000) * motionScale;
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform2f(pointerUniform, pointer.x, pointer.y);
      gl.uniform1f(timeUniform, elapsed);
      gl.uniform1f(paletteUniform, palette);
      gl.uniform4f(audioUniform, levels.bass, levels.mid, levels.treble, levels.energy);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      frame = requestAnimationFrame(render);
    };

    window.addEventListener('pointermove', updatePointer, { passive: true });
    window.addEventListener('pointerdown', nextPalette, { passive: true });
    window.addEventListener('mouseout', hideCursor, { passive: true });
    window.addEventListener('deviceorientation', updateTilt, { passive: true });
    window.addEventListener('resize', resize, { passive: true });
    resize();
    render(start);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', updatePointer);
      window.removeEventListener('pointerdown', nextPalette);
      window.removeEventListener('mouseout', hideCursor);
      window.removeEventListener('deviceorientation', updateTilt);
      window.removeEventListener('resize', resize);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
    };
  }, []);

  return (
    <main className="gradient-field" aria-label="Интерактивный абстрактный фон">
      <canvas ref={canvasRef} className="gradient-canvas" aria-hidden="true" />
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        preload="none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={nextTrack}
        onTimeUpdate={syncTrack}
        onDurationChange={syncTrack}
      />
      <section className="radio-player" aria-label="Radio Paradise">
        <svg className="player-squircle" viewBox="0 0 390 372" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <filter id="player-halo-blur" filterUnits="userSpaceOnUse" x="-200" y="-200" width="790" height="772" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation="80" />
            </filter>
            <filter id="player-edge-blur" filterUnits="userSpaceOnUse" x="-40" y="-40" width="470" height="452" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation="10" />
            </filter>
          </defs>
          <path
            className="player-squircle-halo"
            filter="url(#player-halo-blur)"
            d="M195 1 C345 1 389 26 389 186 C389 346 345 371 195 371 C45 371 1 346 1 186 C1 26 45 1 195 1 Z"
          />
          <path
            className="player-squircle-edge"
            filter="url(#player-edge-blur)"
            d="M195 1 C345 1 389 26 389 186 C389 346 345 371 195 371 C45 371 1 346 1 186 C1 26 45 1 195 1 Z"
          />
        </svg>
        <div className="radio-info">RADIO PARADISE</div>
        <div className="channel-switcher" role="group" aria-label="Канал Radio Paradise">
          <div className="channel-arrow">
            <Button variant="ghost" size="icon-lg" disabled={channels.length < 2 || loadingChannel}
              aria-label={`Предыдущий плейлист: ${previousChannel.title}`} aria-describedby="previous-channel-hint"
              onClick={() => void changeChannel(previousChannel.chan)}><ChevronLeft /></Button>
            <span id="previous-channel-hint" className="channel-hint" role="tooltip">{previousChannel.title}</span>
          </div>
          <span className="channel-name" aria-live="polite">{channels[channelIndex].title}</span>
          <div className="channel-arrow">
            <Button variant="ghost" size="icon-lg" disabled={channels.length < 2 || loadingChannel}
              aria-label={`Следующий плейлист: ${nextChannel.title}`} aria-describedby="next-channel-hint"
              onClick={() => void changeChannel(nextChannel.chan)}><ChevronRight /></Button>
            <span id="next-channel-hint" className="channel-hint" role="tooltip">{nextChannel.title}</span>
          </div>
        </div>
        <div className="track-info" aria-live="polite">
          <h1>{track.title}</h1>
          <p>{track.artist}</p>
        </div>
        <div className="track-progress">
          <Slider aria-label="Перемотка трека" value={[progress.position]} min={0} max={progress.duration || 1} step={1} disabled={!progress.duration}
            onValueChange={(value) => {
              const position = Array.isArray(value) ? value[0] : value;
              if (audioRef.current) audioRef.current.currentTime = progress.start + position;
              setProgress(previous => ({ ...previous, position }));
            }} />
          <div className="track-times"><span>{formatTime(progress.position)}</span><span>{formatTime(progress.duration)}</span></div>
        </div>
        <div className="transport-controls">
        <Button variant="ghost" size="icon-lg" aria-label="Предыдущий трек" title="Предыдущий трек" onClick={() => void previousTrack()} disabled={loadingChannel}>
          <SkipBack className="fill-current" />
        </Button>
        <Button variant="ghost" size="icon-lg" aria-label="Воспроизвести" title="Воспроизвести" onClick={playRadio} disabled={isPlaying || loadingChannel}>
          <Play className="fill-current" />
        </Button>
        <Button variant="ghost" size="icon-lg" aria-label="Пауза" title="Пауза" onClick={pauseRadio} disabled={!isPlaying}>
          <Pause className="fill-current" />
        </Button>
        <Button variant="ghost" size="icon-lg" aria-label="Следующий трек" title="Следующий трек" onClick={() => void nextTrack()} disabled={loadingChannel}>
          <SkipForward className="fill-current" />
        </Button>
        </div>
        <div className="volume-control">
          <Volume2 aria-hidden="true" />
          <Slider
            aria-label="Громкость"
            value={volume}
            min={0}
            max={100}
            onValueChange={(value) => {
              const values = Array.isArray(value) ? value : [value];
              setVolume(values);
              volumeRef.current = (values[0] || 0) / 100;
              if (gainRef.current && audioContextRef.current) {
                gainRef.current.gain.setTargetAtTime(volumeRef.current, audioContextRef.current.currentTime, 0.025);
              }
            }}
          />
        </div>
      </section>
      {radioError && <p className="radio-error" role="alert">{radioError}</p>}
      <div ref={cursorDotRef} className="cursor-dot" aria-hidden="true" />
    </main>
  );
}
