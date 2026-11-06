// Run in DevTools Console on https://www.zomato.com/ while signed in.
// Only requests Zomato; the downloaded CSV stays on your computer.
(async () => {
  "use strict";
  const CONCURRENCY = 4;
  const RETRIES = 3;
  const SAVE_RAW_JSON = false; // Set true to also download every original order field.
  const endpoint = "/webroutes/user/orders";

  if (location.hostname !== "www.zomato.com") {
    throw new Error("Open https://www.zomato.com/ and sign in first.");
  }

  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const getPage = async (page) => {
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      let response;
      try {
        response = await fetch(`${endpoint}?page=${page}`, {
          credentials: "include",
          headers: { accept: "application/json" },
        });
      } catch (error) {
        if (attempt === RETRIES) throw new Error(`Page ${page}: network error`, { cause: error });
        await pause(700 * 2 ** attempt);
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error(`Page ${page}: session expired or access denied. Sign in again.`);
      }
      if ([429, 500, 502, 503, 504].includes(response.status) && attempt < RETRIES) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await pause(Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 30000) : 700 * 2 ** attempt);
        continue;
      }
      if (!response.ok) throw new Error(`Page ${page}: HTTP ${response.status}`);
      let data;
      try { data = await response.json(); }
      catch { throw new Error(`Page ${page}: expected JSON (check your login).`); }
      if (!data?.entities?.ORDER || typeof data.entities.ORDER !== "object" ||
          Array.isArray(data.entities.ORDER)) {
        throw new Error(`Page ${page}: unexpected order response (check your login or API changes).`);
      }
      return data;
    }
  };

  const csvCell = (value) => {
    const s = String(value ?? "");
    // Spreadsheet programs can interpret values beginning with these characters as formulas.
    const safe = /^[\s\uFEFF]*[=+@\t\r\n-]/.test(s) && !/^-[\d,.]+$/.test(s) ? `'${s}` : s;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const download = (filename, content, type) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const first = await getPage(1);
  const meta = first.sections?.SECTION_USER_ORDER_HISTORY;
  const totalPages = Number(meta?.totalPages);
  if (!Number.isSafeInteger(totalPages) || totalPages < 1 || totalPages > 100000) {
    throw new Error("Missing or invalid totalPages; stopped to avoid an incomplete export.");
  }
  const pages = new Array(totalPages);
  pages[0] = first;
  let nextPage = 2;
  let completed = 1;
  console.log(`Fetching ${totalPages} Zomato order pages (up to ${CONCURRENCY} at once)...`);
  // Workers share a page counter; no request is queued before its worker is ready.
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, totalPages - 1) }, async () => {
    while (nextPage <= totalPages) {
      const page = nextPage++;
      pages[page - 1] = await getPage(page);
      completed++;
      if (completed % 10 === 0 || completed === totalPages) {
        console.log(`Fetched ${completed}/${totalPages} pages`);
      }
    }
  }));

  const ordersById = new Map();
  for (const page of pages) {
    for (const [id, order] of Object.entries(page.entities.ORDER)) {
      if (!ordersById.has(id)) ordersById.set(id, { id, ...order });
    }
  }
  const orders = [...ordersById.values()];
  const expectedCount = Number(meta?.count);
  if (Number.isSafeInteger(expectedCount) && orders.length !== expectedCount) {
    console.warn(`Zomato reported ${expectedCount} orders; received ${orders.length} unique orders. ` +
      "Orders may have changed while exporting, or the site may have changed its response.");
  }

  // Store monetary values in integer paise to avoid floating point summation errors.
  const toPaise = (value) => {
    const match = String(value ?? "").replaceAll(",", "").match(/-?\d+(?:\.\d{1,2})?/);
    if (!match) return null;
    const sign = match[0].startsWith("-") ? -1 : 1;
    const [whole, fraction = ""] = match[0].replace("-", "").split(".");
    const amount = sign * (Number(whole) * 100 + Number(fraction.padEnd(2, "0")));
    return Number.isSafeInteger(amount) ? amount : null;
  };
  const headers = ["order_id", "order_date", "restaurant", "locality", "dishes",
    "displayed_total_inr", "status"];
  let sumPaise = 0;
  let priced = 0;
  const lines = [headers.map(csvCell).join(",")];
  for (const order of orders) {
    const paise = toPaise(order.totalCost);
    if (paise !== null) { sumPaise += paise; priced++; }
    const fields = [order.id, order.orderDate, order.resInfo?.name,
      order.resInfo?.locality?.localityName, order.dishString,
      paise === null ? "" : (paise / 100).toFixed(2), order.orderStatus ?? order.status];
    lines.push(fields.map(csvCell).join(","));
  }
  const stamp = new Date().toISOString().slice(0, 10);
  download(`zomato-expenses-${stamp}.csv`, "\uFEFF" + lines.join("\r\n") + "\r\n", "text/csv;charset=utf-8");
  if (SAVE_RAW_JSON) {
    download(`zomato-orders-raw-${stamp}.json`, JSON.stringify({
      exportedAt: new Date().toISOString(), expectedCount: meta?.count,
      orders,
    }, null, 2), "application/json");
  }
  console.log(`Exported ${orders.length} orders; ${priced} have parseable displayed totals. ` +
    `Sum of displayed totals: ₹${(sumPaise / 100).toFixed(2)}. ` +
    "Check cancelled/refunded orders before treating this as actual net spend.");
})().catch((error) => console.error("Zomato export stopped; no partial CSV was downloaded:", error));
