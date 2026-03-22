import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://acadjrabifurwlatcsuj.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjYWRqcmFiaWZ1cndsYXRjc3VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMDkwNjgsImV4cCI6MjA4OTc4NTA2OH0.UVfMs-Ijt_lYVlieJ3n17-RO8a09_HH3ma7fTCTTNGQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
