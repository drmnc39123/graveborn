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
import { ODUL_DERINLIGI, ODUL_TOZ } from './referral';
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
  /**
   * DERİN KATMAN — yalnız whitepaper sayfasında (`/codex`).
   *
   * ⚠️ NİYE AYRI ALAN, AYRI DOSYA DEĞİL: oyun içi panel kısa olmak
   * ZORUNDA (oyuncu oynamak için orada, okumak için değil); whitepaper
   * ise ayrıntı için var. İki ayrı metin tutulsaydı biri güncellenir,
   * diğeri sessizce yalan söylerdi — bu dosyanın bütün varlık sebebi o.
   *
   * ⚠️ AYNI RAKAM KURALI GEÇERLİ: burada da elle yazılmış sayı olamaz.
   */
  deep?: string[];
  /** yalnız whitepaper'da görünür — oyun içi panelde yok */
  webOnly?: boolean;
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
    deep: [
      'Every run is a seed. The same seed with the same inputs produces the same run on your machine and on ours, which is what lets the server check a claim instead of trusting it. That is also why events never touch the engine: a weekend multiplier is applied to the payout after the run is verified, never to the fight itself.',
      'Nothing you do in a run is reported by your browser as fact. You send what happened; the server replays what it can, caps what it cannot, and pays the smaller number. A trimmed run still counts as a run — it just does not count as a record.',
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
    deep: [
      'The campaign and the Descent share the same engine and the same stages; what differs is the ending. A campaign stage stops. The Descent keeps handing you the next floor, each one paying once, so a session has a natural shape: go until the risk of losing the run outweighs the next payout.',
      'Because there is no ceiling, there is no finish line to buy. Every leaderboard here measures depth, and depth is the one number that no amount of money moves.',
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
    deep: [
      'The single-source rule is not a preference, it is arithmetic. A second source of gold scales with the number of players; the first one scales with the number of hours played. Put them together and the second drowns the first, every time, and the currency stops meaning anything.',
      'That is why quests, the weekly boss, the ladder and duels all pay dust instead. Dust buys relics and nothing else, so it can be generous without touching the part of the economy that has to stay scarce.',
      'The crypt vault is the one place gold moves between players rather than disappearing. It is fed by a share of what the village destroys and it is a real balance: nothing can be drawn from it that was not put in. A deed cannot mint, only redistribute.',
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
    deep: [
      'The Forge is a long project on purpose. It is the thing you are still working on after the campaign runs out, and it is the reason a run three weeks from now is different from a run today even on the same stage.',
      'Gear and pets are horizontal rather than vertical: they change what a build wants rather than making every number bigger. Pets in particular cannot be bought at any price — they are bound by killing a great many of one kind of thing, which is a cost only time can pay.',
      'Charms are the only power that is consumed. They burn when a run opens, not when it ends, so leaving immediately does not refund them. That is what makes them a decision rather than a habit.',
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
    deep: [
      'Everything cosmetic is deliberately outside the balance sheet. It can be as rare, as loud and as expensive as we like precisely because it changes nothing about how deep anyone gets.',
      'The draw is not a trap: duplicates return dust, and dust buys the exact relic you wanted. That means the worst possible run of luck is slower, not hopeless — a distinction most gacha systems refuse to make.',
      'The monument is the one sink with no ceiling, and that is its whole job. An economy needs somewhere for late-game gold to go forever; without it, gold piles up and every price in the game quietly becomes meaningless.',
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
      'Everyone carries an invitation code. Nobody is paid for signing up — a wallet costs nothing to make, and paying for one would just pay whoever can make the most. The reward opens the first time somebody who joined with your code actually goes down to the depth on the right, and then you both get dust.',
    ],
    deep: [
      'The village square is a real room. Everyone standing in it is another player, moving in real time, and the chat is the same channel for all of them. Guilds get their own channel on top of that.',
      'Duels and the Pit answer two different questions. A duel asks whether you could have done better with the same seed, which can be settled without both people being online. The Pit asks who survives the same room, which cannot.',
      'The invitation reward is gated on play rather than signups for a simple reason: a wallet costs nothing to create. Any system that pays per registration pays the cheapest possible attack the most. Gating it on depth means an invitation is only worth something when it brought someone who actually plays.',
    ],
    facts: [
      { label: 'Found a guild', value: `${sayi(GUILD_COST)} gold` },
      { label: 'Guild levels', value: `${sayi(GUILD_LEVELS.length)} · up to ${sayi(GUILD_LEVELS[GUILD_LEVELS.length - 1].cap)} members` },
      { label: 'Daily tasks', value: `${sayi(QUESTS.perDay)} of ${sayi(QUEST_POOL.length)}` },
      { label: 'All-three bonus', value: `${sayi(QUESTS.allBonus)} dust` },
      { label: 'Invite reward', value: `${sayi(ODUL_TOZ)} dust each` },
      { label: 'Opens at', value: `depth ${sayi(ODUL_DERINLIGI)}` },
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
    deep: [
      'Zero emission is the load-bearing promise. The game has no minting path at all: there is no reward pool, no staking, no yield, and the treasury never buys gold at a fixed rate. Every token anyone receives came out of another player\'s wallet.',
      'This is the opposite of the model that killed most play-to-earn games. There, the pool is the players\' own deposits being handed back, so the token has to fall as soon as more people take than put in. Here the token supply simply does not respond to how many people are playing.',
      'Fees exist only on the token side of a trade, and half of what is taken is burned. Gold listings are free, because a fee on the gold side would thin the order book without protecting anything.',
      'A deed is the only thing that pays a holder, and even it is redistribution rather than income: it draws from a vault the village filled, never more than a share of what it cost, and never more than what is in there.',
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
    deep: [
      'The rule is not about which shops are convenient, it is about which shops decide outcomes. The Pit is settled by permanent power; selling permanent power would settle the Pit with a wallet. The same reasoning excludes gear, paths, pets and charms.',
      'The monument is the interesting case, because it sells only visibility. It still stops taking real money partway up: above that line the rank is a record of time spent, and a rank anyone can buy is a rank nobody respects.',
      'Payments are verified against the chain rather than trusted. A transaction that failed still produces a signature, so we check that the treasury balance actually moved, that the payer is the account that is signed in, and that the signature has never been used before. If the check cannot be completed, the payment is remembered and can be finished later — you are never asked to pay twice.',
    ],
    facts: [
      { label: 'Relic draws', value: `${SOL_PRICES.reliquary10} SOL` },
      { label: 'Found a guild', value: `${SOL_PRICES.guild} SOL` },
      { label: 'Season card', value: `${SOL_PRICES.battlepass} SOL · ${sayi(VIGIL_TIERS.length)} tiers` },
      { label: 'Power for sale', value: 'none' },
    ],
  },
  // ── YALNIZ WHITEPAPER ─────────────────────────────────────────────
  // ⚠️ Bunlar oyun ici panelde YOK ve bu kasitli: oyuncu koyde oynamak
  // icin duruyor, belge okumak icin degil. Ama bir whitepaper'in
  // cevaplamak zorunda oldugu sorular bunlar.
  {
    id: 'fairplay',
    kicker: 'FAIR PLAY',
    title: 'Why a claim is not the same as a fact',
    webOnly: true,
    body: [
      'Nothing your browser reports is taken as true. A run sends what it thinks happened; the server recomputes what it can from the seed, caps what it cannot, and pays whichever number is smaller. A claim that cannot be justified is trimmed rather than refused, so an honest player with a strange run still gets paid, and a fabricated one gets nothing extra.',
      'A trimmed run is still a run. It counts for daily work and it counts as time played. It does not count for the ladder, it cannot win a wager, and it cannot open an invitation reward — everything where being trusted is the whole point.',
      'The same principle runs through the economy. Gold is deducted with a conditional write rather than a read followed by a write, so two requests racing each other cannot spend the same coin twice. Rewards are marked as paid before they are paid, because a crash that leaves something unpaid is recoverable and a crash that leaves something payable twice is not.',
    ],
    deep: [
      'Determinism is what makes any of this possible. The same seed and the same inputs produce the same run everywhere, which is why the simulation version is part of a run record: replaying an old run under a new engine would produce a different fight, and comparing the two would be meaningless. Duels refuse to run across versions for exactly that reason.',
      'Real-money payments are checked against the chain rather than against what the client says. A failed transaction still produces a signature, so the check looks at whether the treasury balance actually moved, whether the payer is the signed-in account, and whether the signature has ever been used. The uniqueness is enforced by the database, not by application code, because code races and a unique index does not.',
      'The chain we read is verified by its genesis hash rather than by the address we were given. Test networks hand out free coins; a payment verified against one of them would be free money with every other check passing cleanly. An endpoint proven to be on the wrong network is excluded outright.',
    ],
    facts: [
      { label: 'Client-reported facts', value: 'none' },
      { label: 'Payment checks', value: 'on-chain' },
    ],
  },
  {
    id: 'token',
    kicker: 'THE TOKEN',
    title: 'What $GRAVE is, and what it is not',
    webOnly: true,
    body: [
      'The token is a way to trade with other players, not a yield product. It is not sold by us at a fixed rate, it is not staked, it does not pay a dividend, and holding it does not make anyone stronger in a run.',
      'The game has no minting path. That sentence is the entire monetary policy: there is nowhere in the code that creates tokens as a reward, so the supply does not grow because more people showed up. What people trade is gold, which is created by playing and destroyed by spending.',
      'This is a deliberate rejection of the model that has killed most games in this category. Those pay rewards out of a pool that is really the players\' own deposits, which forces the price down the moment withdrawals outpace deposits. A game that cannot mint cannot fall into that spiral, whatever else happens to it.',
      'We are not making a price prediction here, and any document that does is telling you something it cannot know.',
    ],
    deep: [
      'Fees are the only thing the project takes from a trade, and they apply to the token side only. Half of what is taken is burned and half goes to the treasury. Gold-priced listings are free, because taxing the side people are trying to sell would only thin the order book.',
      'Real-money purchases exist in four places and none of them sell power. That boundary is enforced by a test rather than by intention: if a payment endpoint is ever added to the forge, the stall, gear, paths or pets, the build fails.',
      'The plan for treasury revenue is to use part of it to buy the token back and burn it, and to publish both the treasury address and each burn so the claim can be checked rather than believed. Until that is running, saying more than this would be a promise rather than a description.',
    ],
    facts: [
      { label: 'Minting path', value: 'none' },
      { label: 'Fee', value: 'token side only' },
      { label: 'Power for sale', value: 'none' },
    ],
  },
  {
    id: 'limits',
    kicker: 'LIMITS',
    title: 'What this game will not do',
    webOnly: true,
    body: [
      'It will not sell power. Not now, not as a limited event, not as a bundle that happens to include it.',
      'It will not print a currency to pay rewards with. Every reward is either something that does not affect the economy, or something another player paid for.',
      'It will not promise a return. There is no yield here to describe, so any number anyone quotes you is invented.',
      'It will not pretend the beta is permanent. Progress made before launch is wiped, deliberately and in advance, so that nobody starts the real economy holding a pile of currency that came from a test.',
      'A list like this is only worth what it costs to keep. Each line above corresponds to a check that runs against the code, which is a weaker guarantee than a promise but a far more honest one.',
    ],
    deep: [
      'The reason these are written down is that every one of them is easier to break than to keep, and each break would look reasonable at the time. Selling one forge upgrade for a weekend is a small decision on the day it is made and an irreversible one afterwards, because the players who bought it are owed it forever.',
      'Where a rule can be checked mechanically, it is. The guide you are reading is scanned against the code it describes: if the payment endpoints ever include one that sells power, or the emission claim stops matching the marketplace, the check fails before the text can go out of date.',
    ],
    facts: [
      { label: 'Beta progress', value: 'wiped at launch' },
      { label: 'Promised return', value: 'none' },
    ],
  },
] as const;

/** Bölümü kimliğiyle bul */
/**
 * OYUN İÇİ panelde gösterilecek bölümler.
 *
 * ⚠️ `webOnly` olanlar DIŞARIDA: oyuncu köyde oynamak için duruyor, belge
 * okumak için değil. Aynı veriden iki farklı derinlikte iki yüzey —
 * ikinci bir metin dosyası tutmadan.
 */
export function codexInGame(): CodexSection[] {
  return CODEX.filter((s) => !s.webOnly);
}

export function codexSection(id: string): CodexSection | undefined {
  return CODEX.find((s) => s.id === id);
}
