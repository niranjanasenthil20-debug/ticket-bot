require("dotenv").config();
const { chromium } = require("playwright");
const TelegramBot = require("node-telegram-bot-api");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// { chatId: Set(urls) }
let users = {};

// { url: "available" / "sold_out" }
let lastStatus = {};

// { chatId+url: true }
let alerted = {};

// Start
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(
        msg.chat.id,
        "👋 Welcome!\n\nUse:\n/add <BookMyShow link>\n/list\n/remove"
    );
});

// Add movie
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

// List movies
bot.onText(/\/list/, (msg) => {
    const list = users[msg.chat.id];

    if (!list || list.size === 0) {
        return bot.sendMessage(msg.chat.id, "No shows tracked.");
    }

    bot.sendMessage(msg.chat.id, [...list].join("\n"));
});

// Remove all (simple version)
bot.onText(/\/remove/, (msg) => {
    users[msg.chat.id] = new Set();
    bot.sendMessage(msg.chat.id, "🗑 All shows removed.");
});

// Checker
async function run() {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    console.log("Bot running...");

    setInterval(async () => {
        for (const chatId in users) {
            for (const url of users[chatId]) {

                try {
                    await page.goto(url, { waitUntil: "domcontentloaded" });
                    await page.waitForTimeout(4000);

                    const soldOut = await page.locator("text=Sold Out").count();
                    const current = soldOut > 0 ? "sold_out" : "available";

                    const key = chatId + url;

                    if (
                        current === "available" &&
                        !alerted[key]
                    ) {
                        bot.sendMessage(chatId, "🎟 Tickets available!\n" + url);
                        alerted[key] = true;
                    }

                    lastStatus[url] = current;

                } catch (e) {
                    console.log("Error:", e.message);
                }
            }
        }
    }, 45000);
}

run();
