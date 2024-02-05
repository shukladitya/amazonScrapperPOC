const express = require("express");
const puppeteer = require("puppeteer");
const fs = require("fs");

require("dotenv").config();

// Function to handle cookies window
async function handleCookiesPopup(page) {
  const cookiesButton = await page.$("#sp-cc-accept");
  if (cookiesButton) {
    await cookiesButton.click();
  }
}

// for proxy
const proxyList = [];
// const proxyFetch = async () => {
//   const browser = await puppeteer.launch({
//     headless: false,
//     defaultViewport: null,
//   });

//   const freeProxyUrl = "https://free-proxy-list.net/";

//   const page = await browser.newPage();

//   await page.goto(freeProxyUrl);

//   await page.waitForSelector(".table-bordered");

//   const proxyData = await page.evaluate(() => {
//     const proxies = Array.from(
//       document.querySelectorAll(".table-bordered tbody tr")
//     );

//     const proxyInfo = proxies
//       .map((proxy) => {
//         const ipAddress = proxy.querySelector("td")?.textContent.trim();
//         const port = proxy.querySelector("td:nth-child(2)")?.textContent.trim();

//         if (ipAddress) {
//           return {
//             ipAddress,
//             port,
//           };
//         } else {
//           return null;
//         }
//       })
//       .filter((proxy) => proxy !== null);

//     return proxyInfo;
//   });

//   proxyList.push(...proxyData);

//   await browser.close();
// };

const scrapeAmazon = async (pageNumber, scrapeString) => {
  const randomProxy = Math.floor(Math.random() * proxyList.length);
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: [
      "--disable-setuid-sandbox",
      "--no-sandbox",
      "--no-zygote",
      "--single-process",
    ],
    // headless: false,
    // defaultViewport: null,
    // args: [`--proxy-server=104.16.109.213:80`],
  });

  // Open a new page
  const page = await browser.newPage();

  const searchPhrase = scrapeString;
  const scrapeToPage = pageNumber; // page number to scrape

  console.log("Search phrase:", searchPhrase);
  console.log("Scrape to page:", scrapeToPage);
  const homeUrl = "https://www.amazon.in/gp/cart/view.html";
  page.setDefaultNavigationTimeout(20000);
  await page.goto(homeUrl, { waitUntil: "load", timeout: 0 });

  await handleCookiesPopup(page);
  await page.waitForSelector("#twotabsearchtextbox");
  await page.type("#twotabsearchtextbox", searchPhrase);
  await page.click("#nav-search-submit-button");

  // Wait for the search results page to load
  await page.waitForSelector(".s-widget-container");

  const url = page.url(); // Get the current URL after the search

  const cardData = [];

  async function scrapePage(url, currentPage = 1, scrapeToPage = null) {
    console.log("Scraping page " + currentPage + "...");
    if (scrapeToPage !== null && currentPage > scrapeToPage) {
      return; // Stop scraping if the current page exceeds the target page
    }
    await page.goto(url);

    await handleCookiesPopup(page);

    await page.waitForSelector(".s-widget-container");

    const pageCardData = await page.evaluate(() => {
      const cards = Array.from(
        document.querySelectorAll(".s-widget-container")
      );

      const cardInfo = cards
        .map((card) => {
          // Product name
          const productName = card.querySelector("h2")?.textContent.trim();

          // Sponsored tag
          const sponsoredTag = card.querySelector(".puis-sponsored-label-text");
          const sponsored = sponsoredTag ? "yes" : "no";

          // Badge
          const badgeElement = card.querySelector("span.a-badge-label-inner");
          const badge = badgeElement ? badgeElement.textContent : "N/A";

          // Price
          const priceElement = card.querySelector(".a-price .a-offscreen");
          const price = priceElement ? priceElement.textContent : "N/A";

          // Base price (without discount)
          const basePriceElement = card.querySelector(
            "span.a-price.a-text-price > span.a-offscreen"
          );
          const basePrice = basePriceElement
            ? basePriceElement.textContent
            : "N/A";

          // Rating
          const ratingElement = card.querySelector(
            ".a-row > span:nth-child(1)[aria-label]"
          );
          const decimalRegex = /^\d+([,.]\d+)?$/;
          const ariaLabel = ratingElement
            ? ratingElement.getAttribute("aria-label")
            : "N/A";
          const firstThreeCharacters = ariaLabel.substring(0, 3);
          const rating = decimalRegex.test(firstThreeCharacters)
            ? firstThreeCharacters.replace(",", ".")
            : "N/A";

          // Ratings number
          const ratingsNumberElement = card.querySelector(
            ".a-row > span:nth-child(2)[aria-label]"
          );
          const numberRegex = /^-?\d+(\.\d+)?$/;
          const numberFormated = ratingsNumberElement
            ? ratingsNumberElement
                .getAttribute("aria-label")
                .replace(/[\s.,]+/g, "")
            : "N/A";
          const ratingsNumber = numberRegex.test(numberFormated)
            ? numberFormated
            : "N/A";

          // Quantity sold last month
          const boughtPastMonthElement = card.querySelector(
            ".a-row.a-size-base > .a-size-base.a-color-secondary"
          );
          const textContent = boughtPastMonthElement
            ? boughtPastMonthElement.textContent
            : "N/A";
          const plusSignRegex = /\b.*?\+/; // Regular expression to match text up to and including the "+" sign
          // (e.g. value "300+" from text "300+ bought in past month")
          const plusSignText = textContent.match(plusSignRegex);
          const boughtPastMonth = plusSignRegex.test(plusSignText)
            ? plusSignText[0]
            : "N/A";

          if (productName) {
            return {
              productName,
              sponsored,
              badge,
              price,
              basePrice,
              rating,
              ratingsNumber,
              boughtPastMonth,
            };
          } else {
            return null; // Return null for empty items
          }
        })
        .filter((card) => card !== null);

      return cardInfo;
    });

    cardData.push(...pageCardData);

    if (scrapeToPage === null || currentPage < scrapeToPage) {
      const nextPageButton = await page.$(".s-pagination-next");
      if (nextPageButton) {
        const isDisabled = await page.evaluate(
          (btn) => btn.hasAttribute("aria-disabled"),
          nextPageButton
        );
        if (!isDisabled) {
          const nextPageUrl = encodeURI(
            await page.evaluate((nextBtn) => nextBtn.href, nextPageButton)
          );
          await scrapePage(nextPageUrl, currentPage + 1, scrapeToPage);
        } else {
          console.log("All available pages scraped:", currentPage);
        }
      } else if (!scrapeToPage || currentPage < scrapeToPage) {
        console.log("All available pages scraped:", currentPage);
      }
    }
  }

  await scrapePage(url, 1, scrapeToPage);

  console.log("Scraping finished.");

  // Save JSON to file
  const outputFilename = "scrapedData.json";
  // fs.writeFileSync(outputFilename, JSON.stringify(cardData, null, 2), "utf8"); // Write the JSON data to a file
  // console.log(`Data saved to ${outputFilename}`);

  // Close the browser
  await browser.close();

  return cardData;
};

const main = async (pageNumber, scrapeString) => {
  // await proxyFetch();
  return await scrapeAmazon(pageNumber, scrapeString);
};

const app = express();

app.get("/", async (req, res) => {
  const pageNumber = req.query.pageNumber;
  const scrapeString = req.query.scrape;
  console.log(`Scraping page number ${pageNumber}...`);

  const data = await main(pageNumber, scrapeString);
  res.send(data);
});

app.listen(3000, () => {
  console.log("Server started on port 3000");
});
