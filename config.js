export default {
  reward: {
    messagesRequired: 20,

    luckyUsers: {
      brayyzzz: 3
    },

    adminLuckMultiplier: 100,

    guaranteedUltra: {
      enabled: true,
      discordId: "1274645481217327108"
    },

    pool: [
      { cmd: "give {player} oak_log 16", chance: 3000 },
      { cmd: "give {player} bread 8", chance: 2500 },
      { cmd: "give {player} coal 10", chance: 2000 },
      { cmd: "give {player} iron_ingot 5", chance: 1500 },

      { cmd: "give {player} gold_ingot 4", chance: 700 },
      { cmd: "give {player} emerald 2", chance: 400 },

      { cmd: "give {player} diamond 2", chance: 100 },
      { cmd: "give {player} breeze_rod 4", chance: 80 },
      { cmd: "give {player} golden_apple 4", chance: 70 },

      { cmd: "give {player} netherite_ingot 1", chance: 10 },
      { cmd: "give {player} heavy_core 1", chance: 3 },
      { cmd: "give {player} enchanted_golden_apple 1", chance: 2 }
    ]
  },

  daily: {
    baseSpins: 2,
    streakBonus: 1
  },

  cooldowns: {
    message: 15
  }
};