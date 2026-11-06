# Zomato-expense-exporter
this was a fun project, I did out of curisity. I'm a Foodie who orders food like hell. I made this coz i wanted to know how much i could have saved.. for me it was 44k wt... i could have gone for a vacatation TRY THIS AND SHARE YOURS..


now time for the Actual How to setup this and how its working... do follow for more..
# Zomato expense exporter

A single JavaScript file that saves your Zomato order history as a CSV. It runs inside your signed-in Zomato tab, uses your existing browser session, and needs no installation or copied cookies.

## Use it

1. Sign in at **https://www.zomato.com/** in Chrome and leave that tab open.
2. Open DevTools (**Mac: Cmd+Option+J**, **Windows: Ctrl+Shift+J**). Select **Console**. Chrome may require you to type `allow pasting` before it accepts pasted code. Read the script before you do so.
3. Open `export-zomato.js`, copy all its contents, paste into that Console and press Enter.
4. Wait for the `zomato-expenses-YYYY-MM-DD.csv` download and the final message in the Console. Open the CSV in Excel, Numbers, or Google Sheets. The displayed total is in rupees.

If you also want every original field returned for each order, change `SAVE_RAW_JSON` near the top to `true` before pasting. Your browser may ask to allow two downloads.

## How it works

The request you provided, `GET /webroutes/user/orders?page=105`, asks Zomato for **one page** of orders. `credentials: "include"` tells the browser to send your existing Zomato cookies. The long list of copied browser headers isn't needed for a request made from the Zomato tab.

The script first requests page 1 and reads `sections.SECTION_USER_ORDER_HISTORY.totalPages`. It fetches the remaining pages with at most four requests running at once. Temporary network and rate-limit errors get a few retries. Each page contains an `entities.ORDER` object; its keys are order IDs. The script combines those objects by ID, extracts dates, restaurants, dishes, and `totalCost`, then downloads a CSV. The Console prints a sum computed in paise to avoid decimal rounding errors.

Your attachment is a **different site's processed order payload**, not Zomato's response to the GET above. The exporter does not send anything to that site. It uses the native fields reported by [existing open-source implementations](https://github.com/jaga3421/munchmetrics-chrome-extension/blob/main/AGENTS.md) and [this small sample client](https://github.com/shubham399/food-cost/blob/main/zomato.js). This is an **unofficial web endpoint**, so Zomato can change its response or block requests. I could not test against your signed-in account. If the response shape changes, the script stops rather than downloading a misleading partial export.

## Reading the result

- One row is one order. `displayed_total_inr` comes from Zomato's `totalCost`, including any charges already reflected in that field.
- The Console sum adds **displayed order totals**. It does not establish net money paid: cancelled orders, refunds, credits, tips, and split payments may need checking against invoices or bank transactions.
- If an order has no usable `totalCost`, the row stays in the file with a blank amount; the Console tells you how many amounts it parsed.
- If Zomato's reported count differs from the collected unique orders, the Console warns you. This can happen if orders arrive while pages are being fetched or the endpoint changes.
- CSV and optional JSON can include private order details. Keep the files somewhere you trust. The script sends requests only to `www.zomato.com` and downloads files locally.

## Troubleshooting

- **Session expired / access denied:** sign in again, refresh Zomato, rerun the script.
- **Unexpected response:** verify you ran it on `www.zomato.com` and that the order history works in the website. A Zomato API change may require adjusting the parser.
- **429 or other errors:** wait and rerun. A failed page stops the export; nothing partial is downloaded.
- **No download:** check the browser's download permissions and Console errors.
