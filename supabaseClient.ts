
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://crlsswzqjjmhqokswgej.supabase.co';
const supabaseKey = 'sb_publishable_vwGE8eFgFaZ4VZW0y2E8jQ_NTIn2R9u';

export const supabase = createClient(supabaseUrl, supabaseKey);
