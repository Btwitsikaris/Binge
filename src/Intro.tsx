import { useEffect, useRef, useState } from "react";

// ---- original synthesized sting (Web Audio, no audio files needed) ----
function sting(ctx: AudioContext) {
  const t0 = ctx.currentTime + 0.05;
  const master = ctx.createGain(); master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
  // shimmer echo
  const dly = ctx.createDelay(1); dly.delayTime.value = 0.27;
  const fb = ctx.createGain(); fb.gain.value = 0.38;
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3200;
  dly.connect(lp); lp.connect(fb); fb.connect(dly); lp.connect(master);

  const env = (g: GainNode, at: number, peak: number, atk: number, dec: number) => {
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, at + atk + dec);
  };
  const tone = (f: number, at: number, peak: number, dec: number, type: OscillatorType = "sine", send = true) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f; env(g, at, peak, 0.012, dec);
    o.connect(g); g.connect(master); if (send) g.connect(dly);
    o.start(at); o.stop(at + dec + 0.1);
  };
  const bell = (f: number, at: number, peak: number, dec = 1.6) => { tone(f, at, peak, dec); tone(f * 2.76, at, peak * 0.22, dec * 0.45); tone(f * 4.1, at, peak * 0.08, dec * 0.25); };

  // 1) rising whoosh (filtered noise)
  const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = nb.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const ns = ctx.createBufferSource(); ns.buffer = nb;
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(180, t0 + 0.15); bp.frequency.exponentialRampToValueAtTime(5200, t0 + 1.0);
  const ng = ctx.createGain(); env(ng, t0 + 0.15, 0.55, 0.8, 0.5);
  ns.connect(bp); bp.connect(ng); ng.connect(master); ns.start(t0 + 0.15); ns.stop(t0 + 1.8);

  // 2) deep sub swell that blooms under the logo
  [41.2, 82.4].forEach((f, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0 + 0.2);
    g.gain.exponentialRampToValueAtTime(0.55 - i * 0.25, t0 + 1.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.5);
    o.connect(g); g.connect(master); o.start(t0 + 0.2); o.stop(t0 + 3.6);
  });

  // 3) ascending glass-bell run, one note per letter (E major pentatonic)
  [659.25, 830.61, 987.77, 1108.73, 1318.51].forEach((f, i) => bell(f, t0 + 0.85 + i * 0.12, 0.2, 1.4));

  // 4) bright open chord when the light sweeps across
  [329.63, 493.88, 659.25, 830.61, 987.77].forEach((f) => bell(f, t0 + 1.95, 0.13, 2.0));
  tone(164.81, t0 + 1.95, 0.35, 1.6, "triangle", false);

  return { stop: () => { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0, ctx.currentTime, 0.05); } };
}

const LETTERS = "BINGE".split("");

export default function Intro({ onDone }: { onDone: () => void }) {
  const ctxRef = useRef<AudioContext | null>(null);
  const sRef = useRef<{ stop: () => void } | null>(null);
  const [out, setOut] = useState(false);
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return; doneRef.current = true;
    try { sRef.current?.stop(); setTimeout(() => ctxRef.current?.close(), 300); } catch {}
    try { sessionStorage.setItem("intro", "1"); } catch {}
    onDone();
  };

  useEffect(() => {
    const t0 = Date.now();
    // animation always starts immediately
    const timers = [window.setTimeout(() => setOut(true), 2750), window.setTimeout(finish, 3500)];
    // sound plays automatically when the browser allows it; otherwise the animation just runs silently
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext, ctx: AudioContext = new AC();
      ctxRef.current = ctx;
      const go = () => { if (ctx.state === "running" && !sRef.current && Date.now() - t0 < 500 && !doneRef.current) sRef.current = sting(ctx); };
      if (ctx.state === "running") go(); else ctx.resume().then(go).catch(() => {});
    } catch {}
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className={"intro" + (out ? " out" : "")}>
      <div className="in-glow" />
      <div className="in-line" />
      <div className="in-word" aria-label="Binge">
        {LETTERS.map((l, i) => <span key={i} style={{ animationDelay: 800 + i * 120 + "ms" }}>{l}</span>)}
        <i className="in-sweep" />
      </div>
    </div>
  );
}