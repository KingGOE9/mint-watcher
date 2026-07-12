const { ethers } = require("ethers");
const fs = require("fs");

const RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
const CONTRACT_ADDRESS = "0xa3f56adb32d3a8f3b41462e3fbf17f36829325be";
const STATE_FILE = "state.json";

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const REMINDER_INTERVAL_MS = 30_000;
const MAX_REMINDERS = 20; // 20 * 30s = 10 minutes safety cap

const abi = ["function mintOpen() view returns (bool)"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

  const forceTest = process.env.FORCE_TEST_MODE === "true";

  const currentState = forceTest ? true : await contract.mintOpen();
  let lastState = null;
  if (fs.existsSync(STATE_FILE)) {
    lastState = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")).mintOpen;
  }

  console.log(`Current: ${currentState}, Last known: ${lastState}${forceTest ? " (FORCED TEST MODE)" : ""}`);

  if (currentState !== lastState) {
    console.log("State changed! Sending notification...");
    await notify(currentState, false);
    saveState(currentState);
  } else {
    console.log("No change.");
  }

  if (currentState === true) {
    await reminderLoop(contract, forceTest);
  }
}

async function reminderLoop(contract, forceTest) {
  console.log("Entering reminder loop (mint is open)...");

  const interval = forceTest ? 5_000 : REMINDER_INTERVAL_MS;
  const maxReminders = forceTest ? 3 : MAX_REMINDERS;

  for (let i = 1; i <= maxReminders; i++) {
    await sleep(interval);

    const stillOpen = forceTest ? (i < maxReminders) : await contract.mintOpen();

    if (!stillOpen) {
      console.log("Mint closed during reminder loop. Notifying and stopping.");
      await notify(false, false);
      saveState(false);
      return;
    }

    console.log(`Reminder ${i}/${maxReminders}`);
    await notify(true, true);
  }

  console.log("Reminder loop safety cap reached.");
}

function saveState(mintOpen) {
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({ mintOpen, checkedAt: new Date().toISOString() }, null, 2)
  );
}

async function notify(open, isReminder) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("Telegram credentials not set, skipping notification.");
    return;
  }

  const text = isReminder
    ? `⏰ *Reminder: mint is still OPEN* — go mint now!\nContract: \`${CONTRACT_ADDRESS}\``
    : `🐱 *Mint status changed:* ${open ? "🟢 OPEN" : "🔴 CLOSED"}\nContract: \`${CONTRACT_ADDRESS}\``;

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "Markdown" })
  });

  if (!res.ok) {
    console.error("Telegram send failed:", res.status, await res.text());
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
