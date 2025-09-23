"use strict";
// src/index.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const moment_1 = __importDefault(require("moment"));
const firebase_admin_1 = __importDefault(require("firebase-admin")); // Use the Firebase Admin SDK
// Load environment variables from .env file
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3001;
// Initialize Firebase Admin SDK
try {
    // Use the service account key for authentication
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '');
    firebase_admin_1.default.initializeApp({
        credential: firebase_admin_1.default.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL // Use Realtime Database URL
    });
    console.log('Firebase Realtime Database initialized successfully.');
}
catch (error) {
    console.error('Failed to initialize Firebase:', error);
    process.exit(1);
}
// Get a reference to the Realtime Database service
const db = firebase_admin_1.default.database();
app.use((0, cors_1.default)());
app.use(express_1.default.json()); // Middleware to parse JSON bodies
let accountBalance = 100000.00;
const generateTransactionId = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 10; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return 'TIG' + result;
};
app.post('/api/stk-push', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { phoneNumber, amount } = req.body;
    if (!phoneNumber || !amount) {
        return res.status(400).json({ error: 'Phone number and amount are required.' });
    }
    const stkPushUrl = 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';
    const consumerKey = process.env.SAFARICOM_CONSUMER_KEY;
    const consumerSecret = process.env.SAFARICOM_CONSUMER_SECRET;
    const shortCode = process.env.SAFARICOM_SHORTCODE;
    const passkey = process.env.SAFARICOM_PASSKEY;
    if (!consumerKey || !consumerSecret || !shortCode || !passkey) {
        return res.status(500).json({ error: 'Server configuration error.' });
    }
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
    const password = Buffer.from(shortCode + passkey + timestamp).toString('base64');
    try {
        const tokenResponse = yield axios_1.default.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
            headers: {
                Authorization: `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')}`,
            },
        });
        const accessToken = tokenResponse.data.access_token;
        console.log(accessToken);
        const response = yield axios_1.default.post(stkPushUrl, {
            BusinessShortCode: shortCode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: 'CustomerPayBillOnline',
            Amount: amount,
            PartyA: phoneNumber,
            PartyB: shortCode,
            PhoneNumber: phoneNumber,
            CallBackURL: 'https://webhook.site/8482d8c4-fcb9-4b3c-b97b-dd9166abef3b',
            AccountReference: 'MyAppPayment',
            TransactionDesc: 'Payment from MyApp',
        }, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        return res.status(200).json(response.data);
    }
    catch (error) {
        console.error('STK Push Error:', error.response ? error.response.data : error.message);
        return res.status(500).json({
            error: 'Failed to initiate STK Push.',
            details: error.response ? error.response.data : error.message,
        });
    }
}));
app.get('/api/account/balance', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const date = new Date();
    return res.status(200).json({
        message: "wallet balance",
        balance: accountBalance,
        date: date
    });
}));
app.post('/api/transaction/send', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { recipient, amount, recipientName, recipientPhone } = req.body;
    if (!recipientName || typeof recipientName !== 'string' || !recipientPhone || !amount || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ message: "Invalid transaction details provided." });
    }
    if (accountBalance < amount) {
        return res.status(400).json({ message: "Insufficient funds to complete the transaction." });
    }
    try {
        accountBalance -= amount;
        const now = (0, moment_1.default)();
        const transactionId = generateTransactionId();
        const message = `${transactionId} Confirmed. Ksh${amount.toFixed(2)} sent to ${recipientName} on ${now.format('DD/MM/YY')} at ${now.format('h.mm A')}. New M-PESA balance is Ksh${accountBalance.toFixed(2)}. Transaction cost, Ksh0.00`;
        const transactionData = {
            type: 'sent',
            recipient: recipientName,
            recipientPhone: recipientPhone,
            amount: amount,
            message: message,
            newBalance: accountBalance,
            timestamp: now.valueOf(),
        };
        // Save transaction to Firebase Realtime Database
        yield db.ref('transactions').push(transactionData);
        console.log(`Transaction successful: Ksh ${amount} sent to ${recipient}. New balance: Ksh ${accountBalance}`);
        return res.status(200).json({
            message: message,
            newBalance: accountBalance,
        });
    }
    catch (error) {
        console.error("Transaction failed:", error);
        return res.status(500).json({ message: "Transaction failed due to a server error." });
    }
}));
app.post('/api/transaction/receive', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { sender, amount, senderName, senderPhone } = req.body;
    if (!senderName || typeof senderName !== 'string' || !senderPhone || !amount || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ message: "Invalid transaction details provided." });
    }
    try {
        accountBalance += amount;
        const now = (0, moment_1.default)();
        const message = `You have received Ksh${amount.toFixed(2)} from ${senderName} ${senderPhone} on ${now.format('DD/MM/YY')} at ${now.format('h.mm A')}. New M-PESA balance is Ksh${accountBalance.toFixed(2)}.`;
        const transactionData = {
            type: 'received',
            sender: senderName,
            senderPhone: senderPhone,
            amount: amount,
            message: message,
            newBalance: accountBalance,
            timestamp: now.valueOf(),
        };
        yield db.ref('transactions').push(transactionData);
        console.log(`Funds received: Ksh ${amount} from ${sender}. New balance: Ksh ${accountBalance}`);
        return res.status(200).json({
            message: message,
            newBalance: accountBalance,
        });
    }
    catch (error) {
        console.error("Receiving funds failed:", error);
        return res.status(500).json({ message: "Receiving funds failed due to a server error." });
    }
}));
app.get('/api/transactions', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const snapshot = yield db.ref('transactions').orderByChild('timestamp').once('value');
        let transactions = [];
        snapshot.forEach(childSnapshot => {
            const transaction = childSnapshot.val();
            transactions.push(Object.assign({ id: childSnapshot.key }, transaction));
        });
        transactions = transactions.reverse();
        return res.status(200).json(transactions);
    }
    catch (error) {
        console.error("Failed to fetch transactions:", error);
        return res.status(500).json({ message: "Failed to fetch transactions." });
    }
}));
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
