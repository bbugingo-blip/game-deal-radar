'use strict';

// Famous games: [Steam app id, title, genre]. Used for genre browsing and posters.
const LIST = [
  [271590, 'Grand Theft Auto V', 'Action'],
  [1174180, 'Red Dead Redemption 2', 'Action'],
  [814380, 'Sekiro: Shadows Die Twice', 'Action'],
  [1145360, 'Hades', 'Action'],

  [292030, 'The Witcher 3: Wild Hunt', 'RPG'],
  [1091500, 'Cyberpunk 2077', 'RPG'],
  [1245620, 'Elden Ring', 'RPG'],
  [1086940, "Baldur's Gate 3", 'RPG'],
  [489830, 'The Elder Scrolls V: Skyrim', 'RPG'],

  [550, 'Left 4 Dead 2', 'Shooter'],
  [220, 'Half-Life 2', 'Shooter'],
  [782330, 'DOOM Eternal', 'Shooter'],
  [1237970, 'Titanfall 2', 'Shooter'],

  [289070, "Sid Meier's Civilization VI", 'Strategy'],
  [813780, 'Age of Empires II: Definitive Edition', 'Strategy'],
  [1142710, 'Total War: WARHAMMER III', 'Strategy'],
  [268500, 'XCOM 2', 'Strategy'],

  [227300, 'Euro Truck Simulator 2', 'Simulation'],
  [255710, 'Cities: Skylines', 'Simulation'],
  [1248130, 'Farming Simulator 22', 'Simulation'],
  [703080, 'Planet Zoo', 'Simulation'],

  [1551360, 'Forza Horizon 5', 'Racing'],
  [244210, 'Assetto Corsa', 'Racing'],
  [1222680, 'Need for Speed Heat', 'Racing'],
  [690790, 'DiRT Rally 2.0', 'Racing'],

  [1196590, 'Resident Evil Village', 'Horror'],
  [739630, 'Phasmophobia', 'Horror'],
  [1693980, 'Dead Space', 'Horror'],
  [214490, 'Alien: Isolation', 'Horror'],

  [976310, 'Mortal Kombat 11', 'Fighting'],
  [389730, 'TEKKEN 7', 'Fighting'],
  [1364780, 'Street Fighter 6', 'Fighting'],
  [678950, 'DRAGON BALL FighterZ', 'Fighting'],

  [2195250, 'EA SPORTS FC 24', 'Sports'],
  [2338770, 'NBA 2K24', 'Sports'],

  [367520, 'Hollow Knight', 'Indie'],
  [504230, 'Celeste', 'Indie'],
  [413150, 'Stardew Valley', 'Indie'],
  [105600, 'Terraria', 'Indie'],
];

const poster = (id) => `https://cdn.akamai.steamstatic.com/steam/apps/${id}/header.jpg`;

// Backup address in case the first Steam image host is blocked or slow.
const poster2 = (id) => `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/header.jpg`;

const GAMES = LIST.map(([id, title, genre]) => ({ id: String(id), title, genre, poster: poster(id), poster2: poster2(id) }));
const GENRES = [...new Set(GAMES.map((g) => g.genre))];
const GENRE_BY_ID = Object.fromEntries(GAMES.map((g) => [g.id, g.genre]));

module.exports = { GAMES, GENRES, GENRE_BY_ID, poster, poster2 };
