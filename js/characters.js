// Character roster for the game.
// Each character has a nation (drives avatar color + element icon) and a type
// (bender / nonbender / animal / spirit) which drives the icon shape used
// when there's no clean elemental match.
const NATIONS = {
  air: { label: 'Air Nomads', color: '#e8933a', icon: '💨' },
  water: { label: 'Water Tribe', color: '#2f7fb8', icon: '💧' },
  earth: { label: 'Earth Kingdom', color: '#3a7d44', icon: '🌍' },
  fire: { label: 'Fire Nation', color: '#b3272d', icon: '🔥' },
};

const CHARACTERS = [
  { id: 'aang', name: 'Aang', nation: 'air', emoji: '🌀' },
  { id: 'katara', name: 'Katara', nation: 'water' },
  { id: 'sokka', name: 'Sokka', nation: 'water' },
  { id: 'toph', name: 'Toph', nation: 'earth' },
  { id: 'zuko', name: 'Zuko', nation: 'fire' },
  { id: 'iroh', name: 'Iroh', nation: 'fire' },
  { id: 'azula', name: 'Azula', nation: 'fire' },
  { id: 'mai', name: 'Mai', nation: 'fire' },
  { id: 'tylee', name: 'Ty Lee', nation: 'fire' },
  { id: 'suki', name: 'Suki', nation: 'earth' },
  { id: 'appa', name: 'Appa', nation: 'air', emoji: '🐃' },
  { id: 'momo', name: 'Momo', nation: 'air', emoji: '🐒' },
  { id: 'zhao', name: 'Zhao', nation: 'fire' },
  { id: 'bumi', name: 'Bumi', nation: 'earth' },
  { id: 'roku', name: 'Roku', nation: 'fire' },
  { id: 'pakku', name: 'Pakku', nation: 'water' },
  { id: 'yue', name: 'Yue', nation: 'water' },
  { id: 'jet', name: 'Jet', nation: 'earth' },
  { id: 'hakoda', name: 'Hakoda', nation: 'water' },
  { id: 'ozai', name: 'Ozai', nation: 'fire' },
  { id: 'june', name: 'June', nation: 'earth' },
  { id: 'longfeng', name: 'Long Feng', nation: 'earth' },
  { id: 'piandao', name: 'Piandao', nation: 'fire' },
  { id: 'jeongjeong', name: 'Jeong Jeong', nation: 'fire' },
];

function initialsFor(name) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
