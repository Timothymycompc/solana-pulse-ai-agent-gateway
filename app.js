const express = require('express');
const rateLimit = require('express-rate-limit');
const solanaRoutes = require('./routes/solana');

const app = express();
const PORT = process.env.PORT || 8080;

// FIX: Enable trust proxy to prevent rate-limiter ValidationErrors in proxy environments (Cloud Run)
app.set('trust proxy', 1);

// Parse JSON payload structures
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure Global Rate Limiter to handle client IPs safely over Cloud Run proxies
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each client IP to 100 requests per 15 mins
    standardHeaders: 'draft-7', // Sends standard RateLimit headers
    legacyHeaders: false, // Prevents sending non-standard X-RateLimit-* headers
    message: {
        success: false,
        error: "Too many requests from this IP, please try again in 15 minutes."
    }
});

// Apply rate limiter to all API endpoints
app.use('/api/', limiter);

// Mount your Solana routes
app.use('/api/solana', solanaRoutes);

// Base application health endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: "UP", timestamp: new Date() });
});

app.listen(PORT, () => {
    console.log(`Solana Pulse service running on port ${PORT}`);
});
