require("dotenv").config();
const { chromium } = require("playwright");
const TelegramBot = require("node-telegram-bot-api");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Store users
let users = {}; // { chatId: Set(urls) }

// Track alert status
let alerted = {}; // { "chatId_url": true/false }

// START
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(
        msg.chat.id,
        "👋 Welcome!\n\nCommands:\n/add <BookMyShow link>\n/list\n/remove"
    );
});

// ADD
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

// LIST
bot.onText(/\/list/, (msg) => {
    const list = users[msg.chat.id];

    if (!list || list.size === 0) {
        return bot.sendMessage(msg.chat.id, "No shows tracked.");
    }

    bot.sendMessage(msg.chat.id, [...list].join("\n"));
});

// REMOVE ALL
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

                    const soldOut = await page.locator("text=Sold Out").count();
                    const isAvailable = soldOut === 0;

                    const key = chatId + "_" + url;

                    if (isAvailable && !alerted[key]) {

                        // 🚨 FIRST ALERT
                        bot.sendMessage(
                            chatId,
                            "🚨🎟 TICKETS OPEN NOW!\n" + url
                        );

                        // 🔁 REMINDER AFTER 30 SECONDS
                        setTimeout(() => {
                            bot.sendMessage(
                                chatId,
                                "⏰ Reminder: Tickets still available!\n" + url
                            );
                        }, 30000);

                        // 🔁 REMINDER AFTER 1 MINUTE
                        setTimeout(() => {
                            bot.sendMessage(
                                chatId,
                                "⚡ Hurry! Tickets may sell out soon!\n" + url
                            );
                        }, 60000);

                        alerted[key] = true;
                    }

                    // Reset if sold out again (so future alerts work)
                    if (!isAvailable) {
                        alerted[key] = false;
                    }

                } catch (err) {
                    console.log("Error:", err.message);
                }
            }
        }
    }, 30000); // check every 30 seconds
}

run();
