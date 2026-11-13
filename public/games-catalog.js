"use strict";

(function (window) {
  var MGG_BASE = "/mgg-games/";

  function healLegacyGameUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") return rawUrl;
    var m = rawUrl.match(
      /^https?:\/\/(?:monkeygg2\.github\.io|pijgalk\.desarrollos-lowcost\.com)\/games\/(.*)$/i
    );
    if (m) {
      return "/mgg-games/" + m[1];
    }
    return rawUrl;
  }

  function mgg(title, subPath, category, aliases) {
    var clean = String(subPath || "");
    var isQuery = clean.indexOf("?") !== -1;
    var full =
      MGG_BASE + clean + (!isQuery && clean.slice(-1) !== "/" ? "/" : "");
    return {
      title: title,
      url: full,
      category: category || "arcade",
      aliases: aliases || [],
      source: "MonkeyGG2",
    };
  }

  function ext(title, url, category, aliases) {
    return {
      title: title,
      url: url,
      category: category || "featured",
      aliases: aliases || [],
      source: "Web",
    };
  }

  var BUILTIN_CATALOG = [
    // Featured Web Games & Apps
    ext("Neal.fun", "https://neal.fun/", "featured", ["neal", "sandbox"]),
    ext("Infinite Craft", "https://neal.fun/infinite-craft/", "featured", [
      "craft",
      "alchemy",
      "neal",
    ]),
    ext("Poki Games", "https://poki.com/", "featured", ["poki"]),
    ext("CrazyGames", "https://www.crazygames.com/", "featured", ["crazy"]),
    ext("Krunker.io", "https://krunker.io/", "action", ["fps", "shooter"]),
    ext("Chess.com", "https://www.chess.com/play/computer", "puzzle", [
      "chess",
    ]),
    ext(
      "NYT Wordle",
      "https://www.nytimes.com/games/wordle/index.html",
      "puzzle",
      ["wordle"]
    ),
    ext("YouTube", "https://www.youtube.com/", "apps", ["yt", "video"]),
    ext("Discord", "https://discord.com/app", "apps", ["chat", "dc"]),
    ext("Spotify Web", "https://open.spotify.com/", "apps", ["music"]),
    ext("Twitch", "https://www.twitch.tv/", "apps", ["stream"]),
    ext("Reddit", "https://www.reddit.com/", "apps", ["forum"]),
    ext("GeForce NOW", "https://play.geforcenow.com/", "apps", [
      "cloud",
      "fortnite",
    ]),
    ext("Wikipedia", "https://en.wikipedia.org/", "apps", ["wiki"]),

    // Full MonkeyGG2 Real HTML5 & Ruffle Flash Catalog
    mgg("1v1.LOL", "1v1-lol", "action", ["1v1", "build", "battle"]),
    mgg("10 Minutes Till Dawn", "10-minutes-till-dawn", "action", ["survival"]),
    mgg("2048", "2048", "puzzle", ["numbers"]),
    mgg("A Dark Room", "a-dark-room", "idle", ["rpg", "text"]),
    mgg("Abandoned", "abandoned", "escape", []),
    mgg("Abandoned 2", "abandoned-2", "escape", []),
    mgg(
      "Achievement Unlocked",
      "flash/?game=achievement-unlocked",
      "flash",
      []
    ),
    mgg(
      "Achievement Unlocked 2",
      "flash/?game=achievement-unlocked-2",
      "flash",
      []
    ),
    mgg(
      "Achievement Unlocked 3",
      "flash/?game=achievement-unlocked-3",
      "flash",
      []
    ),
    mgg("Age of War", "flash/?game=age-of-war", "flash", ["strategy"]),
    mgg("Age of War Hacked", "flash/?game=age-of-war-hacked", "flash", []),
    mgg("Ages of Conflict", "ages-of-conflict", "puzzle", ["map", "war"]),
    mgg("Aground", "aground", "idle", ["craft", "mine"]),
    mgg("Amidst The Sky", "amidst-the-sky", "arcade", ["platformer"]),
    mgg(
      "Another Gentleman's Adventure",
      "another-gentlemans-adventure",
      "arcade",
      []
    ),
    mgg("Awesome Tanks", "awesome-tanks", "action", ["tanks"]),
    mgg("Awesome Tanks 2", "awesome-tanks-2", "action", ["tanks"]),
    mgg("Babel Tower", "babel-tower", "idle", ["clicker"]),
    mgg("Basket Random", "basket-random", "sports", ["basketball", "2p"]),
    mgg("Basketball Stars", "basketball-stars", "sports", ["nba", "hoops"]),
    mgg("BitLife", "bit-life", "idle", ["bitlife", "life sim"]),
    mgg("Bloons", "flash/?game=bloons", "flash", ["monkeys"]),
    mgg("Bloons TD 1", "flash/?game=bloons-td-1", "flash", [
      "btd1",
      "tower defense",
    ]),
    mgg("Bloons TD 2", "flash/?game=bloons-td-2", "flash", [
      "btd2",
      "tower defense",
    ]),
    mgg("Bloons TD 3", "flash/?game=bloons-td-3", "flash", [
      "btd3",
      "tower defense",
    ]),
    mgg("Bloons TD 4", "flash/?game=bloons-td-4", "flash", [
      "btd4",
      "tower defense",
    ]),
    mgg("Bloons TD 5", "flash/?game=bloons-td-5", "flash", [
      "btd5",
      "tower defense",
    ]),
    mgg("Bloxorz", "flash/?game=bloxorz", "puzzle", ["blocks"]),
    mgg("Boxing Random", "boxing-random", "sports", ["2p", "fight"]),
    mgg("Brawl Stars Project Laser", "brawl-stars-project-laser", "action", [
      "brawl",
    ]),
    mgg("Breaklock", "breaklock", "puzzle", ["lock"]),
    mgg("Cat Ninja", "flash/?game=cat-ninja", "flash", ["platformer"]),
    mgg("Chrome Dino", "chrome-dino", "arcade", ["t-rex", "offline"]),
    mgg("Clicker Heroes", "clicker-heroes", "idle", ["rpg"]),
    mgg("Clicker Heroes Updated", "clicker-heroes-updated", "idle", []),
    mgg("Conway's Game of Life", "conways-game-of-life", "puzzle", ["sim"]),
    mgg("Cookie Clicker", "cookie-clicker", "idle", ["cookies", "orteil"]),
    mgg("Core Ball", "core-ball", "arcade", []),
    mgg(
      "Creative Kill Chamber",
      "flash/?game=creative-kill-chamber",
      "flash",
      []
    ),
    mgg("Crossy Road", "crossy-road", "arcade", ["frogger"]),
    mgg("Curveball", "flash/?game=curveball", "flash", ["3d pong"]),
    mgg("Cut The Rope", "cut-the-rope", "puzzle", ["om nom"]),
    mgg("Doge Miner", "doge-miner", "idle", ["dogecoin"]),
    mgg("Don't Escape", "flash/?game=dont-escape", "escape", []),
    mgg("Don't Escape 2", "flash/?game=dont-escape-2", "escape", []),
    mgg("Don't Escape 3", "flash/?game=dont-escape-3", "escape", []),
    mgg("Doodle Jump", "doodle-jump", "arcade", []),
    mgg("Drift Boss", "drift-boss", "sports", ["cars", "driving"]),
    mgg("Drift Hunters", "drift-hunters", "sports", ["cars", "3d", "racing"]),
    mgg("Drive Mad", "drive-mad", "sports", ["fancade", "trucks"]),
    mgg("Drive Mad S", "drive-mad-s", "sports", ["trucks"]),
    mgg("Duck Life", "flash/?game=duck-life", "flash", []),
    mgg("Duck Life 2", "flash/?game=duck-life-2", "flash", []),
    mgg("Duck Life 3", "flash/?game=duck-life-3", "flash", []),
    mgg("Duck Life 4", "duck-life-4", "arcade", []),
    mgg(
      "Duck Life Treasure Hunt",
      "flash/?game=duck-life-treasure-hunt",
      "flash",
      []
    ),
    mgg("Dune!", "dune", "arcade", []),
    mgg("EaglerCraft 1.5.2", "ampler-launcher/mc/1.5.2", "minecraft", [
      "mc",
      "minecraft",
    ]),
    mgg("EaglerCraft 1.8.8", "ampler-launcher/mc/1.8.8", "minecraft", [
      "mc",
      "minecraft",
      "pvp",
    ]),
    mgg("EaglerCraft 1.12.2", "ampler-launcher/mc/1.12.2", "minecraft", [
      "mc",
      "minecraft",
    ]),
    mgg("Eaglercraft Ampler Launcher", "ampler-launcher", "minecraft", [
      "mc",
      "launcher",
    ]),
    mgg("Eggy Car", "eggy-car", "sports", ["driving"]),
    mgg("Escape The Bathroom", "flash/?game=escape-the-bathroom", "escape", []),
    mgg("Escape The Car", "flash/?game=escape-the-car", "escape", []),
    mgg("Escape The Closet", "flash/?game=escape-the-closet", "escape", []),
    mgg("Escape The Freezer", "flash/?game=escape-the-freezer", "escape", []),
    mgg(
      "Escape The Phonebooth",
      "flash/?game=escape-the-phonebooth",
      "escape",
      []
    ),
    mgg("Escape The Shack", "flash/?game=escape-the-shack", "escape", []),
    mgg("EvoWars", "evowars", "action", ["io"]),
    mgg("Factory Balls", "flash/?game=factory-balls", "puzzle", []),
    mgg("Family Feud", "family-feud", "puzzle", ["trivia"]),
    mgg(
      "Fireboy & Watergirl 1: Forest Temple",
      "fireboy-and-watergirl",
      "puzzle",
      ["Fireboy and Watergirl", "2p"]
    ),
    mgg(
      "Fireboy & Watergirl 2: Light Temple",
      "fireboy-and-watergirl-2",
      "puzzle",
      ["Fireboy and Watergirl 2", "2p"]
    ),
    mgg(
      "Fireboy & Watergirl 3: Ice Temple",
      "fireboy-and-watergirl-3",
      "puzzle",
      ["Fireboy and Watergirl 3", "2p"]
    ),
    mgg(
      "Fireboy & Watergirl 4: Crystal Temple",
      "fireboy-and-watergirl-4",
      "puzzle",
      ["Fireboy and Watergirl 4", "2p"]
    ),
    mgg("Flappy Bird", "flappy-bird", "arcade", []),
    mgg("Flash Chess", "flash/?game=flash-chess", "puzzle", ["chess"]),
    mgg("Friday Night Funkin", "friday-night-funkin", "arcade", [
      "fnf",
      "rhythm",
    ]),
    mgg("Geometry Dash Lite", "geometry-dash-lite", "arcade", ["gd", "dash"]),
    mgg("Geometry Dash Remastered", "geometry-dash-remastered", "arcade", [
      "gd",
    ]),
    mgg("Geometry Vibes", "geometry-vibes", "arcade", ["gd"]),
    mgg("Geometry Vibes Monster", "geometry-vibes-monster", "arcade", []),
    mgg("Geometry Vibes X-Ball", "geometry-vibes-x-ball", "arcade", []),
    mgg("Getaway Shootout", "getaway-shootout", "action", ["2p"]),
    mgg("Gons.io", "gons-io", "action", []),
    mgg("Gun Mayhem", "flash/?game=gun-mayhem", "action", ["smash"]),
    mgg("Gun Mayhem 2", "flash/?game=gun-mayhem-2", "action", ["smash"]),
    mgg("GunSpin", "gunspin", "arcade", []),
    mgg(
      "Henry Stickmin: Breaking The Bank",
      "flash/?game=breaking-the-bank",
      "flash",
      ["henry"]
    ),
    mgg(
      "Henry Stickmin: Escaping The Prison",
      "flash/?game=escaping-the-prison",
      "flash",
      ["henry"]
    ),
    mgg(
      "Henry Stickmin: Stealing The Diamond",
      "flash/?game=stealing-the-diamond",
      "flash",
      ["henry"]
    ),
    mgg(
      "Henry Stickmin: Infiltrating The Airship",
      "flash/?game=infiltrating-the-airship",
      "flash",
      ["henry"]
    ),
    mgg(
      "Henry Stickmin: Fleeing The Complex",
      "flash/?game=fleeing-the-complex",
      "flash",
      ["henry"]
    ),
    mgg("Hextris", "hextris", "puzzle", ["tetris"]),
    mgg("Idle Breakout", "idle-breakout", "idle", ["atari"]),
    mgg("Incremancer", "incremancer", "idle", ["zombies"]),
    mgg("Learn To Fly", "flash/?game=learn-to-fly", "flash", ["penguin"]),
    mgg("Learn To Fly 2", "flash/?game=learn-to-fly-2", "flash", ["penguin"]),
    mgg("Learn To Fly 3", "flash/?game=learn-to-fly-3", "flash", ["penguin"]),
    mgg("Learn To Fly Idle", "flash/?game=learn-to-fly-idle", "idle", []),
    mgg("Lion Soldier's Vengeance", "lion-soldiers-vengeance", "action", []),
    mgg("Maptroid", "maptroid", "arcade", ["metroid"]),
    mgg("Super Mario HTML5", "mario-game", "arcade", ["mario", "nes"]),
    mgg("Monkey Mart", "monkey-mart", "idle", ["tycoon"]),
    mgg("Moto X3M", "motox3m", "sports", ["bike", "dirtbike"]),
    mgg("N-gon", "n-gon", "action", ["physics", "shooter"]),
    mgg("N Step Steve Part 1", "n-step-steve-part-1", "puzzle", []),
    mgg("N Step Steve Part 2", "n-step-steve-part-2", "puzzle", []),
    mgg("OvO", "ovo/1.4.4", "arcade", ["parkour", "speedrun"]),
    mgg("OvO 2", "ovo/2.0.2alpha", "arcade", ["parkour"]),
    mgg("Papa's Pizzeria", "flash/?game=papas-pizzaria", "flash", [
      "papa louie",
    ]),
    mgg("Papa's Freezeria", "flash/?game=papas-freezeria", "flash", [
      "papa louie",
    ]),
    mgg("Particle Clicker", "particle-clicker", "idle", ["physics"]),
    mgg("P.craft", "pcraft", "minecraft", ["pico8", "2d minecraft"]),
    mgg("Planet Life", "planet-life", "idle", ["adventure"]),
    mgg("Progress Knight Quest", "progress-knight-quest", "idle", []),
    mgg("Progress Knight Reborn", "progress-knight-reborn", "idle", []),
    mgg("Pull Of War", "pull-of-war", "action", []),
    mgg("Raft Wars", "flash/?game=raft-wars", "flash", []),
    mgg("Raft Wars 2", "flash/?game=raft-wars-2", "flash", []),
    mgg("Reach The Core", "reach-the-core", "idle", ["drill"]),
    mgg("Restless Wing Syndrome", "restless-wing-syndrome", "arcade", []),
    mgg("Retro Bowl", "retro-bowl", "sports", ["nfl", "football"]),
    mgg("Retro Bowl Classic", "retro-bowl-old", "sports", ["nfl", "football"]),
    mgg("Riddle School", "flash/?game=riddle-school", "escape", []),
    mgg("Riddle School 2", "flash/?game=riddle-school-2", "escape", []),
    mgg("Riddle School 3", "flash/?game=riddle-school-3", "escape", []),
    mgg("Riddle School 4", "flash/?game=riddle-school-4", "escape", []),
    mgg("Riddle School 5", "flash/?game=riddle-school-5", "escape", []),
    mgg("Riddle Transfer", "flash/?game=riddle-transfer", "escape", []),
    mgg("Riddle Transfer 2", "flash/?game=riddle-transfer-2", "escape", []),
    mgg("Rift Shift", "rift-shift", "puzzle", []),
    mgg("Rocket League 2D", "rocket-league-2d", "sports", ["cars", "soccer"]),
    mgg("Rogue Soul", "flash/?game=rogue-soul", "flash", []),
    mgg("Rogue Soul 2", "flash/?game=rogue-soul-2", "flash", []),
    mgg("Rooftop Snipers", "rooftop-snipers", "action", ["2p"]),
    mgg("Rookie Bowman", "rookie-bowman", "arcade", ["archery"]),
    mgg("Run 3", "run-3", "arcade", ["space", "runner"]),
    mgg("Sabercut", "sabercut", "action", []),
    mgg("Sandspiel", "sandspiel", "puzzle", ["falling sand", "physics"]),
    mgg("Scuba Bear", "scuba-bear", "arcade", []),
    mgg("Shadow Fight", "shadow-fight", "action", ["fighting"]),
    mgg("Slice Master", "slice-master", "arcade", ["knife"]),
    mgg("Slope", "slope", "featured", ["3d", "ball", "runner"]),
    mgg("Smash Karts", "smash-karts", "action", ["kart", "io", "multiplayer"]),
    mgg("Soccer Random", "soccer-random", "sports", ["2p", "football"]),
    mgg("Station Saturn", "station-saturn", "action", []),
    mgg("Stick RPG Complete", "flash/?game=stick-rpg-complete", "flash", []),
    mgg("Stick War", "flash/?game=stick-war", "flash", ["strategy"]),
    mgg("Stickman Hook", "stickman-hook", "arcade", ["swing"]),
    mgg("Submachine 0", "flash/?game=submachine-0", "escape", []),
    mgg("Submachine 1", "flash/?game=submachine", "escape", []),
    mgg("Submachine 2", "flash/?game=submachine-2", "escape", []),
    mgg("Submachine 3", "flash/?game=submachine-3", "escape", []),
    mgg("Submachine 4", "flash/?game=submachine-4", "escape", []),
    mgg("Submachine 5", "flash/?game=submachine-5", "escape", []),
    mgg("Submachine 6", "flash/?game=submachine-6", "escape", []),
    mgg("Submachine 7", "flash/?game=submachine-7", "escape", []),
    mgg("Submachine 8", "flash/?game=submachine-8", "escape", []),
    mgg("Submachine 9", "flash/?game=submachine-9", "escape", []),
    mgg("Submachine 10", "flash/?game=submachine-10", "escape", []),
    mgg(
      "Submachine 32 Chambers",
      "flash/?game=submachine-32-chambers",
      "escape",
      []
    ),
    mgg("Submachine FLF", "flash/?game=submachine-flf", "escape", []),
    mgg("Subway Surfers", "subway-surfers", "featured", ["runner"]),
    mgg("Subway Surfers New York", "subway-surfers-ny", "arcade", ["runner"]),
    mgg("Sugar, Sugar", "flash/?game=sugar-sugar", "puzzle", []),
    mgg("Swords and Souls", "flash/?game=swords-and-souls", "flash", ["rpg"]),
    mgg("Tanuki Sunset", "tanuki-sunset", "sports", ["longboard", "raccoon"]),
    mgg("Temple Run 2", "temple-run-2", "arcade", ["runner"]),
    mgg("The Final Earth", "the-final-earth", "idle", ["city builder"]),
    mgg("The Impossible Quiz", "flash/?game=the-impossible-quiz", "flash", [
      "quiz",
      "trivia",
    ]),
    mgg("The Treasure", "the-treasure", "escape", []),
    mgg("There Is No Game", "there-is-no-game", "puzzle", []),
    mgg(
      "This Is The Only Level",
      "flash/?game=this-is-the-only-level",
      "puzzle",
      ["elephant"]
    ),
    mgg(
      "This Is The Only Level 2",
      "flash/?game=this-is-the-only-level-2",
      "puzzle",
      []
    ),
    mgg("Tic Tac What?", "tic-tac-what", "puzzle", []),
    mgg("Time Shooter", "time-shooter", "action", ["superhot"]),
    mgg("Time Shooter 3: SWAT", "time-shooter-3", "action", [
      "superhot",
      "fps",
    ]),
    mgg("Tiny Fishing", "tiny-fishing", "idle", ["fish"]),
    mgg("Trace", "trace", "escape", ["puzzle"]),
    mgg("Tunnel Rush", "tunnel-rush", "arcade", ["3d", "reflex"]),
    mgg("Two Ball 3D", "two-ball-3d", "arcade", ["slope", "2p"]),
    mgg("Ultimate Chess", "flash/?game=ultimate-chess", "puzzle", ["chess"]),
    mgg("Vex 3", "vex-3", "arcade", ["stickman", "parkour"]),
    mgg("Vex 4", "vex-4", "arcade", ["stickman", "parkour"]),
    mgg("Vex 5", "vex-5", "arcade", ["stickman", "parkour"]),
    mgg("Vex 6", "vex-6", "arcade", ["stickman", "parkour"]),
    mgg("Vex 7", "vex-7", "arcade", ["stickman", "parkour"]),
    mgg("Volley Random", "volley-random", "sports", ["volleyball", "2p"]),
    mgg("Web osu!", "web-osu", "arcade", ["osu", "rhythm"]),
    mgg("X-Trench Run", "x-trench-run", "action", ["star wars", "3d"]),
    mgg("YoHoHo.io", "yohoho", "action", ["pirates", "io"]),
  ];

  var CATEGORIES = [
    { id: "all", label: "All (180+)" },
    { id: "featured", label: "Featured" },
    { id: "action", label: "Action & Shooter" },
    { id: "arcade", label: "Arcade & Runner" },
    { id: "sports", label: "Sports & Driving" },
    { id: "minecraft", label: "Minecraft / Eagler" },
    { id: "puzzle", label: "Puzzle & Strategy" },
    { id: "idle", label: "Idle & Clicker" },
    { id: "escape", label: "Escape & Point-Click" },
    { id: "flash", label: "Classic Flash" },
    { id: "apps", label: "Apps & Media" },
    { id: "community", label: "Admin Added" },
  ];

  window.IbossGamesCatalog = {
    categories: CATEGORIES,
    builtin: BUILTIN_CATALOG,
    builtInGames: BUILTIN_CATALOG,
    healLegacyGameUrl: healLegacyGameUrl,
    getAll: function (customGames) {
      var extra = Array.isArray(customGames)
        ? customGames.map(function (g) {
            return {
              title: g.title,
              url: healLegacyGameUrl(g.url),
              category: g.category || "community",
              aliases: g.aliases || [],
              source: "Admin",
            };
          })
        : [];
      return extra.concat(BUILTIN_CATALOG);
    },
    search: function (query, category, customGames) {
      var list = this.getAll(customGames);
      var q = String(query || "")
        .trim()
        .toLowerCase();
      var cat = category || "all";
      return list.filter(function (item) {
        if (cat !== "all" && item.category !== cat) return false;
        if (!q) return true;
        if (item.title.toLowerCase().indexOf(q) !== -1) return true;
        if (item.category.toLowerCase().indexOf(q) !== -1) return true;
        if (Array.isArray(item.aliases)) {
          for (var i = 0; i < item.aliases.length; i++) {
            if (String(item.aliases[i]).toLowerCase().indexOf(q) !== -1) {
              return true;
            }
          }
        }
        return false;
      });
    },
  };
})(window);
