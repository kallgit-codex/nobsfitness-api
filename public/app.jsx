const { useState, useEffect, useRef } = React;

// ═══════════════════════════════════════════════
// DATA & CALCULATIONS
// ═══════════════════════════════════════════════

const ARCHETYPES = {
  male: [
    { id: "shredded", label: "Shredded", bf: 8, desc: "Competition lean. Veins, separation.", emoji: "🔪", effort: "Extreme" },
    { id: "athletic", label: "Athletic Lean", bf: 12, desc: "Visible abs, defined arms.", emoji: "⚡", effort: "High" },
    { id: "fit", label: "Fit", bf: 16, desc: "Good shape, some definition.", emoji: "💪", effort: "Moderate" },
    { id: "average", label: "Average", bf: 22, desc: "Normal build, no visible abs.", emoji: "👤", effort: "Low" },
    { id: "bulky", label: "Muscular/Bulky", bf: 15, desc: "Size + strength over cuts.", emoji: "🦬", effort: "High", extraMuscle: 8 },
  ],
  female: [
    { id: "competition", label: "Stage Lean", bf: 14, desc: "Competition level.", emoji: "🔪", effort: "Extreme" },
    { id: "athletic", label: "Athletic", bf: 18, desc: "Visible muscle definition.", emoji: "⚡", effort: "High" },
    { id: "toned", label: "Toned", bf: 22, desc: "Lean with shape.", emoji: "💪", effort: "Moderate" },
    { id: "fit", label: "Fit", bf: 26, desc: "Healthy, active look.", emoji: "👤", effort: "Low" },
    { id: "strong", label: "Strong/Curvy", bf: 23, desc: "Muscle with curves.", emoji: "🦬", effort: "High", extraMuscle: 5 },
  ],
};

const ACTIVITY = [
  { id: "sedentary", label: "Sedentary", mult: 1.2 },
  { id: "light", label: "Light", mult: 1.375 },
  { id: "moderate", label: "Moderate", mult: 1.55 },
  { id: "very", label: "Very Active", mult: 1.725 },
  { id: "athlete", label: "Athlete", mult: 1.9 },
];

// Katch-McArdle BMR — gold standard when lean mass is known
function calcBMR(leanKg) { return 370 + 21.6 * leanKg; }
function lbsToKg(lbs) { return lbs * 0.453592; }
function kgToLbs(kg) { return kg / 0.453592; }

// Deurenberg BF% estimate from BMI
function estBF(sex, w, h, age) {
  const bmi = (w / (h * h)) * 703;
  return Math.max(5, Math.min(45, Math.round(sex === "male" ? 1.2 * bmi + 0.23 * age - 16.2 : 1.2 * bmi + 0.23 * age - 5.4)));
}

function buildPlan(sex, wLbs, bf, arch, actMult) {
  const tBF = arch.bf, extra = arch.extraMuscle || 0;
  const wKg = lbsToKg(wLbs), leanKg = wKg * (1 - bf / 100), fatKg = wKg * bf / 100;
  const tLeanKg = leanKg + lbsToKg(extra), tWKg = tLeanKg / (1 - tBF / 100);
  const tdee = Math.round(calcBMR(leanKg) * actMult), tTdee = Math.round(calcBMR(tLeanKg) * actMult);
  const fatLoss = Math.max(0, Math.round(kgToLbs(fatKg - tWKg * tBF / 100)));
  const muscGain = Math.max(0, Math.round(kgToLbs(tLeanKg - leanKg) * 10) / 10);
  // Safe rates: 1-1.5 lb/wk fat loss (500-750cal deficit), ~1.5 lb/month muscle (male), ~0.75 lb/month (female)
  const cutWk = fatLoss > 2 ? Math.ceil(fatLoss / 1.25) : 0;
  const muscPerWk = sex === "male" ? 0.375 : 0.19; // ~1.5 lb/mo male, ~0.75 lb/mo female (realistic natural rate)
  const buildWk = muscGain > 1 ? Math.ceil(muscGain / muscPerWk) : 0;
  const totalWk = cutWk + buildWk + (cutWk > 0 && buildWk > 0 ? 3 : 0) + 2;
  const prot = Math.round(wLbs * 1.0);
  const cutCal = cutWk > 0 ? Math.round(tdee - 500) : null;
  const buildCal = buildWk > 0 ? Math.round(tTdee + 300) : null;

  const phases = [];
  phases.push({ name: "Ramp Up", wk: 2, cal: tdee, color: "#a78bfa", goal: "Build habits. Track everything. Learn the movements.", prot });
  if (cutWk > 0) phases.push({ name: "Cut", wk: cutWk, cal: cutCal, color: "#ef4444", goal: `Lose ${fatLoss} lbs fat at ~1.25 lbs/week.`, prot });
  if (cutWk > 0 && buildWk > 0) phases.push({ name: "Reverse Diet", wk: 3, cal: tTdee, color: "#666", goal: "Bridge to building phase.", prot });
  if (buildWk > 0) phases.push({ name: "Build", wk: buildWk, cal: buildCal, color: "#3b82f6", goal: `Gain ~${muscGain} lbs lean muscle.`, prot });
  phases.push({ name: "Maintain ∞", wk: null, cal: tTdee, color: "#22c55e", goal: `${tTdee} cal/day forever.`, prot: Math.round(kgToLbs(tLeanKg) * 0.8) });

  return { arch, wLbs, tWLbs: Math.round(kgToLbs(tWKg)), bf, tBF, tdee, tTdee, fatLoss, muscGain, cutWk, buildWk, totalWk, cutCal, buildCal, prot, phases, sex };
}

// ═══════════════════════════════════════════════
// KONTEXT PRO PROMPT BUILDER
// ═══════════════════════════════════════════════

function buildKontextPrompt(sex, currentBF, targetArch, targetWeight, heightIn) {
  const tBF = targetArch.bf;
  const extra = targetArch.extraMuscle || 0;
  const needsMass = extra > 0 || targetWeight > 220;
  const htFt = Math.floor(heightIn / 12);
  const htInch = heightIn % 12;

  let bodyDesc;
  if (needsMass && tBF <= 15) {
    bodyDesc = `Transform this ${sex === "male" ? "man" : "woman"}'s body to show what they would look like at ${targetWeight} pounds and ${tBF} percent body fat. They are ${htFt}'${htInch}". This is significant lean muscle mass - they should look like a serious powerbuilder who is also lean. Significantly increase overall muscle mass - much fuller chest with upper/lower separation, bigger rounder shoulder delts, larger thicker arms, more prominent traps, wider lats creating a dramatic V-taper. Show defined visible abs with clear obliques and serratus despite the heavy weight. Add visible vascularity in arms and shoulders.`;
  } else if (tBF <= 10) {
    bodyDesc = `Transform this ${sex === "male" ? "man" : "woman"}'s body to show approximately ${tBF} percent body fat after a dedicated 16-week cut. Dramatically reduce midsection fat to reveal a clearly visible six-pack. Show prominent V-taper with visible obliques and serratus anterior. Add clear muscle separation and striations in chest and shoulder delts. Show defined vascularity in forearms and biceps. Slim the waist noticeably while keeping wide shoulders.`;
  } else if (tBF <= 16) {
    bodyDesc = `Edit only this ${sex === "male" ? "man" : "woman"}'s body composition to approximately ${tBF} percent body fat. Reduce subcutaneous fat around the midsection to reveal defined abdominal muscles. Slim the waist slightly while maintaining the existing broad shoulder structure. Add subtle muscle separation and definition to the chest, shoulders, and arms.`;
  } else {
    bodyDesc = `Edit this ${sex === "male" ? "man" : "woman"}'s body to show a healthy ${tBF} percent body fat physique. Slight reduction in midsection softness, slightly more defined arms and shoulders. Keep changes subtle and natural.`;
  }

  return `${bodyDesc}\n\nMake these changes to the BODY ONLY:\n- Keep the same overall proportions — same person, not a different body\n- DO NOT change: face, hair, beard, tattoo design/placement, clothing, phone, background, or any environment detail\n- DO NOT change lighting, camera angle, or composition\n- Maintain exact skin tone, freckling, body hair, skin texture with visible pores\n- Keep any tattoos exactly as they appear\n- This must look like a real unedited progress photo, not AI-generated\n- Preserve exact same pose and camera angle`;
}

// ═══════════════════════════════════════════════
// COACH SYSTEM PROMPT
// ═══════════════════════════════════════════════

function buildCoachSystem(plan, weekNum) {
  const phase = weekNum <= 2 ? "Ramp Up" : plan.cutWk > 0 && weekNum <= 2 + plan.cutWk ? "Cut" : plan.buildWk > 0 ? "Build" : "Maintain";
  const cal = phase === "Ramp Up" ? plan.tdee : phase === "Cut" ? plan.cutCal : phase === "Build" ? plan.buildCal : plan.tTdee;

  return `You are an AI fitness coach. Your avatar is a photo of the user at their GOAL physique — you literally look like the best version of them. You ARE who they're becoming.

PERSONALITY: Direct, no-BS, genuinely encouraging. Like a friend who's jacked and knows their shit. Casual language. Short sentences. Never preachy. Never say "great question."

USER PROFILE:
- Sex: ${plan.sex} | ${plan.arch.label} target — ${plan.tWLbs} lbs at ${plan.tBF}% body fat
- Starting: ${plan.wLbs} lbs, ${plan.bf}% BF | TDEE: ${plan.tdee} cal → Target maintenance: ${plan.tTdee} cal
- Fat to lose: ${plan.fatLoss} lbs | Muscle to gain: ${plan.muscGain} lbs
- Journey: ~${plan.totalWk} weeks | Protein: ${plan.prot}g/day

CURRENT: Week ${weekNum}/${plan.totalWk} | Phase: ${phase} | Target: ${cal} cal/day

RULES:
1. Keep responses under 120 words unless generating a workout plan
2. Tie advice to THEIR specific numbers
3. If they ask about supplements/hacks, redirect to basics (calories, protein, progressive overload, sleep)
4. Occasionally reference being their future self — subtle, not corny. "I'm what happens when you stick to this."
5. If they ask about what to eat, give concrete meal examples that hit their macro targets
6. WORKOUT GENERATION: If they ask for a workout plan, generate a complete structured plan. Format it as JSON inside <workout_json>...</workout_json> tags. The JSON should be: {"name":"Plan Name","split":"e.g. Upper/Lower 4x","weeks":"e.g. 8","days":[{"day":"Mon","name":"Upper Strength","exercises":[{"name":"Bench Press","sets":"4","reps":"6-8","rest":"2-3min","notes":"Progressive overload — add 5lbs when you hit 4x8"}]}]}. Include 4-7 exercises per day, with sets, reps, rest, and practical notes. Make the plan specific to their phase (${phase}) and goals.`;
}

// ═══════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════

const M = "'JetBrains Mono', monospace";
const F = "'Outfit', sans-serif";

function CoachBubble({ text, isCoach, avatarUrl, onAvatarClick }) {
  // Strip workout JSON from display text
  const displayText = text.replace(/<workout_json>[\s\S]*?<\/workout_json>/g, "").trim();
  if (!displayText) return null;
  return (
    <div style={{ display: "flex", gap: 10, flexDirection: isCoach ? "row" : "row-reverse", marginBottom: 14, alignItems: "flex-start" }}>
      {isCoach && (
        <div onClick={onAvatarClick} style={{ width: 34, height: 34, borderRadius: "50%", overflow: "hidden", border: "2px solid #22c55e", flexShrink: 0, background: "#0a2a0a", cursor: avatarUrl ? "pointer" : "default" }}>
          {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> :
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, background: "linear-gradient(135deg,#22c55e33,#3b82f633)" }}>⚡</div>}
        </div>
      )}
      <div style={{
        maxWidth: "80%", padding: "10px 14px",
        borderRadius: isCoach ? "4px 14px 14px 14px" : "14px 4px 14px 14px",
        background: isCoach ? "#111" : "#22c55e15", border: isCoach ? "1px solid #222" : "1px solid #22c55e33",
        fontSize: 13, lineHeight: 1.55, color: "#ddd", whiteSpace: "pre-wrap",
      }}>
        {isCoach && <div style={{ fontSize: 9, fontFamily: M, color: "#22c55e", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.12em" }}>Future You</div>}
        {displayText}
      </div>
    </div>
  );
}

function ImageViewer({ url, onClose }) {
  if (!url) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.92)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: 20, cursor: "pointer",
    }}>
      <div style={{ fontSize: 10, fontFamily: M, color: "#22c55e", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12 }}>Your Future Self</div>
      <img src={url} alt="Future You" style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 12, border: "2px solid #22c55e33", objectFit: "contain" }} />
      <div style={{ fontSize: 11, color: "#555", marginTop: 12, fontFamily: M }}>Tap anywhere to close</div>
    </div>
  );
}

function PhasePill({ p }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#111", border: "1px solid #222", borderRadius: 8, borderLeft: `3px solid ${p.color}` }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#ddd" }}>{p.name} {p.wk && <span style={{ fontFamily: M, fontSize: 11, color: "#555" }}>({p.wk}wk)</span>}</div>
        <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{p.goal}</div>
      </div>
      <div style={{ fontFamily: M, fontSize: 15, fontWeight: 700, color: p.color }}>{p.cal}<span style={{ fontSize: 9, color: "#555" }}>cal</span></div>
    </div>
  );
}

function WorkoutView({ workout, onGenerate, generating }) {
  if (!workout) return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, overflowY: "auto" }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>🏋️</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#ddd", marginBottom: 6 }}>No workout plan yet</div>
      <div style={{ fontSize: 13, color: "#666", marginBottom: 24, textAlign: "center", maxWidth: 280 }}>
        Your coach will build a custom plan based on your stats, phase, and goals.
      </div>
      <button onClick={onGenerate} disabled={generating} style={{
        padding: "14px 32px", background: generating ? "#333" : "#22c55e", color: generating ? "#888" : "#000",
        border: "none", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: generating ? "wait" : "pointer",
        fontFamily: F, textTransform: "uppercase",
      }}>{generating ? "Generating..." : "Generate My Workout Plan"}</button>
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#e5e5e5" }}>{workout.name}</div>
        <div style={{ fontSize: 11, fontFamily: M, color: "#555", marginTop: 2 }}>{workout.split} · {workout.weeks} weeks</div>
      </div>
      {(workout.days || []).map((day, di) => (
        <div key={di} style={{ background: "#111", border: "1px solid #222", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ fontFamily: M, fontSize: 11, color: "#22c55e", fontWeight: 700 }}>{day.day}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#ddd", marginLeft: 10 }}>{day.name}</span>
            </div>
            <span style={{ fontFamily: M, fontSize: 10, color: "#555" }}>{(day.exercises || []).length} exercises</span>
          </div>
          {(day.exercises || []).map((ex, ei) => (
            <div key={ei} style={{ padding: "8px 14px", borderBottom: ei < day.exercises.length - 1 ? "1px solid #1a1a1a" : "none", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: 4, background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontFamily: M, color: "#555", flexShrink: 0 }}>{ei + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: "#ccc" }}>{ex.name}</div>
                {ex.notes && <div style={{ fontSize: 10, color: "#555", marginTop: 1 }}>{ex.notes}</div>}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: M, fontSize: 12, color: "#888" }}>{ex.sets}×{ex.reps}</div>
                <div style={{ fontFamily: M, fontSize: 9, color: "#444" }}>{ex.rest}</div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function CheckInWidget({ onSubmit, weekNum }) {
  const [w, setW] = useState("");
  const [c, setC] = useState("");
  const [s, setS] = useState("");
  const [f, setF] = useState("");
  const [n, setN] = useState("");
  const i2 = { background: "#0d0d0d", border: "1px solid #333", color: "#fff", padding: "8px 10px", borderRadius: 6, fontSize: 13, fontFamily: M, outline: "none", width: "100%", boxSizing: "border-box" };
  return (
    <div style={{ background: "#111", border: "1px solid #22c55e33", borderRadius: 10, padding: 16, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#22c55e", marginBottom: 12 }}>Week {weekNum} Check-In</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div><div style={{ fontSize: 10, fontFamily: M, color: "#555", marginBottom: 3 }}>WEIGHT</div><input type="number" value={w} onChange={e => setW(e.target.value)} style={i2} placeholder="lbs" /></div>
        <div><div style={{ fontSize: 10, fontFamily: M, color: "#555", marginBottom: 3 }}>AVG CALS</div><input type="number" value={c} onChange={e => setC(e.target.value)} style={i2} placeholder="/day" /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div><div style={{ fontSize: 10, fontFamily: M, color: "#555", marginBottom: 3 }}>SESSIONS</div><input type="number" value={s} onChange={e => setS(e.target.value)} style={i2} placeholder="#" /></div>
        <div>
          <div style={{ fontSize: 10, fontFamily: M, color: "#555", marginBottom: 3 }}>ENERGY</div>
          <div style={{ display: "flex", gap: 4 }}>
            {["😴", "😐", "😊", "🔥"].map((e, idx) => (
              <button key={idx} onClick={() => setF(["Low", "OK", "Good", "Great"][idx])} style={{
                flex: 1, padding: "6px 2px", fontSize: 16,
                background: f === ["Low", "OK", "Good", "Great"][idx] ? "#22c55e22" : "#0d0d0d",
                border: f === ["Low", "OK", "Good", "Great"][idx] ? "1px solid #22c55e" : "1px solid #333",
                borderRadius: 6, cursor: "pointer",
              }}>{e}</button>
            ))}
          </div>
        </div>
      </div>
      <textarea value={n} onChange={e => setN(e.target.value)} style={{ ...i2, height: 44, resize: "none", marginBottom: 10 }} placeholder="Notes (optional)" />
      <button onClick={() => onSubmit({ weight: w, cals: c, sessions: s, feeling: f, notes: n })} style={{
        width: "100%", padding: "10px", background: "#22c55e", color: "#000", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: F,
      }}>Submit & Get Feedback →</button>
    </div>
  );
}

// ═══════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════

function NoBSFitness() {
  const [screen, setScreen] = useState("onboard"); // onboard | generating | reveal | dashboard
  const [sex, setSex] = useState("male");
  const [age, setAge] = useState(28);
  const [wLbs, setWLbs] = useState(185);
  const [htFt, setHtFt] = useState(5);
  const [htIn, setHtIn] = useState(10);
  const [activity, setActivity] = useState("moderate");
  const [target, setTarget] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const fileRef = useRef(null);

  const [genProgress, setGenProgress] = useState(0);
  const [genStatus, setGenStatus] = useState("");
  const [futureUrl, setFutureUrl] = useState(null);
  const [genError, setGenError] = useState(null);

  const [plan, setPlan] = useState(null);
  const [tab, setTab] = useState("coach"); // coach | plan | workout
  const [weekNum, setWeekNum] = useState(1);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const [workout, setWorkout] = useState(null);
  const [genWorkout, setGenWorkout] = useState(false);
  const chatEnd = useRef(null);

  const totalIn = htFt * 12 + htIn;
  const bf = estBF(sex, wLbs, totalIn, age);
  const archs = ARCHETYPES[sex];
  const actMult = ACTIVITY.find(a => a.id === activity)?.mult || 1.55;

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  function onPhoto(e) {
    const f = e.target.files[0];
    if (f) {
      setPhoto(f);
      // Normalize orientation through canvas for display
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.naturalWidth, h = img.naturalHeight;
        const maxDim = 1200;
        if (w > maxDim || h > maxDim) {
          const scale = maxDim / Math.max(w, h);
          w = Math.round(w * scale); h = Math.round(h * scale);
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        setPhotoUrl(canvas.toDataURL("image/jpeg", 0.9));
      };
      img.src = URL.createObjectURL(f);
    }
  }

  // ─── Generate Future Self ───
  async function startGeneration() {
    if (!target) return;
    const arch = archs.find(a => a.id === target);
    const p = buildPlan(sex, wLbs, bf, arch, actMult);
    setPlan(p);
    setScreen("generating");
    setGenProgress(0);
    setGenStatus("Analyzing your physique...");
    setGenError(null);

    const prompt = buildKontextPrompt(sex, bf, arch, p.tWLbs, totalIn);
    let progressInterval;

    if (photoUrl && photo) {
      try {
        setGenProgress(10);
        setGenStatus("Reading your photo...");

        // Normalize EXIF orientation by drawing through canvas
        // This fixes rotated phone photos before sending to Kontext Pro
        const photoBase64 = await new Promise((res, rej) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            // Cap at 2048px to keep payload reasonable
            const maxDim = 2048;
            let w = img.naturalWidth, h = img.naturalHeight;
            if (w > maxDim || h > maxDim) {
              const scale = maxDim / Math.max(w, h);
              w = Math.round(w * scale);
              h = Math.round(h * scale);
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, w, h);
            res(canvas.toDataURL("image/jpeg", 0.92));
          };
          img.onerror = rej;
          img.src = URL.createObjectURL(photo);
        });

        setGenProgress(20);
        setGenStatus("Sending to Flux Kontext Pro...");

        const API_URL = window.location.origin;
        const genResp = await fetch(`${API_URL}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, image_base64: photoBase64 })
        });

        let prog = 25;
        progressInterval = setInterval(() => {
          prog += Math.random() * 2.5 + 0.5;
          if (prog > 88) prog = 88;
          setGenProgress(Math.round(prog));
          if (prog < 45) setGenStatus("Generating your future physique...");
          else if (prog < 65) setGenStatus("Sculpting muscle definition...");
          else if (prog < 80) setGenStatus("Refining details...");
          else setGenStatus("Almost there...");
        }, 2000);

        const genData = await genResp.json();
        clearInterval(progressInterval);

        if (genData.status === "succeeded" && genData.url) {
          setFutureUrl(genData.url);
          setGenProgress(100);
          setGenStatus("Your future self is ready.");
          await new Promise(r => setTimeout(r, 600));
          setScreen("reveal");
          return;
        } else { throw new Error(genData.error || "Generation failed"); }
      } catch (err) {
        if (progressInterval) clearInterval(progressInterval);
        console.log("Generation error:", err.message);
        setGenError(err.message);
        setGenProgress(60);
        setGenStatus("Continuing without photo transformation...");
      }
    }

    // Fallback
    let p2 = photoUrl ? 60 : 0;
    for (const msg of ["Calculating body composition...", "Building game plan...", "Mapping phases...", "Setting up coach..."]) {
      setGenStatus(msg); p2 += 20; setGenProgress(Math.min(95, p2));
      await new Promise(r => setTimeout(r, 600));
    }
    setGenProgress(100); setGenStatus("Ready.");
    await new Promise(r => setTimeout(r, 400));
    setScreen("dashboard");
    sendIntro(p);
  }

  function enterDashboard() {
    setScreen("dashboard");
    sendIntro(plan);
  }

  // ─── Coach Chat ───
  async function sendIntro(pl) {
    await sendMsg("This is our first interaction. Introduce yourself as my future self / coach. Tell me what you see in my stats, what phase I'm starting in, and give me Day 1 marching orders. Max 5 sentences.", pl, true);
  }

  async function sendMsg(content, pl, isIntro = false) {
    const p = pl || plan;
    if (!p) return;
    setLoading(true);
    if (!isIntro) setMessages(prev => [...prev, { role: "user", text: content }]);

    try {
      const history = messages.slice(-8).map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: buildCoachSystem(p, weekNum), messages: [...history, { role: "user", content }] })
      });
      const data = await resp.json();
      const reply = data.content?.map(b => b.text || "").join("") || "Connection issue — try again.";

      // Check for workout JSON in response
      const workoutMatch = reply.match(/<workout_json>([\s\S]*?)<\/workout_json>/);
      if (workoutMatch) {
        try {
          const w = JSON.parse(workoutMatch[1]);
          setWorkout(w);
          setTab("workout");
        } catch (e) { console.log("Failed to parse workout JSON"); }
      }

      setMessages(prev => [...prev, { role: "assistant", text: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", text: "Connection issue — hit send again." }]);
    }
    setLoading(false);
  }

  function handleSend() {
    if (!input.trim() || loading) return;
    const msg = input; setInput(""); sendMsg(msg);
  }

  function handleCheckIn(data) {
    setShowCheckIn(false);
    sendMsg(`Week ${weekNum} check-in: Weight ${data.weight}lbs, avg ${data.cals} cal/day, ${data.sessions} training sessions, feeling ${data.feeling}. ${data.notes || ""}`);
    setWeekNum(w => w + 1);
  }

  async function generateWorkout() {
    setGenWorkout(true);
    setTab("coach");
    await sendMsg("Generate a complete workout plan for me based on my current phase and goals. Include every training day with exercises, sets, reps, rest times, and practical notes. Make it specific to my body composition targets.");
    setGenWorkout(false);
  }

  const inp = { background: "#111", border: "1px solid #333", color: "#fff", padding: "10px 12px", borderRadius: 6, fontSize: 15, fontFamily: M, outline: "none", width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5, fontFamily: M };

  // ═══════════════════════════════════════════════
  // ONBOARDING
  // ═══════════════════════════════════════════════
  if (screen === "onboard") return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e5e5e5", fontFamily: F }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "44px 20px 60px" }}>
        <div style={{ fontSize: 10, letterSpacing: "0.2em", color: "#22c55e", fontFamily: M, marginBottom: 8 }}>NO BS FITNESS</div>
        <h1 style={{ fontSize: "clamp(30px,7vw,44px)", fontWeight: 900, margin: "0 0 6px", letterSpacing: "-0.02em", lineHeight: 1.05 }}>
          Meet your <span style={{ color: "#22c55e" }}>future self.</span>
        </h1>
        <p style={{ fontSize: 14, color: "#777", marginBottom: 32, lineHeight: 1.5 }}>
          Upload a photo. Pick your physique. We'll show you what you'll look like — then that version of you becomes your AI coach.
        </p>

        <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} style={{ display: "none" }} />
        <button onClick={() => fileRef.current?.click()} style={{ width: "100%", padding: photoUrl ? "10px" : "32px 10px", marginBottom: 20, background: "#111", border: "2px dashed #333", borderRadius: 10, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          {photoUrl ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img src={photoUrl} alt="" style={{ width: 50, height: 50, borderRadius: "50%", objectFit: "cover", border: "2px solid #22c55e" }} />
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc" }}>Photo uploaded</div>
                <div style={{ fontSize: 11, color: "#22c55e", fontFamily: M }}>Tap to change</div>
              </div>
            </div>
          ) : (<><div style={{ fontSize: 28 }}>📸</div><div style={{ fontSize: 13, color: "#888" }}>Upload a front-facing photo</div><div style={{ fontSize: 10, color: "#555", fontFamily: M }}>Used to generate your future physique</div></>)}
        </button>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <div style={lbl}>Sex</div>
            <div style={{ display: "flex", gap: 6 }}>
              {["male", "female"].map(s => (
                <button key={s} onClick={() => { setSex(s); setTarget(null); }} style={{ flex: 1, padding: "9px", fontSize: 12, fontFamily: M, fontWeight: 700, background: sex === s ? "#22c55e" : "#111", color: sex === s ? "#000" : "#666", border: sex === s ? "1px solid #22c55e" : "1px solid #333", borderRadius: 6, cursor: "pointer", textTransform: "uppercase" }}>{s}</button>
              ))}
            </div>
          </div>
          <div><div style={lbl}>Age</div><input type="number" value={age} onChange={e => setAge(+e.target.value)} style={inp} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><div style={lbl}>Weight (lbs)</div><input type="number" value={wLbs} onChange={e => setWLbs(+e.target.value)} style={inp} /></div>
          <div><div style={lbl}>Ht (ft)</div><input type="number" value={htFt} onChange={e => setHtFt(+e.target.value)} style={inp} /></div>
          <div><div style={lbl}>in</div><input type="number" value={htIn} onChange={e => setHtIn(+e.target.value)} style={inp} /></div>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {ACTIVITY.map(a => (
            <button key={a.id} onClick={() => setActivity(a.id)} style={{ padding: "7px 12px", fontSize: 11, fontFamily: M, background: activity === a.id ? "#22c55e" : "#111", color: activity === a.id ? "#000" : "#666", border: activity === a.id ? "1px solid #22c55e" : "1px solid #333", borderRadius: 6, cursor: "pointer", fontWeight: activity === a.id ? 700 : 400 }}>{a.label}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, fontFamily: M, color: "#555", marginBottom: 20 }}>Est. body fat: <span style={{ color: "#fff", fontWeight: 700 }}>{bf}%</span></div>

        <div style={{ fontSize: 11, fontFamily: M, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Goal Physique</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 24 }}>
          {archs.map(a => {
            const sel = target === a.id;
            return (
              <button key={a.id} onClick={() => setTarget(a.id)} style={{ padding: "12px 10px", background: sel ? "#111" : "#0a0a0a", border: sel ? "2px solid #22c55e" : "1px solid #1a1a1a", borderRadius: 10, cursor: "pointer", textAlign: "left" }}>
                <div style={{ fontSize: 20, marginBottom: 2 }}>{a.emoji}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: sel ? "#22c55e" : "#ccc" }}>{a.label}</div>
                <div style={{ fontSize: 10, fontFamily: M, color: "#555" }}>{a.bf}% BF · {a.effort}</div>
              </button>
            );
          })}
        </div>
        <button onClick={startGeneration} disabled={!target} style={{ width: "100%", padding: "14px", fontSize: 15, fontWeight: 800, background: target ? "#22c55e" : "#333", color: target ? "#000" : "#666", border: "none", borderRadius: 10, cursor: target ? "pointer" : "not-allowed", fontFamily: F, textTransform: "uppercase", letterSpacing: "0.02em" }}>
          {photoUrl ? "Generate My Future Self →" : "Build My Game Plan →"}
        </button>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════
  // GENERATING
  // ═══════════════════════════════════════════════
  if (screen === "generating") return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e5e5e5", fontFamily: F, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <style>{`@keyframes gpulse { 0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); } 50% { box-shadow: 0 0 25px 12px rgba(34,197,94,0.15); } } @keyframes gspin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ position: "relative", width: 130, height: 130, marginBottom: 28 }}>
        <div style={{ width: 120, height: 120, borderRadius: "50%", overflow: "hidden", border: "3px solid #22c55e", position: "absolute", top: 5, left: 5, animation: "gpulse 2s ease-in-out infinite" }}>
          {photoUrl ? <img src={photoUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> :
            <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg,#1a1a2e,#16213e)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48 }}>⚡</div>}
        </div>
        {genProgress < 100 && <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid transparent", borderTopColor: "#22c55e", animation: "gspin 1s linear infinite" }} />}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{genStatus}</div>
      <div style={{ fontSize: 12, fontFamily: M, color: "#555", marginBottom: 20 }}>{plan?.arch.label} · {plan?.tBF}% BF · {plan?.tWLbs} lbs</div>
      <div style={{ width: 260, height: 6, background: "#1a1a1a", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${genProgress}%`, height: "100%", background: "linear-gradient(90deg,#22c55e,#3b82f6)", borderRadius: 3, transition: "width 0.5s ease" }} />
      </div>
      <div style={{ fontSize: 11, fontFamily: M, color: "#555", marginTop: 8 }}>{genProgress}%</div>
      {genError && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 12, fontFamily: M, maxWidth: 300, textAlign: "center" }}>{genError}</div>}
    </div>
  );

  // ═══════════════════════════════════════════════
  // REVEAL — Full screen future self image
  // ═══════════════════════════════════════════════
  if (screen === "reveal") return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e5e5e5", fontFamily: F, display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <style>{`@keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }`}</style>
      <div style={{ fontSize: 10, fontFamily: M, letterSpacing: "0.2em", color: "#22c55e", textTransform: "uppercase", marginBottom: 6, animation: "fadeUp 0.6s ease" }}>
        This is you at {plan?.tWLbs} lbs / {plan?.tBF}% BF
      </div>
      <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 20, letterSpacing: "-0.02em", animation: "fadeUp 0.6s ease 0.1s both" }}>
        Meet <span style={{ color: "#22c55e" }}>Future You.</span>
      </h2>
      {/* Side by side on wider screens, stacked on mobile */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap", justifyContent: "center", animation: "fadeUp 0.8s ease 0.2s both" }}>
        {photoUrl && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, fontFamily: M, color: "#555", marginBottom: 6, textTransform: "uppercase" }}>Now</div>
            <img src={photoUrl} alt="Current" style={{ width: "min(42vw, 220px)", borderRadius: 12, border: "2px solid #333", objectFit: "cover" }} />
          </div>
        )}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 10, fontFamily: M, color: "#22c55e", marginBottom: 6, textTransform: "uppercase" }}>Future</div>
          <img src={futureUrl} alt="Future You" style={{ width: photoUrl ? "min(42vw, 220px)" : "min(80vw, 360px)", borderRadius: 12, border: "2px solid #22c55e55", objectFit: "cover" }} />
        </div>
      </div>
      <div style={{ fontSize: 13, color: "#666", marginBottom: 24, textAlign: "center", maxWidth: 360, animation: "fadeUp 0.8s ease 0.3s both", lineHeight: 1.5 }}>
        This version of you will be your AI coach. They've already done the work — now they'll tell you exactly how.
      </div>
      <button onClick={enterDashboard} style={{
        padding: "14px 40px", background: "#22c55e", color: "#000", border: "none", borderRadius: 10,
        fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: F, textTransform: "uppercase",
        letterSpacing: "0.02em", animation: "fadeUp 0.8s ease 0.4s both",
      }}>Start My Plan →</button>
    </div>
  );

  // ═══════════════════════════════════════════════
  // DASHBOARD
  // ═══════════════════════════════════════════════
  const currentCal = weekNum <= 2 ? plan?.tdee : plan?.cutWk > 0 && weekNum <= 2 + plan?.cutWk ? plan?.cutCal : plan?.buildWk > 0 ? plan?.buildCal : plan?.tTdee;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0a0a0a", color: "#e5e5e5", fontFamily: F }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />

      {showViewer && <ImageViewer url={futureUrl} onClose={() => setShowViewer(false)} />}

      {/* Header */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div onClick={() => futureUrl && setShowViewer(true)} style={{ width: 38, height: 38, borderRadius: "50%", overflow: "hidden", border: "2px solid #22c55e", flexShrink: 0, background: "#0a2a0a", cursor: futureUrl ? "pointer" : "default" }}>
          {(futureUrl || photoUrl) ? <img src={futureUrl || photoUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> :
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, background: "linear-gradient(135deg,#22c55e33,#3b82f633)" }}>⚡</div>}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Future You · {plan?.arch.label}</div>
          <div style={{ fontSize: 10, fontFamily: M, color: "#22c55e" }}>Week {weekNum}/{plan?.totalWk} · {plan?.tWLbs}lbs @ {plan?.tBF}%BF</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#22c55e", fontFamily: M }}>{currentCal}</div>
          <div style={{ fontSize: 9, color: "#555", fontFamily: M }}>cal/day</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #111", flexShrink: 0 }}>
        {[["coach", "Coach"], ["plan", "Plan"], ["workout", "Workout"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, padding: "10px", fontSize: 11, fontFamily: M, fontWeight: tab === id ? 700 : 400,
            background: "transparent", border: "none", borderBottom: tab === id ? "2px solid #22c55e" : "2px solid transparent",
            color: tab === id ? "#22c55e" : "#555", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em",
          }}>{label}{id === "workout" && workout && <span style={{ color: "#22c55e", marginLeft: 4 }}>●</span>}</button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "coach" && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 8px" }}>
            {messages.map((m, i) => <CoachBubble key={i} text={m.text} isCoach={m.role === "assistant"} avatarUrl={futureUrl || photoUrl} onAvatarClick={() => futureUrl && setShowViewer(true)} />)}
            {loading && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", border: "2px solid #22c55e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, background: "#0a2a0a" }}>⚡</div>
                <div style={{ padding: "10px 14px", background: "#111", border: "1px solid #222", borderRadius: "4px 14px 14px 14px", display: "flex", gap: 4 }}>
                  {[0, 1, 2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", animation: `bonce 1s ease ${i * 0.15}s infinite` }} />)}
                </div>
              </div>
            )}
            {showCheckIn && <CheckInWidget onSubmit={handleCheckIn} weekNum={weekNum} />}
            <div ref={chatEnd} />
          </div>
          <div style={{ padding: "10px 14px", borderTop: "1px solid #1a1a1a", flexShrink: 0, background: "#080808" }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8, overflowX: "auto" }}>
              <button onClick={() => setShowCheckIn(!showCheckIn)} style={{ padding: "5px 12px", background: showCheckIn ? "#22c55e22" : "#111", border: showCheckIn ? "1px solid #22c55e" : "1px solid #222", borderRadius: 16, cursor: "pointer", fontSize: 11, color: showCheckIn ? "#22c55e" : "#777", fontFamily: M, whiteSpace: "nowrap", flexShrink: 0 }}>📊 Check-In</button>
              {["What should I eat?", "Am I on track?"].map((q, i) => (
                <button key={i} onClick={() => setInput(q)} style={{ padding: "5px 12px", background: "#111", border: "1px solid #222", borderRadius: 16, cursor: "pointer", fontSize: 11, color: "#777", fontFamily: M, whiteSpace: "nowrap", flexShrink: 0 }}>{q}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSend()} placeholder="Ask your future self..." style={{ flex: 1, background: "#111", border: "1px solid #222", color: "#fff", padding: "10px 14px", borderRadius: 20, fontSize: 13, outline: "none", fontFamily: F }} />
              <button onClick={handleSend} disabled={!input.trim() || loading} style={{ width: 40, height: 40, borderRadius: "50%", background: input.trim() && !loading ? "#22c55e" : "#222", color: input.trim() && !loading ? "#000" : "#555", border: "none", cursor: input.trim() && !loading ? "pointer" : "not-allowed", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>↑</button>
            </div>
          </div>
        </>
      )}

      {tab === "plan" && (
        <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
          {/* Future self image card */}
          {futureUrl && (
            <div onClick={() => setShowViewer(true)} style={{ cursor: "pointer", marginBottom: 16, borderRadius: 12, overflow: "hidden", border: "1px solid #22c55e33", position: "relative" }}>
              <img src={futureUrl} alt="Future You" style={{ width: "100%", maxHeight: 280, objectFit: "cover", display: "block" }} />
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "24px 14px 12px", background: "linear-gradient(transparent, rgba(0,0,0,0.8))" }}>
                <div style={{ fontSize: 12, fontFamily: M, color: "#22c55e" }}>{plan?.tWLbs} lbs · {plan?.tBF}% BF</div>
                <div style={{ fontSize: 10, color: "#666", fontFamily: M, marginTop: 2 }}>Tap to view full size</div>
              </div>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 16 }}>
            {[
              { l: "Lose", v: plan?.fatLoss > 0 ? `-${plan.fatLoss}` : "—", u: "lbs fat", c: plan?.fatLoss > 0 ? "#ef4444" : "#333" },
              { l: "Gain", v: plan?.muscGain > 0 ? `+${plan.muscGain}` : "—", u: "lbs muscle", c: plan?.muscGain > 0 ? "#3b82f6" : "#333" },
              { l: "Timeline", v: `~${plan?.totalWk || 0}`, u: "weeks", c: "#fff" },
              { l: "Maintain", v: plan?.tTdee, u: "cal/day", c: "#22c55e" },
            ].map((s, i) => (
              <div key={i} style={{ background: "#111", border: "1px solid #222", borderRadius: 8, padding: "10px 6px", textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "#555", fontFamily: M, textTransform: "uppercase", marginBottom: 4 }}>{s.l}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: s.c }}>{s.v}</div>
                <div style={{ fontSize: 9, color: "#555", fontFamily: M, marginTop: 2 }}>{s.u}</div>
              </div>
            ))}
          </div>
          {plan && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", gap: 1.5 }}>
                {plan.phases.filter(p => p.wk).map((p, i) => (
                  <div key={i} style={{ flex: p.wk, background: p.color }} />
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span style={{ fontSize: 10, fontFamily: M, color: "#555" }}>Today</span>
                <span style={{ fontSize: 10, fontFamily: M, color: "#22c55e" }}>Week {plan.totalWk} → ∞</span>
              </div>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {plan?.phases.map((p, i) => <PhasePill key={i} p={p} />)}
          </div>
          <div style={{ background: "#0a1a0a", border: "1px solid #1a3a1a", borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#22c55e", marginBottom: 6 }}>That's the whole program.</div>
            <div style={{ fontSize: 12, color: "#777", lineHeight: 1.6 }}>
              {plan?.wLbs} lbs → {plan?.tWLbs} lbs. {plan?.bf}% → {plan?.tBF}% body fat. {plan?.totalWk} weeks of following a checklist, then {plan?.tTdee} cal/day forever. No supplements. No detoxes. Just thermodynamics.
            </div>
          </div>
        </div>
      )}

      {tab === "workout" && <WorkoutView workout={workout} onGenerate={generateWorkout} generating={genWorkout} />}

      <style>{`@keyframes bonce { 0%,60%,100% { transform:translateY(0); opacity:0.4; } 30% { transform:translateY(-5px); opacity:1; } }`}</style>
    </div>
  );
}
