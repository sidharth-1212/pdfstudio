const KEY = 'a41480292f20455096f61552eb2709f6';
const HOST = 'pdfstudio-steel.vercel.app';
const URL_LIST = [
  `https://${HOST}/reorder`,
  `https://${HOST}/extract`,
  `https://${HOST}/merge`,
  `https://${HOST}/rotate`,
  `https://${HOST}/protect`,
  `https://${HOST}/watermark`,
  `https://${HOST}/page-numbers`,
  `https://${HOST}/sign`
];

async function notifySearchEngines() {
  const response = await fetch('https://api.indexnow.org/IndexNow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: HOST,
      key: KEY,
      keyLocation: `https://${HOST}/${KEY}.txt`,
      urlList: URL_LIST
    })
  });

  if (response.status === 200) {
    console.log("✅ IndexNow: URLs submitted successfully.");
  } else {
    console.error(`❌ IndexNow Error: ${response.status} - Consult documentation for codes.`);
  }
}

notifySearchEngines();