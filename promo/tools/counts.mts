// SAYIM — videoda geçecek her sayı BURADAN çıkıyor, tahminden değil.
//
// ⚠️ NİYE VAR: ilk denemede sayılar `grep -c "id: '"` ile çıkarıldı ve
// yanlıştı (iç içe `id:` alanları ve yorum satırları da sayılıyor).
// Bir tanıtım videosunda "58 silah" yazıp oyunda 20 olması, düzeltilmesi
// imkânsız bir yalan olurdu — video yayınlandıktan sonra geri alınamaz.
// Sayılar oyunun kendi dizilerinin `length`i.

import { STAGES, WEAPONS, PASSIVES, EVOLUTIONS, ENEMIES, ASCENSION } from '@game/config';
import { HEROES } from '@game/heroes';
import { PETS } from '@game/pets';
import { ACHIEVEMENTS } from '@game/achievements';
import { FORGE } from '@game/forge';
import { SKILL_TREE, TREE_TOTAL_COST, BRANCHES } from '@game/skills';
import { CHARMS } from '@game/charms';

const forgeToplam = FORGE.reduce((a, u) => a + u.maxLevel, 0);
const agacToplam = TREE_TOTAL_COST;

console.log(JSON.stringify({
  stages: STAGES.length,
  weapons: WEAPONS.length,
  passives: PASSIVES.length,
  evolutions: EVOLUTIONS.length,
  enemies: ENEMIES.length,
  heroes: HEROES.length,
  heroNames: HEROES.map((h) => h.name),
  pets: PETS.length,
  achievements: ACHIEVEMENTS.length,
  forgeUpgrades: FORGE.length,
  forgeLevels: forgeToplam,
  skillNodes: SKILL_TREE.length,
  skillBranches: BRANCHES.length,
  skillTreeCost: agacToplam,
  charms: CHARMS.length,
  ascensionTiers: ASCENSION.length,
}, null, 2));
