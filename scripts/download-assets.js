const fs = require('fs');
const path = require('path');
const https = require('https');

const assetsDir = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

const images = [
  {
    name: 'workspace-preview.jpg',
    url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAAcGunCKp2B7xN9_pgPUl_3exEmaInGuuchY-P7UtMOXR69oq1okje44B40wXMf5X4zd5pfjUKdemD-cVR-b7pJTfSgc5sE8yRPec3AaSjD_oI3gOtwZhsPus9eAq9fb2bXdk07azPffa5pXEFI4tT7n-aBDHhrblxNsJVjVLniATwXmMr1Fj7p8usXt86H3e4gz_CD3Xem936QUfgBLwU7-qO6rEyggKkbjAEZJtfz6RSrQCoZJU'
  },
  {
    name: 'demo-walkthrough.jpg',
    url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA4FoB_BahYEsQaVCMER8dzEzK-Zyg4EMSxShyG0TxvQm1Vb2DKm0AMClBJSvzk_Jr1gJPUEFT-R38OafWFjVRWZtmZk3nTGLMsJKpcKX7SSEulMxzlg-rpUPQEeCVZbjk2eZRV7lFsaIWCAxffCrqlq7D6lX9LmRD1JpW6T30s4nY9jjAFRvXxcOy_JhQKHxWUYF8L8o643imKuw8sfuiTl4s-NYpmoLcx4sozWsOEo9NCd0eqLEY'
  },
  {
    name: 'mit-1806-thumb.jpg',
    url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDwX7_1-YdZiuHZ8Lt6UJZPmqMOSQxI106XfrAFL0kKgfoW2BfdWktvnsTPR__gYvk18NAWHVAk2uX7gWIeUI1M2Yu9Jfdo2vo2PRRznMZu7qlUZlbnfa463pcl2WJlGcCaJiQ3KKoQqDV5JoI7M8wuIBSVR8MNbuX7RoDbtFnu-Rcjga7dZumZQiPMpmFzGywRYx3pTQtEd5_-OlhVpkoSxHHgYUESyaEBClbDgrL0jdAEDMbOHcY'
  },
  {
    name: '3b1b-vectors-thumb.jpg',
    url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBCB8VavIACMiTX49TsvEVAgwe7Ic0ZpFbknfFqwbntMOlBTVkjIgcN_YHdb25F8u9EuS_vFrruj2bP3Xgya1ILPo_lvadxX74PuRF5opySbcIkPnbzLyXww110-xm2s_KXzu69L256d3KtY0xvuYB0xzeMXo7Zz24epo_sFc7bhcO_BBGi1MI5d6V5LuhMgl36vKwrCKf2lfwCCFZ_91GqJBll6dyk_U7dAOrxbNCT8Y6kUx9brfo'
  }
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url}: status ${res.statusCode}`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          const stats = fs.statSync(dest);
          console.log(`✓ Downloaded ${path.basename(dest)} (${stats.size} bytes)`);
          resolve(stats.size);
        });
      });
      file.on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('Downloading Stitch images to /assets...');
  for (const img of images) {
    const dest = path.join(assetsDir, img.name);
    try {
      await download(img.url, dest);
    } catch (e) {
      console.error(`Error downloading ${img.name}:`, e.message);
    }
  }
  console.log('All asset downloads completed.');
}

run();
