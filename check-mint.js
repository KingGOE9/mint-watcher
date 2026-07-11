const { ethers } = require("ethers");
const fs = require("fs");

const RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
const CONTRACT_ADDRESS = "0xa3f56adb32d3a8f3b41462e3fbf17f36829325be";
const STATE_FILE = "state.json";

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const abi = ["function mintOpen() view returns (bool)"];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

  const currentState = await contract.mintOpen();

  let lastState = null;
  if (fs.existsSync(STATE_FILE)) {
    lastState = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")).mintOpen;
  }

  console.log(`Current: ${currentState}, Last known: ${lastState}`);

  if (currentState !== lastState) {
    console.log("State changed! Sending notification...");
    await notify(currentState);
    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify({ mintOpen: currentState, checkedAt: new Date().toISOString() }, null, 2)
    );
  } else {
    console.log("No change.");
  }
}

async function notify(open) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("Telegram credentials not set, skipping notification.");
    return;
  }

  const text =
    `🐱 *Mint status changed:* ${open ? "🟢 OPEN" : "🔴 CLOSED"}\n` +
    `Contract: \`${CONTRACT_ADDRESS}\`\n` +
    `Chain: Robinhood Chain`;

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "Markdown"
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Telegram send failed:", res.status, errText);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});