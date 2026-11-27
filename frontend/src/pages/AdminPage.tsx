import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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

export function AdminPage() {
  const [token, setToken] = useState(getAdminToken());
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [selected, setSelected] = useState<Questionnaire | null>(null);
  const [responses, setResponses] = useState<SavedResponse[]>([]);

  const load = async () => {
    try { setQuestionnaires(await api.listQuestionnaires()); } catch (e: any) { setError(e.message); }
  };
  useEffect(() => { if (token) load(); }, []);

  const upload = async () => {
    if (!file) return;
    setLoading(true); setError('');
    try {
      setAdminToken(token);
      const q = await api.uploadQuestionnaire(file);
      setSelected(q);
      await load();
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const openResponses = async (q: Questionnaire) => {
    setSelected(q); setError('');
    try { setResponses(await api.listResponses(q.public_slug)); } catch (e: any) { setError(e.message); }
  };

  const removeQuestionnaire = async (slug: string) => {
    if (!confirm('Delete this questionnaire and all its responses?')) return;
    try {
      setAdminToken(token);
      await api.deleteQuestionnaire(slug);
      if (selected?.public_slug === slug) { setSelected(null); setResponses([]); }
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key); setTimeout(() => setCopied(''), 1500);
  };

  const selectedUrl = useMemo(() => selected ? `${window.location.origin}/q/${selected.public_slug}` : '', [selected]);
  const openUrl = useMemo(() => selected ? `${window.location.origin}/q/${selected.public_slug}?auth=open` : '', [selected]);
  const shareUrl = useMemo(() => selected?.share_token ? `${window.location.origin}/s/${selected.share_token}` : '', [selected]);

  return (
    <div className="page admin-page">
      <div className="hero card admin-hero">
        <div>
          <div className="hero-badge">Admin Workspace</div>
          <h1>Questionnaire Control Center</h1>
          <p className="muted hero-sub">Upload Word questionnaires, share public links with CA firms, and review responses in a clean dashboard.</p>
        </div>
        <div className="hero-meta">
          <span>{questionnaires.length} questionnaires</span>
          <span>{responses.length} loaded responses</span>
        </div>
      </div>

      <div className="card">
        <div className="section-kicker">Setup</div>
        <h2>Upload & parse questionnaire</h2>
        <div className="grid two">
          <label className="field"><span className="field-label">Admin token</span><input className="input" value={token} onChange={e => setToken(e.target.value)} placeholder="ADMIN_TOKEN" /></label>
          <label className="field"><span className="field-label">Word document (.docx)</span><input className="input" type="file" accept=".docx" onChange={e => setFile(e.target.files?.[0] || null)} /></label>
        </div>
        <div className="row gap mt">
          <button className="btn" onClick={upload} disabled={loading || !file}>{loading ? 'Parsing document...' : 'Upload & Parse'}</button>
          <button className="btn secondary" onClick={() => { setAdminToken(token); load(); }}>Refresh</button>
        </div>
        {error && <div className="error mt">{error}</div>}
      </div>

      {selected && (
        <div className="card">
          <div className="section-kicker">Ready to Share</div>
          <h2>{selected.title}</h2>
          <div className="stats">
            <div className="stat"><div className="stat-num">{selected.stats.total_questions}</div><div className="muted">Total</div></div>
            <div className="stat"><div className="stat-num">{selected.stats.single}</div><div className="muted">Single</div></div>
            <div className="stat"><div className="stat-num">{selected.stats.multi}</div><div className="muted">Multi</div></div>
            <div className="stat"><div className="stat-num">{selected.stats.text}</div><div className="muted">Descriptive</div></div>
          </div>
          <div className="share-links">
            <label className="field"><span className="field-label">Authenticated link (Google sign-in required)</span><div className="copy-row"><input className="input" readOnly value={selectedUrl} /><button className="btn secondary small" onClick={() => copy(selectedUrl, 'public')}>{copied === 'public' ? 'Copied' : 'Copy'}</button></div></label>
            <label className="field"><span className="field-label">Anonymous link (no sign-in, labeled Anonymous)</span><div className="copy-row"><input className="input" readOnly value={openUrl} /><button className="btn secondary small" onClick={() => copy(openUrl, 'open')}>{copied === 'open' ? 'Copied' : 'Copy'}</button></div></label>
            <label className="field"><span className="field-label">MCQ+descriptive share view (for you/others)</span><div className="copy-row"><input className="input" readOnly value={shareUrl} /><button className="btn secondary small" onClick={() => copy(shareUrl, 'share')}>{copied === 'share' ? 'Copied' : 'Copy'}</button></div></label>
          </div>
          <div className="row gap mt">
            <Link className="btn" to={`/q/${selected.public_slug}`}>Open authenticated form</Link>
            <Link className="btn secondary" to={`/q/${selected.public_slug}?auth=open`}>Open anonymous form</Link>
            {selected.share_token && <Link className="btn secondary" to={`/s/${selected.share_token}`}>Open share view</Link>}
            <button className="btn secondary" onClick={() => openResponses(selected)}>Load responses</button>
            <a className="btn secondary" href={api.exportCsvUrl(selected.public_slug)} onClick={(e) => { e.preventDefault(); setAdminToken(token); api.exportWithToken(selected.public_slug, 'csv').catch(err => setError(err.message)); }}>CSV</a>
            <a className="btn secondary" href={api.exportXlsxUrl(selected.public_slug)} onClick={(e) => { e.preventDefault(); setAdminToken(token); api.exportWithToken(selected.public_slug, 'xlsx').catch(err => setError(err.message)); }}>XLSX</a>
          </div>
        </div>
      )}

      <div className="card">
        <div className="section-kicker">Library</div>
        <h2>Existing questionnaires</h2>
        <div className="list">
          {questionnaires.map(q => (
            <div key={q.id} className="list-item q-item">
              <div><strong>{q.title}</strong><div className="muted">{q.source_filename} · {q.stats.total_questions} questions · {new Date(q.created_at).toLocaleDateString()}</div></div>
              <div className="row gap"><button className="btn secondary small" onClick={() => openResponses(q)}>Responses</button><Link className="btn small" to={`/q/${q.public_slug}`}>Open</Link><button className="btn danger small" onClick={() => removeQuestionnaire(q.public_slug)}>Delete</button></div>
            </div>
          ))}
          {!questionnaires.length && <div className="muted">No questionnaires uploaded yet.</div>}
        </div>
      </div>

      {selected && (
        <div className="card">
          <div className="section-kicker">Responses</div>
          <h2>Submissions ({responses.length})</h2>
          <div className="response-cards">
            {responses.map(r => {
              const mcqQs = selected.questions.filter(q => q.type !== 'text');
              const mcqAnswered = mcqQs.filter(q => answerLabels(q, r.answers?.[q.id]).length).length;
              return (
                <div key={r.id} className="response-card">
                  <div className="response-card-head">
                    <div>
                      <div className="response-firm">
                        {r.respondent?._auth?.email ? <span>{r.respondent._auth.name || r.respondent._auth.email} <span className="muted" style={{fontWeight:400}}>({r.respondent._auth.email})</span></span>
                          : (r.respondent?._display_name || r.respondent?._firm_name)
                            ? <span>{r.respondent._display_name || 'Unnamed'}{r.respondent._firm_name ? <span className="muted" style={{fontWeight:400}}> — {r.respondent._firm_name}</span> : null}</span>
                            : r.respondent?._anon?.label || r.respondent?.firm_practice_name || r.respondent?.your_name_optional || 'Anonymous respondent'}
                      </div>
                      <div className="muted">{new Date(r.submitted_at).toLocaleString()} · {r.respondent?._auth ? `Google verified` : `Anonymous${r.respondent?._anon?.anon_id ? ` · ID ${r.respondent._anon.anon_id}` : ''}`}</div>
                    </div>
                    <div className="badge">{mcqAnswered}/{mcqQs.length} MCQ answered</div>
                  </div>
                  <div className="summary-grid compact">
                    {r.respondent?.office_location_city_state && <div className="summary-item"><div className="summary-label">Location</div><div className="summary-value">{r.respondent.office_location_city_state}</div></div>}
                    {r.respondent?.your_designation_role && <div className="summary-item"><div className="summary-label">Role</div><div className="summary-value">{r.respondent.your_designation_role}</div></div>}
                    {r.respondent?.primary_contact_email_phone_optional && <div className="summary-item"><div className="summary-label">Contact</div><div className="summary-value">{r.respondent.primary_contact_email_phone_optional}</div></div>}
                  </div>
                  <details className="response-detail">
                    <summary>View MCQ answers</summary>
                    <div className="mcq-list">
                      {mcqQs.map(q => {
                        const labels = answerLabels(q, r.answers?.[q.id]);
                        if (!labels.length) return null;
                        return <div key={q.id} className="mcq-item"><div className="q-num">Q{q.number}</div><div className="q-text">{q.text}</div><div className="answer-chips">{labels.map((l, i) => <span key={i} className="answer-chip">{l}</span>)}</div></div>;
                      })}
                    </div>
                  </details>
                  <details className="response-detail">
                    <summary>View descriptive answers</summary>
                    <div className="mcq-list">
                      {selected.questions.filter(q => q.type === 'text').map(q => {
                        const val = r.answers?.[q.id];
                        const text = typeof val === 'string' ? val.trim() : '';
                        if (!text) return null;
                        return <div key={q.id} className="mcq-item"><div className="q-num">Q{q.number}</div><div className="q-text">{q.text}</div><div className="desc-answer">{text}</div></div>;
                      })}
                    </div>
                  </details>
                </div>
              );
            })}
            {!responses.length && <div className="muted">No responses yet. Share the public link with respondents.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
