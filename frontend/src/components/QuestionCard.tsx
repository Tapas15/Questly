import { useMemo, useState } from 'react';
import type { Question } from '../types';

type Props = {
  question: Question;
  value: any;
  onChange: (value: any) => void;
  onAskAI?: () => void;
  aiSuggestion?: any;
  onAcceptAI?: () => void;
  onRejectAI?: () => void;
  aiLoading?: boolean;
};

export function QuestionCard({ question, value, onChange, onAskAI, aiSuggestion, onAcceptAI, onRejectAI, aiLoading }: Props) {
  const [otherText, setOtherText] = useState('');
  const selectedValues: string[] = useMemo(() => Array.isArray(value) ? value : value?.values || (typeof value === 'string' ? [value] : value?.value ? [value.value] : []), [value]);
  const currentOther = typeof value === 'object' && value && !Array.isArray(value) ? (value.other_text || '') : '';

  const updateOther = (text: string) => {
    setOtherText(text);
    if (question.type === 'single') {
      const selected = typeof value === 'string' ? value : value?.value;
      if (selected) onChange({ value: selected, other_text: text });
    } else if (question.type === 'multi') {
      const values = Array.isArray(value) ? value : value?.values || [];
      onChange({ values, other_text: text });
    }
  };

  const toggleMulti = (optValue: string) => {
    const cur = Array.isArray(value) ? value : value?.values || [];
    const exists = cur.includes(optValue);
    let next = exists ? cur.filter((v: string) => v !== optValue) : [...cur, optValue];
    if (!exists && question.max_selections && next.length > question.max_selections) return;
    if (question.allow_other || currentOther) onChange({ values: next, other_text: currentOther || otherText });
    else onChange(next);
  };

  const setSingle = (optValue: string) => {
    if (question.allow_other || currentOther) onChange({ value: optValue, other_text: currentOther || otherText });
    else onChange(optValue);
  };

  return (
    <div className="card question-card" id={`question-${question.id}`}>
      <div className="q-head">
        <div>
          <div className="q-num">Q{question.number} <span className="req-star">*</span></div>
          <div className="q-text">{question.text}</div>
          {question.max_selections ? <div className="muted">Select up to {question.max_selections}</div> : null}
        </div>
        {question.type === 'text' && onAskAI && (
          <button className="btn secondary small" onClick={onAskAI} disabled={aiLoading}>{aiLoading ? 'AI...' : 'AI help'}</button>
        )}
      </div>

      {question.type === 'text' && (
        <textarea className="input textarea" value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)} placeholder="Write your answer here..." />
      )}

      {question.type === 'single' && <div className="options">{question.options.map(opt => (
        <label key={opt.value} className="option"><input type="radio" name={question.id} checked={selectedValues.includes(opt.value)} onChange={() => setSingle(opt.value)} /> <span>{opt.label}</span></label>
      ))}</div>}

      {question.type === 'multi' && <div className="options">{question.options.map(opt => (
        <label key={opt.value} className="option"><input type="checkbox" checked={selectedValues.includes(opt.value)} onChange={() => toggleMulti(opt.value)} /> <span>{opt.label}</span></label>
      ))}</div>}

      {question.allow_other && (selectedValues.some(v => question.options.find(o => o.value === v)?.has_other_text) || question.options.some(o => o.has_other_text)) && (
        <input className="input" placeholder="Other (please specify)" value={currentOther || otherText} onChange={e => updateOther(e.target.value)} />
      )}

      {aiSuggestion !== undefined && aiSuggestion !== null && (
        <div className="ai-suggestion">
          <div className="ai-suggestion-head"><strong>AI suggestion</strong><span className="muted">{typeof aiSuggestion === 'string' ? aiSuggestion.slice(0, 120) : JSON.stringify(aiSuggestion).slice(0, 120)}</span></div>
          <div className="row gap">
            <button className="btn small" onClick={onAcceptAI}>Accept</button>
            <button className="btn secondary small" onClick={onRejectAI}>Reject</button>
          </div>
        </div>
      )}
    </div>
  );
}
