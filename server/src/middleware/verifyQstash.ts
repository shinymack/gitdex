import type { Request, Response, NextFunction } from 'express';
import { qstashReceiver } from '../config/qstash.js';

interface RequestWithRawBody extends Request {
  rawBody?: string;
}

export const verifyQstashSignature = async (
  req: RequestWithRawBody,
  res: Response,
  next: NextFunction
) => {
  try {
    const signature = req.headers['upstash-signature'];
    if (!signature) {
      return res.status(401).json({ error: 'Missing Upstash-Signature header' });
    }

    const body = req.rawBody || JSON.stringify(req.body);
    const headerSig = Array.isArray(signature) ? signature[0] : signature;

    if (!headerSig) {
      return res.status(401).json({ error: 'Invalid Upstash-Signature header' });
    }

    if (!process.env.BASE_URL) throw new Error('Callback base URL is not configured');
    const base = new URL(process.env.BASE_URL);
    if (base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('Invalid callback base URL');
    const expectedUrl = `${base.origin}${req.originalUrl}`;

    const isValid = await qstashReceiver.verify({
      signature: headerSig,
      body,
      url: expectedUrl,
    });

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid QStash signature' });
    }

    next();
  } catch (error) {
    console.warn('QStash signature verification failed.');
    return res.status(401).json({ error: 'Signature verification failed' });
  }
};
