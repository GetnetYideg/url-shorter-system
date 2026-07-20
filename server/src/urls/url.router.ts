import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import {
  cacheUrl,
  getCachedUrl,
  invalidateCachedUrl,
} from '../config/redis';
import {
  authMiddleware,
  optionalAuth,
  AuthRequest,
} from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { createUrlSchema, updateUrlSchema } from '../utils/schemas';
import { generateShortCode } from '../utils/helpers';
import { config } from '../config';
import { logger } from '../config/logger';

export const urlRouter = Router();

// POST /api/urls — create short URL
urlRouter.post(
  '/',
  optionalAuth,
  validate(createUrlSchema),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const {
        originalUrl,
        customAlias,
        title,
        tags,
        expirationDate,
        expiresInDays,
      } = req.body;

      // Determine short code
      let shortCode: string;
      if (customAlias) {
        const existing = await prisma.url.findFirst({
          where: {
            OR: [{ shortCode: customAlias }, { customAlias }],
          },
        });
        if (existing) {
          res
            .status(409)
            .json({ success: false, message: 'Alias already taken' });
          return;
        }
        shortCode = customAlias;
      } else {
        // Generate unique short code
        let attempts = 0;
        do {
          shortCode = generateShortCode();
          attempts++;
          if (attempts > 10)
            throw new Error('Could not generate unique short code');
        } while (
          await prisma.url.findUnique({ where: { shortCode } })
        );
      }

      // Calculate expiration
      let expDate: Date | undefined;
      if (expirationDate) {
        expDate = new Date(expirationDate);
      } else if (expiresInDays) {
        expDate = new Date();
        expDate.setDate(expDate.getDate() + expiresInDays);
      }

      const url = await prisma.url.create({
        data: {
          originalUrl,
          shortCode,
          customAlias: customAlias || null,
          title: title || null,
          tags: tags || [],
          expirationDate: expDate || null,
          userId: req.user?.id || null,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });

      // Cache the URL
      await cacheUrl(shortCode, {
        id: url.id,
        originalUrl: url.originalUrl,
        expirationDate: url.expirationDate,
        isActive: url.isActive,
      });

      res.status(201).json({
        success: true,
        data: {
          ...url,
          shortUrl: `${config.baseUrl}/${shortCode}`,
        },
      });
    } catch (err) {
      logger.error({ err }, 'Create URL error');
      res.status(500).json({ success: false, message: 'Failed to create URL' });
    }
  }
);

// GET /api/urls — list user's URLs
urlRouter.get(
  '/',
  authMiddleware,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const {
        page = '1',
        limit = '20',
        search = '',
        tag = '',
      } = req.query as Record<string, string>;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      const where: Record<string, unknown> = { userId: req.user!.id };
      if (search) {
        where.OR = [
          { originalUrl: { contains: search, mode: 'insensitive' } },
          { shortCode: { contains: search, mode: 'insensitive' } },
          { title: { contains: search, mode: 'insensitive' } },
        ];
      }
      if (tag) {
        where.tags = { has: tag };
      }

      const [urls, total] = await Promise.all([
        prisma.url.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: 'desc' },
          include: { _count: { select: { analytics: true } } },
        }),
        prisma.url.count({ where }),
      ]);

      res.json({
        success: true,
        data: {
          urls: urls.map((u) => ({
            ...u,
            shortUrl: `${config.baseUrl}/${u.shortCode}`,
          })),
          pagination: {
            total,
            page: parseInt(page),
            limit: take,
            pages: Math.ceil(total / take),
          },
        },
      });
    } catch (err) {
      logger.error({ err }, 'List URLs error');
      res.status(500).json({ success: false, message: 'Failed to list URLs' });
    }
  }
);

// GET /api/urls/:id — get single URL
urlRouter.get(
  '/:id',
  authMiddleware,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const url = await prisma.url.findFirst({
        where: { id: req.params.id, userId: req.user!.id },
        include: { _count: { select: { analytics: true } } },
      });

      if (!url) {
        res.status(404).json({ success: false, message: 'URL not found' });
        return;
      }

      res.json({
        success: true,
        data: { ...url, shortUrl: `${config.baseUrl}/${url.shortCode}` },
      });
    } catch (err) {
      logger.error({ err }, 'Get URL error');
      res.status(500).json({ success: false, message: 'Failed to get URL' });
    }
  }
);

// PUT /api/urls/:id — update URL
urlRouter.put(
  '/:id',
  authMiddleware,
  validate(updateUrlSchema),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const existing = await prisma.url.findFirst({
        where: { id: req.params.id, userId: req.user!.id },
      });

      if (!existing) {
        res.status(404).json({ success: false, message: 'URL not found' });
        return;
      }

      // Check alias uniqueness if changing
      if (
        req.body.customAlias &&
        req.body.customAlias !== existing.customAlias
      ) {
        const aliasConflict = await prisma.url.findFirst({
          where: {
            OR: [
              { shortCode: req.body.customAlias },
              { customAlias: req.body.customAlias },
            ],
            NOT: { id: req.params.id },
          },
        });
        if (aliasConflict) {
          res
            .status(409)
            .json({ success: false, message: 'Alias already taken' });
          return;
        }
      }

      const url = await prisma.url.update({
        where: { id: req.params.id },
        data: {
          title: req.body.title,
          customAlias: req.body.customAlias,
          tags: req.body.tags,
          expirationDate: req.body.expirationDate
            ? new Date(req.body.expirationDate)
            : req.body.expirationDate === null
            ? null
            : undefined,
          isActive:
            req.body.isActive !== undefined ? req.body.isActive : undefined,
        },
      });

      // Invalidate cache
      await invalidateCachedUrl(existing.shortCode);

      res.json({
        success: true,
        data: { ...url, shortUrl: `${config.baseUrl}/${url.shortCode}` },
      });
    } catch (err) {
      logger.error({ err }, 'Update URL error');
      res.status(500).json({ success: false, message: 'Failed to update URL' });
    }
  }
);

// DELETE /api/urls/:id
urlRouter.delete(
  '/:id',
  authMiddleware,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const existing = await prisma.url.findFirst({
        where: {
          id: req.params.id,
          userId: req.user!.id,
        },
      });

      if (!existing) {
        res.status(404).json({ success: false, message: 'URL not found' });
        return;
      }

      await prisma.url.delete({ where: { id: req.params.id } });
      await invalidateCachedUrl(existing.shortCode);

      res.json({ success: true, message: 'URL deleted successfully' });
    } catch (err) {
      logger.error({ err }, 'Delete URL error');
      res.status(500).json({ success: false, message: 'Failed to delete URL' });
    }
  }
);
