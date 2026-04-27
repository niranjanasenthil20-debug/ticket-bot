require("dotenv").config();
const { chromium } = require("playwright");
const TelegramBot = require("node-telegram-bot-api");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Store users
// { chatId: Set(urls) }
let users = {};

// Prevent duplicate alerts
// { "chatId_url": true/false }
let alerted = {};

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


// -------- FUNCTION: CHECK 2 SEATS TOGETHER --------
async function hasTwoSeatsTogether(page) {
    await page.waitForTimeout(6000);

    const seats = await page.$$eval(
        '[class*="Available"], .seat-available',
        els => els.map(el => ({
            row: el.getAttribute("data-row") || el.parentElement?.getAttribute("data-row"),
            left: el.getBoundingClientRect().left
        }))
    );

    const rows = {};

    seats.forEach(seat => {
        if (!seat.row) return;
        if (!rows[seat.row]) rows[seat.row] = [];
        rows[seat.row].push(seat.left);
    });

    for (const row in rows) {
        const sorted = rows[row].sort((a, b) => a - b);

        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i] - sorted[i - 1] < 40) {
                return true; // found 2 adjacent seats
            }
        }
    }

    return false;
}

// -------- MAIN CHECKER --------
async function run() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    console.log("🚀 Bot running...");

    setInterval(async () => {
        for (const chatId in users) {
            for (const url of users[chatId]) {

                try {
                    await page.goto(url, { waitUntil: "domcontentloaded" });
                    await page.waitForTimeout(3000);

                    // Click "Book Tickets"
                    const bookBtn = page.locator("text=Book Tickets");

                    if (await bookBtn.count() > 0) {
                        await bookBtn.first().click();
                        await page.waitForTimeout(3000);

                        // Click first showtime if exists
                        const showtime = page.locator("[data-testid='showtime'], .showtime");

                        if (await showtime.count() > 0) {
                            await showtime.first().click();
                            await page.waitForTimeout(5000);
                        }

                        // Check seats
                        const hasSeats = await hasTwoSeatsTogether(page);

                        const key = chatId + "_" + url;

                        if (hasSeats && !alerted[key]) {

                            // 🚨 First alert
                            bot.sendMessage(
                                chatId,
                                "🚨🎟 2 seats together available!\n" + url
                            );

                            // 🔁 Reminder
                            setTimeout(() => {
                                bot.sendMessage(
                                    chatId,
                                    "⏰ Reminder: Seats still available!\n" + url
                                );
                            }, 30000);

                            alerted[key] = true;
                        }

                        if (!hasSeats) {
                            alerted[key] = false;
                        }
                    }

                } catch (err) {
                    console.log("Error:", err.message);
                }
            }
        }
    }, 30000); // every 30 seconds
}

run();
