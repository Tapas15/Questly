import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { QuestionCard } from '../components/QuestionCard';
import type { Questionnaire, Suggestion } from '../types';

export function FormPage() {
  const { slug = '' } = useParams();
  const [q, setQ] = useState<Questionnaire | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [instruction, setInstruction] = useState('');
  const [respondent, setRespondent] = useState<Record<string, any>>({});
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [originalAnswers, setOriginalAnswers] = useState<Record<string, any>>({});
  const [suggestions, setSuggestions] = useState<Record<string, any>>({});
  const [acceptedAI, setAcceptedAI] = useState<Record<string, any>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [qAiLoading, setQAiLoading] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'done'>('idle');

  useEffect(() => { (async () => {
    try {
      const data = await api.getQuestionnaire(slug);
      setQ(data);
      const prefill = (data as any).sample_prefill;
      if (prefill?.answers) {
        setAnswers(prefill.answers);
        setOriginalAnswers(prefill.answers);
        setInstruction(prefill.instruction || '');
        setRespondent(prefill.respondent || {});
      }
    }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  })(); }, [slug]);

  const loadSample = async () => {
    if (!q) return;
    try {
      const prefill = await api.getQuestionnaireSample(slug);
      if (prefill?.answers) {
        setAnswers(prefill.answers);
        setOriginalAnswers(prefill.answers);
        setSuggestions({});
        setAcceptedAI({});
        setInstruction(prefill.instruction || '');
        setRespondent(prefill.respondent || {});
      }
    } catch (e: any) { setError(e.message); }
  };

  const setAnswer = (id: string, value: any) => {
    setAnswers(prev => { if (!(id in originalAnswers)) setOriginalAnswers(o => ({ ...o, [id]: prev[id] ?? null })); return { ...prev, [id]: value }; });
  };

  const applySuggestions = (items: Suggestion[]) => {
    setSuggestions(prev => {
      const next = { ...prev };
      for (const s of items) next[s.question_id] = s.suggested_value;
      return next;
    });
  };

  const generateAll = async () => {
    if (!q) return;
    setAiLoading(true); setError('');
    try {
      const res = await api.suggestAll(slug, { instruction, respondent, current_answers: answers });
      applySuggestions(res.suggestions);
    } catch (e: any) { setError(e.message); } finally { setAiLoading(false); }
  };

  const generateOne = async (questionId: string) => {
    if (!q) return;
    setQAiLoading(questionId); setError('');
    try {
      const res = await api.suggestQuestion(slug, { instruction, respondent, current_answers: answers, question_id: questionId });
      applySuggestions(res.suggestions);
    } catch (e: any) { setError(e.message); } finally { setQAiLoading(null); }
  };

  const accept = (id: string) => {
    const s = suggestions[id];
    setAnswer(id, s);
    setAcceptedAI(prev => ({ ...prev, [id]: s }));
    setSuggestions(prev => { const n = { ...prev }; delete n[id]; return n; });
  };
  const reject = (id: string) => setSuggestions(prev => { const n = { ...prev }; delete n[id]; return n; });

  const submit = async () => {
    if (!q) return;
    setSubmitState('submitting'); setError('');
    try {
      await api.submit(slug, { respondent, answers, ai_instruction: instruction, accepted_ai: acceptedAI });
      setSubmitState('done');
    } catch (e: any) { setError(e.message); setSubmitState('idle'); }
  };

  if (loading) return <div className="page"><div className="card">Loading questionnaire...</div></div>;
  if (error && !q) return <div className="page"><div className="card error">{error}</div></div>;
  if (!q) return null;
  if (submitState === 'done') return <div className="page"><div className="card success"><h1>Response submitted</h1><p>Thank you. Your response has been recorded.</p></div></div>;

  const sections = q.questions.reduce<Record<string, typeof q.questions>>((acc, qu) => { (acc[qu.section] ||= []).push(qu); return acc; }, {});

  return (
    <div className="page">
      <div className="hero card">
        <div className="hero-badge">AI-Assisted Questionnaire</div>
        <h1>{q.title}</h1>
        <p className="muted hero-sub">Fill the questionnaire manually or use AI suggestions. Review every answer before submitting.</p>
        <div className="hero-meta">
          <span>{q.stats.total_questions} questions</span>
          <span>{q.stats.single + q.stats.multi} choice</span>
          <span>{q.stats.text} descriptive</span>
        </div>
      </div>

      <div className="card ai-card">
        <div className="section-kicker">AI Autofill</div>
        <h2>Tell AI what you want to fill in this questionnaire</h2>
        <p className="muted">A fresh sample draft is auto-filled from this questionnaire. Each time you load/regenerate, sample choices and text vary. Edit any answer to match your firm's real details.</p>
        <textarea className="input textarea" value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="Example: I run a CA firm providing GST, income tax, accounting and auditing services. We use Tally and Excel. Our biggest challenge is manual reconciliation." />
        <div className="row gap mt">
          <button className="btn" onClick={generateAll} disabled={aiLoading || !instruction.trim()}>{aiLoading ? 'Generating suggestions...' : 'Generate suggestions'}</button>
          <button className="btn secondary" onClick={loadSample} disabled={aiLoading}>Generate new sample draft</button>
          <span className="muted">Review, modify, accept/reject, then submit.</span>
        </div>
        {error && <div className="error mt">{error}</div>}
      </div>

      {Object.entries(sections).map(([section, qs]) => (
        <div key={section} className="section">
          <div className="section-kicker">Section</div>
          <h2 className="section-title">{section}</h2>
          {qs.map(qu => (
            <QuestionCard key={qu.id} question={qu} value={answers[qu.id]} onChange={v => setAnswer(qu.id, v)} onAskAI={qu.type === 'text' ? () => generateOne(qu.id) : undefined} aiSuggestion={suggestions[qu.id]} onAcceptAI={() => accept(qu.id)} onRejectAI={() => reject(qu.id)} aiLoading={qAiLoading === qu.id} />
          ))}
        </div>
      ))}

      <div className="card firm-card">
        <div className="section-kicker">Final Step</div>
        <h2>Firm / respondent details <span className="optional-tag">(optional)</span></h2>
        <p className="muted">Please share only the details you are comfortable providing. You may leave any field blank.</p>
        <div className="grid two firm-grid">
          {q.firm_fields.map(f => (
            <label key={f.id} className={`field ${f.type === 'single' ? 'field-full' : ''}`}>
              <span className="field-label">{f.label}</span>
              {f.type === 'text' && <input className="input" value={respondent[f.id] || ''} onChange={e => setRespondent(p => ({ ...p, [f.id]: e.target.value }))} placeholder="Your answer" />}
              {f.type === 'single' && (
                <div className="choice-pills">
                  {(f.options || []).map(o => (
                    <label key={o.value} className={`pill ${respondent[f.id] === o.value ? 'selected' : ''}`}>
                      <input type="radio" name={`firm_${f.id}`} checked={respondent[f.id] === o.value} onChange={() => setRespondent(p => ({ ...p, [f.id]: o.value }))} />
                      <span>{o.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </label>
          ))}
        </div>
      </div>

      <div className="card submit-bar">
        <div>
          <div className="submit-title">Ready to submit?</div>
          <div className="muted">Review your answers. AI suggestions are only included if you accepted or edited them.</div>
        </div>
        <button className="btn submit-btn" onClick={submit} disabled={submitState === 'submitting'}>{submitState === 'submitting' ? 'Submitting...' : 'Submit response'}</button>
      </div>
    </div>
  );
}
