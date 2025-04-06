import axios from 'axios';
import tough from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) return res.status(400).json({ error: 'Missing `url` query parameter' });

  try {
    // Load credentials from environment
    const USERNAME = process.env.TBX_USERNAME;
    const PASSWORD = process.env.TBX_PASSWORD;

    const jar = new tough.CookieJar();
    const client = wrapper(axios.create({ jar }));

    // Step 1: Login to fetch cookies
    const login = await client.post('https://www.1024tera.com/api/user/login', {
      user_name: USERNAME,
      password: PASSWORD
    }, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/json'
      }
    });

    if (!login.data || login.data.errno !== 0) {
      return res.status(401).json({ error: 'Login failed', response: login.data });
    }

    // Step 2: Access share page and extract jsToken
    const sharePage = await client.get(url);
    const jsTokenMatch = sharePage.data.match(/window\.jsToken.*?%22(.*?)%22/);
    if (!jsTokenMatch) return res.status(500).json({ error: 'jsToken not found' });

    const jsToken = jsTokenMatch[1];
    const surlMatch = url.match(/s\/([a-zA-Z0-9]+)/);
    const shorturl = surlMatch ? surlMatch[1] : null;

    if (!shorturl) return res.status(500).json({ error: 'Invalid share URL' });

    // Step 3: Fetch list from shared folder
    const listResponse = await client.get('https://www.1024tera.com/share/list', {
      params: {
        app_id: '250528',
        jsToken,
        shorturl,
        root: 1
      }
    });

    const contents = listResponse.data?.list;
    if (!contents) return res.status(500).json({ error: 'No files found' });

    const files = contents.map(file => ({
      filename: file.server_filename,
      size: file.size,
      readable_size: formatSize(file.size),
      download_link: file.dlink
    }));

    return res.json({
      status: 'success',
      file_count: files.length,
      files
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function formatSize(size) {
  if (!size) return '0B';
  const i = Math.floor(Math.log(size) / Math.log(1024));
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  return `${(size / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}
