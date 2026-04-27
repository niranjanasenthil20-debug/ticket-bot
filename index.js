async function hasTwoSeatsTogether(page) {
    await page.waitForTimeout(6000);

    const seats = await page.$$eval(
        '[class*="Available"], .seat-available',
        els => els.map(el => ({
            row: el.getAttribute("data-row") || el.parentElement?.getAttribute("data-row"),
            left: el.getBoundingClientRect().left
        }))
    );

    // group by row
    const rows = {};

    seats.forEach(seat => {
        if (!seat.row) return;
        if (!rows[seat.row]) rows[seat.row] = [];
        rows[seat.row].push(seat.left);
    });

    // check 2 consecutive seats
    for (const row in rows) {
        const sorted = rows[row].sort((a, b) => a - b);

        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i] - sorted[i - 1] < 40) {
                return true; // found 2 seats together
            }
        }
    }

    return false;
}
