import { supabase } from './supabaseClient';

async function test() {
  try {
    console.log("Testing fetch materias...");
    const { data: mData, error: mErr } = await supabase.from('materias').select('id').limit(1);
    console.log("Materias ID:", mData);
    if (mErr) console.error(mErr);
    
    console.log("Testing fetch lecciones...");
    const { data: lData, error: lErr } = await supabase.from('lecciones').select('id, materia_id').limit(1);
    console.log("Lecciones ID:", lData);
    if (lErr) console.error(lErr);
    
    console.log("Testing fetch microtemas...");
    const { data: miData, error: miErr } = await supabase.from('microtemas').select('id, leccion_id').limit(1);
    console.log("Microtemas ID:", miData);
    if (miErr) console.error(miErr);
    
    console.log("Testing fetch preguntas...");
    const { data: pData, error: pErr } = await supabase.from('preguntas').select('id, microtema_id').limit(1);
    console.log("Preguntas ID:", pData);
    if (pErr) console.error(pErr);
  } catch (e) {
    console.error("Error:", e);
  }
}

test();
