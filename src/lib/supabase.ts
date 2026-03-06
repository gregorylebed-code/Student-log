import { createClient } from '@supabase/supabase-js';

// VITE_ is the magic prefix that allows the browser to see these
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const isConfigured = !!(supabaseUrl && supabaseAnonKey);
