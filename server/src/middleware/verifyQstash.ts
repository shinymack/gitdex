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

    const isValid = await qstashReceiver.verify({
      signature: headerSig,
      body,
    });

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid QStash signature' });
    }

    next();
  } catch (error) {
    console.error('QStash verification failed:', error);
    return res.status(401).json({ error: 'Signature verification failed' });
  }
};
