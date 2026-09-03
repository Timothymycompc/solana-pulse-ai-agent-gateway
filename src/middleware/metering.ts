import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';

export function createMeteringMiddleware(dbPool: Pool) {
  return function chargeCredits(costInLamports: number) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

        if (!apiKey || typeof apiKey !== 'string') {
          return res.status(401).json({
            error: 'Missing API Key',
            message: 'Pass your key in the x-api-key header or Authorization: Bearer <key>',
          });
        }

        // Atomically check and deduct credits
        const query = `
          UPDATE api_keys
          SET credit_balance_lamports = credit_balance_lamports - $1,
              updated_at = NOW()
          WHERE key_hash = $2 AND is_active = TRUE AND credit_balance_lamports >= $1
          RETURNING wallet_address, credit_balance_lamports;
        `;

        const result = await dbPool.query(query, [costInLamports, apiKey]);

        if (result.rowCount === 0) {
          return res.status(402).json({
            error: 'Payment Required',
            message: `Insufficient balance. This endpoint requires ${costInLamports} lamports.`,
            requiredLamports: costInLamports,
          });
        }

        // Attach wallet and remaining balance to request
        (req as any).user = {
          wallet: result.rows[0].wallet_address,
          remainingBalance: result.rows[0].credit_balance_lamports,
        };

        next();
      } catch (error: any) {
        console.error('Billing error:', error);
        res.status(500).json({ error: 'Internal billing verification error' });
      }
    };
  };
}
