import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { QuestionCard } from '../components/QuestionCard';
import type { Questionnaire, Suggestion } from '../types';

export function FormPage() {
  const { slug = '' } = useParams();
  const [search] = useSearchParams();
  const authMode: 'required' | 'optional' = search.get('auth') === 'open' ? 'optional' : 'required';
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
  const [auth, setAuth] = useState<{ providers: { id: string; label: string }[]; user: any | null; required: boolean }>({ providers: [], user: null, required: false });
  const [sampleProfiles, setSampleProfiles] = useState<any[]>([]);
  const [selectedProfile, setSelectedProfile] = useState('');

  useEffect(() => { (async () => {
    try {
      const [data, prov, me, sample, mine] = await Promise.all([
        api.getQuestionnaire(slug),
        api.getAuthProviders().catch(() => ({ providers: [], auth_required_for_submit: false })),
        api.getMe().catch(() => ({ user: null })),
        api.getQuestionnaireSample(slug).catch(() => ({ sample_prefill: null, profiles: [] })),
        api.getMyResponse(slug).catch(() => ({ response: null })),
      ]);
      setQ(data);
      const required = authMode === 'required' ? !!prov.auth_required_for_submit : false;
      setAuth({ providers: prov.providers || [], required, user: me.user || null });
      setSampleProfiles(sample.profiles || []);
      if (mine.response) {
        setAnswers(mine.response.answers || {});
        setOriginalAnswers(mine.response.answers || {});
        setRespondent(mine.response.respondent || {});
        setInstruction(mine.response.ai_instruction || '');
        setAcceptedAI(mine.response.accepted_ai || {});
      } else {
        const prefill = (data as any).sample_prefill;
        if (prefill?.answers) {
          setAnswers(prefill.answers);
          setOriginalAnswers(prefill.answers);
          setInstruction(prefill.instruction || '');
          setRespondent(prefill.respondent || {});
        }
      }
    }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  })(); }, [slug, authMode]);

  const fillFromInput = () => {
    if (!q) return;
    const text = instruction.toLowerCase();
    const next: Record<string, any> = { ...answers };
    for (const qu of q.questions) {
      if (qu.type === 'single') {
        const match = qu.options.find(o => text.includes(o.label.toLowerCase().slice(0, Math.min(12, o.label.length))));
        if (match) next[qu.id] = match.value;
      } else if (qu.type === 'multi') {
        const matches = qu.options.filter(o => text.includes(o.label.toLowerCase().split(/[\s/]+/)[0])).map(o => o.value);
        if (matches.length) next[qu.id] = matches.slice(0, qu.max_selections || matches.length);
      } else {
        const qt = qu.text.replace(/^\d+\.\s*/, '').replace(/\?$/, '').trim();
        next[qu.id] = instruction.trim() ? `Based on your input: ${instruction.trim().slice(0, 220)}. Regarding "${qt}", we would tailor our response to this context.` : next[qu.id];
      }
    }
    setAnswers(next);
    setOriginalAnswers(next);
    setSuggestions({});
    setAcceptedAI({});
  };
  const loadSample = async (profileId?: string) => {
    if (!q) return;
    try {
      const res = await api.getQuestionnaireSample(slug, profileId);
      const prefill = res.sample_prefill;
      if (prefill?.answers) {
        setAnswers(prefill.answers);
        setOriginalAnswers(prefill.answers);
        setSuggestions({});
        setAcceptedAI({});
        setInstruction(prefill.instruction || '');
        setRespondent(prev => ({ ...prev, ...(prefill.respondent || {}) }));
        if (profileId) setSelectedProfile(profileId);
        if (res.profiles) setSampleProfiles(res.profiles);
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
      await api.submit(slug, { respondent, answers, ai_instruction: instruction, accepted_ai: acceptedAI }, authMode);
      setSubmitState('done');
    } catch (e: any) { setError(e.message); setSubmitState('idle'); }
  };

  if (loading) return <div className="page"><div className="card">Loading questionnaire...</div></div>;
  if (error && !q) return <div className="page"><div className="card error">{error}</div></div>;
  if (!q) return null;
  if (submitState === 'done') return       <div className="page"><div className="card success"><h1>Response submitted</h1><p>Thank you. Your response has been saved. You can reopen the same link to review or update it later.</p></div></div>;

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
        <div className="section-kicker">{authMode === 'required' ? 'Identity & AI Autofill' : 'Anonymous / AI Autofill'}</div>
        <h2>{authMode === 'required' ? 'Sign in and generate sample answers' : 'Fill anonymously or sign in'}</h2>
        <p className="muted">
          {authMode === 'required'
            ? 'Sign in with Google to identify your response. A fresh sample draft is auto-filled from this questionnaire; each regenerate gives different example selections/text. Edit anything to match your real details.'
            : 'This is the anonymous link. You can submit without signing in; your response will be labeled Anonymous with an ID. You may optionally sign in with Google if you want your name attached.'}
        </p>
        <div className="row gap mt" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          {auth.user ? (
            <>
              <span className="answer-chip">Signed in: {auth.user.email || auth.user.name} ({auth.user.provider})</span>
              <button className="btn secondary" onClick={async () => { await api.logout(); setAuth(a => ({ ...a, user: null })); }}>Sign out</button>
            </>
          ) : (
            <>
              {auth.providers.length ? auth.providers.map(p => (
                <a key={p.id} className={`btn ${authMode === 'required' ? '' : 'secondary'}`} href={`/api/auth/login/${p.id}?next=${encodeURIComponent(`/q/${slug}${authMode === 'optional' ? '?auth=open' : ''}`)}`}>Continue with {p.label}</a>
              )) : authMode === 'required' ? <span className="muted">Google sign-in is required but not configured. Admin: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env, then redeploy.</span> : <span className="muted">Anonymous submission enabled. Google sign-in optional if configured.</span>}
            </>
          )}
        </div>
        <textarea className="input textarea mt" value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="Describe your firm/context. Example: I run a CA firm providing GST, income tax, accounting and auditing services..." />
        <div className="row gap mt" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="input" style={{ maxWidth: 360 }} value={selectedProfile} onChange={e => setSelectedProfile(e.target.value)}>
            <option value="">Select a sample draft...</option>
            {sampleProfiles.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <button className="btn" onClick={() => loadSample(selectedProfile || undefined)} disabled={aiLoading}>{selectedProfile ? 'Generate & fill from selected sample' : 'Generate new sample draft'}</button>
          <button className="btn secondary" onClick={generateAll} disabled={aiLoading || !instruction.trim()}>{aiLoading ? 'Generating suggestions...' : 'Generate suggestions from my input'}</button>
          <button className="btn secondary" onClick={fillFromInput} disabled={aiLoading || !instruction.trim()}>Fill example from my input</button>
        </div>
        <div className="muted mt" style={{ fontSize: 13 }}>Select a sample to auto-fill all questionnaire fields below, or write your own context and use the input buttons. Review and edit every answer before submitting.</div>
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
        <h2>Respondent details <span className="optional-tag">(optional, recommended for anonymous)</span></h2>
        <p className="muted">
          {authMode === 'optional'
            ? 'Signed-in responses are identified by your Google account. If submitting anonymously, adding your name or firm helps us identify your response (recommended).'
            : 'Signed-in responses are identified by your Google account. You may share additional firm details below.'}
        </p>
        <div className="grid two firm-grid">
          <label className="field">
            <span className="field-label">Your name {authMode === 'optional' && !auth.user ? '(recommended)' : ''}</span>
            <input className="input" value={respondent._display_name || ''} onChange={e => setRespondent(p => ({ ...p, _display_name: e.target.value }))} placeholder="e.g. Ankit Sharma" />
          </label>
          <label className="field">
            <span className="field-label">Firm / practice name {authMode === 'optional' && !auth.user ? '(recommended)' : ''}</span>
            <input className="input" value={respondent._firm_name || ''} onChange={e => setRespondent(p => ({ ...p, _firm_name: e.target.value }))} placeholder="e.g. K. Sharma & Associates" />
          </label>
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
          <div className="muted">{authMode === 'required' && !auth.user ? 'Sign in with Google before submitting your response.' : authMode === 'optional' && !auth.user ? 'Submitting as Anonymous (no Google sign-in). Sign in above if you want your name attached.' : 'Review your answers. AI suggestions are only included if you accepted or edited them.'}</div>
        </div>
        <button className="btn submit-btn" onClick={submit} disabled={submitState === 'submitting' || (authMode === 'required' && !auth.user)}>{submitState === 'submitting' ? 'Submitting...' : authMode === 'optional' && !auth.user ? 'Submit anonymously' : 'Submit response'}</button>
      </div>
    </div>
  );
}
