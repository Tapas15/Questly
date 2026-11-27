import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, getAdminToken, setAdminToken } from '../api/client';
import type { Questionnaire, SavedResponse } from '../types';

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
      const rows = (qu.options || []).map(o => ({ label: o.label, count: counts[o.value] || 0, p: pct(counts[o.value] || 0, Math.max(answered, 1)) }))
        .sort((a, b) => b.count - a.count);
      return { qu, answered, rows };
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
          <div className="hero-badge">Response Dashboard</div>
          <h1>{q ? q.title : 'Questionnaire Dashboard'}</h1>
          <p className="muted hero-sub">Visual summary of collected responses. View aggregate insights or drill into an individual respondent.</p>
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
            <div className="section-kicker">MCQ Insights</div>
            <h2>Choice question distribution</h2>
            <div className="mcq-list">
              {mcqAgg.map(({ qu, answered, rows }) => (
                <div key={qu.id} className="mcq-item">
                  <div className="q-num">Q{qu.number} · {answered}/{active.length} answered</div>
                  <div className="q-text">{qu.text}</div>
                  <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                    {rows.map(row => (
                      <div key={row.label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                          <span>{row.label}</span><span className="muted">{row.count} ({row.p}%)</span>
                        </div>
                        <div style={{ background: '#e2e8f0', borderRadius: 999, height: 10, overflow: 'hidden' }}>
                          <div style={{ width: `${row.p}%`, background: 'linear-gradient(90deg,#4f46e5,#06b6d4)', height: '100%', borderRadius: 999 }} />
                        </div>
                      </div>
                    ))}
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
