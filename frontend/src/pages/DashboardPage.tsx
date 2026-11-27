import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, getAdminToken, setAdminToken } from '../api/client';
import type { Questionnaire, SavedResponse } from '../types';

type ChartKind = 'bar' | 'donut' | 'line';

function answerLabels(q: any, value: any): string[] {
  const opts = Object.fromEntries((q.options || []).map((o: any) => [o.value, o.label]));
  if (q.type === 'single') {
    const v = typeof value === 'object' && value ? value.value : value;
    const other = typeof value === 'object' && value ? value.other_text : '';
    return v && opts[v] ? [opts[v] + (other ? ` (${other})` : '')] : [];
  }
  if (q.type === 'multi') {
    const vals = Array.isArray(value) ? value : value?.values || [];
    const other = typeof value === 'object' && !Array.isArray(value) ? value.other_text : '';
    const labels = vals.filter((v: string) => opts[v]).map((v: string) => opts[v]);
    if (other && labels.length) labels[labels.length - 1] += ` (${other})`;
    return labels;
  }
  return typeof value === 'string' && value.trim() ? [value.trim()] : [];
}

function pct(n: number, d: number) { return d ? Math.round((n / d) * 100) : 0; }
const PALETTE = ['#4f46e5','#06b6d4','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#64748b','#84cc16','#0ea5e9'];

function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let acc = 0;
  const stops = data.map(d => { const start = acc; acc += (d.value / total) * 360; return `${d.color} ${start}deg ${acc}deg`; }).join(', ');
  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ width: 180, height: 180, borderRadius: '50%', background: `conic-gradient(${stops})`, position: 'relative', flex: '0 0 auto' }}>
        <div style={{ position: 'absolute', inset: 28, background: '#fff', borderRadius: '50%', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <div><div style={{ fontSize: 28, fontWeight: 700, color: '#1e293b' }}>{total === 1 && data.every(d=>d.value===0) ? 0 : data.reduce((s,d)=>s+d.value,0)}</div><div className="muted" style={{ fontSize: 12 }}>responses</div></div>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 8, minWidth: 180 }}>
        {data.map(d => (
          <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: d.color, flex: '0 0 auto' }} />
            <span style={{ flex: 1 }}>{d.label}</span>
            <strong>{d.value}</strong>
            <span className="muted">{pct(d.value, data.reduce((s,x)=>s+x.value,0))}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChart({ rows, max }: { rows: { label: string; value: number; color: string }[]; max?: number }) {
  const m = max ?? Math.max(1, ...rows.map(r => r.value));
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rows.map(r => (
        <div key={r.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4, gap: 12 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
            <span className="muted" style={{ flex: '0 0 auto' }}>{r.value}</span>
          </div>
          <div style={{ background: '#e2e8f0', borderRadius: 999, height: 12, overflow: 'hidden' }}>
            <div style={{ width: `${(r.value / m) * 100}%`, background: r.color, height: '100%', borderRadius: 999, transition: 'width .4s ease' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function LineChart({ points, color = '#4f46e5' }: { points: { label: string; value: number }[]; color?: string }) {
  if (!points.length) return <div className="muted">No time data yet.</div>;
  const w = 700, h = 220, pad = 36;
  const max = Math.max(1, ...points.map(p => p.value));
  const xs = points.map((_, i) => pad + (i * (w - pad * 2)) / Math.max(1, points.length - 1));
  const ys = points.map(p => h - pad - (p.value / max) * (h - pad * 2));
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x} ${ys[i]}`).join(' ');
  const area = `${path} L ${xs[xs.length - 1]} ${h - pad} L ${xs[0]} ${h - pad} Z`;
  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', maxWidth: w, height: 'auto', display: 'block' }}>
        {[0,0.25,0.5,0.75,1].map(t => {
          const y = h - pad - t * (h - pad * 2);
          return <g key={t}><line x1={pad} y1={y} x2={w-pad} y2={y} stroke="#e2e8f0" /><text x={4} y={y+4} fontSize="10" fill="#94a3b8">{Math.round(max*t)}</text></g>;
        })}
        <path d={area} fill={color} opacity="0.12" />
        <path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {xs.map((x, i) => (
          <g key={i}>
            <circle cx={x} cy={ys[i]} r="4" fill="#fff" stroke={color} strokeWidth="2" />
            {(i === 0 || i === points.length - 1 || points.length <= 8 || i % Math.ceil(points.length/6) === 0) && (
              <text x={x} y={h - 10} fontSize="10" textAnchor="middle" fill="#64748b">{points[i].label}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

function pickChart(qu: any): ChartKind {
  const optCount = (qu.options || []).length;
  if (qu.type === 'single' && optCount <= 6) return 'donut';
  return 'bar';
}

export function DashboardPage() {
  const { slug = '' } = useParams();
  const [token, setToken] = useState(getAdminToken());
  const [q, setQ] = useState<Questionnaire | null>(null);
  const [responses, setResponses] = useState<SavedResponse[]>([]);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string>('all');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true); setError('');
    try {
      setAdminToken(token);
      const qs = await api.listQuestionnaires();
      const found = qs.find(x => x.public_slug === slug) || null;
      setQ(found);
      if (found) setResponses(await api.listResponses(slug));
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (token) load(); }, [slug]);

  const active = useMemo(() => selectedId === 'all' ? responses : responses.filter(r => r.id === selectedId), [responses, selectedId]);
  const mcqQuestions = useMemo(() => (q?.questions || []).filter(x => x.type !== 'text'), [q]);
  const textQuestions = useMemo(() => (q?.questions || []).filter(x => x.type === 'text'), [q]);

  const summary = useMemo(() => {
    const total = responses.length;
    const auth = responses.filter(r => r.respondent?._auth).length;
    const anon = total - auth;
    const latest = responses[0]?.submitted_at ? new Date(responses[0].submitted_at).toLocaleString() : '—';
    return { total, auth, anon, latest };
  }, [responses]);

  const overTime = useMemo(() => {
    const byDay: Record<string, number> = {};
    for (const r of responses) {
      const d = new Date(r.submitted_at);
      if (isNaN(d.getTime())) continue;
      const key = d.toISOString().slice(0, 10);
      byDay[key] = (byDay[key] || 0) + 1;
    }
    const keys = Object.keys(byDay).sort();
    let cum = 0;
    return keys.map(k => { cum += byDay[k]; return { label: k.slice(5), value: cum, daily: byDay[k] }; });
  }, [responses]);

  const mcqAgg = useMemo(() => {
    return mcqQuestions.map(qu => {
      const counts: Record<string, number> = {};
      (qu.options || []).forEach(o => { counts[o.value] = 0; });
      let answered = 0;
      for (const r of active) {
        const labels = answerLabels(qu, r.answers?.[qu.id]);
        if (labels.length) answered++;
        const vals = qu.type === 'multi'
          ? (Array.isArray(r.answers?.[qu.id]) ? r.answers[qu.id] : r.answers?.[qu.id]?.values || [])
          : [typeof r.answers?.[qu.id] === 'object' && r.answers?.[qu.id] ? r.answers[qu.id].value : r.answers?.[qu.id]];
        for (const v of vals) if (v && counts[v] !== undefined) counts[v]++;
      }
      const rows = (qu.options || []).map((o, i) => ({ label: o.label, value: counts[o.value] || 0, color: PALETTE[i % PALETTE.length], p: pct(counts[o.value] || 0, Math.max(answered, 1)) }));
      const sorted = [...rows].sort((a, b) => b.value - a.value);
      return { qu, answered, rows, sorted, chart: pickChart(qu) };
    });
  }, [mcqQuestions, active]);

  const respondentName = (r: SavedResponse) => {
    const a: any = r.respondent || {};
    if (a._auth?.email) return a._auth.name || a._auth.email;
    return a._display_name || a._firm_name || a._anon?.label || 'Anonymous';
  };

  return (
    <div className="page admin-page">
      <div className="hero card admin-hero">
        <div>
          <div className="hero-badge">Response Analytics</div>
          <h1>{q ? q.title : 'Questionnaire Dashboard'}</h1>
          <p className="muted hero-sub">Auto-updating graph dashboard. Charts adapt as responses accumulate over time.</p>
        </div>
        <div className="row gap" style={{ flexWrap: 'wrap' }}>
          <Link className="btn secondary" to="/">Admin</Link>
          {q && <Link className="btn secondary" to={`/q/${q.public_slug}`}>Open form</Link>}
        </div>
      </div>

      <div className="card">
        <div className="section-kicker">Access</div>
        <div className="grid two">
          <label className="field"><span className="field-label">Admin token</span><input className="input" value={token} onChange={e => setToken(e.target.value)} placeholder="ADMIN_TOKEN" /></label>
          <div className="field"><span className="field-label">Actions</span><div className="row gap"><button className="btn" onClick={load} disabled={loading || !token}>{loading ? 'Loading...' : 'Load dashboard'}</button></div></div>
        </div>
        {error && <div className="error mt">{error}</div>}
      </div>

      {q && (
        <>
          <div className="stats" style={{ marginBottom: 16 }}>
            <div className="stat"><div className="stat-num">{summary.total}</div><div className="muted">Total responses</div></div>
            <div className="stat"><div className="stat-num">{summary.auth}</div><div className="muted">Google verified</div></div>
            <div className="stat"><div className="stat-num">{summary.anon}</div><div className="muted">Anonymous</div></div>
            <div className="stat"><div className="stat-num" style={{ fontSize: 16 }}>{summary.latest}</div><div className="muted">Latest submission</div></div>
          </div>

          <div className="grid two" style={{ marginBottom: 16 }}>
            <div className="card">
              <div className="section-kicker">Over Time</div>
              <h2>Responses accumulated</h2>
              <p className="muted" style={{ marginTop: -4, marginBottom: 12, fontSize: 13 }}>Cumulative responses by day. This graph grows automatically as new data arrives.</p>
              {responses.length ? <LineChart points={overTime} /> : <div className="muted">No responses yet.</div>}
            </div>
            <div className="card">
              <div className="section-kicker">Respondent Mix</div>
              <h2>Identity breakdown</h2>
              <p className="muted" style={{ marginTop: -4, marginBottom: 12, fontSize: 13 }}>Google verified vs anonymous submissions.</p>
              <DonutChart data={[{ label: 'Google verified', value: summary.auth, color: '#4f46e5' }, { label: 'Anonymous', value: summary.anon, color: '#06b6d4' }]} />
            </div>
          </div>

          <div className="card">
            <div className="section-kicker">View</div>
            <h2>Individual or aggregate</h2>
            <div className="row gap mt" style={{ flexWrap: 'wrap' }}>
              <select className="input" style={{ maxWidth: 420 }} value={selectedId} onChange={e => setSelectedId(e.target.value)}>
                <option value="all">All responses (aggregate dashboard)</option>
                {responses.map(r => <option key={r.id} value={r.id}>{respondentName(r)} — {new Date(r.submitted_at).toLocaleString()}</option>)}
              </select>
              <span className="muted">{selectedId === 'all' ? `Showing aggregate of ${responses.length} responses` : 'Showing selected individual response'}</span>
            </div>
          </div>

          <div className="card">
            <div className="section-kicker">MCQ Graphs</div>
            <h2>Choice question analytics</h2>
            <p className="muted" style={{ marginTop: -4, marginBottom: 16, fontSize: 13 }}>Chart type is selected automatically: donut for small single-choice, horizontal bars for multi-choice/long option sets.</p>
            <div style={{ display: 'grid', gap: 16 }}>
              {mcqAgg.map(({ qu, answered, rows, sorted, chart }) => (
                <div key={qu.id} className="mcq-item">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div className="q-num">Q{qu.number} · {chart === 'donut' ? 'Donut' : 'Bar'} chart · {answered}/{active.length} answered</div>
                      <div className="q-text">{qu.text}</div>
                    </div>
                    <span className="badge">{qu.type === 'multi' ? 'Multi-select' : 'Single-select'}</span>
                  </div>
                  <div style={{ marginTop: 14 }}>
                    {chart === 'donut' ? (
                      <DonutChart data={rows.map(r => ({ label: r.label, value: r.value, color: r.color }))} />
                    ) : (
                      <BarChart rows={sorted.map(r => ({ label: `${r.label} (${r.p}%)`, value: r.value, color: r.color }))} />
                    )}
                  </div>
                </div>
              ))}
              {!mcqAgg.length && <div className="muted">No MCQ questions.</div>}
            </div>
          </div>

          <div className="card">
            <div className="section-kicker">Descriptive Responses</div>
            <h2>Text answers</h2>
            {selectedId === 'all' ? (
              <div className="mcq-list">
                {textQuestions.map(qu => {
                  const answers = active.map(r => ({ r, text: (typeof r.answers?.[qu.id] === 'string' ? r.answers[qu.id] : '').trim() })).filter(x => x.text);
                  return (
                    <div key={qu.id} className="mcq-item">
                      <div className="q-num">Q{qu.number} · {answers.length} responses</div>
                      <div className="q-text">{qu.text}</div>
                      <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                        {answers.map(({ r, text }) => (
                          <div key={r.id} className="desc-answer"><strong style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#64748b' }}>{respondentName(r)}</strong>{text}</div>
                        ))}
                        {!answers.length && <div className="muted">No answers yet.</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mcq-list">
                {textQuestions.map(qu => {
                  const r = active[0];
                  const text = r && typeof r.answers?.[qu.id] === 'string' ? r.answers[qu.id].trim() : '';
                  if (!text) return null;
                  return <div key={qu.id} className="mcq-item"><div className="q-num">Q{qu.number}</div><div className="q-text">{qu.text}</div><div className="desc-answer">{text}</div></div>;
                })}
              </div>
            )}
          </div>

          <div className="card">
            <div className="section-kicker">Respondents</div>
            <h2>Response list</h2>
            <div className="response-cards">
              {responses.map(r => (
                <div key={r.id} className="response-card">
                  <div className="response-card-head">
                    <div>
                      <div className="response-firm">{respondentName(r)}</div>
                      <div className="muted">{new Date(r.submitted_at).toLocaleString()} · {r.respondent?._auth ? 'Google verified' : `Anonymous${r.respondent?._anon?.anon_id ? ` · ID ${r.respondent._anon.anon_id}` : ''}`}</div>
                    </div>
                    <button className="btn secondary small" onClick={() => setSelectedId(r.id)}>View in dashboard</button>
                  </div>
                </div>
              ))}
              {!responses.length && <div className="muted">No responses yet.</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
