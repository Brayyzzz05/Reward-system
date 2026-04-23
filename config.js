export default {
  reward: {

    messagesRequired: 20,

    luckyUsers: {
      brayyzzz: 3
    },

    devMode: false,

    devUsers: {
      brayyzzz: 100
    },

    pool: [
      // 🌿 COMMON
      { cmd: "give {player} oak_log 16", chance: 3000 },
      { cmd: "give {player} bread 8", chance: 2500 },
      { cmd: "give {player} coal 10", chance: 2000 },
      { cmd: "give {player} iron_ingot 5", chance: 1500 },

      // 🪙 RARE
      { cmd: "give {player} gold_ingot 4", chance: 700 },
      { cmd: "give {player} emerald 2", chance: 400 },
      { cmd: "give {player} diamond 2", chance: 200 },

      // 💎 ULTRA RARE
      { cmd: "give {player} breeze_rod 4", chance: 80 },
      { cmd: "give {player} golden_apple 4", chance: 70 },
      { cmd: "give {player} netherite_ingot 1", chance: 25 },
      { cmd: "give {player} netherite_upgrade_smithing_template 1", chance: 10 },
      { cmd: "give {player} heavy_core 1", chance: 5 },
      { cmd: "give {player} enchanted_golden_apple 1", chance: 3 }
    ]
  },

  // ⏱️ cooldown for message counting
  cooldownSeconds: 30,

  // 🎁 DAILY SYSTEM (RESTORED)
  daily: {
    baseSpins: 3,          // base reward
    streakBonus: 2,        // extra per streak day
    maxStreakMultiplier: 10
  },

  // 💥 SPECIAL DROPS
  special: {
    elytraChance: 0.00001,
    jackpotChance: 0.000000001
  },

  // 🌙 LUCK SYSTEM
  luck: {
    weekendMultiplier: 2,
    baseMultiplier: 1
  }
};