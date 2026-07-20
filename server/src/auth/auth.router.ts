import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getRefreshTokenExpirySeconds,
} from '../utils/jwt';
import {
  blacklistToken,
  isTokenBlacklisted,
} from '../config/redis';
import { validate } from '../middleware/validate.middleware';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { registerSchema, loginSchema } from '../utils/schemas';
import { logger } from '../config/logger';

export const authRouter = Router();

// POST /api/auth/register
authRouter.post(
  '/register',
  validate(registerSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, email, password } = req.body;

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        res
          .status(409)
          .json({ success: false, message: 'Email already registered' });
        return;
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      const user = await prisma.user.create({
        data: { name, email, password: hashedPassword },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      });

      const accessToken = signAccessToken({ userId: user.id });
      const refreshToken = signRefreshToken({ userId: user.id });

      logger.info({ userId: user.id }, 'User registered');
      res.status(201).json({
        success: true,
        message: 'Registration successful',
        data: { user, accessToken, refreshToken },
      });
    } catch (err) {
      logger.error({ err }, 'Register error');
      res.status(500).json({ success: false, message: 'Registration failed' });
    }
  }
);

// POST /api/auth/login
authRouter.post(
  '/login',
  validate(loginSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.isActive) {
        res
          .status(401)
          .json({ success: false, message: 'Invalid credentials' });
        return;
      }

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        res
          .status(401)
          .json({ success: false, message: 'Invalid credentials' });
        return;
      }

      const accessToken = signAccessToken({ userId: user.id });
      const refreshToken = signRefreshToken({ userId: user.id });

      logger.info({ userId: user.id }, 'User logged in');
      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            createdAt: user.createdAt,
          },
          accessToken,
          refreshToken,
        },
      });
    } catch (err) {
      logger.error({ err }, 'Login error');
      res.status(500).json({ success: false, message: 'Login failed' });
    }
  }
);

// POST /api/auth/logout
authRouter.post(
  '/logout',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      if (refreshToken) {
        const expirySeconds = getRefreshTokenExpirySeconds();
        await blacklistToken(refreshToken, expirySeconds);
      }
      res.json({ success: true, message: 'Logged out successfully' });
    } catch (err) {
      logger.error({ err }, 'Logout error');
      res.status(500).json({ success: false, message: 'Logout failed' });
    }
  }
);

// POST /api/auth/refresh
authRouter.post(
  '/refresh',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        res
          .status(401)
          .json({ success: false, message: 'Refresh token required' });
        return;
      }

      const blacklisted = await isTokenBlacklisted(refreshToken);
      if (blacklisted) {
        res
          .status(401)
          .json({ success: false, message: 'Token has been revoked' });
        return;
      }

      const payload = verifyRefreshToken(refreshToken);
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
      });
      if (!user || !user.isActive) {
        res.status(401).json({ success: false, message: 'User not found' });
        return;
      }

      const newAccessToken = signAccessToken({ userId: user.id });
      res.json({
        success: true,
        data: { accessToken: newAccessToken },
      });
    } catch {
      res
        .status(401)
        .json({ success: false, message: 'Invalid refresh token' });
    }
  }
);

// GET /api/auth/me
authRouter.get(
  '/me',
  authMiddleware,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          _count: { select: { urls: true } },
        },
      });
      res.json({ success: true, data: user });
    } catch (err) {
      logger.error({ err }, 'Get me error');
      res.status(500).json({ success: false, message: 'Failed to fetch user' });
    }
  }
);
