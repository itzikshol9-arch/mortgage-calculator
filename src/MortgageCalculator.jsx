import React, { useState, useMemo, useRef, useEffect } from "react";

const GOOGLE_SHEET_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbxv8wxQQY3DjEOskosRGfe19zr_--a2h1dgjavJn3n754Fa4EqrlFHqdduAw2vE5gXG/exec";

// ─── Market data (June 2026) ──────────────────────────────────────────────────
const BOI_RATE    = 3.75;   // ריבית בנק ישראל
const PRIME_RATE  = 5.25;   // פריים = BOI + 1.5%
const ASSUMED_CPI = 2.50;

const TRACK_TYPES = [
  { id: "kalatz",   short: 'קל"צ',  label: "קבועה לא צמודה",   defaultRate: 4.90, indexed: false },
  { id: "prime",    short: "פריים", label: "פריים (P+0)",        defaultRate: PRIME_RATE, indexed: false },
  { id: "katzam",   short: 'קצ"מ',  label: "קבועה צמודה מדד",  defaultRate: 2.90, indexed: true  },
  { id: "variable", short: "משתנה", label: "משתנה כל 5 שנים",  defaultRate: 4.30, indexed: false },
];

const DEFAULT_MIX = [
  { id: "kalatz",  pct: 34, rate: 4.90,       indexed: false },
  { id: "prime",   pct: 33, rate: PRIME_RATE, indexed: false },
  { id: "katzam",  pct: 33, rate: 2.90,       indexed: true  },
];

const PURCHASE_TYPES = [
  { id: "first",      label: "דירה ראשונה", maxLTV: 75 },
  { id: "upgrade",    label: "שיפור דיור",  maxLTV: 70 },
  { id: "investment", label: "להשקעה",      maxLTV: 50 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) =>
  Math.round(n).toLocaleString("he-IL", { maximumFractionDigits: 0 });

function monthlyPayment(principal, annualRatePct, years) {
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

function buildAmortization(principal, annualRatePct, years) {
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  const pmt = monthlyPayment(principal, annualRatePct, years);
  let balance = principal;
  let totalInterest = 0;
  const yearly = [];
  const monthly = [];
  for (let m = 1; m <= n; m++) {
    const interest = balance * r;
    const principalPaid = pmt - interest;
    balance -= principalPaid;
    totalInterest += interest;
    if (m <= 12) {
      monthly.push({
        month: m,
        payment: pmt,
        interest,
        principal: principalPaid,
        balance: Math.max(balance, 0),
      });
    }
    if (m % 12 === 0 || m === n) {
      yearly.push({ year: Math.ceil(m / 12), balance: Math.max(balance, 0) });
    }
  }
  return { pmt, totalInterest, totalPaid: principal + totalInterest, yearly, monthly };
}

function trackEffectiveRate(track) {
  return track.indexed ? track.rate + ASSUMED_CPI : track.rate;
}

// ─── UI atoms ─────────────────────────────────────────────────────────────────
function FieldLabel({ children, hint }) {
  return (
    <div className="field-label-row">
      <span className="field-label">{children}</span>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

function NumberField({ value, onChange, suffix, min = 0, max, step = 1000 }) {
  return (
    <div className="number-field">
      <input
        type="text"
        inputMode="numeric"
        value={fmt(value)}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d]/g, "");
          let v = raw === "" ? 0 : parseInt(raw, 10);
          if (max !== undefined) v = Math.min(v, max);
          v = Math.max(v, min);
          onChange(v);
        }}
      />
      {suffix && <span className="number-suffix">{suffix}</span>}
    </div>
  );
}

function SliderRow({ value, onChange, min, max, step, suffix, formatValue }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider-row">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ "--fill": `${pct}%` }}
      />
      <div className="slider-value">
        {formatValue ? formatValue(value) : value}
        {suffix}
      </div>
    </div>
  );
}

// ─── Rates banner ─────────────────────────────────────────────────────────────
function RatesInfoBanner() {
  return (
    <div className="rates-banner">
      <div className="rb-item">
        <span className="rb-label">בנק ישראל</span>
        <span className="rb-val rb-boi">{BOI_RATE.toFixed(2)}%</span>
      </div>
      <div className="rb-sep" />
      <div className="rb-item">
        <span className="rb-label">פריים</span>
        <span className="rb-val">{PRIME_RATE.toFixed(2)}%</span>
      </div>
      <div className="rb-sep" />
      <div className="rb-item">
        <span className="rb-label">קל"צ שוק</span>
        <span className="rb-val">4.7%–5.1%</span>
      </div>
      <div className="rb-sep" />
      <div className="rb-item">
        <span className="rb-label">קצ"מ שוק</span>
        <span className="rb-val">2.7%–3.1%</span>
      </div>
    </div>
  );
}

// ─── Track Mixer ──────────────────────────────────────────────────────────────
function TrackMixer({ principal, years }) {
  const [tracks, setTracks] = useState(DEFAULT_MIX);

  const update = (i, changes) =>
    setTracks(prev => {
      const next = prev.map((t, idx) => (idx === i ? { ...t, ...changes } : t));
      const used = next[0].pct + next[1].pct;
      next[2] = { ...next[2], pct: Math.max(0, 100 - used) };
      return next;
    });

  const changeType = (i, typeId) => {
    const type = TRACK_TYPES.find(t => t.id === typeId);
    update(i, { id: typeId, rate: type.defaultRate, indexed: type.indexed });
  };

  const calcs = useMemo(() => tracks.map(t => {
    const p = principal * (t.pct / 100);
    const effRate = trackEffectiveRate(t);
    const pmt = monthlyPayment(p, effRate, years);
    const res = buildAmortization(p, effRate, years);
    return { ...t, principal: p, effRate, pmt, totalInterest: res.totalInterest };
  }), [tracks, principal, years]);

  const totalPmt  = calcs.reduce((s, c) => s + c.pmt, 0);
  const totalInt  = calcs.reduce((s, c) => s + c.totalInterest, 0);
  const totalPaid = principal + totalInt;
  const principalShare = totalPaid > 0 ? (principal / totalPaid) * 100 : 0;
  const hasIndexed = calcs.some(c => c.indexed && c.pct > 0);

  return (
    <div className="track-mixer">
      <div className="mixer-hero">
        <span className="mixer-hero-label">החזר חודשי כולל (תמהיל)</span>
        <span className="mixer-hero-value">
          ₪{fmt(totalPmt)}
          <span className="hero-unit"> / לחודש</span>
        </span>
        {hasIndexed && (
          <span className="mixer-hero-cpi">
            * כולל מסלול צמוד — החזר ראשוני, יגדל עם המדד
          </span>
        )}
      </div>

      <div className="amort-bar-wrap">
        <div className="amort-bar">
          <div className="amort-segment principal" style={{ width: `${principalShare}%` }} />
          <div className="amort-segment interest"  style={{ width: `${100 - principalShare}%` }} />
        </div>
        <div className="amort-legend">
          <span><i className="dot principal" />קרן ₪{fmt(principal)}</span>
          <span><i className="dot interest"  />ריבית ₪{fmt(totalInt)}</span>
        </div>
      </div>

      {calcs.map((c, i) => {
        const rMin  = c.indexed ? 1.50 : 3.00;
        const rMax  = c.indexed ? 5.50 : 9.00;
        const rFill = Math.max(0, Math.min(100, ((c.rate - rMin) / (rMax - rMin)) * 100));
        const pctMax = i < 2 ? Math.max(0, 100 - (i === 0 ? tracks[1].pct : tracks[0].pct)) : 100;

        return (
          <div className="track-card" key={i}>
            <div className="track-card-top">
              <div className="track-type-btns">
                {TRACK_TYPES.map(type => (
                  <button
                    key={type.id}
                    className={`ttb ${c.id === type.id ? "ttb-on" : ""}`}
                    onClick={() => changeType(i, type.id)}
                  >
                    {type.short}
                  </button>
                ))}
              </div>
              <span className="track-pmt">₪{fmt(c.pmt)}</span>
            </div>

            <div className="ts-row">
              <span className="ts-label">ריבית</span>
              <input
                type="range" className="ts-range"
                min={rMin} max={rMax} step={0.05} value={c.rate}
                onChange={e => update(i, { rate: parseFloat(e.target.value) })}
                style={{ "--fill": `${rFill}%` }}
              />
              <span className="ts-val">
                {c.rate.toFixed(2)}%
                {c.indexed && <span className="ts-cpi">+{ASSUMED_CPI}%מדד</span>}
              </span>
            </div>

            <div className="ts-row">
              <span className="ts-label">חלק</span>
              <input
                type="range" className="ts-range"
                min={0} max={pctMax} step={1} value={c.pct}
                onChange={e => i < 2 && update(i, { pct: parseInt(e.target.value) })}
                disabled={i === 2}
                style={{ "--fill": `${c.pct}%`, cursor: i === 2 ? "default" : "pointer" }}
              />
              <span className="ts-val">
                {c.pct}%<span className="ts-sub"> ₪{fmt(c.principal)}</span>
              </span>
            </div>

            {c.indexed && (
              <div className="track-cpi-note">
                ₪{fmt(c.pmt)} הוא ההחזר הראשוני — יגדל עם המדד (~{ASSUMED_CPI}% לשנה)
              </div>
            )}
          </div>
        );
      })}

      <p className="mixer-disclaimer">
        ריביות הן ממוצע שוק — הריבית בפועל נקבעת מול הבנק לפי פרופיל הלווה.
      </p>
    </div>
  );
}

// ─── Lead gate ────────────────────────────────────────────────────────────────
function LeadGate({ onSubmit, onSkip, agentName }) {
  const [name,  setName]  = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const nameRef = useRef(null);

  useEffect(() => { nameRef.current && nameRef.current.focus(); }, []);

  const phoneValid = /^0\d{1,2}-?\d{6,7}$/.test(phone.replace(/\s/g, ""));

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim())   { setError("נא להזין שם"); return; }
    if (!phoneValid)    { setError("מספר טלפון לא תקין"); return; }
    setError("");
    onSubmit({ name: name.trim(), phone: phone.trim() });
  };

  return (
    <div className="lead-gate">
      <div className="lead-gate-inner">
        <div className="lead-icon">✓</div>
        <h3>התוצאה שלך מוכנה</h3>
        <p className="lead-sub">
          השאירו פרטים לקבלת הפירוט המלא — לוח סילוקין, יחס מימון, והמלצה
          אישית{agentName ? ` מ${agentName}` : ""}.
        </p>
        <form onSubmit={submit} className="lead-form">
          <input ref={nameRef} type="text" placeholder="שם מלא"
            value={name} onChange={e => setName(e.target.value)} className="lead-input" />
          <input type="tel" inputMode="tel" placeholder="050-1234567"
            value={phone} onChange={e => setPhone(e.target.value)}
            className="lead-input" dir="ltr" style={{ textAlign: "right" }} />
          {error && <div className="lead-error">{error}</div>}
          <button type="submit" className="lead-submit">קבלו את הפירוט המלא</button>
        </form>
        <button className="lead-skip" onClick={onSkip}>לא עכשיו, תודה</button>
      </div>
    </div>
  );
}

// ─── Full details (post-lead) ─────────────────────────────────────────────────
function FullDetails({ years, rate, result }) {
  const [showMonthly, setShowMonthly] = useState(false);
  const maxBalance = result.yearly[0]?.balance || 1;

  return (
    <div className="full-details">
      <h4>לוח סילוקין שנתי</h4>
      <div className="schedule-chart">
        {result.yearly.map((row) => (
          <div className="schedule-bar" key={row.year}>
            <div
              className="schedule-bar-fill"
              style={{ height: `${(row.balance / maxBalance) * 100}%` }}
              title={`שנה ${row.year}: ₪${fmt(row.balance)}`}
            />
            {(row.year % 5 === 0 || row.year === result.yearly.length) && (
              <span className="schedule-year">{row.year}</span>
            )}
          </div>
        ))}
      </div>

      <div className="detail-stats">
        <div className="stat">
          <span className="stat-label">סך כל ההחזרים</span>
          <span className="stat-value">₪{fmt(result.totalPaid)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">סך הריבית</span>
          <span className="stat-value">₪{fmt(result.totalInterest)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">תקופה</span>
          <span className="stat-value">{years} שנים</span>
        </div>
        <div className="stat">
          <span className="stat-label">ריבית שנתית</span>
          <span className="stat-value">{rate.toFixed(2)}%</span>
        </div>
      </div>

      {result.monthly && result.monthly.length > 0 && (
        <div className="monthly-section">
          <button className="monthly-toggle" onClick={() => setShowMonthly(s => !s)}>
            {showMonthly ? "▲ הסתר" : "▼ הצג 12 חודשים ראשונים"}
          </button>
          {showMonthly && (
            <div className="monthly-table">
              <div className="mt-header">
                <span>חודש</span>
                <span>קרן</span>
                <span>ריבית</span>
                <span>יתרה</span>
              </div>
              {result.monthly.map(row => (
                <div className="mt-row" key={row.month}>
                  <span>{row.month}</span>
                  <span>₪{fmt(row.principal)}</span>
                  <span>₪{fmt(row.interest)}</span>
                  <span>₪{fmt(row.balance)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function MortgageCalculator() {
  const [mode,        setMode]        = useState("payment");
  const [resultReady, setResultReady] = useState(false);
  const [leadStage,   setLeadStage]   = useState("hidden");
  const [leadData,    setLeadData]    = useState(null);
  const [submittedKey, setSubmittedKey] = useState(null);

  useEffect(() => { setLeadStage("hidden"); }, [mode]);

  useEffect(() => {
    if (resultReady && leadStage === "hidden") {
      const t = setTimeout(() => setLeadStage("gate"), 450);
      return () => clearTimeout(t);
    }
  }, [resultReady, leadStage]);

  const handleLeadSubmit = async (data) => {
    setLeadData(data);
    setLeadStage("unlocked");
    try {
      await fetch(GOOGLE_SHEET_WEBHOOK_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          name: data.name,
          phone: data.phone,
          mode: mode === "payment" ? "החזר חודשי" : "זכאות למשכנתא",
          submittedAt: new Date().toLocaleString("he-IL"),
        }),
      });
      setSubmittedKey("sent");
    } catch (err) {
      console.error("Lead submit error:", err);
    }
  };

  return (
    <div className="page" dir="rtl">
      <style>{CSS}</style>

      <header className="page-header">
        <span className="eyebrow">מחשבון משכנתא</span>
        <h1>כמה תשלמו כל חודש?</h1>
        <p className="page-sub">הזינו כמה פרטים וקבלו הערכה מיידית — בלי התחייבות.</p>
      </header>

      <RatesInfoBanner />
      <ContactBanner />

      <div className="mode-switch">
        <button className={mode === "payment" ? "active" : ""} onClick={() => setMode("payment")}>
          חישוב החזר חודשי
        </button>
        <button className={mode === "eligibility" ? "active" : ""} onClick={() => setMode("eligibility")}>
          כמה משכנתא מגיע לי?
        </button>
      </div>

      <div className="card">
        {mode === "payment" ? (
          <PaymentCalculatorWrapper onResultReady={setResultReady} leadStage={leadStage} />
        ) : (
          <EligibilityCalculatorWrapper onResultReady={setResultReady} leadStage={leadStage} />
        )}
        {leadStage === "gate" && (
          <LeadGate onSubmit={handleLeadSubmit} onSkip={() => setLeadStage("skipped")} />
        )}
      </div>

      {leadStage === "unlocked" && leadData && (
        <div className="thanks-strip">
          תודה, {leadData.name}! הפירוט המלא מוצג למטה. ניצור קשר בקרוב למספר שהשארת.
        </div>
      )}

      <footer className="page-footer">
        <p>
          * החישוב הינו הערכה בלבד ואינו מהווה ייעוץ משכנתאות, הצעה מחייבת או תחליף
          לאישור עקרוני מהבנק. הריביות בפועל משתנות בין בנקים ולפי פרופיל הלקוח.
          ריבית בנק ישראל ופריים נכונים ליוני 2026.
        </p>
      </footer>

      <StickyContactBar />
    </div>
  );
}

// ─── Agent contact ────────────────────────────────────────────────────────────
const AGENT_PHONE_DISPLAY = "052-802-9668";
const AGENT_PHONE_TEL     = "0528029668";
const AGENT_PHONE_WA      = "972528029668";
const WA_MESSAGE = "היי, אשמח לשיחת ייעוץ למשכנתא";
const WA_LINK    = `https://wa.me/${AGENT_PHONE_WA}?text=${encodeURIComponent(WA_MESSAGE)}`;
const TEL_LINK   = `tel:${AGENT_PHONE_TEL}`;

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.74.46 3.43 1.32 4.93L2.05 22l5.27-1.38a9.85 9.85 0 0 0 4.72 1.2h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm5.8 14.12c-.24.68-1.42 1.3-1.95 1.36-.5.06-1.07.27-3.6-.75-3.04-1.22-4.99-4.31-5.14-4.51-.15-.2-1.22-1.63-1.22-3.11 0-1.48.78-2.2 1.05-2.5.28-.3.6-.37.8-.37.2 0 .4 0 .58.01.18.01.43-.07.68.51.24.6.83 2.07.9 2.22.07.15.12.33.02.53-.1.2-.15.32-.3.49-.15.17-.32.38-.45.51-.15.15-.31.31-.13.6.18.3.8 1.31 1.7 2.13 1.18 1.05 2.17 1.38 2.46 1.53.3.15.47.13.65-.08.18-.2.76-.88.96-1.18.2-.3.4-.25.65-.15.27.1 1.7.8 1.99.94.3.15.49.22.56.34.07.13.07.7-.17 1.38z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">
      <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.24.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2z" />
    </svg>
  );
}

function ContactBanner() {
  return (
    <div className="contact-banner">
      <div className="contact-banner-text">
        <span className="contact-banner-title">רוצים לדבר עם בן אדם?</span>
        <span className="contact-banner-sub">שיחת ייעוץ קצרה, בלי התחייבות</span>
      </div>
      <div className="contact-banner-actions">
        <a className="contact-btn whatsapp" href={WA_LINK} target="_blank" rel="noopener noreferrer">
          <WhatsAppIcon /><span>וואטסאפ</span>
        </a>
        <a className="contact-btn call" href={TEL_LINK}>
          <PhoneIcon /><span>{AGENT_PHONE_DISPLAY}</span>
        </a>
      </div>
    </div>
  );
}

function StickyContactBar() {
  return (
    <div className="sticky-contact-bar">
      <a className="sticky-btn call" href={TEL_LINK} aria-label="התקשרו עכשיו">
        <PhoneIcon /><span>התקשרו</span>
      </a>
      <a className="sticky-btn whatsapp" href={WA_LINK} target="_blank" rel="noopener noreferrer" aria-label="פנו בוואטסאפ">
        <WhatsAppIcon /><span>וואטסאפ</span>
      </a>
    </div>
  );
}

// ─── Payment calculator ───────────────────────────────────────────────────────
function PaymentCalculatorWrapper({ onResultReady, leadStage }) {
  const [calcMode,       setCalcMode]      = useState("single");
  const [propertyPrice,  setPropertyPrice] = useState(1800000);
  const [downPayment,    setDownPayment]   = useState(540000);
  const [years,          setYears]         = useState(25);
  const [rate,           setRate]          = useState(4.90);

  const principal    = Math.max(propertyPrice - downPayment, 0);
  const financingPct = propertyPrice > 0 ? (principal / propertyPrice) * 100 : 0;

  const result = useMemo(
    () => buildAmortization(principal, rate, years),
    [principal, rate, years]
  );

  useEffect(() => {
    onResultReady(principal > 0 && years > 0);
  }, [principal, years, onResultReady]);

  const principalShare = result.totalPaid > 0 ? (principal / result.totalPaid) * 100 : 0;

  return (
    <div className="calc-body">
      {/* Mode toggle */}
      <div className="calc-mode-switch">
        <button
          className={`cms-btn ${calcMode === "single" ? "cms-on" : ""}`}
          onClick={() => setCalcMode("single")}
        >
          מסלול יחיד
        </button>
        <button
          className={`cms-btn ${calcMode === "mix" ? "cms-on" : ""}`}
          onClick={() => setCalcMode("mix")}
        >
          תמהיל מסלולים ✦
        </button>
      </div>

      {/* Shared inputs */}
      <div className="field-grid">
        <div className="field">
          <FieldLabel>שווי הנכס</FieldLabel>
          <NumberField value={propertyPrice} onChange={setPropertyPrice} suffix="₪" step={10000} />
        </div>
        <div className="field">
          <FieldLabel hint={`${financingPct.toFixed(0)}% מימון`}>הון עצמי</FieldLabel>
          <NumberField value={downPayment} onChange={setDownPayment} suffix="₪" max={propertyPrice} step={10000} />
        </div>
        <div className="field">
          <FieldLabel>תקופת המשכנתא</FieldLabel>
          <SliderRow value={years} onChange={setYears} min={4} max={30} step={1} suffix=" שנה" />
        </div>
      </div>

      {calcMode === "single" ? (
        <>
          <div className="field" style={{ marginTop: 18 }}>
            <FieldLabel>ריבית שנתית (קל"צ — קבועה לא צמודה)</FieldLabel>
            <SliderRow
              value={rate}
              onChange={setRate}
              min={3.0} max={9.0} step={0.05}
              suffix="%" formatValue={v => v.toFixed(2)}
            />
          </div>

          <div className="hero-result" style={{ marginTop: 22 }}>
            <span className="hero-label">החזר חודשי משוער</span>
            <span className="hero-number">
              ₪{fmt(result.pmt)}
              <span className="hero-unit">/ לחודש</span>
            </span>
            <span className={"financing-badge " + (financingPct > 75 ? "warn" : financingPct > 60 ? "mid" : "ok")}>
              מימון {financingPct.toFixed(0)}% משווי הנכס
            </span>
          </div>

          <div className="amort-bar-wrap">
            <div className="amort-bar">
              <div className="amort-segment principal" style={{ width: `${principalShare}%` }} />
              <div className="amort-segment interest"  style={{ width: `${100 - principalShare}%` }} />
            </div>
            <div className="amort-legend">
              <span><i className="dot principal" />קרן ₪{fmt(principal)}</span>
              <span><i className="dot interest"  />ריבית ₪{fmt(result.totalInterest)}</span>
            </div>
          </div>
        </>
      ) : (
        <>
          <div style={{ marginTop: 22 }}>
            <TrackMixer principal={principal} years={years} />
          </div>
          <div style={{ marginTop: 12 }}>
            <span className={"financing-badge " + (financingPct > 75 ? "warn" : financingPct > 60 ? "mid" : "ok")}>
              מימון {financingPct.toFixed(0)}% משווי הנכס
            </span>
          </div>
        </>
      )}

      <div className="mix-cta">
        <span className="mix-cta-title">רוצים את התוצאה הטובה ביותר?</span>
        <p className="mix-cta-text">
          כדי להגיע להחזר החודשי הנמוך ביותר ולתנאים הטובים ביותר, צריך לבנות תמהיל
          אופטימלי בהתאמה אישית — לפי הכנסה, אופק, ורמת הסיכון שלכם.
        </p>
        <a className="mix-cta-btn" href={WA_LINK} target="_blank" rel="noopener noreferrer">
          בואו נבנה תמהיל אישי בוואטסאפ
        </a>
      </div>

      {leadStage === "unlocked" && calcMode === "single" && (
        <FullDetails years={years} rate={rate} result={result} />
      )}
    </div>
  );
}

// ─── Eligibility calculator ───────────────────────────────────────────────────
function EligibilityCalculatorWrapper({ onResultReady, leadStage }) {
  const [purchaseType, setPurchaseType] = useState("first");
  const [netIncome,    setNetIncome]    = useState(18000);
  const [existingDebt, setExistingDebt] = useState(0);
  const [ownCapital,   setOwnCapital]   = useState(540000);
  const [years,        setYears]        = useState(25);
  const [rate,         setRate]         = useState(4.90);

  const ptInfo = PURCHASE_TYPES.find(p => p.id === purchaseType);
  const maxLTVRatio = ptInfo.maxLTV / 100;

  const maxPaymentCapacity = Math.max(netIncome * 0.4 - existingDebt, 0);

  const maxLoan = useMemo(() => {
    const r = rate / 100 / 12;
    const n = years * 12;
    if (maxPaymentCapacity <= 0) return 0;
    if (r === 0) return maxPaymentCapacity * n;
    return (maxPaymentCapacity * (1 - Math.pow(1 + r, -n))) / r;
  }, [maxPaymentCapacity, rate, years]);

  // maxLoan by capital: ownCapital / (1 - maxLTVRatio) - ownCapital
  const maxLoanByCapital = ownCapital * (maxLTVRatio / (1 - maxLTVRatio));
  const effectiveMaxLoan = Math.min(maxLoan, maxLoanByCapital);
  const maxPropertyValue = effectiveMaxLoan + ownCapital;
  const limitedByIncome  = maxLoan <= maxLoanByCapital;

  const actualPayment = monthlyPayment(effectiveMaxLoan, rate, years);
  const capitalShare  = maxPropertyValue > 0 ? (ownCapital / maxPropertyValue) * 100 : 0;

  const result = useMemo(
    () => buildAmortization(effectiveMaxLoan, rate, years),
    [effectiveMaxLoan, rate, years]
  );

  useEffect(() => {
    onResultReady(maxPropertyValue > 0);
  }, [maxPropertyValue, onResultReady]);

  const actualLTV = maxPropertyValue > 0 ? (effectiveMaxLoan / maxPropertyValue) * 100 : 0;

  return (
    <div className="calc-body">
      {/* Purchase type */}
      <div className="purchase-type-row">
        {PURCHASE_TYPES.map(pt => (
          <button
            key={pt.id}
            className={`pt-btn ${purchaseType === pt.id ? "pt-on" : ""}`}
            onClick={() => setPurchaseType(pt.id)}
          >
            {pt.label}
            <span className="pt-ltv">עד {pt.maxLTV}%</span>
          </button>
        ))}
      </div>

      <div className="hero-result">
        <span className="hero-label">שווי נכס מקסימלי</span>
        <span className="hero-number">₪{fmt(maxPropertyValue)}</span>
        <span className="financing-badge ok">
          הלוואה עד ₪{fmt(effectiveMaxLoan)} · החזר ₪{fmt(actualPayment)}/חודש
        </span>
      </div>

      <div className="amort-bar-wrap">
        <div className="amort-bar">
          <div className="amort-segment principal" style={{ width: `${100 - capitalShare}%` }} />
          <div className="amort-segment interest"  style={{ width: `${capitalShare}%` }} />
        </div>
        <div className="amort-legend">
          <span><i className="dot principal" />משכנתא ₪{fmt(effectiveMaxLoan)} ({actualLTV.toFixed(0)}%)</span>
          <span><i className="dot interest"  />הון עצמי ₪{fmt(ownCapital)}</span>
        </div>
      </div>

      <p className="constraint-note">
        {limitedByIncome
          ? `החישוב מוגבל ליכולת ההחזר החודשית (עד 40% מהכנסה פנויה — ₪${fmt(maxPaymentCapacity)}/חודש).`
          : `החישוב מוגבל לתקרת המימון הרגולטורית (עד ${ptInfo.maxLTV}% משווי הנכס).`}
      </p>

      <div className="field-grid">
        <div className="field">
          <FieldLabel>הכנסה נטו למשק בית</FieldLabel>
          <NumberField value={netIncome} onChange={setNetIncome} suffix="₪" step={500} />
        </div>
        <div className="field">
          <FieldLabel>החזרי הלוואות קיימות</FieldLabel>
          <NumberField value={existingDebt} onChange={setExistingDebt} suffix="₪" max={netIncome} step={100} />
        </div>
        <div className="field">
          <FieldLabel>הון עצמי זמין</FieldLabel>
          <NumberField value={ownCapital} onChange={setOwnCapital} suffix="₪" step={10000} />
        </div>
        <div className="field">
          <FieldLabel>תקופת המשכנתא</FieldLabel>
          <SliderRow value={years} onChange={setYears} min={4} max={30} step={1} suffix=" שנה" />
        </div>
        <div className="field">
          <FieldLabel>ריבית שנתית (קל"צ ממוצע)</FieldLabel>
          <SliderRow
            value={rate} onChange={setRate}
            min={3.0} max={9.0} step={0.05}
            suffix="%" formatValue={v => v.toFixed(2)}
          />
        </div>
      </div>

      <div className="mix-cta">
        <span className="mix-cta-title">רוצים את התוצאה הטובה ביותר?</span>
        <p className="mix-cta-text">
          כדי למקסם את יכולת המימון ולקבל את ההחזר החודשי הנמוך ביותר, צריך לבנות
          תמהיל אופטימלי שמשלב כמה מסלולים בהתאמה אישית למצב שלכם.
        </p>
        <a className="mix-cta-btn" href={WA_LINK} target="_blank" rel="noopener noreferrer">
          בואו נבנה תמהיל אישי בוואטסאפ
        </a>
      </div>

      {leadStage === "unlocked" && (
        <FullDetails years={years} rate={rate} result={result} />
      )}
    </div>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;700;900&family=Heebo:wght@300;400;500;600;700&display=swap');

* { box-sizing: border-box; }

.page {
  --ink: #1A2332;
  --ink-soft: #3D4A5C;
  --stone: #EDE8DF;
  --paper: #FFFFFF;
  --copper: #A6793C;
  --copper-deep: #8A6230;
  --sage: #7C8B7A;
  --warn: #B5563C;
  --line: #DAD3C5;
  --blue: #3B6EA5;

  font-family: 'Heebo', sans-serif;
  background: var(--stone);
  color: var(--ink);
  min-height: 100vh;
  padding: 32px 18px 96px;
  max-width: 560px;
  margin: 0 auto;
}

.page-header { text-align: center; margin-bottom: 16px; }
.eyebrow {
  font-size: 12px;
  letter-spacing: 0.12em;
  color: var(--copper-deep);
  font-weight: 600;
  text-transform: uppercase;
}
.page-header h1 {
  font-family: 'Frank Ruhl Libre', serif;
  font-weight: 700;
  font-size: 30px;
  margin: 6px 0 8px;
  color: var(--ink);
}
.page-sub { color: var(--ink-soft); font-size: 14.5px; margin: 0; }

/* ─── Rates banner ─── */
.rates-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  background: var(--ink);
  border-radius: 12px;
  padding: 10px 14px;
  margin-bottom: 12px;
  overflow-x: auto;
}
.rb-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 0 10px;
  white-space: nowrap;
}
.rb-label { font-size: 10px; color: rgba(237,232,223,0.6); font-weight: 500; }
.rb-val   { font-size: 13px; color: var(--stone); font-weight: 700; }
.rb-boi   { color: #FFD166; }
.rb-sep   { width: 1px; height: 28px; background: rgba(237,232,223,0.2); flex-shrink: 0; }

/* ─── Contact banner ─── */
.contact-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: linear-gradient(135deg, #283447 0%, #1A2332 100%);
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 18px;
  box-shadow: 0 4px 14px rgba(26,35,50,0.18);
}
.contact-banner-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.contact-banner-title { font-size: 13.5px; font-weight: 600; color: var(--stone); }
.contact-banner-sub   { font-size: 11.5px; color: rgba(237,232,223,0.7); }
.contact-banner-actions { display: flex; gap: 8px; flex-shrink: 0; }
.contact-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 12px;
  border-radius: 9px;
  font-size: 12.5px;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
  transition: transform 0.15s, opacity 0.15s;
}
.contact-btn:active { transform: scale(0.96); }
.contact-btn.whatsapp { background: #25D366; color: #0B3D1F; }
.contact-btn.call     { background: var(--copper); color: var(--paper); }

/* ─── Sticky bar ─── */
.sticky-contact-bar {
  position: fixed; bottom: 0; left: 0; right: 0;
  display: flex; gap: 1px;
  background: var(--line);
  box-shadow: 0 -2px 12px rgba(26,35,50,0.12);
  z-index: 40;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.sticky-btn {
  flex: 1;
  display: flex; align-items: center; justify-content: center; gap: 7px;
  padding: 14px 10px;
  font-size: 14px; font-weight: 600; text-decoration: none;
  transition: opacity 0.15s;
}
.sticky-btn:active { opacity: 0.85; }
.sticky-btn.call     { background: var(--ink); color: var(--stone); }
.sticky-btn.whatsapp { background: #25D366; color: #0B3D1F; }
@media (min-width: 561px) {
  .sticky-contact-bar { max-width: 560px; margin: 0 auto; border-radius: 14px 14px 0 0; overflow: hidden; left: 50%; transform: translateX(-50%); }
}

/* ─── Mode switch ─── */
.mode-switch {
  display: flex;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 4px;
  margin-bottom: 18px;
  gap: 4px;
}
.mode-switch button {
  flex: 1; border: none; background: transparent;
  padding: 11px 8px; border-radius: 9px;
  font-family: 'Heebo', sans-serif; font-size: 13.5px; font-weight: 500;
  color: var(--ink-soft); cursor: pointer;
  transition: background 0.2s, color 0.2s;
}
.mode-switch button.active { background: var(--ink); color: var(--stone); font-weight: 600; }

/* ─── Card ─── */
.card {
  position: relative;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(26,35,50,0.04), 0 8px 24px rgba(26,35,50,0.06);
}
.calc-body { padding: 24px 22px 24px; }

/* ─── Calc mode switch (single / mix) ─── */
.calc-mode-switch {
  display: flex;
  gap: 6px;
  margin-bottom: 20px;
}
.cms-btn {
  flex: 1; border: 1.5px solid var(--line); background: transparent;
  padding: 9px 8px; border-radius: 10px;
  font-family: 'Heebo', sans-serif; font-size: 13px; font-weight: 500;
  color: var(--ink-soft); cursor: pointer;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
}
.cms-btn.cms-on {
  background: var(--ink); color: var(--stone);
  border-color: var(--ink); font-weight: 600;
}

/* ─── Purchase type ─── */
.purchase-type-row {
  display: flex;
  gap: 6px;
  margin-bottom: 20px;
}
.pt-btn {
  flex: 1;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  border: 1.5px solid var(--line); background: transparent;
  padding: 10px 6px; border-radius: 10px;
  font-family: 'Heebo', sans-serif; font-size: 12px; font-weight: 600;
  color: var(--ink-soft); cursor: pointer;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
}
.pt-ltv { font-size: 10px; font-weight: 400; color: inherit; opacity: 0.7; }
.pt-btn.pt-on {
  background: var(--ink); color: var(--stone);
  border-color: var(--ink);
}
.pt-btn.pt-on .pt-ltv { opacity: 0.8; }

/* ─── Hero result ─── */
.hero-result {
  display: flex; flex-direction: column; align-items: center; text-align: center;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 22px;
}
.hero-label  { font-size: 13px; color: var(--ink-soft); margin-bottom: 6px; }
.hero-number {
  font-family: 'Frank Ruhl Libre', serif;
  font-weight: 900; font-size: 44px; line-height: 1;
  color: var(--ink); direction: ltr;
  display: inline-flex; align-items: baseline; gap: 8px;
}
.hero-unit { font-family: 'Heebo', sans-serif; font-size: 14px; font-weight: 400; color: var(--ink-soft); direction: rtl; }
.financing-badge {
  margin-top: 12px; font-size: 12.5px; font-weight: 600;
  padding: 5px 12px; border-radius: 999px;
  background: rgba(124,139,122,0.15); color: var(--sage);
}
.financing-badge.mid  { background: rgba(166,121,60,0.15); color: var(--copper-deep); }
.financing-badge.warn { background: rgba(181,86,60,0.13);  color: var(--warn); }

/* ─── Amort bar ─── */
.amort-bar-wrap { margin-bottom: 24px; }
.amort-bar {
  display: flex; height: 14px; border-radius: 7px; overflow: hidden; background: var(--line);
}
.amort-segment { height: 100%; transition: width 0.4s ease; }
.amort-segment.principal { background: var(--ink); }
.amort-segment.interest  { background: var(--copper); }
.amort-legend {
  display: flex; justify-content: space-between;
  margin-top: 9px; font-size: 12.5px; color: var(--ink-soft);
  direction: ltr; text-align: right;
}
.amort-legend span { display: inline-flex; align-items: center; gap: 6px; direction: rtl; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot.principal { background: var(--ink); }
.dot.interest  { background: var(--copper); }

.constraint-note {
  font-size: 12.5px; color: var(--ink-soft);
  background: rgba(124,139,122,0.10); border-radius: 10px;
  padding: 10px 12px; margin: -8px 0 22px;
  line-height: 1.5;
}

/* ─── Track Mixer ─── */
.track-mixer { display: flex; flex-direction: column; gap: 14px; }

.mixer-hero {
  display: flex; flex-direction: column; align-items: center; text-align: center;
  padding: 18px 0 16px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 4px;
}
.mixer-hero-label { font-size: 13px; color: var(--ink-soft); margin-bottom: 6px; }
.mixer-hero-value {
  font-family: 'Frank Ruhl Libre', serif;
  font-weight: 900; font-size: 44px; line-height: 1;
  color: var(--ink); direction: ltr;
  display: inline-flex; align-items: baseline; gap: 8px;
}
.mixer-hero-cpi {
  margin-top: 8px; font-size: 11.5px; color: var(--copper-deep);
  font-weight: 500;
}

.track-card {
  background: var(--stone);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 14px 14px 12px;
  display: flex; flex-direction: column; gap: 10px;
}
.track-card-top {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}
.track-type-btns { display: flex; gap: 5px; flex-wrap: wrap; }
.ttb {
  border: 1.5px solid var(--line); background: var(--paper);
  padding: 5px 9px; border-radius: 7px;
  font-family: 'Heebo', sans-serif; font-size: 12px; font-weight: 600;
  color: var(--ink-soft); cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  white-space: nowrap;
}
.ttb.ttb-on { background: var(--ink); color: var(--stone); border-color: var(--ink); }
.track-pmt {
  font-family: 'Frank Ruhl Libre', serif;
  font-size: 18px; font-weight: 700; color: var(--ink);
  white-space: nowrap; flex-shrink: 0; direction: ltr;
}

.ts-row {
  display: flex; align-items: center; gap: 8px;
}
.ts-label {
  font-size: 11.5px; font-weight: 500; color: var(--ink-soft);
  width: 30px; flex-shrink: 0; text-align: right;
}
.ts-range {
  flex: 1;
  -webkit-appearance: none;
  height: 4px; border-radius: 2px; outline: none;
  background: linear-gradient(to left, var(--copper) var(--fill), var(--line) var(--fill));
}
.ts-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px; height: 18px; border-radius: 50%;
  background: var(--ink); border: 3px solid var(--paper);
  box-shadow: 0 0 0 1px var(--line); cursor: pointer;
}
.ts-range::-moz-range-thumb {
  width: 18px; height: 18px; border-radius: 50%;
  background: var(--ink); border: 3px solid var(--paper);
  box-shadow: 0 0 0 1px var(--line); cursor: pointer;
}
.ts-range:disabled::-webkit-slider-thumb { background: var(--ink-soft); }
.ts-val {
  min-width: 80px; text-align: left; direction: ltr;
  font-size: 13px; font-weight: 600; color: var(--ink);
}
.ts-cpi {
  font-size: 10px; color: var(--copper-deep); font-weight: 500;
  margin-right: 3px;
}
.ts-sub { font-size: 10px; color: var(--ink-soft); font-weight: 400; }

.track-cpi-note {
  font-size: 11.5px; color: var(--copper-deep);
  background: rgba(166,121,60,0.10); border-radius: 8px;
  padding: 7px 10px; line-height: 1.45;
}
.mixer-disclaimer {
  font-size: 11px; color: var(--ink-soft); text-align: center;
  margin: 0; opacity: 0.75;
}

/* ─── Field grid ─── */
.field-grid { display: flex; flex-direction: column; gap: 18px; }
.field-label-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 7px; }
.field-label { font-size: 13.5px; font-weight: 500; color: var(--ink); }
.field-hint  { font-size: 11.5px; color: var(--copper-deep); font-weight: 600; }

.number-field {
  display: flex; align-items: center;
  border: 1.5px solid var(--line); border-radius: 10px;
  background: var(--stone); padding: 0 14px;
  transition: border-color 0.15s;
}
.number-field:focus-within { border-color: var(--copper); }
.number-field input {
  flex: 1; border: none; background: transparent; outline: none;
  font-family: 'Heebo', sans-serif; font-size: 17px; font-weight: 500;
  color: var(--ink); padding: 12px 0; direction: ltr; text-align: right;
}
.number-suffix { font-size: 14px; color: var(--ink-soft); margin-right: 8px; }

.slider-row { display: flex; align-items: center; gap: 14px; }
.slider-row input[type="range"] {
  flex: 1;
  -webkit-appearance: none;
  height: 4px; border-radius: 2px; outline: none;
  background: linear-gradient(to left, var(--copper) var(--fill), var(--line) var(--fill));
}
.slider-row input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px; height: 20px; border-radius: 50%;
  background: var(--ink); border: 3px solid var(--paper);
  box-shadow: 0 0 0 1px var(--line); cursor: pointer;
}
.slider-row input[type="range"]::-moz-range-thumb {
  width: 20px; height: 20px; border-radius: 50%;
  background: var(--ink); border: 3px solid var(--paper);
  box-shadow: 0 0 0 1px var(--line); cursor: pointer;
}
.slider-value {
  min-width: 72px; text-align: left; direction: ltr;
  font-size: 15px; font-weight: 600; color: var(--ink);
}

/* ─── Mix CTA ─── */
.mix-cta {
  margin-top: 22px;
  background: var(--stone); border: 1px solid var(--line);
  border-radius: 14px; padding: 16px 16px 14px;
}
.mix-cta-title {
  display: block;
  font-family: 'Frank Ruhl Libre', serif;
  font-size: 16px; font-weight: 700; color: var(--ink); margin-bottom: 6px;
}
.mix-cta-text {
  font-size: 12.5px; color: var(--ink-soft); line-height: 1.6; margin: 0 0 12px;
}
.mix-cta-btn {
  display: flex; align-items: center; justify-content: center;
  background: #25D366; color: #0B3D1F;
  text-decoration: none; font-size: 13.5px; font-weight: 700;
  border-radius: 10px; padding: 12px;
  transition: transform 0.15s;
}
.mix-cta-btn:active { transform: scale(0.97); }

/* ─── Lead gate ─── */
.lead-gate {
  position: absolute; inset: 0;
  background: rgba(26,35,50,0.78); backdrop-filter: blur(3px);
  display: flex; align-items: flex-end;
  animation: fadeIn 0.35s ease;
}
@keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.lead-gate-inner {
  width: 100%; background: var(--paper);
  border-radius: 18px 18px 0 0; padding: 26px 22px 24px;
  animation: slideUp 0.4s cubic-bezier(.16,1,.3,1);
}
.lead-icon {
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--sage); color: white;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; margin-bottom: 12px;
}
.lead-gate-inner h3 {
  font-family: 'Frank Ruhl Libre', serif;
  font-size: 21px; margin: 0 0 6px; color: var(--ink);
}
.lead-sub   { font-size: 13.5px; color: var(--ink-soft); margin: 0 0 18px; line-height: 1.5; }
.lead-form  { display: flex; flex-direction: column; gap: 10px; }
.lead-input {
  border: 1.5px solid var(--line); border-radius: 10px;
  padding: 13px 14px;
  font-family: 'Heebo', sans-serif; font-size: 15px;
  background: var(--stone); outline: none; transition: border-color 0.15s;
}
.lead-input:focus { border-color: var(--copper); }
.lead-error  { color: var(--warn); font-size: 12.5px; margin-top: -2px; }
.lead-submit {
  background: var(--ink); color: var(--stone); border: none;
  border-radius: 10px; padding: 14px;
  font-family: 'Heebo', sans-serif; font-size: 15px; font-weight: 600;
  cursor: pointer; margin-top: 4px; transition: background 0.15s;
}
.lead-submit:hover { background: var(--copper-deep); }
.lead-skip {
  display: block; margin: 12px auto 0;
  background: none; border: none; color: var(--ink-soft);
  font-size: 12.5px; text-decoration: underline; cursor: pointer;
}

.thanks-strip {
  margin-top: 12px;
  background: rgba(124,139,122,0.15); color: var(--sage);
  border-radius: 12px; padding: 12px 16px;
  font-size: 13.5px; font-weight: 500; text-align: center;
}

/* ─── Full details ─── */
.full-details {
  margin-top: 26px; padding-top: 22px;
  border-top: 1px dashed var(--line);
  animation: fadeIn 0.4s ease;
}
.full-details h4 {
  font-family: 'Frank Ruhl Libre', serif;
  font-size: 17px; margin: 0 0 14px; color: var(--ink);
}
.schedule-chart {
  display: flex; align-items: flex-end; gap: 3px;
  height: 100px; margin-bottom: 8px;
}
.schedule-bar {
  flex: 1; height: 100%;
  display: flex; flex-direction: column; justify-content: flex-end;
  position: relative;
}
.schedule-bar-fill {
  width: 100%; background: var(--copper);
  border-radius: 2px 2px 0 0; min-height: 2px;
}
.schedule-year {
  position: absolute; bottom: -18px; left: 0; right: 0;
  text-align: center; font-size: 9.5px; color: var(--ink-soft);
}
.detail-stats {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 12px; margin-top: 26px;
}
.stat {
  background: var(--stone); border-radius: 10px;
  padding: 12px 14px;
  display: flex; flex-direction: column; gap: 4px;
}
.stat-label { font-size: 11.5px; color: var(--ink-soft); }
.stat-value { font-size: 16px; font-weight: 700; color: var(--ink); direction: ltr; text-align: right; }

/* ─── Monthly table ─── */
.monthly-section { margin-top: 20px; }
.monthly-toggle {
  background: none; border: 1px solid var(--line);
  border-radius: 8px; padding: 8px 14px;
  font-family: 'Heebo', sans-serif; font-size: 13px; color: var(--ink-soft);
  cursor: pointer; width: 100%;
  transition: background 0.15s;
}
.monthly-toggle:hover { background: var(--stone); }
.monthly-table { margin-top: 12px; }
.mt-header, .mt-row {
  display: grid; grid-template-columns: 0.6fr 1fr 1fr 1.2fr;
  gap: 4px; padding: 7px 4px;
  font-size: 12px; color: var(--ink);
  border-bottom: 1px solid var(--line);
  direction: ltr; text-align: right;
}
.mt-header {
  font-weight: 700; font-size: 11px;
  color: var(--ink-soft); background: var(--stone);
  border-radius: 8px 8px 0 0; padding: 8px 4px;
}
.mt-row:last-child { border-bottom: none; }
.mt-row:nth-child(even) { background: rgba(237,232,223,0.5); }

/* ─── Footer ─── */
.page-footer { margin-top: 24px; text-align: center; }
.page-footer p { font-size: 11px; color: var(--ink-soft); opacity: 0.8; line-height: 1.6; }

@media (max-width: 380px) {
  .hero-number { font-size: 36px; }
  .mixer-hero-value { font-size: 36px; }
  .detail-stats { grid-template-columns: 1fr; }
  .ts-val { min-width: 64px; font-size: 12px; }
}
`;
