import { Router, Response } from 'express';
import { prisma } from '../config/database';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { logger } from '../config/logger';

export const analyticsRouter = Router();

// GET /api/analytics/:urlId — analytics for a single URL
analyticsRouter.get(
  '/:urlId',
  authMiddleware,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      // Verify ownership (or admin)
      const url = await prisma.url.findFirst({
        where: {
          id: req.params.urlId,
          ...(req.user!.role !== 'admin' ? { userId: req.user!.id } : {}),
        },
        select: {
          id: true,
          shortCode: true,
          originalUrl: true,
          title: true,
          clickCount: true,
          createdAt: true,
        },
      });

      if (!url) {
        res.status(404).json({ success: false, message: 'URL not found' });
        return;
      }

      const { from, to } = req.query as { from?: string; to?: string };
      const dateFilter: Record<string, unknown> = {};
      if (from) dateFilter.gte = new Date(from);
      if (to) dateFilter.lte = new Date(to);

      const whereAnalytics: Record<string, unknown> = { urlId: url.id };
      if (from || to) whereAnalytics.timestamp = dateFilter;

      // Aggregate data
      const [
        totalClicks,
        clicksByDay,
        browserStats,
        osStats,
        deviceStats,
        referrerStats,
        recentClicks,
      ] = await Promise.all([
        prisma.analytics.count({ where: whereAnalytics }),

        // Clicks grouped by date
        prisma.$queryRaw<{ date: string; count: bigint }[]>`
          SELECT DATE(timestamp)::text as date, COUNT(*)::bigint as count
          FROM analytics
          WHERE "urlId" = ${url.id}
          ${from ? prisma.$queryRaw`AND timestamp >= ${new Date(from)}` : prisma.$queryRaw``}
          ${to ? prisma.$queryRaw`AND timestamp <= ${new Date(to)}` : prisma.$queryRaw``}
          GROUP BY DATE(timestamp)
          ORDER BY date ASC
          LIMIT 90
        `,

        // Browser breakdown
        prisma.analytics.groupBy({
          by: ['browser'],
          where: whereAnalytics,
          _count: { browser: true },
          orderBy: { _count: { browser: 'desc' } },
          take: 10,
        }),

        // OS breakdown
        prisma.analytics.groupBy({
          by: ['os'],
          where: whereAnalytics,
          _count: { os: true },
          orderBy: { _count: { os: 'desc' } },
          take: 10,
        }),

        // Device breakdown
        prisma.analytics.groupBy({
          by: ['device'],
          where: whereAnalytics,
          _count: { device: true },
          orderBy: { _count: { device: 'desc' } },
        }),

        // Referrer breakdown
        prisma.analytics.groupBy({
          by: ['referrer'],
          where: whereAnalytics,
          _count: { referrer: true },
          orderBy: { _count: { referrer: 'desc' } },
          take: 10,
        }),

        // Recent clicks
        prisma.analytics.findMany({
          where: whereAnalytics,
          orderBy: { timestamp: 'desc' },
          take: 10,
          select: {
            id: true,
            browser: true,
            os: true,
            device: true,
            country: true,
            referrer: true,
            timestamp: true,
          },
        }),
      ]);

      res.json({
        success: true,
        data: {
          url,
          totalClicks,
          clicksByDay: clicksByDay.map((r) => ({
            date: r.date,
            count: Number(r.count),
          })),
          browsers: browserStats.map((b) => ({
            name: b.browser || 'Unknown',
            count: b._count.browser,
          })),
          operatingSystems: osStats.map((o) => ({
            name: o.os || 'Unknown',
            count: o._count.os,
          })),
          devices: deviceStats.map((d) => ({
            name: d.device || 'desktop',
            count: d._count.device,
          })),
          referrers: referrerStats.map((r) => ({
            name: r.referrer || 'Direct',
            count: r._count.referrer,
          })),
          recentClicks,
        },
      });
    } catch (err) {
      logger.error({ err }, 'Analytics error');
      res
        .status(500)
        .json({ success: false, message: 'Failed to fetch analytics' });
    }
  }
);

// GET /api/analytics/dashboard — admin aggregate dashboard
analyticsRouter.get(
  '/dashboard/overview',
  authMiddleware,
  adminMiddleware,
  async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
      const [
        totalUsers,
        totalUrls,
        totalClicks,
        activeUrls,
        expiredUrls,
        recentUrls,
        clicksLast30Days,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.url.count(),
        prisma.analytics.count(),
        prisma.url.count({
          where: {
            isActive: true,
            OR: [
              { expirationDate: null },
              { expirationDate: { gt: new Date() } },
            ],
          },
        }),
        prisma.url.count({
          where: {
            OR: [
              { isActive: false },
              { expirationDate: { lte: new Date() } },
            ],
          },
        }),
        prisma.url.findMany({
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            user: { select: { name: true, email: true } },
            _count: { select: { analytics: true } },
          },
        }),
        prisma.$queryRaw<{ date: string; count: bigint }[]>`
          SELECT DATE(timestamp)::text as date, COUNT(*)::bigint as count
          FROM analytics
          WHERE timestamp >= NOW() - INTERVAL '30 days'
          GROUP BY DATE(timestamp)
          ORDER BY date ASC
        `,
      ]);

      res.json({
        success: true,
        data: {
          stats: {
            totalUsers,
            totalUrls,
            totalClicks,
            activeUrls,
            expiredUrls,
          },
          recentUrls,
          clicksLast30Days: clicksLast30Days.map((r) => ({
            date: r.date,
            count: Number(r.count),
          })),
        },
      });
    } catch (err) {
      logger.error({ err }, 'Dashboard overview error');
      res
        .status(500)
        .json({ success: false, message: 'Failed to fetch dashboard data' });
    }
  }
);
