// ─────────────────────────────────────────────────────────────
//  SITE SETTINGS — the only file you need to edit to go live.
// ─────────────────────────────────────────────────────────────
export const CONFIG = {
  // Shown in the header, page titles and game-over screens.
  siteName: 'Quick Play Arcade',

  // From Supabase → Project Settings → API (or "API Keys").
  //   supabaseUrl:  https://abcdefghijk.supabase.co
  //   supabaseKey:  the PUBLISHABLE key (sb_publishable_...) or the legacy "anon" key.
  // This key is meant to be public — the database rules in supabase/schema.sql
  // stop anyone writing to it except through the checked submit_score function.
  // NEVER put the "secret" / "service_role" key here.
  // Leave both empty and the site still works, saving scores in each visitor's browser only.
  supabaseUrl: 'https://gxtawdtcaouqhptoimbv.supabase.co',
  supabaseKey: 'sb_publishable_HOGREDdj-7nlkidyGJEtwQ_kfCIWn_M',

  // How many names each leaderboard shows (and the rank needed to enter your name).
  boardSize: 20,

  // Every Nth level is a bonus round.
  bonusEvery: 5,
};
