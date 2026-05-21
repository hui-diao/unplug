import { useState, useEffect, useRef } from "react";

// ── Notification helpers ──────────────────────────────────────────────────────
async function requestNotifPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

function scheduleNotification({ delayMs, goal, mode }) {
  if (!navigator.serviceWorker?.controller) return;
  navigator.serviceWorker.controller.postMessage({
    type: "SCHEDULE_NOTIFICATION", delayMs, goal, mode,
  });
}

function cancelNotification() {
  if (!navigator.serviceWorker?.controller) return;
  navigator.serviceWorker.controller.postMessage({ type: "CANCEL_NOTIFICATION" });
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function formatTime(date) {
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}
function formatCountdown(ms) {
  if (ms <= 0) return "00∶00";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}∶${String(m).padStart(2,"0")}∶${String(sec).padStart(2,"0")}`;
  return `${String(m).padStart(2,"0")}∶${String(sec).padStart(2,"0")}`;
}

async function getAILine({ goal, pct, n }) {
  const tone = pct > 80 ? "非常紧迫，语气严肃带一点温柔" : pct > 45 ? "略带担忧，温和但认真" : "轻松鼓励";
  const prompt = `你是一位睿智温柔的时间导师，语气${tone}。
用户的目标是「${goal}」，已经过去了 ${pct}% 的时间，这是第 ${n} 次提醒。
请写一句话（25字以内）提醒用户专注。要有温度，不要说废话，不要用感叹号堆砌情绪。只输出那句话。`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 80,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const d = await r.json();
    return d.content?.[0]?.text?.trim() ?? "时间在流逝，你准备好了吗？";
  } catch {
    const lines = [
      "专注当下，其余皆是噪音。",
      "每一分钟都值得被认真对待。",
      "放下手机，拿起你真正想要的生活。",
      "时间正在流走，而你知道该做什么。",
      "此刻的克制，是明日的从容。",
    ];
    return lines[n % lines.length];
  }
}

// ── SVG Ring ─────────────────────────────────────────────────────────────────
function Ring({ progress, color }) {
  const r = 88;
  const circ = 2 * Math.PI * r;
  const dash = circ * (1 - progress);
  return (
    <svg width="220" height="220" viewBox="0 0 220 220" style={{ transform: "rotate(-90deg)" }}>
      <circle cx="110" cy="110" r={r} fill="none" stroke="#E8E0D0" strokeWidth="1" />
      <circle
        cx="110" cy="110" r={r} fill="none"
        stroke={color} strokeWidth="1.5"
        strokeDasharray={circ} strokeDashoffset={dash}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 1s linear, stroke 2s ease" }}
      />
    </svg>
  );
}

// ── Grain Layer ───────────────────────────────────────────────────────────────
function GrainLayer() {
  return (
    <div style={{
      position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23g)' opacity='0.055'/%3E%3C/svg%3E")`,
      backgroundRepeat: "repeat",
    }} />
  );
}

function Spinner({ value, min, max, step = 1, label, onChange }) {
  return (
    <div style={S.spinner}>
      <button style={S.spinBtn} onClick={() => onChange(Math.max(min, value - step))}>−</button>
      <span style={S.spinVal}>{String(value).padStart(2, "0")}</span>
      <button style={S.spinBtn} onClick={() => onChange(Math.min(max, value + step))}>+</button>
      <span style={S.spinLabel}>{label}</span>
    </div>
  );
}

// ── MODE SELECTOR ────────────────────────────────────────────────────────────
// mode: "focus" = 专注计时器 (原功能)
// mode: "bedtime" = 刷手机倒计时 + 封印

// ── Setup Screen ──────────────────────────────────────────────────────────────
function SetupScreen({ onStart }) {
  const [mode, setMode] = useState("bedtime");
  const [goal, setGoal] = useState("");
  const [hours, setHours] = useState(0);
  const [mins, setMins] = useState(30);
  const [err, setErr] = useState(false);

  const totalMin = hours * 60 + mins;
  const focusPresets  = [{ l:"15分",h:0,m:15},{l:"30分",h:0,m:30},{l:"1小时",h:1,m:0},{l:"2小时",h:2,m:0}];
  const bedPresets    = [{ l:"15分",h:0,m:15},{l:"30分",h:0,m:30},{l:"45分",h:0,m:45},{l:"1小时",h:1,m:0}];
  const presets = mode === "focus" ? focusPresets : bedPresets;

  const focusPlaceholder = "我打算……";
  const bedPlaceholder   = "睡觉 / 开始晨跑 / 关电脑……";

  const go = () => {
    if (!goal.trim() || totalMin < 1) { setErr(true); setTimeout(() => setErr(false), 700); return; }
    onStart({ goal: goal.trim(), durationMs: totalMin * 60000, mode });
  };

  return (
    <div style={S.page}>
      <GrainLayer />
      <div style={S.setupWrap}>
        <div style={S.mono}>专·注</div>
        <p style={S.tagline}>将时间还给真正重要的事</p>
        <div style={S.rule} />

        {/* Mode toggle */}
        <div style={S.modeRow}>
          <button
            style={{ ...S.modeTab, ...(mode === "bedtime" ? S.modeTabOn : {}) }}
            onClick={() => { setMode("bedtime"); setGoal(""); }}>
            ☽ 收手模式
          </button>
          <button
            style={{ ...S.modeTab, ...(mode === "focus" ? S.modeTabOn : {}) }}
            onClick={() => { setMode("focus"); setGoal(""); }}>
            ◎ 专注计时
          </button>
        </div>
        <p style={S.modeDesc}>
          {mode === "bedtime"
            ? "给自己最后一段刷手机时间，时间到了就封印屏幕，引导你放下。"
            : "设定目标与时长，AI 在适当时刻轻声提醒你。"}
        </p>

        {/* Goal */}
        <div style={{ ...S.fieldGroup, ...(err && !goal.trim() ? S.fieldErr : {}) }}>
          <label style={S.fieldLabel}>{mode === "bedtime" ? "之后我要去做" : "今日意图"}</label>
          <input
            style={S.fieldInput}
            placeholder={mode === "bedtime" ? bedPlaceholder : focusPlaceholder}
            value={goal}
            onChange={e => setGoal(e.target.value)}
            maxLength={28}
          />
          <div style={S.fieldLine} />
        </div>

        {/* Duration */}
        <div style={{ ...S.fieldGroup, ...(err && totalMin < 1 ? S.fieldErr : {}) }}>
          <label style={S.fieldLabel}>{mode === "bedtime" ? "再刷多久" : "持续时长"}</label>
          <div style={S.presetRow}>
            {presets.map(p => (
              <button key={p.l}
                style={{ ...S.presetPill, ...(hours === p.h && mins === p.m ? S.presetPillOn : {}) }}
                onClick={() => { setHours(p.h); setMins(p.m); }}>
                {p.l}
              </button>
            ))}
          </div>
          <div style={S.spinnerRow}>
            <Spinner value={hours} min={0} max={12} label="时" onChange={setHours} />
            <span style={S.colon}>∶</span>
            <Spinner value={mins} min={0} max={59} step={1} label="分" onChange={setMins} />
          </div>
          <div style={S.fieldLine} />
        </div>

        <button style={S.mainBtn} onClick={go}>
          {mode === "bedtime" ? "开始倒计时" : "开始专注"}
        </button>
        <p style={S.footnote}>
          {mode === "bedtime" ? "时间到后屏幕封印，需长按才能确认放下" : "AI 将在适当时刻轻声提醒你"}
        </p>
      </div>
    </div>
  );
}

// ── Free-scroll Timer (bedtime countdown) ────────────────────────────────────
function BedtimeTimer({ session, onTimeUp, onGiveUp }) {
  const { goal, durationMs, startTime } = session;
  const [remaining, setRemaining] = useState(durationMs);
  const [entered, setEntered] = useState(false);
  const [showQuit, setShowQuit] = useState(false);

  useEffect(() => { setTimeout(() => setEntered(true), 60); }, []);

  useEffect(() => {
    const t = setInterval(() => {
      const rem = Math.max(0, durationMs - (Date.now() - startTime));
      setRemaining(rem);
      if (rem <= 0) { clearInterval(t); onTimeUp(); }
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const progress = 1 - remaining / durationMs;
  // color shifts from calm green → amber → deep red as time runs out
  const pct = progress * 100;
  const ringColor = pct < 50 ? "#2C4A3E" : pct < 80 ? "#7A5C1E" : "#8B2020";
  const urgency = pct > 80;

  return (
    <div style={{ ...S.page, opacity: entered ? 1 : 0, transition: "opacity 0.8s ease" }}>
      <GrainLayer />

      <div style={S.strip}>
        <button style={S.quitLink} onClick={() => setShowQuit(true)}>放弃</button>
        <span style={S.stripGoal}>刷完就去：{goal}</span>
        <span style={S.stripTime}>{formatTime(new Date(startTime + durationMs))}</span>
      </div>

      <div style={S.timerBody}>
        <p style={{ ...S.fieldLabel, marginBottom: 24, letterSpacing: "0.2em" }}>尽情享用剩余时间</p>

        <div style={S.ringWrap}>
          <Ring progress={1 - progress} color={ringColor} />
          <div style={S.ringInner}>
            <div style={{ ...S.bigTime, color: ringColor, transition: "color 2s" }}>
              {formatCountdown(remaining)}
            </div>
            <div style={S.bigLabel}>后封印屏幕</div>
          </div>
        </div>

        <div style={S.ornament}>❧</div>

        {urgency && (
          <p style={{ ...S.quoteText, color: "#8B2020", fontStyle: "italic", textAlign: "center", marginBottom: 12 }}>
            「快了，准备好放下……」
          </p>
        )}

        <div style={{ ...S.bottomRow, marginTop: 32 }}>
          <div style={S.pctBar}>
            <div style={{ ...S.pctFill, width: `${pct}%`, background: ringColor }} />
          </div>
          <span style={{ ...S.pctNum, color: ringColor }}>{Math.round(pct)}%</span>
        </div>
      </div>

      {showQuit && (
        <div style={S.overlay}>
          <div style={S.modal}>
            <div style={S.modalRule} />
            <p style={S.modalTitle}>提前放弃？</p>
            <p style={S.modalSub}>「{goal}」会等你的。</p>
            <div style={S.modalBtns}>
              <button style={S.modalBack} onClick={() => setShowQuit(false)}>继续刷</button>
              <button style={S.modalLeave} onClick={onGiveUp}>放弃</button>
            </div>
            <div style={S.modalRule} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── SEAL SCREEN (封印) ────────────────────────────────────────────────────────
function SealScreen({ goal, onSuccess, onGiveUp }) {
  const HOLD_MS = 3000;
  const [holding, setHolding] = useState(false);
  const [holdPct, setHoldPct] = useState(0);
  const [done, setDone] = useState(false);
  const [showGiveUp, setShowGiveUp] = useState(false);
  const [pulse, setPulse] = useState(false);
  const holdStart = useRef(null);
  const raf = useRef(null);
  const intervalRef = useRef(null);

  // pulse ring every 2s to draw attention
  useEffect(() => {
    const t = setInterval(() => setPulse(p => !p), 2000);
    return () => clearInterval(t);
  }, []);

  const startHold = () => {
    if (done) return;
    holdStart.current = Date.now();
    setHolding(true);
    raf.current = requestAnimationFrame(tick);
  };

  const tick = () => {
    const elapsed = Date.now() - holdStart.current;
    const p = Math.min(1, elapsed / HOLD_MS);
    setHoldPct(p);
    if (p < 1) {
      raf.current = requestAnimationFrame(tick);
    } else {
      setDone(true);
      setHolding(false);
      setTimeout(onSuccess, 900);
    }
  };

  const endHold = () => {
    if (done) return;
    cancelAnimationFrame(raf.current);
    setHolding(false);
    setHoldPct(0);
  };

  const r = 70;
  const circ = 2 * Math.PI * r;

  return (
    <div style={sealStyles.bg}>
      {/* Vignette */}
      <div style={sealStyles.vignette} />

      <div style={sealStyles.inner}>
        {/* Title */}
        <p style={sealStyles.title}>时间到了</p>
        <p style={sealStyles.sub}>「{goal}」在等你</p>

        <div style={sealStyles.divider} />

        {/* Hold ring */}
        <div style={sealStyles.ringWrap}>
          {/* Outer pulse ring */}
          <div style={{
            ...sealStyles.pulseRing,
            transform: pulse ? "scale(1.08)" : "scale(1)",
            opacity: pulse ? 0.15 : 0.05,
          }} />

          <svg width={r*2+20} height={r*2+20} viewBox={`0 0 ${r*2+20} ${r*2+20}`}
            style={{ transform: "rotate(-90deg)", position: "absolute" }}>
            <circle cx={r+10} cy={r+10} r={r} fill="none" stroke="rgba(244,239,230,0.12)" strokeWidth="1" />
            <circle cx={r+10} cy={r+10} r={r} fill="none"
              stroke={done ? "#A8C5A0" : "rgba(244,239,230,0.7)"}
              strokeWidth={done ? "2" : "1.5"}
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - holdPct)}
              strokeLinecap="round"
              style={{ transition: done ? "stroke 0.5s" : "none" }}
            />
          </svg>

          <div style={sealStyles.ringCenter}>
            {done
              ? <span style={sealStyles.ringDoneText}>✓</span>
              : <span style={sealStyles.ringIdleText}>{holding ? "…" : "长按"}</span>
            }
          </div>
        </div>

        <p style={sealStyles.holdHint}>
          {done ? "正在熄屏……" : holding ? `再坚持一下` : "长按圆圈，确认放下手机"}
        </p>

        {/* Invisible big touch target for hold */}
        {!done && (
          <div
            style={sealStyles.touchTarget}
            onMouseDown={startHold}
            onMouseUp={endHold}
            onMouseLeave={endHold}
            onTouchStart={e => { e.preventDefault(); startHold(); }}
            onTouchEnd={endHold}
          />
        )}

        <div style={sealStyles.divider} />

        {/* Give up */}
        {!done && (
          <button style={sealStyles.giveUpLink} onClick={() => setShowGiveUp(true)}>
            再刷 5 分钟
          </button>
        )}
      </div>

      {/* Give up confirm */}
      {showGiveUp && (
        <div style={sealStyles.modalOverlay}>
          <div style={sealStyles.modal}>
            <p style={sealStyles.modalTitle}>确定放弃？</p>
            <p style={sealStyles.modalSub}>这次「{goal}」就先不做了。</p>
            <div style={sealStyles.modalRow}>
              <button style={sealStyles.modalCancel} onClick={() => setShowGiveUp(false)}>回去放下</button>
              <button style={sealStyles.modalConfirm} onClick={onGiveUp}>放弃</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Focus Timer (original) ────────────────────────────────────────────────────
function FocusTimer({ session, onDone, onGiveUp }) {
  const { goal, durationMs, startTime } = session;
  const [remaining, setRemaining] = useState(durationMs);
  const [quote, setQuote] = useState("静下来，让时间为你服务。");
  const [loading, setLoading] = useState(false);
  const [checks, setChecks] = useState(0);
  const [showQuit, setShowQuit] = useState(false);
  const [entered, setEntered] = useState(false);
  const timerRef = useRef();
  useEffect(() => { setTimeout(() => setEntered(true), 60); }, []);
  const pct = Math.round(((durationMs - remaining) / durationMs) * 100);
  const progress = 1 - remaining / durationMs;
  const urgency = remaining < durationMs * 0.15 ? "critical" : remaining < durationMs * 0.45 ? "warning" : "ok";
  const accentColor = urgency === "critical" ? "#8B2020" : urgency === "warning" ? "#7A5C1E" : "#2C4A3E";

  useEffect(() => {
    timerRef.current = setInterval(() => {
      const rem = Math.max(0, durationMs - (Date.now() - startTime));
      setRemaining(rem);
      if (rem <= 0) { clearInterval(timerRef.current); onDone(); }
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  const nudge = async (n) => {
    if (loading) return;
    setLoading(true);
    const line = await getAILine({ goal, pct, n });
    setQuote(line);
    setLoading(false);
    setChecks(n);
  };

  useEffect(() => {
    const delays = [75000, 210000, 210000, 180000];
    let c = 0;
    const next = (i) => {
      if (i >= delays.length) return;
      const t = setTimeout(() => { c++; nudge(c); next(i + 1); }, delays[i]);
      return t;
    };
    next(0);
  }, []);

  return (
    <div style={{ ...S.page, opacity: entered ? 1 : 0, transition: "opacity 0.8s ease" }}>
      <GrainLayer />
      <div style={S.strip}>
        <button style={S.quitLink} onClick={() => setShowQuit(true)}>结束</button>
        <span style={S.stripGoal}>{goal}</span>
        <span style={S.stripTime}>{formatTime(new Date(startTime + durationMs))}</span>
      </div>
      <div style={S.timerBody}>
        <div style={S.ringWrap}>
          <Ring progress={progress} color={accentColor} />
          <div style={S.ringInner}>
            <div style={{ ...S.bigTime, color: accentColor }}>{formatCountdown(remaining)}</div>
            <div style={S.bigLabel}>剩余时间</div>
          </div>
        </div>
        <div style={S.ornament}>❧</div>
        <div style={S.quoteWrap}>
          <p style={{ ...S.quoteText, opacity: loading ? 0.3 : 1, transition: "opacity 0.4s" }}>
            {loading ? "……" : `「${quote}」`}
          </p>
        </div>
        <button style={S.nudgeBtn} onClick={() => nudge(checks + 1)} disabled={loading}>
          {loading ? "聆听中" : "再提醒我一次"}
        </button>
        <div style={S.bottomRow}>
          <div style={S.pctBar}>
            <div style={{ ...S.pctFill, width: `${pct}%`, background: accentColor }} />
          </div>
          <span style={{ ...S.pctNum, color: accentColor }}>{pct}%</span>
        </div>
      </div>
      {showQuit && (
        <div style={S.overlay}>
          <div style={S.modal}>
            <div style={S.modalRule} />
            <p style={S.modalTitle}>离开专注？</p>
            <p style={S.modalSub}>「{goal}」尚未完成。</p>
            <div style={S.modalBtns}>
              <button style={S.modalBack} onClick={() => setShowQuit(false)}>继续专注</button>
              <button style={S.modalLeave} onClick={onGiveUp}>暂时离开</button>
            </div>
            <div style={S.modalRule} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Done Screen ───────────────────────────────────────────────────────────────
function DoneScreen({ session, didGiveUp, onReset }) {
  const mins = Math.round((Date.now() - session.startTime) / 60000);
  const [entered, setEntered] = useState(false);
  useEffect(() => { setTimeout(() => setEntered(true), 60); }, []);
  return (
    <div style={{ ...S.page, opacity: entered ? 1 : 0, transition: "opacity 0.9s ease" }}>
      <GrainLayer />
      <div style={S.doneWrap}>
        <div style={S.doneGlyph}>{didGiveUp ? "○" : "◉"}</div>
        <h2 style={S.doneTitle}>{didGiveUp ? "下次继续" : "已完成"}</h2>
        <div style={S.doneRule} />
        <p style={S.doneGoal}>「{session.goal}」</p>
        <p style={S.doneStat}>{mins} 分钟</p>
        <p style={S.doneNote}>
          {didGiveUp
            ? "每一次尝试都是积累，\n明天再来一次。"
            : session.mode === "bedtime"
              ? "你信守了对自己的承诺，\n好好休息。"
              : "你信守了对自己的承诺，\n这值得被记住。"}
        </p>
        <div style={S.doneRule} />
        <button style={S.mainBtn} onClick={onReset}>重新开始</button>
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  // screen: setup | bedtime-timer | seal | focus-timer | done
  const [screen, setScreen] = useState("setup");
  const [session, setSession] = useState(null);
  const [gaveUp, setGaveUp] = useState(false);

  const handleStart = async (s) => {
    await requestNotifPermission();
    const sess = { ...s, startTime: Date.now() };
    setSession(sess);
    scheduleNotification({ delayMs: s.durationMs, goal: s.goal, mode: s.mode });
    setScreen(s.mode === "bedtime" ? "bedtime-timer" : "focus-timer");
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@300;400;600&family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; background: #F4EFE6; }
        input::placeholder { color: #B8AFA0; }
        input:focus { outline: none; }
        button:focus { outline: none; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes errShake {
          0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)}
        }
        @keyframes sealPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(244,239,230,0.15); }
          50% { box-shadow: 0 0 0 24px rgba(244,239,230,0); }
        }
      `}</style>

      {screen === "setup" && <SetupScreen onStart={handleStart} />}

      {screen === "bedtime-timer" && session && (
        <BedtimeTimer
          session={session}
          onTimeUp={() => { cancelNotification(); setScreen("seal"); }}
          onGiveUp={() => { cancelNotification(); setGaveUp(true); setScreen("done"); }}
        />
      )}

      {screen === "seal" && session && (
        <SealScreen
          goal={session.goal}
          onSuccess={() => { setGaveUp(false); setScreen("done"); }}
          onGiveUp={() => { setGaveUp(true); setScreen("done"); }}
        />
      )}

      {screen === "focus-timer" && session && (
        <FocusTimer
          session={session}
          onDone={() => { cancelNotification(); setGaveUp(false); setScreen("done"); }}
          onGiveUp={() => { cancelNotification(); setGaveUp(true); setScreen("done"); }}
        />
      )}

      {screen === "done" && session && (
        <DoneScreen
          session={session}
          didGiveUp={gaveUp}
          onReset={() => { cancelNotification(); setSession(null); setGaveUp(false); setScreen("setup"); }}
        />
      )}
    </>
  );
}

// ── Seal Screen Styles ────────────────────────────────────────────────────────
const sealStyles = {
  bg: {
    position: "fixed", inset: 0,
    background: "#0C0A08",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'Noto Serif SC', 'Cormorant Garamond', serif",
    zIndex: 999,
    animation: "fadeUp 0.6s ease both",
  },
  vignette: {
    position: "absolute", inset: 0, pointerEvents: "none",
    background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)",
  },
  inner: {
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "40px 32px", maxWidth: 360, width: "100%",
    position: "relative", zIndex: 1,
  },
  title: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 38, fontWeight: 300,
    color: "rgba(244,239,230,0.92)",
    letterSpacing: "0.2em",
    marginBottom: 10,
  },
  sub: {
    color: "rgba(244,239,230,0.4)",
    fontSize: 14, letterSpacing: "0.1em",
    marginBottom: 24, textAlign: "center",
  },
  divider: {
    width: 60, height: 1,
    background: "rgba(244,239,230,0.12)",
    marginBottom: 32,
  },
  ringWrap: {
    position: "relative",
    width: 160, height: 160,
    display: "flex", alignItems: "center", justifyContent: "center",
    marginBottom: 20,
  },
  pulseRing: {
    position: "absolute", inset: -20,
    borderRadius: "50%",
    border: "1px solid rgba(244,239,230,0.4)",
    transition: "transform 1.8s ease, opacity 1.8s ease",
  },
  ringCenter: {
    position: "absolute", inset: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  ringIdleText: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 22, fontWeight: 300,
    color: "rgba(244,239,230,0.7)",
    letterSpacing: "0.15em",
    userSelect: "none",
  },
  ringDoneText: {
    fontSize: 32,
    color: "#A8C5A0",
  },
  holdHint: {
    color: "rgba(244,239,230,0.35)",
    fontSize: 12, letterSpacing: "0.12em",
    textAlign: "center", marginBottom: 32,
    minHeight: 20,
  },
  touchTarget: {
    position: "absolute",
    top: "50%", left: "50%",
    transform: "translate(-50%, -50%)",
    width: 200, height: 200,
    borderRadius: "50%",
    cursor: "pointer",
    zIndex: 10,
    userSelect: "none",
    WebkitUserSelect: "none",
  },
  giveUpLink: {
    background: "transparent", border: "none",
    color: "rgba(244,239,230,0.2)",
    fontSize: 12, letterSpacing: "0.12em",
    cursor: "pointer",
    fontFamily: "'Noto Serif SC', serif",
    marginTop: 8,
    transition: "color 0.3s",
  },
  modalOverlay: {
    position: "fixed", inset: 0,
    background: "rgba(12,10,8,0.9)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 200,
    backdropFilter: "blur(4px)",
  },
  modal: {
    background: "#1A1612",
    border: "1px solid rgba(244,239,230,0.1)",
    borderRadius: 4,
    padding: "36px 32px",
    maxWidth: 300, width: "90%",
    textAlign: "center",
    fontFamily: "'Noto Serif SC', serif",
  },
  modalTitle: {
    color: "rgba(244,239,230,0.85)",
    fontSize: 20, fontWeight: 300,
    letterSpacing: "0.12em",
    marginBottom: 10,
    fontFamily: "'Cormorant Garamond', serif",
  },
  modalSub: {
    color: "rgba(244,239,230,0.3)",
    fontSize: 13, marginBottom: 24,
    letterSpacing: "0.06em",
  },
  modalRow: { display: "flex", gap: 10 },
  modalCancel: {
    flex: 2, background: "rgba(244,239,230,0.08)",
    border: "1px solid rgba(244,239,230,0.15)",
    color: "rgba(244,239,230,0.7)",
    padding: "12px 0", fontSize: 12,
    letterSpacing: "0.1em", cursor: "pointer",
    fontFamily: "'Noto Serif SC', serif", borderRadius: 2,
  },
  modalConfirm: {
    flex: 1, background: "transparent",
    border: "1px solid rgba(244,239,230,0.08)",
    color: "rgba(244,239,230,0.25)",
    padding: "12px 0", fontSize: 12,
    letterSpacing: "0.08em", cursor: "pointer",
    fontFamily: "'Noto Serif SC', serif", borderRadius: 2,
  },
};

// ── Main styles (paper theme) ─────────────────────────────────────────────────
const serif = "'Cormorant Garamond', 'Noto Serif SC', serif";
const serifCN = "'Noto Serif SC', 'Cormorant Garamond', serif";
const ink = "#1C1814";
const paper = "#F4EFE6";
const faint = "#D6CEC2";
const mid = "#8C8078";

const S = {
  page: {
    minHeight: "100vh", background: paper,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: serifCN, color: ink,
    position: "relative", overflow: "hidden",
  },
  setupWrap: {
    width: "100%", maxWidth: 380,
    padding: "48px 32px 56px",
    position: "relative", zIndex: 1,
    animation: "fadeUp 0.7s ease both",
  },
  mono: {
    fontFamily: serif, fontSize: 42, fontWeight: 300,
    letterSpacing: "0.35em", color: ink, textAlign: "center", marginBottom: 10,
  },
  tagline: {
    textAlign: "center", color: mid, fontSize: 13,
    letterSpacing: "0.12em", fontWeight: 300, marginBottom: 28,
  },
  rule: {
    height: 1,
    background: `linear-gradient(to right, transparent, ${faint}, transparent)`,
    marginBottom: 28,
  },

  // Mode tabs
  modeRow: {
    display: "flex", gap: 0, marginBottom: 12,
    border: `1px solid ${faint}`, borderRadius: 2, overflow: "hidden",
  },
  modeTab: {
    flex: 1, background: "transparent", border: "none",
    color: mid, fontSize: 12, padding: "10px 0",
    letterSpacing: "0.1em", cursor: "pointer",
    fontFamily: serifCN, transition: "all 0.25s",
  },
  modeTabOn: { background: ink, color: paper },
  modeDesc: {
    color: faint, fontSize: 11, letterSpacing: "0.06em",
    lineHeight: 1.7, textAlign: "center", marginBottom: 24,
  },

  fieldGroup: { marginBottom: 28 },
  fieldErr: { animation: "errShake 0.5s ease" },
  fieldLabel: {
    display: "block", fontSize: 10, letterSpacing: "0.22em",
    textTransform: "uppercase", color: mid, marginBottom: 12, fontFamily: serifCN,
  },
  fieldInput: {
    width: "100%", background: "transparent", border: "none",
    fontSize: 20, fontFamily: serifCN, fontWeight: 300,
    color: ink, padding: "4px 0 10px", letterSpacing: "0.04em",
  },
  fieldLine: { height: 1, background: faint },

  presetRow: { display: "flex", gap: 8, marginBottom: 20 },
  presetPill: {
    flex: 1, background: "transparent", border: `1px solid ${faint}`,
    borderRadius: 20, color: mid, fontSize: 12, padding: "7px 0",
    cursor: "pointer", letterSpacing: "0.06em", fontFamily: serifCN, transition: "all 0.25s",
  },
  presetPillOn: { background: ink, borderColor: ink, color: paper },

  spinnerRow: { display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 16 },
  spinner: { display: "flex", alignItems: "center", gap: 10 },
  spinBtn: {
    width: 28, height: 28, background: "transparent", border: `1px solid ${faint}`,
    borderRadius: "50%", color: mid, fontSize: 16, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: serif, transition: "all 0.2s",
  },
  spinVal: {
    fontFamily: serif, fontSize: 34, fontWeight: 300,
    color: ink, minWidth: 50, textAlign: "center", letterSpacing: "0.05em",
  },
  spinLabel: { color: mid, fontSize: 12, letterSpacing: "0.1em" },
  colon: { fontFamily: serif, fontSize: 28, color: faint, marginBottom: 10 },

  mainBtn: {
    display: "block", width: "100%", background: ink, color: paper, border: "none",
    borderRadius: 2, padding: "16px 0", fontSize: 14, letterSpacing: "0.2em",
    textTransform: "uppercase", cursor: "pointer", fontFamily: serifCN,
    fontWeight: 400, marginTop: 8, marginBottom: 16, transition: "opacity 0.2s",
  },
  footnote: { textAlign: "center", color: faint, fontSize: 11, letterSpacing: "0.08em", lineHeight: 1.7 },

  strip: {
    position: "fixed", top: 0, left: 0, right: 0,
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "18px 28px", borderBottom: `1px solid ${faint}`,
    background: "rgba(244,239,230,0.88)", backdropFilter: "blur(8px)", zIndex: 10,
  },
  quitLink: {
    background: "transparent", border: "none", color: mid,
    fontSize: 12, letterSpacing: "0.1em", cursor: "pointer", fontFamily: serifCN,
  },
  stripGoal: {
    fontSize: 13, color: ink, letterSpacing: "0.08em",
    maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  stripTime: { fontSize: 12, color: mid, letterSpacing: "0.05em" },

  timerBody: {
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "100px 32px 60px",
    position: "relative", zIndex: 1,
    maxWidth: 420, width: "100%",
    animation: "fadeUp 0.6s ease both",
  },
  ringWrap: {
    position: "relative", width: 220, height: 220,
    display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 28,
  },
  ringInner: {
    position: "absolute", inset: 0,
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  },
  bigTime: { fontFamily: serif, fontSize: 44, fontWeight: 300, letterSpacing: "0.08em", transition: "color 2s ease" },
  bigLabel: { color: mid, fontSize: 10, letterSpacing: "0.2em", marginTop: 4, textTransform: "uppercase" },
  ornament: { color: faint, fontSize: 22, marginBottom: 20, userSelect: "none" },

  quoteWrap: {
    minHeight: 60, display: "flex", alignItems: "center", justifyContent: "center",
    marginBottom: 28, padding: "0 16px", textAlign: "center",
  },
  quoteText: {
    fontFamily: serif, fontStyle: "italic", fontSize: 17, fontWeight: 300,
    color: ink, lineHeight: 1.8, letterSpacing: "0.04em",
  },
  nudgeBtn: {
    background: "transparent", border: `1px solid ${faint}`, color: mid, borderRadius: 2,
    padding: "10px 24px", fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase",
    cursor: "pointer", fontFamily: serifCN, marginBottom: 36, transition: "all 0.25s",
  },
  bottomRow: { width: "100%", display: "flex", alignItems: "center", gap: 12 },
  pctBar: { flex: 1, height: 1, background: faint, position: "relative", overflow: "hidden" },
  pctFill: { position: "absolute", left: 0, top: 0, bottom: 0, transition: "width 1s linear, background 2s ease" },
  pctNum: { fontFamily: serif, fontSize: 13, fontWeight: 300, minWidth: 36, textAlign: "right", letterSpacing: "0.05em", transition: "color 2s ease" },

  overlay: {
    position: "fixed", inset: 0, background: "rgba(244,239,230,0.92)",
    backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 100, animation: "fadeUp 0.3s ease both",
  },
  modal: {
    width: "90%", maxWidth: 320, padding: "36px 32px",
    background: paper, textAlign: "center",
  },
  modalRule: { height: 1, background: faint, marginBottom: 28 },
  modalTitle: { fontFamily: serif, fontSize: 24, fontWeight: 300, letterSpacing: "0.1em", marginBottom: 12, color: ink },
  modalSub: { color: mid, fontSize: 14, marginBottom: 28, letterSpacing: "0.06em" },
  modalBtns: { display: "flex", gap: 12, marginBottom: 28 },
  modalBack: {
    flex: 2, background: ink, color: paper, border: "none",
    padding: "12px 0", fontSize: 12, letterSpacing: "0.15em",
    textTransform: "uppercase", cursor: "pointer", fontFamily: serifCN, borderRadius: 2,
  },
  modalLeave: {
    flex: 1, background: "transparent", color: mid, border: `1px solid ${faint}`,
    padding: "12px 0", fontSize: 12, letterSpacing: "0.1em",
    textTransform: "uppercase", cursor: "pointer", fontFamily: serifCN, borderRadius: 2,
  },

  doneWrap: {
    width: "100%", maxWidth: 380, padding: "60px 32px",
    textAlign: "center", position: "relative", zIndex: 1,
    animation: "fadeUp 0.8s ease both",
  },
  doneGlyph: { fontFamily: serif, fontSize: 48, fontWeight: 300, color: mid, marginBottom: 16, letterSpacing: "0.1em" },
  doneTitle: { fontFamily: serif, fontSize: 32, fontWeight: 300, letterSpacing: "0.25em", color: ink, marginBottom: 24 },
  doneRule: { height: 1, background: `linear-gradient(to right, transparent, ${faint}, transparent)`, marginBottom: 24 },
  doneGoal: { fontFamily: serif, fontStyle: "italic", fontSize: 18, fontWeight: 300, color: ink, marginBottom: 12, letterSpacing: "0.06em" },
  doneStat: { color: mid, fontSize: 13, letterSpacing: "0.12em", marginBottom: 24 },
  doneNote: { color: mid, fontSize: 14, lineHeight: 2, letterSpacing: "0.06em", whiteSpace: "pre-line", marginBottom: 32 },
};
