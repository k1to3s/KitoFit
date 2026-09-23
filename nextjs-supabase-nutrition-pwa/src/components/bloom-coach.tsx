'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, LoaderCircle, Send, Sparkles, Trash2, X } from 'lucide-react';
import type { Data } from './dashboard';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const suggestions = [
  'What should I eat next?',
  'How am I doing today?',
  'What workout fits today?',
  'Help me get more protein.',
];

function makeContext(data: Data) {
  const foods = data.foods.map(f => ({
    name: f.name, meal: f.meal, serving: f.serving,
    calories: Math.round(f.calories), protein: Math.round(f.protein),
    carbs: Math.round(f.carbs), fat: Math.round(f.fat),
  }));
  const totals = foods.reduce((a, f) => ({
    calories: a.calories + f.calories, protein: a.protein + f.protein,
    carbs: a.carbs + f.carbs, fat: a.fat + f.fat,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  return {
    username: data.username || 'Bloom member',
    targets: data.targets,
    today: totals,
    remaining: {
      calories: Math.max(0, Math.round(data.targets.calories - totals.calories)),
      protein: Math.max(0, Math.round(data.targets.protein - totals.protein)),
      carbs: Math.max(0, Math.round(data.targets.carbs - totals.carbs)),
      fat: Math.max(0, Math.round(data.targets.fat - totals.fat)),
      waterMl: Math.max(0, Math.round(data.targets.water - data.water)),
    },
    water: data.water,
    foods,
    recentWorkouts: data.workouts.slice(0, 5).map(w => ({
      name: String(w.data?.name || 'Workout'), date: w.date, duration: w.data?.duration || null,
    })),
    supplements: data.supplements.map(s => ({
      name: String(s.data?.name || 'Supplement'), dose: String(s.data?.dose || ''), time: String(s.data?.time || ''),
    })),
  };
}

export function BloomCoachDialog({ data, close, fullPage = false }: { data: Data; close?: () => void; fullPage?: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Local AI · runs on your device');
  const [error, setError] = useState('');
  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef('');
  const context = useMemo(() => makeContext(data), [data]);

  useEffect(() => {
    const saved = localStorage.getItem('bloom-kito-coach-chat');
    if (saved) { try { setMessages(JSON.parse(saved)); } catch {} }
    const worker = new Worker(new URL('../workers/bloom-coach.worker.ts', import.meta.url));
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<{type:string;requestId:string;text?:string;progress?:number|null}>) => {
      if (event.data.requestId !== requestRef.current) return;
      if (event.data.type === 'progress') {
        setStatus(event.data.progress === null ? (event.data.text || 'Loading local AI…') : 'Loading local AI… ' + event.data.progress + '%');
      } else if (event.data.type === 'loading') {
        setStatus(event.data.text || 'Thinking…');
      } else if (event.data.type === 'complete') {
        const answer = event.data.text || '';
        setMessages(prev => {
          const next = [...prev, { role: 'assistant' as const, content: answer }];
          localStorage.setItem('bloom-kito-coach-chat', JSON.stringify(next.slice(-20)));
          return next;
        });
        setBusy(false);
        setStatus('Local AI · runs on your device');
      } else if (event.data.type === 'error') {
        setError(event.data.text || 'Bloom Kito Coach could not start.');
        setBusy(false);
        setStatus('Local AI unavailable on this device');
      }
    };
    return () => { worker.terminate(); workerRef.current = null; };
  }, []);

  function addAssistantMessage(content: string) {
    setMessages(prev => {
      const next = [...prev, { role: 'assistant' as const, content }];
      localStorage.setItem('bloom-kito-coach-chat', JSON.stringify(next.slice(-20)));
      return next;
    });
  }

  function todaySummary() {
    const t = context.today;
    const target = context.targets;
    const parts = [
      `Today you have logged ${t.calories} kcal out of ${Math.round(target.calories)} kcal.`,
      `Protein is ${t.protein}g out of ${Math.round(target.protein)}g.`,
      `Carbs are ${t.carbs}g out of ${Math.round(target.carbs)}g.`,
      `Fat is ${t.fat}g out of ${Math.round(target.fat)}g.`,
      `Water is ${Math.round(context.water)} ml out of ${Math.round(target.water)} ml.`,
    ];
    const workout = context.recentWorkouts.find(w => w.date === new Date().toISOString().slice(0, 10));
    parts.push(workout ? `You logged a ${workout.name} workout today.` : 'I do not see a workout logged today.');
    return parts.join(' ');
  }

  async function send(message = input) {
    const text = message.trim();
    if (!text || busy) return;
    setError('');
    const userMessage: ChatMessage = { role: 'user', content: text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');

    const normalized = text.toLowerCase().replace(/[?!.]/g, '').trim();
    if (/^(how am i doing today|how am i doing|how am i doing today)$/.test(normalized)) {
      addAssistantMessage(todaySummary());
      return;
    }

    setBusy(true);
    requestRef.current = crypto.randomUUID();
    const system = [
      'You are Bloom Kito Coach, a warm, practical wellness coach inside the Bloom KitoFit app.',
      'You run locally on the user device. Be concise, friendly, non-judgmental, practical, and answer in plain US English only.',
      'Never output Chinese, Japanese, Korean, emojis, or other non-ASCII writing. Never switch languages.',
      'Use the Bloom data below when relevant. Never invent foods, workouts, targets, measurements, feelings, or personal experiences. You are not a person and must never claim that you personally exercised, ate, drank water, or followed a diet.',

      'Do not diagnose illness, prescribe medication, or give dangerous weight-loss advice. For medical concerns, recommend a qualified professional.',
      'Nutrition numbers are tracking estimates, not medical prescriptions.',
      'If the user asks what to eat next, give at most 3 simple food choices with approximate portions and a one-line reason. Do not invent a detailed recipe, ingredient list, or cooking instructions unless the user explicitly asks for a recipe.',
      'Do not write long generic nutrition lectures. Prefer Bloom-specific numbers and choices from the supplied data. If the user asks how they are doing today, report the supplied today totals and targets exactly; do not estimate or substitute generic example numbers. If the data is insufficient, say so briefly rather than making up facts.',
      'If the user asks about workouts, use their recent workouts and avoid pretending you know exercises that are not in the data.',
      'Bloom data: ' + JSON.stringify(context),
    ].join('\\n');
    const history = nextMessages.slice(-8).map(m => ({ role: m.role, content: m.content }));
    workerRef.current?.postMessage({
      type: 'chat',
      requestId: requestRef.current,
      messages: [{ role: 'system', content: system }, ...history],
    });
  }

  function clearChat() {
    setMessages([]);
    localStorage.removeItem('bloom-kito-coach-chat');
    setError('');
  }

  return <div className={`coach-dialog-shell ${fullPage?'coach-full-page':''}`}>
    <div className="coach-dialog-head">
      <div className="coach-avatar"><Sparkles size={20}/></div>
      <div><span className="coach-label">BLOOM KITO COACH</span><h2>Your local wellness coach</h2><p>{status}</p></div>
      {close&&<button className="icon-button" onClick={close} aria-label="Close Bloom Kito Coach"><X size={19}/></button>}
    </div>
    <div className="coach-local-note"><Bot size={16}/><span>Your messages and Bloom data stay in this browser while local AI is running. The model is downloaded once and cached on your device.</span></div>
    {!messages.length && <div className="coach-welcome"><h3>What can I help with?</h3><div className="coach-suggestions">{suggestions.map(s => <button key={s} onClick={() => send(s)} disabled={busy}>{s}</button>)}</div></div>}
    <div className="coach-chat-messages" aria-live="polite">
      {messages.map((m, i) => <div className={'coach-chat-bubble ' + m.role} key={i}><span>{m.role === 'user' ? 'You' : 'Bloom Kito Coach'}</span><p>{m.content}</p></div>)}
      {busy && <div className="coach-chat-bubble assistant"><span>Bloom Kito Coach</span><p><LoaderCircle size={16} className="spin"/> {status}</p></div>}
    </div>
    {error && <div className="error-note">{error}{/WebGPU|GPU|device/i.test(error) && <span> Try Bloom in a recent Chrome, Edge, or Safari browser with WebGPU enabled.</span>}</div>}
    <form className="coach-compose" onSubmit={(e: FormEvent) => { e.preventDefault(); send(); }}>
      <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask Bloom Kito Coach…" disabled={busy}/>
      <button className="button primary" disabled={busy || !input.trim()} aria-label="Send message"><Send size={17}/></button>
    </form>
    <div className="coach-dialog-footer"><button className="text-button muted" onClick={clearChat} disabled={busy}><Trash2 size={14}/>Clear local chat</button><span>Not medical advice.</span></div>
  </div>;
}
