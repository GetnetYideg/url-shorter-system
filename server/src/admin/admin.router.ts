import { Router, Response } from 'express';
import { prisma } from '../config/database';
import {
  authMiddleware,
  adminMiddleware,
  AuthRequest,
} from '../middleware/auth.middleware';
import { invalidateCachedUrl } from '../config/redis';
import { logger } from '../config/logger';

export const adminRouter = Router();

// All admin routes require auth + admin role
adminRouter.use(authMiddleware, adminMiddleware);

// GET /api/admin/stats
adminRouter.get(
  '/stats',
  async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
      const [
        totalUsers,
        totalUrls,
        totalClicks,
        activeUrls,
        expiredUrls,
        newUsersThisMonth,
        newUrlsThisMonth,
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
        prisma.user.count({
          where: {
            createdAt: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
        }),
        prisma.url.count({
          where: {
            createdAt: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
        }),
      ]);

      res.json({
        success: true,
        data: {
          totalUsers,
          totalUrls,
          totalClicks,
          activeUrls,
          expiredUrls,
          newUsersThisMonth,
          newUrlsThisMonth,
        },
      });
    } catch (err) {
      logger.error({ err }, 'Admin stats error');
      res
        .status(500)
        .json({ success: false, message: 'Failed to fetch stats' });
    }
  }
);

// GET /api/admin/urls
adminRouter.get(
  '/urls',
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const {
        page = '1',
        limit = '20',
        search = '',
        status = 'all',
      } = req.query as Record<string, string>;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      const where: Record<string, unknown> = {};
      if (search) {
        where.OR = [
          { originalUrl: { contains: search, mode: 'insensitive' } },
          { shortCode: { contains: search, mode: 'insensitive' } },
          { title: { contains: search, mode: 'insensitive' } },
        ];
      }
      if (status === 'active') {
        where.isActive = true;
        where.OR = [
          { expirationDate: null },
          { expirationDate: { gt: new Date() } },
        ];
      } else if (status === 'inactive') {
        where.isActive = false;
      } else if (status === 'expired') {
        where.expirationDate = { lte: new Date() };
      }

      const [urls, total] = await Promise.all([
        prisma.url.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { id: true, name: true, email: true } },
            _count: { select: { analytics: true } },
          },
        }),
        prisma.url.count({ where }),
      ]);

      res.json({
        success: true,
        data: {
          urls,
          pagination: {
            total,
            page: parseInt(page),
            limit: take,
            pages: Math.ceil(total / take),
          },
        },
      });
    } catch (err) {
      logger.error({ err }, 'Admin list URLs error');
      res.status(500).json({ success: false, message: 'Failed to list URLs' });
    }
  }
);

// DELETE /api/admin/urls/:id — force delete any URL
adminRouter.delete(
  '/urls/:id',
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const url = await prisma.url.findUnique({ where: { id: req.params.id } });
      if (!url) {
        res.status(404).json({ success: false, message: 'URL not found' });
        return;
      }

      await prisma.url.delete({ where: { id: req.params.id } });
      await invalidateCachedUrl(url.shortCode);

      res.json({ success: true, message: 'URL deleted by admin' });
    } catch (err) {
      logger.error({ err }, 'Admin delete URL error');
      res.status(500).json({ success: false, message: 'Failed to delete URL' });
    }
  }
);

// GET /api/admin/users
adminRouter.get(
  '/users',
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { page = '1', limit = '20', search = '' } = req.query as Record<string, string>;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      const where: Record<string, unknown> = {};
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            createdAt: true,
            _count: { select: { urls: true } },
          },
        }),
        prisma.user.count({ where }),
      ]);

      res.json({
        success: true,
        data: {
          users,
          pagination: {
            total,
            page: parseInt(page),
            limit: take,
            pages: Math.ceil(total / take),
          },
        },
      });
    } catch (err) {
      logger.error({ err }, 'Admin list users error');
      res
        .status(500)
        .json({ success: false, message: 'Failed to list users' });
    }
  }
);

// PATCH /api/admin/users/:id/toggle — toggle user active status
adminRouter.patch(
  '/users/:id/toggle',
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
      });
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      const updated = await prisma.user.update({
        where: { id: req.params.id },
        data: { isActive: !user.isActive },
        select: { id: true, name: true, email: true, role: true, isActive: true },
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      logger.error({ err }, 'Admin toggle user error');
      res
        .status(500)
        .json({ success: false, message: 'Failed to toggle user status' });
    }
  }
);
