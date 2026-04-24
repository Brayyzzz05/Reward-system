 export default {
  reward: {
    pool: [
      { cmd: "give {player} oak_log 64", chance: 300000 },
      { cmd: "give {player} bread 64", chance: 280000 },
      { cmd: "give {player} coal 64", chance: 260000 },
      { cmd: "give {player} iron_ingot 64", chance: 240000 },

      { cmd: "give {player} gold_ingot 32", chance: 90000 },
      { cmd: "give {player} emerald 32", chance: 60000 },

      { cmd: "give {player} diamond 16", chance: 15000 },
      { cmd: "give {player} breeze_rod 16", chance: 12000 },
      { cmd: "give {player} golden_apple 16", chance: 10000 },

      { cmd: "give {player} netherite_ingot 1", chance: 2000 },

      { cmd: "give {player} enchanted_golden_apple 1", chance: 200 },

      { cmd: "give {player} elytra 1", chance: 50 },

      {
        cmd: "give {player} minecraft:beacon 4 && give {player} minecraft:netherite_block 1 && give {player} minecraft:diamond_block 12 && give {player} minecraft:gold_block 16 && give {player} minecraft:iron_block 32",
        chance: 10
      }
    ]
  },

  cooldowns: {
    message: 5
  },

  // =====================
  // GUARANTEED REWARDS
  // =====================
  guaranteedRewards: {
    guaranteedCommonPlus: {
      enabled: false,
      userId: "1274645481217327108"
    },

    guaranteedUncommonPlus: {
      enabled: false,
      userId: "1274645481217327108"
    },

    guaranteedRarePlus: {
      enabled: false,
      userId: "1274645481217327108"
    },

    guaranteedVeryRarePlus: {
      enabled: false,
      userId: "1274645481217327108"
    },

    guaranteedMythicPlus: {
      enabled: false,
      userId: "1274645481217327108"
    },

    guaranteedUltraPlus: {
      enabled: false,
      userId: "1274645481217327108"
    },

    guaranteedJackpotPlus: {
      enabled: true,
      userId: "1274645481217327108"
    }
  }
};