const engine = $('Metrics + Risk Rules Engine').first().json;
let raw = $input.first().json?.choices?.[0]?.message?.content ?? '';
raw = raw.trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
let narrative;
try { narrative = JSON.parse(raw); }
catch (e) {
  narrative = {
    headline: engine.summary.recommendation + ' - ' + engine.summary.rationale,
    executive_summary: engine.summary.rationale,
    key_strengths: [], key_concerns: [],
    critical_questions: [], recommended_next_steps: [],
    _note: 'Narrative generation failed.'
  };
}
return [{ json: {
  ...engine,
  market: engine.market || {},
  narrative,
  status: 'complete'
}}];