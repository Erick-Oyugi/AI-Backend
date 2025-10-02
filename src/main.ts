// src/index.ts

import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import cors from 'cors'
import moment from 'moment'
import admin from 'firebase-admin'; // Use the Firebase Admin SDK

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Initialize Firebase Admin SDK
try {
  // Use the service account key for authentication
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '' as string);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL // Use Realtime Database URL
  });
  console.log('Firebase Realtime Database initialized successfully.');
} catch (error) {
  console.error('Failed to initialize Firebase:', error);
  process.exit(1); 
}

// Get a reference to the Realtime Database service
const db = admin.database();

app.use(cors())
app.use(express.json()); // Middleware to parse JSON bodies


let accountBalance: number = 100000.00;

const generateTransactionId = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 10; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return 'TIG' + result;
};

    const stkPushUrl = 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';
    const consumerKey = process.env.SAFARICOM_CONSUMER_KEY;
    const consumerSecret = process.env.SAFARICOM_CONSUMER_SECRET;
    const shortCode = process.env.SAFARICOM_SHORTCODE;
    const passkey = process.env.SAFARICOM_PASSKEY;



const initiateStkPush = async (phoneNumber: any, amount :any ) => {

      if (!consumerKey || !consumerSecret || !shortCode || !passkey) {
   return {
            status: 'ERROR',
            message: 'STK Push failed: Server configuration error (Missing API keys/shortcode).',
            details: 'Configuration missing'
        };    }

    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
    const password = Buffer.from(shortCode + passkey + timestamp).toString('base64');

    try {
      const tokenResponse = await axios.get(
        'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
        {
          headers: {
            Authorization: `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')}`,
          },
        }
      );
      const accessToken = tokenResponse.data.access_token;

      console.log(accessToken);

      const response = await axios.post(stkPushUrl, {
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

            return {
                status: 'SUCCESS',
                apiResponse: response
            };
    } catch (error: any) {
      console.error('STK Push Error:', error.response ? error.response.data : error.message);
     return {
                status: 'FAILURE',
                error: error.message
       
            };
    }





}


app.post('/api/stk-push', async (req, res) => {
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
      const tokenResponse = await axios.get(
        'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
        {
          headers: {
            Authorization: `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')}`,
          },
        }
      );
      const accessToken = tokenResponse.data.access_token;

      console.log(accessToken);

      const response = await axios.post(stkPushUrl, {
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
    } catch (error: any) {
      console.error('STK Push Error:', error.response ? error.response.data : error.message);
      return res.status(500).json({
        error: 'Failed to initiate STK Push.',
        details: error.response ? error.response.data : error.message,
      });
    }
});

app.get('/api/account/balance', async (req, res) => {
    const date = new Date();
    return res.status(200).json({
        message : "wallet balance",
        balance : accountBalance,
        date : date
    })
});
  
// --- ENDPOINT 2: POST Transaction Send ---
app.post('/api/transaction/send', async (req, res) => {
    // NOTE: The frontend will send recipientName, recipientPhone, and amount (as a number)
    const { recipientName, recipientPhone, amount: rawAmount } = req.body;
    
    // Ensure amount is parsed as a number from the frontend payload
    const amount = Number(rawAmount);

    if (!recipientName || typeof recipientName !== 'string' || !recipientPhone || !amount || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ message: "Invalid transaction details provided. Ensure recipient name, phone, and a valid amount are sent." });
    }
    
    if (accountBalance < amount) {
        return res.status(400).json({ message: "Insufficient funds to complete the transaction." });
    }

    try {
        // 1. Update Balance (In memory for this demo)
        accountBalance -= amount;

        // 2. Generate transaction data
        const now = moment();
        const transactionId = generateTransactionId();

        const isTillPayment = /^\d{5,}$/.test(recipientName.trim());

        if(isTillPayment){

           const stkResult = await initiateStkPush(recipientPhone, amount);

               if (stkResult.status === '200') {
                // Since this is just the initiation, we debit the account now in this mock.
                accountBalance -= amount;

                const message = `${transactionId} Confirmed. Ksh${amount.toFixed(2)} STK Push initiated for Till ${recipientName} on ${now.format('DD/MM/YY')} at ${now.format('h.mm A')}. New DEOPAY balance is Ksh${accountBalance.toFixed(2)}. ${stkResult.message}`;

                const transactionData = {
                    type: 'stk_push_initiated',
                    recipient: recipientName,
                    recipientPhone: recipientPhone,
                    amount: amount,
                    message: message,
                    newBalance: accountBalance,
                    timestamp: now.valueOf(),
                };

                
                await db.ref('transactions').push(transactionData);
                console.log(`STK Push successful initiation: Ksh ${amount} to Till ${recipientName}. New balance: Ksh ${accountBalance}`);

                return res.status(200).json({
                    message: message,
                    newBalance: accountBalance,
                });

        }

        else {
                 // STK Push API call failed (simulated network error, invalid credentials, etc.)
                 const message = `Transaction aborted. ${stkResult.message}`;
                 console.error(`STK Push failed to initiate: ${stkResult.message}`);
                 return res.status(500).json({
                    message: message,
                    // Do not debit the account on initiation failure
                 });
            }
          }
        const message = `${transactionId} Confirmed. Ksh${amount.toFixed(2)} sent to ${recipientName} on ${now.format('DD/MM/YY')} at ${now.format('h.mm A')}. New DEOPAY balance is Ksh${accountBalance.toFixed(2)}. Transaction cost, Ksh0.00`;

        const transactionData = {
            type: 'sent',
            recipient: recipientName,
            recipientPhone: recipientPhone,
            amount: amount,
            message: message,
            newBalance: accountBalance,
            timestamp: now.valueOf(),
        };

        // 3. Save transaction to Mock DB
        // The original code was set up for Firebase Realtime Database
        await db.ref('transactions').push(transactionData);
        console.log(`Transaction successful: Ksh ${amount} sent to ${recipientName}. New balance: Ksh ${accountBalance}`);

        // 4. Send successful response
        return res.status(200).json({
            message: message,
            newBalance: accountBalance,
        });
    } catch (error) {
        console.error("Transaction failed:", error);
        return res.status(500).json({ message: "Transaction failed due to a server error." });
    }
});


app.post('/api/transaction/receive', async (req, res) => {
    const { sender, amount, senderName, senderPhone } = req.body;

    if (!senderName || typeof senderName !== 'string' || !senderPhone || !amount || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ message: "Invalid transaction details provided." });
    }

    try {
        accountBalance += amount;
        const now = moment();
        
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

        await db.ref('transactions').push(transactionData);
        console.log(`Funds received: Ksh ${amount} from ${sender}. New balance: Ksh ${accountBalance}`);

        return res.status(200).json({
            message: message,
            newBalance: accountBalance,
        });

    } catch (error) {
        console.error("Receiving funds failed:", error);
        return res.status(500).json({ message: "Receiving funds failed due to a server error." });
    }
});


app.get('/api/transactions', async (req, res) => {
    try {
        const snapshot = await db.ref('transactions').orderByChild('timestamp').once('value');
        
        let transactions: any[] = [];
        snapshot.forEach(childSnapshot => {
            const transaction = childSnapshot.val();
            transactions.push({ id: childSnapshot.key, ...transaction });
        });

        transactions = transactions.reverse();

        return res.status(200).json(transactions);
    } catch (error) {
        console.error("Failed to fetch transactions:", error);
        return res.status(500).json({ message: "Failed to fetch transactions." });
    }
});


app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

