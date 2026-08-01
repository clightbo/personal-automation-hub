// Paste into a NEW Code node named: Quick Assemble
// Wire: Metrics + Risk Rules Engine → Quick Assemble → Respond to Lovable
// Do NOT wait for LLM Write Memo — that is what makes runs never finish.

const engine = $input.first().json || {};

const prop =
  engine.property && typeof engine.property === 'object'
    ? engine.property
    : {
        name:
          typeof engine.property === 'string'
            ? engine.property
            : engine.property_name || 'Screened Deal',
        address: engine.address || engine.full_address || null,
        city: engine.city || null,
        state: engine.state || null,
        submarket: engine.submarket || null,
        units: engine.units || null,
        year_built: engine.year_built || null,
      };

const narrative = engine.narrative || {
  headline:
    (engine.summary?.recommendation || 'SCREEN') +
    ' — ' +
    (engine.summary?.rationale || 'Metrics ready'),
  executive_summary:
    engine.summary?.rationale ||
    'Full AI memo was skipped so the webhook can finish before timeout. Metrics, risk flags, and bid ladder are live.',
  key_strengths: [],
  key_concerns: (engine.flags || [])
    .filter((f) => ['CRITICAL', 'HIGH'].includes(String(f.severity || '').toUpperCase()))
    .slice(0, 5)
    .map((f) => f.rule + ': ' + (f.reason || '')),
  critical_questions: [],
  recommended_next_steps: [
    'Review risk flags and bid ladder',
    'Re-enable LLM Write Memo later for a full narrative',
  ],
  _note: 'quick_assemble_no_memo_llm',
};

return [
  {
    json: {
      ...engine,
      property: prop,
      address: prop.address || engine.address || null,
      city: prop.city || engine.city || null,
      state: prop.state || engine.state || null,
      submarket: prop.submarket || engine.submarket || null,
      market: engine.market && typeof engine.market === 'object' ? engine.market : {},
      narrative,
      status: 'complete',
    },
  },
];
