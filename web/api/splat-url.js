// Vercel function: returns a short-lived download link for a private Backblaze B2 file.
// The B2 key lives in Vercel environment variables, never in the browser.
// Env: B2_KEY_ID, B2_APP_KEY (read-only key), B2_BUCKET (default earth-gs),
//      B2_FILE (default earth-2to1-hr.splat), B2_LINK_SECONDS (default 3600).

const AUTH_URL = 'https://api.backblazeb2.com/b2api/v2/b2_authorize_account';

let cachedAuth = null; // { token, apiUrl, downloadUrl, accountId, bucketId, expiresAt }

async function authorize() {
  if (cachedAuth && Date.now() < cachedAuth.expiresAt) return cachedAuth;
  const basic = Buffer.from(`${process.env.B2_KEY_ID}:${process.env.B2_APP_KEY}`).toString('base64');
  const res = await fetch(AUTH_URL, { headers: { Authorization: `Basic ${basic}` } });
  if (!res.ok) throw new Error(`b2_authorize_account failed: ${res.status}`);
  const a = await res.json();
  const bucketName = process.env.B2_BUCKET || 'earth-gs';
  let bucketId = a.allowed?.bucketId;
  if (!bucketId) {
    // Key is not limited to one bucket: look the bucket up by name.
    const lb = await fetch(`${a.apiUrl ?? a.apiInfo?.storageApi?.apiUrl}/b2api/v2/b2_list_buckets`, {
      method: 'POST',
      headers: { Authorization: a.authorizationToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: a.accountId, bucketName }),
    });
    if (!lb.ok) throw new Error(`b2_list_buckets failed: ${lb.status}`);
    bucketId = (await lb.json()).buckets?.[0]?.bucketId;
    if (!bucketId) throw new Error(`bucket not found: ${bucketName}`);
  }
  cachedAuth = {
    token: a.authorizationToken,
    apiUrl: a.apiUrl ?? a.apiInfo?.storageApi?.apiUrl,
    downloadUrl: a.downloadUrl ?? a.apiInfo?.storageApi?.downloadUrl,
    accountId: a.accountId,
    bucketId,
    expiresAt: Date.now() + 20 * 60 * 1000, // re-authorize well before the account token expires
  };
  return cachedAuth;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'GET only' });
    return;
  }
  if (!process.env.B2_KEY_ID || !process.env.B2_APP_KEY) {
    res.status(500).json({ error: 'B2 credentials are not set' });
    return;
  }
  try {
    const auth = await authorize();
    const bucketName = process.env.B2_BUCKET || 'earth-gs';
    const fileName = process.env.B2_FILE || 'earth-2to1-hr.splat';
    const seconds = Number(process.env.B2_LINK_SECONDS) || 3600;
    const dl = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_download_authorization`, {
      method: 'POST',
      headers: { Authorization: auth.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucketId: auth.bucketId, fileNamePrefix: fileName, validDurationInSeconds: seconds }),
    });
    if (!dl.ok) throw new Error(`b2_get_download_authorization failed: ${dl.status}`);
    const { authorizationToken } = await dl.json();
    const url = `${auth.downloadUrl}/file/${bucketName}/${fileName}?Authorization=${authorizationToken}`;
    res.status(200).json({ url, expiresInSeconds: seconds, cacheKey: fileName });
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
}