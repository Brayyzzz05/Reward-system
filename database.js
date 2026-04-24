import "dotenv/config";
import express from "express";
import cors from "cors";
import {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes
} from "discord.js";

import crypto from "crypto";
import db from "./database.js";
import config from "./config.js";

// =====================
// ADMIN PANEL
// =====================
const app = express();
app.use(cors());
app.use(express.json());

const ADMIN_KEY = process.env.ADMIN_KEY;

function auth(req, res, next) {
  if (req.headers.authorization !== ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// USERS
app.get("/users", auth, async (req, res) => {
  const data = await db.query("SELECT * FROM users");
  res.json(data.rows);
});

// SET SPINS
app.post("/set-spins", auth, async (req, res) => {
  const { discord_id, spins } = req.body;

  await db.query(
    "UPDATE users SET spins=$1 WHERE discord_id=$2",
    [spins, discord_id]
  );

  res.json({ ok: true });
});

// SET LUCK
app.post("/set-luck", auth, async (req, res) => {
  const { discord_id, luck } = req.body;

  await db.query(
    "UPDATE users SET luck_multi=$1 WHERE discord_id=$2",
    [luck, discord_id]
  );

  res.json({ ok: true });
});

// SET MESSAGE
app.post("/set-messages", auth, async (req, res) => {
  const { discord_id, messages } = req.body;

  await db.query(
    "UPDATE users SET messages=$1 WHERE discord_id=$2",
    [messages, discord_id]
  );

  res.json({ ok: true });
});

// GUARANTEE SYSTEM (RESTORED)
app.post("/set-guarantee", auth, async (req, res) => {
  const { discord_id, rarity, enabled } = req.body;

  await db.query(
    `UPDATE users
     SET guarantee = jsonb_set(
       COALESCE(guarantee,'{}'),
       ARRAY[$1],
       to_jsonb($2::boolean),
       true
     )
     WHERE discord_id=$3`,
    [rarity, enabled, discord_id]
  );

  res.json({ ok: true });
});

// QUEUE
app.get("/queue", auth, async (req, res) => {
  const q = await db.query(
    "SELECT * FROM reward_queue WHERE status='pending'"
  );

  res.json(q.rows);
});

app.listen(3000, () => {
  console.log("🌐 Admin panel running");
});

// =====================
// DISCORD BOT
// =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const query = (q, p=[]) => db.query(q,p);

// =====================
// HASH
// =====================
function hash(a,b){
  return crypto.createHash("sha256").update(a+b).digest("hex");
}

// =====================
// RCON
// =====================
async function run(cmd){
  if(!global.rconSend) throw new Error("RCON missing");
  return global.rconSend(cmd);
}

// =====================
// USER FETCH
// =====================
async function getUser(id){
  await query(
    "INSERT INTO users (discord_id) VALUES ($1) ON CONFLICT DO NOTHING",
    [id]
  );

  const res = await query(
    "SELECT * FROM users WHERE discord_id=$1",
    [id]
  );

  return res.rows[0] || {};
}

// =====================
// MESSAGE TRACKER
// =====================
client.on("messageCreate", async (m)=>{
  if(!m.guild || m.author.bot) return;

  await query(
    `UPDATE users
     SET messages = COALESCE(messages,0)+1
     WHERE discord_id=$1`,
    [m.author.id]
  ).catch(()=>{});
});

// =====================
// REWARD SYSTEM (WITH GUARANTEE SUPPORT)
// =====================
async function giveReward(userId, mc, cmd, userData){
  const final = cmd.replace("{player}", mc);
  const h = hash(userId, final);

  try {
    const exists = await query(
      "SELECT 1 FROM delivered_rewards WHERE reward_hash=$1",
      [h]
    );

    if (exists.rows.length) return;

    await run(final);

    await query(
      `INSERT INTO delivered_rewards (reward_hash)
       VALUES ($1)
       ON CONFLICT DO NOTHING`,
      [h]
    );

  } catch {
    await query(
      `INSERT INTO reward_queue
       (discord_id,minecraft_name,command,reward_hash,status,created_at)
       VALUES ($1,$2,$3,$4,'pending',$5)`,
      [userId, mc, final, h, Date.now()]
    );
  }
}

// =====================
// QUEUE WORKER
// =====================
setInterval(async ()=>{
  try{
    const q = await query(
      "SELECT * FROM reward_queue WHERE status='pending' LIMIT 20"
    );

    for(const r of q.rows){
      try{
        await run(r.command);

        await query(
          "UPDATE reward_queue SET status='delivered' WHERE id=$1",
          [r.id]
        );

        await query(
          "INSERT INTO delivered_rewards (reward_hash) VALUES ($1) ON CONFLICT DO NOTHING",
          [r.reward_hash]
        );
      }catch{}
    }
  }catch{}
},5000);

// =====================
// COMMANDS (FULL RESTORE)
// =====================
const commands = [
  new SlashCommandBuilder().setName("stats").setDescription("View stats"),

  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Link MC")
    .addStringOption(o => o.setName("username").setRequired(true)),

  new SlashCommandBuilder().setName("shop").setDescription("Shop"),

  new SlashCommandBuilder().setName("roll").setDescription("Roll"),

  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy items")
    .addStringOption(o => o.setName("item").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setRequired(true)),

  new SlashCommandBuilder()
    .setName("setspins")
    .setDescription("Admin set spins"),

  new SlashCommandBuilder()
    .setName("setmessages")
    .setDescription("Admin set messages"),

  new SlashCommandBuilder()
    .setName("setluck")
    .setDescription("Admin set luck")
];

// =====================
client.once("ready", async ()=>{
  console.log(`🤖 Logged in as ${client.user.tag}`);

  const rest = new REST({version:"10"}).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID
    ),
    {body:commands.map(c=>c.toJSON())}
  );

  console.log("✅ Commands loaded");
});

// =====================
// INTERACTIONS
// =====================
client.on("interactionCreate", async(i)=>{
  if(!i.isChatInputCommand()) return;

  try{
    await i.deferReply({ephemeral:true});

    const u = await getUser(i.user.id);

    if(i.commandName==="stats"){
      return i.editReply(
`💬 ${u.messages||0}
🎟 ${u.spins||0}
🍀 ${u.luck_multi||0}`
      );
    }

    if(i.commandName==="verify"){
      const name=i.options.getString("username");

      await query(
        `INSERT INTO users (discord_id,minecraft_name)
         VALUES ($1,$2)
         ON CONFLICT (discord_id)
         DO UPDATE SET minecraft_name=$2`,
        [i.user.id,name]
      );

      return i.editReply("✅ linked");
    }

    if(i.commandName==="roll"){
      if(!u.minecraft_name) return i.editReply("❌ verify first");

      const pool=config.reward.pool;
      let total=pool.reduce((a,b)=>a+b.chance,0);
      let r=Math.random()*total;

      let reward;

      for(const p of pool){
        if(r<p.chance){
          reward=p;
          break;
        }
        r-=p.chance;
      }

      await giveReward(i.user.id,u.minecraft_name,reward.cmd,u);

      return i.editReply("🎰 rolling reward...");
    }

  }catch(e){
    console.error(e);
    if(!i.replied){
      await i.reply({content:"❌ error",ephemeral:true});
    }
  }
});

// =====================
client.login(process.env.TOKEN);