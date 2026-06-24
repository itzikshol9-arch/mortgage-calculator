import React, { useState, useMemo } from "react";

const WA_LINK = `https://wa.me/972528029668?text=${encodeURIComponent("היי, אשמח לשיחת ייעוץ למשכנתא לגיל השלישי")}`;
const TEL_LINK = "tel:0528029668";

function getMaxTerm(age, extended) {
  return Math.max(0, (extended ? 80 : 75) - age);
}

function getMaxLTV(age) {
  if (age < 65) return 75;
  if (age < 70) return 70;
  if (age < 75) return 60;
  return 50;
}

function getReverseLTV(age) {
  if (age < 60) return 0;
  if (age < 65) return 15 + (age - 60) * 2;
  if (age < 70) return 25 + (age - 65) * 2;
  if (age < 75) return 35 + (age - 70) * 2;
  return Math.min(45 + (age - 75) * 2, 55);
}

function monthlyPayment(principal, annualRatePct, years) {
  if (years <= 0 || principal <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

const fmt = (n) => Math.round(n).toLocaleString("he-IL", { maximumFractionDigits: 0 });

function AgeBadge({ age }) {
  let color, label;
  if (age < 60)      { color = "green";  label = "תנאים טובים"; }
  else if (age < 65) { color = "blue";   label = "הגבלות מתונות"; }
  else if (age < 70) { color = "amber";  label = "הגבלות משמעותיות"; }
  else if (age < 75) { color = "orange"; label = "הגבלות חמורות"; }
  else               { color = "red";    label = "אפשרויות מוגבלות מאוד"; }

  const maxT   = getMaxTerm(age, false);
  const maxLTV = getMaxLTV(age);

  return (
    <div className={`ta-age-badge ta-badge-${color}`}>
      <span className="ta-badge-label">{label}</span>
      <div className="ta-badge-stats">
        <span>תקופה מקסימלית: <b>{maxT} שנים</b></span>
        <span>מימון מקסימלי: <b>{maxLTV}%</b></span>
      </div>
    </div>
  );
}

export default function ThirdAgeMortgageSimulator() {
  const [age,           setAge]          = useState(65);
  const [extended,      setExtended]     = useState(false);
  const [propertyValue, setPropertyValue] = useState(1500000);
  const [downPayment,   setDownPayment]  = useState(750000);
  const [income,        setIncome]       = useState(9000);
  const [rate,          setRate]         = useState(4.90);
  const [years,         setYears]        = useState(10);

  const maxTerm      = getMaxTerm(age, extended);
  const maxLTV       = getMaxLTV(age);
  const minDown      = propertyValue * (1 - maxLTV / 100);
  const loanAmount   = Math.max(0, Math.min(propertyValue - downPayment, propertyValue * maxLTV / 100));
  const effectiveLTV = propertyValue > 0 ? (loanAmount / propertyValue) * 100 : 0;
  const effYears     = Math.min(years, Math.max(maxTerm, 1));
  const ageAtEnd     = age + effYears;

  const payment       = useMemo(() => monthlyPayment(loanAmount, rate, effYears), [loanAmount, rate, effYears]);
  const totalPaid     = payment * effYears * 12;
  const totalInterest = totalPaid - loanAmount;
  const payRatio      = income > 0 ? (payment / income) * 100 : 0;
  const affordColor   = payRatio <= 35 ? "green" : payRatio <= 45 ? "amber" : "red";
  const affordLabel   = payRatio <= 35 ? "מצוין"  : payRatio <= 45 ? "בגבול" : "גבוה מדי";

  const scenarios = useMemo(() => {
    if (maxTerm <= 0 || loanAmount <= 0) return [];
    const pts = maxTerm <= 4
      ? Array.from({ length: maxTerm }, (_, i) => i + 1)
      : [
          Math.max(1, Math.round(maxTerm * 0.2)),
          Math.round(maxTerm * 0.45),
          Math.round(maxTerm * 0.75),
          maxTerm,
        ];
    return [...new Set(pts)].map(y => ({
      years: y,
      payment: monthlyPayment(loanAmount, rate, y),
      ageAtEnd: age + y,
      totalInterest: monthlyPayment(loanAmount, rate, y) * y * 12 - loanAmount,
    }));
  }, [loanAmount, rate, maxTerm, age]);

  const revPct      = getReverseLTV(age);
  const revMaxLoan  = propertyValue * revPct / 100;
  const downValid   = downPayment >= minDown;

  const changeAge = (a) => {
    setAge(a);
    const mt = getMaxTerm(a, extended);
    if (years > mt && mt > 0) setYears(mt);
  };

  const toggleExtended = () => {
    const next = !extended;
    setExtended(next);
    const mt = getMaxTerm(age, next);
    if (years > mt && mt > 0) setYears(mt);
  };

  const agePct = ((age - 55) / 25) * 100;
  const yearsPct = maxTerm > 1 ? ((effYears - 1) / (maxTerm - 1)) * 100 : 100;
  const ratePct  = ((rate - 3) / 6) * 100;

  return (
    <div className="ta-page" dir="rtl">
      <style>{CSS}</style>

      <header className="ta-header">
        <span className="ta-eyebrow">סימולטור ייחודי</span>
        <h1 className="ta-h1">משכנתא לגיל השלישי</h1>
        <p className="ta-sub">אחוזי מימון, תנאים והחזרים מותאמים לגיל הלווה</p>
      </header>

      <div className="ta-rates-row">
        <span>בנק ישראל <b>3.75%</b></span>
        <span className="ta-sep">|</span>
        <span>פריים <b>5.25%</b></span>
        <span className="ta-sep">|</span>
        <span>יוני 2026</span>
      </div>

      {/* ── AGE ── */}
      <div className="ta-card">
        <div className="ta-card-title">גיל הלווה</div>

        <div className="ta-age-hero">
          <span className="ta-age-num">{age}</span>
          <span className="ta-age-unit">שנים</span>
        </div>

        <input
          type="range" className="ta-range" min={55} max={80} step={1} value={age}
          onChange={e => changeAge(parseInt(e.target.value))}
          style={{ "--pct": `${agePct}%` }}
        />
        <div className="ta-range-labels">
          {[55, 60, 65, 70, 75, 80].map(a => (
            <button key={a} className={`ta-age-tick ${age === a ? "ta-tick-on" : ""}`}
              onClick={() => changeAge(a)}>{a}</button>
          ))}
        </div>

        <AgeBadge age={age} />

        <label className="ta-toggle-row" onClick={toggleExtended}>
          <div className={`ta-toggle ${extended ? "ta-toggle-on" : ""}`}>
            <div className="ta-toggle-thumb" />
          </div>
          <span>הבנק מאפשר עד גיל 80 (עם ביטוח חיים)</span>
        </label>

        {maxTerm === 0 && (
          <div className="ta-error-note">
            בגיל {age} לא ניתן לקחת משכנתא רגילה — שקלו משכנתא הפוכה (ראו למטה).
          </div>
        )}
      </div>

      {/* ── PROPERTY & LOAN ── */}
      {maxTerm > 0 && (
        <div className="ta-card">
          <div className="ta-card-title">נכס והלוואה</div>

          <div className="ta-field">
            <div className="ta-field-label">שווי הנכס</div>
            <div className="ta-input-wrap">
              <input className="ta-input" type="text" inputMode="numeric"
                value={fmt(propertyValue)}
                onChange={e => {
                  const v = parseInt(e.target.value.replace(/[^\d]/g, "")) || 0;
                  setPropertyValue(v);
                }}
              />
              <span className="ta-suffix">₪</span>
            </div>
          </div>

          <div className="ta-field">
            <div className="ta-field-label">
              הון עצמי
              <span className="ta-field-hint">מינימום {100 - maxLTV}% = ₪{fmt(minDown)}</span>
            </div>
            <div className="ta-input-wrap">
              <input className="ta-input" type="text" inputMode="numeric"
                value={fmt(downPayment)}
                onChange={e => {
                  const v = Math.min(parseInt(e.target.value.replace(/[^\d]/g, "")) || 0, propertyValue);
                  setDownPayment(v);
                }}
              />
              <span className="ta-suffix">₪</span>
            </div>
            {!downValid && (
              <div className="ta-field-warn">
                ⚠ נדרש הון עצמי מינימלי של ₪{fmt(minDown)} לגיל זה (לפחות {100 - maxLTV}% מהנכס)
              </div>
            )}
          </div>

          <div className="ta-loan-box">
            <div className="ta-loan-row">
              <span>סכום המשכנתא</span>
              <span className="ta-loan-big">₪{fmt(loanAmount)}</span>
            </div>
            <div className="ta-loan-row">
              <span>אחוז מימון</span>
              <span className={effectiveLTV > maxLTV ? "ta-val-warn" : ""}>
                {effectiveLTV.toFixed(0)}%
                <span className="ta-loan-max"> (מקסימום {maxLTV}%)</span>
              </span>
            </div>
          </div>

          <div className="ta-field">
            <div className="ta-field-label">
              תקופת ההלוואה
              <span className="ta-field-hint">מקסימום {maxTerm} שנים לגיל {age}</span>
            </div>
            <div className="ta-slider-row">
              <input
                type="range" className="ta-range" min={1} max={Math.max(maxTerm, 1)} step={1}
                value={effYears}
                onChange={e => setYears(parseInt(e.target.value))}
                style={{ "--pct": `${yearsPct}%` }}
              />
              <span className="ta-slider-val">{effYears} שנ' · סיום גיל {ageAtEnd}</span>
            </div>
          </div>

          <div className="ta-field">
            <div className="ta-field-label">ריבית שנתית</div>
            <div className="ta-slider-row">
              <input
                type="range" className="ta-range" min={3.0} max={9.0} step={0.05}
                value={rate}
                onChange={e => setRate(parseFloat(e.target.value))}
                style={{ "--pct": `${ratePct}%` }}
              />
              <span className="ta-slider-val">{rate.toFixed(2)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* ── RESULT ── */}
      {maxTerm > 0 && loanAmount > 0 && (
        <div className="ta-result-card">
          <div className="ta-result-label">החזר חודשי משוער</div>
          <div className="ta-result-num">
            ₪{fmt(payment)}<span className="ta-result-unit"> / חודש</span>
          </div>
          <div className="ta-result-sub">
            <span>סה"כ תשלום: ₪{fmt(totalPaid)}</span>
            <span className="ta-dot">·</span>
            <span>ריבית כוללת: ₪{fmt(totalInterest)}</span>
          </div>
          <div className="ta-bar-wrap">
            <div className="ta-bar">
              <div className="ta-bar-p" style={{ width: `${totalPaid > 0 ? (loanAmount / totalPaid) * 100 : 50}%` }} />
              <div className="ta-bar-i" style={{ width: `${totalPaid > 0 ? (totalInterest / totalPaid) * 100 : 50}%` }} />
            </div>
            <div className="ta-bar-legend">
              <span><i className="ta-dot-sq ta-sq-p" />קרן ₪{fmt(loanAmount)}</span>
              <span><i className="ta-dot-sq ta-sq-i" />ריבית ₪{fmt(totalInterest)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── AFFORDABILITY ── */}
      {maxTerm > 0 && (
        <div className="ta-card">
          <div className="ta-card-title">בדיקת יכולת החזר</div>
          <div className="ta-field" style={{ marginBottom: 0 }}>
            <div className="ta-field-label">הכנסה חודשית (פנסיה + קצבאות)</div>
            <div className="ta-input-wrap">
              <input className="ta-input" type="text" inputMode="numeric"
                value={fmt(income)}
                onChange={e => setIncome(parseInt(e.target.value.replace(/[^\d]/g, "")) || 0)}
              />
              <span className="ta-suffix">₪</span>
            </div>
          </div>

          {income > 0 && payment > 0 && (
            <div className={`ta-afford ta-afford-${affordColor}`}>
              <div className="ta-afford-top">
                <span className="ta-afford-pct">{payRatio.toFixed(0)}% מהכנסה</span>
                <span className="ta-afford-tag">{affordLabel}</span>
              </div>
              <div className="ta-afford-track">
                <div className="ta-afford-fill" style={{ width: `${Math.min(payRatio, 100)}%` }} />
                <div className="ta-afford-mark" style={{ left: "35%" }} />
                <div className="ta-afford-mark" style={{ left: "40%" }} />
              </div>
              <div className="ta-afford-scale">
                <span>0%</span><span style={{ marginRight: "auto", marginLeft: "-6px" }}>35%</span>
                <span style={{ marginRight: "auto", marginLeft: "-6px" }}>40%</span><span>100%</span>
              </div>
              <p className="ta-afford-msg">
                {affordColor === "green" && "ההחזר בטווח הנוח — בנקים מאשרים עד 35-40% מהכנסה פנויה."}
                {affordColor === "amber" && "ההחזר גבוה — בנקים מתקשים לאשר מעל 40%. כדאי להגדיל הון עצמי או לקצר תקופה."}
                {affordColor === "red"   && "ההחזר עולה על 45% מהכנסה — קשה מאוד לקבל אישור. יש לשקול הגדלת הון עצמי."}
              </p>
              <div className="ta-afford-note">
                💡 בנקים מכירים ב-70%–100% בלבד מהכנסת פנסיה — ההכנסה האפקטיבית בעיני הבנק עשויה להיות נמוכה יותר.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SCENARIOS ── */}
      {maxTerm > 0 && loanAmount > 0 && scenarios.length > 0 && (
        <div className="ta-card">
          <div className="ta-card-title">השוואת תרחישים — גיל {age}</div>
          <div className="ta-sc-table">
            <div className="ta-sc-head">
              <span>תקופה</span><span>החזר חודשי</span><span>גיל בסיום</span><span>סה"כ ריבית</span>
            </div>
            {scenarios.map((sc, i) => (
              <div key={i}
                className={`ta-sc-row ${sc.years === effYears ? "ta-sc-active" : ""}`}
                onClick={() => setYears(sc.years)}>
                <span>{sc.years} שנ'</span>
                <span className="ta-sc-pmt">₪{fmt(sc.payment)}</span>
                <span className={sc.ageAtEnd > 80 ? "ta-val-warn" : ""}>{sc.ageAtEnd}</span>
                <span>₪{fmt(sc.totalInterest)}</span>
              </div>
            ))}
          </div>
          <p className="ta-sc-hint">לחץ על שורה לבחירת תרחיש</p>
        </div>
      )}

      {/* ── REVERSE MORTGAGE ── */}
      {age >= 60 && (
        <div className="ta-card ta-rev-card">
          <div className="ta-card-title ta-rev-title">משכנתא הפוכה — אלטרנטיבה</div>
          <p className="ta-rev-desc">
            מיועד לבעלי נכס מגיל 60. מקבלים הלוואה כנגד הנכס <b>ללא החזר חודשי</b> —
            הריבית מצטברת והקרן נפרעת בעת מכירת הנכס.
          </p>

          <div className="ta-rev-grid">
            <div className="ta-rev-cell">
              <span className="ta-rev-lbl">מימון לגיל {age}</span>
              <span className="ta-rev-big">{revPct.toFixed(0)}%</span>
              <span className="ta-rev-sub">משווי הנכס</span>
            </div>
            <div className="ta-rev-cell">
              <span className="ta-rev-lbl">הלוואה מקסימלית</span>
              <span className="ta-rev-big">₪{fmt(revMaxLoan)}</span>
              <span className="ta-rev-sub">לנכס ₪{fmt(propertyValue)}</span>
            </div>
            <div className="ta-rev-cell ta-rev-zero">
              <span className="ta-rev-lbl">החזר חודשי</span>
              <span className="ta-rev-big">₪0</span>
              <span className="ta-rev-sub">ללא תשלום</span>
            </div>
          </div>

          <div className="ta-rev-table">
            <div className="ta-rev-table-title">מימון לפי גיל (משכנתא הפוכה)</div>
            <div className="ta-rev-row ta-rev-row-head">
              <span>גיל</span><span>60</span><span>65</span><span>70</span><span>75</span><span>80</span>
            </div>
            <div className="ta-rev-row">
              <span>מימון</span><span>15%</span><span>25%</span><span>35%</span><span>45%</span><span>55%</span>
            </div>
          </div>

          <div className="ta-rev-warn">
            ⚠ הריבית המצטברת עלולה לצמצם משמעותית את העיזבון — מומלץ ייעוץ משפחתי ומשפטי לפני החלטה.
          </div>

          <a href={WA_LINK} className="ta-rev-cta" target="_blank" rel="noopener noreferrer">
            שאלות על משכנתא הפוכה — צרו קשר
          </a>
        </div>
      )}

      {/* ── TIPS ── */}
      <div className="ta-card">
        <div className="ta-card-title">טיפים לגיל השלישי</div>
        <div className="ta-tips">
          {[
            ["📅", "כלל הגיל + תקופה", "רוב הבנקים: גיל + שנות הלוואה ≤ 75. חלק מהבנקים מאפשרים עד 80 עם ביטוח חיים."],
            ["💰", "הכנסה מפנסיה", "בנקים מכירים ב-70%–100% מהפנסיה. קצבת זקנה וביטוח לאומי נחשבות גם כן."],
            ["🛡", "ביטוח חיים", "ביטוח חיים נדרש ומתייקר עם הגיל — יש לכלול עלות זו בחישוב ההחזר הכולל."],
            ["👨‍👩‍👧", "לווה נוסף צעיר", "הוספת ילד כלווה שני מאריכה את תקופת ההלוואה ומשפרת את תנאי האישור."],
            ["🏠", "שיעבוד נכס קיים", "בעלי נכס ללא משכנתא יכולים לשעבדו — הלוואה ללא תלות ישירה בגיל הלווה כמגבלה יחידה."],
          ].map(([icon, title, body]) => (
            <div className="ta-tip" key={title}>
              <span className="ta-tip-icon">{icon}</span>
              <div><b>{title}</b><br />{body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA ── */}
      <div className="ta-cta">
        <div className="ta-cta-title">רוצים ייעוץ אישי?</div>
        <p className="ta-cta-sub">מתמחים במשכנתאות לגיל השלישי — נבנה יחד את התמהיל הנכון</p>
        <div className="ta-cta-btns">
          <a href={WA_LINK} className="ta-btn ta-btn-wa" target="_blank" rel="noopener noreferrer">וואטסאפ</a>
          <a href={TEL_LINK} className="ta-btn ta-btn-call">התקשרו</a>
        </div>
      </div>

      <footer className="ta-footer">
        * הנתונים הינם הערכה כללית. תנאי המשכנתא משתנים בין בנקים ולפי פרופיל הלווה.
        אחוזי המימון למשכנתא הפוכה הם הערכה בלבד. ריביות נכונות ליוני 2026.
      </footer>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;700;900&family=Heebo:wght@300;400;500;600;700&display=swap');
* { box-sizing: border-box; }
.ta-page {
  --ink:#1A2332; --ink-soft:#3D4A5C; --stone:#EDE8DF; --paper:#FFFFFF;
  --copper:#A6793C; --copper-deep:#8A6230; --sage:#7C8B7A;
  --warn:#B5563C; --line:#DAD3C5;
  font-family:'Heebo',sans-serif; background:var(--stone); color:var(--ink);
  min-height:100vh; padding:20px 18px 96px; max-width:560px; margin:0 auto;
}
.ta-header { text-align:center; margin-bottom:14px; }
.ta-eyebrow {
  display:block; font-size:11px; letter-spacing:.12em;
  color:var(--copper-deep); font-weight:600; text-transform:uppercase; margin-bottom:6px;
}
.ta-h1 {
  font-family:'Frank Ruhl Libre',serif; font-weight:700; font-size:28px;
  margin:0 0 8px; color:var(--ink);
}
.ta-sub { color:var(--ink-soft); font-size:14px; margin:0; }

.ta-rates-row {
  display:flex; align-items:center; justify-content:center; gap:8px;
  background:var(--ink); border-radius:10px; padding:8px 14px; margin-bottom:14px;
  font-size:12px; color:rgba(237,232,223,.7);
}
.ta-rates-row b { color:var(--stone); }
.ta-sep { opacity:.3; }

.ta-card {
  background:var(--paper); border:1px solid var(--line);
  border-radius:18px; padding:20px 18px; margin-bottom:14px;
  box-shadow:0 1px 2px rgba(26,35,50,.04),0 4px 14px rgba(26,35,50,.05);
}
.ta-card-title {
  font-family:'Frank Ruhl Libre',serif; font-size:17px; font-weight:700;
  color:var(--ink); margin-bottom:16px;
}

.ta-age-hero {
  display:flex; align-items:baseline; gap:6px;
  justify-content:center; margin-bottom:12px;
}
.ta-age-num {
  font-family:'Frank Ruhl Libre',serif; font-size:56px;
  font-weight:900; color:var(--ink); line-height:1;
}
.ta-age-unit { font-size:16px; color:var(--ink-soft); }

.ta-range {
  width:100%; -webkit-appearance:none; height:5px; border-radius:3px;
  outline:none; display:block; margin-bottom:8px;
  background:linear-gradient(to left,var(--copper) var(--pct),var(--line) var(--pct));
}
.ta-range::-webkit-slider-thumb {
  -webkit-appearance:none; width:22px; height:22px; border-radius:50%;
  background:var(--ink); border:3px solid var(--paper);
  box-shadow:0 0 0 1px var(--line); cursor:pointer;
}
.ta-range::-moz-range-thumb {
  width:22px; height:22px; border-radius:50%;
  background:var(--ink); border:3px solid var(--paper);
  box-shadow:0 0 0 1px var(--line); cursor:pointer;
}
.ta-range-labels {
  display:flex; justify-content:space-between; margin-bottom:12px;
}
.ta-age-tick {
  border:none; background:none; font-size:11.5px; color:var(--ink-soft);
  cursor:pointer; padding:2px 4px; border-radius:6px;
  font-family:'Heebo',sans-serif; font-weight:500;
  transition:background .15s,color .15s;
}
.ta-tick-on { background:var(--ink); color:var(--stone); }

.ta-age-badge {
  border-radius:12px; padding:12px 14px; margin-bottom:12px;
}
.ta-badge-green  { background:rgba(45,122,79,.10); }
.ta-badge-blue   { background:rgba(59,110,165,.10); }
.ta-badge-amber  { background:rgba(176,120,24,.12); }
.ta-badge-orange { background:rgba(192,88,32,.12); }
.ta-badge-red    { background:rgba(181,86,60,.12); }
.ta-badge-label {
  display:block; font-size:13px; font-weight:700; margin-bottom:8px;
}
.ta-badge-green  .ta-badge-label { color:#2D7A4F; }
.ta-badge-blue   .ta-badge-label { color:#3B6EA5; }
.ta-badge-amber  .ta-badge-label { color:#B07818; }
.ta-badge-orange .ta-badge-label { color:#C05820; }
.ta-badge-red    .ta-badge-label { color:var(--warn); }
.ta-badge-stats {
  display:flex; gap:16px; flex-wrap:wrap;
  font-size:13px; color:var(--ink-soft);
}
.ta-badge-stats b { color:var(--ink); font-weight:700; }

.ta-toggle-row {
  display:flex; align-items:center; gap:10px; cursor:pointer;
  font-size:13px; color:var(--ink-soft); margin-top:4px;
}
.ta-toggle {
  width:40px; height:22px; border-radius:11px; background:var(--line);
  position:relative; flex-shrink:0; transition:background .2s;
}
.ta-toggle.ta-toggle-on { background:var(--copper); }
.ta-toggle-thumb {
  position:absolute; top:3px; right:3px; width:16px; height:16px;
  border-radius:50%; background:#fff; transition:transform .2s;
  box-shadow:0 1px 3px rgba(0,0,0,.2);
}
.ta-toggle.ta-toggle-on .ta-toggle-thumb { transform:translateX(-18px); }

.ta-error-note {
  background:rgba(181,86,60,.10); border-radius:10px; padding:12px 14px;
  font-size:13px; color:var(--warn); margin-top:12px; line-height:1.5;
}

.ta-field { margin-bottom:18px; }
.ta-field:last-child { margin-bottom:0; }
.ta-field-label {
  font-size:13px; font-weight:500; color:var(--ink);
  margin-bottom:7px; display:flex; justify-content:space-between; align-items:baseline;
}
.ta-field-hint { font-size:11.5px; color:var(--copper-deep); font-weight:600; }
.ta-field-warn {
  font-size:12px; color:var(--warn);
  background:rgba(181,86,60,.08); border-radius:8px;
  padding:8px 10px; margin-top:6px; line-height:1.4;
}
.ta-input-wrap {
  display:flex; align-items:center; border:1.5px solid var(--line);
  border-radius:10px; background:var(--stone); padding:0 14px;
  transition:border-color .15s;
}
.ta-input-wrap:focus-within { border-color:var(--copper); }
.ta-input {
  flex:1; border:none; background:transparent; outline:none;
  font-family:'Heebo',sans-serif; font-size:17px; font-weight:500;
  color:var(--ink); padding:12px 0; direction:ltr; text-align:right;
}
.ta-suffix { font-size:14px; color:var(--ink-soft); margin-right:8px; }

.ta-slider-row { display:flex; align-items:center; gap:12px; }
.ta-slider-row .ta-range { flex:1; margin-bottom:0; }
.ta-slider-val {
  min-width:110px; text-align:left; direction:ltr;
  font-size:13px; font-weight:600; color:var(--ink); white-space:nowrap;
}

.ta-loan-box {
  background:var(--stone); border-radius:12px; padding:14px;
  margin:16px 0; display:flex; flex-direction:column; gap:10px;
}
.ta-loan-row {
  display:flex; justify-content:space-between; align-items:center;
  font-size:13.5px; color:var(--ink-soft);
}
.ta-loan-big { font-size:18px; font-weight:700; color:var(--ink); direction:ltr; }
.ta-loan-max { font-size:11px; font-weight:400; color:var(--ink-soft); }
.ta-val-warn { color:var(--warn) !important; font-weight:700; }

.ta-result-card {
  background:var(--ink); border-radius:18px; padding:24px 20px;
  margin-bottom:14px; text-align:center;
}
.ta-result-label { font-size:13px; color:rgba(237,232,223,.7); margin-bottom:6px; }
.ta-result-num {
  font-family:'Frank Ruhl Libre',serif; font-size:48px; font-weight:900;
  color:var(--stone); line-height:1; direction:ltr; display:inline-block;
}
.ta-result-unit {
  font-family:'Heebo',sans-serif; font-size:15px; font-weight:400;
  color:rgba(237,232,223,.7);
}
.ta-result-sub {
  font-size:12.5px; color:rgba(237,232,223,.6); margin:10px 0 16px;
  display:flex; justify-content:center; gap:10px; flex-wrap:wrap;
}
.ta-dot { opacity:.5; }
.ta-bar-wrap { margin-top:4px; }
.ta-bar {
  display:flex; height:10px; border-radius:5px; overflow:hidden;
  background:rgba(255,255,255,.1);
}
.ta-bar-p { background:var(--stone); height:100%; }
.ta-bar-i { background:var(--copper); height:100%; }
.ta-bar-legend {
  display:flex; justify-content:space-between;
  margin-top:8px; font-size:12px; color:rgba(237,232,223,.7);
}
.ta-bar-legend span { display:flex; align-items:center; gap:5px; }
.ta-dot-sq { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }
.ta-sq-p { background:var(--stone); }
.ta-sq-i { background:var(--copper); }

.ta-afford { border-radius:14px; padding:14px; margin-top:14px; }
.ta-afford-green  { background:rgba(45,122,79,.10); border:1px solid rgba(45,122,79,.25); }
.ta-afford-amber  { background:rgba(176,120,24,.10); border:1px solid rgba(176,120,24,.25); }
.ta-afford-red    { background:rgba(181,86,60,.10);  border:1px solid rgba(181,86,60,.25); }
.ta-afford-top {
  display:flex; justify-content:space-between; align-items:center;
  margin-bottom:10px; font-size:14px; font-weight:600; color:var(--ink);
}
.ta-afford-tag { font-size:12px; padding:3px 10px; border-radius:20px; font-weight:600; }
.ta-afford-green .ta-afford-tag  { background:rgba(45,122,79,.15);  color:#2D7A4F; }
.ta-afford-amber .ta-afford-tag  { background:rgba(176,120,24,.15); color:#B07818; }
.ta-afford-red   .ta-afford-tag  { background:rgba(181,86,60,.13);  color:var(--warn); }
.ta-afford-track {
  height:8px; border-radius:4px; background:rgba(0,0,0,.08);
  position:relative; margin-bottom:4px; overflow:hidden;
}
.ta-afford-fill {
  height:100%; border-radius:4px; transition:width .3s ease; max-width:100%;
}
.ta-afford-green .ta-afford-fill { background:#2D7A4F; }
.ta-afford-amber .ta-afford-fill { background:#B07818; }
.ta-afford-red   .ta-afford-fill { background:var(--warn); }
.ta-afford-mark {
  position:absolute; top:0; bottom:0; width:2px; background:rgba(0,0,0,.2);
}
.ta-afford-scale {
  display:flex; font-size:10px; color:var(--ink-soft); margin-bottom:8px;
}
.ta-afford-msg { font-size:12.5px; color:var(--ink-soft); line-height:1.5; margin-bottom:8px; }
.ta-afford-note {
  font-size:12px; color:var(--copper-deep);
  background:rgba(166,121,60,.10); border-radius:8px; padding:8px 10px; line-height:1.4;
}

.ta-sc-table { border-radius:12px; overflow:hidden; border:1px solid var(--line); }
.ta-sc-head, .ta-sc-row {
  display:grid; grid-template-columns:1fr 1.4fr 1fr 1.4fr;
  gap:4px; padding:10px 12px; font-size:12.5px;
}
.ta-sc-head {
  background:var(--stone); font-weight:600; color:var(--ink-soft);
  font-size:11px; border-bottom:1px solid var(--line);
}
.ta-sc-row {
  cursor:pointer; border-bottom:1px solid var(--line);
  transition:background .15s; color:var(--ink); align-items:center;
}
.ta-sc-row:last-child { border-bottom:none; }
.ta-sc-row:hover { background:var(--stone); }
.ta-sc-active { background:rgba(166,121,60,.12) !important; }
.ta-sc-pmt { font-weight:700; color:var(--copper-deep); }
.ta-sc-hint { font-size:11px; color:var(--ink-soft); text-align:center; margin:8px 0 0; opacity:.7; }

.ta-rev-card { background:linear-gradient(135deg,#1d2d44 0%,#1A2332 100%); }
.ta-rev-card .ta-card-title,.ta-rev-title { color:var(--stone); }
.ta-rev-desc { font-size:13.5px; line-height:1.6; color:rgba(237,232,223,.8); margin:0 0 16px; }
.ta-rev-desc b { color:var(--stone); }
.ta-rev-grid {
  display:grid; grid-template-columns:1fr 1fr 1fr;
  gap:10px; margin-bottom:16px;
}
.ta-rev-cell {
  background:rgba(255,255,255,.07); border-radius:12px;
  padding:14px 10px; text-align:center;
  display:flex; flex-direction:column; gap:4px;
}
.ta-rev-lbl { font-size:10.5px; color:rgba(237,232,223,.6); }
.ta-rev-big { font-family:'Frank Ruhl Libre',serif; font-size:20px; font-weight:700; color:var(--stone); }
.ta-rev-sub { font-size:10px; color:rgba(237,232,223,.5); }
.ta-rev-zero .ta-rev-big { color:#4FD18B; }
.ta-rev-table {
  background:rgba(255,255,255,.05); border-radius:10px; padding:12px; margin-bottom:14px;
}
.ta-rev-table-title { font-size:11px; color:rgba(237,232,223,.6); margin-bottom:8px; }
.ta-rev-row {
  display:grid; grid-template-columns:1.2fr 1fr 1fr 1fr 1fr 1fr;
  font-size:12px; color:rgba(237,232,223,.8); text-align:center; margin-bottom:4px;
}
.ta-rev-row span:first-child { text-align:right; }
.ta-rev-row-head { color:rgba(237,232,223,.5); font-size:11px; margin-bottom:6px; }
.ta-rev-warn {
  font-size:12px; color:rgba(237,232,223,.7);
  background:rgba(181,86,60,.2); border-radius:10px;
  padding:10px 12px; line-height:1.5; margin-bottom:12px;
}
.ta-rev-cta {
  display:block; text-align:center; background:#25D366; color:#0B3D1F;
  text-decoration:none; font-size:13.5px; font-weight:700;
  border-radius:10px; padding:12px; transition:transform .15s;
}
.ta-rev-cta:active { transform:scale(.97); }

.ta-tips { display:flex; flex-direction:column; gap:14px; }
.ta-tip { display:flex; gap:12px; align-items:flex-start; }
.ta-tip-icon { font-size:20px; line-height:1; flex-shrink:0; margin-top:1px; }
.ta-tip div { font-size:13px; color:var(--ink-soft); line-height:1.55; }
.ta-tip b { color:var(--ink); display:block; margin-bottom:2px; }

.ta-cta {
  background:var(--copper); border-radius:18px;
  padding:22px 18px; margin-bottom:14px; text-align:center;
}
.ta-cta-title {
  font-family:'Frank Ruhl Libre',serif; font-size:21px; font-weight:700;
  color:var(--paper); margin-bottom:8px;
}
.ta-cta-sub { font-size:13px; color:rgba(255,255,255,.85); margin-bottom:16px; line-height:1.5; }
.ta-cta-btns { display:flex; gap:10px; justify-content:center; }
.ta-btn {
  padding:12px 26px; border-radius:10px; font-family:'Heebo',sans-serif;
  font-size:14px; font-weight:700; text-decoration:none;
  transition:transform .15s; white-space:nowrap;
}
.ta-btn:active { transform:scale(.96); }
.ta-btn-wa   { background:#25D366; color:#0B3D1F; }
.ta-btn-call { background:var(--ink); color:var(--stone); }

.ta-footer {
  font-size:11px; color:var(--ink-soft); opacity:.75;
  line-height:1.6; text-align:center; margin-top:8px;
}

@media (max-width:380px) {
  .ta-result-num { font-size:38px; }
  .ta-age-num { font-size:46px; }
  .ta-rev-grid { grid-template-columns:1fr 1fr; }
  .ta-rev-zero { grid-column:span 2; }
}
`;
