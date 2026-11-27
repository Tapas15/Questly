export type Option = { value: string; label: string; has_other_text?: boolean };
export type FirmField = { id: string; label: string; type: 'text' | 'single' | 'multi'; options?: Option[] };
export type Question = {
  id: string;
  number: number;
  section: string;
  text: string;
  type: 'single' | 'multi' | 'text';
  options: Option[];
  allow_other: boolean;
  max_selections?: number | null;
  required: boolean;
};
export type Questionnaire = {
  id: string;
  title: string;
  source_filename: string;
  public_slug: string;
  share_token?: string;
  public_url: string;
  share_url?: string;
  created_at: string;
  firm_fields: FirmField[];
  questions: Question[];
  stats: Record<string, number>;
};
export type Suggestion = {
  question_id: string;
  suggested_value: any;
  confidence?: 'high' | 'medium' | 'low';
  reason?: string;
};
export type SavedResponse = {
  id: string;
  submitted_at: string;
  status: string;
  ai_instruction: string;
  respondent: Record<string, any>;
  answers: Record<string, any>;
  accepted_ai: Record<string, any>;
};

export type SharedMCQAnswer = { question_id: string; number: number; text: string; labels: string[] };
export type SharedResponse = { id: string; submitted_at: string; respondent: Record<string, any>; mcq_answers: SharedMCQAnswer[] };
export type SharedPayload = {
  questionnaire: { title: string; public_url: string; created_at: string; stats: Record<string, number>; firm_fields: FirmField[]; questions: Question[] };
  responses: SharedResponse[];
};
