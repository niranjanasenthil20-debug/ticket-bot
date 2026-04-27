require("dotenv").config();
const { chromium } = require("playwright");
const TelegramBot = require("node-telegram-bot-api");

// Initialize bot
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Store users and their links
// { chatId: Set(urls) }
let users = {};

// Prevent duplicate alerts per user+url
// { "chatId_url": true/false }
let alerted = {};

// START command
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(
        msg.chat.id,
        "👋 Welcome!\n\nCommands:\n/add <BookMyShow link>\n/list\n/remove"
    );
});

// ADD command
bot.onText(/\/add (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const url = match[1];

    if (!users[chatId]) users[chatId] = new Set();

    if (users[chatId].has(url)) {
        return bot.sendMessage(chatId, "⚠️ Already tracking this link");
    }

    users[chatId].add(url);
    bot.sendMessage(chatId, "✅ Tracking started!");
});

// LIST command
bot.onText(/\/list/, (msg) => {
    const list = users[msg.chat.id];

    if (!list || list.size === 0) {
        return bot.sendMessage(msg.chat.id, "No shows tracked.");
    }

    bot.sendMessage(msg.chat.id, "🎬 Your shows:\n" + [...list].join("\n"));
});

// REMOVE ALL command
bot.onText(/\/remove/, (msg) => {
    users[msg.chat.id] = new Set();
    bot.sendMessage(msg.chat.id, "🗑 All shows removed.");
});

// MAIN CHECKER
async function run() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    console.log("🚀 Bot running...");

    setInterval(async () => {
        for (const chatId in users) {
            for (const url of users[chatId]) {

                try {
                    await page.goto(url, { waitUntil: "domcontentloaded" });
                    await page.waitForTimeout(4000);

                    // Check if "Sold Out" text exists
                    const soldOut = await page.locator("text=Sold Out").count();
                    const isAvailable = soldOut === 0;

                    const key = chatId + "_" + url;

                    // Send alert only once per availability
                    if (isAvailable && !alerted[key]) {
                        bot.sendMessage(
                            chatId,
                            "🎟 Tickets available!\n" + url
                        );

                        alerted[key] = true;
                    }

                    // Reset alert if tickets go back to sold out
                    if (!isAvailable) {
                        alerted[key] = false;
                    }

                } catch (err) {
                    console.log("Error:", err.message);
                }
            }
        }
    }, 45000); // check every 45 seconds
}

run();
