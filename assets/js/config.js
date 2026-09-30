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
  // stop anyone writing to it except through the checked submit_score_v2 function (which needs a server-timed game ticket).
  // NEVER put the "secret" / "service_role" key here.
  // Leave both empty and the site still works, saving scores in each visitor's browser only.
  supabaseUrl: 'https://gxtawdtcaouqhptoimbv.supabase.co',
  supabaseKey: 'sb_publishable_HOGREDdj-7nlkidyGJEtwQ_kfCIWn_M',

  // How many names each leaderboard shows (and the rank needed to enter your name).
  boardSize: 20,

  // Every Nth level is a bonus round.
  bonusEvery: 5,

  // Visitor stats (optional, privacy-friendly, no cookies). Sign up free at https://www.goatcounter.com,
  // pick a code (e.g. "tcgamehub" for tcgamehub.goatcounter.com) and put just that code here.
  // Leave it empty and nothing is counted.
  goatcounter: '',
};
