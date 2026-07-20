import { Router, Request, Response } from 'express';
import QRCode from 'qrcode';
import { prisma } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { config } from '../config';
import { logger } from '../config/logger';

export const qrRouter = Router();

// GET /api/urls/:id/qr?format=png|svg|base64
qrRouter.get(
  '/:id/qr',
  authMiddleware,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const url = await prisma.url.findFirst({
        where: {
          id: req.params.id,
          ...(req.user!.role !== 'admin' ? { userId: req.user!.id } : {}),
        },
        select: { id: true, shortCode: true },
      });

      if (!url) {
        res.status(404).json({ success: false, message: 'URL not found' });
        return;
      }

      const shortUrl = `${config.baseUrl}/${url.shortCode}`;
      const format = (req.query.format as string) || 'base64';

      const qrOptions: QRCode.QRCodeToBufferOptions = {
        errorCorrectionLevel: 'M',
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
        width: 300,
      };

      if (format === 'svg') {
        const svg = await QRCode.toString(shortUrl, {
          type: 'svg',
          errorCorrectionLevel: 'M',
          margin: 2,
          color: { dark: '#6366f1', light: '#ffffff' },
          width: 300,
        });
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="qr-${url.shortCode}.svg"`
        );
        res.send(svg);
      } else if (format === 'png') {
        const buffer = await QRCode.toBuffer(shortUrl, qrOptions);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="qr-${url.shortCode}.png"`
        );
        res.send(buffer);
      } else {
        // base64 — return as JSON
        const dataUrl = await QRCode.toDataURL(shortUrl, {
          errorCorrectionLevel: 'M',
          margin: 2,
          color: { dark: '#6366f1', light: '#ffffff' },
          width: 300,
        });
        res.json({
          success: true,
          data: {
            qrCode: dataUrl,
            shortUrl,
            shortCode: url.shortCode,
          },
        });
      }
    } catch (err) {
      logger.error({ err }, 'QR code error');
      res
        .status(500)
        .json({ success: false, message: 'Failed to generate QR code' });
    }
  }
);
