const engine = $('Metrics + Risk Rules Engine').first().json;
let raw = $input.first().json?.choices?.[0]?.message?.content ?? '';
raw = raw.trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
let narrative;
try { narrative = JSON.parse(raw); }
catch (e) {
  narrative = {
    headline: (engine.summary?.recommendation || 'SCREEN') + ' - ' + (engine.summary?.rationale || ''),
    executive_summary: engine.summary?.rationale || '',
    key_strengths: [], key_concerns: [],
    critical_questions: [], recommended_next_steps: [],
    _note: 'Narrative generation failed.'
  };
}
return [{ json: {
  ...engine,
  address: engine.address || engine.full_address || null,
  city: engine.city || null,
  state: engine.state || null,
  submarket: engine.submarket || null,
  market: engine.market || {},
  narrative,
  status: 'complete'
}}];
