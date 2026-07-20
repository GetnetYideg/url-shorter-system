import { Router, Request, Response } from 'express';
import UAParser from 'ua-parser-js';
import { prisma } from '../config/database';
import { getCachedUrl, cacheUrl } from '../config/redis';
import { logger } from '../config/logger';

export const redirectRouter = Router();

interface CachedUrlData {
  id: string;
  originalUrl: string;
  expirationDate: string | null;
  isActive: boolean;
}

// GET /:shortCode — redirect to original URL
redirectRouter.get('/:shortCode', async (req: Request, res: Response): Promise<void> => {
  const { shortCode } = req.params;

  try {
    // 1. Try cache first
    let urlData = await getCachedUrl(shortCode) as CachedUrlData | null;

    // 2. Fallback to DB
    if (!urlData) {
      const url = await prisma.url.findFirst({
        where: {
          OR: [{ shortCode }, { customAlias: shortCode }],
        },
        select: {
          id: true,
          originalUrl: true,
          expirationDate: true,
          isActive: true,
        },
      });

      if (!url) {
        res.status(404).send(notFoundPage());
        return;
      }

      urlData = {
        id: url.id,
        originalUrl: url.originalUrl,
        expirationDate: url.expirationDate?.toISOString() || null,
        isActive: url.isActive,
      };

      // Cache it
      await cacheUrl(shortCode, urlData);
    }

    // 3. Check active
    if (!urlData.isActive) {
      res.status(410).send(expiredPage('This link has been disabled.'));
      return;
    }

    // 4. Check expiration
    if (urlData.expirationDate) {
      const expiry = new Date(urlData.expirationDate);
      if (expiry < new Date()) {
        res.status(410).send(expiredPage('This link has expired.'));
        return;
      }
    }

    // 5. Record analytics asynchronously (fire-and-forget)
    recordAnalytics(urlData.id, req).catch((err) =>
      logger.error({ err }, 'Analytics recording failed')
    );

    // 6. Redirect
    res.redirect(302, urlData.originalUrl);
  } catch (err) {
    logger.error({ err, shortCode }, 'Redirect error');
    res.status(500).send('<h1>Server error</h1>');
  }
});

async function recordAnalytics(urlId: string, req: Request): Promise<void> {
  const ua = new UAParser(req.headers['user-agent']);
  const browser = ua.getBrowser().name || 'Unknown';
  const os = ua.getOS().name || 'Unknown';
  const deviceType = ua.getDevice().type || 'desktop';
  const referrer = req.headers.referer || req.headers.referrer || null;

  // Get IP (handle proxies)
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    null;

  await Promise.all([
    prisma.analytics.create({
      data: {
        urlId,
        ipAddress: ip,
        browser,
        os,
        device: deviceType,
        referrer: referrer as string | null,
        country: null, // Would use IP geolocation service in production
      },
    }),
    prisma.url.update({
      where: { id: urlId },
      data: { clickCount: { increment: 1 } },
    }),
  ]);
}

function notFoundPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Link Not Found — URLify</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #0f0f1a; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; gap: 16px; }
    h1 { font-size: 3rem; color: #6366f1; }
    p { color: #9ca3af; font-size: 1.1rem; }
    a { color: #6366f1; text-decoration: none; border: 1px solid #6366f1; padding: 10px 24px; border-radius: 8px; margin-top: 8px; }
    a:hover { background: #6366f1; color: #fff; }
  </style>
</head>
<body>
  <h1>404</h1>
  <p>This short link doesn't exist or has been removed.</p>
  <a href="/">← Back to Home</a>
</body>
</html>`;
}

function expiredPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Link Expired — URLify</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #0f0f1a; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; gap: 16px; }
    h1 { font-size: 3rem; color: #f59e0b; }
    p { color: #9ca3af; font-size: 1.1rem; }
    a { color: #6366f1; text-decoration: none; border: 1px solid #6366f1; padding: 10px 24px; border-radius: 8px; margin-top: 8px; }
    a:hover { background: #6366f1; color: #fff; }
  </style>
</head>
<body>
  <h1>410</h1>
  <p>${message}</p>
  <a href="/">← Back to Home</a>
</body>
</html>`;
}
