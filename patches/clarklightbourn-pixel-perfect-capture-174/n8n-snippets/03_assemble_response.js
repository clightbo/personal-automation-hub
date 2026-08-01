let engine;
const metricNames = [
  'Metrics + Risk Rules Engine',
  'Metrics + Risk Rules Engine1',
  'Metrics',
  'Metrics + Risk',
];
for (const n of metricNames) {
  try {
    engine = $(n).first().json;
    if (engine) break;
  } catch (e) {}
}
if (!engine) engine = {};

let raw = $input.first().json?.choices?.[0]?.message?.content ?? '';
raw = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
let narrative;
try {
  narrative = JSON.parse(raw);
} catch (e) {
  narrative = {
    headline: (engine.summary?.recommendation || 'SCREEN') + ' - ' + (engine.summary?.rationale || ''),
    executive_summary: engine.summary?.rationale || '',
    key_strengths: [],
    key_concerns: [],
    critical_questions: [],
    recommended_next_steps: [],
    _note: 'Narrative generation failed.',
  };
}

const prop =
  engine.property && typeof engine.property === 'object'
    ? engine.property
    : {
        name: typeof engine.property === 'string' ? engine.property : engine.property_name,
        address: engine.address || engine.full_address || null,
        city: engine.city || null,
        state: engine.state || null,
        submarket: engine.submarket || null,
        units: engine.units || null,
        year_built: engine.year_built || null,
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
