import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../server/src/index';

export default function handler(req: VercelRequest, res: VercelResponse) {
	try {
		return (app as any)(req, res);
	} catch (err) {
		console.error('API handler crashed:', err);
		res.status(500).json({ error: 'Internal Server Error' });
	}
}
