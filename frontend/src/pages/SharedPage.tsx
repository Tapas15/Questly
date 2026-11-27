import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { SharedPayload } from '../types';

export function SharedPage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<SharedPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(0);

  useEffect(() => { (async () => {
    try { setData(await api.getShared(token)); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  })(); }, [token]);

  const activeResp = data?.responses[active];

  const summary = useMemo(() => {
    if (!activeResp) return [];
    const r = activeResp.respondent || {};
    return [
      ['Firm', r.firm_practice_name],
      ['Location', r.office_location_city_state],
      ['Role', r.your_designation_role],
      ['Experience', data?.questionnaire.firm_fields.find(f => f.id === 'years_of_experience')?.options?.find(o => o.value === r.years_of_experience)?.label || r.years_of_experience],
      ['Clients', r.approximate_number_of_active_clients_optional],
    ].filter(([, v]) => v);
  }, [activeResp, data]);

  if (loading) return <div className="page"><div className="card">Loading shared responses...</div></div>;
  if (error || !data) return <div className="page"><div className="card error">{error || 'Not found'}</div></div>;

  return (
    <div className="page">
      <div className="hero card share-hero">
        <div>
          <div className="hero-badge">Shared Response View</div>
          <h1>{data.questionnaire.title}</h1>
          <p className="muted hero-sub">Response summary shared by the questionnaire owner, including MCQ selections and descriptive answers.</p>
        </div>
        <div className="hero-meta">
          <span>{data.responses.length} responses</span>
          <span>{data.questionnaire.stats.multi + data.questionnaire.stats.single} MCQ questions</span>
        </div>
      </div>

      <div className="share-layout">
        <div className="card share-sidebar">
          <div className="section-kicker">Respondents</div>
          <h2>Submissions</h2>
          <div className="response-list">
            {data.responses.map((r, i) => (
              <button key={r.id} className={`response-item ${i === active ? 'active' : ''}`} onClick={() => setActive(i)}>
                <div className="response-firm">{r.respondent.firm_practice_name || r.respondent.your_name_optional || `Response ${i + 1}`}</div>
                <div className="muted">{new Date(r.submitted_at).toLocaleString()}</div>
              </button>
            ))}
            {!data.responses.length && <div className="muted">No submissions yet.</div>}
          </div>
        </div>

        <div className="share-main">
          {activeResp ? (
            <>
              <div className="card">
                <div className="section-kicker">Respondent</div>
                <h2>{activeResp.respondent.firm_practice_name || 'Anonymous respondent'}</h2>
                <div className="summary-grid">
                  {summary.map(([k, v]) => <div key={String(k)} className="summary-item"><div className="summary-label">{k}</div><div className="summary-value">{String(v)}</div></div>)}
                </div>
              </div>
              <div className="card">
                <div className="section-kicker">MCQ Answers</div>
                <h2>Selected choices</h2>
                <div className="mcq-list">
                  {activeResp.mcq_answers.map(a => (
                    <div key={a.question_id} className="mcq-item">
                      <div className="q-num">Q{a.number}</div>
                      <div className="q-text">{a.text}</div>
                      <div className="answer-chips">{a.labels.map((l, i) => <span key={i} className="answer-chip">{l}</span>)}</div>
                    </div>
                  ))}
                  {!activeResp.mcq_answers.length && <div className="muted">No MCQ answers submitted.</div>}
                </div>
              </div>
              {(activeResp as any).descriptive_answers?.length ? (
                <div className="card">
                  <div className="section-kicker">Descriptive Answers</div>
                  <h2>Written responses</h2>
                  <div className="mcq-list">
                    {(activeResp as any).descriptive_answers.map((a: any) => (
                      <div key={a.question_id} className="mcq-item">
                        <div className="q-num">Q{a.number}</div>
                        <div className="q-text">{a.text}</div>
                        <div className="desc-answer">{a.answer}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : <div className="card"><div className="muted">Select a response.</div></div>}
        </div>
      </div>
    </div>
  );
}
