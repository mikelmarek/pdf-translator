import app from '../server/src/index';

export default function handler(req: any, res: any) {
	try {
		return (app as any)(req, res);
	} catch (err) {
		console.error('API handler crashed:', err);
		res.statusCode = 500;
		res.setHeader?.('Content-Type', 'application/json');
		res.end?.(JSON.stringify({ error: 'Internal Server Error' }));
	}
}
