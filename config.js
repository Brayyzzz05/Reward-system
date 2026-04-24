export default {
  reward: {
    messagesRequired: 20,

    luckyUsers: {
      brayyzzz: 3
    },

    adminLuckMultiplier: 100,

    pool: [
      // 🌿 COMMON (BUFFED STACKS)
      { cmd: "give {player} oak_log 64", chance: 300000 },
      { cmd: "give {player} bread 64", chance: 280000 },
      { cmd: "give {player} coal 64", chance: 260000 },
      { cmd: "give {player} iron_ingot 64", chance: 240000 },

      // 🪙 UNCOMMON (BUFFED)
      { cmd: "give {player} gold_ingot 32", chance: 90000 },
      { cmd: "give {player} emerald 32", chance: 60000 },

      // 💎 RARE (BUFFED)
      { cmd: "give {player} diamond 16", chance: 15000 },
      { cmd: "give {player} breeze_rod 16", chance: 12000 },
      { cmd: "give {player} golden_apple 16", chance: 10000 },

      // 🔥 VERY RARE
      { cmd: "give {player} netherite_ingot 1", chance: 2000 },
      { cmd: "give {player} netherite_upgrade_smithing_template 1", chance: 1000 },

      // 💀 MYTHIC
      { cmd: "give {player} enchanted_golden_apple 1", chance: 200 },

      // 🌟 ULTRA RARE
      { cmd: "give {player} elytra 1", chance: 50 },

      // 👑 JACKPOT
      {
        cmd: "give {player} minecraft:beacon 4 && give {player} minecraft:netherite_block 1 && give {player} minecraft:diamond_block 12 && give {player} minecraft:gold_block 16 && give {player} minecraft:iron_block 32 && give {player} minecraft:mace{Enchantments:[{id:\"wind_burst\",lvl:1},{id:\"density\",lvl:5},{id:\"unbreaking\",lvl:3},{id:\"mending\",lvl:1}]} 1",
        chance: 10
      }
    ]
  },

  // ⏱️ MESSAGE SYSTEM (UPDATED COOLDOWN)
  cooldowns: {
    message: 5
  },

  // 🧠 GUARANTEE SYSTEM (UNCHANGED)
  guaranteedRewards: {
    guaranteedCommonPlus: { enabled: false, discordId: "PUT_DISCORD_ID_HERE" },
    guaranteedUncommonPlus: { enabled: false, discordId: "PUT_DISCORD_ID_HERE" },
    guaranteedRarePlus: { enabled: false, discordId: "PUT_DISCORD_ID_HERE" },
    guaranteedVeryRarePlus: { enabled: false, discordId: "PUT_DISCORD_ID_HERE" },
    guaranteedMythicPlus: { enabled: false, discordId: "PUT_DISCORD_ID_HERE" },
    guaranteedUltraPlus: { enabled: false, discordId: "PUT_DISCORD_ID_HERE" },
    guaranteedJackpotPlus: { enabled: false, discordId: "PUT_DISCORD_ID_HERE" }
  }
};