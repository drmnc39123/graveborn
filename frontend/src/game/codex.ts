// THE CODEX — oyunun tek anlatım kaynağı.
//
// ⚠️ NİYE VAR: köyde 4 grup, 15 panel ve 12 bina var; hiçbirini anlatan bir
// yer yoktu. Tek onboarding `FirstRun` (tek düğme) ve koşu içi ipuçlarıydı;
// ikisi de oyuncuyu İLK koşuya sokuyor, sonrasını hiç anlatmıyordu.
//
// ⚠️ TEK KAYNAK, İKİ YÜZEY. Oyun içindeki `?` paneli ve (sonra) `/codex`
// sayfası AYNI veriden çiziliyor. İki kez yazılsaydı biri güncellenir,
// diğeri sessizce yalan söylemeye başlardı — bu depoda "aynı kural iki
// yerde yazılınca ayrışır" dersi defalarca alındı.
//
// ══════════════════════════════════════════════════════════════════════
// 🔴 SAYILAR ELLE YAZILMAZ. Her rakam canlı sabitten okunuyor.
//
// Bir rehberin en sinsi bozulma biçimi budur: metin doğru yazılır, sonra
// denge değişir ve rehber hâlâ eski sayıyı söyler. Oyuncu ona güvenip
// yanlış karar verir ve hatayı kimse fark etmez — çünkü hiçbir test
// "belgeler doğru mu" diye sormaz.
//
// Burada rakam yazmanın tek yolu `facts` alanı ve o da import edilmiş
// sabitlerden türüyor. `codex.test.mts` metinde başıboş sayı kalmadığını
// ayrıca tarıyor.
// ══════════════════════════════════════════════════════════════════════
//
// ⚠️ OYUNCUYA GİDEN METİN İNGİLİZCE, yorumlar Türkçe — depo kuralı.

import { MAX_WEAPONS, STAGES } from './config';
import { COSMETICS, PULL_COST } from './cosmetics';
import { CRYPT_CUT, CRYPT_TIERS, CRYPT_WEEKLY_CAP } from './crypt';
import { FORGE, treeTotalCost } from './forge';
import { GUILD_COST, GUILD_LEVELS } from './guild';
import { HEROES } from './heroes';
import { OSSUARY } from './ossuary';
import { PETS } from './pets';
import { QUESTS, QUEST_POOL } from './quests';
import { SOL_PRICES } from './solPrice';
import { VIGIL_TIERS } from './vigil';
import { WAGER } from './wager';

export interface CodexFact {
  label: string;
  value: string;
}

export interface CodexSection {
  id: string;
  /** navbar/kenar çubuğu etiketi — kısa */
  kicker: string;
  /** başlık */
  title: string;
  /** paragraflar — her biri tek bir fikir */
  body: string[];
  /** canlı sabitlerden türeyen rakamlar */
  facts?: CodexFact[];
}

const sayi = (n: number) => Math.round(n).toLocaleString('en-US');
const yuzde = (n: number) => `${Math.round(n * 100)}%`;

export const CODEX: readonly CodexSection[] = [
  {
    id: 'descent',
    kicker: 'THE RUN',
    title: 'What happens when you go down',
    body: [
      'A run is one descent. You do not aim: your weapons fire on their own, and the only thing you control is where you stand. Everything you kill drops experience; enough of it and the stair stops to offer you a card.',
      'Cards are the run. A weapon card gives you a new weapon or ranks up one you carry; a passive card makes everything you already have better. You can only carry so many of each, so every card after that is a choice about what you are willing to give up.',
      'Some weapons evolve. Take a weapon to its last rank, carry the passive it wants, and open a boss chest — the two become something else entirely. The game will not tell you which pairs work; the card that hints at it appears when you are close.',
      'A run ends when you die or when you choose to leave. Leaving is not losing: the gold and the depth you reached are already yours.',
    ],
    facts: [
      { label: 'Heroes', value: sayi(HEROES.length) },
      { label: 'Weapon slots', value: sayi(MAX_WEAPONS) },
    ],
  },
  {
    id: 'depth',
    kicker: 'DEPTH',
    title: 'Stages, and the stair that never ends',
    body: [
      'The campaign is a set of stages, each one a road with an end. Clearing a stage opens the next.',
      'The Descent is the other half. It has no floor: every depth leads to another and none of them is the last. Each new depth you reach for the first time pays once, and it pays more the deeper you are.',
      'Depth is what the leaderboard measures, and it is the only thing the ladder cares about. It cannot be bought — not with gold, not with SOL. It is gated by surviving.',
    ],
    facts: [
      { label: 'Stages', value: sayi(STAGES.length) },
      { label: 'Descent depth', value: 'no ceiling' },
    ],
  },
  {
    id: 'gold',
    kicker: 'GOLD',
    title: 'Where it comes from, where it goes',
    body: [
      'Gold has exactly one source: running. Nothing else in the village produces it — not quests, not the boss, not the ladder, not winning a duel. Those pay dust or relics instead, and that is deliberate: a second source of gold would grow with the number of players and drown the first.',
      'Gold leaves in many places. The Forge takes it for permanent power. The Stall takes it for a single run. The Reliquary and the Monument take it for things that only change how you look. The Wager burns it outright.',
      'Almost all of that gold is destroyed. A tenth of every destroyed coin drops into the crypt vault instead, and deed holders draw from it — so it moves between players rather than disappearing. Nothing comes out of that vault that did not go into it.',
    ],
    facts: [
      { label: 'Gold sources', value: 'runs only' },
      { label: 'To the crypt vault', value: yuzde(CRYPT_CUT) },
    ],
  },
  {
    id: 'power',
    kicker: 'POWER',
    title: 'The things that make you stronger',
    body: [
      'The Forge is the backbone. Every line is a permanent upgrade that applies to every run from the moment you buy it, and the whole tree is a long project rather than a shopping trip.',
      'Paths are earned, not bought: depth gives you skill points and you spend them on a tree that changes how a run plays rather than how big your numbers are.',
      'Gear drops in the Wilderness and can be upgraded or broken down. Pets are bound by killing — a lot of one kind of thing — and cannot be bought at any price. Charms from the Stall last exactly one run and burn when it starts.',
      'None of this is for sale with real money. The Forge, the Stall, gear, paths and pets are gold and play only, and that is a line we do not intend to move: depth is gated by survival, not by spending.',
    ],
    facts: [
      { label: 'Forge lines', value: sayi(FORGE.length) },
      { label: 'Whole Forge tree', value: `${sayi(treeTotalCost())} gold` },
      { label: 'Pets', value: sayi(PETS.length) },
    ],
  },
  {
    id: 'look',
    kicker: 'APPEARANCE',
    title: 'Everything that is only for show',
    body: [
      'The Reliquary is a draw. It costs gold, it gives a relic — a title, a nameplate, a trophy or an aura — and if you already own what it pulls, it gives dust instead. Dust buys any relic outright, which is the way out when luck will not cooperate.',
      'The Monument has no top. Each stone costs more than the last and buys nothing but a rank beside your name, which everyone else can see on the ladder. That is the whole point: prestige is worth something only where it is seen.',
      'The Wager is the other road to dust. Stake gold before a run and beat your own record; win and the gold becomes dust, lose and it is simply gone. It never pays gold, in any outcome.',
      'Not one thing in this section gives damage, health, or depth. Power is bought at the Forge. This is what you show for it.',
    ],
    facts: [
      { label: 'Relics', value: sayi(COSMETICS.length) },
      { label: 'A draw', value: `${sayi(PULL_COST)} gold` },
      { label: 'First monument stone', value: `${sayi(OSSUARY.baseCost)} gold` },
      { label: 'Wager', value: `${sayi(WAGER.minStake)}–${sayi(WAGER.maxStake)} gold` },
    ],
  },
  {
    id: 'people',
    kicker: 'PEOPLE',
    title: 'Everyone else in the village',
    body: [
      'The square has a chat, and everyone standing in it is a real player. You can add anyone from there or from the ladder to your watch list and see when they are online.',
      'Guilds cost gold to found and give every member a small, permanent gain in experience. The treasury only ever buys levels — it cannot be paid back out, so nobody founds a guild to use it as a wallet.',
      'Duels are asynchronous: you replay somebody else\'s exact run and try to go deeper. The Pit is the opposite — a live duel, one against one, in the same arena with the same waves, and the last one standing wins.',
      'The Barrow holds one world boss a week. Everyone hits the same creature, the wound is shared, and the week ends whether it dies or not.',
      'Daily work resets at midnight UTC. Three tasks, drawn for you, and a bonus if you finish all three.',
    ],
    facts: [
      { label: 'Found a guild', value: `${sayi(GUILD_COST)} gold` },
      { label: 'Guild levels', value: `${sayi(GUILD_LEVELS.length)} · up to ${sayi(GUILD_LEVELS[GUILD_LEVELS.length - 1].cap)} members` },
      { label: 'Daily tasks', value: `${sayi(QUESTS.perDay)} of ${sayi(QUEST_POOL.length)}` },
      { label: 'All-three bonus', value: `${sayi(QUESTS.allBonus)} dust` },
    ],
  },
  {
    id: 'economy',
    kicker: 'THE ECONOMY',
    title: 'Gold, $GRAVE, and what the game will not do',
    body: [
      'The game does not print tokens. There is no reward pool, no staking, no yield, and the treasury never buys your gold at a fixed rate. Any $GRAVE you ever receive comes out of another player\'s wallet through the marketplace, which means the supply cannot inflate because people are playing.',
      'That is why gold matters. Gold is what you farm and what someone else wants; the marketplace is where the two meet. Listing gold is free — we take nothing from the gold side, because a fee there would just thin the book.',
      'A deed is the one thing that pays you back, and even it is a redistribution rather than a source. It draws from the vault the village fills, never more than a share of what it cost, and never more than what is in there.',
      'The Exchange is not open yet. It is the other side of the same book — standing bids rather than listings — and it opens once the Marketplace has been trading.',
    ],
    facts: [
      { label: 'Token emission', value: 'zero' },
      { label: 'Gold listings', value: 'no fee' },
      { label: 'Deed tiers', value: sayi(CRYPT_TIERS.length) },
      { label: 'Weekly draw cap', value: `${yuzde(CRYPT_WEEKLY_CAP)} of the deed's price` },
    ],
  },
  {
    id: 'sol',
    kicker: 'PAYING',
    title: 'What SOL can and cannot buy',
    body: [
      'There is a second way to pay in four places, and it exists for one reason: some people would rather not wait. Everything on that list can also be bought with gold, and gold is always the cheaper road.',
      'You can pay for a set of relic draws, for monument stones up to a point, for founding or raising a guild, and for the season card. That is the whole list.',
      'You cannot pay for power. The Forge, the Stall, gear, paths and pets take gold and nothing else. This is not a temporary arrangement: the Pit is decided by permanent power, and selling that would decide it with a wallet.',
      'The monument stops taking SOL partway up on purpose. The ranks above that are meant to be earned, and a rank anyone can buy is a rank nobody respects.',
      'When you pay, your wallet asks you exactly one thing: to send SOL. There is no message to sign. If something goes wrong after the transfer, the payment is remembered on your device and the button turns into "finish payment" — you are never asked to pay twice.',
    ],
    facts: [
      { label: 'Relic draws', value: `${SOL_PRICES.reliquary10} SOL` },
      { label: 'Found a guild', value: `${SOL_PRICES.guild} SOL` },
      { label: 'Season card', value: `${SOL_PRICES.battlepass} SOL · ${sayi(VIGIL_TIERS.length)} tiers` },
      { label: 'Power for sale', value: 'none' },
    ],
  },
] as const;

/** Bölümü kimliğiyle bul */
export function codexSection(id: string): CodexSection | undefined {
  return CODEX.find((s) => s.id === id);
}
