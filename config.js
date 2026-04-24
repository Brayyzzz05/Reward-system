export default {
  reward: {
    pool: [
      // COMMON
      { cmd: "give {player} oak_log 64", chance: 300000 },
      { cmd: "give {player} bread 64", chance: 280000 },
      { cmd: "give {player} coal 64", chance: 260000 },
      { cmd: "give {player} iron_ingot 64", chance: 240000 },

      // UNCOMMON
      { cmd: "give {player} gold_ingot 32", chance: 90000 },
      { cmd: "give {player} emerald 32", chance: 60000 },

      // RARE
      { cmd: "give {player} diamond 16", chance: 15000 },
      { cmd: "give {player} breeze_rod 16", chance: 12000 },
      { cmd: "give {player} golden_apple 16", chance: 10000 },

      // VERY RARE
      { cmd: "give {player} netherite_ingot 1", chance: 2000 },

      // MYTHIC
      { cmd: "give {player} enchanted_golden_apple 1", chance: 200 },

      // ULTRA
      { cmd: "give {player} elytra 1", chance: 50 },

      // JACKPOT
      {
        cmd: "give {player} minecraft:beacon 4 && give {player} minecraft:netherite_block 1 && give {player} minecraft:diamond_block 12 && give {player} minecraft:gold_block 16 && give {player} minecraft:iron_block 32",
        chance: 10
      }
    ]
  },

  cooldowns: {
    message: 5
  },

  guaranteedRewards: {
    guaranteedCommonPlus: { enabled: false },
    guaranteedUncommonPlus: { enabled: false },
    guaranteedRarePlus: { enabled: false },
    guaranteedVeryRarePlus: { enabled: false },
    guaranteedMythicPlus: { enabled: false },
    guaranteedUltraPlus: { enabled: false },
    guaranteedJackpotPlus: { enabled: false }
  }
};