// Character roster for the game.
// Each character has a nation (drives the card accent color) and a
// `bender` flag, both taken straight from the character sheet the
// portraits were cut from — handy for questions like "are they a bender?".
const NATIONS = {
  air: { label: 'Air Nomads', color: '#e8933a', icon: '💨' },
  water: { label: 'Water Tribe', color: '#2f7fb8', icon: '💧' },
  earth: { label: 'Earth Kingdom', color: '#3a7d44', icon: '🌍' },
  fire: { label: 'Fire Nation', color: '#b3272d', icon: '🔥' },
};

const CHARACTERS = [
  // Earth Kingdom
  { id: 'kyoshi', name: 'Kyoshi', nation: 'earth', bender: true },
  { id: 'suki', name: 'Suki', nation: 'earth', bender: false },
  { id: 'toph', name: 'Toph', nation: 'earth', bender: true },
  { id: 'kingbumi', name: 'King Bumi', nation: 'earth', bender: true },
  { id: 'cabbagemerchant', name: 'Cabbage Merchant', nation: 'earth', bender: false },
  { id: 'jet', name: 'Jet', nation: 'earth', bender: false },
  // Water Tribe
  { id: 'sokka', name: 'Sokka', nation: 'water', bender: false },
  { id: 'hakoda', name: 'Hakoda', nation: 'water', bender: false },
  { id: 'yue', name: 'Yue', nation: 'water', bender: false },
  { id: 'katara', name: 'Katara', nation: 'water', bender: true },
  { id: 'pakku', name: 'Pakku', nation: 'water', bender: true },
  { id: 'hama', name: 'Hama', nation: 'water', bender: true },
  // Fire Nation
  { id: 'zuko', name: 'Zuko', nation: 'fire', bender: true },
  { id: 'azula', name: 'Azula', nation: 'fire', bender: true },
  { id: 'mai', name: 'Mai', nation: 'fire', bender: false },
  { id: 'tylee', name: 'Ty Lee', nation: 'fire', bender: false },
  { id: 'iroh', name: 'Iroh', nation: 'fire', bender: true },
  { id: 'ozai', name: 'Ozai', nation: 'fire', bender: true },
  // Air Nomads
  { id: 'aang', name: 'Aang', nation: 'air', bender: true },
  { id: 'gyatso', name: 'Gyatso', nation: 'air', bender: true },
  { id: 'yangchen', name: 'Yangchen', nation: 'air', bender: true },
  { id: 'tenzin', name: 'Tenzin', nation: 'air', bender: true },
  { id: 'jinora', name: 'Jinora', nation: 'air', bender: true },
  { id: 'ikki', name: 'Ikki', nation: 'air', bender: true },
];

function portraitSrc(char) {
  return `img/characters/${char.id}.jpg`;
}

function initialsFor(name) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
