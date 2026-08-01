// OPTIONAL: insert RIGHT AFTER your Trim / PDF text node, name it "Stamp OM Text"
// Wire: Trim → Stamp OM Text → LLM Extract
const j = $input.first().json;
const text = String(j.text || j.data || j.content || j.om_text || j.trimmed_text || '');
return [{ json: { ...j, om_text: text, text, _om_text_chars: text.length, _om_text_source: 'stamp_node' } }];
